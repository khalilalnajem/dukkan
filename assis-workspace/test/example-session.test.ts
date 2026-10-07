import test from 'node:test';import assert from 'node:assert/strict';
import {readExampleSession,saveExampleSession} from '../src/lib/example-session.ts';
import {workedExample} from '../src/lib/workspace.ts';
test('saved example work survives remount and stays separate from another example',()=>{
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v)}};
 const value=workedExample();value.brief.idea='Saved synthetic business';saveExampleSession(storage,'mingyuan',value);
 assert.equal(readExampleSession(storage,'mingyuan',workedExample).brief.idea,value.brief.idea);assert.notEqual(readExampleSession(storage,'other',workedExample).brief.idea,value.brief.idea);
 assert.deepEqual([...values.keys()],['dukkan-example-session-v4:mingyuan']);
});
test('storage failure is not reported as a successful save',()=>{
 const storage={getItem:()=>null,setItem:()=>{throw Error('quota')}};assert.throws(()=>saveExampleSession(storage,'demo',workedExample()),/quota/);
});
