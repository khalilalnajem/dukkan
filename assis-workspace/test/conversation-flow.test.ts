import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blank,newHypothesis} from '../src/lib/workspace.ts'
import {applyConversationProposal,conversationMatchesScope,resolveConversationRequest,requestScopeMatches,reviewChoiceCanSave,shouldHandleConversationRequest} from '../src/lib/conversation-flow.ts'
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
test('reviewed result proposals retain the previously saved observation',()=>{
 const w=blank(),h=newHypothesis('Demand');h.test.result='REAL: two of five customers placed a refundable deposit.';w.hypotheses=[h]
 const next=applyConversationProposal(w,{kind:'test_result',summary:'Updated result',expectedUpdatedAt:w.updatedAt,values:{hypothesisId:h.id,result:'REAL: one customer requested a later follow-up.'}})
 assert.match(next.hypotheses[0].test.result,/two of five customers placed a refundable deposit/)
 assert.match(next.hypotheses[0].test.result,/Reviewed update/)
 assert.match(next.hypotheses[0].test.result,/one customer requested a later follow-up/)
})
test('conversation restoration is limited to the selected idea scope',()=>{
 const conversations=[{id:'legacy-chat',workspaceId:'legacy'},{id:'idea-chat',workspaceId:'idea-a'},{id:'other-chat',workspaceId:'idea-b'}] as any
 assert.equal(conversationMatchesScope(conversations[0],'legacy'),true)
 assert.equal(conversationMatchesScope({},'legacy'),true)
 assert.equal(resolveConversationRequest('idea-chat',conversations,'idea-a')?.id,'idea-chat')
 assert.equal(resolveConversationRequest('other-chat',conversations,'idea-a'),null)
 assert.equal(resolveConversationRequest('legacy-chat',conversations,'idea-a'),null)
})
test('page requests are consumed once across repeated renders',()=>{
 assert.equal(shouldHandleConversationRequest(null,17),true)
 assert.equal(shouldHandleConversationRequest(17,17),false)
 assert.equal(shouldHandleConversationRequest(17,18),true)
 assert.equal(requestScopeMatches('idea-a','idea-a'),true)
 assert.equal(requestScopeMatches('idea-a','idea-b'),false)
 assert.equal(requestScopeMatches(undefined,'idea-b'),true)
})
test('founder review choices need a reason and an explicit AI or complete custom option',()=>{
 const base={reason:'',option:'',customTitle:'',customTradeoff:''}
 assert.equal(reviewChoiceCanSave(base),false)
 assert.equal(reviewChoiceCanSave({...base,reason:'I want to test demand.'}),false)
 assert.equal(reviewChoiceCanSave({...base,reason:'I want to test demand.',option:'Narrow the audience'}),true)
 assert.equal(reviewChoiceCanSave({...base,reason:'I want a different route.',customTitle:'Partner with shops'}),false)
 assert.equal(reviewChoiceCanSave({...base,reason:'I want a different route.',customTitle:'Partner with shops',customTradeoff:'Lower reach at first'}),true)
})
