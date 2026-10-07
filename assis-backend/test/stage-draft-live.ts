import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';
import {openrouterConfig,createOpenRouterModel} from '../src/openrouter.ts';
const root=mkdtempSync(join(tmpdir(),'dukkan-stage-live-'));
const config={...openrouterConfig(),maxOutput:4096};
const diagnostics:any[]=[];
const model=createOpenRouterModel(config,{fetch:async(input,init)=>{const response=await fetch(input,init);if(String(input).endsWith('/chat/completions')&&response.ok){const value=await response.clone().json();diagnostics.push({finish:value.choices?.[0]?.finish_reason,tokens:value.usage?.completion_tokens,calls:value.choices?.[0]?.message?.tool_calls?.map((c:any)=>{let valid=true;try{JSON.parse(c.function.arguments)}catch{valid=false}return {name:c.function.name,argumentBytes:c.function.arguments.length,keys:valid?Object.keys(JSON.parse(c.function.arguments)):[],valid}})});}return response;}});
const app=await createApp({privateRoot:root,chatModel:model});
const started=Date.now();
try {
 const {conversation}=app.chat.create({title:'Synthetic stage acceptance',workspaceId:'synthetic-stage-acceptance'});
 const {turn}=app.chat.enqueue(conversation.id,{executionMode:'live_agent',requestedAction:{type:'stage_draft',stage:'idea'},content:'Synthetic test: develop an idea brief for Pearl Sample, a graphic design service for small shops in Kuwait. Search downloaded Kuwait market evidence and save an idea stage draft using prepare_stage_draft. Clearly mark assumptions and unknowns. Do not ask a questionnaire or claim demand has been validated.'});
 let result:any;
 while(Date.now()-started<180000){result=app.chat.turnSnapshot(turn.id);if(!['queued','running'].includes(result.turn.status))break;await new Promise(r=>setTimeout(r,300));}
 const draft=result.artifacts.find((a:any)=>a.kind==='stage_draft');
 const receipt={at:new Date().toISOString(),status:result.turn.status,error:result.turn.error,model:result.turn.model,events:result.turn.events.filter((e:any)=>e.type==='tool_completed').map((e:any)=>e.name),artifact:draft?{kind:draft.kind,stage:draft.stage,version:draft.version,citations:draft.citations.length,ideaReview:draft.ideaReview,proposedTest:draft.proposedTest,assumptions:draft.assumptions.length,unknowns:draft.unknowns.length}:null,confirmedFacts:result.case.facts.length,ms:Date.now()-started,diagnostics};
 writeFileSync(new URL('./evidence/stage-draft-live.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
 assert.equal(result.turn.status,'completed');assert.equal(draft?.stage,'idea');assert.equal(draft.ideaReview.dimensions.length,5);assert.ok(draft.assumptions.length);assert.ok(draft.unknowns.length);assert.equal(result.case.facts.length,0);
}finally{app.chat.closed=true;for(const abort of app.chat.active.values())abort.abort();app.store.close();rmSync(root,{recursive:true,force:true});}
