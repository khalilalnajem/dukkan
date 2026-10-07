import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blank,newHypothesis,recordDecision,workspaceSchema,type Evidence} from '../src/lib/workspace.ts'
import {evidenceOrigin,evidenceSummary,evidenceNeedsReview,researchPack,setupReviewStatus} from '../src/lib/research.ts'
const note=(id:string,extra:Partial<Evidence>={}):Evidence=>({id,hypothesisId:'h',kind:'Customer conversation',text:'Asked for another sample',source:'Interview 01',date:'2026-09-25',signal:'Supports',limitation:'Small convenience sample',...extra})
test('public, simulated and unclassified records do not inflate direct customer evidence',()=>{
 const notes=[note('a',{origin:'real'}),note('b',{origin:'real',text:'SIMULATED: asked for a sample'}),note('c',{kind:'Published source',origin:'real'}),note('d')]
 assert.equal(evidenceOrigin(notes[1]),'simulated')
 assert.deepEqual(evidenceSummary(notes),{direct:1,supports:1,challenges:0,public:1,simulated:1,unclassified:1})
})
test('origin survives migration and a decision captures the evidence at the time',()=>{
 const h={...newHypothesis('A claim'),id:'h'},w={...blank(),hypotheses:[h],evidence:[note('a',{origin:'real'})]}
 const saved=workspaceSchema.parse(JSON.parse(JSON.stringify(recordDecision(w,h,'Keep testing','Need more evidence'))))
 assert.equal(saved.decisions[0].evidence[0].origin,'real')
 assert.equal(evidenceNeedsReview(saved,h),false)
 const changed={...saved,evidence:[note('a',{origin:'simulated'})]}
 assert.equal(evidenceNeedsReview(changed,h),true)
 assert.equal(evidenceNeedsReview({...saved,evidence:[]},h),true)
 assert.equal(saved.decisions[0].evidence[0].origin,'real')
})
test('requirements need a source, note and past check date; old checks request review',()=>{
 const item={id:'activity',done:true,note:'Check applicability',source:'https://example.gov.kw/',date:'2026-09-24'}
 assert.equal(setupReviewStatus(item,'2026-09-25'),'recorded')
 assert.equal(setupReviewStatus({...item,source:'javascript:alert(1)'},'2026-09-25'),'incomplete')
 assert.equal(setupReviewStatus({...item,date:'2026-09-26'},'2026-09-25'),'incomplete')
 assert.equal(setupReviewStatus({...item,date:'2025-01-01'},'2026-09-25'),'recheck')
 assert.equal(setupReviewStatus({...item,done:false},'2026-09-25'),'unchecked')
})
test('research pack uses the saved audience and threshold without claiming recruitment',()=>{
 const w=blank(),h=newHypothesis('Will cafe owners request a sample?')
 h.test.audience='Five cafe owners';h.test.rule='Three request a follow-up'
 const pack=researchPack(w,h)
 assert.match(pack,/Five cafe owners/);assert.match(pack,/Three request a follow-up/);assert.match(pack,/No participants have been contacted/)
})
