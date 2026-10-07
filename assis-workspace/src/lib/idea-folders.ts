import {businessStorage,captureBusinessSession} from './account-storage.ts'
import {KEY,OLD_KEY,blank,loadWorkspace,workspaceSchema,type Workspace} from './workspace.ts'

export const FOLDERS_KEY='dukkan-idea-folders-v1'
export type IdeaFolder={id:string;name:string;createdAt:string}
export type IdeaCollection={folders:IdeaFolder[];selectedId:string;error:string}
const legacy:IdeaFolder={id:'legacy',name:'My first idea',createdAt:''}
export const ideaKey=(id:string)=>id==='legacy'?KEY:`dukkan-idea-workspace-v1:${id}`

// A legacy workspace exists only where the pre-folder app saved one (current or migrated key).
function hasLegacyWorkspace(){return businessStorage.getItem(KEY)!==null||businessStorage.getItem(OLD_KEY)!==null}

export function readIdeas():IdeaCollection{
 try{
  const raw=businessStorage.getItem(FOLDERS_KEY)
  // Fresh install: no folder list and no legacy workspace, so start empty instead of surfacing old drafts.
  if(!raw)return hasLegacyWorkspace()?{folders:[legacy],selectedId:'legacy',error:''}:{folders:[],selectedId:'',error:''}
  const value=JSON.parse(raw)
  if(!Array.isArray(value.folders))throw new Error('Invalid idea folder list')
  const folders=value.folders.filter((folder:IdeaFolder)=>typeof folder?.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(folder.id)&&typeof folder.name==='string'&&typeof folder.createdAt==='string')
  if(folders.length!==value.folders.length)throw new Error('Invalid idea folder list')
  return {folders,selectedId:folders.some((folder:IdeaFolder)=>folder.id===value.selectedId)?value.selectedId:folders[0]?.id||'',error:''}
 }catch{return {folders:[legacy],selectedId:'legacy',error:'The idea folder list could not be read. It was left unchanged.'}}
}

export function readIdea(id:string):{workspace:Workspace;error:string}{
 if(id==='legacy')return loadWorkspace()
 try{const raw=businessStorage.getItem(ideaKey(id));return {workspace:raw?workspaceSchema.parse(JSON.parse(raw)):blank(),error:''}}
 catch{return {workspace:blank(),error:'This idea could not be read. Its saved data was left unchanged.'}}
}

export async function addIdea(name:string):Promise<IdeaCollection>{
 if(!navigator.locks)throw new Error('Safe browser saving is unavailable. No idea was created.')
 const accountSession=captureBusinessSession()
 const result=await navigator.locks.request(FOLDERS_KEY,()=>{
  accountSession.assert()
  const current=readIdeas();if(current.error)throw new Error(current.error)
  const id=crypto.randomUUID(),folder:IdeaFolder={id,name:name.trim().slice(0,80)||'Untitled idea',createdAt:new Date().toISOString()}
  const workspace=blank()
  businessStorage.setItem(ideaKey(id),JSON.stringify(workspace))
  const next={folders:[...current.folders,folder],selectedId:id,error:''}
  businessStorage.setItem(FOLDERS_KEY,JSON.stringify({folders:next.folders,selectedId:id}))
  return next
 });await accountSession.flush();return result
}

export async function selectIdea(id:string):Promise<IdeaCollection>{
 if(!navigator.locks)throw new Error('Safe browser saving is unavailable. Selection was not changed.')
 const accountSession=captureBusinessSession()
 const result=await navigator.locks.request(FOLDERS_KEY,()=>{
  accountSession.assert()
  const current=readIdeas();if(current.error)throw new Error(current.error)
  if(!current.folders.some(folder=>folder.id===id))throw new Error('That idea folder no longer exists.')
  const next={...current,selectedId:id}
  businessStorage.setItem(FOLDERS_KEY,JSON.stringify({folders:next.folders,selectedId:id}))
  return next
 });await accountSession.flush();return result
}

export async function renameIdea(id:string,name:string):Promise<IdeaCollection>{
 if(!navigator.locks)throw new Error('Safe browser saving is unavailable. Folder name was not changed.')
 const accountSession=captureBusinessSession()
 const result=await navigator.locks.request(FOLDERS_KEY,()=>{
  accountSession.assert()
  const current=readIdeas();if(current.error)throw new Error(current.error)
  if(!current.folders.some(folder=>folder.id===id))throw new Error('That idea folder no longer exists.')
  const folders=current.folders.map(folder=>folder.id===id?{...folder,name:name.trim().slice(0,80)||folder.name}:folder)
  businessStorage.setItem(FOLDERS_KEY,JSON.stringify({folders,selectedId:current.selectedId}))
  return {...current,folders}
 });await accountSession.flush();return result
}

export const TRASH_KEY='dukkan-idea-bin-v1'
export type TrashedIdea=IdeaFolder & {removedAt:string}
export function readIdeaBin():TrashedIdea[]{
 const raw=businessStorage.getItem(TRASH_KEY)
 if(!raw)return []
 const rows=JSON.parse(raw)
 if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.id!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(row.id)||typeof row.name!=='string'||typeof row.createdAt!=='string'||typeof row.removedAt!=='string'))throw new Error('The bin could not be read. No records were changed.')
 return rows
}
// Keep the workspace and its chat association intact. Only membership changes.
export async function moveIdeaToBin(id:string):Promise<IdeaCollection>{
 if(!navigator.locks)throw new Error('Safe saving is unavailable.')
 const accountSession=captureBusinessSession()
 const result=await navigator.locks.request(FOLDERS_KEY,()=>{
  accountSession.assert()
  const current=readIdeas();if(current.error)throw new Error(current.error)
  const folder=current.folders.find(row=>row.id===id);if(!folder)throw new Error('This idea is no longer in the sidebar.')
  const previous=businessStorage.getItem(TRASH_KEY),bin=readIdeaBin()
  const folders=current.folders.filter(row=>row.id!==id),selectedId=current.selectedId===id?folders[0]?.id||'':current.selectedId
  businessStorage.setItem(TRASH_KEY,JSON.stringify([...bin.filter(row=>row.id!==id),{...folder,removedAt:new Date().toISOString()}]))
  try{businessStorage.setItem(FOLDERS_KEY,JSON.stringify({folders,selectedId}))}
  catch(e){if(previous===null)businessStorage.removeItem(TRASH_KEY);else businessStorage.setItem(TRASH_KEY,previous);throw e}
  return {folders,selectedId,error:''}
 });await accountSession.flush();return result
}
export async function restoreIdeaFromBin(id:string):Promise<IdeaCollection>{
 if(!navigator.locks)throw new Error('Safe saving is unavailable.')
 const accountSession=captureBusinessSession()
 const result=await navigator.locks.request(FOLDERS_KEY,()=>{
  accountSession.assert()
  const current=readIdeas();if(current.error)throw new Error(current.error)
  const bin=readIdeaBin(),row=bin.find(item=>item.id===id);if(!row)throw new Error('This idea is no longer in the bin.')
  const {removedAt,...folder}=row
  const folders=current.folders.some(item=>item.id===id)?current.folders:[...current.folders,folder]
  const selectedId=current.selectedId||id
  businessStorage.setItem(FOLDERS_KEY,JSON.stringify({folders,selectedId}))
  // If cleanup fails, the restored idea remains safe and a retry is idempotent.
  businessStorage.setItem(TRASH_KEY,JSON.stringify(bin.filter(item=>item.id!==id)))
  return {folders,selectedId,error:''}
 });await accountSession.flush();return result
}
