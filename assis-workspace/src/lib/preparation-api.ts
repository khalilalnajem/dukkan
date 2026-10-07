import {accountHeaders} from './cloud-client.ts'
import {z} from 'zod'

// Runtime authority: assis-backend/contracts/HANDOFF.md and index.ts.
// Browser projections intentionally exclude private document storage paths.
// Hosted builds use their own origin unless an API origin is configured.
export const API=import.meta.env?.VITE_API_ORIGIN || (typeof location!=='undefined' && !['localhost','127.0.0.1'].includes(location.hostname) ? location.origin+(location.pathname.startsWith('/dukkan/')?'/dukkan':'') : 'http://127.0.0.1:8789')
const text=z.string()
export const modeSchema=z.enum(['live_agent','deterministic','replay'])
export type ExecutionMode=z.infer<typeof modeSchema>
export const factSchema=z.object({field:text,value:z.unknown(),origin:text,sourceRef:text.nullable(),confirmedBy:text.nullable(),confirmedAt:text.nullable()})
export const caseSchema=z.object({schemaVersion:z.literal(1),businessId:text,businessRevision:z.number().int().positive(),facts:z.array(factSchema),factsHash:text,documentVersionIds:z.array(text),corrections:z.array(z.unknown())})
const record=z.record(text,z.unknown())
export const jobSchema=z.object({schemaVersion:z.literal(1),jobId:text,businessId:text,businessRevision:z.number().int(),factsHash:text,status:z.enum(['queued','running','needs_input','blocked','retry_wait','awaiting_review','completed','failed','cancelled','superseded']),step:text,reasonCode:text.nullable(),executionMode:modeSchema,supersedesJobId:text.nullable(),questions:z.array(record).default([]),trace:z.array(z.object({callId:text,name:text,attempt:z.number(),ok:z.boolean(),error:z.unknown().nullable().optional(),at:text,provenance:z.array(z.unknown())})).default([]),error:z.object({code:text,message:text}).optional(),label:text.optional(),results:record.optional(),model:z.object({name:text,version:text}).nullable().optional(),modelTrace:z.array(z.object({at:text,model:text,toolCalls:z.array(record),promptTokens:z.number().nullable().optional(),outputTokens:z.number().nullable().optional()})).default([])})
export const packSchema=z.object({id:text,version:z.number(),hash:text,jobId:text,businessRevision:z.number(),checks:z.array(z.unknown()),blockers:z.array(z.unknown()),sources:z.array(z.unknown()),incomplete:z.boolean(),label:text})
export const reviewSchema=z.object({id:text,packHash:text,businessRevision:z.number(),actor:text,at:text,valid:z.boolean(),kind:text,label:text})
export const bundleSchema=z.object({job:jobSchema,case:caseSchema,pack:packSchema.nullable(),review:reviewSchema.nullable(),handoff:z.object({state:text,reasonCode:text.nullable().optional(),packHash:text.nullable(),destinationRef:text})})
export const caseResponseSchema=z.object({case:caseSchema,jobs:z.array(jobSchema),documents:z.array(record)})
export const fixtureSchema=z.object({facts:z.array(factSchema),files:z.array(z.object({name:text,mime:z.literal('application/pdf'),base64:text})),correction:z.unknown()})
export const healthSchema=z.object({status:text,executionModes:z.array(modeSchema),model:z.object({name:text,version:text}).nullable(),sourceActivation:text})
export type PreparationBundle=z.infer<typeof bundleSchema>
export type PreparationCase=z.infer<typeof caseSchema>
export type Fact=z.infer<typeof factSchema>
export type PreparationSummary={label:string;jobId:string;mode:ExecutionMode;reviewed:boolean}
export class PreparationError extends Error{code:string;status:number;constructor(code:string,message:string,status=0){super(message);this.code=code;this.status=status}}
export async function request<T>(path:string,schema:z.ZodType<T>,signal:AbortSignal,body?:unknown,key?:string):Promise<T>{
 const response=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:{...await accountHeaders(),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key||crypto.randomUUID()})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])})
 const data=await response.json()
 if(!response.ok)throw new PreparationError(data?.error?.code||'REQUEST_FAILED',data?.error?.message||'The local preparation request failed.',response.status)
 const parsed=schema.safeParse(data);if(!parsed.success)throw new PreparationError('INVALID_RESPONSE','The preparation service returned an unsupported response. No workspace changes were applied.')
 return parsed.data
}
export function preparationLabel(b:PreparationBundle){
 if(b.review?.valid&&b.pack?.hash===b.review.packHash&&b.review.businessRevision===b.case.businessRevision&&b.job.businessRevision===b.case.businessRevision)return 'Reviewed preparation draft: applicability questions open'
 const map:Record<PreparationBundle['job']['status'],string>={queued:'Queued',running:'Checking your preparation',retry_wait:'Retrying a local tool',needs_input:'A detail needs your confirmation',blocked:'Preparation draft: applicability questions open',awaiting_review:'Draft ready for your review',completed:'Draft reviewed; check applicability',failed:'Preparation could not finish',cancelled:'Preparation cancelled',superseded:'Earlier inputs; a newer check is needed'}
 return map[b.job.status]
}
export function executionLabel(mode:ExecutionMode){return mode==='live_agent'?'Live model tool execution':mode==='replay'?'Recorded replay':'Deterministic preparation · No live AI'}
export function message(value:unknown){if(typeof value==='string')return value;if(value&&typeof value==='object'){const r=value as Record<string,unknown>;return String(r.message||r.label||r.title||r.code||r.status||'Unresolved item')}return 'Unresolved item'}
export function safeLink(value:unknown){if(typeof value!=='string')return null;try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'?u.href:null}catch{return null}}
