import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';
import {openrouterConfig} from '../src/openrouter.ts';
const root=mkdtempSync(join(tmpdir(),'dukkan-openrouter-'));const start=Date.now();
const app=await createApp({privateRoot:root,openrouter:openrouterConfig()});
await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.server.address() as any).port}`;
async function api(path:string,data?:any){const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},...(data?{body:JSON.stringify(data)}:{})});const b=await r.json();assert.ok(r.ok,`Local HTTP ${r.status}`);return b;}
try{
 const {conversation}=await api('/api/conversations',{title:'Synthetic OpenRouter acceptance'});
 const {turn}=await api(`/api/conversations/${conversation.id}/messages`,{content:'Synthetic test: My business is Pearl Sample, a graphic design service in Kuwait. Search the collected official setup sources and prepare a business setup worksheet. Keep legal form and incorporation unknown. Do not submit anything.',executionMode:'live_agent'});
 let r:any;const end=Date.now()+180000;while(Date.now()<end){r=await api('/api/chat/turns/'+turn.id);if(!['queued','running'].includes(r.turn.status))break;await new Promise(r=>setTimeout(r,1000));}
 const events=r.turn.events.filter((e:any)=>e.type==='tool_completed').map((e:any)=>e.name);
 const receipt={at:new Date().toISOString(),status:r.turn.status,error:r.turn.error,provider:r.turn.model,events,modelTrace:r.turn.modelTrace,artifacts:r.artifacts.map((a:any)=>({kind:a.kind,fields:a.fields,citations:a.citations?.length})),ms:Date.now()-start};
 writeFileSync(new URL('./evidence/openrouter-live.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
 assert.notEqual(r.turn.status,'failed');assert.ok(events.includes('retrieve_guidance'));assert.ok(r.artifacts.some((a:any)=>a.kind==='application_worksheet'));console.log(JSON.stringify({passed:true,...receipt}));
}finally{await new Promise<void>(r=>app.server.close(()=>r()));rmSync(root,{recursive:true,force:true});}
