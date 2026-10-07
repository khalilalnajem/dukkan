import {test} from 'node:test'
import assert from 'node:assert/strict'
import {groupDrafts,versionLabel,draftStamp} from '../src/lib/draft-groups.ts'
const title='KDIPA branch application · demonstration'
const mingyuan=[
 {id:'a1',conversationId:'c1',title,version:1,supersedesArtifactId:null,createdAt:'2026-09-26T01:44:41.575Z'},
 {id:'a2',conversationId:'c1',title,version:2,supersedesArtifactId:'a1',createdAt:'2026-09-26T02:00:46.216Z'},
 {id:'b1',conversationId:'c2',title,version:1,supersedesArtifactId:null,createdAt:'2026-09-26T04:50:42.198Z'},
 {id:'b2',conversationId:'c2',title,version:2,supersedesArtifactId:'b1',createdAt:'2026-09-26T04:53:34.192Z'},
 {id:'d1',conversationId:'c2',title:'Fictional Mingyuan Lighting: critical idea review',version:1,supersedesArtifactId:null,createdAt:'2026-09-26T05:15:28.164Z'},
]
test('two documents with the same title become two rows, each holding its versions latest first',()=>{
 const groups=groupDrafts(mingyuan)
 assert.deepEqual(groups.map(g=>g.versions.map(v=>v.id)),[['a2','a1'],['b2','b1'],['d1']])
 assert.equal(groups[0].latest.id,'a2')
 assert.equal(groups[0].sameTitleElsewhere,true)
 assert.equal(groups[2].sameTitleElsewhere,false)
})
test('same-title documents created on the same day carry a time; a lone document carries only the date',()=>{
 const groups=groupDrafts(mingyuan)
 assert.match(groups[0].stamp,/2026/)
 assert.match(groups[0].stamp,/\d{2}:\d{2}/)
 assert.match(groups[1].stamp,/\d{2}:\d{2}/)
 assert.notEqual(groups[0].stamp,groups[1].stamp)
 assert.match(groups[2].stamp,/2026/)
 assert.doesNotMatch(groups[2].stamp,/\d{2}:\d{2}/)
})
test('version labels mark the latest and earlier versions in both languages',()=>{
 assert.equal(versionLabel({id:'x',title:'t',version:2},true,'en'),'Version 2 · Latest')
 assert.equal(versionLabel({id:'x',title:'t',version:1},false,'en'),'Version 1 · Earlier version')
 assert.equal(versionLabel({id:'x',title:'t'},false,'ar'),'النسخة 1 · نسخة سابقة')
})
test('broken or circular supersede links and missing dates do not throw',()=>{
 const groups=groupDrafts([
  {id:'p',title:'Loop',version:1,supersedesArtifactId:'q'},
  {id:'q',title:'Loop',version:2,supersedesArtifactId:'p'},
  {id:'r',title:'Orphan',version:3,supersedesArtifactId:'missing',createdAt:'not a date'},
 ])
 assert.equal(groups.length,2)
 assert.equal(groups[0].versions.length,2)
 assert.equal(groups[0].latest.id,'q')
 assert.equal(groups[1].stamp,'')
 assert.equal(draftStamp({id:'r',title:'Orphan'},'en',true),'')
})
