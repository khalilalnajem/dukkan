import {researchModelContext} from '../src/research-model-context.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.ts';
import {ChatController} from '../src/chat.ts';
import {buildStageDraft,renderStageMarkdown,stageDraftSchema} from '../src/stage-draft.ts';
const args={stage:'idea',title:'<script>idea</script>',content:'A proposed shop <img src=x>',assumptions:['Demand is untested'],unknowns:['Who will buy?'],citationIds:['S1']};
const citation={sourceID:'S1',title:'Source',url:'https://example.com',limitations:['Historical']};
test('stage draft rejects invented citations and escapes generated content',()=>{
 assert.throws(()=>buildStageDraft(args,[]),/retrieved/);
 const draft=buildStageDraft(args,[citation]);assert.ok(!draft.html.includes('<script>'));assert.match(draft.html,/&lt;img/);assert.deepEqual(draft.citations,[citation]);
 assert.throws(()=>buildStageDraft({...args,stage:'licensing'},[citation]),/Choose/);
});
test('stage draft requires exact chunk IDs when one publication has multiple retrieved passages',()=>{
 const first={sourceID:'MK-CITRA-ICT-2019',chunkID:'MK-CITRA-ICT-2019:p6',page:6,excerpt:'ICT contributes 70.2 percent in the six-sector comparison.',title:'CITRA ICT statistics'};
 const second={sourceID:'MK-CITRA-ICT-2019',chunkID:'MK-CITRA-ICT-2019:p9',page:9,excerpt:'A different passage with a separate 2019 figure.',title:'CITRA ICT statistics'};
 const base={...args,content:'Source-backed statement.'};
 assert.throws(()=>buildStageDraft({...base,citationIds:['MK-CITRA-ICT-2019']},[first,second]),(error:any)=>error.code==='UNRETRIEVED_CITATION'&&error.message==='Choose exact retrieved chunkID; publication reference matches multiple passages');
 const firstDraft=buildStageDraft({...base,citationIds:[first.chunkID]},[first,second]);assert.deepEqual(firstDraft.citations,[first]);assert.match(firstDraft.html,/Page 6/);assert.match(firstDraft.html,/ICT contributes 70\.2 percent/);assert.ok(!firstDraft.html.includes('Page 9'));
 const secondDraft=buildStageDraft({...base,citationIds:[second.chunkID]},[first,second]);assert.deepEqual(secondDraft.citations,[second]);assert.match(secondDraft.html,/Page 9/);assert.match(secondDraft.html,/separate 2019 figure/);assert.ok(!secondDraft.html.includes('Page 6'));
 const legacy={sourceID:'LEGACY-SOURCE',title:'Legacy source',excerpt:'Unique legacy passage'};const legacyDraft=buildStageDraft({...base,citationIds:['LEGACY-SOURCE']},[legacy]);assert.deepEqual(legacyDraft.citations,[legacy]);
 const duplicates=buildStageDraft({...base,citationIds:['MK-CITRA-ICT-2019']},[first,{...first}]);assert.deepEqual(duplicates.citations,[first]);
 assert.match(stageDraftSchema.properties.citationIds.description,/exact retrieved chunkID/);
});
test('every validation draft requires a structured proposed test, including ordinary typed requests',()=>{
 const validation={...args,stage:'validate',title:'Corrected validation draft',content:'A concise narrative about the customer test.',citationIds:[]};
 assert.throws(()=>buildStageDraft(validation,[]),(error:any)=>error.code==='TEST_PROPOSAL_REQUIRED'&&/Every validation draft must include a structured proposedTest/.test(error.message));
 const proposedTest={hypothesis:'Shop owners need a fixed-scope starter kit.',method:'Show the sample and ask about current alternatives.',audience:'Independent shop owners in Kuwait',decisionRule:'Record interest and objections; this is directional, not validation.'};
 const draft=buildStageDraft({...validation,proposedTest},[]);assert.deepEqual(draft.proposedTest,proposedTest);assert.match(draft.html,/<h2>Proposed validation test<\/h2>/);assert.ok(!Object.hasOwn(draft,'ideaReview'));
 assert.match(stageDraftSchema.description,/For stage validate, always include the structured proposedTest/);assert.match(stageDraftSchema.properties.proposedTest.description,/Required for every validation-stage draft/);
});
test('stage draft renders readable Markdown and source cards without unsafe markup or JSON dumps',()=>{
 const citation={sourceID:'S1',chunkID:'S1:1-20',title:'<img src=x onerror=alert(1)>Report',url:'https://example.com/report?a=1&b=2',authority:'Public Research Office',page:4,capturedAt:'2026-09-20',publicationDate:'2025-06-01',dataPeriod:'2024',excerpt:'Evidence says <script>alert(1)</script> and **must be escaped**.',limitations:['Small sample'],localCitation:'market/text/S1.txt#L1',rawSha256:'abc123',passageSha256:'def456'};
 const content='## Idea Summary\n\n**Shopper behaviour** matters, and <img src=x onerror=alert(1)> remains text.\n\n- First point\n- Second point\n\n| Measure | Period |\n| --- | --- |\n| Spending | 2024 |';
 const draft=buildStageDraft({...args,content},[citation]);
 assert.match(draft.html,/<h3>Idea Summary<\/h3>/);assert.match(draft.html,/<strong>Shopper behaviour<\/strong>/);assert.match(draft.html,/<ul><li>First point<\/li><li>Second point<\/li><\/ul>/);assert.match(draft.html,/<table>[\s\S]*<th scope="col">Measure<\/th>[\s\S]*<td>Spending<\/td>/);
 assert.match(draft.html,/<a href="https:\/\/example\.com\/report\?a=1&amp;b=2"[^>]*>.*Report<\/a>/);assert.match(draft.html,/Public Research Office/);assert.match(draft.html,/Page 4/);assert.match(draft.html,/Published 2025-06-01/);assert.match(draft.html,/Data period 2024/);assert.match(draft.html,/Captured 2026-09-20/);assert.match(draft.html,/Evidence says &lt;script&gt;/);assert.match(draft.html,/Small sample/);assert.match(draft.html,/Source details/);assert.match(draft.html,/S1:1-20/);assert.match(draft.html,/Raw Sha256/);
 assert.ok(!draft.html.includes('<pre'));assert.ok(!draft.html.includes('"sourceID":'));assert.ok(!draft.html.includes('<img src=x'));assert.ok(!draft.html.includes('<script>'));
 const hostile=buildStageDraft({...args,content:'[unsafe](javascript:alert(1))'},[{...citation,url:'javascript:alert(1)'}]);assert.ok(!/href="javascript:/i.test(hostile.html));assert.match(hostile.html,/unsafe/);assert.ok(!hostile.html.includes('href="javascript:'));
 assert.match(renderStageMarkdown('### customer_need\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'),/<h4>customer_need<\/h4>/);
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
test('ordinary validation chat retries a missing structured test and saves only the corrected draft',async t=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-validation-repair-')),store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});let count=0;
 const incomplete={stage:'validate',title:'Customer test',content:'A concise validation proposal.',assumptions:['Shop owners need setup help'],unknowns:['Willingness to pay'],citationIds:['S1']};
 const proposedTest={hypothesis:'Shop owners need a fixed-scope starter kit.',method:'Show the sample and ask about current alternatives.',audience:'Independent shop owners in Kuwait',decisionRule:'Record interest and objections; this is directional, not validation.'};
 const chat=new ChatController(store,async()=>({ok:true,provenance:[],data:{citations:[citation],sources:[]}}),{name:'fake',version:'fake',respond:async({messages}:any)=>{
  if(count++===0)return {content:'',calls:[{name:'retrieve_guidance',arguments:{query:'customer test'}}],usage:{}};
  if(count===2)return {content:'',calls:[{name:'prepare_stage_draft',arguments:incomplete}],usage:{}};
  assert.equal(store.all('chat_artifact').length,0,'rejected validation draft must not be saved');
  const failure=messages.filter((message:any)=>message.role==='tool').at(-1);assert.equal(failure.tool_name,'prepare_stage_draft');assert.match(failure.content,/TEST_PROPOSAL_REQUIRED/);
  return {content:'',calls:[{name:'prepare_stage_draft',arguments:{...incomplete,proposedTest}}],usage:{}};
 }},()=>{});
 const conversation=chat.create({workspaceId:'ordinary-validation'}).conversation;
 const pending=chat.enqueue(conversation.id,{content:'Could you work up a customer validation draft for this idea?'});assert.equal(pending.turn.requestedAction,null);
 for(let i=0;i<200&&['queued','running'].includes(store.get('chat_turn',pending.turn.id).status);i++)await new Promise(resolve=>setTimeout(resolve,5));
 const snapshot=chat.turnSnapshot(pending.turn.id);assert.equal(snapshot.turn.status,'completed',JSON.stringify(snapshot.turn.error));assert.equal(snapshot.artifacts.length,1);assert.deepEqual(snapshot.artifacts[0].proposedTest,proposedTest);assert.match(store.get('chat_artifact',snapshot.artifacts[0].id).html,/Proposed validation test/);assert.ok(snapshot.turn.events.some((event:any)=>event.type==='tool_failed'&&event.name==='prepare_stage_draft'&&event.error?.code==='TEST_PROPOSAL_REQUIRED'));
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
 assert.match(draft.html,/Evidence readiness: 5\/20/);assert.match(draft.html,/Customer need: 1\/4/);assert.match(draft.html,/<h3>Decision rule<\/h3>/);assert.match(draft.html,/not a success probability/);assert.match(draft.html,/&lt;b&gt;bilingual/);assert.ok(!draft.html.includes('<script>'));assert.ok(!draft.html.includes('<img'));
 assert.notEqual(buildStageDraft({...args,proposedTest:{...proposedTest,decisionRule:'Three request a follow-up'},ideaReview},[citation]).html,draft.html);
 assert.notEqual(buildStageDraft({...args,proposedTest,ideaReview:{...ideaReview,rationale:'Park pending evidence'}},[citation]).html,draft.html);
 const legacy=buildStageDraft(args,[citation]);assert.ok(!Object.hasOwn(legacy,'ideaReview'));assert.ok(!Object.hasOwn(legacy,'proposedTest'));
 const invalidReviews=[null,{...ideaReview,dimensions:ideaReview.dimensions.slice(1)},{...ideaReview,dimensions:ideaReview.dimensions.map(d=>({...d,key:'evidence'}))},{...ideaReview,dimensions:ideaReview.dimensions.map(d=>({...d,key:'unknown'}))},...[-1,5,1.5,'3',NaN].map(score=>({...ideaReview,dimensions:ideaReview.dimensions.map(d=>({...d,score}))})),{...ideaReview,recommendation:'validated'},{...ideaReview,rationale:' '},{...ideaReview,options:[{...ideaReview.options[0],test:''}]},{...ideaReview,criticalRisks:['x'.repeat(2001)]},{...ideaReview,options:Array(13).fill(ideaReview.options[0])},{...ideaReview,successProbability:90}];
 for(const invalid of invalidReviews)assert.throws(()=>buildStageDraft({...args,ideaReview:invalid},[citation]),/must|requires|Choose/);
 for(const invalid of [null,{}, {...proposedTest,method:' '},{...proposedTest,audience:'x'.repeat(2001)},{...proposedTest,validated:true}])assert.throws(()=>buildStageDraft({...args,proposedTest:invalid},[citation]),/must/);
});
