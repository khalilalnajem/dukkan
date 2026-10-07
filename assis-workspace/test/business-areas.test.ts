import test from 'node:test'
import assert from 'node:assert/strict'
import {recordViews,matchesView} from '../src/lib/workspaces.ts'
import {blank,workspaceSchema} from '../src/lib/workspace.ts'
import {applyConversationProposal} from '../src/lib/conversation-flow.ts'
import {saveLifecycle,lineAmount,entityTypes,type LifecycleRecord} from '../../shared/lifecycle.ts'
import {reconcileContext,recordImpact} from '../src/lib/business-impact.ts'
test('every supported typed record has an accessible workspace and survives serialisation',()=>{
 for(const [category,types] of Object.entries(entityTypes))for(const entityType of types){
  const view=Object.values(recordViews).flat().find(v=>v.category===category&&v.entityType===entityType);assert.ok(view,entityType)
  const values={category,entityType,title:'Synthetic '+entityType,details:'Isolated fixture, no external event',status:'prepared',basis:'simulated',...(['finance','budget'].includes(entityType)?{amount:'0',direction:'expense',date:'2026-01-01'}:{})}
  const w={...blank(),lifecycle:saveLifecycle([],values,entityType,'2026-01-01')};const restored=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));assert.ok(matchesView(restored.lifecycle[0],view))
 }
})
test('quote revised through editable proposal calculates exact fils and preserves approved prior version',()=>{
 let w=blank();w=reconcileContext(w,applyConversationProposal(w,{kind:'lifecycle',summary:'Synthetic quote',expectedUpdatedAt:w.updatedAt,values:{category:'operation',entityType:'quote',title:'Synthetic quote',details:'No purchase',quantity:'3',unitPrice:'0.333',basis:'simulated',status:'prepared'}}));let row=w.lifecycle[0];assert.equal(row.values.amount,'0.999')
 w={...w,lifecycle:saveLifecycle(w.lifecycle,{...row.values,status:'approved'},row.id,'2026-01-02')};row=w.lifecycle[0]
 const next=applyConversationProposal(w,{kind:'lifecycle',summary:'Revised quote',expectedUpdatedAt:w.updatedAt,values:{...row.values,quantity:'4',amount:'',status:'prepared'}});assert.equal(next.lifecycle[0].values.amount,lineAmount('4','0.333'));assert.equal(next.lifecycle[0].history.at(-1)?.values.status,'approved');assert.equal(next.lifecycle[0].history.at(-1)?.values.amount,'0.999')
 assert.throws(()=>applyConversationProposal({...w,updatedAt:'changed'},{kind:'lifecycle',summary:'stale',expectedUpdatedAt:w.updatedAt,values:row.values}))
})
test('sales and nonfinancial operation approvals track changed business assumptions',()=>{let w=blank();for(const [category,entityType] of [['sales','lead'],['operation','supplier']]){const next={...w,lifecycle:saveLifecycle(w.lifecycle,{category,entityType,title:entityType,details:'Fixture',status:'prepared',basis:'simulated'},entityType,'2026-01-01')};w=reconcileContext(w,next)};const changed={...w,brief:{...w.brief,offer:'Changed offer'}};for(const row of changed.lifecycle)assert.ok(recordImpact(changed,row).changed.includes('brief'))})
