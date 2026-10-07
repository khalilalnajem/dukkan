import type {ChatModel} from '../contracts/chat.ts';

// Primary API model with a second provider as fallback. The fallback runs only
// when the primary provider fails to answer (unavailable, rate limited, out of
// credit, incomplete). Tool and validation errors are not provider failures and
// are never retried here. Aborts from the user are passed through untouched.
const providerFailures=new Set(['PROVIDER_HTTP','PROVIDER_UNAVAILABLE','PROVIDER_INCOMPLETE','PROVIDER_RESPONSE','DAILY_BUDGET','CATALOGUE_HTTP','CATALOGUE_RESPONSE','CATALOGUE_UNAVAILABLE','MODEL_NOT_VERIFIED_FREE','CODEX_EXIT','CODEX_TURN_FAILED','CODEX_UNAVAILABLE','MODEL_ARGUMENTS','MODEL_CALL_LIMIT']);

export function isProviderFailure(error:unknown){
 const code=(error as {code?:string})?.code;
 if(code&&providerFailures.has(code))return true;
 const status=(error as {status?:number})?.status;
 return !code&&typeof status!=='number';
}

export function createFallbackModel(primary:ChatModel,fallback:ChatModel,options:{onFallback?:(error:unknown)=>void}={}):ChatModel{
 return {
  name:`${primary.name}+${fallback.name}`,
  version:primary.version,
  canSelect:id=>id===fallback.version||id===primary.version||!!primary.canSelect?.(id)||!!fallback.canSelect?.(id),
  catalogue:(primary.catalogue||fallback.catalogue)?async signal=>{
   const base=primary.catalogue?await primary.catalogue(signal):{models:[{id:primary.version,freeVerified:true}],checkedAt:new Date().toISOString()};
   return {...base,models:[...base.models,...(base.models.some(m=>m.id===fallback.version)?[]:[{id:fallback.version,freeVerified:true}])]};
  }:undefined,
  async respond(input){
   if(input.modelId&&input.modelId===fallback.version)return fallback.respond({...input,modelId:undefined});
   try{return await primary.respond(input);}
   catch(error){
    if(input.signal.aborted||!isProviderFailure(error))throw error;
    options.onFallback?.(error);
    const result=await fallback.respond({...input,modelId:undefined});
    return {...result,usage:{...result.usage,fallbackFrom:primary.name,fallbackReason:(error as {code?:string})?.code||'PROVIDER_ERROR'}};
   }
  },
 };
}
