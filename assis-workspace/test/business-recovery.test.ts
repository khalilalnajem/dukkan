import test from 'node:test'
import assert from 'node:assert/strict'
import {addIdea,ideaKey,readIdea,moveIdeaToBin,restoreIdeaFromBin,readIdeaBin} from '../src/lib/idea-folders.ts'
import {exportIdea,importIdea} from '../src/lib/idea-archive.ts'
import {WorkspaceWriter} from '../src/lib/workspace-writer.ts'
import {entityTypes,saveLifecycle,type LifecycleValues} from '../../shared/lifecycle.ts'

// Exercise the production persistence/export/recovery boundary without touching a user browser.
function browser(){
 const data=new Map<string,string>()
 const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}}
 Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true})
 Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key:string,fn:()=>unknown)=>fn()}},configurable:true})
 return {data,storage}
}

test('all typed business records retain revisions, money and links through persistence, export, import and bin recovery',async()=>{
 const source=browser(),created=await addIdea('Synthetic recovery matrix'),id=created.selectedId
 let workspace=readIdea(id).workspace
 for(const [category,types] of Object.entries(entityTypes))for(const entityType of types){
  const values:LifecycleValues={category,entityType,title:'Synthetic '+entityType,details:'Isolated recovery fixture; no external event.',status:'prepared',basis:'simulated',...(entityType==='finance'||entityType==='budget'?{amount:'0.999',direction:'expense',date:'2026-01-01'}:{}),...(entityType==='quote'||entityType==='order'||entityType==='proposal'?{quantity:'3',unitPrice:'0.333'}:{})}
  workspace.lifecycle=saveLifecycle(workspace.lifecycle,values,entityType,'2026-01-01T00:00:00Z')
  let row=workspace.lifecycle.find(r=>r.id===entityType)!
  workspace.lifecycle=saveLifecycle(workspace.lifecycle,{...row.values,status:'approved'},row.id,'2026-01-02T00:00:00Z')
  row=workspace.lifecycle.find(r=>r.id===entityType)!
  workspace.lifecycle=saveLifecycle(workspace.lifecycle,{...row.values,status:'prepared',details:values.details+' Revised.'},row.id,'2026-01-03T00:00:00Z')
 }
 const order=workspace.lifecycle.find(r=>r.id==='order')!
 workspace.lifecycle=saveLifecycle(workspace.lifecycle,{...order.values,relatedId:'quote'},order.id,'2026-01-04T00:00:00Z')
 const writer=new WorkspaceWriter(source.storage,ideaKey(id))
 assert.equal(writer.persist(workspace,()=>true).ok,true)
 const loaded=readIdea(id)
 assert.equal(loaded.error,'')
 assert.equal(loaded.workspace.lifecycle.length,13)
 assert.deepEqual(loaded.workspace.lifecycle,workspace.lifecycle)
 for(const row of loaded.workspace.lifecycle){
  assert.equal(row.history[0].values.status,'prepared')
  assert.equal(row.history[1].values.status,'approved')
  assert.equal(row.values.status,'prepared')
 }
 const file=exportIdea(id),before=source.storage.getItem(ideaKey(id))
 await moveIdeaToBin(id);assert.equal(readIdeaBin()[0].id,id)
 await restoreIdeaFromBin(id);assert.equal(source.storage.getItem(ideaKey(id)),before)
 const target=browser(),other=await addIdea('Unrelated business'),unrelated=target.storage.getItem(ideaKey(other.selectedId))
 const imported=await importIdea(file)
 assert.equal(imported.selectedId,id)
 assert.deepEqual(readIdea(id).workspace,loaded.workspace)
 assert.equal(target.storage.getItem(ideaKey(other.selectedId)),unrelated)
 assert.equal(readIdea(id).workspace.lifecycle.find(r=>r.id==='order')?.values.relatedId,'quote')
 for(const type of ['quote','order','proposal','finance','budget'])assert.equal(readIdea(id).workspace.lifecycle.find(r=>r.id===type)?.values.amount,'0.999')
 const importedRaw=target.storage.getItem(ideaKey(id))
 await assert.rejects(importIdea(file),/already exists/)
 assert.equal(target.storage.getItem(ideaKey(id)),importedRaw)
})

test('a stale writer cannot overwrite recovered records',async()=>{
 const {storage}=browser(),created=await addIdea('Synthetic concurrency'),key=ideaKey(created.selectedId)
 const first=new WorkspaceWriter(storage,key),stale=new WorkspaceWriter(storage,key)
 const original=readIdea(created.selectedId).workspace
 const revised={...original,lifecycle:saveLifecycle([],{category:'operation',entityType:'task',title:'Recovery task',details:'Synthetic fixture',basis:'simulated',status:'prepared'},'task','2026-01-01')}
 assert.equal(first.persist(revised,()=>true).ok,true)
 const before=storage.getItem(key)
 assert.equal(stale.persist(original,()=>true).ok,false)
 assert.equal(storage.getItem(key),before)
 assert.equal(first.persist(original,()=>false).ok,false)
 assert.equal(storage.getItem(key),before)
})

test('invalid imported business records cannot alter existing folders or saved data',async()=>{
 const source=browser(),created=await addIdea('Synthetic source'),id=created.selectedId
 const workspace=readIdea(id).workspace
 workspace.lifecycle=saveLifecycle([],{category:'operation',entityType:'quote',title:'Quote',details:'Synthetic',basis:'simulated',status:'prepared',quantity:'3',unitPrice:'0.333'},'quote','2026-01-01')
 assert.equal(new WorkspaceWriter(source.storage,ideaKey(id)).persist(workspace,()=>true).ok,true)
 const pack=JSON.parse(exportIdea(id))
 const target=browser();await addIdea('Preserved target')
 const before=Array.from(target.data.entries())
 for(const change of [{status:'made_up'},{entityType:'unrecognised'},{amount:'100.000'}]){
  const invalid=structuredClone(pack);Object.assign(invalid.workspace.lifecycle[0].values,change)
  await assert.rejects(importIdea(JSON.stringify(invalid)))
  assert.deepEqual(Array.from(target.data.entries()),before)
 }
})
