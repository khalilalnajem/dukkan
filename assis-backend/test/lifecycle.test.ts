import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';
import {workspaceProposal} from '../src/workspace-proposal.ts';
import {hash} from '../contracts/index.ts';
const workspace={updatedAt:'v1',lifecycle:[],hypotheses:[]};
test('lifecycle proposals cannot invent a completed action or mutate workspace',()=>{
 const before=JSON.stringify(workspace),values={category:'hiring',title:'Role brief',details:'Hours and budget unknown',status:'prepared'};
 assert.equal(workspaceProposal({kind:'lifecycle',summary:'Hiring plan',values},workspace).kind,'lifecycle');assert.equal(JSON.stringify(workspace),before);
 assert.throws(()=>workspaceProposal({kind:'lifecycle',summary:'Sent',values:{...values,status:'submitted',evidence:'invented'}},workspace));
});
test('PDF upload is case scoped, idempotent, durable and blocked during active chat',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-documents-'));let app=await createApp({privateRoot:root,allowDeterministicTests:true});
 const start=async()=>{await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+(app.server.address() as any).port};let base=await start();
 const post=async(path:string,body:any,key=crypto.randomUUID())=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});return {status:response.status,data:await response.json()}};
 try{
  const made=await post('/api/conversations',{title:'SYNTHETIC lifecycle test',workspaceId:'lifecycle-test'}),id=made.data.conversation.caseId;
  const bytes=readFileSync(new URL('../data/fixtures/synthetic-lease.pdf',import.meta.url)),body={expectedRevision:1,synthetic:true,files:[{name:'redacted-qa.pdf',mime:'application/pdf',base64:bytes.toString('base64')}]},key=crypto.randomUUID();
  const uploaded=await post('/api/cases/'+id+'/documents',body,key);assert.equal(uploaded.status,201);assert.equal(uploaded.data.documents[0].contentHash,hash(bytes));assert.equal(uploaded.data.documents[0].storageKey,undefined);
  const listed=await (await fetch(base+'/api/workspaces/lifecycle-test/documents')).json();assert.equal(listed.documents.length,1);assert.equal(listed.documents[0].conversationId,made.data.conversation.id);
  const d=uploaded.data.documents[0],download=await fetch(base+'/api/cases/'+id+'/documents/'+d.id+'?hash='+d.contentHash);assert.equal(download.status,200);assert.equal(hash(Buffer.from(await download.arrayBuffer())),hash(bytes));
  assert.equal((await fetch(base+'/api/cases/'+id+'/documents/'+d.id+'?hash=wrong')).status,409);

  assert.deepEqual((await post('/api/cases/'+id+'/documents',body,key)).data,uploaded.data);
  assert.equal((await post('/api/cases/'+id+'/documents',{...body,expectedRevision:2,synthetic:false})).status,400);
  const other=await post('/api/conversations',{title:'Other',workspaceId:'other'});assert.equal((await (await fetch(base+'/api/cases/'+other.data.conversation.caseId)).json()).documents.length,0);assert.equal((await fetch(base+'/api/cases/'+other.data.conversation.caseId+'/documents/'+d.id+'?hash='+d.contentHash)).status,404);
  app.store.put('chat_turn','busy',id,{id:'busy',caseId:id,conversationId:made.data.conversation.id,status:'running'});
  assert.equal((await post('/api/cases/'+id+'/documents',{...body,expectedRevision:2})).status,409);
  app.store.put('chat_turn','busy',id,{id:'busy',caseId:id,status:'completed'});
  await new Promise<void>(r=>app.server.close(()=>r()));app=await createApp({privateRoot:root});base=await start();
  const restored=await (await fetch(base+'/api/cases/'+id)).json();assert.equal(restored.documents.length,1);assert.equal(restored.documents[0].contentHash,hash(bytes));assert.equal(restored.case.businessRevision,2);
 }finally{await new Promise<void>(r=>app.server.close(()=>r()));rmSync(root,{recursive:true,force:true})}
});
test('model tool output becomes a review card without saving founder facts; invalid state can repair',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-card-'));let calls=0;
 const app=await createApp({privateRoot:root,chatModel:{name:'contract-test-only',version:'stub',async respond(){calls++;return {content:'',calls:[{name:'propose_workspace_update',arguments:{kind:'lifecycle',summary:'Review launch action',values:{category:'launch',title:'Prepare pilot',details:'SYNTHETIC QA: define a non-binding customer test',status:calls===1?'completed':'prepared'}}}],usage:{}}}}});
 try{
  const c=app.chat.create({workspaceId:'card-test'}).conversation,{turn}=app.chat.enqueue(c.id,{content:'Prepare a launch task',workspaceContext:workspace});
  let result:any;for(let i=0;i<200;i++){result=app.chat.turnSnapshot(turn.id);if(!['queued','running'].includes(result.turn.status))break;await new Promise(r=>setTimeout(r,10))}
  assert.equal(result.turn.status,'completed');assert.equal(calls,2);assert.equal(result.case.facts.length,0);assert.equal(result.messages.at(-1).actions[0].payload.values.status,'prepared');assert.equal(workspace.lifecycle.length,0);
 }finally{app.chat.closed=true;app.store.close();rmSync(root,{recursive:true,force:true})}
});
test('licence record cannot bypass retrieval even when the model asks for a review card',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-licence-guard-'));
 const app=await createApp({privateRoot:root,chatModel:{name:'contract-test-only',version:'stub',async respond(){return {content:'',calls:[{name:'propose_workspace_update',arguments:{kind:'lifecycle',summary:'Licensing claim',values:{category:'licence',title:'Unsupported requirement',details:'No official source retrieved',status:'prepared'}}}],usage:{}}}}});
 try{const c=app.chat.create({workspaceId:'guard-test'}).conversation,{turn}=app.chat.enqueue(c.id,{content:'Prepare a licence task',workspaceContext:workspace});let result:any;for(let i=0;i<200;i++){result=app.chat.turnSnapshot(turn.id);if(!['queued','running'].includes(result.turn.status))break;await new Promise(r=>setTimeout(r,10))}assert.equal(result.messages.flatMap((m:any)=>m.actions).length,0);assert.equal(result.case.facts.length,0);assert.ok(result.turn.events.some((e:any)=>e.error?.code==='RETRIEVAL_REQUIRED'))}finally{app.chat.closed=true;app.store.close();rmSync(root,{recursive:true,force:true})}
});
