import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';
import {openrouterConfig} from '../src/openrouter.ts';
const root=mkdtempSync(join(tmpdir(),'dukkan-idea-continuity-'));
const app=await createApp({privateRoot:root,openrouter:openrouterConfig()});
const receipts:any[]=[];
async function draft(content:string,stage:string){
 const conversation=app.chat.create({title:'Synthetic '+stage,workspaceId:'synthetic-continuity'}).conversation;
 const started=Date.now(),turn=app.chat.enqueue(conversation.id,{content,executionMode:'live_agent'}).turn;
 let result:any;
 while(Date.now()-started<180000){result=app.chat.turnSnapshot(turn.id);if(!['queued','running'].includes(result.turn.status))break;await new Promise(r=>setTimeout(r,250));}
 const artifact=result.artifacts.find((a:any)=>a.kind==='stage_draft'&&a.stage===stage);
 receipts.push({stage,status:result.turn.status,error:result.turn.error,ms:Date.now()-started,model:result.turn.model,tools:result.turn.events.filter((e:any)=>e.type==='tool_completed').map((e:any)=>e.name),artifact:artifact?{stage:artifact.stage,citations:artifact.citations.length,assumptions:artifact.assumptions.length,unknowns:artifact.unknowns.length}:null,confirmedFacts:result.case.facts.length});
 assert.equal(result.turn.status,'completed');assert.ok(artifact);assert.equal(result.case.facts.length,0);return artifact;
}
try{
 await draft('Synthetic demonstration: my idea is Pearl Sample, a graphic design service for small shops in Kuwait. Retrieve relevant market evidence and save a concise idea brief with prepare_stage_draft. Identify the riskiest assumption and one next test. Treat demand as unknown.','idea');
 const next=await draft('Continue the saved idea brief in this idea folder. Retrieve relevant evidence and save a concise validate stage draft with one cheap customer test, what to measure and when to revise the idea. This is a test plan; no customer test has happened yet.','validate');
 assert.match(next.content,/design|shop|Pearl|تصميم|متجر/i,'New chat must continue the idea');
 console.log(JSON.stringify({passed:true,turns:receipts}));
}finally{
 writeFileSync(new URL('./evidence/idea-continuity-live.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),synthetic:true,isolatedStorage:true,turns:receipts},null,2)+'\n');
 app.chat.closed=true;for(const abort of app.chat.active.values())abort.abort();app.store.close();rmSync(root,{recursive:true,force:true});
}
