import test from 'node:test';
import assert from 'node:assert/strict';
import {openaiConfig,createOpenAIModel} from '../src/openai.ts';

const key='synthetic-test-secret';
const config=(values:Record<string,string>={})=>openaiConfig({OPENAI_API_KEY:key,...values} as NodeJS.ProcessEnv);
const tool={type:'function',function:{name:'retrieve_guidance',description:'Retrieve official guidance',parameters:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}};
const signal=()=>new AbortController().signal;
const response=(message:any,finish_reason='stop',usage:any={prompt_tokens:10,completion_tokens:5,total_tokens:15})=>Response.json({model:'gpt-4.1-mini-2025-04-14',choices:[{finish_reason,message}],usage});
function memoryStore(initial=0){const rows=new Map<string,any>();if(initial)rows.set('provider_budget:openai-'+new Date().toISOString().slice(0,10),{requests:initial});return {get(kind:string,id:string){return kind==='provider_budget'?rows.get(kind+':'+id)||null:null;},put(kind:string,id:string,_business:string,value:any){rows.set(kind+':'+id,value);},rows};}

test('catalogue exposes only the two audited native IDs and marks models inside the configured caps',async()=>{
 const model=createOpenAIModel(config(),{fetch:(async()=>{throw Error('catalogue is local');}) as any});
 assert.equal(model.version,'gpt-4.1-mini');assert.equal(model.canSelect?.('gpt-4.1-mini'),true);assert.equal(model.canSelect?.('openai/gpt-4.1-mini'),false);
 assert.deepEqual((await model.catalogue!(signal())).models,[{id:'gpt-4.1-mini',freeVerified:true},{id:'gpt-4o-mini',freeVerified:true}]);
 const limited=createOpenAIModel(config({OPENAI_MAX_INPUT_USD_PER_M:'0.2',OPENAI_MAX_OUTPUT_USD_PER_M:'0.7'}));
 assert.deepEqual((await limited.catalogue!(signal())).models,[{id:'gpt-4.1-mini',freeVerified:false},{id:'gpt-4o-mini',freeVerified:true}]);
});

test('native tool call output and paired transcript use Chat Completions tool IDs and forced choice',async()=>{
 let sent:any;const model=createOpenAIModel(config(),{fetch:(async(url:any,init:any)=>{
  assert.equal(String(url),'https://api.openai.com/v1/chat/completions');assert.equal(init.redirect,'error');sent=JSON.parse(init.body);
  return response({content:null,tool_calls:[{id:'call_native_7',type:'function',function:{name:'retrieve_guidance',arguments:'{"query":"Kuwait"}'}}]},'tool_calls');
 }) as any});
 const messages=[{role:'assistant',content:'',tool_calls:[{id:'prior_call',function:{name:'retrieve_guidance',arguments:{query:'prior'}}}]},{role:'tool',tool_name:'retrieve_guidance',content:'prior result'},{role:'user',content:'Continue'}];
 const result=await model.respond({messages,tools:[tool],signal:signal(),forcedTool:'retrieve_guidance'});
 assert.deepEqual(sent.tool_choice,{type:'function',function:{name:'retrieve_guidance'}});assert.deepEqual(sent.tools,[tool]);assert.equal(sent.messages[0].tool_calls[0].id,'prior_call');assert.equal(sent.messages[1].tool_call_id,'prior_call');
 assert.deepEqual(result.calls,[{name:'retrieve_guidance',arguments:{query:'Kuwait'}}]);assert.equal(result.usage.provider,'openai');assert.equal(result.usage.model,'gpt-4.1-mini-2025-04-14');
});

test('text response and cached-token price estimate use audited input, cached-input and output rates',async()=>{
 const model=createOpenAIModel(config(),{fetch:(async()=>response({content:'A concise answer',tool_calls:undefined},'stop',{prompt_tokens:1000,completion_tokens:1000,total_tokens:2000,prompt_tokens_details:{cached_tokens:600}})) as any});
 const result=await model.respond({messages:[{role:'user',content:'Question'}],tools:[],signal:signal()});
 assert.equal(result.content,'A concise answer');assert.deepEqual(result.calls,[]);assert.equal(result.usage.cachedPromptTokens,600);assert.equal(result.usage.costUsd,0.00182);assert.equal(result.usage.costEstimated,true);
});

test('unknown model IDs, forced-tool errors and price caps are rejected before inference',async()=>{
 let calls=0;const model=createOpenAIModel(config(),{fetch:(async()=>{calls++;return response({content:'no'});}) as any});
 await assert.rejects(model.respond({messages:[],tools:[tool],signal:signal(),modelId:'openai/gpt-4.1-mini'}),{code:'MODEL_NOT_PERMITTED'});
 await assert.rejects(model.respond({messages:[],tools:[tool],signal:signal(),forcedTool:'prepare_stage_draft'}),{code:'TOOL_DENIED'});assert.equal(calls,0);
 assert.throws(()=>config({OPENAI_MODEL:'gpt-5-mini'}),{code:'PROVIDER_MODEL'});
 assert.throws(()=>config({OPENAI_MAX_INPUT_USD_PER_M:'0.41'}),{code:'PROVIDER_LIMIT'});
 assert.throws(()=>config({OPENAI_MAX_OUTPUT_USD_PER_M:'1.61'}),{code:'PROVIDER_LIMIT'});
 const capped=createOpenAIModel(config({OPENAI_MAX_INPUT_USD_PER_M:'0.2',OPENAI_MAX_OUTPUT_USD_PER_M:'0.7'}),{fetch:(async()=>{calls++;return response({content:'no'});}) as any});
 await assert.rejects(capped.respond({messages:[],tools:[tool],signal:signal(),modelId:'gpt-4.1-mini'}),{code:'MODEL_NOT_PERMITTED'});assert.equal(calls,0);
});

test('input byte cap prevents fetch and daily budget prevents excess requests',async()=>{
 let calls=0;const tooSmall=createOpenAIModel(config({DIKAN_MAX_INPUT_BYTES:'100'}),{fetch:(async()=>{calls++;return response({content:'no'});}) as any});
 await assert.rejects(tooSmall.respond({messages:[{role:'user',content:'x'.repeat(200)}],tools:[tool],signal:signal()}),{code:'CONTEXT_LIMIT'});assert.equal(calls,0);
 const store=memoryStore(1);const budgeted=createOpenAIModel(config({DIKAN_MAX_REQUESTS_PER_DAY:'1'}),{store:store as any,fetch:(async()=>{calls++;return response({content:'ok'});}) as any});
 await assert.rejects(budgeted.respond({messages:[{role:'user',content:'Question'}],tools:[],signal:signal()}),{code:'DAILY_BUDGET'});assert.equal(calls,0);
 const fresh=memoryStore();const successful=createOpenAIModel(config({DIKAN_MAX_REQUESTS_PER_DAY:'1'}),{store:fresh as any,fetch:(async()=>{calls++;return response({content:'ok'});}) as any});
 await successful.respond({messages:[{role:'user',content:'Question'}],tools:[],signal:signal()});assert.equal(calls,1);assert.equal([...fresh.rows.values()][0].requests,1);
 await assert.rejects(successful.respond({messages:[{role:'user',content:'Again'}],tools:[],signal:signal()}),{code:'DAILY_BUDGET'});assert.equal(calls,1);
});

test('daily USD cap validates positive values no greater than twenty',()=>{
 assert.equal(config({OPENAI_MAX_DAILY_USD:'0.50'}).maxDailyUsd,0.5);
 for(const value of ['0','-0.1','20.01','NaN','Infinity'])assert.throws(()=>config({OPENAI_MAX_DAILY_USD:value}),{code:'PROVIDER_LIMIT'});
 assert.equal(config().maxDailyUsd,undefined);
});

test('daily USD reservation blocks before fetch and persists monotonically with request count',async()=>{
 let calls=0;const store=memoryStore();const model=createOpenAIModel(config({OPENAI_MAX_DAILY_USD:'0.0001',DIKAN_MAX_OUTPUT_TOKENS:'10'}),{store:store as any,fetch:(async()=>{calls++;return response({content:'ok'});}) as any});
 await model.respond({messages:[{role:'user',content:'x'}],tools:[],signal:signal()});
 const first=[...store.rows.values()][0];assert.equal(first.requests,1);assert.ok(first.reservedUsd>0);
 await assert.rejects(model.respond({messages:[{role:'user',content:'x'}],tools:[],signal:signal()}),{code:'DAILY_COST_BUDGET'});
 assert.equal(calls,1);assert.equal([...store.rows.values()][0].reservedUsd,first.reservedUsd);
});

test('ambiguous fetch failure retains the USD reservation and prevents a second request over cap',async()=>{
 let calls=0;const store=memoryStore();const model=createOpenAIModel(config({OPENAI_MAX_DAILY_USD:'0.0001',DIKAN_MAX_OUTPUT_TOKENS:'10'}),{store:store as any,fetch:(async()=>{calls++;throw Error('ambiguous network failure');}) as any});
 await assert.rejects(model.respond({messages:[{role:'user',content:'x'}],tools:[],signal:signal()}),{code:'PROVIDER_UNAVAILABLE'});
 const first=[...store.rows.values()][0];assert.equal(first.requests,1);assert.ok(first.reservedUsd>0);
 await assert.rejects(model.respond({messages:[{role:'user',content:'x'}],tools:[],signal:signal()}),{code:'DAILY_COST_BUDGET'});
 assert.equal(calls,1);assert.equal([...store.rows.values()][0].reservedUsd,first.reservedUsd);
});

test('aborted requests are not retried or converted to provider success',async()=>{
 const controller=new AbortController();let calls=0;let started!:()=>void;const began=new Promise<void>(resolve=>{started=resolve;});const model=createOpenAIModel(config(),{fetch:((_url:any,init:any)=>{calls++;started();return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));}) as any});
 const pending=model.respond({messages:[{role:'user',content:'Cancel me'}],tools:[],signal:controller.signal});await began;controller.abort();await assert.rejects(pending);assert.equal(calls,1);
});

test('provider errors classify safe quota codes without exposing bodies or retrying',async()=>{
 for(const [status,body,expected] of [[401,{error:{message:'secret body'}},/rejected the API key/],[403,{error:{code:'billing_hard_limit_reached',message:'private'}},/insufficient API credit/],[429,{error:{code:'insufficient_quota',message:'private'}},/insufficient API credit/],[429,{error:{code:'credit_balance_exhausted',message:'private'}},/insufficient API credit/],[429,{error:{code:'rate_limit_exceeded',message:'private'}},/rate limited/]] as const){
  let requests=0;const model=createOpenAIModel(config(),{fetch:(async()=>{requests++;return Response.json(body,{status});}) as any});
  await assert.rejects(model.respond({messages:[],tools:[],signal:signal()}),(error:any)=>{assert.equal(error.code,'PROVIDER_HTTP');assert.equal(error.status,status);assert.match(error.message,expected);assert.match(error.message,/No retry or fallback/);assert.doesNotMatch(error.message,/secret body|private|insufficient_quota|billing_hard/);return true;});assert.equal(requests,1);
 }
});

test('provider error bodies and echoed credentials never reach returned errors',async()=>{
 const model=createOpenAIModel(config(),{fetch:(async()=>Response.json({error:{message:`private prompt ${key}`}}, {status:400})) as any});
 await assert.rejects(model.respond({messages:[],tools:[],signal:signal()}),(error:any)=>{assert.equal(error.code,'PROVIDER_HTTP');assert.doesNotMatch(error.message,/private prompt|synthetic-test-secret/);return true;});
 const echoed=createOpenAIModel(config(),{fetch:(async()=>Response.json({model:'gpt-4.1-mini',choices:[{finish_reason:'stop',message:{content:`${key}`}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}})) as any});
 await assert.rejects(echoed.respond({messages:[],tools:[],signal:signal()}),(error:any)=>{assert.equal(error.code,'PROVIDER_SECRET');assert.doesNotMatch(error.message,/synthetic-test-secret/);return true;});
});

test('invalid JSON, incomplete responses, unavailable calls and malformed tool arguments fail safely',async()=>{
 const run=async(fetchFn:any,forcedTool?:string)=>createOpenAIModel(config(),{fetch:fetchFn}).respond({messages:[],tools:[tool],signal:signal(),forcedTool});
 await assert.rejects(run((async()=>new Response('{bad json',{status:200})) as any),{code:'PROVIDER_RESPONSE'});
 await assert.rejects(run((async()=>Response.json({choices:[]})) as any),{code:'PROVIDER_INCOMPLETE'});
 await assert.rejects(run((async()=>response({content:null,tool_calls:[{type:'function',function:{name:'retrieve_guidance',arguments:'{'}}]},'tool_calls')) as any),{code:'MODEL_ARGUMENTS'});
 await assert.rejects(run((async()=>response({content:null,tool_calls:[{type:'function',function:{name:'retrieve_guidance',arguments:'[]'}}]},'tool_calls')) as any),{code:'MODEL_ARGUMENTS'});
 await assert.rejects(run((async()=>response({content:'no tool'},'stop')) as any,'retrieve_guidance'),{code:'TOOL_DENIED'});
 await assert.rejects(run((async()=>response({content:null,tool_calls:[{type:'function',function:{name:'unknown',arguments:'{}'}}]},'tool_calls')) as any),{code:'TOOL_DENIED'});
 const tinyOutput=createOpenAIModel(config({DIKAN_MAX_OUTPUT_TOKENS:'1'}),{fetch:(async()=>response({content:'long'},'stop',{prompt_tokens:1,completion_tokens:2,total_tokens:3})) as any});
 await assert.rejects(tinyOutput.respond({messages:[],tools:[],signal:signal()}),{code:'MODEL_OUTPUT_LIMIT'});
});
