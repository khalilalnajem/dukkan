import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {listBusinessKnowledgeSources} from '../tools/business-knowledge.ts';
import {createApp} from '../src/server.ts';

const market=JSON.parse(readFileSync(fileURLToPath(new URL('../../knowledge/market/generated/corpus.json',import.meta.url)),'utf8'));
const legal=JSON.parse(readFileSync(fileURLToPath(new URL('../../knowledge/context/generated/corpus.json',import.meta.url)),'utf8'));
const fields=['id','title','publisher','url','kind','language','dataPeriod','publicationDate','capturedAt','phases','topics','limitations','currentness','legalStatus'];

test('source catalogue lists both real collections with counts that match the corpus files',()=>{
 const catalogue=listBusinessKnowledgeSources();
 assert.deepEqual(catalogue.collections.map(c=>c.id),['market','legal']);
 const [m,l]=catalogue.collections;
 assert.equal(m.label,'Market and business');assert.equal(l.label,'Legal and official services');
 assert.equal(m.sourceCount,market.sourceCount);assert.equal(m.chunkCount,market.chunkCount);assert.equal(m.sources.length,market.sources.length);
 assert.equal(l.sourceCount,legal.sourceCount);assert.equal(l.chunkCount,legal.chunkCount);assert.equal(l.sources.length,legal.sources.length);
 assert.deepEqual(catalogue.totals,{sourceCount:market.sourceCount+legal.sourceCount,chunkCount:market.chunkCount+legal.chunkCount});
 assert.equal(catalogue.builtAt,[market.builtAt,legal.builtAt].sort().at(-1));
 assert.ok(m.sources.some(s=>s.id==='MK-CSB-POP-2025'&&s.publisher==='Kuwait Central Statistical Bureau'&&s.kind==='official_statistics'&&s.dataPeriod==='2025-01-01'&&s.language===null));
 assert.ok(l.sources.some(s=>s.id==='L01'&&s.publisher?.startsWith('Ministry of Commerce and Industry')&&s.language==='ar'&&s.legalStatus==='in_force_unconfirmed'&&typeof s.currentness==='string'&&s.phases===null));
});

test('normalised source records carry only the public fields and never a local path',()=>{
 const catalogue=listBusinessKnowledgeSources();
 for(const collection of catalogue.collections)for(const source of collection.sources){
  assert.deepEqual(Object.keys(source).sort(),[...fields].sort());
  for(const key of Object.keys(source)){assert.notEqual(key,'rawPath');assert.doesNotMatch(key,/path$/i);}
  const serialised=JSON.stringify(source);
  assert.ok(!serialised.includes('/Users/'),`${source.id} leaks a local path`);
  assert.ok(!/(raw|text|structured|manifest)Path/.test(serialised));
  assert.ok(typeof source.id==='string'&&source.id.length>0&&typeof source.title==='string'&&source.title.length>0);
  assert.ok(source.url===null||/^https?:\/\//.test(source.url));
 }
 assert.ok(!JSON.stringify(catalogue).includes('/Users/'));
});

test('GET /api/business-knowledge/sources serves the catalogue without disturbing the search route',async t=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-sources-test-'));
 const app=await createApp({allowDeterministicTests:true,privateRoot:root});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise<void>(resolve=>app.server.close(()=>resolve()));rmSync(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${(app.server.address() as any).port}`;
 const response=await fetch(base+'/api/business-knowledge/sources');assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.collections.length,2);assert.equal(body.totals.sourceCount,market.sourceCount+legal.sourceCount);assert.equal(body.totals.chunkCount,market.chunkCount+legal.chunkCount);
 assert.ok(!JSON.stringify(body).includes('rawPath')&&!JSON.stringify(body).includes('/Users/'));
 assert.equal((await fetch(base+'/api/business-knowledge/sources',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'sources-1'},body:'{}'})).status,404);
 const search=await fetch(base+'/api/business-knowledge?query=population%20age%20nationality&phase=ideation');assert.equal(search.status,200);assert.equal((await search.json()).sources[0].id,'MK-CSB-POP-2025');
});
