import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ApiError} from '../contracts/index.ts';
import {createFallbackModel,isProviderFailure} from '../src/fallback-model.ts';
import type {ChatModel} from '../contracts/chat.ts';

const ok=(name:string):ChatModel=>({name,version:name+'-v',async respond(){return {content:'from '+name,calls:[],usage:{provider:name}};}});
const failing=(code:string,status=502):ChatModel=>({name:'api',version:'api-v',async respond(){throw new ApiError(status,code,'boom');}});
const input=()=>({messages:[],tools:[],signal:new AbortController().signal});

test('primary answers when it works',async()=>{
 const r=await createFallbackModel(ok('api'),ok('gpt')).respond(input());
 assert.equal(r.content,'from api');
});

test('rate limit, outage and missing credit fall back to GPT and record why',async()=>{
 for(const code of ['PROVIDER_HTTP','PROVIDER_UNAVAILABLE','DAILY_BUDGET']){
  let seen='';
  const r=await createFallbackModel(failing(code),ok('gpt'),{onFallback:e=>{seen=(e as ApiError).code}}).respond(input());
  assert.equal(r.content,'from gpt');assert.equal(r.usage.fallbackReason,code);assert.equal(seen,code);
 }
});

test('tool and validation errors are not retried on the fallback',async()=>{
 await assert.rejects(createFallbackModel(failing('TOOL_DENIED'),ok('gpt')).respond(input()),{code:'TOOL_DENIED'});
 assert.equal(isProviderFailure(new ApiError(400,'INVALID_WORKSPACE_PROPOSAL','x')),false);
});

test('a user stop is never turned into a fallback call',async()=>{
 const c=new AbortController();c.abort();let called=false;
 const gpt:ChatModel={...ok('gpt'),async respond(){called=true;return {content:'',calls:[],usage:{}};}};
 await assert.rejects(createFallbackModel(failing('PROVIDER_UNAVAILABLE'),gpt).respond({...input(),signal:c.signal}));
 assert.equal(called,false);
});

test('choosing the GPT model in settings goes straight to GPT',async()=>{
 const r=await createFallbackModel(ok('api'),ok('gpt')).respond({...input(),modelId:'gpt-v'});
 assert.equal(r.content,'from gpt');
});
