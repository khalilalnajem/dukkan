import test from 'node:test'
import assert from 'node:assert/strict'
import {blank,workspaceSchema,exportPlanWithReviews} from '../src/lib/workspace.ts'
import {applyConversationProposal} from '../src/lib/conversation-flow.ts'
import {saveLifecycle,operatingTotals,type LifecycleValues} from '../../shared/lifecycle.ts'
const values:LifecycleValues={category:'licence',title:'Check route',details:'Confirm applicable activity with the authority.',status:'prepared'}
test('legacy backup gains empty lifecycle and keeps existing records',()=>{const w=blank();const {lifecycle,...old}=w;assert.deepEqual(workspaceSchema.parse(old).lifecycle,[]);assert.deepEqual(workspaceSchema.parse(old).setup,w.setup)})
test('licence review, submission and outcome require order and evidence; revision revokes approval',()=>{
 let rows=saveLifecycle([],values,'a','1');assert.throws(()=>saveLifecycle(rows,{...rows[0].values,status:'submitted'},'a','2'))
 rows=saveLifecycle(rows,{...rows[0].values,status:'approved'},'a','2')
 assert.throws(()=>saveLifecycle(rows,{...rows[0].values,title:'Changed',status:'approved'},'a','3'))
 assert.throws(()=>saveLifecycle(rows,{...rows[0].values,status:'completed',date:'2026-01-01',evidence:'receipt'},'a','3'))
 rows=saveLifecycle(rows,{...rows[0].values,status:'prepared',date:'2026-01-01',evidence:'Receipt ABC'},'a','3')
 rows=saveLifecycle(rows,{...rows[0].values,status:'approved'},'a','4')
 rows=saveLifecycle(rows,{...rows[0].values,status:'submitted'},'a','5')
 rows=saveLifecycle(rows,{...rows[0].values,status:'completed',evidence:'Outcome ABC'},'a','6')
 assert.equal(rows[0].history.length,5);assert.equal(rows[0].history[0].values.status,'prepared')
 rows=saveLifecycle(rows,{...rows[0].values,status:'archived'},'a','7');rows=saveLifecycle(rows,{...rows[0].values,status:'prepared'},'a','8');assert.equal(rows.length,1)
})
test('operating totals use only completed actual dated records, preserve zero and decimal precision',()=>{
 let rows:any[]=[]
 for(const [id,basis,status,direction,amount] of [['a','actual','completed','income','10.001'],['b','actual','completed','expense','0.001'],['c','simulated','completed','income','999'],['d','estimate','completed','income','555'],['e','actual','prepared','income','444']]){
  const v={category:'operation',title:id,details:'Receipt entry',status:'prepared',direction,amount,basis,date:'2026-01-01',evidence:'Founder receipt'}
  rows=saveLifecycle(rows,v,id,'1');if(status==='completed'){rows=saveLifecycle(rows,{...v,recordId:id,status:'approved'},id,'2');rows=saveLifecycle(rows,{...v,recordId:id,status:'completed'},id,'3')}
 }
 const totals=operatingTotals(rows,'2026-01');assert.equal(totals.count,2);assert.equal(totals.net,10);assert.equal(operatingTotals(rows,'2026-02').count,0)
})
test('chat proposal review preserves data, rejects stale cards and exports history',()=>{
 const w=blank(),p={kind:'lifecycle',summary:'Prepare task',values,expectedUpdatedAt:w.updatedAt};const n=applyConversationProposal(w,p);assert.equal(n.lifecycle.length,1);assert.equal(w.lifecycle.length,0);assert.deepEqual(n.setup,w.setup);assert.throws(()=>applyConversationProposal({...w,updatedAt:'changed'},p));assert.match(exportPlanWithReviews(n),/Check route/)
})
test('record validation rejects invented IDs, unsafe URLs, bad dates and unsupported monetary claims',()=>{
 for(const patch of [{recordId:'missing'},{source:'javascript:alert(1)'},{due:'2026-02-30'},{amount:'-3'},{category:'operation',basis:'actual',amount:'2',date:'2026-01-01',direction:'income'},{status:'submitted'},{relatedId:'missing'}])assert.throws(()=>saveLifecycle([],{...values,...patch},'x','1'))
})

test('backup import rejects unsubstantiated completed records and invalid amounts',()=>{
 const w=blank();
 assert.equal(workspaceSchema.safeParse({...w,lifecycle:[{id:'x',revision:1,at:'now',values:{...values,status:'completed'},history:[]}]}).success,false);
 assert.equal(workspaceSchema.safeParse({...w,lifecycle:[{id:'x',revision:1,at:'now',values:{...values,category:'operation',basis:'actual',amount:'NaN',direction:'income',date:'2026-01-01',evidence:'Receipt'},history:[]}]}).success,false);
})

test('saved lifecycle records and their history survive workspace persistence and recovery',()=>{
 const w=blank();w.lifecycle=saveLifecycle([],values,'persisted','2026-09-25T00:00:00Z');
 for(const status of ['prepared','approved','archived','prepared']){
  if(status!=='prepared'||w.lifecycle[0].values.status!=='prepared')w.lifecycle=saveLifecycle(w.lifecycle,{...w.lifecycle[0].values,status},'persisted','2026-09-25T01:00:00Z');
  const restored=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));assert.deepEqual(restored.lifecycle,w.lifecycle);
 }
})
