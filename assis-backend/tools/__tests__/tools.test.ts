import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../../contracts/index.ts';
import type { CaseSnapshot, DocumentVersion, ToolContext } from '../../contracts/index.ts';
import { retrieveGuidance, inspectDocuments, confirmUnitCorrection, assemblePack, executeTool, extractUnitEvidence, checkConsistency } from '../index.ts';
const FIXTURES=fileURLToPath(new URL('../../data/fixtures/',import.meta.url));
test('unrelated documents do not create a premises requirement',()=>{
 const snapshot={facts:[]} as unknown as CaseSnapshot;
 const result=checkConsistency(snapshot,[]);
 assert.equal(result.checks[0].field,'document');
 assert.equal(result.questions[0].reasonCode,'DOCUMENT_CHECK_UNSUPPORTED');
 assert.match(result.checks[0].message,/has not checked this document/);
 const known=checkConsistency({...snapshot,facts:[{field:'premises.unit',value:'12'} as any]},[]);
 assert.equal(known.questions[0].reasonCode,'DOCUMENT_FIELD_UNREADABLE');
});
async function fixture(name='synthetic-lease.pdf') {
 const privateRoot=await mkdtemp(join(tmpdir(),'assis-doc-test-'));
 const storageKey=join(privateRoot,name);await copyFile(join(FIXTURES,name),storageKey);
 const bytes=await readFile(storageKey);const intake=JSON.parse(await readFile(join(FIXTURES,'synthetic-intake.json'),'utf8'));
 const doc:DocumentVersion={id:'doc1',businessId:intake.businessId,name,mime:'application/pdf',bytes:bytes.length,contentHash:hash(bytes),storageKey,expiresAt:new Date(Date.now()+60000).toISOString(),extractionStatus:'pending'};
 const caseSnapshot:CaseSnapshot={schemaVersion:1,businessId:intake.businessId,businessRevision:1,facts:intake.facts,factsHash:hash(intake.facts),documentVersionIds:['doc1'],corrections:[]};
 const context:ToolContext={privateRoot,outputDir:privateRoot,documents:[doc],caseSnapshot,job:{jobId:'job1',businessId:intake.businessId,executionMode:'deterministic'},previousResults:{},signal:new AbortController().signal};
 return {context,doc,cleanup:()=>rm(privateRoot,{recursive:true,force:true})};
}
test('actual PDF -> mismatch -> explicit correction -> sourced incomplete three-format pack',async()=>{
 const f=await fixture();try {
  const guidance=await retrieveGuidance();assert.equal(guidance.activationState,'inactive');assert.equal(guidance.sources.length,3);assert.ok(guidance.sources.every(s=>s.rawHash.length===64&&s.passageHash.length===64));
  const first=await inspectDocuments(f.context);assert.equal(first.checks[0].state,'mismatch');assert.equal(first.questions[0].reasonCode,'DOCUMENT_MISMATCH');
  const evidence=first.checks[0].observed!;assert.equal(evidence[0].value,'12');assert.equal(evidence[0].page,1);assert.match(evidence[0].quote,/Premises unit: 12/);
  const correction=JSON.parse(await readFile(join(FIXTURES,'synthetic-correction.json'),'utf8')).facts[0];
  const successor=confirmUnitCorrection(f.context.caseSnapshot,correction,evidence);assert.equal(successor.caseSnapshot.businessRevision,2);assert.equal(f.context.caseSnapshot.facts.find(f=>f.field==='premises.unit')?.value,'21');
  const context={...f.context,caseSnapshot:successor.caseSnapshot};const second=await inspectDocuments(context);assert.equal(second.checks[0].state,'checked');assert.deepEqual(second.questions,[]);assert.equal(hash(await readFile(f.doc.storageKey)),f.doc.contentHash);
  const pack=assemblePack({caseSnapshot:successor.caseSnapshot,guidance,inspection:second,jobId:'successor',executionMode:'deterministic'});
  assert.match(pack.html,/INCOMPLETE DRAFT/);assert.match(pack.html,/moci.gov.kw/);assert.match(pack.html,/&quot;before&quot;: &quot;21&quot;/);assert.match(pack.html,/&quot;after&quot;: &quot;12&quot;/);
  assert.equal(pack.readiness,'blocked');assert.equal(pack.handoffState,'blocked');assert.equal(pack.officialFees,null);assert.equal(JSON.parse(pack.json).hash,pack.hash);assert.match(pack.markdown,/SHA-256/);assert.equal(pack.sources[0].activationState,'inactive');
 }finally{await f.cleanup();}
});
test('missing, no-text and ambiguous documents remain distinct',async()=>{
 const missing=await fixture();try {const result=await inspectDocuments({...missing.context,documents:[]});assert.equal(result.checks[0].state,'missing');}finally{await missing.cleanup();}
 for(const [name,state] of [['synthetic-no-text.pdf','unreadable'],['synthetic-ambiguous.pdf','needs_review']]) {
  const f=await fixture(name);try {const result=await inspectDocuments(f.context);assert.equal(result.checks[0].state,state);assert.ok(result.questions.length);}finally{await f.cleanup();}
 }
});
test('document instructions are inert; rendered facts and evidence escaped',async()=>{
 const f=await fixture('synthetic-injection.pdf');try {
  f.context.caseSnapshot.facts.push({field:'untrusted.note',value:'<script>alert(1)</script> [click](javascript:alert(1))',origin:'synthetic',sourceRef:null,confirmedBy:'Tester',confirmedAt:new Date().toISOString()});
  const inspection=await inspectDocuments(f.context);const pack=assemblePack({caseSnapshot:f.context.caseSnapshot,guidance:await retrieveGuidance(),inspection,jobId:'job1',executionMode:'deterministic'});
  assert.ok(!pack.html.includes('<script>'));assert.match(pack.html,/&lt;script&gt;/);assert.match(pack.html,/default-src 'none'/);assert.ok(!pack.markdown.includes('[click](javascript:'));assert.equal(pack.submission,'not_available');
  assert.equal(inspection.checks[0].observed![0].value,'12');
 }finally{await f.cleanup();}
});
test('pinned hash, size, file type, expiry, count, path and case boundaries reject unsafe reads',async()=>{
 const f=await fixture();try {
  const cases:[Partial<DocumentVersion>,string][]=[
   [{contentHash:'0'.repeat(64)},'DOCUMENT_HASH_MISMATCH'],[{bytes:11*1024*1024},'FILE_SIZE_LIMIT'],[{bytes:10},'FILE_SIZE_MISMATCH'],[{mime:'text/html'},'UNSUPPORTED_FILE_TYPE'],[{expiresAt:'2020-01-01'},'DOCUMENT_EXPIRED'],[{businessId:'other'},'DOCUMENT_CASE_MISMATCH'],[{storageKey:join(FIXTURES,'synthetic-lease.pdf')},'DOCUMENT_PATH_ESCAPE'],
  ];
  for(const [change,code] of cases)await assert.rejects(inspectDocuments({...f.context,documents:[{...f.doc,...change}]}),(e:any)=>e.code===code);
  const link=join(f.context.privateRoot,'escape.pdf');await symlink(join(FIXTURES,'synthetic-lease.pdf'),link);await assert.rejects(inspectDocuments({...f.context,documents:[{...f.doc,storageKey:link}]}),(e:any)=>e.code==='DOCUMENT_PATH_ESCAPE');
  await assert.rejects(inspectDocuments({...f.context,documents:Array(11).fill(f.doc)}),(e:any)=>e.code==='DOCUMENT_COUNT_LIMIT');
  await writeFile(f.doc.storageKey,'<html>fake</html>');const fake=await readFile(f.doc.storageKey);await assert.rejects(inspectDocuments({...f.context,documents:[{...f.doc,bytes:fake.length,contentHash:hash(fake)}]}),(e:any)=>e.code==='INVALID_PDF');
 }finally{await f.cleanup();}
});
test('adapter prerequisites, stale calls and confirmation failures cannot produce readiness',async()=>{
 const f=await fixture();try {
  const call={jobId:'job1',callId:'call1',businessRevision:1,name:'assemble_pack' as const,arguments:{}};
  assert.equal((await executeTool(call,f.context)).error?.code,'MISSING_PREREQUISITE');
  assert.equal((await executeTool({...call,businessRevision:99},f.context)).error?.code,'STALE_TOOL_CONTEXT');
  for(const name of ['retrieve_guidance','inspect_documents','request_information','assemble_pack','apply_preparation_patch'] as const){const result=await executeTool({...call,name},f.context);assert.equal(result.ok,true,JSON.stringify(result.error));f.context.previousResults[name]=result;}
  assert.equal(f.context.previousResults.assemble_pack.data.readiness,'blocked');assert.equal(f.context.previousResults.apply_preparation_patch.data.proposalOnly,true);
  const evidence=f.context.previousResults.inspect_documents.data.checks[0].observed;
  assert.throws(()=>confirmUnitCorrection(f.context.caseSnapshot,{field:'premises.unit',value:'12',origin:'model',sourceRef:null,confirmedBy:null,confirmedAt:null},evidence));
  const aborted=new AbortController();aborted.abort();assert.equal((await executeTool(call,{...f.context,signal:aborted.signal})).error?.code,'ABORTED');
 }finally{await f.cleanup();}
});
test('Arabic original quote preserved and Arabic-Indic unit normalised',()=>{
 const evidence=extractUnitEvidence('رقم الوحدة: ١٢\n','doc','hash');assert.equal(evidence[0]?.value,'12');assert.match(evidence[0]?.quote||'',/١٢/);
});

test('new Dikan branding preserves hash algorithm, identifiers and historical artefact bytes',async()=>{
 const f=await fixture();try {
  const historicalRoot=fileURLToPath(new URL('../../data/demo-output/',import.meta.url));
  const historyNames=['preparation.html','preparation.md','preparation.json','verification.json'];
  const before=await Promise.all(historyNames.map(name=>readFile(join(historicalRoot,name))));
  const guidance=await retrieveGuidance();const inspection=await inspectDocuments(f.context);
  const input={caseSnapshot:f.context.caseSnapshot,guidance,inspection,jobId:'job-brand-test',executionMode:'deterministic'};
  const pack=assemblePack(input);const again=assemblePack(input);
  assert.equal(pack.title,'Dikan — دكان preparation worksheet');
  assert.match(pack.html,/<title>Dikan — دكان incomplete preparation worksheet<\/title>/);
  assert.match(pack.html,/<h1>Dikan — دكان preparation worksheet<\/h1>/);
  assert.match(pack.html,/This is a Dikan — دكان worksheet/);
  assert.ok(pack.markdown.startsWith('# Dikan — دكان preparation worksheet\n'));
  assert.ok(!pack.html.includes('Assis worksheet'));
  const {hash:bodyHash,...body}=JSON.parse(pack.json);
  assert.equal(bodyHash,hash(body));assert.equal(pack.hash,again.hash);assert.equal(pack.html,again.html);
  assert.notEqual(pack.hash,hash({...body,title:'Assis preparation worksheet'}));
  assert.equal(pack.files[0].contentHash,hash(pack.html));assert.equal(pack.files[1].contentHash,hash(pack.markdown));
  assert.equal(pack.businessId,'example-madar');assert.equal(pack.jobId,'job-brand-test');
  assert.equal(pack.documents[0].id,'doc1');assert.ok(pack.sources.every(s=>/^(L|ACT-S)/.test(s.id))); // New packs use the published corpus; historical bytes below remain unchanged.
  assert.equal(pack.readiness,'blocked');assert.equal(pack.handoffState,'blocked');
  assert.equal(pack.officialFees,null);assert.equal(pack.submission,'not_available');
  for(const [i,name] of historyNames.entries())assert.deepEqual(await readFile(join(historicalRoot,name)),before[i]);
  const historicalManifest=JSON.parse(before[3].toString());
  assert.equal(hash(before[0]),historicalManifest.htmlHash);
  assert.equal(JSON.parse(before[2].toString()).title,'Assis preparation worksheet');
 }finally{await f.cleanup();}
});
