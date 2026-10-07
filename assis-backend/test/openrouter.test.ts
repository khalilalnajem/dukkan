import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openrouterConfig,createOpenRouterModel} from '../src/openrouter.ts';
const config=openrouterConfig({OPENROUTER_API_KEY:'test-secret',OPENROUTER_MODEL:'test/model:free'});
const input={messages:[{role:'user',content:'Test'}],tools:[{type:'function',function:{name:'retrieve_guidance',parameters:{type:'object'}}}],signal:new AbortController().signal};
test('OpenRouter verifies free pricing and preserves tool identity',async()=>{
 const model=createOpenRouterModel(config,{fetch:(async(url:any,init:any)=>{
 assert.ok(String(url).startsWith('https://openrouter.ai/api/v1/'));assert.equal(init.redirect,'error');
 if(String(url).endsWith('/models'))return Response.json({data:[{id:config.model,pricing:{prompt:'0',completion:'0'},supported_parameters:['tools']}]});
 const b=JSON.parse(init.body);assert.equal(b.provider.allow_fallbacks,false);assert.deepEqual(b.provider.max_price,{prompt:0,completion:0,request:0,image:0});assert.equal(b.reasoning.enabled,false);
 return Response.json({model:config.model,choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'retrieve_guidance',arguments:'{"query":"Kuwait"}'}}]}}]});}) as any});
 const r=await model.respond(input);assert.equal(r.usage.provider,'openrouter');assert.equal(r.calls[0].arguments.query,'Kuwait');
});
test('OpenRouter refuses paid or unknown pricing before inference',async()=>{
 for(const pricing of [{prompt:'1',completion:'0'},{}]){let calls=0;const m=createOpenRouterModel(config,{fetch:(async(url:any)=>{calls++;assert.ok(String(url).endsWith('/models'));return Response.json({data:[{id:config.model,pricing,supported_parameters:['tools']}]});}) as any});await assert.rejects(m.respond(input),{code:'MODEL_NOT_VERIFIED_FREE'});assert.equal(calls,1);}
});
test('OpenRouter rate limit is sanitised and not retried',async()=>{
 let calls=0;const m=createOpenRouterModel(config,{fetch:(async(url:any)=>{calls++;return String(url).endsWith('/models')?Response.json({data:[{id:config.model,pricing:{prompt:'0',completion:'0'},supported_parameters:['tools']}]}):new Response('test-secret private body',{status:429});}) as any});await assert.rejects(m.respond(input),e=>{assert.equal((e as any).code,'PROVIDER_HTTP');assert.match((e as Error).message,/429/);assert.ok(!(e as Error).message.includes('test-secret'));return true;});assert.equal(calls,2);
});
test('explicit saved output uses the native named tool choice, restricted to available tools',async()=>{
 let body:any;const model=createOpenRouterModel(config,{fetch:(async(url:any,init:any)=>{if(String(url).endsWith('/models'))return Response.json({data:[{id:config.model,pricing:{prompt:'0',completion:'0'},supported_parameters:['tools','tool_choice']}]});body=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'retrieve_guidance',arguments:'{"query":"Kuwait"}'}}]}}]});}) as any});await model.respond({...input,forcedTool:'retrieve_guidance'});assert.deepEqual(body.tool_choice,{type:'function',function:{name:'retrieve_guidance'}});await assert.rejects(model.respond({...input,forcedTool:'not_available'}),{code:'TOOL_DENIED'});
});

test('configured paid and automatic models fail before provider requests',()=>{
 for(const model of ['openrouter/auto','openrouter/free','vendor/paid'])assert.throws(()=>openrouterConfig({OPENROUTER_API_KEY:'test-secret',OPENROUTER_MODEL:model}),{code:'FREE_MODEL_REQUIRED'});
});
test('provider failures give bounded recovery advice without retrying or exposing provider bodies',async()=>{
 for(const [status,expected] of [[429,/rate limited/],[401,/Update the server connection/],[402,/insufficient account credit/],[503,/temporarily unavailable/]] as const){
  let inferenceCalls=0;
  const model=createOpenRouterModel(config,{fetch:(async(url:any)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:config.model,pricing:{prompt:'0',completion:'0'},supported_parameters:['tools']}]});
   inferenceCalls++;return new Response('test-secret private input',{status});
  }) as any});
  await assert.rejects(model.respond(input),(error:any)=>{assert.match(error.message,expected);assert.match(error.message,/No fallback was run/);assert.doesNotMatch(error.message,/test-secret|private input/);assert.equal(error.status,status===429?429:502);return true;});
  assert.equal(inferenceCalls,1);
 }
});
test('per-request charges and unknown charges cannot pass free verification',async()=>{
 for(const pricing of [{prompt:'0',completion:'0',request:'0.01'},{prompt:'0',completion:'0',request:null}]){
  let calls=0;const model=createOpenRouterModel(config,{fetch:(async()=>{calls++;return Response.json({data:[{id:config.model,pricing,supported_parameters:['tools']}]})}) as any});
  await assert.rejects(model.respond(input),{code:'MODEL_NOT_VERIFIED_FREE'});assert.equal(calls,1);
 }
});
