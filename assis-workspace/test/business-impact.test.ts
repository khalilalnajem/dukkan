import test from 'node:test'
import assert from 'node:assert/strict'
import {blank,workspaceSchema} from '../src/lib/workspace.ts'
import {saveLifecycle} from '../../shared/lifecycle.ts'
import {captureRecordContext,reconcileContext,recordImpact} from '../src/lib/business-impact.ts'
import {applyConversationProposal} from '../src/lib/conversation-flow.ts'
function fixture(){const w=blank();w.lifecycle=saveLifecycle([],{category:'hiring',title:'Role brief',details:'Hours and budget unknown',status:'prepared'},'role','2026-01-01');return reconcileContext(blank(),w)}
test('cost changes surface affected hiring, approval cannot erase warning, explicit review clears it',()=>{
 const w=fixture();assert.deepEqual(recordImpact(w,w.lifecycle[0]).changed,[])
 const changed={...w,costs:{...w.costs,fixed:'20'}};assert.deepEqual(recordImpact(changed,changed.lifecycle[0]).changed,['costs'])
 const approved={...changed,lifecycle:saveLifecycle(changed.lifecycle,{...changed.lifecycle[0].values,status:'approved'},'role','2026-01-02')}
 assert.deepEqual(recordImpact(reconcileContext(changed,approved),approved.lifecycle[0]).changed,['costs'])
 const reviewed=captureRecordContext(changed,changed.lifecycle[0]);assert.deepEqual(recordImpact(workspaceSchema.parse(JSON.parse(JSON.stringify(reviewed))),reviewed.lifecycle[0]).changed,[])
 assert.throws(()=>applyConversationProposal(changed,{kind:'lifecycle',summary:'Approve role',expectedUpdatedAt:changed.updatedAt,values:{...changed.lifecycle[0].values,status:'approved'}}),/context/)
})
test('legacy context is unknown, evidence affects launch, actual operation history remains unchanged',()=>{
 const w=blank();w.lifecycle=saveLifecycle([],{category:'launch',title:'Pilot',details:'Review dependencies',status:'prepared'},'launch','1')
 assert.equal(recordImpact(w,w.lifecycle[0]).missing,true)
 const baseline=reconcileContext(blank(),w);const changed={...baseline,evidence:[{id:'e',hypothesisId:'',kind:'Observation' as const,origin:'simulated' as const,text:'QA only',source:'fixture',date:'2026-01-01',signal:'Challenges' as const,limitation:'No validation'}]}
 assert.deepEqual(recordImpact(changed,changed.lifecycle[0]).changed,['evidence']);assert.deepEqual(changed.lifecycle,w.lifecycle)
})
test('scenario and context defaults preserve old backups; scenario snapshots survive archive and import',()=>{
 const w=blank();const {contextReviews,costScenarios,...legacy}=w;assert.deepEqual(workspaceSchema.parse(legacy).costScenarios,[])
 w.costScenarios=[{id:'s',name:'QA',note:'Synthetic monthly estimate',date:'2026-01-01',archived:true,costs:{price:'12',variable:'8',fixed:'20',units:'10'}}]
 assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(w))).costScenarios,w.costScenarios)
})
test('linked lifecycle changes warn without changing the original status',()=>{
 let w=fixture();w.lifecycle=saveLifecycle(w.lifecycle,{category:'launch',title:'Pilot',details:'Depends on role',status:'prepared',relatedId:'role'},'launch','2');w=reconcileContext(blank(),w)
 const next={...w,lifecycle:saveLifecycle(w.lifecycle,{...w.lifecycle[0].values,status:'archived'},'role','3')}
 assert.deepEqual(recordImpact(next,next.lifecycle[1]).changed,['related']);assert.equal(next.lifecycle[1].values.status,'prepared')
})
