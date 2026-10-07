import type { Fact } from './index.ts';

export const chatToolNames = ['inspect_documents','prepare_email','fill_official_pdf','propose_workspace_update','prepare_stage_draft','retrieve_guidance','search_business_knowledge','prepare_enquiry','prepare_application','propose_facts','start_preparation','capability_limit'] as const;
export type ChatToolName = typeof chatToolNames[number];
export type ChatMode = 'live_agent'|'deterministic';
export type ChatStatus = 'queued'|'running'|'completed'|'needs_input'|'failed';
export type ChatAction = {type:'workspace_update'|'confirm_facts'|'review_artifact'|'open_preparation';label:string;endpoint?:string;payload?:unknown;jobId?:string};
export type ChatMessage = {id:string;conversationId:string;turnId:string;role:'user'|'assistant';content:string;createdAt:string;citations:unknown[];actions:ChatAction[]};
export type ChatModel = {name:string;version:string;canSelect?:(id:string)=>boolean;catalogue?:(signal:AbortSignal)=>Promise<{models:Array<{id:string;freeVerified:boolean}>;checkedAt:string}>;respond:(input:{messages:any[];tools:any[];signal:AbortSignal;modelId?:string;forcedTool?:string})=>Promise<{content:string;calls:Array<{name:string;arguments:Record<string,any>}>;usage:Record<string,unknown>}>};
export type ConfirmFactsRequest = {expectedRevision:number;facts:Fact[]};
