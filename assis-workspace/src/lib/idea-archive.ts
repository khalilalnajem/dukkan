import {businessStorage,captureBusinessSession} from './account-storage.ts'
import {z} from 'zod'
import {FOLDERS_KEY,ideaKey,readIdea,readIdeas,type IdeaCollection,type IdeaFolder} from './idea-folders.ts'
import {KEY,OLD_KEY,workspaceSchema} from './workspace.ts'

export const ARCHIVE_KEY='dukkan-idea-archive-v1'
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)
const folderSchema=z.object({id,name:z.string(),createdAt:z.string()})
const packageSchema=z.object({version:z.literal(1),folder:folderSchema,workspace:workspaceSchema})
const archiveSchema=z.object({
 version:z.literal(1),createdAt:z.string(),folders:z.array(folderSchema).min(1),selectedId:id,
 records:z.record(z.string(),z.string().nullable()),
})
export type IdeaArchive=z.infer<typeof archiveSchema>

function requireLocks(){if(!navigator.locks)throw new Error('Safe browser saving is unavailable. Nothing was changed.')}
function current(){const ideas=readIdeas();if(ideas.error)throw new Error(ideas.error);return ideas}
function collection(folders:IdeaFolder[],selectedId:string):IdeaCollection{return {folders,selectedId,error:''}}
function writeIndex(folders:IdeaFolder[],selectedId:string){businessStorage.setItem(FOLDERS_KEY,JSON.stringify({folders,selectedId}))}
function keysFor(folders:IdeaFolder[]){return [FOLDERS_KEY,KEY,OLD_KEY,...folders.filter(folder=>folder.id!=='legacy').map(folder=>ideaKey(folder.id))]}
function snapshot(folders:IdeaFolder[],selectedId:string):IdeaArchive{
 const records:Record<string,string|null>=Object.fromEntries(keysFor(folders).map(key=>[key,businessStorage.getItem(key)]))
 return archiveSchema.parse({version:1,createdAt:new Date().toISOString(),folders,selectedId,records})
}
function allowedKey(key:string){return key===FOLDERS_KEY||key===KEY||key===OLD_KEY||/^dukkan-idea-workspace-v1:[A-Za-z0-9_-]{1,100}$/.test(key)}

export function exportIdea(idToExport:string){
 const ideas=current(),folder=ideas.folders.find(item=>item.id===idToExport)
 if(!folder)throw new Error('That idea does not exist.')
 const loaded=readIdea(idToExport)
 if(loaded.error)throw new Error(loaded.error)
 return JSON.stringify(packageSchema.parse({version:1,folder,workspace:loaded.workspace}),null,2)
}

export async function importIdea(raw:string):Promise<IdeaCollection>{
 requireLocks()
 const pack=packageSchema.parse(JSON.parse(raw))
 if(pack.folder.id==='legacy')throw new Error('Export a named idea folder before moving it between browsers.')
 const accountSession=captureBusinessSession()
 const result=await navigator.locks.request(FOLDERS_KEY,()=>{
  accountSession.assert()
  const ideas=current()
  if(ideas.folders.some(folder=>folder.id===pack.folder.id)||businessStorage.getItem(ideaKey(pack.folder.id))!==null)throw new Error('This idea already exists here. Nothing was replaced.')
  const key=ideaKey(pack.folder.id),value=JSON.stringify(pack.workspace)
  businessStorage.setItem(key,value)
  try{const folders=[...ideas.folders,pack.folder];writeIndex(folders,pack.folder.id);return collection(folders,pack.folder.id)}
  catch(error){businessStorage.removeItem(key);throw error}
 });await accountSession.flush();return result
}

export function readArchive():IdeaArchive|null{
 const raw=businessStorage.getItem(ARCHIVE_KEY)
 if(!raw)return null
 const saved=archiveSchema.parse(JSON.parse(raw))
 if(Object.keys(saved.records).some(key=>!allowedKey(key)))throw new Error('The archive contains an unexpected browser key.')
 return saved
}

export function loadArchiveFile(raw:string){
 if(readArchive())throw new Error('An archive is already stored here. Restore it before loading another.')
 const saved=archiveSchema.parse(JSON.parse(raw))
 if(Object.keys(saved.records).some(key=>!allowedKey(key)))throw new Error('The archive contains an unexpected browser key.')
 businessStorage.setItem(ARCHIVE_KEY,JSON.stringify(saved))
 return saved
}

export async function archiveOtherIdeas(keepId:string):Promise<IdeaCollection>{
 requireLocks()
 const accountSession=captureBusinessSession()
 const result=await navigator.locks.request(FOLDERS_KEY,()=>{
  accountSession.assert()
  const ideas=current()
  const keep=ideas.folders.find(folder=>folder.id===keepId)
  if(!keep)throw new Error('Choose the idea to keep first.')
  if(readIdea(keepId).error)throw new Error('The idea to keep could not be read. Nothing was cleared.')
  if(readArchive())throw new Error('Restore or download the existing archive before making another.')
  const archive=snapshot(ideas.folders,ideas.selectedId),raw=JSON.stringify(archive)
  businessStorage.setItem(ARCHIVE_KEY,raw)
  if(businessStorage.getItem(ARCHIVE_KEY)!==raw)throw new Error('Could not verify the archive. Nothing was cleared.')
  try{
   writeIndex([keep],keepId)
   for(const folder of ideas.folders)if(folder.id!==keepId)businessStorage.removeItem(ideaKey(folder.id))
   if(keepId!=='legacy')businessStorage.removeItem(OLD_KEY)
   return collection([keep],keepId)
  }catch(error){
   for(const [key,value] of Object.entries(archive.records))if(value===null)businessStorage.removeItem(key);else businessStorage.setItem(key,value)
   throw error
  }
 });await accountSession.flush();return result
}

export async function restoreArchivedIdeas():Promise<IdeaCollection>{
 requireLocks()
 const accountSession=captureBusinessSession()
 const result=await navigator.locks.request(FOLDERS_KEY,()=>{
  accountSession.assert()
  const archive=readArchive()
  if(!archive)throw new Error('No archive is available to restore.')
  const ideas=current(),merged=[...ideas.folders]
  for(const folder of archive.folders)if(!merged.some(item=>item.id===folder.id))merged.push(folder)
  for(const folder of archive.folders){
   const key=ideaKey(folder.id),previous=archive.records[key]
   if(businessStorage.getItem(key)===null&&typeof previous==='string')businessStorage.setItem(key,previous)
  }
  if(businessStorage.getItem(OLD_KEY)===null&&typeof archive.records[OLD_KEY]==='string')businessStorage.setItem(OLD_KEY,archive.records[OLD_KEY])
  writeIndex(merged,ideas.selectedId)
  businessStorage.removeItem(ARCHIVE_KEY)
  return collection(merged,ideas.selectedId)
 });await accountSession.flush();return result
}
