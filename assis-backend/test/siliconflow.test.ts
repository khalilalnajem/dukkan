import {test} from 'node:test';
import assert from 'node:assert/strict';
import {siliconflowConfig,createSiliconFlowModel,wireMessages} from '../src/siliconflow.ts';
const config=siliconflowConfig({SILICONFLOW_API_KEY:'test-credential',SILICONFLOW_MODEL:'test/model',SILICONFLOW_BASE_URL:'https://api.siliconflow.cn/v1'});
const input={messages:[{role:'user',content:'مرحبا'}],tools:[{type:'function',function:{name:'retrieve_guidance',parameters:{type:'object'}}}],signal:new AbortController().signal};
test('SiliconFlow preserves native tool pairing, Unicode and JSON argument encoding',async()=>{
 let body:any;const model=createSiliconFlowModel(config,{fetch:(async(url:any,init:any)=>{assert.equal(url,'https://api.siliconflow.cn/v1/chat/completions');assert.equal(init.redirect,'error');body=JSON.parse(init.body);return new Response(JSON.stringify({model:'test/actual',choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'abc',type:'function',function:{name:'retrieve_guidance',arguments:'{"query":"الكويت"}'}}]}}],usage:{prompt_tokens:10,completion_tokens:20}}));}) as any});
 const response=await model.respond(input);assert.equal(body.enable_thinking,false);assert.equal(body.max_tokens,1200);assert.equal(response.calls[0].arguments.query,'الكويت');assert.equal(response.usage.provider,'siliconflow');assert.equal(response.usage.model,'test/actual');
 const messages=wireMessages([{role:'assistant',tool_calls:[{function:{name:'retrieve_guidance',arguments:{query:'الكويت'}}}]},{role:'tool',tool_name:'retrieve_guidance',content:'actual result'}]);assert.equal(messages[0].tool_calls[0].id,messages[1].tool_call_id);assert.equal(typeof messages[0].tool_calls[0].function.arguments,'string');
});
test('configuration rejects non-SiliconFlow hosts, missing model and missing key',()=>{
 for(const env of [{},{SILICONFLOW_API_KEY:'test',SILICONFLOW_MODEL:'test/model',SILICONFLOW_BASE_URL:'https://example.com/v1'},{SILICONFLOW_API_KEY:'test',SILICONFLOW_BASE_URL:config.base}])assert.throws(()=>siliconflowConfig(env));
});
test('HTTP errors are sanitised, do not retry, and never fall back',async()=>{
 let requests=0;const model=createSiliconFlowModel(config,{fetch:(async()=>{requests++;return new Response('private provider body test-credential',{status:401});}) as any});await assert.rejects(()=>model.respond(input),e=>{assert.equal((e as any).code,'PROVIDER_HTTP');assert.ok(!(e as Error).message.includes('test-credential'));return true;});assert.equal(requests,1);
});
test('partial, malformed and unauthorised tool responses fail closed',async()=>{
 for(const choice of [{finish_reason:'length',message:{}},{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'send_email',arguments:'{}'}}]}},{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'retrieve_guidance',arguments:'bad'}}]}}]){const model=createSiliconFlowModel(config,{fetch:(async()=>new Response(JSON.stringify({choices:[choice]}))) as any});await assert.rejects(()=>model.respond(input));}
});
test('context and daily request ceilings prevent provider calls',async()=>{
 let calls=0;const fetcher=(async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'Answer'}}]}));}) as any;
 await assert.rejects(()=>createSiliconFlowModel({...config,maxInput:1},{fetch:fetcher}).respond(input),{code:'CONTEXT_LIMIT'});assert.equal(calls,0);
 const model=createSiliconFlowModel({...config,daily:1},{fetch:fetcher});await model.respond(input);await assert.rejects(()=>model.respond(input),{code:'DAILY_BUDGET'});assert.equal(calls,1);
});
