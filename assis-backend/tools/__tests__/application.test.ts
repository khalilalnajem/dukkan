import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../../contracts/index.ts';
import type {CaseSnapshot,ToolContext} from '../../contracts/index.ts';
import {prepareApplication,executeTool} from '../index.ts';
const snapshot=(facts:CaseSnapshot['facts']=[]):CaseSnapshot=>({schemaVersion:1,businessId:'pearl-north',businessRevision:1,facts,factsHash:hash(facts),documentVersionIds:[],corrections:[]});
const fact=(field:string,value:string)=>({field,value,origin:'user',sourceRef:'message-confirmed',confirmedBy:'founder',confirmedAt:'2026-09-24T00:00:00Z'});
test('EN/AR local application fills explicit fields, retains unknowns, provisional sources and actual changes',async()=>{
 for(const language of ['en','ar'] as const){
  const c=snapshot(),before=JSON.stringify(c);
  const d=await prepareApplication({language,fields:{business_name:'Pearl North',activity_description:'graphic design',task_stage:'idea stage'}},c);
  assert.equal(d.kind,'application_worksheet');assert.equal(d.fields.business_name,'Pearl North');assert.equal(d.fields.activity_description,'graphic design');assert.match(d.html,/Pearl North/);assert.match(d.html,/graphic design/);
  assert.equal(d.fields.legal_form,null);assert.equal(d.fields.incorporation_status,null);assert.equal(d.fields.premises_type,null);
  assert.equal(d.fieldOrigins.business_name,'unconfirmed_draft_input');assert.equal(d.fieldOrigins.legal_form,'missing');assert.ok(d.missingFields.includes('legal_form'));
  assert.equal(d.populatedFields.length,3);assert.equal(d.filledFields.length,3);assert.equal(d.changedFields.length,3);assert.equal(d.fillingSummary.populatedCount,3);assert.ok(d.changedFields.every((x:any)=>x.before===null&&x.change==='populated'));
  assert.equal(d.worksheet.sections.length,4);assert.ok(d.worksheet.fields.every((f:any)=>f.officialFieldName===null));assert.equal(d.formBoundary.officialApplicationFieldsObserved,false);assert.equal(d.formBoundary.observedContactForm.isLicenceApplication,false);assert.deepEqual(d.formBoundary.licenceForm.fields,[]);
  assert.ok(d.citations.length>0);assert.ok(d.citations.every((c:any)=>c.resolved&&c.rawSha256.length===64));assert.ok(d.templateProvenance.some((p:any)=>p.path==='actions/forms/madar-preparation-worksheet.json'));assert.ok(d.templateProvenance.some((p:any)=>p.path==='context/progressive-questions.json'));
  assert.ok(d.questions.length<=3);assert.ok(d.questions.every((q:any)=>['Q01','Q02','Q03'].includes(q.questionId)));assert.equal(d.officialFees,null);assert.equal(d.eligibility,'unresolved');assert.equal(d.canSubmit,false);assert.equal(d.submission,'not_available');assert.ok(d.provisionalChecks.every((p:any)=>p.value===null&&p.requiredForThisCase===null));
  assert.match(d.title,/not an official application/);assert.doesNotMatch(JSON.stringify(d.fields),/Madar|one_person|assumed_incorporated/);assert.equal(JSON.stringify(c),before);
  const {html,hash:draftHash,payloadHash,contentHash,...payload}=d;assert.equal(hash(payload),payloadHash);assert.equal(draftHash,payloadHash);assert.equal(hash(html),contentHash);assert.doesNotMatch(html,/<form|<script|<input/);
 }
});
test('explicit status/legal form remain draft proposals, confirmed snapshot wins without making eligibility claims',async()=>{
 const c=snapshot([fact('business.name','Confirmed Name'),fact('premises.unit','12')]);
 const d=await prepareApplication({fields:{business_name:'Pearl North',legal_form:'not chosen',incorporation_status:'not incorporated',premises_unit:'21'}},c);
 assert.equal(d.fields.business_name,'Confirmed Name');assert.equal(d.fieldOrigins.business_name,'confirmed_case_fact');assert.equal(d.fields.premises_unit,'12');assert.equal(d.fieldOrigins.legal_form,'unconfirmed_draft_input');assert.equal(d.fields.incorporation_status,'not incorporated');assert.equal(d.licensingReady,false);
 assert.equal(d.worksheet.fields.find((f:any)=>f.key==='business_name').provenance.value.sourceRef,'message-confirmed');
});
test('updates preserve previous values, create new hashes, expose exact changes and reject altered/cross-case history',async()=>{
 const c=snapshot();const first=await prepareApplication({fields:{business_name:'Pearl North',activity_description:'graphic design'}},c);const original=JSON.stringify(first);
 const second=await prepareApplication({fields:{activity_description:'graphic design and print',premises_type:'shared office'}},c,undefined,first);
 assert.equal(second.fields.business_name,'Pearl North');assert.notEqual(second.contentHash,first.contentHash);assert.notEqual(second.payloadHash,first.payloadHash);assert.equal(second.previousPayloadHash,first.payloadHash);assert.equal(second.changedFields.length,2);
 assert.deepEqual(second.changedFields.find((v:any)=>v.field==='activity_description'),{field:'activity_description',label:'Products or services',before:'graphic design',after:'graphic design and print',origin:'unconfirmed_draft_input',change:'updated'});assert.equal(JSON.stringify(first),original);
 const cleared=await prepareApplication({fields:{premises_type:null}},c,undefined,second);assert.equal(cleared.fields.premises_type,null);assert.equal(cleared.changedFields[0].change,'cleared');
 await assert.rejects(prepareApplication({},c,undefined,{...first,html:'changed'}),(e:any)=>e.code==='APPLICATION_HASH_MISMATCH');
 await assert.rejects(prepareApplication({},{...c,businessId:'other'},undefined,first),(e:any)=>e.code==='APPLICATION_CASE_MISMATCH');
});
test('hostile text is inert; oversize, unsupported fee/transcript fields and model-supplied previous draft rejected',async()=>{
 const d=await prepareApplication({fields:{business_name:'<script>alert(1)</script>',activity_description:'<img src=x onerror=alert(1)>'}});
 assert.ok(!d.html.includes('<script>'));assert.ok(!d.html.includes('<img'));assert.match(d.html,/&lt;script&gt;/);assert.match(d.html,/form-action 'none'/);
 for(const options of [{fields:{activity_description:'x'.repeat(1501)}},{fields:{business_name:42}},{fields:{userRequest:'a full transcript'}},{fields:{officialFees:'100'}},{previousDraft:{}}])await assert.rejects(prepareApplication(options as any), (e:any)=>/^(APPLICATION_FIELD_LIMIT|INVALID_APPLICATION_FIELD|INVALID_APPLICATION_INPUT)$/.test(e.code));
});
test('executeTool application uses server-held prior state and requires neither lease nor inspection',async()=>{
 const c=snapshot();const context:ToolContext={caseSnapshot:c,job:{jobId:'job',businessId:c.businessId},documents:[],privateRoot:'/private/tmp/unused',outputDir:'/private/tmp/unused',previousResults:{},signal:new AbortController().signal};
 const call={name:'prepare_application' as const,jobId:'job',callId:'call',businessRevision:1,arguments:{fields:{business_name:'Pearl North'}}};
 const first=await executeTool(call,context);assert.equal(first.ok,true,JSON.stringify(first.error));context.previousResults.prepare_application=first;
 const second=await executeTool({...call,arguments:{fields:{activity_description:'graphic design'} as any}},context);assert.equal(second.ok,true,JSON.stringify(second.error));assert.equal(second.data.fields.business_name,'Pearl North');assert.equal(second.data.changedFields[0].field,'activity_description');assert.equal(second.provenance.length,1);
});
