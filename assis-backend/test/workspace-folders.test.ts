import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';

async function harness(t:any){
 const root=mkdtempSync(join(tmpdir(),'dukkan-folder-contract-'));
 let app=await createApp({privateRoot:root});
 let base='';let request=0;
 async function listen(){await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(app.server.address() as any).port}`;}
 async function close(){await new Promise<void>((resolve,reject)=>app.server.close(error=>error?reject(error):resolve()));}
 await listen();
 t.after(async()=>{await close();rmSync(root,{recursive:true,force:true});});
 async function api(path:string,body?:unknown){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`folder-${++request}`},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
 async function create(workspaceId?:string){const response=await api('/api/conversations',{title:'Folder contract fixture',...(workspaceId===undefined?{}:{workspaceId})});assert.equal(response.status,201);return response.data.conversation;}
 async function ids(workspaceId?:string){const response=await api('/api/conversations'+(workspaceId===undefined?'':`?workspaceId=${encodeURIComponent(workspaceId)}`));assert.equal(response.status,200);return response.data.conversations.map((c:any)=>c.id).sort();}
 return {api,create,ids,get app(){return app;},async restart(){await close();app=await createApp({privateRoot:root});await listen();}};
}

test('idea folders isolate listings, survive restart, and preserve unfiltered and legacy access',async t=>{
 const h=await harness(t);
 const first=await h.create('idea-cafe');const second=await h.create('idea-cafe');const other=await h.create('idea_software');const legacy=await h.create();
 assert.equal(legacy.workspaceId,'legacy');
 // Simulate a saved conversation from before workspaceId existed.
 const old={...legacy,id:'pre-folder-conversation'};delete old.workspaceId;
 h.app.store.put('conversation',old.id,old.caseId,old);
 const expected=[first.id,second.id].sort();
 for(let run=0;run<2;run++){
  assert.deepEqual(await h.ids('idea-cafe'),expected);
  assert.deepEqual(await h.ids('idea_software'),[other.id]);
  assert.deepEqual(await h.ids('legacy'),[legacy.id,old.id].sort());
  assert.deepEqual(await h.ids('unused-folder'),[]);
  assert.deepEqual(await h.ids(),[first.id,second.id,other.id,legacy.id,old.id].sort());
  const snapshot=await h.api(`/api/conversations/${first.id}`);assert.equal(snapshot.status,200);assert.equal(snapshot.data.conversation.workspaceId,'idea-cafe');
  if(run===0)await h.restart();
 }
});

test('invalid explicit folder IDs reject without creating cases or conversations',async t=>{
 const h=await harness(t);
 for(const workspaceId of ['',null,17,{},[],true,'../cafe','two ideas','x'.repeat(101),'مطعم']){
  const result=await h.api('/api/conversations',{workspaceId});
  assert.equal(result.status,400,JSON.stringify(workspaceId));assert.equal(result.data.error.code,'INVALID_WORKSPACE');
 }
 assert.equal(h.app.store.all('conversation').length,0);assert.equal(h.app.store.all('case').length,0);
 for(const workspaceId of ['','../cafe','two ideas','x'.repeat(101),'مطعم']){
  const result=await h.api(`/api/conversations?workspaceId=${encodeURIComponent(workspaceId)}`);
  assert.equal(result.status,400,JSON.stringify(workspaceId));assert.equal(result.data.error.code,'INVALID_WORKSPACE');
 }
 const boundary='A_0-'+'x'.repeat(96);const valid=await h.create(boundary);assert.deepEqual(await h.ids(boundary),[valid.id]);
});

test('chat archive is recoverable, durable and cannot cross idea boundaries',async t=>{
 const h=await harness(t),chat=await h.create('bin-check');
 let result=await h.api(`/api/conversations/${chat.id}/archive`,{workspaceId:'other',archived:true});assert.equal(result.status,409);
 result=await h.api(`/api/conversations/${chat.id}/archive`,{workspaceId:'bin-check',archived:true});assert.equal(result.status,200);assert.equal(result.data.conversation.archived,true);
 await h.restart();result=await h.api(`/api/conversations/${chat.id}`);assert.equal(result.data.conversation.archived,true);assert.equal(result.data.conversation.caseId,chat.caseId);
 result=await h.api(`/api/conversations/${chat.id}/archive`,{workspaceId:'bin-check',archived:false});assert.equal(result.status,200);assert.equal(result.data.conversation.archived,false);assert.equal(h.app.store.all('case').length,1);
 h.app.store.put('chat_turn','busy',chat.caseId,{id:'busy',caseId:chat.caseId,conversationId:chat.id,status:'running'});
 result=await h.api(`/api/conversations/${chat.id}/archive`,{workspaceId:'bin-check',archived:true});assert.equal(result.status,409);
});
