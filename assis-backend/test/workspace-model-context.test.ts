import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceModelContext} from '../src/workspace-model-context.ts';
test('populated bilingual workspace stays bounded without changing authoritative data',()=>{
 const w={updatedAt:'snapshot',brief:{idea:'Fictional lighting',offer:'LED panels'},costs:{price:'60'},lifecycle:Array.from({length:60},(_,i)=>({id:'record-'+i,revision:2,values:{title:i===8?'supplier quote':'Other record',details:'تجريبي '.repeat(1200),basis:'simulated'},history:Array(5).fill({private:'old history'})}))};
 const before=JSON.stringify(w);const p=workspaceModelContext(w,'supplier quote');
 assert.ok(Buffer.byteLength(JSON.stringify(p))<=11000);assert.equal(p.updatedAt,'snapshot');assert.equal(p.projection.totalLifecycle,60);assert.ok(p.lifecycle.some((r:any)=>r.id==='record-8'));assert.ok(p.lifecycle.every((r:any)=>!r.history));assert.equal(JSON.stringify(w),before);
});
