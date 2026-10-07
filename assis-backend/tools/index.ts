import { createHash } from 'node:crypto';
import { readFile, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { spawn } from 'node:child_process';
import {inspectFormFields} from './form-inspection.ts';
import { hash } from '../contracts/index.ts';
import type { CaseSnapshot, DocumentVersion, Fact, ToolCall, ToolContext, ToolResult } from '../contracts/index.ts';

import { retrieveGuidance, prepareEnquiry, SOURCE_BLOCKERS, KnowledgeError } from './knowledge.ts';
import type { Source } from './knowledge.ts';
export { retrieveGuidance, prepareEnquiry, SOURCE_BLOCKERS };
export type { Source } from './knowledge.ts';
import { prepareApplication } from './application.ts';
export { prepareApplication };
export type { ApplicationOptions, ApplicationDraft } from './application.ts';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS = 10;
export type Evidence = {field:string;value:string;documentId:string;page:number;start:number;end:number;quote:string;confidence:'candidate';contentHash:string};
export type Check = {field:string;documentId?:string;state:'missing'|'unreadable'|'needs_review'|'mismatch'|'checked';message:string;observed?:Evidence[];expected?:unknown};
export type Question = {field:string;message:string;reasonCode:string};
export class ToolError extends Error {code:string; constructor(code:string,message:string){super(message);this.code=code;}}
function requireThat(value:unknown,code:string,message:string):asserts value {if(!value) throw new ToolError(code,message);}
const digest = (data:Buffer|string) => createHash('sha256').update(data).digest('hex');
const display = (v:unknown) => v===null||v===undefined ? 'Unknown' : typeof v==='string'?v:JSON.stringify(v);
export const escapeHtml = (v:unknown) => display(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const escapeMd = (v:unknown) => escapeHtml(v).replace(/([\\`*_\[\]{}()#+.!|>-])/g,'\\$1').replace(/\r?\n/g,'<br>');
const getFact = (c:CaseSnapshot,field:string) => c.facts.find(f=>f.field===field);

async function readPrivatePdf(doc:DocumentVersion,root:string):Promise<Buffer> {
  requireThat(doc.mime==='application/pdf'&&extname(doc.name).toLowerCase()==='.pdf','UNSUPPORTED_FILE_TYPE','Only text PDF documents are supported.');
  requireThat(Number.isSafeInteger(doc.bytes)&&doc.bytes>0&&doc.bytes<=MAX_FILE_BYTES,'FILE_SIZE_LIMIT','PDF must be non-empty and no larger than 10 MB.');
  requireThat(Number.isFinite(Date.parse(doc.expiresAt))&&Date.parse(doc.expiresAt)>Date.now(),'DOCUMENT_EXPIRED','Document expired; it must not be processed.');
  requireThat(isAbsolute(doc.storageKey),'INVALID_DOCUMENT_PATH','A server-issued absolute storage path is required.');
  const [rootReal,fileReal]=await Promise.all([realpath(root),realpath(doc.storageKey)]);
  const rel=relative(rootReal,fileReal);
  requireThat(rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel),'DOCUMENT_PATH_ESCAPE','Document must remain inside private storage.');
  const handle=await open(fileReal,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await handle.stat();
    requireThat(stat.isFile()&&stat.size===doc.bytes&&stat.size<=MAX_FILE_BYTES,'FILE_SIZE_MISMATCH','Stored PDF size differs from pinned document version.');
    const bytes=await handle.readFile();
    requireThat(bytes.subarray(0,5).toString()==='%PDF-','INVALID_PDF','Document does not have a PDF header.');
    requireThat(digest(bytes)===doc.contentHash,'DOCUMENT_HASH_MISMATCH','Document bytes differ from pinned content hash.');
    return bytes;
  } finally {await handle.close();}
}

/** Bounded local extraction. File bytes are passed through stdin, never shell text. */
export function extractPdfText(bytes:Buffer,signal?:AbortSignal):Promise<string> {
  return new Promise((accept,reject)=>{
    if(signal?.aborted){reject(new ToolError('ABORTED','Document extraction cancelled.'));return;}
    const command=process.env.ASSIS_PDFTOTEXT_PATH||'/opt/homebrew/bin/pdftotext';
    const child=spawn(command,['-layout','-enc','UTF-8','-','-'],{stdio:['pipe','pipe','pipe']});
    let done=false; let total=0; const chunks:Buffer[]=[];
    const finish=(error?:Error,text?:string)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):accept(text||'');};
    const abort=()=>{child.kill('SIGKILL');finish(new ToolError('ABORTED','Document extraction cancelled.'));};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new ToolError('EXTRACTION_TIMEOUT','PDF extraction exceeded 10 seconds.'));},10000);
    signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>finish(new ToolError('EXTRACTOR_UNAVAILABLE','Local pdftotext could not start.')));
    child.stdout.on('data',(chunk:Buffer)=>{total+=chunk.length;if(total>2*1024*1024){child.kill('SIGKILL');finish(new ToolError('EXTRACTION_SIZE_LIMIT','Extracted text exceeds 2 MB.'));}else chunks.push(chunk);});
    // Drain diagnostics without storing or logging private document contents.
    child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
    child.on('close',code=>finish(code===0?undefined:new ToolError('PDF_UNREADABLE','PDF cannot be read (possibly encrypted or malformed).'),Buffer.concat(chunks).toString('utf8')));
    child.stdin.end(bytes);
  });
}

/** Narrow candidate extraction, not a legal decision or document authentication. */
export function extractUnitEvidence(text:string,documentId:string,contentHash:string):Evidence[] {
  const found:Evidence[]=[];
  for(const [index,page] of text.split('\f').entries()) {
    const pattern=/^\s*(?:Premises\s+unit|Office\s+unit|Unit|رقم\s+الوحدة)\s*[:#]?\s*([0-9٠-٩]{1,6})(?![0-9٠-٩])[^\r\n]*/gim;
    for(const match of page.matchAll(pattern)) {
      found.push({field:'premises.unit',value:match[1].replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))),documentId,page:index+1,start:match.index!,end:match.index!+match[0].length,quote:match[0].trim(),confidence:'candidate',contentHash});
    }
  }
  return found;
}
export function checkConsistency(snapshot:CaseSnapshot,observed:Evidence[]):{checks:Check[];questions:Question[]} {
  const fact=getFact(snapshot,'premises.unit'); const values=[...new Set(observed.map(x=>x.value))];
  if(!observed.length&&!fact){
    const message='No supported comparison field was found. This checker currently compares labelled premises units only; it has not checked this document for completeness or mismatches. Review the document against its applicable requirements.';
    return {checks:[{field:'document',state:'needs_review',message}],questions:[{field:'documents',message,reasonCode:'DOCUMENT_CHECK_UNSUPPORTED'}]};
  }
  let state:Check['state'];let message:string;let reasonCode:string;
  if(!observed.length){state='needs_review';message='No unambiguous labelled premises unit was extracted; provide or review the supplied document.';reasonCode='DOCUMENT_FIELD_UNREADABLE';}
  else if(values.length!==1){state='needs_review';message='Supplied documents contain competing unit values; review them before changing intake.';reasonCode='DOCUMENT_AMBIGUOUS';}
  else if(!fact||fact.value===null||!fact.confirmedBy||!fact.confirmedAt){state='needs_review';message='Confirm the premises unit after reviewing the supplied evidence.';reasonCode='MISSING_CONFIRMED_FACT';}
  else if(String(fact.value)!==values[0]){state='mismatch';message=`Intake Unit ${display(fact.value)} differs from supplied evidence Unit ${values[0]}. Confirm the intended correction; document bytes will not be edited.`;reasonCode='DOCUMENT_MISMATCH';}
  else {state='checked';message='Supplied premises unit agrees with confirmed intake. Consistency only; authenticity and legal acceptability unverified.';reasonCode='';}
  return {checks:[{field:'premises.unit',state,message,observed,expected:fact?.value??null}],questions:reasonCode?[{field:'premises.unit',message,reasonCode}]:[]};
}
export async function inspectDocuments(context:Pick<ToolContext,'documents'|'privateRoot'|'caseSnapshot'|'signal'>) {
  requireThat(context.documents.length<=MAX_DOCUMENTS,'DOCUMENT_COUNT_LIMIT','At most ten documents may be inspected.');
  const documents:Array<Record<string,unknown>>=[];const evidence:Evidence[]=[];const checks:Check[]=[];
  const formQuestions:Question[]=[];
  for(const doc of context.documents) {
    requireThat(doc.businessId===context.caseSnapshot.businessId,'DOCUMENT_CASE_MISMATCH','Document belongs to another case.');
    const bytes=await readPrivatePdf(doc,context.privateRoot);
    let text:string;
    try {text=await extractPdfText(bytes,context.signal);} catch(error){
      if(error instanceof ToolError&&error.code==='PDF_UNREADABLE'){checks.push({field:'document',documentId:doc.id,state:'unreadable',message:'PDF unreadable; no authenticity or eligibility conclusion.'});documents.push({id:doc.id,contentHash:doc.contentHash,extractionStatus:'unreadable'});continue;}throw error;
    }
    const fields=extractUnitEvidence(text,doc.id,doc.contentHash);evidence.push(...fields);
    let formInspection:Awaited<ReturnType<typeof inspectFormFields>>|null=null;
    try {formInspection=await inspectFormFields(bytes);}catch {checks.push({field:'document.form',documentId:doc.id,state:'needs_review',message:'Form fields could not be inspected; extracted text alone does not establish completeness.'});}
    if(formInspection?.fields.length){
      const summary=`${doc.name}: ${formInspection.populated.length} populated form fields, ${formInspection.blank.length} blank, ${formInspection.unsupported.length} unsupported. Review blank fields for applicability; they are not automatically required.`;
      checks.push({field:'document.form',documentId:doc.id,state:'needs_review',message:summary});
      formQuestions.push({field:'documents',message:summary,reasonCode:'FORM_REVIEW_REQUIRED'});
    }
    const status=text.trim()?'extracted':'unreadable';
    if(status==='unreadable')checks.push({field:'document',documentId:doc.id,state:'unreadable',message:'No text layer found. OCR is unavailable; supply a readable text PDF.'});
    documents.push({id:doc.id,name:doc.name,contentHash:doc.contentHash,bytes:doc.bytes,extractionStatus:status,textHash:digest(text),fields,formInspection});
  }
  if(!context.documents.length)checks.push({field:'document',state:'missing',message:'No supplied evidence. A lease is an illustrative candidate, not an activated legal requirement.'});
  const comparison=formQuestions.length&&!evidence.length&&!getFact(context.caseSnapshot,'premises.unit')?{checks:[],questions:[]}:checkConsistency(context.caseSnapshot,evidence);checks.push(...comparison.checks);
  const questions=[...comparison.questions,...formQuestions];
  if(checks.some(c=>c.state==='unreadable'))questions.push({field:'documents',message:'Replace or review unreadable supplied evidence.',reasonCode:'DOCUMENT_UNREADABLE'});
  return {documents,checks,questions,blockers:checks.filter(c=>c.state!=='checked').map(c=>({code:c.state==='mismatch'?'DOCUMENT_MISMATCH':'DOCUMENT_REVIEW_REQUIRED',message:c.message})),authenticity:'not_verified',legalValidity:'not_verified'};
}

/** Pure proposal only. Caller authenticates confirmation and persists a successor atomically. */
export function confirmUnitCorrection(snapshot:CaseSnapshot,confirmation:Fact,evidence:Evidence[]) {
  requireThat(confirmation.field==='premises.unit'&&typeof confirmation.value==='string'&&!!confirmation.confirmedBy&&Number.isFinite(Date.parse(confirmation.confirmedAt||'')),'INVALID_CONFIRMATION','Explicit founder confirmation and timestamp required.');
  const values=[...new Set(evidence.map(x=>x.value))];
  requireThat(values.length===1&&values[0]===confirmation.value,'CORRECTION_NOT_SUPPORTED','Correction must match unambiguous supplied evidence.');
  const before=getFact(snapshot,'premises.unit')?.value??null;
  requireThat(before!==confirmation.value,'NO_CORRECTION','The confirmed unit is already current.');
  const facts=[...snapshot.facts.filter(f=>f.field!=='premises.unit'),structuredClone(confirmation)];
  const audit={field:'premises.unit',before,after:confirmation.value,confirmedBy:confirmation.confirmedBy,confirmedAt:confirmation.confirmedAt,evidenceRefs:evidence.map(e=>({documentId:e.documentId,page:e.page,contentHash:e.contentHash})),reason:'Founder-confirmed intake correction; original document unchanged.'};
  return {caseSnapshot:{...structuredClone(snapshot),businessRevision:snapshot.businessRevision+1,facts,factsHash:hash(facts),corrections:[...snapshot.corrections,audit]},audit,requiresSuccessor:true};
}

export function assemblePack(input:{caseSnapshot:CaseSnapshot;guidance:Awaited<ReturnType<typeof retrieveGuidance>>;inspection:Awaited<ReturnType<typeof inspectDocuments>>;jobId:string;executionMode:string;enquiry?:Awaited<ReturnType<typeof prepareEnquiry>>;enquiryReview?:{payloadHash:string;reviewedBy:string;reviewedAt:string}}) {
  const {caseSnapshot:c,guidance,inspection}=input;
  const blockers=[...structuredClone(guidance.blockers),...inspection.blockers];
  let enquiry:unknown=null;
  if(input.enquiry){
    const {html:_html,hash:draftHash,payloadHash,...payload}=input.enquiry;
    requireThat(hash(payload)===payloadHash&&draftHash===payloadHash,'DRAFT_HASH_MISMATCH','Enquiry payload differs from its pinned hash.');
    requireThat(payload.businessId===c.businessId&&payload.businessRevision===c.businessRevision&&payload.factsHash===c.factsHash,'STALE_DRAFT','Enquiry belongs to another case or revision.');
    const review=input.enquiryReview;
    if(review)requireThat(review.payloadHash===payloadHash&&!!review.reviewedBy&&Number.isFinite(Date.parse(review.reviewedAt)),'INVALID_DRAFT_REVIEW','Review must bind this exact enquiry payload.');
    enquiry={...payload,payloadHash,review:review?{state:'reviewed',...review}:{state:'not_reviewed',required:true},sent:false,approved:false,submission:'not_available'};
  }
  const synthetic=c.businessId==='example-madar';
  const safeSources:Source[]=guidance.sources.map(s=>({...s,activationState:'inactive' as const}));
  const pack={schemaVersion:1,title:'Dikan — دكان preparation worksheet',label:'Incomplete preparation draft: applicability questions open',synthetic,executionMode:input.executionMode,jobId:input.jobId,businessId:c.businessId,businessRevision:c.businessRevision,factsHash:c.factsHash,facts:c.facts,corrections:c.corrections,checks:inspection.checks,documents:inspection.documents,requirements:guidance.requirements,sources:safeSources,enquiry,corpusSha256:guidance.corpusSha256,citations:guidance.citations,conflictNotices:guidance.conflictNotices,blockers,officialFees:null,readiness:'blocked',handoffState:'blocked',authenticity:'not_verified',submission:'not_available',review:{state:'not_reviewed',note:'Human review binds exact exported pack hash; it cannot clear source blockers.'}};
  const bodyHash=hash(pack);
  const rows=(items:string[][])=>items.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('');
  const section=(title:string,body:string)=>`<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
  const list=(items:unknown[])=>`<ul>${items.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ul>`;
  const factsTable=`<table><thead><tr><th>Field</th><th>Value</th><th>Origin / confirmation</th></tr></thead><tbody>${rows(c.facts.map(f=>[escapeHtml(f.field),escapeHtml(f.value),escapeHtml(`${f.origin}; ${f.confirmedBy??'unconfirmed'}`)]))}</tbody></table>`;
  const sourcesHtml=safeSources.map(s=>`<article><h3>${escapeHtml(s.id)}: ${escapeHtml(s.title)}</h3><p>${escapeHtml(s.publisher)} | ${escapeHtml(s.locator)} | <a href="${escapeHtml(s.url)}" rel="noreferrer">Official source</a></p><p>Cached capture ${escapeHtml(s.retrievedAt)}; publication ${escapeHtml(s.publishedAt??'unknown')}; effective ${escapeHtml(s.effectiveAt??'unknown')}; inactive, not legally approved.</p><p>${escapeHtml(s.summary)}</p><p>${escapeHtml(s.limitations.join('; '))}</p><p>${escapeHtml(JSON.stringify(s.conflicts||[]))}</p><pre dir="auto">${escapeHtml(s.passage)}</pre><p class="hash">Version ${escapeHtml(s.versionId)}<br>Raw SHA-256 ${escapeHtml(s.rawHash)}<br>Passage SHA-256 ${escapeHtml(s.passageHash)}</p></article>`).join('');
  const evidenceHtml=inspection.checks.map(check=>`<article><h3>${escapeHtml(check.field)}: ${escapeHtml(check.state)}</h3><p>${escapeHtml(check.message)}</p>${list((check.observed||[]).map(e=>`${e.documentId}, page ${e.page}, span ${e.start}-${e.end}: ${e.quote}; SHA-256 ${e.contentHash}`))}</article>`).join('');
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Dikan — دكان incomplete preparation worksheet</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#162332;max-width:980px;margin:40px auto;padding:0 24px}h1{line-height:1.2}h2{margin-top:32px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5df;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#f0f4f8;padding:12px;overflow-wrap:anywhere}.notice{border:2px solid #976510;padding:16px;background:#fff7df}.hash{font-size:12px;overflow-wrap:anywhere}article{border-bottom:1px solid #ddd;padding-bottom:16px}@media print{body{margin:0;font-size:11pt}article{break-inside:avoid}}</style></head><body><h1>Dikan — دكان preparation worksheet</h1><p class="notice"><strong>${synthetic?'FICTIONAL DEMO · ':''}INCOMPLETE DRAFT</strong><br>Applicability questions open. ${synthetic?'Assumed incorporation is not verified.':'Incorporation and legal form must follow the confirmed case facts.'} No licence, readiness, submission, official receipt or approval is established.</p><p>Execution mode: ${escapeHtml(input.executionMode)}. Document checks are deterministic local extraction and consistency checks, not authentication.</p><p class="hash">Job ${escapeHtml(input.jobId)} | revision ${c.businessRevision} | input facts ${escapeHtml(c.factsHash)}<br>Canonical pack body SHA-256 ${bodyHash}</p>${section('Case worksheet',factsTable)}${section('Candidate source matrix',list(guidance.requirements.map((r:any)=>`${r.id}: ${r.text} [${r.sourceVersionId}, ${r.locator}; inactive; applicability unknown]`)))}${section('Observed supplied evidence',evidenceHtml)}${section('Document manifest',list(inspection.documents.map(d=>`${d.id}: ${d.name??'unnamed'}; ${d.extractionStatus}; ${d.contentHash}`)))}${section('Correction audit',c.corrections.length?`<pre>${escapeHtml(JSON.stringify(c.corrections,null,2))}</pre>`:'<p>No confirmed correction has been recorded.</p>')}${section('Open questions and costs',list(blockers.map(b=>b.message))+'<p>Official fees: unknown. Any founder cost estimates remain assumptions, not government charges.</p>')}${section('Captured official references',sourcesHtml)}${enquiry?section('Authored enquiry draft',`<pre>${escapeHtml(JSON.stringify(enquiry,null,2))}</pre>`):''}${section('Review and handoff','<p>Review is a separate human action tied to the exact pack hash. Even after draft review, applicability blockers and blocked handoff remain. This is a Dikan — دكان worksheet, not an approved official application form.</p><p><a href="https://e-kbc.moci.gov.kw/" rel="noreferrer">Official KBC information/handoff destination</a> · No transaction has been opened or submitted.</p>')}</body></html>`;
  const markdown=['# Dikan — دكان preparation worksheet',`**${synthetic?'FICTIONAL DEMO — ':''}INCOMPLETE DRAFT: applicability questions open.**`,`Execution: ${escapeMd(input.executionMode)}. ${synthetic?'Assumed incorporation; ':''}authenticity and legal validity unverified. No submission or approval.`,`Canonical body SHA-256: ${bodyHash}`,'## Case',...c.facts.map(f=>`- ${escapeMd(f.field)}: ${escapeMd(f.value)} (${escapeMd(f.origin)})`),'## Candidate requirements',...guidance.requirements.map((r:any)=>`- ${escapeMd(r.id)}: ${escapeMd(r.text)}; inactive; applicability unknown`),'## Evidence',...inspection.checks.map(v=>`- ${escapeMd(v.state)}: ${escapeMd(v.message)} ${(v.observed||[]).map(e=>escapeMd(`${e.documentId} page ${e.page}: ${e.quote}`)).join('; ')}`),'## Correction audit',escapeMd(JSON.stringify(c.corrections)),'## Blockers',...blockers.map(b=>`- ${escapeMd(b.message)}`),'Official fees: unknown. Handoff blocked.',...(enquiry?['## Authored enquiry draft',escapeMd(JSON.stringify(enquiry,null,2))]:[]),'## Sources',...safeSources.map(s=>`- [${escapeMd(s.id+' '+s.title)}](${s.url}): ${escapeMd(s.locator)}; captured ${escapeMd(s.retrievedAt)}; raw SHA-256 ${s.rawHash}; passage SHA-256 ${s.passageHash}; inactive.`)].join('\n\n');
  return {...pack,hash:bodyHash,html,markdown,json:JSON.stringify({...pack,hash:bodyHash},null,2),files:[{name:'preparation.html',mime:'text/html',contentHash:digest(html)},{name:'preparation.md',mime:'text/markdown',contentHash:digest(markdown)}]};
}

export async function executeTool(call:ToolCall,context:ToolContext):Promise<ToolResult> {
  try {
    requireThat(!context.signal.aborted,'ABORTED','Tool execution cancelled.');
    requireThat(call.jobId===context.job.jobId&&call.businessRevision===context.caseSnapshot.businessRevision,'STALE_TOOL_CONTEXT','Tool call does not match current job and case revision.');
    requireThat(context.job.businessId===context.caseSnapshot.businessId,'CASE_MISMATCH','Job belongs to another case.');
    let data:any;
    const previous=(name:string)=>{const item=context.previousResults[name];return item?.data??item;};
    switch(call.name){
      case 'retrieve_guidance': data=await retrieveGuidance(call.arguments,context.caseSnapshot,context.signal);break;
      case 'prepare_enquiry': data=await prepareEnquiry(call.arguments as any,context.caseSnapshot,context.signal);break;
      case 'prepare_application': data=await prepareApplication(call.arguments,context.caseSnapshot,context.signal,previous('prepare_application'));break;
      case 'inspect_documents': data=await inspectDocuments(context);break;
      case 'request_information': {
        const inspection=previous('inspect_documents');
        requireThat(inspection,'MISSING_PREREQUISITE','Inspect supplied evidence before requesting a document correction.');
        data={questions:inspection.questions,applicabilityQuestions:SOURCE_BLOCKERS,mutatesCase:false};break;
      }
      case 'assemble_pack': {
        const guidance=previous('retrieve_guidance'),inspection=previous('inspect_documents');
        requireThat(guidance&&inspection,'MISSING_PREREQUISITE','Retrieve sources and inspect documents before assembling a pack.');
        // Rebuild authored draft from server-held prior inputs and recheck all pinned source bytes.
        const priorEnquiry=previous('prepare_enquiry');
        if(priorEnquiry){const {html:_html,hash:draftHash,payloadHash,...payload}=priorEnquiry;requireThat(hash(payload)===payloadHash&&draftHash===payloadHash,'DRAFT_HASH_MISMATCH','Stored enquiry payload changed; prepare and review a new draft.');}
        const verifiedEnquiry=priorEnquiry?await prepareEnquiry({kind:priorEnquiry.kind,language:priorEnquiry.language,fields:priorEnquiry.fields},context.caseSnapshot,context.signal):undefined;
        if(priorEnquiry)requireThat(verifiedEnquiry?.payloadHash===priorEnquiry.payloadHash,'DRAFT_HASH_MISMATCH','Enquiry inputs or evidence changed; review a new draft.');
        // Always reload pinned local sources with integrity checks; never promote prior or model-supplied activation.
        data=assemblePack({caseSnapshot:context.caseSnapshot,guidance:await retrieveGuidance({query:guidance.query,limit:guidance.sources?.length||3,mode:guidance.mode},context.caseSnapshot,context.signal),inspection,enquiry:verifiedEnquiry,enquiryReview:context.job.enquiryReview,jobId:call.jobId,executionMode:context.job.executionMode||'deterministic'});break;
      }
      case 'apply_preparation_patch': {
        const pack=previous('assemble_pack');requireThat(pack,'MISSING_PREREQUISITE','Assemble a preparation draft before proposing a workspace patch.');
        data={proposalOnly:true,businessId:context.caseSnapshot.businessId,businessRevision:context.caseSnapshot.businessRevision,jobId:call.jobId,packHash:pack.hash,preparation:{draftAvailable:true,readiness:'blocked',label:'Incomplete preparation draft: applicability questions open'},replacesNextAction:false,requiresValidatedUiCommit:true};break;
      }
      default:throw new ToolError('UNKNOWN_TOOL','This tool is not allowed.');
    }
    return {ok:true,data,provenance:[{jobId:call.jobId,callId:call.callId,businessRevision:call.businessRevision,factsHash:context.caseSnapshot.factsHash,tool:call.name,implementation:'deterministic_local_tool',sourceVersionIds:data.sources?.map((s:Source)=>s.versionId)||[],documentHashes:context.documents.map(d=>({id:d.id,contentHash:d.contentHash}))}]};
  } catch(error){return {ok:false,error:{code:error instanceof ToolError||error instanceof KnowledgeError?error.code:'TOOL_FAILED',message:error instanceof ToolError||error instanceof KnowledgeError?error.message:'Local tool failed; private content and filesystem paths are withheld.',retryable:false},provenance:[]};}
}
