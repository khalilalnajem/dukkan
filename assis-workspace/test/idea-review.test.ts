import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ideaReadiness} from '../src/lib/idea-review.ts'
import {parseDraftSections} from '../src/lib/draft-sections.ts'
import {adoptProposedTest,blank,exportPlanWithReviews,ideaReviewPriority,recordDecision,recordIdeaReviewChoice,newHypothesis,saveTestPlan,workspaceSchema} from '../src/lib/workspace.ts'

test('draft parser turns labelled and headed blocks into readable sections',()=>{
 const sections=parseDraftSections('**Idea:** Pearl Studio for founders in Kuwait.\n\n## Risks\nCustomer need is unknown.\n\n**Next step:** Speak to five founders.')
 assert.deepEqual(sections.map(item=>item.heading),['Idea','Risks','Next step'])
 assert.equal(sections[0].lines[0],'Pearl Studio for founders in Kuwait.')
 assert.equal(sections[1].lines[0],'Customer need is unknown.')
})

test('evidence readiness is five bounded dimensions, not a success probability',()=>{
 const keys=['customer_need','differentiation','economics','feasibility','evidence'] as const
 const review={dimensions:keys.map(key=>({key,score:2,reason:'Indirect input',evidenceNeeded:'Direct observation'})),criticalRisks:[],options:[],recommendation:'test' as const,rationale:'Test demand first'}
 assert.deepEqual(ideaReadiness(review),{complete:true,score:10,maximum:20})
 assert.equal(ideaReadiness({...review,dimensions:review.dimensions.slice(0,4)}).complete,false)
})

test('a founder choice and an adopted test retain draft provenance without inventing results',()=>{
 const original=blank()
 const reviewed=recordIdeaReviewChoice(original,{artifactId:'idea-draft-1',conversationId:'chat-1',choice:'revise',reason:'The offer is too broad.',selectedOption:'A smaller service',reviewSummary:'Demand is unknown.',customOption:{title:'Starter package',kind:'feature',tradeoff:'Less revenue per customer'}})
 assert.equal(reviewed.ideaReviewDecisions[0].customOption?.title,'Starter package')
 assert.equal(reviewed.nextAction.task,'Revise the business idea')
 const changed=recordIdeaReviewChoice(reviewed,{artifactId:'idea-draft-1',conversationId:'chat-1',choice:'test',reason:'A smaller offer can be checked cheaply.',selectedOption:'A smaller service',reviewSummary:'Demand is unknown.',customOption:{title:'Starter package',kind:'feature',tradeoff:'Less revenue per customer'}})
 assert.equal(changed.ideaReviewDecisions.length,2)
 assert.equal(changed.ideaReviewDecisions[0].choice,'revise')
 assert.equal(changed.ideaReviewDecisions[1].choice,'test')
 assert.equal(changed.ideaReviewDecisions[1].customOption?.tradeoff,'Less revenue per customer')
 assert.match(exportPlanWithReviews(changed),/Founder option \(feature\): Starter package/)
 const source={artifactId:'test-draft-1',conversationId:'chat-1',title:'Customer test'}
 const proposal={hypothesis:'Founders will book a paid identity audit',method:'Ask five recent founders',audience:'Recent Kuwait founders',decisionRule:'At least three request a follow-up'}
 const saved=adoptProposedTest(changed,proposal,source)
 const testPlan=saved.hypotheses.at(-1)!
 assert.equal(testPlan.test.result,'')
 assert.equal(testPlan.test.provenance?.artifactId,'test-draft-1')
 assert.equal(saved.savedTests.at(-1)?.hypothesisId,testPlan.id)
 assert.match(exportPlanWithReviews(saved),/Test-plan draft origins/)
 assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(saved))),saved)
 assert.throws(()=>adoptProposedTest(saved,proposal,source),/already has a saved test/)
 assert.equal(original.hypotheses.length,0)
})

test('a newer idea decision supersedes an older completed validation without deleting it',()=>{
 const old='2026-09-24T08:00:00.000Z',newer='2026-09-24T08:01:00.000Z'
 const choice={id:'review-2',artifactId:'idea-1',conversationId:'chat-1',date:newer,choice:'revise' as const,reason:'The customer is too broad.',selectedOption:'',reviewSummary:''}
 const context={hasReview:true,choice,draftAt:old,testAt:old,validationDecisionAt:old}
 assert.equal(ideaReviewPriority(context),'revise')
 assert.equal(ideaReviewPriority({...context,choice:{...choice,choice:'park'}}),'park')
 assert.equal(ideaReviewPriority({...context,testAt:'2026-09-24T08:02:00.000Z'}),null)
 assert.equal(ideaReviewPriority({...context,choice:undefined,draftAt:newer}),'reviewIdea')
 const base=blank();const proposal={hypothesis:'Will customers pay?',method:'Interview',audience:'Five people',decisionRule:'Three say yes'}
 const withTest=adoptProposedTest(base,proposal,{artifactId:'draft-1',conversationId:'chat-1',title:'Test draft'})
 const tested=recordDecision(withTest,withTest.hypotheses[0],'Keep testing','Need stronger evidence.')
 assert.equal(tested.nextAction.task,'Design the next small test')
 assert.equal(tested.savedTests.length,1)
 assert.equal(tested.decisions.length,1)
})


test('a second test preserves the first result and decision after reload',()=>{
 const first={...newHypothesis('Will owners request a sample?'),test:{method:'Interview',audience:'Five owners',rule:'Three request a sample',result:'Two requested a sample'}}
 let w=saveTestPlan(blank(),first)
 w=recordDecision(w,first,'Keep testing','Try a narrower segment')
 const next={...newHypothesis('Will cafe owners request a sample?'),test:{method:'Show one sample',audience:'Five cafe owners',rule:'Three request a follow-up',result:''}}
 const saved=workspaceSchema.parse(JSON.parse(JSON.stringify(saveTestPlan(w,next))))
 assert.equal(saved.savedTests.length,2)
 assert.equal(saved.savedTests.at(-1)?.hypothesisId,next.id)
 assert.equal(saved.hypotheses[0].test.result,'Two requested a sample')
 assert.equal(saved.hypotheses[1].test.result,'')
 assert.equal(saved.decisions[0].hypothesisId,first.id)
 assert.equal(saved.decisions.filter(d=>d.hypothesisId===next.id).length,0)
})

test('editing an existing test keeps its identity without duplicating the test',()=>{
 const test=newHypothesis('A testable claim')
 const w=saveTestPlan(blank(),test)
 const edited=saveTestPlan(w,{...test,test:{...test.test,audience:'Five cafe owners'}})
 assert.equal(edited.hypotheses.length,1)
 assert.equal(edited.savedTests.length,1)
 assert.equal(edited.hypotheses[0].test.audience,'Five cafe owners')
})
