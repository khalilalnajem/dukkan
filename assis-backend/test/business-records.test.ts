import test from 'node:test';
import assert from 'node:assert/strict';
import {saveLifecycle,validateLifecycle,lineAmount,operatingTotals,entityTypes} from '../../shared/lifecycle.ts';
import {workspaceProposal} from '../src/workspace-proposal.ts';
const workspace={updatedAt:'v1',lifecycle:[]};
const base={title:'Synthetic record',details:'User supplied example details',status:'prepared',basis:'simulated'};
test('all structured business records produce approval proposals without changing workspace',()=>{
 const before=JSON.stringify(workspace);
 for(const [category,types] of Object.entries(entityTypes))for(const entityType of types){
 const values={...base,category,entityType,...(['finance','budget'].includes(entityType)?{amount:'10.125',direction:'expense',date:'2026-01-01'}:{})};
 const p=workspaceProposal({kind:'lifecycle',summary:'Review example',values},workspace);
 assert.equal(p.values.entityType,entityType);assert.equal(p.expectedUpdatedAt,'v1');
 const saved=saveLifecycle([],p.values,'id','now');assert.equal(saved[0].revision,1);
 }
 assert.equal(JSON.stringify(workspace),before);
});
test('legacy financial entries retained and unrelated operation records never enter totals',()=>{
 const finance={...base,category:'operation',basis:'actual',amount:'10.125',direction:'income',date:'2026-01-01',evidence:'Founder receipt'};
 validateLifecycle(finance);
 const rows:any[]=[{id:'old',values:{...finance,status:'completed'}},{id:'new',values:{...finance,entityType:'finance',status:'completed'}},...['budget','supplier','quote','order','task'].map(entityType=>({id:entityType,values:{...finance,entityType,status:'completed'}}))];
 assert.deepEqual(operatingTotals(rows,'2026-01'),{count:2,income:20.25,expenses:0,net:20.25});
 validateLifecycle({...base,category:'operation',entityType:'supplier'});
 assert.throws(()=>validateLifecycle({...base,category:'operation',entityType:'budget'}));
});
test('deterministic line totals use fils, reject mismatches and do not mutate inputs',()=>{
 assert.equal(lineAmount('3','0.333'),'0.999');assert.equal(lineAmount('10','12.105'),'121.050');
 const values={...base,category:'operation',entityType:'quote',quantity:'3',unitPrice:'0.333'};
 const p=workspaceProposal({kind:'lifecycle',summary:'Review quote',values},workspace);assert.equal(p.values.amount,'0.999');assert.equal((values as any).amount,undefined);
 assert.throws(()=>workspaceProposal({kind:'lifecycle',summary:'Invalid',values:{...values,amount:'1.000'}},workspace));
 for(const fields of [{quantity:'1.5'},{unitPrice:'0.0001'},{currency:'USD'},{quantity:'1000001'}])assert.throws(()=>validateLifecycle({...values,...fields}));
});
test('record types, provenance, stages, review and history remain guarded',()=>{
 const lead={...base,category:'sales',entityType:'lead',stage:'prospect',contact:'buyer@example.test',nextAction:'Ask for meeting',due:'2026-10-01'};
 assert.throws(()=>validateLifecycle({...lead,basis:''}));assert.throws(()=>validateLifecycle({...lead,basis:'actual'}));
 assert.throws(()=>validateLifecycle({...lead,stage:'hired'}));assert.throws(()=>validateLifecycle({...lead,entityType:'candidate'}));
 assert.throws(()=>validateLifecycle({...lead,status:'completed',date:'2026-01-01',evidence:'invented'}));
 let rows=saveLifecycle([],lead,'lead','first');rows=saveLifecycle(rows,{...lead,recordId:'lead',status:'approved'},'ignored','second');
 assert.equal(rows[0].history.length,1);
 assert.throws(()=>saveLifecycle(rows,{...lead,recordId:'lead',entityType:'contact',stage:'active'},'ignored','third'));
 assert.throws(()=>saveLifecycle(rows,{...lead,recordId:'lead',status:'approved',nextAction:'Changed'},'ignored','third'));
});

test('planned records cannot claim consequential outcomes',()=>{
 for(const [category,entityType,stage] of [['hiring','candidate','hired'],['sales','proposal','sent'],['sales','lead','won'],['operation','order','ordered'],['operation','task','done']]){
 const values={...base,category,entityType,stage,basis:'estimate'};
 assert.throws(()=>validateLifecycle(values));
 assert.throws(()=>validateLifecycle({...values,basis:'actual',evidence:'Reported'}));
 validateLifecycle({...values,basis:'actual',evidence:'Founder reports this event',date:'2026-01-01'});
 validateLifecycle({...values,basis:'simulated',evidence:'SIMULATED fictional event',date:'2026-01-01'});
 }
});

import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';
test('agent cannot invent actual outcome evidence or remove synthetic provenance',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-business-agent-'));const app=await createApp({privateRoot:root});
 try{
 const c=app.chat.create({title:'Synthetic isolated business contract'}).conversation;const snapshot=app.chat.caseFor(c);
 const turn={id:'test-turn',caseId:c.caseId,conversationId:c.id,businessRevision:snapshot.businessRevision,factsHash:snapshot.factsHash,workspaceContext:workspace,results:{}};app.store.put('chat_turn',turn.id,c.caseId,turn);
 const user={id:'test-user',conversationId:c.id,role:'user',content:'SYNTHETIC example: candidate interviewed on 2026-01-01'};app.store.put('chat_message',user.id,c.caseId,user);
 const action=(values:any)=>app.chat.tool(turn,'propose_workspace_update',{kind:'lifecycle',summary:'Review candidate',values},new AbortController().signal,[]);
 const candidate={...base,category:'hiring',entityType:'candidate',stage:'interview',date:'2026-01-01',evidence:user.content};
 await assert.rejects(action({...candidate,basis:'actual'}),{code:'SIMULATION_LABEL_REQUIRED'});
 await assert.rejects(action({...candidate,evidence:'The user hired this person'}),{code:'UNSUPPORTED_RESULT'});
 const result=await action(candidate);assert.equal(result.saved,false);assert.equal(result.proposal.values.basis,'simulated');assert.deepEqual(app.chat.caseFor(c).facts,[]);assert.equal(workspace.lifecycle.length,0);
 }finally{app.store.close();rmSync(root,{recursive:true,force:true});}
});
