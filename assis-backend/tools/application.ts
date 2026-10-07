import { hash } from '../contracts/index.ts';
import type { CaseSnapshot } from '../contracts/index.ts';
import { KnowledgeError, readKnowledge, guidanceFrom } from './knowledge.ts';

export type ApplicationOptions={language?:'en'|'ar';fields?:Record<string,string|null>};
type Origin='confirmed_case_fact'|'unconfirmed_draft_input'|'missing';
type Definition={key:string;label:string;ar:string;section:string;facts:string[];templateKey?:string;max?:number};
const definitions:Definition[]=[
  {key:'business_name',label:'Business name',ar:'اسم المشروع',section:'business',facts:['business.name'],templateKey:'company_name'},
  {key:'activity_description',label:'Products or services',ar:'المنتجات أو الخدمات',section:'business',facts:['business.activityDescription','business.activity'],templateKey:'activity_description',max:1500},
  {key:'task_stage',label:'Current stage or objective',ar:'المرحلة أو الهدف الحالي',section:'business',facts:['task.stage','business.stage'],templateKey:'objective'},
  {key:'legal_form',label:'Legal form',ar:'الشكل القانوني',section:'setup',facts:['business.legalForm'],templateKey:'legal_form'},
  {key:'incorporation_status',label:'Incorporation status',ar:'حالة تأسيس الشركة',section:'setup',facts:['business.incorporationStatus','business.incorporation'],templateKey:'incorporation'},
  {key:'activity_code',label:'Activity code, if known',ar:'رمز النشاط إن كان معروفاً',section:'setup',facts:['business.activityCode'],templateKey:'activity_code'},
  {key:'founder_role',label:'Your role',ar:'صفتك في المشروع',section:'setup',facts:['founder.role']},
  {key:'premises_type',label:'Proposed premises type',ar:'نوع المقر المقترح',section:'premises',facts:['premises.type'],templateKey:'premises'},
  {key:'premises_address',label:'Premises address, if supplied',ar:'عنوان المقر إن تم تقديمه',section:'premises',facts:['premises.address'],templateKey:'premises'},
  {key:'premises_unit',label:'Premises unit, if supplied',ar:'رقم الوحدة إن تم تقديمه',section:'premises',facts:['premises.unit'],templateKey:'premises'},
  {key:'sender_name',label:'Contact name',ar:'اسم جهة الاتصال',section:'contact',facts:['founder.name'],templateKey:'sender_name',max:255},
  {key:'reply_email',label:'Reply email',ar:'البريد الإلكتروني للرد',section:'contact',facts:['founder.email'],templateKey:'reply_email',max:254},
  {key:'contact_phone',label:'Contact phone, if supplied',ar:'رقم التواصل إن تم تقديمه',section:'contact',facts:['founder.phone'],max:100},
];
export type ApplicationDraft={fields:Record<string,string|null>;fieldOrigins:Record<string,Origin>;payloadHash:string;hash:string;contentHash:string;html:string;businessId:string|null;businessRevision:number|null;[key:string]:any};
function ensure(value:unknown,code:string,message:string):asserts value {if(!value)throw new KnowledgeError(code,message);}
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);

/** Local authored preparation only. All previous state is supplied by the trusted runtime. */
export async function prepareApplication(options:ApplicationOptions={},caseSnapshot?:CaseSnapshot,signal?:AbortSignal,previousDraft?:ApplicationDraft):Promise<ApplicationDraft>{
  ensure(options&&typeof options==='object'&&!Array.isArray(options),'INVALID_APPLICATION_INPUT','Application options must be an object.');
  ensure(Object.keys(options).every(k=>['fields','language'].includes(k)),'INVALID_APPLICATION_INPUT','Use scoped fields and language only; no transcript or external action.');
  const language=options.language??'en';ensure(language==='en'||language==='ar','INVALID_LANGUAGE','Use Arabic or English.');
  const supplied=options.fields??{};
  ensure(supplied&&typeof supplied==='object'&&!Array.isArray(supplied)&&Object.keys(supplied).length<=definitions.length,'INVALID_APPLICATION_FIELDS','Supply a bounded worksheet field object.');
  let inputSize=0;
  for(const [key,value] of Object.entries(supplied)){
    const def=definitions.find(d=>d.key===key);
    ensure(def,'INVALID_APPLICATION_FIELD','Worksheet field is not supported.');
    ensure(value===null||(typeof value==='string'&&value.length<=(def.max??500)),'APPLICATION_FIELD_LIMIT','Worksheet value is too large or is not text.');
    inputSize+=value?.length??0;
  }
  ensure(inputSize<=6000,'APPLICATION_INPUT_LIMIT','Worksheet input exceeds 6,000 characters.');
  if(previousDraft){
    const {html,contentHash,hash:draftHash,payloadHash,...payload}=previousDraft;
    ensure(hash(payload)===payloadHash&&draftHash===payloadHash&&hash(html)===contentHash,'APPLICATION_HASH_MISMATCH','Previous worksheet bytes or payload changed.');
    ensure(!!caseSnapshot&&previousDraft.businessId===caseSnapshot.businessId&&Number.isSafeInteger(previousDraft.businessRevision)&&previousDraft.businessRevision!==null&&previousDraft.businessRevision<=caseSnapshot.businessRevision,'APPLICATION_CASE_MISMATCH','Previous worksheet must belong to this case and an earlier or equal revision.');
  }
  const confirmed=(caseSnapshot?.facts||[]).filter(f=>f.value!==null&&!!f.confirmedBy&&!!f.confirmedAt&&Number.isFinite(Date.parse(f.confirmedAt)));
  const fields:Record<string,string|null>={},fieldOrigins:Record<string,Origin>={};
  const fieldEvidence:Record<string,unknown>={};
  for(const def of definitions){
    const fact=def.facts.map(key=>confirmed.find(f=>f.field===key)).find(Boolean);
    if(fact){
      ensure(typeof fact.value==='string'&&fact.value.length<=(def.max??500),'APPLICATION_FACT_LIMIT','Confirmed worksheet fact is not bounded text.');
      fields[def.key]=fact.value;fieldOrigins[def.key]='confirmed_case_fact';
      fieldEvidence[def.key]={field:fact.field,sourceRef:fact.sourceRef,confirmedBy:fact.confirmedBy,confirmedAt:fact.confirmedAt};
    }else{
      const prior=previousDraft?.fieldOrigins[def.key]==='unconfirmed_draft_input'?previousDraft.fields[def.key]:null;
      const value=own(supplied,def.key)?supplied[def.key]:prior;
      fields[def.key]=value?.trim()||null;fieldOrigins[def.key]=fields[def.key]===null?'missing':'unconfirmed_draft_input';
      fieldEvidence[def.key]=fields[def.key]===null?null:{origin:own(supplied,def.key)?'runtime_scoped_user_proposal':'previous_local_draft',confirmation:'not_confirmed',previousPayloadHash:own(supplied,def.key)?null:previousDraft?.payloadHash??null};
    }
  }
  const query='commercial licence documents premises activity';
  const raw=await readKnowledge({query,limit:3,mode:'research',application:true},signal);
  const guidance=guidanceFrom(raw,query,[],caseSnapshot),authored=raw.applicationData;
  const templateFields=authored.worksheet.fields as any[];
  const rows=definitions.map(def=>{
    const template=templateFields.find(f=>f.key===def.templateKey);
    return {key:def.key,label:language==='ar'?def.ar:def.label,section:def.section,value:fields[def.key],origin:fieldOrigins[def.key],officialFieldName:null,requiredness:'local_preparation_only',provenance:{value:fieldEvidence[def.key],structure:template?{worksheetId:authored.worksheet.id,templateKey:template.key,sourceObservation:template.provenance,limits:'Template demo values discarded; source conditions remain provisional.'}:{origin:'Dikan-authored local context field'},applicability:'unresolved'}};
  });
  const sectionLabels=language==='ar'?{business:'المشروع',setup:'التأسيس والنشاط',premises:'المقر المقترح',contact:'التواصل'}:{business:'Business',setup:'Setup and activity',premises:'Proposed premises',contact:'Contact'};
  const sections=Object.entries(sectionLabels).map(([id,label])=>({id,label,fields:rows.filter(r=>r.section===id)}));
  const missingFields=rows.filter(r=>r.value===null).map(r=>r.key),populatedFields=rows.filter(r=>r.value!==null).map(r=>r.key);
  const changedFields=rows.filter(r=>(previousDraft?.fields[r.key]??null)!==r.value).map(r=>({field:r.key,label:r.label,before:previousDraft?.fields[r.key]??null,after:r.value,origin:r.origin,change:r.value===null?'cleared':previousDraft?.fields[r.key]?'updated':'populated'}));
  // Adapt only the early, relevant published questions; never demo-specific unit conflicts or identity collection.
  const questionMap=[{key:'activity_description',id:'Q01',ar:'ما المنتجات أو الخدمات التي تريد تقديمها؟'},{key:'legal_form',id:'Q02',ar:'هل حددت الشكل القانوني، وهل تم تأسيس الشركة أم ما زال مخططاً لها؟'},{key:'founder_role',id:'Q03',ar:'هل أنت المالك أم المدير أم ممثل للمشروع؟'}];
  const questions=questionMap.filter(q=>fields[q.key]===null||(q.id==='Q02'&&fields.incorporation_status===null)).map(q=>{
    const original=authored.questions.questions.find((v:any)=>v.id===q.id);
    return {field:q.key,fields:q.id==='Q02'?['legal_form','incorporation_status']:[q.key],message:language==='ar'?q.ar:original.question,reason:original.reason,questionId:q.id,authority:'Dikan-authored question, not an official form requirement'};
  }).slice(0,3);
  const formBoundary={worksheetId:authored.worksheet.id,officialApplicationFieldsObserved:false,officialFieldNames:null,observedContactForm:{id:'ACT-F01',kind:'official_public_contact_form',isLicenceApplication:false},licenceForm:{id:'ACT-F02',status:'blocked_not_observed',fields:[]},notice:'Captured contact-form controls are not licence application fields.'};
  const provisionalChecks=templateFields.filter(f=>['commercial_registration_reference','lease_document','current_month_rent_receipt','regulator_approval','representative_authority'].includes(f.key)).map(f=>({key:f.key,label:f.label,value:null,applicability:'unresolved',requiredForThisCase:null,provenance:f.provenance,sourceStatus:'captured_research_only'}));
  const fillingSummary={populatedCount:populatedFields.length,changedCount:changedFields.length,missingCount:missingFields.length,message:`Filled ${populatedFields.length} local worksheet fields; ${changedFields.length} changed. No government form was filled or submitted.`};
  const payload={schemaVersion:1,kind:'application_worksheet',title:'Dikan — دكان · Business setup worksheet — for preparation, not an official application',language,businessId:caseSnapshot?.businessId??null,businessRevision:caseSnapshot?.businessRevision??null,factsHash:caseSnapshot?.factsHash??null,authority:'Dikan-authored local preparation worksheet',fields,fieldOrigins,worksheet:{sections,fields:rows},populatedFields,filledFields:rows.filter(r=>r.value!==null),changedFields,missingFields,questions,fillingSummary,previousPayloadHash:previousDraft?.payloadHash??null,templateProvenance:authored.provenance,formBoundary,provisionalChecks,citations:guidance.citations,sources:guidance.sources,corpusSha256:guidance.corpusSha256,conflictNotices:guidance.conflictNotices,caveats:[...guidance.caveats,'This worksheet is local preparation, not an official MOCI application.','No official licence fields have been observed for this route.','Filled draft inputs are not confirmed facts or evidence of eligibility.','Missing items are preparation gaps, not a list of mandatory government fields.'],officialFees:null,eligibility:'unresolved',activationState:'inactive',licensingReady:false,canSubmit:false,approved:false,sent:false,submission:'not_available',attachments:[],review:{state:'not_reviewed',required:true}};
  const payloadHash=hash(payload);
  const unknown=language==='ar'?'غير محدد':'Not provided';
  const originLabels:Record<Origin,string>=language==='ar'?{confirmed_case_fact:'معلومة مؤكدة في ملف المشروع',unconfirmed_draft_input:'مدخل للمسودة، غير مؤكد',missing:'يحتاج إلى إدخال'}:{confirmed_case_fact:'Confirmed case fact',unconfirmed_draft_input:'Draft input · unconfirmed',missing:'Needs input'};
  const html=`<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(payload.title)}</title><style>body{font:16px/1.6 system-ui;color:#182c39;max-width:920px;margin:32px auto;padding:20px;overflow-wrap:anywhere}h1{font-size:27px;line-height:1.3}h2{font-size:20px;margin-top:28px}.notice{border-inline-start:4px solid #977024;padding:10px 16px;background:#fff8e8}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.field{border:1px solid #ccd5dc;border-radius:8px;padding:14px}.label{font-weight:600}.value{white-space:pre-wrap;min-height:26px;margin:8px 0}.origin{font-size:13px;color:#596876}.unknown{color:#756543}details{margin:18px 0;border:1px solid #d8dee5;padding:12px;border-radius:8px}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap}li{margin:8px 0}@media(max-width:600px){.grid{grid-template-columns:1fr}body{margin:0;padding:16px}}@media print{.field{break-inside:avoid}}</style></head><body><h1>${escape(payload.title)}</h1><p class="notice">${language==='ar'?'ورقة تحضير محلية. ليست طلباً رسمياً ولم يتم إرسالها. المدخلات غير المؤكدة تحتاج إلى مراجعتك.':'Local preparation. Not an official application and not submitted. Unconfirmed draft inputs need your review.'}</p><p>${escape(fillingSummary.message)}</p>${sections.map(section=>`<section><h2>${escape(section.label)}</h2><div class="grid">${section.fields.map(f=>`<div class="field"><div class="label">${escape(f.label)}</div><div class="value${f.value===null?' unknown':''}">${escape(f.value??unknown)}</div><div class="origin">${escape(originLabels[f.origin])}</div></div>`).join('')}</div></section>`).join('')}<section><h2>${language==='ar'?'الخطوة التالية':'Next questions'}</h2><ul>${questions.map(q=>`<li>${escape(q.message)}</li>`).join('')}</ul><p>${language==='ar'?'المعلومات غير المحددة ليست قائمة بمتطلبات حكومية إلزامية.':'Unfilled fields are preparation gaps, not mandatory government requirements.'}</p></section><details><summary>Missing items (${missingFields.length})</summary><ul>${rows.filter(r=>r.value===null).map(r=>`<li>${escape(r.label)}</li>`).join('')}</ul></details><details><summary>Changes in this worksheet (${changedFields.length})</summary><ul>${changedFields.map(f=>`<li>${escape(f.label)}: ${escape(f.before??unknown)} → ${escape(f.after??unknown)} (${escape(originLabels[f.origin])})</li>`).join('')}</ul></details><section><h2>Captured research sources</h2><p>Currentness and case applicability remain unresolved. Official fees and regulator requirements are not established.</p><ul>${guidance.sources.map(s=>`<li><a href="${escape(s.url)}">${escape(s.id)} · ${escape(s.title)}</a> · ${escape(s.locator)}</li>`).join('')}</ul></section><details><summary>Evidence, field provenance and limits</summary><ul>${payload.caveats.map(c=>`<li>${escape(c)}</li>`).join('')}</ul><pre>${escape(JSON.stringify({templateProvenance:payload.templateProvenance,formBoundary,fields:rows,provisionalChecks,citations:payload.citations,sources:payload.sources,conflictNotices:payload.conflictNotices,corpusSha256:payload.corpusSha256},null,2))}</pre><p>Payload SHA-256 ${payloadHash}</p></details></body></html>`;
  return {...payload,payloadHash,hash:payloadHash,html,contentHash:hash(html)};
}
