import {createServer,type IncomingMessage} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createApp} from './server.ts';
import {Checkpoint,restore,supabasePersistence,type CloudPersistence} from './cloud-persistence.ts';
import {openrouterConfig} from './openrouter.ts';

type App=Awaited<ReturnType<typeof createApp>>;
type Runtime={owner:string;holder:string;root:string;app:App;origin:string;checkpoint:Checkpoint;timer:NodeJS.Timeout;lastUsed:number;unavailable:boolean;closing:boolean;requests:number};
const failure=(message:string,status=503)=>Object.assign(new Error(message),{status});

export async function createCloudServer(options:{cloud:CloudPersistence;origin:string;appOptions?:Parameters<typeof createApp>[0];maxAccounts?:number}){
 await options.cloud.ready();
 const origin=new URL(options.origin).origin;
 if(origin!==options.origin)throw new Error('Use one exact frontend origin');
 const runtimes=new Map<string,Promise<Runtime>>();let closed=false,inFlight=0;
 const rates=new Map<string,{since:number;count:number;uploads:number}>();
 async function closeRuntime(runtime:Runtime,save=true){
  if(runtime.closing)return;runtime.closing=true;clearInterval(runtime.timer);runtime.app.chat.closed=true;
  for(const c of runtime.app.store.all('case')){runtime.app.controller.cancelBusiness(c.businessId);runtime.app.chat.cancelBusiness(c.businessId)}
  const deadline=Date.now()+5000;
  while((runtime.app.chat.active.size||runtime.app.controller.active.size)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
  let saved=false;
  try{if(save){await runtime.checkpoint.flush();saved=true}}catch{/* Keep the cloud lease until it expires if final checkpoint fails. */}
  await new Promise<void>(done=>runtime.app.server.close(()=>done()));
  if(saved)await options.cloud.release(runtime.owner,runtime.holder).catch(()=>{});
  rmSync(runtime.root,{recursive:true,force:true});
 }
 async function open(owner:string):Promise<Runtime>{
  const holder=randomUUID(),lease=await options.cloud.lease(owner,holder),root=mkdtempSync(join(tmpdir(),'dukkan-account-'));
  let lost=false,runtime:Runtime|undefined,working=false;
  const timer=setInterval(()=>{
   if(working)return;working=true;
   void (async()=>{
    if(!await options.cloud.renew(owner,holder)){lost=true;if(runtime)runtime.unavailable=true;return}
    if(runtime&&!runtime.closing){await runtime.checkpoint.flush();runtime.unavailable=false}
   })().catch(()=>{if(runtime)runtime.unavailable=true}).finally(()=>{working=false});
  },30000);timer.unref();
  try{
   await restore(root,owner,lease.snapshot,options.cloud);
   if(lost)throw failure('Account ownership changed. Try again.',409);
   const app=await createApp({...options.appOptions,privateRoot:root,expireCases:false,retainDocuments:true});
   await new Promise<void>((done,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',()=>{app.server.off('error',reject);done()})});
   const address=app.server.address();if(!address||typeof address==='string')throw new Error('Private runtime failed');
   const checkpoint=new Checkpoint(owner,holder,app.store,options.cloud,lease);
   runtime={owner,holder,root,app,origin:`http://127.0.0.1:${address.port}`,checkpoint,timer,lastUsed:Date.now(),unavailable:false,closing:false,requests:0};
   await checkpoint.flush();return runtime;
  }catch(e){clearInterval(timer);if(runtime)await closeRuntime(runtime,false);else rmSync(root,{recursive:true,force:true});await options.cloud.release(owner,holder).catch(()=>{});throw e}
 }
 async function getRuntime(owner:string){
  let pending=runtimes.get(owner);
  if(!pending){
   if(runtimes.size>=(options.maxAccounts||8))throw failure('The service is busy. Retry shortly.',503);
   pending=open(owner);runtimes.set(owner,pending);
   pending.catch(()=>{if(runtimes.get(owner)===pending)runtimes.delete(owner)});
  }
  const runtime=await pending;
  if(runtime.closing)throw failure('Your account is reconnecting. Retry shortly.');
  if(!await options.cloud.renew(owner,runtime.holder)){
   runtime.unavailable=true;
   await closeRuntime(runtime,false);if(runtimes.get(owner)===pending)runtimes.delete(owner);
   throw failure('Account ownership changed. Retry to load the current saved records.',409);
  }
  if(runtime.unavailable){
   await runtime.checkpoint.flush();runtime.unavailable=false;
  }
  runtime.lastUsed=Date.now();return runtime;
 }
 const sweep=setInterval(()=>{
  for(const [owner,rate] of rates)if(Date.now()-rate.since>60000)rates.delete(owner);
  for(const [owner,pending] of runtimes)void pending.then(async runtime=>{
   if(!runtime.requests&&Date.now()-runtime.lastUsed>300000&&!runtime.app.chat.active.size&&!runtime.app.controller.active.size){
    // Remove only after marking closing so a concurrent request cannot reuse it.
    const closing=closeRuntime(runtime);await closing;if(runtimes.get(owner)===pending)runtimes.delete(owner);
   }
  }).catch(()=>{});
 },30000);sweep.unref();
 async function readBody(req:IncomingMessage){const chunks:Buffer[]=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>16*1024*1024)throw failure('Upload one PDF of up to 10 MB at a time.',413);chunks.push(chunk)}return chunks.length?Buffer.concat(chunks):undefined}
 const server=createServer(async(req,res)=>{
  const send=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'");
  let runtime:Runtime|undefined,counted=false;
  try{
   if(closed)throw failure('Service restarting. Retry shortly.');
   const url=new URL(req.url||'/','http://private');
   if(req.method==='GET'&&url.pathname==='/healthz'){send(200,{status:'ok',mode:'authenticated-durable-gateway'});return}
   if(req.headers.origin&&req.headers.origin!==origin)throw failure('Origin not allowed',403);
   if(req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Idempotency-Key');res.writeHead(204);res.end();return}
   if(!['GET','POST','DELETE'].includes(req.method||'')||!url.pathname.startsWith('/api/'))throw failure('Endpoint not found',404);
   if(inFlight>=24)throw failure('Service busy. Retry shortly.',429);inFlight++;counted=true;
   const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');if(!match)throw failure('Sign in required',401);
   const owner=await options.cloud.authenticate(match[1]);
   const now=Date.now(),rate=rates.get(owner);const current=rate&&now-rate.since<60000?rate:{since:now,count:0,uploads:0};
   current.count++;if(req.method==='POST'&&url.pathname.endsWith('/documents'))current.uploads++;rates.set(owner,current);
   if(current.count>300||current.uploads>6)throw failure('Too many requests. Wait a minute and retry.',429);
   const selected=await getRuntime(owner);if(selected.requests>=2)throw failure('Wait for the current requests and retry.',429);runtime=selected;runtime.requests++;
   const body=await readBody(req);
   const headers:Record<string,string>={};
   for(const name of ['content-type','idempotency-key']){const value=req.headers[name];if(typeof value==='string')headers[name]=value}
   // Only this authenticated owner's loopback runtime receives the request.
   const response=await fetch(runtime.origin+url.pathname+url.search,{method:req.method,headers,body:body as unknown as BodyInit,redirect:'error',signal:AbortSignal.timeout(60000)});
   const bytes=Buffer.from(await response.arrayBuffer());
   // Never expose a successful mutation or generated result before durable commit.
   await runtime.checkpoint.flush();
   for(const name of ['content-type','content-disposition']){const value=response.headers.get(name);if(value)res.setHeader(name,value)}
   res.writeHead(response.status);res.end(bytes);
  }catch(e:any){send(e.status||503,{error:{code:e.status===401?'ACCOUNT_AUTH_REQUIRED':e.status===409?'ACCOUNT_BUSY':'SERVICE_UNAVAILABLE',message:e.status?e.message:'Your work could not be durably saved. Retry the same action; no success has been acknowledged.'}})}
  finally{if(counted)inFlight--;if(runtime){runtime.requests--;runtime.lastUsed=Date.now()}}
 });
 server.requestTimeout=60000;server.headersTimeout=20000;
 async function close(){closed=true;clearInterval(sweep);await Promise.allSettled([...runtimes.values()].map(async pending=>closeRuntime(await pending)));await new Promise<void>(done=>server.close(()=>done()))}
 return {server,close,runtimes};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_PUBLISHABLE_KEY}=process.env;
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!SUPABASE_PUBLISHABLE_KEY)throw new Error('Durable account configuration is required');
  const cloud=supabasePersistence(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_PUBLISHABLE_KEY);
  const provider=process.env.DIKAN_PROVIDER||'openrouter';if(provider!=='openrouter')throw new Error('Configure the supported free hosted provider before deployment');
  const app=await createCloudServer({cloud,origin:process.env.DUKKAN_WEB_ORIGIN||'https://khalilalnajem.com',appOptions:{openrouter:openrouterConfig()}});
  const port=Number(process.env.PORT||process.env.ASSIS_PORT||10000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
  app.server.listen(port,process.env.ASSIS_HOST||'0.0.0.0',()=>console.log('Dukkan authenticated cloud gateway listening'));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void app.close().finally(()=>{process.exitCode=0})});
 }catch{console.error('Cloud startup refused: verify durable account and free AI configuration.');process.exitCode=1}
}
