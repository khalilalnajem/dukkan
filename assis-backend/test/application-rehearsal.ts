import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const conversationId='ca37c58b-0a4a-40d8-8a0f-8d0f47a502de';
const base='http://127.0.0.1:8789';const evidence=new URL('./evidence/chat-live-application.json',import.meta.url);
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
async function api(path:string,body?:any){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});const d=r.headers.get('content-type')?.includes('json')?await r.json():await r.text();assert.ok(r.ok,JSON.stringify(d));return d;}
const trace:any={synthetic:true,conversationId,startedAt:new Date().toISOString(),request:'Start preparing the business setup application for the studio we discussed. Fill in the business name and activity I already gave you. Keep unknown legal form and incorporation details unknown. Save the business setup worksheet for my review; do not send or file anything.'};
const save=()=>writeFileSync(evidence,JSON.stringify(trace,null,2)+'\n');
try{
 const health=await api('/api/health');assert.equal(health.chat.activeTurns,0);assert.equal(health.activeJobs,0);
 const old=await api('/api/chat/artifacts/25572ec6-4951-44a9-ab08-df2dc02d033c/draft');trace.previousEnquiryHash=hash(old);
 trace.previousStoreHash=hash(readFileSync(new URL('../.private/assis.sqlite',import.meta.url)));
 const start=await api(`/api/conversations/${conversationId}/messages`,{content:trace.request,executionMode:'live_agent'});trace.turnId=start.turn.id;save();console.log(JSON.stringify({turnId:trace.turnId,conversationId}));
 const begun=Date.now();let count=-1;while(Date.now()-begun<620000){trace.result=await api(`/api/chat/turns/${trace.turnId}`);trace.elapsedMs=Date.now()-begun;save();if(trace.result.turn.events.length!==count){count=trace.result.turn.events.length;console.log(JSON.stringify({status:trace.result.turn.status,events:trace.result.turn.events.map((e:any)=>({type:e.type,name:e.name}))}));}if(!['queued','running'].includes(trace.result.turn.status))break;await new Promise(r=>setTimeout(r,1000));}
 const {turn,messages,artifacts,case:c}=trace.result;assert.equal(turn.status,'completed',JSON.stringify(turn.error));assert.equal(turn.executionMode,'live_agent');assert.ok(turn.modelTrace.length>0);assert.ok(turn.events.some((e:any)=>e.type==='tool_completed'&&e.name==='prepare_application'));assert.ok(!turn.events.some((e:any)=>e.name==='prepare_enquiry'));assert.equal(artifacts.length,1);
 const a=artifacts[0];assert.equal(a.kind,'application_worksheet');assert.equal(a.fields.business_name,'Pearl North');assert.match(a.fields.activity_description,/graphic design/i);assert.equal(a.fields.legal_form,null);assert.equal(a.fields.incorporation_status,null);assert.ok(!a.missingFields.includes('business_name'));assert.ok(!a.missingFields.includes('activity_description'));assert.ok(a.questions.length>0&&a.questions.length<=3);assert.ok(a.worksheet.sections.length>0);assert.deepEqual(c.facts,[]);assert.ok(a.draftInputs.some((d:any)=>d.field==='business_name'&&d.messageId));assert.equal(a.fieldOrigins.business_name,'unconfirmed_draft_input');assert.ok(a.changedFields.some((d:any)=>d.field==='business_name'));
 const html=await api(a.previewUrl);assert.equal(hash(html),a.hash);assert.match(html,/Business setup worksheet/);assert.match(html,/not an official application/i);assert.doesNotMatch(html,/Madar Design Studio|Enquiry as stated by the user|Start preparing the business setup application/);assert.ok(messages.at(-1).content.length<240);assert.match(messages.at(-1).content,/Open the saved file/);
 assert.equal(hash(await api('/api/chat/artifacts/25572ec6-4951-44a9-ab08-df2dc02d033c/draft')),trace.previousEnquiryHash);assert.equal(hash(readFileSync(new URL('../.private/assis.sqlite',import.meta.url))),trace.previousStoreHash);
 trace.artifact=a;trace.previewHash=hash(html);trace.previousEnquiryUnchanged=true;trace.previousStoreUnchanged=true;trace.passed=true;trace.completedAt=new Date().toISOString();save();
 // Arguments remain in private SQLite (not public API or exported HTML).
 const db=new DatabaseSync(new URL('../.private-chat-demo/assis.sqlite',import.meta.url),{readOnly:true});const stored=JSON.parse((db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get('chat_turn',trace.turnId) as any).value);trace.privateTraceLocation={store:'.private-chat-demo/assis.sqlite',kind:'chat_turn',id:trace.turnId,modelResponses:stored.modelTrace.length};db.close();save();
 console.log(JSON.stringify({passed:true,conversationId,artifactId:a.id,hash:a.hash,preview:base+a.previewUrl,elapsedMs:trace.elapsedMs,evidence:evidence.pathname}));
}catch(e:any){trace.passed=false;trace.error=e.message;save();console.error(e);process.exitCode=1;}
