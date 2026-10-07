import {workspaceSchema,type Workspace} from './workspace.ts'
export type WriteResult={ok:boolean;reason?:string}
export const workspaceToken=(w:Workspace)=>JSON.stringify(workspaceSchema.parse(w))
export function applyNextAction(current:Workspace,expected:string,action:Workspace['nextAction']):Workspace{
 if(workspaceToken(current)!==expected)throw new Error('The workspace changed. Review the proposed follow-up again before applying it.')
 const nextAction=workspaceSchema.shape.nextAction.strict().parse(action)
 return workspaceSchema.parse({...current,nextAction})
}
export class WorkspaceWriter{
 private expectedRaw:string|null
 constructor(private storage:Pick<Storage,'getItem'|'setItem'>,private key:string){this.expectedRaw=storage.getItem(key)}
 acceptExplicitReplacement(){this.expectedRaw=this.storage.getItem(this.key)}
 // Call inside a same-origin Web Lock. Exact snapshots avoid lossy merge/hash collisions.
 persist(w:Workspace,isCurrent:()=>boolean):WriteResult{
  if(!isCurrent())return {ok:false,reason:'The workspace session changed. This result was not applied.'}
  const parsed=workspaceSchema.safeParse(w);if(!parsed.success)return {ok:false,reason:'Invalid workspace changes were rejected.'}
  try{
   if(this.storage.getItem(this.key)!==this.expectedRaw)return {ok:false,reason:'Another tab changed this workspace. Your edits remain in this tab; export them before reloading. No saved record was overwritten.'}
   const raw=JSON.stringify(parsed.data);this.storage.setItem(this.key,raw);this.expectedRaw=raw;return {ok:true}
  }catch{return {ok:false,reason:'Browser saving failed. Changes remain in this tab. Export a backup before closing.'}}
 }
}
