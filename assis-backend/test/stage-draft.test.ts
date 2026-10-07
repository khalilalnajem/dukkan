import {researchModelContext} from '../src/research-model-context.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.ts';
import {ChatController} from '../src/chat.ts';
import {buildStageDraft} from '../src/stage-draft.ts';
const args={stage:'idea',title:'<script>idea</script>',content:'A proposed shop <img src=x>',assumptions:['Demand is untested'],unknowns:['Who will buy?'],citationIds:['S1']};
const citation={sourceID:'S1',title:'Source',url:'https://example.com',limitations:['Historical']};
test('stage draft rejects invented citations and escapes generated content',()=>{
 assert.throws(()=>buildStageDraft(args,[]),/retrieved/);
 const draft=buildStageDraft(args,[citation]);assert.ok(!draft.html.includes('<script>'));assert.match(draft.html,/&lt;img/);assert.deepEqual(draft.citations,[citation]);
 assert.throws(()=>buildStageDraft({...args,stage:'licensing'},[citation]),/Choose/);
});
test('fake model saves versioned stage outputs after retrieval, leaves facts untouched and rejects field revisions',async t=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-stage-')),store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 let count=0;const chat=new ChatController(store,async()=>({ok:true,provenance:[],data:{citations:[citation],sources:[]}}),{name:'fake',version:'fake',respond:async({tools,messages})=>{if(count===2){const system=messages[0].content;assert.match(system,/untrusted_ai_draft_not_founder_fact/);assert.match(system,/A proposed shop/);assert.match(system,/Demand is untested/);assert.match(system,/Who will buy/);}const first=count++%2===0;assert.equal(tools.some((x:any)=>x.function.name==='prepare_stage_draft'),!first);return {content:'',calls:[first?{name:'retrieve_guidance',arguments:{query:'shop'}}:{name:'prepare_stage_draft',arguments:args}],usage:{}};}},()=>{});
 const c=chat.create({workspaceId:'one'}).conversation;
 for(let version=1;version<=2;version++){
  const pending=chat.enqueue(c.id,{content:version===2?'طوّر مسودة الفكرة':'Develop my business idea'});for(let i=0;i<100&&['queued','running'].includes(store.get('chat_turn',pending.turn.id).status);i++)await new Promise(r=>setTimeout(r,5));
  const snapshot=chat.turnSnapshot(pending.turn.id);assert.equal(snapshot.turn.status,'completed',JSON.stringify(snapshot.turn.error));assert.deepEqual(snapshot.case.facts,[]);if(version===2)assert.match(snapshot.messages.at(-1).content,/مسودتك جاهزة/);const a=snapshot.artifacts[0];assert.equal(a.version,version);assert.equal(a.kind,'stage_draft');assert.deepEqual(a.citations,[citation]);assert.equal(a.stage,'idea');if(version===2)assert.ok(a.supersedesArtifactId);assert.throws(()=>chat.reviseArtifact(a.id,{hash:a.hash,fields:{business_name:'New'}}),/chat/);
 }
 const other=chat.create({workspaceId:'two'}).conversation;assert.equal(chat.snapshot(other.id).artifacts.length,0);
});
test('legal drafts accept founder brief only and exclude generated context legal form',async t=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-context-')),store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});let received:any;
 const chat=new ChatController(store,async(call)=>{received=call.arguments;return {ok:true,provenance:[],data:{html:'<p>draft</p>',citations:[]}};},undefined,()=>{});
 const c=chat.create({}).conversation,caseData=store.get('case',c.caseId);const turn={id:'test-turn',conversationId:c.id,caseId:c.caseId,businessRevision:caseData.businessRevision,factsHash:caseData.factsHash,workspaceContext:{brief:{idea:'Pearl shop',offer:'Coffee'},evidence:[{text:'one-person company'}]},results:{retrieve_guidance:{}},events:[]};store.put('chat_turn',turn.id,c.caseId,turn);
 await chat.tool(turn,'prepare_application',{fields:{business_name:'Pearl shop',legal_form:'one-person company'}},new AbortController().signal,[]);
 assert.equal(received.fields.business_name,'Pearl shop');assert.ok(!received.fields.legal_form);
 await assert.rejects(chat.tool({...turn,results:{}},'prepare_stage_draft',args,new AbortController().signal,[]),/Retrieve/);
});
test('new chat receives latest same-idea drafts with provenance, excluding other ideas and deleted cases',async t=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-continuity-')),store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});const observed:any[]=[];
 const chat=new ChatController(store,async()=>({ok:true,provenance:[],data:{}}),{name:'fake',version:'fake',respond:async({messages})=>{observed.push(messages);return {content:'A proposed test, not completed validation.',calls:[],usage:{}};}},()=>{});
 const first=chat.create({workspaceId:'idea-a'}).conversation,target=chat.create({workspaceId:'idea-a'}).conversation,other=chat.create({workspaceId:'idea-b'}).conversation,missing=chat.create({workspaceId:'idea-a'}).conversation;
 const put=(conversation:any,id:string,content:string,createdAt:string)=>store.put('chat_artifact',id,conversation.caseId,{id,kind:'stage_draft',stage:'idea',conversationId:conversation.id,caseId:conversation.caseId,title:content,content,assumptions:['Untested'],unknowns:['Demand'],citations:[citation],createdAt,version:1});
 put(first,'old','Superseded concept','2026-01-01');put(first,'latest','Same idea useful draft','2026-01-02');put(other,'unrelated','Other idea secret','2026-01-03');put(missing,'orphan','Deleted case secret','2026-01-04');store.db.prepare("DELETE FROM records WHERE kind='case' AND id=?").run(missing.caseId);
 store.put('chat_message','prior-message',first.caseId,{id:'prior-message',conversationId:first.id,role:'user',content:'Earlier private chat history',citations:[]});const firstCase=store.get('case',first.caseId);firstCase.facts=[{field:'name',value:'Other chat confirmed fact'}];store.put('case',first.caseId,first.caseId,firstCase);
 async function run(id:string){const pending=chat.enqueue(id,{content:'Propose the next test'});for(let i=0;i<100&&['queued','running'].includes(store.get('chat_turn',pending.turn.id).status);i++)await new Promise(r=>setTimeout(r,5));assert.equal(chat.turnSnapshot(pending.turn.id).turn.status,'completed');return observed.at(-1);}
 const messages=await run(target.id),system=messages[0].content;const context=JSON.parse(system.slice(system.lastIndexOf('\n')+1));assert.equal(context.generatedDrafts.drafts.length,1);assert.equal(context.generatedDrafts.drafts[0].content,'Same idea useful draft');assert.equal(context.generatedDrafts.drafts[0].conversationId,first.id);assert.deepEqual(context.confirmedCaseFacts,[]);assert.deepEqual(context.priorArtifacts,[]);assert.ok(!JSON.stringify(messages).includes('secret'));assert.ok(!JSON.stringify(messages).includes('Earlier private chat history'));assert.ok(!JSON.stringify(messages).includes('Other chat confirmed fact'));assert.match(system,/never evidence that validation occurred/);
 const legacy=chat.create({}).conversation;delete legacy.workspaceId;store.put('conversation',legacy.id,legacy.caseId,legacy);put(legacy,'legacy-source','Legacy draft','2026-01-01');const legacyTarget=chat.create({workspaceId:'legacy'}).conversation;const legacyMessages=await run(legacyTarget.id);assert.match(legacyMessages[0].content,/Legacy draft/);assert.ok(!legacyMessages[0].content.includes('Same idea useful draft'));
});

test('four Arabic research projections fit below 60000 bytes without repeating full phase maps',()=>{
 const source={id:'S1',title:'دراسة السوق',passage:'بيانات السوق والعملاء '.repeat(1000),limitations:['هذه نتائج مسح ولا تثبت الطلب '.repeat(100)],dataPeriod:'2026',structuredData:{authority:'إحصاءات رسمية',rows:[{value:123,unit:'أشخاص'}]}};
 const raw={query:'بحث عن السوق',sources:[source,source,source],citations:[citation,citation,citation],phaseGuidance:{phases:{ideation:{steps:['x'.repeat(50000)]}}},caveats:['قيود الدراسة']};
 const projection=researchModelContext(raw);assert.ok(Buffer.byteLength(JSON.stringify(Array(4).fill(projection)))<60000);assert.equal(projection.evidence.length,3);assert.equal(projection.citations[0].sourceID,'S1');assert.ok(projection.evidence[0].limitations[0]);assert.equal(projection.evidence[0].excerptTruncated,true);assert.ok(!JSON.stringify(projection).includes('xxxxx'));assert.equal(raw.sources[0].passage,source.passage);
 const targeted=researchModelContext({...raw,phaseGuidance:{decision:'Which customer?',output:['Test plan'],gate:'Not validated demand',steps:['Interview customers']}});assert.equal(targeted.phaseGuidance.gate,'Not validated demand');
});

test('structured critical review and proposed test survive saving and affect escaped HTML',()=>{
 const proposedTest={hypothesis:'Owners need <b>bilingual</b> posts',method:'Show a sample',audience:'12 café owners',decisionRule:'Five request a follow-up; this is directional only'};
 const ideaReview={dimensions:['customer_need','differentiation','economics','feasibility','evidence'].map(key=>({key,score:1,reason:'Unverified <script>claim</script>',evidenceNeeded:'Interview results'})),criticalRisks:['No customer evidence'],options:[{title:'<img src=x>Arabic templates',kind:'feature',benefit:'Faster production',tradeoff:'Less customisation',test:'Compare owner responses'}],recommendation:'revise',rationale:'Narrow the customer before testing'};
 const draft=buildStageDraft({...args,proposedTest,ideaReview},[citation]);
 assert.deepEqual(draft.proposedTest,proposedTest);assert.deepEqual(draft.ideaReview,ideaReview);
 assert.match(draft.html,/Evidence readiness: 5\/20/);assert.match(draft.html,/not a success probability/);assert.match(draft.html,/&lt;b&gt;bilingual/);assert.ok(!draft.html.includes('<script>'));assert.ok(!draft.html.includes('<img'));
 assert.notEqual(buildStageDraft({...args,proposedTest:{...proposedTest,decisionRule:'Three request a follow-up'},ideaReview},[citation]).html,draft.html);
 assert.notEqual(buildStageDraft({...args,proposedTest,ideaReview:{...ideaReview,rationale:'Park pending evidence'}},[citation]).html,draft.html);
 const legacy=buildStageDraft(args,[citation]);assert.ok(!Object.hasOwn(legacy,'ideaReview'));assert.ok(!Object.hasOwn(legacy,'proposedTest'));
 const invalidReviews=[null,{...ideaReview,dimensions:ideaReview.dimensions.slice(1)},{...ideaReview,dimensions:ideaReview.dimensions.map(d=>({...d,key:'evidence'}))},{...ideaReview,dimensions:ideaReview.dimensions.map(d=>({...d,key:'unknown'}))},...[-1,5,1.5,'3',NaN].map(score=>({...ideaReview,dimensions:ideaReview.dimensions.map(d=>({...d,score}))})),{...ideaReview,recommendation:'validated'},{...ideaReview,rationale:' '},{...ideaReview,options:[{...ideaReview.options[0],test:''}]},{...ideaReview,criticalRisks:['x'.repeat(2001)]},{...ideaReview,options:Array(13).fill(ideaReview.options[0])},{...ideaReview,successProbability:90}];
 for(const invalid of invalidReviews)assert.throws(()=>buildStageDraft({...args,ideaReview:invalid},[citation]),/must|requires|Choose/);
 for(const invalid of [null,{}, {...proposedTest,method:' '},{...proposedTest,audience:'x'.repeat(2001)},{...proposedTest,validated:true}])assert.throws(()=>buildStageDraft({...args,proposedTest:invalid},[citation]),/must/);
});
