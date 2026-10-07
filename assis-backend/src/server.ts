import {createCodexSubscriptionModel,codexSubscriptionConfig} from './codex-subscription.ts';
import {EmailService,emailAdapterFromEnv} from './email.ts';
import {handleEmailRoute} from './email-routes.ts';
import {openrouterConfig,createOpenRouterModel} from './openrouter.ts';
import {createFallbackModel} from './fallback-model.ts';
import {siliconflowConfig,createSiliconFlowModel} from './siliconflow.ts';
import {createProviderPreparation} from './provider-preparation.ts';
import {searchBusinessKnowledge,listBusinessKnowledgeSources} from '../tools/business-knowledge.ts';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ApiError, ensure, hash, validateFacts } from '../contracts/index.ts';
import type { ToolExecutor, ModelAdapter } from '../contracts/index.ts';
import { Store } from './store.ts';
import { sourceFingerprint } from './sources.ts';
import { Controller } from './controller.ts';
import { ChatController } from './chat.ts';
import type {ChatModel} from '../contracts/chat.ts';
const here=dirname(fileURLToPath(import.meta.url));
const now=()=>new Date().toISOString();
const allowedOrigins=new Set(['http://127.0.0.1:8788','http://localhost:8788']);
const publicDocument=(d:any)=>{const {storageKey,...rest}=d;return rest;};
function publicPack(p:any){if(!p)return null;const {html,markdown,sourceData,...rest}=p;return rest;}
function revision(c:any,expected:any){ensure(Number.isInteger(expected)&&expected===c.businessRevision,'STALE_REVISION','Expected current businessRevision',409);}
function safeId(id:any){ensure(typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id),'INVALID_ID','Invalid case identifier');return id;}
export async function createApp(options:{privateRoot?:string;executor?:ToolExecutor;model?:ModelAdapter;chatModel?:ChatModel;port?:number;expireCases?:boolean;retainDocuments?:boolean;allowDeterministicTests?:boolean;codexSubscription?:ReturnType<typeof codexSubscriptionConfig>;openrouter?:ReturnType<typeof openrouterConfig>;siliconflow?:ReturnType<typeof siliconflowConfig>;gptFirst?:boolean}={}){
 const store=new Store(options.privateRoot||resolve(here,'../.private'));
 const retainDocuments=options.retainDocuments??!options.expireCases;
 if(retainDocuments)store.transaction(()=>{for(const kind of ['case','document'])for(const record of store.all(kind)){if(record.expiresAt!=='9999-12-31T23:59:59.999Z'){record.originalExpiresAt??=record.expiresAt;record.expiresAt='9999-12-31T23:59:59.999Z';store.put(kind,kind==='case'?record.businessId:record.id,record.businessId,record);}}});
 if(options.codexSubscription){options.chatModel=createCodexSubscriptionModel(options.codexSubscription);options.model=createProviderPreparation(options.chatModel);}
 if(options.openrouter){const api=createOpenRouterModel(options.openrouter,{store});const gpt=options.codexSubscription?createCodexSubscriptionModel(options.codexSubscription):null;options.chatModel=!gpt?api:options.gptFirst?createFallbackModel(gpt,api,{onFallback:e=>console.warn('GPT failed, using API fallback:',(e as {code?:string})?.code||'error')}):createFallbackModel(api,gpt,{onFallback:e=>console.warn('Primary model failed, using GPT fallback:',(e as {code?:string})?.code||'error')});options.model=createProviderPreparation(options.chatModel);}
 if(options.siliconflow){options.chatModel=createSiliconFlowModel(options.siliconflow,{store});options.model=createProviderPreparation(options.chatModel);}
 const executor:ToolExecutor=options.executor|| (async(call,context)=>{const module=await import('../tools/index.ts');ensure(typeof module.executeTool==='function','TOOLS_UNAVAILABLE','Data tools adapter is not installed',503);return module.executeTool(call,context);});
 const emails=new EmailService(store,emailAdapterFromEnv());emails.recoverInterrupted();
 const controller=new Controller(store,executor,options.model);
 const chat=new ChatController(store,executor,options.chatModel,newJob,!!options.allowDeterministicTests);chat.retainDocuments=retainDocuments;
 // An interrupted job cannot silently claim a completed run after restart.
 for(const j of store.all('job'))if(['queued','running','retry_wait'].includes(j.status)){j.status='failed';j.reasonCode='PROCESS_INTERRUPTED';j.error={code:'PROCESS_INTERRUPTED',message:'Previous local process stopped. Start a new preparation job.'};store.put('job',j.jobId,j.businessId,j);}
 function expire(){if(!options.expireCases)return;for(const c of store.all('case'))if(Date.parse(c.expiresAt)<=Date.now()){controller.cancelBusiness(c.businessId);chat.cancelBusiness(c.businessId);store.deleteBusiness(c.businessId);}}
 expire();const expiryTimer=setInterval(expire,30000);expiryTimer.unref();
 function getCase(id:string){const c=store.get('case',id);ensure(c,'NOT_FOUND','Case not found',404);return c;}
 function refreshSourceState(){const fingerprint=sourceFingerprint();for(const j of store.all('job')){if(j.sourceSnapshotHash&&j.sourceSnapshotHash!==fingerprint&&!['superseded','cancelled'].includes(j.status)){controller.active.get(j.jobId)?.abort();j.status='superseded';j.reasonCode='SOURCE_CHANGED';j.updatedAt=now();store.put('job',j.jobId,j.businessId,j);const review=store.get('review',j.jobId);if(review){review.valid=false;review.invalidatedAt=now();store.put('review',j.jobId,j.businessId,review);}const handoff=store.get('handoff',j.jobId);if(handoff){handoff.state='blocked';handoff.reasonCode='SOURCE_CHANGED';store.put('handoff',j.jobId,j.businessId,handoff);}}}}
 function invalidate(c:any){controller.cancelBusiness(c.businessId);chat.cancelBusiness(c.businessId);for(const job of store.all('job',c.businessId)){if(!['superseded','cancelled'].includes(job.status)){job.status='superseded';job.reasonCode='INPUT_CHANGED';job.updatedAt=now();store.put('job',job.jobId,c.businessId,job);}const review=store.get('review',job.jobId);if(review){review.valid=false;review.invalidatedAt=now();store.put('review',job.jobId,c.businessId,review);}const handoff=store.get('handoff',job.jobId);if(handoff){handoff.state='blocked';handoff.reasonCode='INPUT_CHANGED';store.put('handoff',job.jobId,c.businessId,handoff);}}}
 function newJob(c:any,mode:any,supersedesJobId:string|null=null){ensure(mode!=='deterministic'||options.allowDeterministicTests,'MODE_DISABLED','Only API-backed AI is enabled',409);ensure(mode==='deterministic'||mode==='live_agent','INVALID_MODE','Select deterministic or configured live_agent mode');ensure(mode!=='live_agent'||options.model,'MODEL_UNAVAILABLE','No AI provider configured; no fallback was run',409);const job={schemaVersion:1,jobId:randomUUID(),businessId:c.businessId,businessRevision:c.businessRevision,factsHash:c.factsHash,requirementSetVersion:null,sourceSnapshotHash:sourceFingerprint(),documentVersionIds:[...c.documentVersionIds],inputHash:hash({sourceSnapshotHash:sourceFingerprint(),factsHash:c.factsHash,businessRevision:c.businessRevision,documents:c.documentVersionIds.map((id:string)=>store.get('document',id)?.contentHash),requirementSetVersion:null}),status:'queued',step:'intake',reasonCode:null,executionMode:mode,model:mode==='live_agent'?{name:options.model!.name,version:options.model!.version}:null,modelFacts:mode==='live_agent'?c.facts:[],supersedesJobId,resultRefs:{},questions:[],trace:[],results:{},toolCallCount:0,createdAt:now(),updatedAt:now(),label:mode==='deterministic'?'Deterministic local preparation':'Live model tool execution'};store.put('job',job.jobId,c.businessId,job);setImmediate(()=>void controller.execute(job.jobId));return job;}
 async function body(req:any){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;ensure(length<=145*1024*1024,'BODY_TOO_LARGE','Request exceeds upload limit',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new ApiError(400,'INVALID_JSON','Valid JSON required');}}
 const server=createServer(async(req,res)=>{
 const origin=req.headers.origin;const host=req.headers.host||'';const port=(server.address() as any)?.port;
 function send(status:number,data:any){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
 try{
 ensure(['127.0.0.1', '::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''),'LOCAL_ONLY','Loopback requests only',403);
 ensure(host===`127.0.0.1:${port}`||host===`localhost:${port}`,'HOST_DENIED','Unrecognised local host',403);
 ensure(!origin||allowedOrigins.has(origin),'ORIGIN_DENIED','Origin not allowed',403);
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Idempotency-Key');}
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 expire();refreshSourceState();const url=new URL(req.url!,'http://127.0.0.1');const segments=url.pathname.split('/').filter(Boolean);
 if(await handleEmailRoute({req,res,url,service:emails,readBody:()=>body(req)}))return;
 if(req.method==='GET'&&url.pathname==='/api/business-knowledge/sources'){send(200,listBusinessKnowledgeSources());return;}
 if(req.method==='GET'&&url.pathname==='/api/business-knowledge'){const query=url.searchParams.get('query')||'';const phase=url.searchParams.get('phase')||undefined;const kind=url.searchParams.get('kind')||undefined;send(200,await searchBusinessKnowledge({query,phase:phase as any,kind:kind as any}));return;}
 if(req.method==='GET'&&url.pathname==='/api/health'){send(200,{schemaVersion:1,status:'ok',chat:{schemaVersion:1,executionModes:[...(options.allowDeterministicTests?['deterministic']:[]),...(options.chatModel?['live_agent']:[])],model:options.chatModel?{name:options.chatModel.name,version:options.chatModel.version}:null,activeTurns:chat.active.size,capabilities:['stage_drafts','business_knowledge','source_research','enquiry_drafts','application_worksheets','case_fact_proposals','document_preparation'],inferenceSerial:true},activeJobs:controller.active.size,executionModes:[...(options.allowDeterministicTests?['deterministic']:[]),...(options.model?['live_agent']:[])],model:options.model?{name:options.model.name,version:options.model.version}:null,sourceActivation:'inactive',storage:'private-sqlite',providerStatus:options.chatModel?'configured':'not_configured',modelReadiness:'See job trace for actual inference success; configured does not guarantee availability',limits:{files:10,fileBytes:10485760,toolCalls:12,attempts:3,retentionHours:options.expireCases?24:null}});return;}
 if(req.method==='GET'&&url.pathname==='/api/chat/models'){ensure(options.chatModel?.catalogue,'CATALOGUE_UNAVAILABLE','No provider catalogue is configured',503);const result=await options.chatModel.catalogue(AbortSignal.timeout(16000));send(200,{provider:options.chatModel.name,currentModel:options.chatModel.version,...result,billing:options.chatModel.name==='codex-subscription'?'subscription':options.openrouter?.allowPaid?'api-capped':'free-only',note:'Only explicit zero input and output prices are marked verified free. Catalogue availability does not prove a model is free or supports tools.'});return;}
 ensure(segments[0]==='api','NOT_FOUND','Endpoint not found',404);
 const workspaceDocuments=url.pathname.match(/^\/api\/workspaces\/([A-Za-z0-9_-]{1,100})\/documents$/);
 if(req.method==='GET'&&workspaceDocuments){
  const workspaceId=workspaceDocuments[1];
  const conversations=store.all('conversation').filter(c=>c.workspaceId===workspaceId||(workspaceId==='legacy'&&!c.workspaceId));
  const documents=conversations.flatMap(c=>store.all('document',c.caseId).map(d=>({...publicDocument(d),conversationId:c.id,chatTitle:c.title})));
  send(200,{documents});return;
 }
 const documentDownload=url.pathname.match(/^\/api\/cases\/([A-Za-z0-9_-]+)\/documents\/([A-Za-z0-9_-]+)$/);
 if(req.method==='GET'&&documentDownload){
  const c=getCase(documentDownload[1]),d=store.get('document',documentDownload[2]);
  ensure(d&&d.businessId===c.businessId&&c.documentVersionIds.includes(d.id),'NOT_FOUND','Document not found in this case',404);
  ensure(url.searchParams.get('hash')===d.contentHash,'DOCUMENT_HASH_MISMATCH','Exact document hash required',409);
  const bytes=readFileSync(d.storageKey);ensure(hash(bytes)===d.contentHash,'DOCUMENT_HASH_MISMATCH','Stored file failed verification',409);
  res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="dukkan-supporting-document.pdf"'});res.end(bytes);return;
 }
 const workspaceArtifacts=url.pathname.match(/^\/api\/workspaces\/([^/]*)\/artifacts$/);
 if(req.method==='GET'&&workspaceArtifacts){
  const workspaceId=workspaceArtifacts[1];ensure(/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId),'INVALID_WORKSPACE','Invalid idea folder');
  const conversations=new Map(store.all('conversation').filter(c=>(c.workspaceId===workspaceId||(workspaceId==='legacy'&&!c.workspaceId))&&store.get('case',c.caseId)).map(c=>[c.id,c]));
  const artifacts=store.all('chat_artifact').filter(a=>conversations.get(a.conversationId)?.caseId===a.caseId&&conversations.has(a.conversationId)).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id).localeCompare(String(b.id))).map(a=>chat.publicArtifact(a));
  send(200,{artifacts});return;
 }
 if(req.method==='GET'&&url.pathname==='/api/conversations'){const workspaceId=url.searchParams.get('workspaceId');ensure(workspaceId===null||/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId),'INVALID_WORKSPACE','Invalid idea folder');send(200,{conversations:store.all('conversation').filter(c=>workspaceId===null||c.workspaceId===workspaceId||(workspaceId==='legacy'&&!c.workspaceId))});return;}
 if(req.method==='GET'&&segments[1]==='conversations'&&segments.length===3){send(200,chat.snapshot(segments[2]));return;}
 if(req.method==='GET'&&segments[1]==='chat'&&segments[2]==='turns'&&segments.length===4){send(200,chat.turnSnapshot(segments[3]));return;}
 if(req.method==='GET'&&segments[1]==='chat'&&segments[2]==='artifacts'&&segments.length===5){const artifact=chat.artifact(segments[3]);ensure(['draft','export'].includes(segments[4]),'NOT_FOUND','Endpoint not found',404);if(segments[4]==='export'){chat.currentArtifact(artifact);ensure(url.searchParams.get('hash')===artifact.hash,'ARTIFACT_HASH_MISMATCH','Exact draft hash required',409);ensure(artifact.review?.hash===artifact.hash,'REVIEW_REQUIRED','Review this exact draft before downloading',409);const stageFilename=new Map([['idea','dukkan-idea-draft.html'],['validate','dukkan-validation-draft.html'],['plan','dukkan-plan-draft.html']]).get(artifact.stage);ensure(artifact.kind!=='stage_draft'||stageFilename,'INVALID_STAGE','Unknown draft stage');const filename=artifact.kind==='stage_draft'?stageFilename:artifact.kind==='application_worksheet'?'dikan-business-setup-worksheet.html':'dikan-enquiry-draft.html';res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);}if(artifact.kind==='official_pdf'){if(segments[4]==='export')res.setHeader('Content-Disposition','attachment; filename="dukkan-official-form-demo.pdf"');res.writeHead(200,{'Content-Type':'application/pdf','Cache-Control':'private, no-store'});res.end(Buffer.from(artifact.pdfBase64,'base64'));return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(artifact.html);return;}
 if(req.method==='GET'&&url.pathname==='/api/demo-fixture'){const root=resolve(here,'../data/fixtures');const intake=JSON.parse(readFileSync(resolve(root,'synthetic-intake.json'),'utf8'));const correction=JSON.parse(readFileSync(resolve(root,'synthetic-correction.json'),'utf8'));send(200,{schemaVersion:1,synthetic:true,facts:intake.facts,files:[{name:'synthetic-lease.pdf',mime:'application/pdf',base64:readFileSync(resolve(root,'synthetic-lease.pdf')).toString('base64')}],correction});return;}
 if(req.method==='GET'&&segments[1]==='cases'&&segments.length===3){const c=getCase(segments[2]);send(200,{case:c,jobs:store.all('job',c.businessId),documents:store.all('document',c.businessId).map(publicDocument)});return;}
 if(req.method==='GET'&&segments[1]==='jobs'){
 const job=store.get('job',segments[2]);ensure(job,'NOT_FOUND','Job not found',404);const c=getCase(job.businessId);const pack=store.get('pack',job.jobId);const review=store.get('review',job.jobId);const handoff=store.get('handoff',job.jobId)||{state:'blocked',reasonCode:'SOURCE_NOT_ACTIVATED',packHash:pack?.hash||null,destinationRef:'https://e-kbc.moci.gov.kw/'};
 if(segments.length===3){send(200,{job,case:c,pack:publicPack(pack),review,handoff});return;}
 if(segments[3]==='export'&&segments.length===4){ensure(pack,'PACK_UNAVAILABLE','No draft generated',409);ensure(job.sourceSnapshotHash===sourceFingerprint()&&c.businessRevision===job.businessRevision&&job.status!=='superseded','STALE_INPUT','Draft belongs to old inputs',409);ensure(url.searchParams.get('packHash')===pack.hash,'PACK_HASH_MISMATCH','Exact current pack hash required',409);ensure(review?.valid&&review.packHash===pack.hash,'REVIEW_REQUIRED','Review current incomplete draft first',409);const exported={...handoff,state:'blocked',exportedAt:now(),exportKind:'incomplete_preparation_worksheet'};store.put('handoff',job.jobId,c.businessId,exported);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':pack.downloadFilename==='dikan-incomplete-preparation.html'?'attachment; filename="dikan-incomplete-preparation.html"':'attachment; filename="assis-incomplete-preparation.html"'});res.end(pack.html);return;}
 if(segments[3]==='draft'&&segments.length===4){ensure(pack,'PACK_UNAVAILABLE','No draft generated',409);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(pack.html);return;}
 }
 if(req.method==='DELETE'&&segments[1]==='cases'&&segments.length===3){const c=getCase(segments[2]);controller.cancelBusiness(c.businessId);chat.cancelBusiness(c.businessId);store.deleteBusiness(c.businessId);send(200,{deleted:true,businessId:c.businessId});return;}
 ensure(req.method==='POST','NOT_FOUND','Endpoint not found',404);
 ensure(req.headers['content-type']?.split(';')[0]==='application/json','CONTENT_TYPE','application/json required',415);
 const data=await body(req);ensure(data&&typeof data==='object'&&!Array.isArray(data),'INVALID_BODY','JSON object required');const key=req.headers['idempotency-key'];ensure(typeof key==='string'&&key.length>=1&&key.length<=160,'IDEMPOTENCY_REQUIRED','Idempotency-Key required');const receiptKey=`${req.method}:${url.pathname}:${key}`;const requestHash=hash(data);const prior=store.receipt(receiptKey);if(prior){ensure(prior.hash===requestHash,'IDEMPOTENCY_CONFLICT','Key already used with different request',409);send(prior.response.status,prior.response.body);return;}
 let response:any;let status=200;let business='';const newPaths:string[]=[];
 try{store.transaction(()=>{
 if(segments[1]==='conversations'&&segments.length===2){response=chat.create(data);business=response.conversation.caseId;status=201;}
 else if(segments[1]==='chat'&&segments[2]==='turns'&&segments.length===5&&segments[4]==='stop'){response=chat.stop(segments[3],data.workspaceId);business=response.turn.caseId;}
 else if(segments[1]==='conversations'&&segments.length===4&&segments[3]==='archive'){
 const conversation=chat.conversation(segments[2]);ensure(typeof data.archived==='boolean','INVALID_ARCHIVE','Choose archive or restore');ensure(data.workspaceId===(conversation.workspaceId||'legacy'),'WORKSPACE_MISMATCH','This chat belongs to another idea',409);
 ensure(!store.all('chat_turn',conversation.caseId).some(t=>t.conversationId===conversation.id&&['queued','running'].includes(t.status)),'TURN_BUSY','Wait for the current response before archiving this chat',409);
 conversation.archived=data.archived;conversation.updatedAt=now();business=conversation.caseId;store.put('conversation',conversation.id,business,conversation);response={conversation};
 }
 else if(segments[1]==='conversations'&&segments.length===4&&segments[3]==='messages'){response=chat.enqueue(segments[2],data);business=response.turn.caseId;status=202;}
 else if(segments[1]==='chat'&&segments[2]==='artifacts'&&segments.length===5&&segments[4]==='revise'){response=chat.reviseArtifact(segments[3],data);business=response.turn.caseId;status=202;}
 else if(segments[1]==='conversations'&&segments.length===4&&segments[3]==='facts'){const conversation=chat.conversation(segments[2]);const c=chat.caseFor(conversation);business=c.businessId;revision(c,data.expectedRevision);validateFacts(data.facts);ensure(data.facts.length>0,'EMPTY_CORRECTION','At least one explicitly confirmed fact required');const merged=new Map(c.facts.map((f:any)=>[f.field,f]));for(const f of data.facts){const old=merged.get(f.field) as any;c.corrections.push({field:f.field,previousValue:old?.value??null,value:f.value,actor:f.confirmedBy,at:f.confirmedAt,sourceRef:f.sourceRef,previousRevision:c.businessRevision});merged.set(f.field,f);}invalidate(c);c.facts=[...merged.values()];c.factsHash=hash(c.facts);c.businessRevision++;store.put('case',c.businessId,c.businessId,c);response={case:c};}
 else if(segments[1]==='chat'&&segments[2]==='artifacts'&&segments.length===5&&segments[4]==='review'){business=chat.artifact(segments[3]).caseId;response=chat.reviewArtifact(segments[3],data);}
 else if(segments[1]==='cases'&&segments.length===2){const id=safeId(data.businessId||randomUUID());ensure(!store.get('case',id),'CASE_EXISTS','Case already exists',409);validateFacts(data.facts);const c={schemaVersion:1,businessId:id,businessRevision:1,facts:data.facts,factsHash:hash(data.facts),documentVersionIds:[],corrections:[],createdAt:now(),expiresAt:retainDocuments?'9999-12-31T23:59:59.999Z':new Date(Date.now()+86400000).toISOString()};store.put('case',id,id,c);business=id;response={case:c};status=201;}
 else if(segments[1]==='cases'&&segments.length===4){const c=getCase(segments[2]);business=c.businessId;revision(c,data.expectedRevision);
 if(segments[3]==='documents'){
 ensure(!store.all('chat_turn',c.businessId).some(t=>['queued','running'].includes(t.status)),'TURN_BUSY','Wait for the current response before attaching documents',409);
 ensure(data.synthetic===true,'SYNTHETIC_REQUIRED','Only synthetic or redacted demo evidence is accepted');ensure(Array.isArray(data.files)&&data.files.length>0&&data.files.length+c.documentVersionIds.length<=10,'FILE_LIMIT','At most ten files per case');const docs=[];
 for(const f of data.files){ensure(f&&typeof f.name==='string'&&f.name.length<=150&&f.mime==='application/pdf'&&typeof f.base64==='string','INVALID_FILE','Named PDF base64 files required');ensure(/^[A-Za-z0-9+/]*={0,2}$/.test(f.base64)&&f.base64.length%4===0,'INVALID_BASE64','Malformed base64');const bytes=Buffer.from(f.base64,'base64');ensure(bytes.length>0&&bytes.length<=10485760,'FILE_TOO_LARGE','PDF must be no larger than 10 MB',413);ensure(bytes.subarray(0,5).toString()==='%PDF-','INVALID_PDF','PDF signature required');const id=randomUUID();const folder=resolve(store.root,'cases',c.businessId,'documents');mkdirSync(folder,{recursive:true,mode:0o700});const path=resolve(folder,id+'.pdf');writeFileSync(path,bytes,{mode:0o600,flag:'wx'});newPaths.push(path);const d={schemaVersion:1,id,businessId:c.businessId,name:f.name,contentHash:hash(bytes),mime:f.mime,bytes:bytes.length,storageKey:path,expiresAt:c.expiresAt,extractionStatus:'pending',synthetic:true};store.put('document',id,c.businessId,d);c.documentVersionIds.push(id);docs.push(publicDocument(d));}
 invalidate(c);c.businessRevision++;store.put('case',c.businessId,c.businessId,c);response={case:c,documents:docs};status=201;
 }else if(segments[3]==='jobs'){const supersedes=data.supersedesJobId||null;if(supersedes)ensure(store.get('job',supersedes)?.businessId===c.businessId,'INVALID_PREDECESSOR','Predecessor belongs to another case',409);response={job:newJob(c,data.executionMode||'deterministic',supersedes)};status=202;}
 else if(segments[3]==='answers'){
 validateFacts(data.facts);ensure(data.facts.length>0,'EMPTY_CORRECTION','At least one confirmed fact required');const predecessor=store.get('job',data.supersedesJobId);ensure(predecessor&&predecessor.businessId===c.businessId&&predecessor.businessRevision===c.businessRevision&& !['superseded','cancelled'].includes(predecessor.status),'INVALID_PREDECESSOR','Current case job required',409);const merged=new Map(c.facts.map((f:any)=>[f.field,f]));for(const f of data.facts){const prior=merged.get(f.field) as any;c.corrections.push({field:f.field,previousValue:prior?.value??null,value:f.value,actor:f.confirmedBy,at:f.confirmedAt,sourceRef:f.sourceRef,previousRevision:c.businessRevision});merged.set(f.field,f);}invalidate(c);c.facts=[...merged.values()];c.factsHash=hash(c.facts);c.businessRevision++;store.put('case',c.businessId,c.businessId,c);response={case:c,job:newJob(c,data.executionMode||predecessor.executionMode,predecessor.jobId)};status=202;
 }else throw new ApiError(404,'NOT_FOUND','Endpoint not found');
 }else if(segments[1]==='jobs'&&segments.length===4&&segments[3]==='review'){
 const job=store.get('job',segments[2]);ensure(job,'NOT_FOUND','Job not found',404);const c=getCase(job.businessId);business=c.businessId;revision(c,data.expectedRevision);const pack=store.get('pack',job.jobId);ensure(pack&&pack.hash===data.packHash,'PACK_HASH_MISMATCH','Exact generated pack required',409);ensure(job.sourceSnapshotHash===sourceFingerprint()&&job.businessRevision===c.businessRevision&&job.factsHash===c.factsHash&&!['superseded','cancelled','running','queued','retry_wait','failed'].includes(job.status),'STALE_INPUT','Only a current finished draft may be reviewed',409);ensure(data.acknowledgeIncomplete===true&&typeof data.actor==='string'&&data.actor.trim().length>0&&data.actor.length<=100,'REVIEW_ACK_REQUIRED','Named human acknowledgement of incomplete draft required');const review={schemaVersion:1,id:randomUUID(),packHash:pack.hash,businessRevision:c.businessRevision,actor:data.actor,at:now(),valid:true,kind:'incomplete_draft_review',label:'Reviewed preparation draft: applicability questions open'};const handoff={packHash:pack.hash,state:'blocked',reasonCode:'SOURCE_NOT_ACTIVATED',destinationRef:'https://e-kbc.moci.gov.kw/'};job.label=review.label;store.put('review',job.jobId,business,review);store.put('handoff',job.jobId,business,handoff);store.put('job',job.jobId,business,job);response={review,handoff,job};
 }else throw new ApiError(404,'NOT_FOUND','Endpoint not found');
 store.saveReceipt(receiptKey,requestHash,business,{status,body:response});
 });}catch(e){for(const path of newPaths)rmSync(path,{force:true});throw e;}
 send(status,response);
 }catch(e:any){send(e instanceof ApiError?e.status:500,{error:{code:e instanceof ApiError?e.code:'INTERNAL_ERROR',message:e instanceof ApiError?e.message:'Local operation failed; no success recorded'}});}
 });
 server.on('close',()=>{chat.closed=true;clearInterval(expiryTimer);for(const c of store.all('case')){controller.cancelBusiness(c.businessId);chat.cancelBusiness(c.businessId);}store.close();});
 return {server,store,controller,chat};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
 const port=Number(process.env.ASSIS_PORT||8789);ensure(Number.isInteger(port)&&port>0&&port<65536,'INVALID_PORT','Valid local port required');
 const provider=process.env.DIKAN_PROVIDER||process.env.ASSIS_MODEL||'none';ensure(['siliconflow','openrouter','codex-subscription','openrouter+codex','codex+openrouter','none'].includes(provider),'PROVIDER_UNKNOWN','Choose a supported cloud provider or Codex subscription');
 const app=await createApp({privateRoot:process.env.ASSIS_PRIVATE_ROOT||resolve(here,'../.private-chat-demo'),codexSubscription:provider==='codex-subscription'||provider==='openrouter+codex'||provider==='codex+openrouter'?codexSubscriptionConfig():undefined,openrouter:provider==='openrouter'||provider==='openrouter+codex'||provider==='codex+openrouter'?openrouterConfig():undefined,gptFirst:provider==='codex+openrouter',siliconflow:provider==='siliconflow'?siliconflowConfig():undefined});
 app.server.listen(port,'127.0.0.1',()=>console.log(`Dikan backend http://127.0.0.1:${port} | provider ${provider} | retained local storage`));
 app.server.on('error',()=>{console.error('Backend could not bind its configured port');process.exitCode=1;app.server.close();});
 }catch(e){console.error(e instanceof ApiError?e.message:'Backend configuration failed');process.exitCode=1;}
}
