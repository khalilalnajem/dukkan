import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash } from '../contracts/index.ts';
import type { CaseSnapshot } from '../contracts/index.ts';

export class KnowledgeError extends Error {
  code:string;
  constructor(code:string,message:string){super(message);this.code=code;}
}
export const SOURCE_BLOCKERS = [
  {code:'SOURCE_APPLICABILITY_UNRESOLVED',message:'No activated legal requirement set. Activity code, route and founder eligibility require review.'},
  {code:'SOURCE_COVERAGE_INCOMPLETE',message:'Current premises/regulator conditions, required documents and official form are unresolved.'},
  {code:'OFFICIAL_FEES_UNKNOWN',message:'Current official fees are unknown; no amount is inferred from the undated guide.'},
];
export type GuidanceOptions = {query?:string;limit?:number;mode?:'research'|'current'};
export type Source = {id:string;versionId:string;url:string;title:string;publisher:string;language:string;locator:string;retrievedAt:string;rawHash:string;passageHash:string;passage:string;publishedAt:string|null;effectiveAt:string|null;reviewedAt:null;activationState:'inactive';summary:string;limitations:string[];[key:string]:any};
function ensure(value:unknown,code:string,message:string):asserts value {if(!value)throw new KnowledgeError(code,message);}
const confirmed = (c?:CaseSnapshot) => (c?.facts||[]).filter(f=>f.value!==null&&!!f.confirmedBy&&!!f.confirmedAt&&Number.isFinite(Date.parse(f.confirmedAt)));
const factValue = (c:CaseSnapshot|undefined,field:string) => confirmed(c).find(f=>f.field===field)?.value;
const htmlEscape = (value:unknown) => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Private queries are piped over stdin, never command-line args or public files. */
export function readKnowledge(request:{query:string;limit:number;mode:string;action?:string;contextQuery?:string;application?:boolean},signal?:AbortSignal):Promise<any>{
  return new Promise((accept,reject)=>{
    if(signal?.aborted){reject(new KnowledgeError('ABORTED','Knowledge lookup cancelled.'));return;}
    const child=spawn(process.env.DIKAN_PYTHON_PATH||'python3',['-B',fileURLToPath(new URL('./corpus-bridge.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    const chunks:Buffer[]=[];let size=0,done=false;
    const finish=(error?:Error,value?:any)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):accept(value);};
    const abort=()=>{child.kill('SIGKILL');finish(new KnowledgeError('ABORTED','Knowledge lookup cancelled.'));};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new KnowledgeError('KNOWLEDGE_TIMEOUT','Knowledge verification exceeded 12 seconds.'));},12000);
    signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>finish(new KnowledgeError('KNOWLEDGE_RUNTIME_UNAVAILABLE','Local Python knowledge reader could not start.')));
    child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1024*1024){child.kill('SIGKILL');finish(new KnowledgeError('KNOWLEDGE_RESULT_LIMIT','Knowledge response exceeds its size limit.'));}else chunks.push(chunk);});
    child.on('close',code=>{
      if(done)return;
      if(code!==0){finish(new KnowledgeError('KNOWLEDGE_READER_FAILED','Knowledge reader failed; no fallback evidence was used.'));return;}
      try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value.ok)finish(new KnowledgeError(value.error.code,value.error.message));else finish(undefined,value.data);}
      catch{finish(new KnowledgeError('KNOWLEDGE_RESPONSE_INVALID','Knowledge reader returned an invalid result.'));}
    });
    child.stdin.end(JSON.stringify({...request,root:fileURLToPath(new URL('../../knowledge/',import.meta.url))}));
  });
}
function optionsFor(options:GuidanceOptions,c?:CaseSnapshot){
  ensure(options&&typeof options==='object','INVALID_QUERY','Knowledge options must be an object.');
  ensure(options.query===undefined||typeof options.query==='string','INVALID_QUERY','Query must be text.');
  const query=options.query?.trim()||'first commercial licence documents route';
  ensure(query.length<=2000,'QUERY_SIZE_LIMIT','Keep the knowledge question within 2,000 characters.');
  const limit=options.limit??3,mode=options.mode??'research';
  ensure(Number.isInteger(limit)&&limit>=1&&limit<=6,'INVALID_QUERY_LIMIT','Return between one and six passages.');
  ensure(mode==='research'||mode==='current','INVALID_QUERY_MODE','Use research or current mode.');
  // Only route-relevant confirmed fields; never identity, financial, premises unit or document text.
  const contextFields=confirmed(c).filter(f=>['business.activity','business.activityDescription','business.legalForm','task.stage','premises.type'].includes(f.field)&&typeof f.value==='string').map(f=>({field:f.field,value:String(f.value).slice(0,180)})).slice(0,5);
  return {query,limit,mode,contextFields};
}
export function guidanceFrom(result:any,query:string,contextFields:Array<{field:string;value:string}>,c?:CaseSnapshot){
  const sources:Source[]=result.hits.map((hit:any)=>{
    const s=result.sourceRecords.find((s:any)=>s.sourceID===hit.sourceID),cit=hit.citation;
    return {id:hit.sourceID,versionId:hit.chunkID,url:cit.url,title:s.title,publisher:cit.authority,language:s.language,locator:[cit.page!==null?`PDF page ${cit.page}`:null,cit.article?`article ${cit.article}`:null,cit.localCitation].filter(Boolean).join('; '),retrievedAt:cit.capturedAt,rawHash:cit.rawSha256,passageHash:hash(hit.passage),passage:hit.passage,publishedAt:cit.publicationDate,effectiveAt:cit.effectiveDate,reviewedAt:null,activationState:'inactive',summary:'Captured official passage; case applicability and currentness require review.',limitations:hit.flags,citation:cit,scope:hit.scope,currentness:hit.currentness,conflicts:hit.conflicts,review:hit.review,sourceLocators:hit.sourceLocators,amendmentStatus:hit.amendmentStatus,score:hit.score};
  });
  const fields=['business.legalForm','business.activityCode','owner.type','founder.role','premises.type'];
  return {title:'Dikan — دكان research guidance',query,retrievalQuery:result.query,contextFields,corpusSha256:result.corpusSha256,builtAt:result.builtAt,method:result.method,mode:result.mode,sources,citations:sources.map(s=>s.citation),requirements:[] as unknown[],blockers:[...structuredClone(SOURCE_BLOCKERS),...(sources.length?[]:[{code:'INSUFFICIENT_EVIDENCE',message:'No eligible passage matched this question; no answer or requirement has been inferred.'}])],coverageComplete:false as const,activationState:'inactive' as const,abstained:sources.length===0,resultStatus:result.resultStatus,conflictNotices:result.conflictNotices,flags:result.flagsAcrossMatchingEvidence,excluded:result.excluded,route:{route:null,eligibility:'unknown',unresolvedFields:fields.filter(field=>factValue(c,field)===undefined),licensingReady:false,requirementSetVersion:null},caveats:['Captured official evidence only; currentness and case applicability remain unresolved.','Authored procedures and draft wording are not official source text.'],licensingReady:false,actionAuthorised:false};
}
export async function retrieveGuidance(options:GuidanceOptions={},caseSnapshot?:CaseSnapshot,signal?:AbortSignal){
  const o=optionsFor(options,caseSnapshot);
  // Explicit user question dominates; context only supplements a default lookup. This avoids generic facts flooding unrelated questions.
  const retrievalQuery=options.query?.trim()?o.query:[o.query,...o.contextFields.map(f=>f.value)].join(' ');
  const result=await readKnowledge({query:retrievalQuery,limit:o.limit,mode:o.mode,contextQuery:o.contextFields.map(f=>f.value).join(' ')},signal);
  return guidanceFrom(result,o.query,o.contextFields,caseSnapshot);
}
export type EnquiryOptions={kind:'route-clarification'|'missing-document';language?:'en'|'ar';fields?:Record<string,string|null>};
export async function prepareEnquiry(options:EnquiryOptions,caseSnapshot?:CaseSnapshot,signal?:AbortSignal){
  ensure(options&&['route-clarification','missing-document'].includes(options.kind),'INVALID_ENQUIRY_KIND','Choose route-clarification or missing-document.');
  const language=options.language??'en';ensure(['en','ar'].includes(language),'INVALID_LANGUAGE','Use Arabic or English.');
  const supplied=options.fields??{};
  ensure(typeof supplied==='object'&&!Array.isArray(supplied)&&Object.keys(supplied).length<=20,'INVALID_DRAFT_FIELDS','Provide a bounded draft field object.');
  for(const value of Object.values(supplied))ensure(value===null||(typeof value==='string'&&value.length<=2000),'INVALID_DRAFT_FIELDS','Draft fields must be text or null, up to 2,000 characters each.');
  const map:Record<string,string>={business_name:'business.name',activity_description:'business.activityDescription',incorporation_status:'business.incorporationStatus',legal_form:'business.legalForm',sender_name:'founder.name',reply_email:'founder.email'};
  const keys=['business_name','activity_description','incorporation_status','legal_form','document_label','document_question','sender_name','reply_email','userRequest'];
  const fields:Record<string,string|null>={},fieldOrigins:Record<string,string>={};
  for(const key of keys){const value=factValue(caseSnapshot,map[key])??(key==='activity_description'?factValue(caseSnapshot,'business.activity'):undefined);fields[key]=typeof value==='string'?value:supplied[key]?.trim()||null;fieldOrigins[key]=typeof value==='string'?'confirmed_case_fact':fields[key]?'unconfirmed_draft_input':'missing';}
  const isDemo=caseSnapshot?.businessId==='example-madar'&&factValue(caseSnapshot,'business.name')==='Madar Design Studio';
  const query=options.kind==='missing-document'?`lease documents ${fields.document_label||''}`:'first commercial licence route activity';
  const result=await readKnowledge({query,limit:3,mode:'research',action:options.kind},signal);
  const guidance=guidanceFrom(result,query,[],caseSnapshot),action=result.actionData;
  const required=isDemo?action.template.placeholders:['business_name','activity_description','incorporation_status','legal_form',...(options.kind==='missing-document'?['document_label','document_question']:[]),'sender_name','reply_email'];
  const missingFields:string[]=required.filter((key:string)=>!fields[key]);
  const marker=(key:string)=>fields[key]??`{{${key}}}`;
  let subject:string,body:string;
  if(isDemo){subject=action.template.languages[language].subject;body=action.template.languages[language].body.replace(/\{\{(\w+)\}\}/g,(_:string,key:string)=>marker(key));}
  else if(language==='ar'){
    subject=options.kind==='route-clarification'?'استفسار عن مسار الترخيص التجاري المناسب':'استفسار عن مستند للتحضير للترخيص التجاري';
    body=`السادة إدارة مركز الكويت للأعمال،\nتحية طيبة،\n\nأرجو إرشادي بشأن النشاط المقترح التالي: ${marker('activity_description')}.\nاسم المشروع: ${marker('business_name')}.\nحالة التأسيس: ${marker('incorporation_status')}.\nالشكل القانوني: ${marker('legal_form')}.\n\n${options.kind==='missing-document'?`أستفسر عن المستند التالي: ${marker('document_label')}.\nالسؤال: ${marker('document_question')}.\nيرجى توضيح ما إذا كان هذا المستند مطلوباً لحالتي، وشروطه والبدائل المقبولة إن وجدت.`:'ما مسار الترخيص المناسب، وكيف يمكن التأكد من رمز النشاط؟ وما متطلبات المقر والمستندات والموافقات التي ينبغي التحقق منها؟'}\n\nيرجى تحديد البوابة الرسمية والجهة المختصة، وما إذا كان يجوز لممثل متابعة الإجراءات والسند المطلوب لذلك. المعلومات غير المحددة تحتاج إلى استكمال، ولم تُحسم الأهلية أو متطلبات الترخيص. لا توجد مرفقات.\n\nمع الشكر،\n${marker('sender_name')}\n${marker('reply_email')}`;
  }else{
    subject=options.kind==='route-clarification'?'Enquiry about the appropriate commercial licence route':'Document enquiry for commercial licence preparation';
    body=`Dear Kuwait Business Center team,\n\nPlease advise on the following proposed activity: ${marker('activity_description')}.\nBusiness name: ${marker('business_name')}.\nIncorporation status: ${marker('incorporation_status')}.\nLegal form: ${marker('legal_form')}.\n\n${options.kind==='missing-document'?`My question concerns this document: ${marker('document_label')}.\nQuestion: ${marker('document_question')}.\nPlease confirm whether it is required for this case, its conditions and any accepted alternatives.`:'Which licensing route applies, and how can I confirm the activity code? Which premises conditions, documents and regulator approvals should I check?'}\n\nPlease identify the official portal and responsible department, and explain whether a representative can act and what authority is needed. Unspecified details still need confirmation; eligibility and licence requirements have not been established. No documents are attached.\n\nKind regards,\n${marker('sender_name')}\n${marker('reply_email')}`;
  }
  // userRequest is trace context only; professional correspondence uses scoped fields.
  const citations=[action.contactCitation,...guidance.citations];
  const payload={schemaVersion:1,title:'Dikan — دكان enquiry draft',kind:options.kind,language,businessId:caseSnapshot?.businessId??null,businessRevision:caseSnapshot?.businessRevision??null,factsHash:caseSnapshot?.factsHash??null,authority:'Dikan-authored draft, not official text',templateMode:isDemo?'published_fictional_template':'neutral_adaptation',templateId:action.template.id,templateProvenance:action.provenance,fields,fieldOrigins,missingFields,subject,body,destination:action.contact.destination,department:action.contact.department,channel:action.contact.channel,contact:action.contact,contactEvidence:{passage:action.contactPassage,passageHash:action.contactPassageHash,citation:action.contactCitation},citations,sources:guidance.sources,corpusSha256:guidance.corpusSha256,conflictNotices:guidance.conflictNotices,caveats:[...guidance.caveats,...action.contact.limitations,'Destination is for guidance or referral; it is not a verified licence application mailbox.','Draft text inputs are unconfirmed unless attributed to confirmed case facts.'],questions:missingFields.filter(f=>['activity_description','incorporation_status'].includes(f)).map(field=>({field,message:language==='ar'?(field==='activity_description'?'ما النشاط أو الخدمة التي تريد تقديمها؟':'هل أسست الشركة بالفعل أم ما زلت في مرحلة الفكرة؟'):(field==='activity_description'?'What service or activity do you want to offer?':'Have you already incorporated the business, or are you still at the idea stage?')})),attachments:[],approved:false,sent:false,submission:'not_available',licensingReady:false,status:missingFields.length?'needs_input':'draft_for_review',review:{state:'not_reviewed',required:true}};
  const payloadHash=hash(payload);
  const html=`<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${htmlEscape(payload.title)}</title><style>body{font:16px/1.7 system-ui;max-width:850px;margin:40px auto;padding:24px;overflow-wrap:anywhere}pre{white-space:pre-wrap}li{margin:8px 0}details{margin:16px 0;border:1px solid #d8dee5;border-radius:8px;padding:12px}summary{cursor:pointer;font-weight:600}summary:focus-visible{outline:2px solid #164b72;outline-offset:4px}</style></head><body><h1>${htmlEscape(payload.title)}</h1><p>Local authored draft. Not sent. Review required.</p><p>Draft details remain unconfirmed unless identified as confirmed case facts in the provenance.</p><p>${htmlEscape(payload.destination)} · ${htmlEscape(payload.department)}</p><h2>${htmlEscape(subject)}</h2><pre>${htmlEscape(body)}</pre><h2>Missing information</h2><p>${htmlEscape(missingFields.join(', ')||'None recorded; destination suitability still needs review.')}</p><h2>Sources</h2><p><a href="${htmlEscape(action.contactCitation.url)}">Official MOCI contact</a> · ${citations.length} captured citations. Currentness and case applicability still need review.</p><details><summary>Official contact evidence (${htmlEscape(action.contactCitation.sourceID)})</summary><pre>${htmlEscape(action.contactPassage)}</pre><p>Passage SHA-256 ${htmlEscape(action.contactPassageHash)}</p></details><details><summary>Sources, limits and full provenance</summary><ul>${citations.map((c:any)=>`<li><a href="${htmlEscape(c.url)}">${htmlEscape(c.sourceID)}</a> · ${htmlEscape(c.authority)} · ${htmlEscape(c.localCitation)} · capture ${htmlEscape(c.capturedAt)} · publication ${htmlEscape(c.publicationDate??'unknown')} · effective ${htmlEscape(c.effectiveDate??'unknown')} · SHA-256 ${htmlEscape(c.rawSha256)}</li>`).join('')}</ul><ul>${payload.caveats.map(c=>`<li>${htmlEscape(c)}</li>`).join('')}</ul><pre>${htmlEscape(JSON.stringify({draftFieldOrigins:Object.fromEntries(Object.entries(payload.fieldOrigins).filter(([key])=>key!=='userRequest')),templateMode:payload.templateMode,templateId:payload.templateId,templateProvenance:payload.templateProvenance,corpusSha256:payload.corpusSha256,citations:payload.citations,conflictNotices:payload.conflictNotices},null,2))}</pre><p>Payload SHA-256 ${payloadHash}</p></details></body></html>`;
  return {...payload,payloadHash,hash:payloadHash,html};
}
