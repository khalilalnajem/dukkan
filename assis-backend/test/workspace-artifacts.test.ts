import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';
import {hash} from '../contracts/index.ts';

async function harness(t:any){
 const root=mkdtempSync(join(tmpdir(),'dukkan-workspace-artifacts-'));
 const app=await createApp({privateRoot:root});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise<void>(resolve=>app.server.close(()=>resolve()));rmSync(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${(app.server.address() as any).port}`;
 const get=(path:string)=>fetch(base+path);
 const create=(workspaceId?:string)=>app.chat.create({workspaceId}).conversation;
 function artifact(c:any,id:string,extra:any={}){
  const business=app.store.get('case',c.caseId);const html='<html>Private draft</html>';
  const a={id,conversationId:c.id,caseId:c.caseId,kind:'stage_draft',stage:'idea',version:1,createdAt:'2026-09-24T10:00:00.000Z',html,hash:hash(html),businessRevision:business.businessRevision,factsHash:business.factsHash,review:{hash:hash(html)},...extra};
  app.store.put('chat_artifact',id,c.caseId,a);return a;
 }
 return {...app,get,create,artifact};
}

test('workspace saved work aggregates all versions across chats, isolates folders and excludes orphaned records without mutation',async t=>{
 const h=await harness(t);const first=h.create('cafe'),second=h.create('cafe'),other=h.create('software');
 h.artifact(first,'v2',{version:2,supersedesArtifactId:'v1',createdAt:'2026-09-24T11:00:00.000Z'});
 h.artifact(second,'b');h.artifact(first,'a');h.artifact(first,'v1',{createdAt:'2026-09-24T09:00:00.000Z'});h.artifact(other,'other');
 h.artifact(first,'mismatched-case',{caseId:other.caseId});h.artifact(first,'missing-conversation',{conversationId:'absent'});
 const deleted=h.create('cafe');h.artifact(deleted,'missing-case');h.store.db.prepare("DELETE FROM records WHERE kind='case' AND id=?").run(deleted.caseId);
 const before=h.store.db.prepare('SELECT * FROM records ORDER BY kind,id').all();
 for(let i=0;i<2;i++){
  const response=await h.get('/api/workspaces/cafe/artifacts');assert.equal(response.status,200);const data=await response.json();
  assert.deepEqual(data.artifacts.map((a:any)=>a.id),['v1','a','b','v2']);
  assert.ok(data.artifacts.every((a:any)=>!Object.hasOwn(a,'html')));assert.equal(data.artifacts.at(-1).supersedesArtifactId,'v1');
 }
 assert.deepEqual(h.store.db.prepare('SELECT * FROM records ORDER BY kind,id').all(),before);
 assert.deepEqual((await (await h.get('/api/workspaces/unused/artifacts')).json()).artifacts,[]);
 assert.deepEqual((await (await h.get('/api/workspaces/software/artifacts')).json()).artifacts.map((a:any)=>a.id),['other']);
});

test('legacy compatibility and explicit invalid workspace identifiers',async t=>{
 const h=await harness(t);const legacy=h.create(),old=h.create();delete old.workspaceId;h.store.put('conversation',old.id,old.caseId,old);
 h.artifact(legacy,'legacy');h.artifact(old,'old');h.artifact(h.create('new'),'new');
 assert.deepEqual((await (await h.get('/api/workspaces/legacy/artifacts')).json()).artifacts.map((a:any)=>a.id),['legacy','old']);
 for(const id of ['',encodeURIComponent('two ideas'),'%2F','x'.repeat(101),'%E0%A4']){
  const response=await h.get(`/api/workspaces/${id}/artifacts`);assert.equal(response.status,400,id);assert.equal((await response.json()).error.code,'INVALID_WORKSPACE');
 }
});

test('stage exports have fixed stage filenames while existing document filenames stay compatible',async t=>{
 const h=await harness(t);const c=h.create('export');
 for(const [kind,stage,filename] of [['stage_draft','idea','dukkan-idea-draft.html'],['stage_draft','validate','dukkan-validation-draft.html'],['stage_draft','plan','dukkan-plan-draft.html'],['application_worksheet','','dikan-business-setup-worksheet.html'],['enquiry','','dikan-enquiry-draft.html']]){
  const a=h.artifact(c,kind+stage,{kind,stage});const response=await h.get(`/api/chat/artifacts/${a.id}/export?hash=${a.hash}`);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-disposition'),`attachment; filename="${filename}"`);await response.text();
 }
 const invalid=h.artifact(c,'invalid',{stage:'__proto__'});const response=await h.get(`/api/chat/artifacts/${invalid.id}/export?hash=${invalid.hash}`);assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_STAGE');
});
