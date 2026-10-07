import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.ts';
import {ChatController} from '../src/chat.ts';
const draft={stage:'plan',title:'Service plan',content:'Demand is untested. Use a non-binding customer test before spending.',assumptions:['Founder hours unmeasured'],unknowns:['Actual willingness to pay'],citationIds:[]};
function harness(t:any,respond:any){const root=mkdtempSync(join(tmpdir(),'dukkan-output-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});const chat=new ChatController(store,async()=>({ok:true,provenance:[],data:{citations:[],sources:[]}}),{name:'fake',version:'fake',respond},()=>{});return {chat,store,c:chat.create({}).conversation};}
async function done(chat:any,store:any,id:string){for(let i=0;i<200&&['queued','running'].includes(store.get('chat_turn',id).status);i++)await new Promise(r=>setTimeout(r,5));return chat.turnSnapshot(id);}
test('requested saved plan retries prose-only response and requires actual persisted output',async t=>{
 let calls=0;const h=harness(t,async({messages,tools}:any)=>{calls++;assert.ok(!tools.some((x:any)=>x.function.name==='prepare_application'));if(calls===1)return {content:'{"plan":"saved"}',calls:[],usage:{}};if(calls===2){assert.match(messages.at(-1).content,/not been saved/);return {content:'',calls:[{name:'retrieve_guidance',arguments:{query:'service setup'}}],usage:{}};}return {content:'',calls:[{name:'prepare_stage_draft',arguments:draft}],usage:{}};});
 const p=h.chat.enqueue(h.c.id,{content:'Draft my plan',requestedAction:{type:'stage_draft',stage:'plan'}});const s=await done(h.chat,h.store,p.turn.id);assert.equal(s.turn.status,'completed');assert.equal(s.artifacts.length,1);assert.equal(s.artifacts[0].stage,'plan');assert.equal(calls,3);assert.deepEqual(s.case.facts,[]);
});
test('prose-only model cannot report successful requested output',async t=>{
 const h=harness(t,async()=>({content:'Your plan is saved.',calls:[],usage:{}}));const p=h.chat.enqueue(h.c.id,{content:'Draft my plan',requestedAction:{type:'stage_draft',stage:'plan'}});const s=await done(h.chat,h.store,p.turn.id);assert.equal(s.turn.status,'failed');assert.equal(s.artifacts.length,0);assert.ok(!s.messages.some((m:any)=>m.role==='assistant'&&m.content==='Your plan is saved.'));
});
test('invalid action contracts are rejected before creating a message',t=>{const h=harness(t,async()=>({content:'Hello',calls:[],usage:{}}));for(const requestedAction of [{type:'delete'},{type:'stage_draft',stage:'apply'},{type:'application_worksheet',stage:'plan'}])assert.throws(()=>h.chat.enqueue(h.c.id,{content:'Do it',requestedAction}),/supported saved output/);assert.equal(h.store.all('chat_message').length,0);});
test('explicit idea action refuses an unscored draft while legacy drafts remain supported',async t=>{
 const h=harness(t,async()=>({content:'',calls:[],usage:{}}));const c=h.store.get('case',h.c.caseId);const turn={id:'direct-test',conversationId:h.c.id,caseId:h.c.caseId,businessRevision:c.businessRevision,factsHash:c.factsHash,requestedAction:{type:'stage_draft',stage:'idea'},results:{retrieve_guidance:{}},events:[]};h.store.put('chat_turn',turn.id,c.businessId,turn);await assert.rejects(h.chat.tool(turn,'prepare_stage_draft',{...draft,stage:'idea'},new AbortController().signal,[]),/critical idea review/);assert.equal(h.store.all('chat_artifact').length,0);
});
test('rejected native tool output is retried within the same bounded output contract',async t=>{
 let calls=0;const h=harness(t,async()=>{calls++;if(calls===1)throw Object.assign(new Error('Provider selected an unavailable tool'),{code:'TOOL_DENIED'});return {content:'',calls:[calls===2?{name:'retrieve_guidance',arguments:{query:'Kuwait service'}}:{name:'prepare_stage_draft',arguments:draft}],usage:{}};});const p=h.chat.enqueue(h.c.id,{content:'Save a plan',requestedAction:{type:'stage_draft',stage:'plan'}});const s=await done(h.chat,h.store,p.turn.id);assert.equal(s.turn.status,'completed');assert.equal(s.artifacts.length,1);assert.equal(calls,3);assert.equal(s.turn.events.filter((e:any)=>e.name==='model_output'&&e.type==='tool_failed').length,1);
});
test('wrong-stage tool calls cannot save an output under a different action',async t=>{
 let calls=0;const h=harness(t,async()=>{calls++;return {content:'',calls:[calls===1?{name:'retrieve_guidance',arguments:{query:'Kuwait service'}}:{name:'prepare_stage_draft',arguments:{...draft,stage:calls===2?'idea':'plan'}}],usage:{}};});const p=h.chat.enqueue(h.c.id,{content:'Save a plan',requestedAction:{type:'stage_draft',stage:'plan'}});const s=await done(h.chat,h.store,p.turn.id);assert.equal(s.turn.status,'completed');assert.equal(s.artifacts.length,1);assert.equal(s.artifacts[0].stage,'plan');assert.ok(s.turn.events.some((e:any)=>e.error?.code==='WRONG_STAGE'));
});

test('a conversational update finishes as an approval card without extra draft work or fact mutation',async t=>{
 let calls=0;const h=harness(t,async()=>{calls++;return {content:'',calls:[{name:'propose_workspace_update',arguments:{kind:'brief',summary:'A proposed idea',values:{idea:'A design service'}}},{name:'prepare_stage_draft',arguments:{invalid:true}}],usage:{}};});
 const p=h.chat.enqueue(h.c.id,{content:'Help shape my idea',workspaceContext:{updatedAt:'v1',hypotheses:[]}});const s=await done(h.chat,h.store,p.turn.id);
 assert.equal(s.turn.status,'completed');assert.equal(calls,1);assert.equal(s.artifacts.length,0);assert.deepEqual(s.case.facts,[]);assert.equal(s.messages.find((m:any)=>m.role==='assistant').actions[0].type,'workspace_update');
});
test('a model cannot invent an observed result or strip its simulation label',async t=>{
 for(const result of ['Three customers paid','two interested']){
  const h=harness(t,async()=>({content:'',calls:[{name:'propose_workspace_update',arguments:{kind:'test_result',summary:'Result',values:{hypothesisId:'h',result}}}],usage:{}}));
  const p=h.chat.enqueue(h.c.id,{content:'SIMULATED: two interested',workspaceContext:{updatedAt:'v1',hypotheses:[{id:'h',test:{result:''}}]}});const s=await done(h.chat,h.store,p.turn.id);assert.equal(s.turn.status,'failed');assert.ok(s.messages.filter((m:any)=>m.role==='assistant').every((m:any)=>!m.actions.some((a:any)=>a.type==='workspace_update')));
 }
});
test('conversational proposal retries malformed currency strings without asking for a form',async t=>{
 let calls=0;const h=harness(t,async()=>({content:'',calls:[{name:'propose_workspace_update',arguments:{kind:'costs',summary:'Planning assumptions',values:{price:++calls===1?'KWD 60':'60'}}}],usage:{}}));
 const p=h.chat.enqueue(h.c.id,{content:'My price would be KWD 60',workspaceContext:{updatedAt:'v1',hypotheses:[]}});const s=await done(h.chat,h.store,p.turn.id);assert.equal(s.turn.status,'completed');assert.equal(calls,2);assert.equal(s.messages.find((m:any)=>m.role==='assistant').actions[0].payload.values.price,'60');
});
test('natural conversation cannot promise an approval card without invoking its tool',async t=>{
 let calls=0;const h=harness(t,async()=>++calls===1?{content:'Review the suggested update below. Choose Save to my idea to keep it.',calls:[],usage:{}}:{content:'',calls:[{name:'propose_workspace_update',arguments:{kind:'costs',summary:'Costs',values:{price:'60'}}}],usage:{}});
 const p=h.chat.enqueue(h.c.id,{content:'Offer my costs for me to save',workspaceContext:{updatedAt:'v1',hypotheses:[]}});const s=await done(h.chat,h.store,p.turn.id);assert.equal(s.turn.status,'completed');assert.equal(calls,2);assert.equal(s.messages.find((m:any)=>m.role==='assistant').actions.length,1);
});
