import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blank,newHypothesis} from '../src/lib/workspace.ts'
import {applyConversationProposal} from '../src/lib/conversation-flow.ts'
test('chat proposals update only reviewed fields and preserve other business records',()=>{
 const w=blank();const next=applyConversationProposal(w,{kind:'brief',summary:'Updated brief',expectedUpdatedAt:w.updatedAt,values:{idea:'A bilingual design service',customer:'Small shops'}})
 assert.equal(next.brief.idea,'A bilingual design service');assert.equal(next.brief.location,'Kuwait');assert.deepEqual(next.costs,w.costs);assert.equal(w.brief.idea,'')
})
test('stale or unexpected chat updates do not apply',()=>{
 const w=blank();assert.throws(()=>applyConversationProposal(w,{kind:'costs',summary:'Costs',expectedUpdatedAt:'old',values:{price:'60'}}),/changed/)
 assert.throws(()=>applyConversationProposal(w,{kind:'costs',summary:'Costs',expectedUpdatedAt:w.updatedAt,values:{confirmed:true}}))
})
test('reported results preserve simulation and decisions require a saved result',()=>{
 const w=blank(),h=newHypothesis('Demand');w.hypotheses=[h]
 assert.throws(()=>applyConversationProposal(w,{kind:'decision',summary:'Choose',expectedUpdatedAt:w.updatedAt,values:{hypothesisId:h.id,outcome:'Keep testing',reason:'More data needed'}}),/actually happened/)
 const result=applyConversationProposal(w,{kind:'test_result',summary:'Result',expectedUpdatedAt:w.updatedAt,values:{hypothesisId:h.id,result:'SIMULATED: two of five interested'}})
 const next=applyConversationProposal(result,{kind:'decision',summary:'Choose',expectedUpdatedAt:result.updatedAt,values:{hypothesisId:h.id,outcome:'Keep testing',reason:'Simulated result is not evidence'}})
 assert.equal(next.decisions.length,1);assert.match(next.hypotheses[0].test.result,/SIMULATED/)
})
