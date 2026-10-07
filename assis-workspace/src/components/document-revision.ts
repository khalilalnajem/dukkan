/** A queued revision is not a saved file. Only a matching completed output is usable. */
export function hasMatchingReview(artifact:{hash:string;review?:unknown}):boolean{
 return !!artifact.review&&typeof artifact.review==='object'&&'hash' in artifact.review&&artifact.review.hash===artifact.hash
}
type RevisionArtifact={id:string;hash:string;turnId:string;conversationId:string;kind:string;supersedesArtifactId?:string|null}
type Snapshot<T>={turn:{id:string;status:string};artifacts:T[]}
export function revisionPause(signal:AbortSignal,ms=1400):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason??new Error('Cancelled'));return}
  const abort=()=>{clearTimeout(timer);reject(signal.reason??new Error('Cancelled'))}
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
  signal.addEventListener('abort',abort,{once:true})
 })
}
export async function awaitDocumentRevision<T extends RevisionArtifact>({turnId,original,signal,read,pause=revisionPause}:{turnId:string;original:RevisionArtifact;signal:AbortSignal;read:()=>Promise<Snapshot<T>>;pause?:(signal:AbortSignal)=>Promise<void>}):Promise<T>{
 while(true){
  signal.throwIfAborted()
  const snapshot=await read()
  signal.throwIfAborted()
  if(snapshot.turn.id!==turnId)throw new Error('Unexpected revision response. Your edits are still here.')
  if(snapshot.turn.status==='completed'){
   const result=snapshot.artifacts.find(item=>item.turnId===turnId&&item.conversationId===original.conversationId&&item.kind===original.kind&&item.supersedesArtifactId===original.id&&item.id!==original.id&&!!item.hash)
   if(!result)throw new Error('The revision finished without a saved document. Your edits are still here.')
   return result
  }
  if(snapshot.turn.status==='failed'||snapshot.turn.status==='needs_input')throw new Error(snapshot.turn.status==='needs_input'?'The revision needs more information. Your edits are still here.':'The revision failed. Your edits are still here.')
  if(snapshot.turn.status!=='queued'&&snapshot.turn.status!=='running')throw new Error('Unknown revision status. Your edits are still here.')
  await pause(signal)
 }
}
