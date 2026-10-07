import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensure, hash, assertTransition, validateToolResult, toolNames } from '../contracts/index.ts';
import type {ToolExecutor,ModelAdapter,ToolCall,ToolContext} from '../contracts/index.ts';
import type { Store } from './store.ts';
import { sourceFingerprint } from './sources.ts';
const now=()=>new Date().toISOString();
export class Controller {
 store:Store;executor:ToolExecutor;model?:ModelAdapter;active=new Map<string,AbortController>();
 constructor(store:Store,executor:ToolExecutor,model?:ModelAdapter){this.store=store;this.executor=executor;this.model=model;}
 transition(job:any,status:any,reasonCode:string|null=null){assertTransition(job.status,status);job.status=status;job.reasonCode=reasonCode;job.updatedAt=now();this.store.put('job',job.jobId,job.businessId,job);}
 current(job:any){ensure(!job.sourceSnapshotHash||job.sourceSnapshotHash===sourceFingerprint(),'SOURCE_CHANGED','Pinned source versions changed',409);const c=this.store.get('case',job.businessId);ensure(c&&c.businessRevision===job.businessRevision&&c.factsHash===job.factsHash,'STALE_INPUT','Inputs changed during execution',409);ensure(this.store.get('job',job.jobId)?.status!=='superseded','STALE_JOB','Job superseded',409);return c;}
 async execute(jobId:string){let job=this.store.get('job',jobId);if(!job||job.status!=='queued')return;const abort=new AbortController();this.active.set(jobId,abort);const deadline=setTimeout(()=>abort.abort(),240000);try{
 this.transition(job,'running');const snapshot=this.current(job);const documents=job.documentVersionIds.map((id:string)=>this.store.get('document',id));ensure(documents.every(Boolean),'DOCUMENT_DELETED','Pinned document missing',409);const outputDir=resolve(this.store.root,'cases',job.businessId,'jobs',job.jobId);mkdirSync(outputDir,{recursive:true,mode:0o700});const results:Record<string,any>={};let stopped=false;
 for(let index=0;index<12;index++){
 this.current(job);ensure(!abort.signal.aborted,'CANCELLED','Execution cancelled',409);
 const selection=job.executionMode==='deterministic'?(index<toolNames.length?{tool:toolNames[index],arguments:{}}:{done:true}):await this.model!.next({job,tools:toolNames,results,signal:abort.signal});if('done'in selection){stopped=true;break;}
 ensure(toolNames.includes(selection.tool),'TOOL_DENIED','Tool not allowed',403);ensure(selection.arguments&&typeof selection.arguments==='object'&&!Array.isArray(selection.arguments),'INVALID_TOOL_ARGUMENTS','Tool arguments must be an object');
 if(selection.tool==='assemble_pack')ensure(results.retrieve_guidance&&results.inspect_documents,'PREREQUISITE','Guidance and document checks required before draft',409);
 if(selection.tool==='apply_preparation_patch')ensure(results.assemble_pack,'PREREQUISITE','Draft required before workspace proposal',409);
 const call:ToolCall={jobId,callId:randomUUID(),businessRevision:job.businessRevision,name:selection.tool,arguments:selection.arguments};
 const context:ToolContext={caseSnapshot:snapshot,job,documents,privateRoot:this.store.root,outputDir,previousResults:results,signal:abort.signal};
 const dedup=hash({jobId,name:call.name,version:1,inputHash:job.inputHash,args:call.arguments});let result=this.store.get('tool',dedup);let attempts=0;
 if(!result){while(attempts<3){ensure(job.toolCallCount<12,'TOOL_BUDGET','Twelve-call controller limit reached',422);attempts++;job.toolCallCount++;let timer:any;const attemptAbort=new AbortController();try{result=await Promise.race([this.executor(call,{...context,signal:AbortSignal.any([abort.signal,attemptAbort.signal])}),new Promise((_,reject)=>{timer=setTimeout(()=>{attemptAbort.abort();reject(Object.assign(new Error('Tool deadline exceeded'),{code:'TOOL_TIMEOUT'}));},30000);})]);validateToolResult(result);}catch(e:any){result={ok:false,error:{code:e.code||'TOOL_FAILURE',message:e.code==='TOOL_TIMEOUT'?'Tool deadline exceeded':'Local tool failed',retryable:e.code==='TOOL_TIMEOUT'||e.retryable===true},provenance:[]};}finally{clearTimeout(timer);}
 this.current(job);job.trace.push({callId:call.callId,name:call.name,attempt:attempts,ok:result.ok,error:result.error||null,at:now(),provenance:result.provenance});job.step=call.name;this.store.put('job',jobId,job.businessId,job);if(result.ok||!result.error?.retryable||attempts===3||job.toolCallCount>=12)break;this.transition(job,'retry_wait',result.error.code);this.transition(job,'running');}
 if(result.ok)this.store.put('tool',dedup,job.businessId,result);}
 ensure(result.ok,result.error?.code||'TOOL_FAILURE',result.error?.message||'Tool failed',502);results[call.name]=result.data;if(call.name==='inspect_documents'){for(const inspected of result.data.documents||[]){const doc=this.store.get('document',inspected.id);if(doc&&job.documentVersionIds.includes(doc.id)&&doc.contentHash===inspected.contentHash){doc.extractionStatus=inspected.extractionStatus;doc.candidateFields=inspected.fields||[];doc.extractedTextHash=inspected.textHash||null;this.store.put('document',doc.id,job.businessId,doc);}}}job.results=results;job.resultRefs[call.name]=dedup;this.store.put('job',jobId,job.businessId,job);
 if(call.name==='assemble_pack'){
 ensure(typeof result.data?.html==='string'&&result.data.html.length>50,'INVALID_PACK','Pack renderer must return usable HTML',502);
 const pack={schemaVersion:1,id:randomUUID(),version:1,jobId,businessId:job.businessId,businessRevision:job.businessRevision,inputHash:job.inputHash,factsHash:job.factsHash,documentVersionIds:job.documentVersionIds,createdAt:now(),downloadFilename:'dikan-incomplete-preparation.html',incomplete:true,label:'Incomplete preparation draft: applicability questions open',checks:result.data.checks||[],blockers:[...(result.data.blockers||[]),{code:'SOURCE_NOT_ACTIVATED',message:'No approved requirement route. Applicability questions remain open.'}],sources:result.data.sources||results.retrieve_guidance?.sources||[],html:result.data.html,markdown:result.data.markdown||null,sourceData:result.data,hash:''};pack.hash=hash(pack.html);results.assemble_pack={...result.data,bodyHash:result.data.hash,hash:pack.hash};this.store.put('pack',jobId,job.businessId,pack);job.packHash=pack.hash;
 }
 if(job.toolCallCount>=12)break;
 }
 ensure(stopped,'TOOL_BUDGET','Twelve-call controller limit reached',422);this.current(job);const questions=results.request_information?.questions||results.inspect_documents?.questions||[];job.questions=questions;const inspect=results.inspect_documents||{};const needsInput=(inspect.questions||[]).length>0||(inspect.checks||[]).some((c:any)=>['missing','unreadable','needs_review','mismatch'].includes(c.state||c.status));job.label=needsInput?'Supplied evidence needs founder confirmation':'Preparation draft: applicability questions open';this.transition(job,needsInput?'needs_input':'blocked',needsInput?(inspect.questions?.[0]?.reasonCode||'DOCUMENT_REVIEW_REQUIRED'):'SOURCE_NOT_ACTIVATED');
 }catch(e:any){const current=this.store.get('job',jobId);if(current&&current.status!=='superseded'&&current.status!=='cancelled'){current.modelTrace=job.modelTrace||current.modelTrace;job=current;job.error={code:e.code||'EXECUTION_FAILURE',message:e instanceof Error&&'code' in e?e.message:'Local execution failed'};this.transition(job,'failed',job.error.code);}}finally{clearTimeout(deadline);this.active.delete(jobId);}}
 cancelBusiness(id:string){for(const job of this.store.all('job',id)){this.active.get(job.jobId)?.abort();}}
}
