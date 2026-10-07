import {test} from 'node:test'
import assert from 'node:assert/strict'
import {recordArea,isSampleWorkspace} from '../src/lib/dashboard-navigation.ts'
import {saveLifecycle} from '../../shared/lifecycle.ts'
test('dashboard actions resolve to their real record section across categories',()=>{
 for(const [category,entityType,area] of [['operation','quote','operations'],['operation','finance','finance'],['operation','budget','finance'],['hiring','candidate','people'],['sales','followup','sales'],['document',undefined,'licences'],['business_decision',undefined,'operations']] as const){
 const [row]=saveLifecycle([],{category,title:'QA record',details:'Route check',status:'prepared',basis:'simulated',evidence:'Synthetic route fixture',...(entityType==='finance'||entityType==='budget'?{amount:'1.000',direction:'expense',date:'2026-10-07'}:{}),...(entityType?{entityType}:{} )},undefined,new Date().toISOString())
 assert.equal(recordArea(row),area)
 }
})
test('a fresh customer opens their own workspace and sample requires explicit URL selection',()=>{
 assert.equal(isSampleWorkspace(''),false)
 assert.equal(isSampleWorkspace('?view=home'),false)
 assert.equal(isSampleWorkspace('?example=pearl-delta'),true)
})
