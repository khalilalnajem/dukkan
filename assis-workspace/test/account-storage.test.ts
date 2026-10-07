import {test} from 'node:test'
import assert from 'node:assert/strict'
import {AccountStorage,captureBusinessSession,useAccountStorage,type CloudSnapshot,type RemoteWorkspace} from '../src/lib/account-storage.ts'
const ownerA='11111111-1111-4111-8111-111111111111',ownerB='22222222-2222-4222-8222-222222222222'
const key='assis-connected-workspace-v2'
function cache(){const records=new Map<string,string>();return {records,getItem:(k:string)=>records.get(k)??null,setItem:(k:string,v:string)=>{records.set(k,v)},removeItem:(k:string)=>{records.delete(k)}}}
const lock=async<T>(_name:string,action:()=>Promise<T>)=>action()
function remote(){
 let state:CloudSnapshot={revision:0,records:{}}
 const receipts=new Map<string,number>()
 const api:RemoteWorkspace={read:async()=>structuredClone(state),save:async(revision,records,id)=>{
  if(receipts.has(id))return receipts.get(id)!
  if(state.revision!==revision)throw new Error('WORKSPACE_CONFLICT')
  state={revision:revision+1,records:structuredClone(records)};receipts.set(id,state.revision);return state.revision
 }}
 return api
}
test('account caches never read legacy data or another account',async()=>{
 const disk=cache();disk.setItem(key,'legacy untouched')
 const a=new AccountStorage(ownerA,disk,remote(),lock),b=new AccountStorage(ownerB,disk,remote(),lock)
 await a.load();a.setItem(key,'A');await a.flush();await b.load()
 assert.equal(b.getItem(key),null);assert.equal(a.getItem(key),'A');assert.equal(disk.getItem(key),'legacy untouched')
 a.deactivate();assert.throws(()=>a.setItem(key,'late A write'),/session changed/)
})
test('another device cannot silently overwrite newer work',async()=>{
 const server=remote(),a=new AccountStorage(ownerA,cache(),server,lock),b=new AccountStorage(ownerA,cache(),server,lock)
 await a.load();await b.load();a.setItem(key,'newer');await a.flush();b.setItem(key,'stale')
 await assert.rejects(b.flush(),/WORKSPACE_CONFLICT/)
 assert.equal((await server.read()).records[key],'newer');assert.equal(b.getItem(key),'stale')
 assert.throws(()=>b.setItem(key,'extra'),/conflict/)
})
test('lost response retries the same save across reload without duplicate revision',async()=>{
 const server=remote(),disk=cache();let first=true
 const flaky:RemoteWorkspace={read:server.read,save:async(...args)=>{const result=await server.save(...args);if(first){first=false;throw new Error('Connection interrupted')}return result}}
 const a=new AccountStorage(ownerA,disk,flaky,lock);await a.load();a.setItem(key,'recover')
 await assert.rejects(a.flush(),/interrupted/)
 const reloaded=new AccountStorage(ownerA,disk,flaky,lock);await reloaded.load()
 assert.equal(reloaded.isPending,false);assert.equal((await server.read()).revision,1);assert.equal(reloaded.getItem(key),'recover')
})
test('edits during a request get a second durable save',async()=>{
 const server=remote();let release!:()=>void,started!:()=>void
 const gate=new Promise<void>(r=>{release=r}),ready=new Promise<void>(r=>{started=r});let first=true
 const delayed:RemoteWorkspace={read:server.read,save:async(...args)=>{if(first){first=false;started();await gate}return server.save(...args)}}
 const a=new AccountStorage(ownerA,cache(),delayed,lock);await a.load();a.setItem(key,'first');const pending=a.flush();await ready
 a.setItem(key,'second');release();await pending
 assert.equal((await server.read()).records[key],'second');assert.equal((await server.read()).revision,2);assert.equal(a.isPending,false)
})
test('session expiry never marks a failed remote save as complete',async()=>{
 const disk=cache(),server:RemoteWorkspace={read:async()=>({revision:0,records:{}}),save:async()=>{throw new Error('Sign in required')}}
 const a=new AccountStorage(ownerA,disk,server,lock);await a.load();a.setItem(key,'pending')
 await assert.rejects(a.flush(),/Sign in/);assert.equal(a.isPending,true);assert.ok(a.recoveryCopy()?.includes('pending'))
})
test('unexpected record keys are rejected',async()=>{
 const a=new AccountStorage(ownerA,cache(),remote(),lock);await a.load()
 assert.throws(()=>a.setItem('access_token','secret'),/Unexpected/)
})
test('a queued browser action cannot migrate into a newly signed-in account',async()=>{
 const disk=cache(),a=new AccountStorage(ownerA,disk,remote(),lock),b=new AccountStorage(ownerB,disk,remote(),lock)
 await a.load();await b.load();useAccountStorage(a)
 const original=captureBusinessSession();useAccountStorage(b)
 assert.throws(()=>original.assert(),/session changed/)
 await assert.rejects(original.flush(),/session changed/)
 assert.equal(b.getItem(key),null);useAccountStorage(null)
})
