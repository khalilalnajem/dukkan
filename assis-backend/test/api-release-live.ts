// Opt-in real API acceptance. Uses a new fictional store; never opens user records.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {createApp} from '../src/server.ts';
import {openrouterConfig} from '../src/openrouter.ts';
import {blank} from '../../assis-workspace/src/lib/workspace.ts';
import {applyConversationProposal} from '../../assis-workspace/src/lib/conversation-flow.ts';
import {WorkspaceWriter} from '../../assis-workspace/src/lib/workspace-writer.ts';

const config=openrouterConfig();
// Acceptance adds a stricter request-count ceiling without increasing configured caps.
config.daily=Math.min(config.daily,24);
const root=mkdtempSync(join(tmpdir(),'dukkan-api-release-'));
const app=await createApp({privateRoot:root,openrouter:config});
let workspace=blank();
workspace.brief.idea='FICTIONAL QA: Sand API Studio offers monthly bilingual design services to small shops in Kuwait.';
workspace.brief.offer='monthly bilingual design services';
workspace.brief.customer='small shop owners in Kuwait';
const receipt:any={at:new Date().toISOString(),provider:'openrouter',model:config.model,root,limits:{daily:config.daily,maxInput:config.maxInput,maxOutput:config.maxOutput,maxIn:config.maxIn,maxOut:config.maxOut},steps:[],sent:false,submitted:false};
const out=join(root,'acceptance.json');
const record=()=>writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
const c=app.chat.create({title:'FICTIONAL API release acceptance',workspaceId:'api-release-fictional'}).conversation;
receipt.conversationId=c.id;
async function wait(id:string){const deadline=Date.now()+240000;while(Date.now()<deadline){const s=app.chat.turnSnapshot(id);if(!['queued','running'].includes(s.turn.status))return s;await new Promise(r=>setTimeout(r,300));}app.chat.stop(id,'api-release-fictional');throw Error('Acceptance deadline exceeded');}
async function step(label:string,content:string,requestedAction?:any){
 const started=Date.now();const before=JSON.stringify(workspace);
 const q=app.chat.enqueue(c.id,{content,workspaceContext:workspace,...(requestedAction?{requestedAction}:{})});
 const s=await wait(q.turn.id);
 receipt.steps.push({label,status:s.turn.status,error:s.turn.error,ms:Date.now()-started,model:s.turn.model,trace:s.turn.modelTrace,events:s.turn.events,artifacts:s.artifacts});record();
 console.log(JSON.stringify({label,status:s.turn.status,error:s.turn.error,ms:Date.now()-started,artifacts:s.artifacts.map((a:any)=>({kind:a.kind,citations:a.citations?.length,version:a.version})),receipt:out}));
 assert.equal(s.turn.status,'completed',JSON.stringify(s.turn.error));
 assert.equal(JSON.stringify(workspace),before,'Agent must not save the proposal automatically');
 assert.equal(s.turn.model.name,'openrouter');assert.equal(s.case.facts.length,0);
 return {...s,proposals:s.messages.filter((m:any)=>m.turnId===q.turn.id).flatMap((m:any)=>m.actions||[]).filter((a:any)=>a.type==='workspace_update').map((a:any)=>a.payload)};
}
try{
 const critique=await step('critique','Critique my fictional business. Retrieve Kuwait market evidence, save an idea-stage draft with evidence-readiness score, limitations and options. Do not invent demand.',{type:'stage_draft',stage:'idea'});
 assert.ok(critique.artifacts[0]?.citations.length,'Source citations required');
 const validation=await step('validation','Prepare a validation draft with a small non-binding customer test, audience and advance decision rule. No customer research has happened.',{type:'stage_draft',stage:'validate'});
 assert.ok(validation.artifacts[0]?.proposedTest);
 await step('cost-plan','Prepare a cost plan: price 60 KWD, variable cost 15 KWD per client, fixed costs 90 KWD per month, five clients is only a scenario, budget 300 KWD. Demand and founder hours unknown.',{type:'stage_draft',stage:'plan'});
 const quote=await step('record-proposal','SIMULATED QA ONLY: prepare a supplier quote lifecycle record via propose_workspace_update, category operation, entityType quote, title Fictional design quote, status prepared, basis simulated, quantity 3, unitPrice 0.333 KWD. Nothing ordered or paid.');
 assert.equal(quote.proposals.length,1);
 assert.equal(quote.proposals[0].kind,'lifecycle');
 workspace=applyConversationProposal(workspace,quote.proposals[0]);workspace.updatedAt=new Date().toISOString();
 assert.equal(workspace.lifecycle[0].values.amount,'0.999');
 const cache=new Map<string,string>();const storage={getItem:(k:string)=>cache.get(k)??null,setItem:(k:string,v:string)=>{cache.set(k,v)}};
 const writer=new WorkspaceWriter(storage,'fictional');assert.equal(writer.persist(workspace,()=>true).ok,true);
 assert.deepEqual(JSON.parse(storage.getItem('fictional')!),workspace);
 receipt.reviewSave={explicitAcceptance:true,storage:'isolated in-memory browser-storage adapter',amount:'0.999',browserVerified:false};record();
 const filled=await step('official-pdf','Fill the actual official PDF with supplied fictional details only: Name Sand API Studio - fictional, Nationality Kuwait - fictional, Email founder@example.test. Leave all other values and signatures unknown. Do not submit.',{type:'official_pdf'});
 const a=filled.artifacts.find((a:any)=>a.kind==='official_pdf');assert.ok(a);
 const raw=app.chat.artifact(a.id);const pdf=await PDFDocument.load(Buffer.from(raw.pdfBase64,'base64'));assert.equal(pdf.getPageCount(),11);assert.equal(pdf.getForm().getTextField('Name').getText(),'Sand API Studio - fictional');
 const revision=await wait(app.chat.reviseArtifact(a.id,{hash:a.hash,fields:{Name:'Sand API Studio revised - fictional'}}).turn.id);
 assert.equal(revision.turn.status,'completed');const b=revision.artifacts[0];assert.equal(b.version,a.version+1);assert.equal(b.supersedesArtifactId,a.id);assert.equal(app.chat.artifact(a.id).hash,a.hash);
 app.chat.reviewArtifact(b.id,{hash:b.hash,actor:'Synthetic QA reviewer',acknowledgeDraft:true});
 writeFileSync(join(root,'reviewed-fictional.pdf'),Buffer.from(app.chat.artifact(b.id).pdfBase64,'base64'));
 receipt.pdf={pages:11,original:{id:a.id,hash:a.hash},revision:{id:b.id,hash:b.hash},reviewed:true,originalUnchanged:true};
 receipt.passed=true;record();
}catch(e){receipt.passed=false;receipt.failure={code:(e as any).code,message:(e as Error).message};record();process.exitCode=1;}
finally{for(const abort of app.chat.active.values())abort.abort();app.chat.closed=true;receipt.budget=app.store.all('provider_budget');record();app.store.close();console.log(JSON.stringify({passed:receipt.passed,receipt:out}));}
