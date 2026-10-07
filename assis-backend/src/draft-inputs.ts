import {ensure} from '../contracts/index.ts';

export const enquiryFields=['business_name','activity_description','sender_name','reply_email','document_label','document_question'] as const;
export const applicationFields=['business_name','activity_description','task_stage','legal_form','incorporation_status','activity_code','premises_type','premises_address','premises_unit','founder_role','sender_name','reply_email','contact_phone'] as const;
const text=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ');
const fold=(s:string)=>text(s).toLocaleLowerCase('en');
const unknown=/^(?:unknown|not known|not provided|not specified|unspecified|not chosen|not decided|tbd|n\/?a|غير معروف|غير محدد)$/i;

const semanticLabels:Record<string,string>={
 task_stage:'(?:task_stage|current stage|business stage|stage|المرحلة الحالية|مرحلة المشروع)',
 activity_code:'(?:activity_code|(?:official )?activity code|رمز النشاط)',
 legal_form:'(?:legal_form|legal form|الشكل القانوني)',
 incorporation_status:'(?:incorporation_status|incorporation status|حالة التأسيس|حالة تأسيس الشركة)',
};
const escaped=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// This is a conservative attribution check, not a verification of a legal code or status.
// A phase mentioned in a request, a suggested route, or a negated value is not a founder assertion.
function semanticallyAttributed(field:string,value:string,content:string){
 const label=semanticLabels[field];if(!label)return true;
 if(field==='activity_code'&&!/^[0-9٠-٩۰-۹]{2,12}(?:[.-][0-9٠-٩۰-۹]{1,6}){0,3}$/.test(value))return false;
 if(field!=='incorporation_status'&&/^(?:not |no |ليس |ليست |غير )/i.test(value))return false;
 const v=escaped(fold(value));
 const clauseStart='(?:^|[\\n.;,!?،؛{]|\\band\\s+)\\s*';
 const assertPrefix=`(?:["']?(?:(?:my|our|the business(?:'s)?)\\s+)?${label}["']?\\s*(?:is|=|:|هو|هي)\\s*["']?)`;
 const end=`["']?(?=$|[\\s.,;!?،؛}])`;
 const normal=content.normalize('NFKC').toLocaleLowerCase('en');
 const assertion=new RegExp(clauseStart+assertPrefix+v+end,'u');
 const match=assertion.exec(normal);
 if(match){
  const continuation=normal.slice(match.index+match[0].length).split(/[\n.;،؛]/)[0];
  return !/[?؟]/.test(continuation)&&! /\b(?:if|maybe|perhaps|hypothetically|not|unconfirmed|undecided)\b/.test(continuation);
 }
 if(field==='incorporation_status')return new RegExp(clauseStart+`(?:my business|our business|the business|my company|our company)\\s+is\\s+${v}${end}`,'u').test(normal)&&!/[?؟]/.test(normal);
 return false;
}

// User wording may populate a draft, but is never a confirmed typed case fact.
export function attributedDraftFields(proposals:any,messages:any[],allowed:readonly string[]){
 ensure(proposals&&typeof proposals==='object'&&!Array.isArray(proposals)&&Object.keys(proposals).every(k=>allowed.includes(k)),'INVALID_DRAFT_FIELDS','Only supported draft fields may be proposed');
 const fields:Record<string,string|null>={};const draftInputs:any[]=[];const issues:any[]=[];
 for(const [field,value] of Object.entries(proposals)){
  if(value===undefined)continue;
  if(value===null||value===''||(typeof value==='string'&&unknown.test(text(value)))){fields[field]=null;continue;}
  ensure(typeof value==='string'&&value.trim().length>0&&value.length<=2000,'INVALID_DRAFT_FIELDS',`Draft field ${field} must be bounded text or null`);
  const source=[...messages].reverse().find(m=>m.role==='user'&&typeof m.content==='string'&&fold(m.content).includes(fold(value))&&semanticallyAttributed(field,text(value),m.content));
  if(!source){issues.push({field,code:'UNSUPPORTED_DRAFT_FIELD',message:`Please provide the wording for ${field}; the proposed value was not explicitly stated for this field and was left unknown.`});continue;}
  const normal=text(source.content);const start=fold(normal).indexOf(fold(value));const exact=normal.slice(start,start+text(value).length);
  fields[field]=exact;draftInputs.push({field,value:exact,messageId:source.id,origin:source.origin==='unconfirmed_user_workspace'?'unconfirmed_user_workspace':'unconfirmed_user_statement'});
 }
 return {fields,draftInputs,issues};
}
