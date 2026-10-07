import {test} from 'node:test'
import assert from 'node:assert/strict'
import {addIdea,FOLDERS_KEY,ideaKey,readIdea,readIdeas,renameIdea,selectIdea} from '../src/lib/idea-folders.ts'
import {ARCHIVE_KEY,archiveOtherIdeas,exportIdea,importIdea,loadArchiveFile,readArchive,restoreArchivedIdeas} from '../src/lib/idea-archive.ts'
import {KEY,OLD_KEY,workedExample} from '../src/lib/workspace.ts'

function browser(){
 const data=new Map<string,string>()
 const localStorage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}}
 Object.defineProperty(globalThis,'localStorage',{value:localStorage,configurable:true})
 Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key:string,action:()=>unknown)=>action()}},configurable:true})
 return data
}

test('legacy idea stays in its existing workspace key',()=>{
 const data=browser(),saved=workedExample()
 data.set(KEY,JSON.stringify(saved))
 const ideas=readIdeas()
 assert.equal(ideas.selectedId,'legacy')
 assert.equal(ideas.folders.length,1)
 assert.equal(ideaKey('legacy'),KEY)
 assert.deepEqual(readIdea('legacy').workspace,saved)
 assert.equal(data.get(FOLDERS_KEY),undefined)
})

test('fresh browser starts with no idea folders',async()=>{
 const data=browser()
 assert.deepEqual(readIdeas(),{folders:[],selectedId:'',error:''})
 assert.equal(data.get(FOLDERS_KEY),undefined)
 const first=await addIdea('Coffee cart')
 assert.deepEqual(first.folders.map(folder=>folder.id),[first.selectedId])
 assert.equal(readIdeas().selectedId,first.selectedId)
})

test('migrated pre-v2 workspace still surfaces the legacy folder',()=>{
 const data=browser()
 data.set(OLD_KEY,'{}')
 const ideas=readIdeas()
 assert.equal(ideas.selectedId,'legacy')
 assert.equal(ideas.folders.length,1)
})

test('each new idea has its own saved folder and workspace',async()=>{
 const data=browser(),saved=workedExample()
 data.set(KEY,JSON.stringify(saved))
 const first=await addIdea('Coffee cart')
 const second=await addIdea('Study app')
 assert.equal(first.folders.length,2)
 assert.equal(second.folders.length,3)
 assert.equal(readIdea(first.selectedId).workspace.brief.idea,'')
 assert.notEqual(ideaKey(first.selectedId),ideaKey(second.selectedId))
 assert.deepEqual(readIdea('legacy').workspace,saved)
 const renamed=await renameIdea(second.selectedId,'Student planner')
 assert.equal(renamed.folders.at(-1)?.name,'Student planner')
 const selected=await selectIdea(first.selectedId)
 assert.equal(selected.selectedId,first.selectedId)
 assert.equal(readIdeas().selectedId,first.selectedId)
})

test('corrupt folder metadata is left untouched',async()=>{
 const data=browser()
 data.set(FOLDERS_KEY,'{"folders":"invalid"}')
 assert.match(readIdeas().error,/could not be read/)
 await assert.rejects(addIdea('Another'),/could not be read/)
 assert.equal(data.get(FOLDERS_KEY),'{"folders":"invalid"}')
})

test('idea file crosses browser origins with its exact folder ID and workspace',async()=>{
 const source=browser(),created=await addIdea('Pearl Studio'),id=created.selectedId
 const saved=workedExample();saved.brief.idea='Pearl Studio test'
 source.set(ideaKey(id),JSON.stringify(saved))
 const file=exportIdea(id)
 const target=browser(),imported=await importIdea(file)
 assert.equal(imported.selectedId,id)
 assert.equal(readIdea(id).workspace.brief.idea,'Pearl Studio test')
 assert.ok(target.has(ideaKey(id)))
 await assert.rejects(importIdea(file),/already exists/)
})

test('archive keeps selected idea and restores others without overwriting it',async()=>{
 const data=browser();data.set(KEY,JSON.stringify(workedExample()))
 const first=await addIdea('Old idea'),kept=await addIdea('Pearl Studio')
 const saved=workedExample();saved.brief.idea='Pearl Studio test';data.set(ideaKey(kept.selectedId),JSON.stringify(saved))
 const archived=await archiveOtherIdeas(kept.selectedId)
 assert.deepEqual(archived.folders.map(item=>item.id),[kept.selectedId])
 assert.equal(data.get(ideaKey(first.selectedId)),undefined)
 assert.equal(readIdea(kept.selectedId).workspace.brief.idea,'Pearl Studio test')
 const copy=JSON.stringify(readArchive())
 assert.ok(data.has(ARCHIVE_KEY))
 await assert.rejects(archiveOtherIdeas(kept.selectedId),/existing archive/)
 const restored=await restoreArchivedIdeas()
 assert.equal(restored.folders.length,3)
 assert.equal(restored.selectedId,kept.selectedId)
 assert.equal(data.get(ARCHIVE_KEY),undefined)
 assert.equal(readIdea(kept.selectedId).workspace.brief.idea,'Pearl Studio test')
 data.delete(ARCHIVE_KEY)
 loadArchiveFile(copy)
 assert.ok(readArchive())
})

test('archive storage failure leaves all idea folders untouched',async()=>{
 const data=browser();data.set(KEY,JSON.stringify(workedExample()))
 const old=await addIdea('Old idea'),kept=await addIdea('Pearl Studio')
 const storage=globalThis.localStorage
 Object.defineProperty(globalThis,'localStorage',{value:{...storage,setItem:(key:string,value:string)=>{if(key===ARCHIVE_KEY)throw new Error('quota');storage.setItem(key,value)}},configurable:true})
 await assert.rejects(archiveOtherIdeas(kept.selectedId),/quota/)
 assert.equal(readIdeas().folders.length,3)
 assert.ok(data.has(ideaKey(old.selectedId)))
 assert.equal(data.get(ARCHIVE_KEY),undefined)
})
