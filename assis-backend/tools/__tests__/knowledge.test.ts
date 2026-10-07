import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { hash } from '../../contracts/index.ts';
import type { CaseSnapshot, ToolContext } from '../../contracts/index.ts';
import { retrieveGuidance, prepareEnquiry, assemblePack, executeTool } from '../index.ts';
const ROOT=fileURLToPath(new URL('../../../knowledge/',import.meta.url));
const BRIDGE=fileURLToPath(new URL('../corpus-bridge.py',import.meta.url));
const emptyCase=(facts:CaseSnapshot['facts']=[]):CaseSnapshot=>({schemaVersion:1,businessId:'pearl-north',businessRevision:1,facts,factsHash:hash(facts),documentVersionIds:[],corrections:[]});
const fact=(field:string,value:string)=>({field,value,origin:'user_confirmed',confirmedBy:'founder',confirmedAt:'2026-09-24T00:00:00Z',sourceRef:null});
const context=(c=emptyCase()):ToolContext=>({caseSnapshot:c,job:{jobId:'j1',businessId:c.businessId},documents:[],privateRoot:'/private/tmp/not-used',outputDir:'/private/tmp/not-used',previousResults:{},signal:new AbortController().signal});
const call=(name:any,args:Record<string,unknown>={})=>({name,arguments:args,callId:'c1',jobId:'j1',businessRevision:1});
const noDocs={documents:[],checks:[],questions:[],blockers:[],authenticity:'not_verified',legalValidity:'not_verified'};

test('bilingual relevant retrieval preserves exact citations, dates, page and conflicting scope',async()=>{
 for(const query of ['lease','عقد الإيجار']){
  const g=await retrieveGuidance({query,limit:3});assert.equal(g.abstained,false);assert.equal(g.sources.length,3);
  assert.ok(g.sources.some(s=>['L10','ACT-S03','L11'].includes(s.id)));
  assert.ok(g.conflictNotices.length>0);assert.equal(g.activationState,'inactive');assert.equal(g.requirements.length,0);
  for(const s of g.sources){const c=s.citation;assert.equal(c.resolved,true);assert.equal(hash(s.passage),s.passageHash);assert.equal(c.authority,s.publisher);assert.equal(c.publicationDate,s.publishedAt);assert.equal(c.effectiveDate,s.effectiveAt);assert.ok('page' in c);assert.ok(c.rawSha256.length===64);assert.ok(c.localCitation.includes('#L'));}
 }
 const privacy=await retrieveGuidance({query:'حماية البيانات',limit:2});assert.ok(privacy.sources.some(s=>s.id==='L03'));
});
test('unknown route/current-law mode abstain without inventing facts or requiring lease',async()=>{
 const c=context();const result=await executeTool(call('retrieve_guidance',{query:'What are the licence fees?'}),c);
 assert.equal(result.ok,true);assert.equal(result.data.route.route,null);assert.equal(result.data.route.eligibility,'unknown');assert.ok(result.data.route.unresolvedFields.includes('business.legalForm'));assert.equal(c.caseSnapshot.facts.length,0);
 assert.equal((await retrieveGuidance({query:'licence',mode:'current'})).abstained,true);
 assert.equal((await retrieveGuidance({query:'What is the best restaurant in Tokyo?'})).abstained,true);
 for(const args of [{limit:0},{limit:7},{query:42},{query:'x'.repeat(2001)},{mode:'live'}])assert.equal((await executeTool(call('retrieve_guidance',args),c)).ok,false);
});
test('confirmed case context is used without admitting unconfirmed values or private unrelated fields',async()=>{
 const c=emptyCase([fact('business.legalForm','one person company'),fact('business.activityDescription','design services'),fact('private.bank','SECRET_PRIVATE_ACCOUNT'),{...fact('premises.type','UNCONFIRMED_PREMISES'),confirmedBy:null}]);
 const g=await retrieveGuidance({query:'licence'},c);assert.equal(g.contextFields.length,2);assert.equal(g.route.unresolvedFields.includes('business.legalForm'),false);assert.ok(!JSON.stringify(g).includes('SECRET_PRIVATE_ACCOUNT'));assert.ok(!JSON.stringify(g.contextFields).includes('UNCONFIRMED_PREMISES'));
});
test('fresh EN/AR drafts use neutral language, actual case facts, official contact and explicit missing fields',async()=>{
 const c=emptyCase([fact('business.name','Pearl North'),fact('business.activityDescription','digital marketing studio')]);
 for(const language of ['en','ar'] as const){
  const draft=await prepareEnquiry({kind:'route-clarification',language,fields:{business_name:'Model invented name',userRequest:'Please prepare an enquiry.'}},c);
  assert.equal(draft.templateMode,'neutral_adaptation');assert.match(draft.body,/Pearl North/);assert.match(draft.body,/digital marketing studio/);assert.doesNotMatch(draft.body,/Madar|مدار|one-person|الشخص الواحد|Model invented/);
  assert.ok(draft.missingFields.includes('incorporation_status'));assert.ok(draft.missingFields.includes('legal_form'));assert.match(draft.body,/\{\{legal_form\}\}/);
  assert.equal(draft.fieldOrigins.business_name,'confirmed_case_fact');assert.equal(draft.contactEvidence.citation.sourceID,'ACT-S01');assert.match(draft.contactEvidence.passage,/AB.ALERZ@MOCI.GOV.KW/i);assert.equal(hash(draft.contactEvidence.passage),draft.contactEvidence.passageHash);
  assert.equal(draft.sent,false);assert.equal(draft.approved,false);assert.deepEqual(draft.attachments,[]);assert.ok(draft.templateProvenance.some((p:any)=>p.path.endsWith('route-clarification.json')));
  const {html,hash:draftHash,payloadHash,...payload}=draft;assert.equal(hash(payload),payloadHash);assert.equal(draftHash,payloadHash);assert.ok(html.includes('Dikan — دكان'));
  assert.match(html,/<details><summary>Official contact evidence \(ACT-S01\)<\/summary><pre>/);
  assert.match(html,/<details><summary>Sources, limits and full provenance<\/summary>/);
  assert.doesNotMatch(html,/<details\s+open/);
  assert.ok(html.indexOf('<h2>Missing information</h2>')<html.indexOf('<details>'));
  assert.ok(html.includes(draft.contactEvidence.passageHash));assert.ok(html.includes(draft.corpusSha256));
 }
});
test('scoped user-stated draft fields fill the enquiry without confirming facts or dumping chat',async()=>{
 const c=emptyCase();const before=JSON.stringify(c);
 const transcript='TRANSCRIPT_SENTINEL user: Pearl North offers graphic design.\nassistant: Earlier chat text.\nuser: Draft the enquiry.';
 for(const language of ['en','ar'] as const){
  const draft=await prepareEnquiry({kind:'route-clarification',language,fields:{business_name:'Pearl North',activity_description:'graphic design',userRequest:transcript}},c);
  assert.match(draft.body,/Pearl North/);assert.match(draft.body,/graphic design/);
  assert.equal(draft.missingFields.includes('business_name'),false);assert.equal(draft.missingFields.includes('activity_description'),false);
  assert.equal(draft.fieldOrigins.business_name,'unconfirmed_draft_input');assert.equal(draft.fieldOrigins.activity_description,'unconfirmed_draft_input');
  assert.equal(draft.fields.legal_form,null);assert.equal(draft.fields.incorporation_status,null);assert.match(draft.body,/\{\{legal_form\}\}/);assert.match(draft.body,/\{\{incorporation_status\}\}/);
  assert.doesNotMatch(draft.body,/TRANSCRIPT_SENTINEL|Earlier chat text|Draft the enquiry/);assert.doesNotMatch(draft.html,/TRANSCRIPT_SENTINEL|Earlier chat text/);
  assert.equal(draft.fields.userRequest,transcript);assert.match(draft.html,/draftFieldOrigins/);assert.match(draft.html,/unconfirmed_draft_input/);
  assert.equal(JSON.stringify(c),before);assert.equal(draft.sent,false);
 }
});
test('missing-document draft never fabricates official notice and escapes user text',async()=>{
 const d=await prepareEnquiry({kind:'missing-document',fields:{document_label:'lease',document_question:'<script>alert(1)</script> Is an alternative accepted?'}});
 assert.equal(d.kind,'missing-document');assert.doesNotMatch(d.body,/published service guidance refers|official deficiency notice has been received/);assert.match(d.body,/whether it is required/);assert.ok(!d.html.includes('<script>'));assert.match(d.html,/&lt;script&gt;/);assert.equal(d.licensingReady,false);
});
test('exact fictional template is retained only for matching example case',async()=>{
 const c={...emptyCase([fact('business.name','Madar Design Studio')]),businessId:'example-madar'};
 const d=await prepareEnquiry({kind:'route-clarification'},c);assert.equal(d.templateMode,'published_fictional_template');assert.match(d.body,/fictional company Madar/);
 const generic=await prepareEnquiry({kind:'route-clarification'},{...c,businessId:'other'});assert.equal(generic.templateMode,'neutral_adaptation');assert.doesNotMatch(generic.body,/assumed to be incorporated/);
});
test('preparation pack binds retrieved guidance and reviewed draft, rejects tampered/stale payloads',async()=>{
 const c=emptyCase();const guidance=await retrieveGuidance({query:'lease'},c);const enquiry=await prepareEnquiry({kind:'route-clarification'},c);
 const input={caseSnapshot:c,guidance,inspection:noDocs,jobId:'j1',executionMode:'test',enquiry};
 const pack=assemblePack({...input,enquiryReview:{payloadHash:enquiry.payloadHash,reviewedBy:'human',reviewedAt:'2026-09-24T00:00:00Z'}});
 assert.equal((pack.enquiry as any).review.state,'reviewed');assert.equal(pack.readiness,'blocked');assert.equal(pack.submission,'not_available');assert.equal(pack.citations[0].resolved,true);assert.ok(pack.html.includes(enquiry.payloadHash));assert.equal(pack.corpusSha256,guidance.corpusSha256);
 assert.throws(()=>assemblePack({...input,enquiry:{...enquiry,body:'edited'}}),(e:any)=>e.code==='DRAFT_HASH_MISMATCH');
 assert.throws(()=>assemblePack({...input,caseSnapshot:{...c,businessRevision:2}}),(e:any)=>e.code==='STALE_DRAFT');
 assert.throws(()=>assemblePack({...input,enquiryReview:{payloadHash:'wrong',reviewedBy:'human',reviewedAt:'2026-09-24T00:00:00Z'}}),(e:any)=>e.code==='INVALID_DRAFT_REVIEW');
 const ctx=context(c);for(const name of ['retrieve_guidance','prepare_enquiry'] as const){const r=await executeTool(call(name,name==='prepare_enquiry'?{kind:'route-clarification'}:{query:'lease'}),ctx);assert.equal(r.ok,true);ctx.previousResults[name]=r;}
 ctx.previousResults.inspect_documents={ok:true,data:noDocs};assert.equal((await executeTool(call('assemble_pack'),ctx)).ok,true);
 ctx.previousResults.prepare_enquiry.data.body='changed without matching hash';
 // Previous rendered payload tampering must not be silently replaced with an apparently reviewed draft.
 assert.equal((await executeTool(call('assemble_pack'),ctx)).ok,false);
});

function bridge(root:string,action?:string,application=false){return new Promise<any>((accept,reject)=>{const child=spawn(process.env.DIKAN_PYTHON_PATH||'python3',['-B',BRIDGE],{stdio:['pipe','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',()=>{});child.on('error',reject);child.on('close',()=>{try{accept(JSON.parse(out));}catch(e){reject(e);}});child.stdin.end(JSON.stringify({root,query:'lease',limit:3,mode:'research',action,application}));});}
test('missing, malformed, changed corpus, original/extract, citation inputs and path escape fail closed in isolated copies',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'dikan-knowledge-test-'));const root=join(tmp,'knowledge');
 try{
  // Whole public corpus copied only to ephemeral test directory; originals never mutated.
  await cp(ROOT,root,{recursive:true});
  const corpusPath=join(root,'context/generated/corpus.json'),original=await readFile(corpusPath);
  await rm(corpusPath);assert.equal((await bridge(root)).error.code,'KNOWLEDGE_MISSING');
  await writeFile(corpusPath,'{broken');assert.equal((await bridge(root)).error.code,'KNOWLEDGE_HASH_MISMATCH');
  const c=JSON.parse(original.toString());c.chunks[0].citation.authority='tampered authority';await writeFile(corpusPath,JSON.stringify(c));assert.equal((await bridge(root)).error.code,'KNOWLEDGE_HASH_MISMATCH');
  await writeFile(corpusPath,original);
  for(const ref of ['actions/sources/raw/ACT-S03.html','actions/sources/text/ACT-S03.txt','actions/contacts.json','actions/forms/madar-preparation-worksheet.json','actions/forms/observed-forms.json','context/progressive-questions.json']){
   const path=join(root,ref),bytes=await readFile(path);await writeFile(path,Buffer.concat([bytes,Buffer.from('changed')]));
   const result=await bridge(root,'route-clarification',true);
   assert.equal(result.error.code,'KNOWLEDGE_HASH_MISMATCH');
   await writeFile(path,bytes);
  }
  const source=join(root,'actions/sources/raw/ACT-S03.html');await rm(source);await symlink(join(ROOT,'actions/sources/raw/ACT-S03.html'),source);assert.equal((await bridge(root)).error.code,'KNOWLEDGE_PATH_ESCAPE');
 }finally{await rm(tmp,{recursive:true,force:true});}
});
