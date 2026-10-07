import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {staticServer} from './run-local.mjs';

test('local launcher serves the workspace and assets without exposing files outside its public root',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'dukkan-launcher-'));const publicRoot=join(dir,'public');mkdirSync(join(publicRoot,'workspace'),{recursive:true});
 writeFileSync(join(publicRoot,'workspace','index.html'),'<h1>Dukkan</h1>');writeFileSync(join(publicRoot,'workspace','app.mjs'),'export const ready=true;');
 writeFileSync(join(dir,'private.txt'),'must stay private');symlinkSync(join(dir,'private.txt'),join(publicRoot,'outside.txt'));
 const server=staticServer(publicRoot);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})});const base=`http://127.0.0.1:${server.address().port}`;
 for(const route of ['/','/workspace/']){const response=await fetch(base+route);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);assert.equal(await response.text(),'<h1>Dukkan</h1>')}
 const asset=await fetch(base+'/workspace/app.mjs');assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);
 assert.equal((await fetch(base+'/outside.txt')).status,403);assert.notEqual((await fetch(base+'/%2e%2e/private.txt')).status,200);
 assert.equal((await fetch(base+'/workspace/',{method:'POST'})).status,405);assert.equal((await fetch(base+'/missing')).status,404);
});
