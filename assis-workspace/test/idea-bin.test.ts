import {test} from 'node:test'
import assert from 'node:assert/strict'
import {FOLDERS_KEY,TRASH_KEY,ideaKey,readIdeas,readIdeaBin,moveIdeaToBin,restoreIdeaFromBin,renameIdea} from '../src/lib/idea-folders.ts'
const data=new Map<string,string>()
let failKey=''
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{if(key===failKey)throw new Error('Storage full');data.set(key,value)},removeItem:(key:string)=>data.delete(key)},configurable:true})
Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key:string,fn:()=>unknown)=>fn()}},configurable:true})
function seed(){data.clear();failKey='';data.set(FOLDERS_KEY,JSON.stringify({folders:[{id:'a',name:'Pearl',createdAt:''},{id:'b',name:'Other',createdAt:''}],selectedId:'a'}));data.set(ideaKey('a'),'preserved record');data.set(ideaKey('b'),'other record')}
test('removing selected and final ideas preserves records and restores original identity',async()=>{
 seed();let next=await moveIdeaToBin('a');assert.equal(next.selectedId,'b');assert.equal(data.get(ideaKey('a')),'preserved record');assert.equal(readIdeaBin()[0].name,'Pearl')
 next=await moveIdeaToBin('b');assert.deepEqual(next.folders,[]);assert.equal(readIdeas().selectedId,'');assert.equal(readIdeas().error,'')
 next=await restoreIdeaFromBin('a');assert.equal(next.selectedId,'a');assert.equal(next.folders[0].name,'Pearl');assert.equal(data.get(ideaKey('a')),'preserved record');assert.equal(readIdeaBin().length,1)
})
test('rename preserves identity and removal can be repeated after restoring',async()=>{
 seed();await renameIdea('a','Pearl Studio');await moveIdeaToBin('a');await restoreIdeaFromBin('a');await moveIdeaToBin('a');assert.equal(readIdeaBin().length,1);assert.equal(readIdeaBin()[0].name,'Pearl Studio')
})
test('failed index write rolls back bin and does not lose active ideas',async()=>{
 seed();failKey=FOLDERS_KEY;await assert.rejects(moveIdeaToBin('a'),/Storage full/);failKey='';assert.equal(readIdeas().folders.length,2);assert.deepEqual(readIdeaBin(),[]);assert.equal(data.get(ideaKey('a')),'preserved record')
})
test('corrupt bin blocks removal without changing the index',async()=>{
 seed();data.set(TRASH_KEY,'invalid');const before=data.get(FOLDERS_KEY);await assert.rejects(moveIdeaToBin('a'));assert.equal(data.get(FOLDERS_KEY),before)
})
