import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudServer} from '../src/cloud-server.ts';
import {digest,privateFile,type CloudPersistence,type Lease,type Snapshot} from '../src/cloud-persistence.ts';

const empty=():Snapshot=>({records:[],receipts:[],files:[]});
function memoryCloud(){
 const states=new Map<string,Lease&{holder:string;request?:string}>(),files=new Map<string,Buffer>();
 let rejectCommit=false,dropResponse=false;
 const cloud:CloudPersistence={
  ready:async()=>{},
  authenticate:async token=>{if(!['alice','bob'].includes(token))throw Object.assign(new Error('Sign in required'),{status:401});return token},
  lease:async(owner,holder)=>{const row=states.get(owner);if(row?.holder&&row.holder!==holder)throw Object.assign(new Error('ACCOUNT_BUSY'),{status:409});const next={...(row||{revision:0,snapshot:empty()}),holder};states.set(owner,next);return structuredClone(next)},
  renew:async(owner,holder)=>states.get(owner)?.holder===holder,
  release:async(owner,holder)=>{const row=states.get(owner);if(row?.holder===holder)row.holder=''},
  commit:async(owner,holder,revision,snapshot,request)=>{
   if(rejectCommit)throw new Error('Storage offline');
   const row=states.get(owner)!;if(row.holder!==holder)throw new Error('LEASE_LOST');if(row.request===request)return row.revision;
   if(row.revision!==revision)throw new Error('BACKEND_CONFLICT');
   states.set(owner,{holder,revision:revision+1,snapshot:structuredClone(snapshot),request});
   if(dropResponse){dropResponse=false;throw new Error('Response lost')};return revision+1;
  },
  upload:async(owner,hash,bytes)=>{files.set(owner+'/'+hash,Buffer.from(bytes))},
  download:async(owner,hash)=>{const value=files.get(owner+'/'+hash);if(!value)throw new Error('Missing object');return Buffer.from(value)},
 };
 return {cloud,states,files,fail:(value:boolean)=>{rejectCommit=value},drop:()=>{dropResponse=true}};
}
async function serve(cloud:CloudPersistence){
 const app=await createCloudServer({cloud,origin:'https://dukkan.example',appOptions:{allowDeterministicTests:true}});
 await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));const address=app.server.address() as {port:number};
 const api=async(token:string,path:string,body?:unknown,key=crypto.randomUUID(),method=body===undefined?'GET':'POST')=>{
  const response=await fetch(`http://127.0.0.1:${address.port}${path}`,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':key},body:body===undefined?undefined:JSON.stringify(body)});
  const bytes=Buffer.from(await response.arrayBuffer());let data:any;try{data=JSON.parse(bytes.toString())}catch{data=null}return {status:response.status,data,bytes};
 };
 return {...app,api};
}

test('gateway authenticates and isolates identical folder/case IDs across accounts',async()=>{
 const remote=memoryCloud(),app=await serve(remote.cloud);
 try{
  assert.equal((await app.api('invalid','/api/conversations')).status,401);
  const a=await app.api('alice','/api/conversations',{title:'Alice private',workspaceId:'same'});
  assert.equal(a.status,201);
  assert.equal((await app.api('bob','/api/conversations')).data.conversations.length,0);
  assert.equal((await app.api('bob','/api/conversations/'+a.data.conversation.id)).status,404);
  assert.equal((await app.api('bob','/api/cases/'+a.data.conversation.caseId)).status,404);
  assert.equal((await app.api('alice','/api/conversations')).data.conversations[0].title,'Alice private');
 }finally{await app.close()}
});

test('acknowledged conversations, receipts and document bytes survive a fresh server',async()=>{
 const remote=memoryCloud();let app=await serve(remote.cloud);
 const requestId=crypto.randomUUID(),body={title:'Durable idea',workspaceId:'restart'};
 const bytes=Buffer.from('%PDF-1.7\nRedacted synthetic test');let conversation:any,document:any;
 try{
  const created=await app.api('alice','/api/conversations',body,requestId);assert.equal(created.status,201);conversation=created.data.conversation;
  const upload=await app.api('alice',`/api/cases/${conversation.caseId}/documents`,{expectedRevision:1,synthetic:true,files:[{name:'redacted.pdf',mime:'application/pdf',base64:bytes.toString('base64')}]});
  assert.equal(upload.status,201);document=upload.data.documents[0];assert.equal(remote.files.size,1);
 }finally{await app.close()}
 app=await serve(remote.cloud);
 try{
  assert.equal((await app.api('alice','/api/conversations',body,requestId)).data.conversation.id,conversation.id);
  const path=`/api/cases/${conversation.caseId}/documents/${document.id}?hash=${digest(bytes)}`;
  assert.deepEqual((await app.api('alice',path)).bytes,bytes);
  assert.equal((await app.api('bob',path)).status,404);
 }finally{await app.close()}
});

test('checkpoint failure returns no success and retry keeps one mutation',async()=>{
 const remote=memoryCloud(),app=await serve(remote.cloud);
 try{
  await app.api('alice','/api/conversations');remote.fail(true);
  const key=crypto.randomUUID(),body={title:'Retry safe',workspaceId:'retry'};
  assert.equal((await app.api('alice','/api/conversations',body,key)).status,503);
  remote.fail(false);
  assert.equal((await app.api('alice','/api/conversations',body,key)).status,201);
  assert.equal((await app.api('alice','/api/conversations')).data.conversations.length,1);
  remote.drop();
  assert.equal((await app.api('alice','/api/conversations',{title:'Lost acknowledgement',workspaceId:'retry'})).status,503);
  assert.equal((await app.api('alice','/api/conversations')).status,200);
  assert.equal((await app.api('alice','/api/conversations')).data.conversations.length,2);
 }finally{await app.close()}
});

test('another host cannot serve an account while its lease is held',async()=>{
 const remote=memoryCloud(),a=await serve(remote.cloud),b=await serve(remote.cloud);
 try{assert.equal((await a.api('alice','/api/conversations')).status,200);assert.equal((await b.api('alice','/api/conversations')).status,409)}
 finally{await a.close();await b.close()}
});
test('durable file paths cannot escape the owner directory',()=>{
 for(const path of ['../secret','cases/id/../../secret','/etc/passwd','cases/id//x','cases/id/./x'])assert.throws(()=>privateFile('/tmp/owner',path));
 assert.equal(privateFile('/tmp/owner','cases/id/documents/test.pdf'),'/tmp/owner/cases/id/documents/test.pdf');
});
test('a lost distributed lease rejects even an unchanged read',async()=>{
 const remote=memoryCloud(),app=await serve(remote.cloud);
 try{assert.equal((await app.api('alice','/api/conversations')).status,200);remote.states.get('alice')!.holder='new-host';assert.equal((await app.api('alice','/api/conversations')).status,409)}finally{await app.close()}
});
test('missing durable services stop startup instead of using scratch storage',async()=>{
 const remote=memoryCloud();remote.cloud.ready=async()=>{throw new Error('Storage missing')};await assert.rejects(serve(remote.cloud),/Storage missing/);
});
