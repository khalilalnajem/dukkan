import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';
import {openrouterConfig,createOpenRouterModel} from '../src/openrouter.ts';
import {blank} from '../../assis-workspace/src/lib/workspace.ts';
import {applyConversationProposal} from '../../assis-workspace/src/lib/conversation-flow.ts';
const root=mkdtempSync(join(tmpdir(),'dukkan-lifecycle-live-')),app=await createApp({privateRoot:root,chatModel:createOpenRouterModel(openrouterConfig())});
let w=blank();w.brief.idea='FICTIONAL QA: Sand Lifecycle provides bilingual design services to small shops in Kuwait.';w.brief.offer='bilingual design services';const receipt:any[]=[];
try{
 const {conversation}=app.chat.create({title:'FICTIONAL lifecycle acceptance',workspaceId:'lifecycle-isolated'});
 for(const [kind,content] of [
 ['licence','Create one prepared licence lifecycle record: ask KBC which activity route fits my saved design-service business. Retrieve official guidance first. Known legal form and activity code are unknown. Owner is founder. Do not invent a requirement, date or completed action.'],
 ['hiring','Prepare a hiring lifecycle record for a part-time bilingual designer. Include outcomes, hours unknown, budget unknown, selection criteria and interview questions. No candidate is chosen and no job is posted. Use propose_workspace_update kind lifecycle.'],
 ['operation','SIMULATED QA ONLY: imaginary income 10.125 KWD on 2026-01-01, reference SIM-001. Propose a prepared operation lifecycle record with basis simulated, direction income, amount 10.125 and date 2026-01-01. This is not actual revenue.'],
 ['business_decision','Prepare a business_decision lifecycle record. Decision: defer the first hire until real customer demand is observed. Evidence: only simulated operating data is available. Trade-off: slower delivery while testing demand. Owner founder, review date unknown.']
 ]){
  const started=Date.now(),{turn}=app.chat.enqueue(conversation.id,{content,workspaceContext:w});let result:any;
  while(Date.now()-started<180000){result=app.chat.turnSnapshot(turn.id);if(!['queued','running'].includes(result.turn.status))break;await new Promise(r=>setTimeout(r,300))}
  const proposals=result.messages.flatMap((m:any)=>m.actions||[]).filter((a:any)=>a.type==='workspace_update').map((a:any)=>a.payload);
  receipt.push({kind,status:result.turn.status,error:result.turn.error,ms:Date.now()-started,proposals,tools:result.turn.events.map((e:any)=>({type:e.type,name:e.name,error:e.error})),confirmedFacts:result.case.facts.length});
  writeFileSync(new URL('./evidence/lifecycle-live.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({kind,status:result.turn.status,proposals:proposals.length,ms:Date.now()-started,error:result.turn.error}));
  assert.equal(result.turn.status,'completed');assert.equal(proposals.length,1);assert.equal(proposals[0].kind,'lifecycle');assert.equal(proposals[0].values.category,kind);w=applyConversationProposal(w,proposals[0]);w.updatedAt=new Date().toISOString();assert.equal(result.case.facts.length,0);
 }
 assert.equal(w.lifecycle.length,4);writeFileSync(new URL('./evidence/lifecycle-live-workspace.json',import.meta.url),JSON.stringify(w,null,2)+'\n');
}finally{app.chat.closed=true;for(const abort of app.chat.active.values())abort.abort();app.store.close();rmSync(root,{recursive:true,force:true})}
