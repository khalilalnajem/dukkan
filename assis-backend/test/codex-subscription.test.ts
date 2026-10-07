import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodexSubscriptionModel,parseCodexProposal} from '../src/codex-subscription.ts';
const tools=[{type:'function',function:{name:'fill_official_pdf'}}];
test('subscription model returns app tool proposals without claiming execution',async()=>{
 const model=createCodexSubscriptionModel({binary:'codex',model:'test-model'},async()=>({raw:JSON.stringify({content:'',calls:[{name:'fill_official_pdf',arguments:JSON.stringify({templateId:'demo',fields:{Name:'Fictional'}})}]}),usage:{input_tokens:10}}));
 const response=await model.respond({messages:[],tools,signal:new AbortController().signal,forcedTool:'fill_official_pdf'});
 assert.equal(response.calls[0].arguments.fields.Name,'Fictional');assert.equal(response.usage.provider,'codex-subscription');assert.equal((await model.catalogue!(new AbortController().signal)).models[0].freeVerified,false);
});
test('unknown tools, malformed arguments and missing forced actions fail closed',()=>{
 for(const value of [{content:'',calls:[{name:'send_email',arguments:'{}'}]},{content:'',calls:[{name:'fill_official_pdf',arguments:'[]'}]},{content:'',calls:[{name:'fill_official_pdf',arguments:'invalid'}]}])assert.throws(()=>parseCodexProposal(JSON.stringify(value),tools));
 assert.throws(()=>parseCodexProposal('{"content":"done","calls":[]}',tools,'fill_official_pdf'));
});
test('model selection cannot change subscription route or silently fall back',async()=>{
 let invoked=false;const model=createCodexSubscriptionModel({binary:'codex',model:'test-model'},async()=>{invoked=true;throw Error('unexpected')});
 await assert.rejects(model.respond({messages:[],tools:[],modelId:'other',signal:new AbortController().signal}));assert.equal(invoked,false);
});
