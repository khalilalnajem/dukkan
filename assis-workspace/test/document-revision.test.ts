import {test} from 'node:test'
import assert from 'node:assert/strict'
import {awaitDocumentRevision,hasMatchingReview,revisionPause} from '../src/components/document-revision.ts'
const original={id:'old',hash:'old-hash',turnId:'old-turn',conversationId:'chat',kind:'application_worksheet'}
const revised={...original,id:'new',hash:'new-hash',turnId:'revision',supersedesArtifactId:'old'}
const signal=()=>new AbortController().signal

test('waits through queued and running states before accepting matching saved revision',async()=>{
 const statuses=['queued','running','completed'];let reads=0,pauses=0
 const result=await awaitDocumentRevision({turnId:'revision',original,signal:signal(),read:async()=>({turn:{id:'revision',status:statuses[reads++]},artifacts:[revised]}),pause:async()=>{pauses++}})
 assert.equal(result,revised);assert.equal(reads,3);assert.equal(pauses,2)
})
for(const status of ['failed','needs_input'])test(status+' rejects without providing a saved output',async()=>{
 await assert.rejects(awaitDocumentRevision({turnId:'revision',original,signal:signal(),read:async()=>({turn:{id:'revision',status},artifacts:[revised]})}),/edits are still here/)
})
test('completed turn cannot accept missing or unrelated artefacts',async()=>{
 for(const artifacts of [[],[{...revised,supersedesArtifactId:'other'}],[{...revised,turnId:'other'}],[{...revised,conversationId:'other'}]])await assert.rejects(awaitDocumentRevision({turnId:'revision',original,signal:signal(),read:async()=>({turn:{id:'revision',status:'completed'},artifacts})}),/without a saved document/)
})
test('cancellation after response prevents publishing a completed output',async()=>{
 const controller=new AbortController()
 await assert.rejects(awaitDocumentRevision({turnId:'revision',original,signal:controller.signal,read:async()=>{controller.abort();return {turn:{id:'revision',status:'completed'},artifacts:[revised]}}}),{name:'AbortError'})
})
test('poll delay cancels immediately',async()=>{
 const controller=new AbortController(),pending=revisionPause(controller.signal,10000);controller.abort();await assert.rejects(pending,{name:'AbortError'})
})
test('only a review matching the current hash restores download readiness',()=>{
 assert.equal(hasMatchingReview({...original,review:{hash:'old-hash'}}),true)
 for(const review of [undefined,null,{},'old-hash',{hash:'another-version'}])assert.equal(hasMatchingReview({...original,review}),false)
})
