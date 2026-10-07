import {test} from 'node:test'
import assert from 'node:assert/strict'
import type {LifecycleRecord} from '../../shared/lifecycle.ts'
import {recordViews,matchesView,type BusinessArea} from '../src/lib/workspaces.ts'
import {hasMatchingReview} from '../src/components/document-revision.ts'

const sample=(values:LifecycleRecord['values']):LifecycleRecord=>({id:'record',revision:1,at:'2026-10-07T00:00:00.000Z',values,history:[]})

test('each supported record opens from exactly one business area view',()=>{
 const cases:Array<[BusinessArea,string,string,string?]>=[
  ['finance','operation','finance'],['finance','operation','budget'],
  ['sales','sales','contact'],['sales','sales','lead'],['sales','sales','proposal'],['sales','sales','followup'],
  ['people','hiring','role'],['people','hiring','candidate'],['people','hiring','onboarding'],
  ['operations','launch',''],['operations','business_decision',''],['operations','operation','task'],['operations','operation','supplier'],['operations','operation','quote'],['operations','operation','order'],
  ['licences','licence',''],['licences','document','']
 ]
 for(const [area,category,entityType] of cases){
  const row=sample({category,title:'Example',details:'Example details',status:'prepared',...(entityType?{entityType}:{})})
  const matches=(Object.entries(recordViews) as Array<[Exclude<BusinessArea,'market'>,typeof recordViews[Exclude<BusinessArea,'market'>]]>).flatMap(([owner,views])=>views.filter(view=>matchesView(row,view)).map(view=>({owner,view})))
  assert.equal(matches.length,1,`${category}/${entityType} must have one record view`)
  assert.equal(matches[0].owner,area)
 }
})

test('document review acknowledgement is bound to the current exact hash',()=>{
 assert.equal(hasMatchingReview({hash:'sha256-current',review:{hash:'sha256-current'}}),true)
 for(const review of [undefined,null,{}, {hash:'sha256-older'}])assert.equal(hasMatchingReview({hash:'sha256-current',review}),false)
})
