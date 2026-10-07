import {accountHeaders} from './cloud-client.ts'
import {z} from 'zod'
import {API,request} from './preparation-api.ts'

const record=z.record(z.string(),z.unknown())
export const conversationSchema=z.object({archived:z.boolean().optional(),id:z.string(),caseId:z.string().nullable().optional(),workspaceId:z.string().optional(),title:z.string(),createdAt:z.string(),updatedAt:z.string()})
export const eventSchema=z.object({id:z.string(),type:z.enum(['tool_started','tool_completed','tool_failed','action_required','error','pdf_field_updated','artifact_saved','email_draft_saved']),name:z.string(),label:z.string(),at:z.string(),result:z.unknown().optional(),error:z.unknown().optional()})
export const modelSchema=z.object({name:z.string(),version:z.string().optional()}).passthrough()
export const turnSchema=z.object({id:z.string(),conversationId:z.string(),status:z.enum(['queued','running','completed','needs_input','failed']),executionMode:z.enum(['live_agent','deterministic']),model:modelSchema.nullable().optional(),events:z.array(eventSchema).default([])}).passthrough()
export function modelLabel(model:{name:string;version?:string}|null|undefined){return model?[model.name,model.version].filter(Boolean).join(' · '):'AI'}
export const chatMessageSchema=z.object({id:z.string(),conversationId:z.string(),turnId:z.string().nullable().optional(),role:z.enum(['user','assistant']),content:z.string(),createdAt:z.string(),citations:z.array(record).default([]),actions:z.array(z.object({type:z.string(),label:z.string(),endpoint:z.string().optional(),payload:z.unknown().optional(),jobId:z.string().optional()})).default([])})
export const artifactSchema=z.object({id:z.string(),conversationId:z.string(),turnId:z.string(),kind:z.string(),title:z.string(),hash:z.string(),previewUrl:z.string(),reviewUrl:z.string(),exportUrl:z.string(),version:z.number().int().positive().optional(),supersedesArtifactId:z.string().nullable().optional(),stage:z.enum(['idea','validate','plan']).optional(),content:z.string().optional(),assumptions:z.array(z.string()).optional(),unknowns:z.array(z.string()).optional(),citations:z.array(record).optional(),proposedTest:z.object({hypothesis:z.string(),method:z.string(),audience:z.string(),decisionRule:z.string()}).optional(),ideaReview:z.object({dimensions:z.array(z.object({key:z.enum(['customer_need','differentiation','economics','feasibility','evidence']),score:z.number().int().min(0).max(4),reason:z.string(),evidenceNeeded:z.string()})),criticalRisks:z.array(z.string()),options:z.array(z.object({title:z.string(),kind:z.enum(['feature','expansion','pivot']),benefit:z.string(),tradeoff:z.string(),test:z.string()})),recommendation:z.enum(['test','revise','park']),rationale:z.string()}).optional(),fields:z.record(z.string(),z.string().nullable()).optional(),missingFields:z.array(z.string()).optional(),questions:z.array(z.object({field:z.string(),message:z.string()})).optional(),changedFields:z.array(z.record(z.string(),z.unknown())).optional()}).passthrough()
export const conversationResponse=z.object({conversation:conversationSchema,messages:z.array(chatMessageSchema),turns:z.array(turnSchema),artifacts:z.array(artifactSchema),case:z.unknown()})
export const turnResponse=z.object({turn:turnSchema,messages:z.array(chatMessageSchema),artifacts:z.array(artifactSchema),case:z.unknown()})
export const conversationList=z.object({conversations:z.array(conversationSchema)})
export type Conversation=z.infer<typeof conversationSchema>
export type ChatMessage=z.infer<typeof chatMessageSchema>
export type ChatTurn=z.infer<typeof turnSchema>
export type ChatArtifact=z.infer<typeof artifactSchema>
export type ChatMode='live_agent'|'deterministic'
export type RequestedAction={type:'stage_draft';stage:'idea'|'validate'|'plan'}|{type:'application_worksheet'}|{type:'official_pdf'}
export const chatRequest=request
export function sourceCaveats(limits:unknown):string[]{
 const names:Record<string,string>={
  RESEARCH_ONLY_NO_READINESS:'For research only. This does not confirm you are ready to launch.',
  CASE_APPLICABILITY_NOT_EVALUATED:'Confirm this applies to your business.',
  CASE_APPLICABILITY_UNRESOLVED:'Confirm this applies to your business.',
  CURRENTNESS_NOT_VERIFIED:'Current status has not been verified.',
  CURRENTNESS_UNRESOLVED:'Current status has not been verified.',
  PUBLICATION_DATE_UNKNOWN:'The publication date is not known.',
  EFFECTIVE_DATE_UNKNOWN:'The date this took effect is not known.',
  SOURCE_CONFLICT_UNRESOLVED:'Sources differ. Confirm which requirement applies.',
  SOURCE_CONFLICT:'Sources differ. Confirm which requirement applies.',
  NOT_LEGISLATION:'This is guidance, not legislation.',
  NO_LEGAL_READINESS:'This does not confirm legal readiness.',
 }
 if(!Array.isArray(limits))return []
 return [...new Set(limits.filter((x):x is string=>typeof x==='string').map(x=>names[x]||(/^[A-Z0-9_]+$/.test(x)?x.charAt(0)+x.slice(1).toLowerCase().replaceAll('_',' ')+'.':x)))]
}
export function mergeById<T extends {id:string}>(old:T[],incoming:T[]):T[]{
 const updates=new Map(incoming.map(item=>[item.id,item]))
 return [...old.map(item=>updates.get(item.id)||item),...incoming.filter(item=>!old.some(previous=>previous.id===item.id))]
}
export function artifactPath(value:string,id:string,action:'draft'|'review'|'export'){
 const url=new URL(value,API)
 const expected='/api/chat/artifacts/'+encodeURIComponent(id)+'/'+action
 if(url.origin!==new URL(API).origin||url.pathname!==expected)throw new Error('Unexpected file address. Nothing was opened.')
 return url.pathname+url.search
}
export async function verifiedDownload(artifact:ChatArtifact,signal:AbortSignal){
 const path=artifactPath(artifact.exportUrl,artifact.id,'export')
 const url=new URL(API+path);url.searchParams.set('hash',artifact.hash)
 const response=await fetch(url,{headers:await accountHeaders(),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])})
 if(!response.ok)throw new Error('This file must be reviewed before it can be downloaded.')
 const bytes=await response.arrayBuffer()
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')
 if(digest!==artifact.hash)throw new Error('The file changed after review. Download stopped.')
 return new Blob([bytes],{type:artifact.kind==='official_pdf'||artifact.format==='pdf'?'application/pdf':'text/html'})
}

export async function verifiedPreview(artifact:ChatArtifact,signal:AbortSignal){
 const path=artifactPath(artifact.previewUrl,artifact.id,'draft')
 const response=await fetch(API+path,{headers:await accountHeaders(),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])})
 if(!response.ok)throw new Error('This document could not be opened. Sign in or retry.')
 const bytes=await response.arrayBuffer()
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')
 if(digest!==artifact.hash)throw new Error('The document failed verification. Reopen its saved version.')
 return new Blob([bytes],{type:artifact.kind==='official_pdf'||artifact.format==='pdf'?'application/pdf':'text/html'})
}
