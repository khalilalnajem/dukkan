import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,relative,dirname,sep} from 'node:path';
import {Store} from './store.ts';

export type Snapshot={records:{kind:string;id:string;business:string;value:string}[];receipts:{key:string;hash:string;business:string;response:string}[];files:{path:string;hash:string;bytes:number}[]};
export type Lease={revision:number;snapshot:Snapshot};
export interface CloudPersistence{
 ready():Promise<void>;
 authenticate(token:string):Promise<string>;
 lease(owner:string,holder:string):Promise<Lease>;
 commit(owner:string,holder:string,revision:number,snapshot:Snapshot,request:string):Promise<number>;
 release(owner:string,holder:string):Promise<void>;
 renew(owner:string,holder:string):Promise<boolean>;
 upload(owner:string,hash:string,bytes:Buffer):Promise<void>;
 download(owner:string,hash:string):Promise<Buffer>;
}
export const digest=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
export function privateFile(root:string,path:string){
 if(!/^cases\/[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+$/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Invalid private file path');
 const target=resolve(root,path),rel=relative(root,target);
 if(rel.startsWith('..')||rel===root||rel.startsWith(sep))throw new Error('Private file escaped account');
 return target;
}
export function capture(store:Store):{snapshot:Snapshot;blobs:Map<string,Buffer>}{
 const records=store.db.prepare('SELECT kind,id,business,value FROM records ORDER BY rowid').all() as Snapshot['records'];
 for(const row of records)if(row.kind==='document'){
  const value=JSON.parse(row.value),path=relative(store.root,value.storageKey).split(sep).join('/');privateFile(store.root,path);
  value.storageKey=path;row.value=JSON.stringify(value);
 }
 const receipts=store.db.prepare('SELECT key,hash,business,response FROM receipts ORDER BY rowid').all() as Snapshot['receipts'];
 const files:Snapshot['files']=[],blobs=new Map<string,Buffer>();let total=0;
 function walk(folder:string){
  for(const entry of readdirSync(folder,{withFileTypes:true})){
   const absolute=resolve(folder,entry.name);
   if(entry.isSymbolicLink())throw new Error('Private files must not be symbolic links');
   if(entry.isDirectory()){walk(absolute);continue;}
   if(!entry.isFile())throw new Error('Unsupported private file');
   const path=relative(store.root,absolute).split(sep).join('/');privateFile(store.root,path);
   const stat=lstatSync(absolute);total+=stat.size;
   if(stat.size>10485760||total>104857600)throw new Error('Account document storage limit reached');
   const bytes=readFileSync(absolute),hash=digest(bytes);files.push({path,hash,bytes:bytes.length});blobs.set(hash,bytes);
  }
 }
 const cases=resolve(store.root,'cases');try{if(lstatSync(cases).isSymbolicLink())throw new Error('Invalid account directory');walk(cases)}catch(e:any){if(e.code!=='ENOENT')throw e;}
 const snapshot={records,receipts,files};if(Buffer.byteLength(JSON.stringify(snapshot))>16000000)throw new Error('Account record storage limit reached');
 return {snapshot,blobs};
}
export async function restore(root:string,owner:string,snapshot:Snapshot,cloud:CloudPersistence){
 if(!snapshot||!Array.isArray(snapshot.records)||!Array.isArray(snapshot.receipts)||!Array.isArray(snapshot.files))throw new Error('Invalid durable account snapshot');
 const paths=new Set<string>();let total=0;
 for(const file of snapshot.files){
  if(!/^[a-f0-9]{64}$/.test(file.hash)||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>10485760||paths.has(file.path))throw new Error('Invalid durable file');
  total+=file.bytes;if(total>104857600)throw new Error('Account document storage limit reached');
  const target=privateFile(root,file.path);paths.add(file.path);
  const bytes=await cloud.download(owner,file.hash);
  if(bytes.length!==file.bytes||digest(bytes)!==file.hash)throw new Error('Durable document verification failed');
  mkdirSync(dirname(target),{recursive:true,mode:0o700});writeFileSync(target,bytes,{mode:0o600,flag:'wx'});
 }
 const store=new Store(root);
 try{store.transaction(()=>{
  for(const row of snapshot.records){
   const value=JSON.parse(row.value);
   if(row.kind==='document'){
    if(!paths.has(value.storageKey))throw new Error('Document missing from durable storage');
    value.storageKey=privateFile(root,value.storageKey);
   }
   store.put(row.kind,row.id,row.business,value);
  }
  for(const row of snapshot.receipts)store.saveReceipt(row.key,row.hash,row.business,JSON.parse(row.response));
 });}finally{store.close();}
}

export function supabasePersistence(url:string,serviceKey:string,publishableKey:string):CloudPersistence{
 const base=new URL(url);if(base.protocol!=='https:'||base.pathname!=='/')throw new Error('Invalid Supabase service URL');
 if(!serviceKey||!publishableKey)throw new Error('Supabase credentials are required');
 async function call(path:string,init:RequestInit={},token=serviceKey,key=serviceKey){
  let last:unknown;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await fetch(base.origin+path,{...init,headers:{apikey:key,Authorization:`Bearer ${token}`,...init.headers},signal:AbortSignal.timeout(15000)});
    if(response.ok)return response;
    if(response.status===401||response.status===403)throw Object.assign(new Error('ACCOUNT_AUTH_REQUIRED'),{status:401});
    const body=await response.json().catch(()=>({}));
    if(body.code==='55P03'||body.code==='40001')throw Object.assign(new Error(body.message==='ACCOUNT_BUSY'?'ACCOUNT_BUSY':'DURABLE_CONFLICT'),{status:409});
    if(response.status<500&&response.status!==429)throw Object.assign(new Error('DURABLE_REQUEST_REJECTED'),{status:503});
    last=new Error('DURABLE_UNAVAILABLE');
   }catch(e:any){if(e.status)throw e;last=e;}
   if(attempt<2)await new Promise(r=>setTimeout(r,250*(attempt+1)));
  }
  throw Object.assign(new Error('Durable storage is unavailable. No success was acknowledged.',{cause:last}),{status:503});
 }
 const rpc=async(name:string,body:unknown)=>(await call('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
 return {
  async ready(){
   await call('/rest/v1/dukkan_backend_state?select=owner_id&limit=0');
   await call('/rest/v1/dukkan_workspaces?select=owner_id&limit=0');
   const bucket=await(await call('/storage/v1/bucket/dukkan-private')).json();
   if(bucket.public!==false)throw new Error('Document storage must be private');
  },
  async authenticate(token){
   if(!token||token.length>16000)throw Object.assign(new Error('ACCOUNT_AUTH_REQUIRED'),{status:401});
   const data=await(await call('/auth/v1/user',{},token,publishableKey)).json();
   if(!/^[a-f0-9-]{36}$/i.test(data.id))throw Object.assign(new Error('ACCOUNT_AUTH_REQUIRED'),{status:401});return data.id;
  },
  lease:(owner,holder)=>rpc('dukkan_backend_lease',{account_id:owner,holder}),
  commit:(owner,holder,revision,snapshot,request)=>rpc('dukkan_backend_commit',{account_id:owner,holder,expected_revision:revision,next_snapshot:snapshot,request_id:request}),
  async release(owner,holder){await rpc('dukkan_backend_release',{account_id:owner,holder})},
  renew:(owner,holder)=>rpc('dukkan_backend_renew',{account_id:owner,holder}),
  async upload(owner,hash,bytes){await call(`/storage/v1/object/dukkan-private/${owner}/${hash}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'true'},body:bytes as unknown as BodyInit})},
  async download(owner,hash){const result=await call(`/storage/v1/object/dukkan-private/${owner}/${hash}`);return Buffer.from(await result.arrayBuffer())},
 };
}
export class Checkpoint{
 revision:number;private previous='';private queue:Promise<void>=Promise.resolve();private uploaded=new Set<string>();
 private pending:{snapshot:Snapshot;fingerprint:string;request:string}|null=null;
 readonly owner:string;readonly holder:string;readonly store:Store;readonly cloud:CloudPersistence;
 constructor(owner:string,holder:string,store:Store,cloud:CloudPersistence,lease:Lease){this.owner=owner;this.holder=holder;this.store=store;this.cloud=cloud;this.revision=lease.revision;for(const file of lease.snapshot.files)this.uploaded.add(file.hash)}
 flush(){
  const next=this.queue.catch(()=>{}).then(async()=>{
   if(this.pending)await this.commitPending();
   const {snapshot,blobs}=capture(this.store),fingerprint=digest(JSON.stringify(snapshot));if(fingerprint===this.previous)return;
   for(const [hash,bytes] of blobs)if(!this.uploaded.has(hash)){await this.cloud.upload(this.owner,hash,bytes);this.uploaded.add(hash)}
   this.pending={snapshot,fingerprint,request:randomUUID()};await this.commitPending();
  });this.queue=next;return next;
 }
 private async commitPending(){
  const pending=this.pending!;
  const revision=await this.cloud.commit(this.owner,this.holder,this.revision,pending.snapshot,pending.request);
  if(revision!==this.revision+1)throw new Error('Durable checkpoint revision did not match');
  this.revision=revision;this.previous=pending.fingerprint;this.pending=null;
 }
}
