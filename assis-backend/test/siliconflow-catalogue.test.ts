import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiliconFlowModel,siliconflowConfig} from '../src/siliconflow.ts';

test('catalogue does not mistake model availability for free pricing',async()=>{
 let calls=0;
 const config=siliconflowConfig({SILICONFLOW_BASE_URL:'https://api.siliconflow.com/v1',SILICONFLOW_API_KEY:'test-only-key',SILICONFLOW_MODEL:'deepseek-ai/DeepSeek-V3.2'});
 const model=createSiliconFlowModel(config,{fetch:async()=>{calls++;return new Response(JSON.stringify({data:[{id:'listed/without-price'},{id:'listed/paid',pricing:{input:0,output:0.2}},{id:'listed/free',pricing:{input:0,output:0}}]}),{status:200})}});
 const list=await model.catalogue!(new AbortController().signal);
 assert.equal(list.models.length,3);
 assert.deepEqual(list.models.map(item=>item.freeVerified),[false,false,true]);
 assert.equal(model.canSelect!('listed/without-price'),false);
 assert.equal(model.canSelect!('listed/paid'),false);
 assert.equal(model.canSelect!('listed/free'),true);
 await assert.rejects(()=>model.respond({messages:[{role:'user',content:'hello'}],tools:[],signal:new AbortController().signal,modelId:'listed/paid'}),{code:'MODEL_NOT_VERIFIED_FREE'});
 assert.equal(calls,1,'the unverified model must not reach chat completions');
});
