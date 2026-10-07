import {ApiError,ensure,hash} from '../contracts/index.ts';
import type {ChatModel} from '../contracts/chat.ts';
import {serialInference} from './model-queue.ts';
import type {Store} from './store.ts';

export function openrouterConfig(env:NodeJS.ProcessEnv=process.env){
 const base='https://openrouter.ai/api/v1';
 ensure(!env.OPENROUTER_BASE_URL||env.OPENROUTER_BASE_URL===base,'PROVIDER_URL','Only the official OpenRouter API is allowed');
 ensure(env.OPENROUTER_API_KEY?.trim(),'PROVIDER_KEY','Set OPENROUTER_API_KEY in the backend environment',503);
 ensure(env.OPENROUTER_MODEL&&/^[A-Za-z0-9_./:-]{1,150}$/.test(env.OPENROUTER_MODEL),'PROVIDER_MODEL','Set an exact OpenRouter model ID',503);
 const allowPaid=env.OPENROUTER_ALLOW_PAID==='true';
 ensure(allowPaid||env.OPENROUTER_MODEL!.endsWith(':free'),'FREE_MODEL_REQUIRED','Only an explicit :free model may be configured unless OPENROUTER_ALLOW_PAID=true.',503);
 const maxIn=Number(env.OPENROUTER_MAX_INPUT_USD_PER_M||'1'),maxOut=Number(env.OPENROUTER_MAX_OUTPUT_USD_PER_M||'3');
 ensure(Number.isFinite(maxIn)&&maxIn>=0&&Number.isFinite(maxOut)&&maxOut>=0,'PROVIDER_LIMIT','Invalid OpenRouter price cap');
 const limit=(key:string,fallback:number,max:number)=>{const n=Number(env[key]||fallback);ensure(Number.isInteger(n)&&n>0&&n<=max,'PROVIDER_LIMIT',`Invalid ${key}`);return n;};
 return {allowPaid,maxIn,maxOut,base:base!,key:env.OPENROUTER_API_KEY!.trim(),model:env.OPENROUTER_MODEL!,maxOutput:limit('DIKAN_MAX_OUTPUT_TOKENS',4096,4096),maxInput:limit('DIKAN_MAX_INPUT_BYTES',60000,200000),daily:limit('DIKAN_MAX_REQUESTS_PER_DAY',100,1000)};
}
// Bridge the existing provider-neutral transcript to native call IDs and JSON arguments.
export function wireMessages(messages:any[]){
 const pending:Array<{id:string;name:string}>=[];let index=0;
 return messages.map(m=>{
  if(m.role==='assistant'&&m.tool_calls?.length){const calls=m.tool_calls.map((c:any)=>{const id=c.id||`dikan_${index++}`;pending.push({id,name:c.function.name});return {id,type:'function',function:{name:c.function.name,arguments:JSON.stringify(c.function.arguments)}};});return {role:'assistant',content:m.content||null,tool_calls:calls};}
  if(m.role==='tool'){const i=pending.findIndex(c=>c.name===m.tool_name);ensure(i>=0,'TOOL_TRANSCRIPT','Tool result has no matching call');const [call]=pending.splice(i,1);return {role:'tool',tool_call_id:call.id,content:m.content};}
  return {role:m.role,content:m.content};
 });
}
export function createOpenRouterModel(config:ReturnType<typeof openrouterConfig>,options:{fetch?:typeof fetch;store?:Store}={}):ChatModel{
 let day='',count=0;
 let catalogue:{models:Array<{id:string;freeVerified:boolean}>;checkedAt:string}|null=null;
 const zero=(value:unknown)=>value===0||(typeof value==='string'&&/^0+(?:\.0+)?$/.test(value));
 const isFree=(entry:any)=>typeof entry?.id==='string'&&entry.id.endsWith(':free')&&zero(entry?.pricing?.prompt)&&zero(entry?.pricing?.completion)&&Object.values(entry.pricing).every(zero)&&entry?.supported_parameters?.includes('tools');
 const withinCap=(entry:any)=>{const i=Number(entry?.pricing?.prompt)*1e6,o=Number(entry?.pricing?.completion)*1e6;return typeof entry?.id==='string'&&Number.isFinite(i)&&Number.isFinite(o)&&i<=config.maxIn&&o<=config.maxOut&&Array.isArray(entry?.supported_parameters)&&entry.supported_parameters.includes('tools');};
 const allowed=(entry:any)=>isFree(entry)||(config.allowPaid&&withinCap(entry));
 return {name:'openrouter',version:config.model,canSelect(id){return id===config.model||!!catalogue?.models.some(item=>item.id===id&&item.freeVerified)},async catalogue(signal){
  if(catalogue&&Date.now()-Date.parse(catalogue.checkedAt)<15*60*1000)return catalogue;
  let response:Response;try{response=await (options.fetch||fetch)(config.base+'/models',{headers:{Authorization:'Bearer '+config.key},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});}catch{throw new ApiError(503,'CATALOGUE_UNAVAILABLE','OpenRouter model catalogue is unavailable.');}
  ensure(response.ok,'CATALOGUE_HTTP',`OpenRouter catalogue returned HTTP ${response.status}`,502);
  let data:any;try{data=await response.json();}catch{throw new ApiError(502,'CATALOGUE_RESPONSE','OpenRouter returned invalid catalogue JSON');}
  ensure(Array.isArray(data.data),'CATALOGUE_RESPONSE','OpenRouter returned no model list',502);
  catalogue={models:data.data.filter((item:any)=>typeof item?.id==='string'&&/^[A-Za-z0-9_./:-]{1,150}$/.test(item.id)).map((item:any)=>({id:item.id,freeVerified:!!allowed(item)})),checkedAt:new Date().toISOString()};return catalogue;
 },async respond({messages,tools,signal,modelId,forcedTool}){
  const selected=modelId||config.model;await this.catalogue!(signal);ensure(!!catalogue?.models.some(item=>item.id===selected&&item.freeVerified),'MODEL_NOT_VERIFIED_FREE',config.allowPaid?'This model is not within the configured price cap or lacks tool support. No request was sent.':'This model is not verified free in the current catalogue. No request was sent.',409);
  ensure(!forcedTool||tools.some(t=>t.function.name===forcedTool),'TOOL_DENIED','Required output tool is unavailable');
  const body=JSON.stringify({...(forcedTool?{tool_choice:{type:'function',function:{name:forcedTool}}}:{}),model:selected,messages:wireMessages(messages),...(tools.length?{tools}:{}),stream:false,...(config.allowPaid?{}:{reasoning:{enabled:false}}),provider:{require_parameters:true,allow_fallbacks:false,max_price:config.allowPaid?{prompt:config.maxIn,completion:config.maxOut,request:0,image:0}:{prompt:0,completion:0,request:0,image:0}},max_tokens:config.maxOutput});
  ensure(Buffer.byteLength(body)<=config.maxInput,'CONTEXT_LIMIT','Saved context exceeds the configured request limit. No request was sent.',413);
  return serialInference(signal,async()=>{
   const today=new Date().toISOString().slice(0,10);if(day!==today){day=today;count=0;}
   const record=options.store?.get('provider_budget','openrouter-'+today);const used=record?.requests??count;
   ensure(used<config.daily,'DAILY_BUDGET','Daily OpenRouter request limit reached. No fallback was run.',429);
   count=used+1;options.store?.put('provider_budget','openrouter-'+today,'provider',{requests:count});
   let response:Response;
   try{response=await (options.fetch||fetch)(config.base+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.key},body,signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});}
   catch{throw new ApiError(503,'PROVIDER_UNAVAILABLE','OpenRouter request failed or timed out. No fallback was run.');}
   // Never echo provider error bodies: they can contain credentials or private inputs.
   const guidance=response.status===429?'The selected model is rate limited. Try again later or choose another permitted model in model settings.':response.status===401?'OpenRouter rejected the API key. Update the server connection before trying again.':response.status===402?'OpenRouter reports insufficient account credit. Check the account and selected model.':response.status>=500?'OpenRouter is temporarily unavailable. Try again later.':'OpenRouter could not complete this request.';
   ensure(response.ok,'PROVIDER_HTTP',`${guidance} (HTTP ${response.status}.) No fallback was run.`,response.status===429?429:502);
   let result:any;try{result=await response.json();}catch{throw new ApiError(502,'PROVIDER_RESPONSE','OpenRouter returned invalid JSON');}
   ensure(!JSON.stringify(result).includes(config.key),'PROVIDER_SECRET','Provider response rejected',502);
   const choice=result.choices?.[0];ensure(choice&&['stop','tool_calls'].includes(choice.finish_reason),'PROVIDER_INCOMPLETE','OpenRouter did not complete the response within its limits',502);
   const native=choice.message?.tool_calls||[];ensure(Array.isArray(native)&&native.length<=5,'MODEL_CALL_LIMIT','Too many tool calls',502);
   const calls=native.map((c:any)=>{ensure(c.type==='function'&&tools.some(t=>t.function.name===c.function?.name),'TOOL_DENIED','Provider selected an unavailable tool',502);let args:any;try{args=JSON.parse(c.function.arguments);}catch{throw new ApiError(502,'MODEL_ARGUMENTS','Provider returned invalid tool arguments');}ensure(args&&typeof args==='object'&&!Array.isArray(args),'MODEL_ARGUMENTS','Tool arguments must be an object',502);return {name:c.function.name,arguments:args};});
   const content=typeof choice.message?.content==='string'?choice.message.content.replace(/<think>[\s\S]*?<\/think>/gi,'').trim():'';
   ensure(!/<\/?think>/i.test(content),'MODEL_REASONING','Incomplete reasoning block',502);
   ensure(!JSON.stringify({content,calls}).includes(config.key),'PROVIDER_SECRET','Provider response rejected',502);
   return {content,calls,usage:{provider:'openrouter',model:typeof result.model==='string'?result.model:selected,requestedModel:selected,promptTokens:result.usage?.prompt_tokens??null,outputTokens:result.usage?.completion_tokens??null,totalTokens:result.usage?.total_tokens??null,costUsd:typeof result.usage?.cost==='number'?result.usage.cost:null,at:new Date().toISOString(),responseHash:hash({content,calls})}};
  });
 }};
}
