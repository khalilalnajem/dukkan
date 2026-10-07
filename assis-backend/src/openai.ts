import {ApiError,ensure,hash} from '../contracts/index.ts';
import type {ChatModel} from '../contracts/chat.ts';
import {serialInference} from './model-queue.ts';
import {wireMessages} from './openrouter.ts';
import type {Store} from './store.ts';

const BASE='https://api.openai.com/v1';
const PRICES:Record<string,{input:number;cachedInput:number;output:number}>={
 'gpt-4.1-mini':{input:0.40,cachedInput:0.10,output:1.60},
 'gpt-4o-mini':{input:0.15,cachedInput:0.075,output:0.60}
};
const cappedNumber=(env:NodeJS.ProcessEnv,key:string,fallback:number,max:number)=>{
 const value=Number(env[key]||fallback);
 ensure(Number.isFinite(value)&&value>=0&&value<=max,'PROVIDER_LIMIT',`Invalid ${key}`);
 return value;
};
const limit=(env:NodeJS.ProcessEnv,key:string,fallback:number,max:number)=>{
 const value=Number(env[key]||fallback);
 ensure(Number.isInteger(value)&&value>0&&value<=max,'PROVIDER_LIMIT',`Invalid ${key}`);
 return value;
};

export function openaiConfig(env:NodeJS.ProcessEnv=process.env){
 ensure(!env.OPENAI_BASE_URL||env.OPENAI_BASE_URL===BASE,'PROVIDER_URL','Only the official OpenAI API is allowed');
 ensure(env.OPENAI_API_KEY?.trim(),'PROVIDER_KEY','Set OPENAI_API_KEY in the backend environment',503);
 const model=env.OPENAI_MODEL||'gpt-4.1-mini';
 ensure(Object.hasOwn(PRICES,model),'PROVIDER_MODEL','Choose gpt-4.1-mini or gpt-4o-mini',503);
 const maxInputUsdPerM=cappedNumber(env,'OPENAI_MAX_INPUT_USD_PER_M',0.40,0.40);
 const maxOutputUsdPerM=cappedNumber(env,'OPENAI_MAX_OUTPUT_USD_PER_M',1.60,1.60);
 return {base:BASE,key:env.OPENAI_API_KEY.trim(),model,maxInputUsdPerM,maxOutputUsdPerM,
  maxOutput:limit(env,'DIKAN_MAX_OUTPUT_TOKENS',4096,4096),
  maxInput:limit(env,'DIKAN_MAX_INPUT_BYTES',60000,200000),
  daily:limit(env,'DIKAN_MAX_REQUESTS_PER_DAY',100,1000)};
}

function safeTokenCount(value:unknown):number|null{
 return typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.floor(value):null;
}
function permitted(model:string,config:ReturnType<typeof openaiConfig>){
 const price=PRICES[model];return !!price&&price.input<=config.maxInputUsdPerM&&price.output<=config.maxOutputUsdPerM;
}
function errorGuidance(status:number,code:unknown){
 const billing=code==='insufficient_quota'||code==='billing_hard_limit_reached'||code==='credit_balance_exhausted';
 if(status===401)return 'OpenAI rejected the API key. Update the server connection before trying again.';
 if(status===403)return billing?'OpenAI reports that the account has insufficient API credit or quota. Check billing and account limits.':'OpenAI denied this request for the account or model. Check account access and model availability.';
 if(status===429)return billing?'OpenAI reports insufficient API credit or quota. Check billing and account limits.':'OpenAI rate limited this request. Try again later.';
 if(status>=500)return 'OpenAI is temporarily unavailable. Try again later.';
 return 'OpenAI could not complete this request. Check model access and request settings.';
}

export function createOpenAIModel(config:ReturnType<typeof openaiConfig>,options:{fetch?:typeof fetch;store?:Store}={}):ChatModel{
 let day='',count=0;
 const modelList=()=>Object.keys(PRICES).map(id=>({id,freeVerified:permitted(id,config)}));
 return {name:'openai',version:config.model,canSelect(id){return permitted(id,config)},async catalogue(){return {models:modelList(),checkedAt:new Date().toISOString()}},async respond({messages,tools,signal,modelId,forcedTool}){
  const selected=modelId||config.model;
  ensure(Object.hasOwn(PRICES,selected)&&permitted(selected,config),'MODEL_NOT_PERMITTED','This OpenAI model is outside the configured price caps. No request was sent.',409);
  ensure(!forcedTool||tools.some(tool=>tool.function?.name===forcedTool),'TOOL_DENIED','Required output tool is unavailable');
  const body=JSON.stringify({model:selected,messages:wireMessages(messages),...(tools.length?{tools}:{}),...(forcedTool?{tool_choice:{type:'function',function:{name:forcedTool}}}:{}),stream:false,max_tokens:config.maxOutput});
  ensure(Buffer.byteLength(body)<=config.maxInput,'CONTEXT_LIMIT','Saved context exceeds the configured request limit. No request was sent.',413);
  return serialInference(signal,async()=>{
   const today=new Date().toISOString().slice(0,10);if(day!==today){day=today;count=0;}
   const budgetKey='openai-'+today;const record=options.store?.get('provider_budget',budgetKey);const used=record?.requests??count;
   ensure(used<config.daily,'DAILY_BUDGET','Daily OpenAI request limit reached. No retry or fallback was run.',429);
   count=used+1;options.store?.put('provider_budget',budgetKey,'provider',{requests:count});
   let response:Response;
   try{response=await (options.fetch||fetch)(BASE+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.key},body,signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});}
   catch{signal.throwIfAborted();throw new ApiError(503,'PROVIDER_UNAVAILABLE','OpenAI request failed or timed out. No retry or fallback was run.');}
   if(!response.ok){let code:unknown;try{const errorBody=await response.json();const candidate=errorBody?.error?.code;if(typeof candidate==='string'&&/^[a-z_]{1,64}$/.test(candidate))code=candidate;}catch{/* provider body is deliberately discarded */}
    const message=`${errorGuidance(response.status,code)} (HTTP ${response.status}.) No retry or fallback was run.`;
    throw new ApiError([401,403,429].includes(response.status)?response.status:502,'PROVIDER_HTTP',message);
   }
   let result:any;try{result=await response.json();}catch{throw new ApiError(502,'PROVIDER_RESPONSE','OpenAI returned invalid JSON');}
   ensure(!JSON.stringify(result).includes(config.key),'PROVIDER_SECRET','Provider response rejected',502);
   const choice=result.choices?.[0];ensure(choice&&['stop','tool_calls'].includes(choice.finish_reason),'PROVIDER_INCOMPLETE','OpenAI did not complete the response within its limits',502);
   const native=choice.message?.tool_calls||[];ensure(Array.isArray(native)&&native.length<=5,'MODEL_CALL_LIMIT','Too many tool calls',502);
   const calls=native.map((call:any)=>{
    ensure(call.type==='function'&&tools.some(tool=>tool.function?.name===call.function?.name),'TOOL_DENIED','OpenAI selected an unavailable tool',502);
    let args:any;try{ensure(typeof call.function.arguments==='string','MODEL_ARGUMENTS','Tool arguments must be a JSON object',502);args=JSON.parse(call.function.arguments);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(502,'MODEL_ARGUMENTS','OpenAI returned invalid tool arguments');}
    ensure(args&&typeof args==='object'&&!Array.isArray(args),'MODEL_ARGUMENTS','Tool arguments must be an object',502);
    return {name:call.function.name,arguments:args};
   });
   if(forcedTool)ensure(calls.some(call=>call.name===forcedTool),'TOOL_DENIED','OpenAI did not return the required app action',502);
   const content=typeof choice.message?.content==='string'?choice.message.content.trim():'';
   const usage=result.usage||{};const promptTokens=safeTokenCount(usage.prompt_tokens);const outputTokens=safeTokenCount(usage.completion_tokens);
   ensure(outputTokens===null||outputTokens<=config.maxOutput,'MODEL_OUTPUT_LIMIT','OpenAI response exceeded the configured output token limit',502);
   const cachedPromptTokens=Math.min(promptTokens??0,safeTokenCount(usage.prompt_tokens_details?.cached_tokens)??0);
   const price=PRICES[selected];const costUsd=promptTokens===null||outputTokens===null?null:((promptTokens-cachedPromptTokens)*price.input+cachedPromptTokens*price.cachedInput+outputTokens*price.output)/1_000_000;
   ensure(!JSON.stringify({content,calls}).includes(config.key),'PROVIDER_SECRET','Provider response rejected',502);
   return {content,calls,usage:{provider:'openai',model:typeof result.model==='string'?result.model:selected,requestedModel:selected,promptTokens,outputTokens,totalTokens:safeTokenCount(usage.total_tokens),cachedPromptTokens,costUsd,costEstimated:costUsd!==null,inputUsdPerMillion:price.input,cachedInputUsdPerMillion:price.cachedInput,outputUsdPerMillion:price.output,at:new Date().toISOString(),responseHash:hash({content,calls})}};
  });
 }};
}
