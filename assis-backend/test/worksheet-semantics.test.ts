import test from 'node:test';
import assert from 'node:assert/strict';
import {attributedDraftFields,applicationFields} from '../src/draft-inputs.ts';
const user=(content:string,id='u1')=>({id,role:'user',content});
const attribute=(fields:Record<string,string|null>,content:string)=>attributedDraftFields(fields,[user(content)],applicationFields);

test('worksheet does not treat action instructions or descriptions as stage and activity-code facts',()=>{
 const result=attribute({task_stage:'planning',activity_code:'social-media design service'},'Prepare my strategy and planning phases for a social-media design service.');
 assert.deepEqual(result.fields,{});assert.equal(result.issues.length,2);assert.deepEqual(result.draftInputs,[]);
 assert.deepEqual(attribute({activity_code:'social-media design service'},'My activity code is social-media design service.').fields,{});
});

test('mentions, questions, hypotheticals and negated setup choices remain unknown',()=>{
 for(const [field,value,content] of [
  ['legal_form','LLC','Should my legal form be LLC?'],
  ['legal_form','LLC','My legal form is not LLC.'],
  ['legal_form','not LLC','My legal form is not LLC.'],
  ['legal_form','LLC','My legal form is LLC, not decided yet.'],
  ['legal_form','LLC','If my legal form is LLC, what happens?'],
  ['legal_form','LLC','My legal form is LLC if I choose that route.'],
  ['incorporation_status','incorporated','My business is not incorporated.'],
  ['task_stage','planning','My current stage is planning?'],
  ['activity_code','7410','Can you check activity code 7410?'],
 ])assert.deepEqual(attribute({[field]:value},content).fields,{},content);
});

test('explicit field assertions retain exact founder wording as unconfirmed draft inputs',()=>{
 const proposals={task_stage:'planning',legal_form:'LLC',incorporation_status:'not incorporated',activity_code:'7410'};
 const result=attribute(proposals,'My current stage is planning. My legal form is LLC. My business is not incorporated. My official activity code is 7410.');
 assert.deepEqual(result.fields,proposals);assert.equal(result.issues.length,0);
 assert.ok(result.draftInputs.every(p=>p.origin==='unconfirmed_user_statement'&&p.messageId==='u1'));
});

test('Arabic and labelled values are accepted without claiming registry verification',()=>{
 assert.deepEqual(attribute({activity_code:'٧٤١٠',task_stage:'التخطيط'},'رمز النشاط: ٧٤١٠\nالمرحلة الحالية: التخطيط').fields,{activity_code:'٧٤١٠',task_stage:'التخطيط'});
 assert.deepEqual(attribute({activity_code:'74.10'},'Activity code: 74.10').fields,{activity_code:'74.10'});
 assert.deepEqual(attribute({legal_form:'LLC'},'Document field corrections: {"legal_form":"LLC"}').fields,{legal_form:'LLC'});
});

test('null and explicit unknown values reach the worksheet executor as clearing instructions',()=>{
 const result=attribute({activity_code:null,legal_form:'not chosen',task_stage:''},'Clear the activity code; legal form not chosen.');
 assert.deepEqual(result.fields,{activity_code:null,legal_form:null,task_stage:null});assert.deepEqual(result.draftInputs,[]);
});

test('ordinary founder business wording is still retained, not model paraphrases or assistant claims',()=>{
 const result=attributedDraftFields({business_name:'Pearl Studio',activity_description:'Arabic and English social-media design'},[{id:'brief',role:'user',origin:'unconfirmed_user_workspace',content:'Pearl Studio provides Arabic and English social-media design.'}],applicationFields);
 assert.equal(result.fields.business_name,'Pearl Studio');assert.equal(result.fields.activity_description,'Arabic and English social-media design');
 assert.equal(result.draftInputs[0].origin,'unconfirmed_user_workspace');
 assert.deepEqual(attributedDraftFields({legal_form:'LLC'},[{role:'assistant',content:'Legal form: LLC'}],applicationFields).fields,{});
});
