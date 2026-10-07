import {ensure,hash,ApiError} from '../contracts/index.ts';
import type {ChatModel} from '../contracts/chat.ts';
import {serialInference} from './model-queue.ts';

export function createChatModel(options:{fetch?:typeof fetch}={}):ChatModel {
 const model='qwen3.8:27b-mlx';
 return {name:'ollama',version:model,async respond({messages,tools,signal}) {
  return serialInference(signal,async()=>{
   let response:Response;
   try {response=await (options.fetch||fetch)('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages,tools,think:false,stream:false,options:{temperature:0,num_predict:450,num_ctx:8192}}),signal:AbortSignal.any([signal,AbortSignal.timeout(180000)])});}
   catch(e:any){throw new ApiError(503,e.name==='TimeoutError'?'MODEL_TIMEOUT':'MODEL_UNAVAILABLE','Local free model did not respond. No fallback or completed action was recorded.');}
   ensure(response.ok,'MODEL_HTTP_ERROR',`Local free model returned HTTP ${response.status}`,502);
   const result=await response.json() as any;
   ensure(result.message&&result.done===true,'MODEL_INCOMPLETE','Local model returned an incomplete response',502);
   const calls=result.message.tool_calls||[];
   ensure(Array.isArray(calls)&&calls.length<=5,'MODEL_CALL_LIMIT','Model returned too many tool calls',502);
   // Never retain or display the provider's thinking field.
   const content=typeof result.message.content==='string'?result.message.content.replace(/<think>[\s\S]*?<\/think>/gi,'').trim():'';
   ensure(!/<\/?think>/i.test(content),'MODEL_REASONING','Model response contained an unfinished reasoning block',502);
   return {content,calls:calls.map((c:any)=>({name:c.function?.name,arguments:c.function?.arguments})),usage:{model,at:new Date().toISOString(),promptTokens:result.prompt_eval_count??null,outputTokens:result.eval_count??null,durationNs:result.total_duration??null,responseHash:hash({content,calls})}};
  });
 }};
}
