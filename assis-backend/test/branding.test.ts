import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/server.ts';
import {hash} from '../contracts/index.ts';
import {sourceFingerprint} from '../src/sources.ts';

test('new Dikan draft and filename, exact review hash, and historical Assis bytes remain compatible',async t=>{
 const root=mkdtempSync(resolve(tmpdir(),'dikan-branding-'));
 const app=await createApp({allowDeterministicTests:true,privateRoot:root});
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${(app.server.address() as any).port}`;
 t.after(async()=>{await new Promise<void>(r=>app.server.close(()=>r()));rmSync(root,{recursive:true,force:true});});
 const oldHtml=readFileSync(new URL('../data/demo-output/preparation.html',import.meta.url),'utf8');
 assert.match(oldHtml,/<title>Assis /);
 const oldHash=hash(oldHtml);const businessId='historical-branding-case',jobId='historical-branding-job';
 const c={schemaVersion:1,businessId,businessRevision:1,facts:[],factsHash:hash([]),documentVersionIds:[],corrections:[],expiresAt:new Date(Date.now()+86400000).toISOString()};
 const job={schemaVersion:1,jobId,businessId,businessRevision:1,factsHash:c.factsHash,sourceSnapshotHash:sourceFingerprint(),status:'blocked',executionMode:'deterministic',documentVersionIds:[]};
 const pack={schemaVersion:1,id:'historical-pack',version:1,jobId,businessId,businessRevision:1,html:oldHtml,hash:oldHash,incomplete:true};
 const review={id:'historical-review',actor:'Synthetic reviewer',at:'2026-09-23T00:00:00Z',packHash:oldHash,valid:true};
 for(const [kind,id,value] of [['case',businessId,c],['job',jobId,job],['pack',jobId,pack],['review',jobId,review]] as const)app.store.put(kind,id,businessId,value);
 const savedRows=JSON.stringify([app.store.get('pack',jobId),app.store.get('review',jobId)]);
 async function json(path:string,body?:unknown){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json() as any;assert.ok(r.ok,JSON.stringify(data));return data;}
 const fixture=await json('/api/demo-fixture');const newCase=await json('/api/cases',{businessId:'new-branding-case',facts:fixture.facts.map((f:any)=>f.field==='premises.unit'?fixture.correction.facts[0]:f)});
 const upload=await json('/api/cases/new-branding-case/documents',{expectedRevision:newCase.case.businessRevision,synthetic:true,files:fixture.files});
 const start=await json('/api/cases/new-branding-case/jobs',{expectedRevision:upload.case.businessRevision,executionMode:'deterministic'});
 let settled:any;for(let attempt=0;attempt<100;attempt++){settled=await json(`/api/jobs/${start.job.jobId}`);if(!['queued','running','retry_wait'].includes(settled.job.status))break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(settled.job.status,'blocked');assert.equal(settled.pack.downloadFilename,'dikan-incomplete-preparation.html');
 const draft=await(await fetch(`${base}/api/jobs/${start.job.jobId}/draft`)).text();assert.match(draft,/<title>Dikan/);assert.match(draft,/دكان/);assert.doesNotMatch(draft,/Assis/);assert.equal(hash(draft),settled.pack.hash);
 const reviewed=await json(`/api/jobs/${start.job.jobId}/review`,{expectedRevision:settled.case.businessRevision,packHash:settled.pack.hash,actor:'Synthetic reviewer',acknowledgeIncomplete:true});assert.equal(reviewed.handoff.state,'blocked');
 const exported=await fetch(`${base}/api/jobs/${start.job.jobId}/export?packHash=${settled.pack.hash}`);assert.equal(exported.status,200);assert.equal(exported.headers.get('content-disposition'),'attachment; filename="dikan-incomplete-preparation.html"');assert.equal(await exported.text(),draft);
 const oldDraft=await(await fetch(`${base}/api/jobs/${jobId}/draft`)).text();assert.equal(oldDraft,oldHtml);const historical=await fetch(`${base}/api/jobs/${jobId}/export?packHash=${oldHash}`);assert.equal(historical.status,200);assert.equal(historical.headers.get('content-disposition'),'attachment; filename="assis-incomplete-preparation.html"');const historicalBytes=await historical.text();assert.equal(historicalBytes,oldHtml);assert.equal(hash(historicalBytes),oldHash);assert.equal(JSON.stringify([app.store.get('pack',jobId),app.store.get('review',jobId)]),savedRows);
});
