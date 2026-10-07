import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {ensure} from '../contracts/index.ts';
import type {Store} from './store.ts';
const assets=new URL('../../assis-workspace/public/demo/pearl-delta/',import.meta.url);
export const pdfDescription='Fill actual KDIPA Application B PDF AcroForm fields for a fictional demonstration. Not eligibility advice or submission. Copy only user-supplied values; do not infer unknowns. For revisions supply expectedHash from the latest official_pdf artifact. Supported template: pearl-delta-official-form. Do not fill signatures or official numbers.';
export function pdfTemplate(){const manifest=JSON.parse(readFileSync(new URL('form-manifest.json',assets),'utf8'));return {...manifest,fields:[...manifest.fields,...[['Commercial Code',2],['Executive Management',2],['Cash',3],['Inkind Contribution',3],['Total Capital',3],['Capital Expenditure CAPEX',4],['Working Capital',4],['Total Investment Value',4],['Kuwait Branch Manager',4]].map(([fieldName,page])=>({fieldName,label:fieldName,page}))]};}
export const pdfSchema={type:'object',properties:{templateId:{type:'string',enum:['pearl-delta-official-form']},fields:{type:'object',properties:Object.fromEntries(pdfTemplate().fields.map((f:any)=>[f.fieldName,{type:'string',description:f.label}])),additionalProperties:false},expectedHash:{type:'string'},recreate:{type:'boolean',description:'Explicitly recreate from supplied fields after case facts change; discard earlier values.'}},required:['templateId','fields'],additionalProperties:false};
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export async function fillOfficialPdf(store:Store,t:any,args:any,sourceText:string,assertCurrent:()=>void,onField:(field:string)=>void){
 const template=pdfTemplate();
 ensure(args.templateId===template.id,'UNKNOWN_TEMPLATE','Choose the supported official PDF template');
 ensure(args.fields&&typeof args.fields==='object'&&!Array.isArray(args.fields)&&Object.keys(args.fields).length>0,'INVALID_PDF_FIELDS','Supply at least one field');
 const allowed=new Map<string,any>(template.fields.map((f:any)=>[f.fieldName,f]));
 const latest=()=>store.ordered('chat_artifact',t.caseId).filter(a=>a.conversationId===t.conversationId&&a.kind==='official_pdf'&&a.templateId===template.id).at(-1);
 const previous=latest();
 ensure(previous?args.expectedHash===previous.hash:args.expectedHash===undefined,'STALE_ARTIFACT','Use the latest PDF hash before changing fields',409);
 const stale=previous&&(previous.businessRevision!==t.businessRevision||previous.factsHash!==t.factsHash);
 ensure(!stale||args.recreate===true,'STALE_INPUT','Case inputs changed; explicitly recreate:true with reviewed fields and latest expectedHash',409);
 for(const [key,value] of Object.entries(args.fields)){
  ensure(allowed.has(key)&&typeof value==='string'&&value.length<=500&&/^[\x20-\x7E]*$/.test(value),'INVALID_PDF_FIELDS','Only supported text fields with up to 500 Latin characters can be filled. Other writing systems need font support.');
  ensure(value===''||sourceText.includes(value as string)||(/demo|fictional|example/i.test(sourceText)&&value===allowed.get(key).value),'UNSUPPORTED_PDF_VALUE','Copy supplied user text exactly; unknown values must remain blank');
 }
 const bytes=readFileSync(new URL('Application-B-original.pdf',assets));
 ensure(digest(bytes)===template.templateSha256,'TEMPLATE_CHANGED','Official template hash changed; review its mapping first',409);
 const pdf=await PDFDocument.load(bytes);const form=pdf.getForm();const font=await pdf.embedFont(StandardFonts.Helvetica);
 const fields={...(!args.recreate?previous?.fields||{}:{}),...args.fields};
 for(const [key,value] of Object.entries(fields)){form.getTextField(key).setText(String(value));form.getTextField(key).setFontSize(9);}
 form.updateFieldAppearances(font);
 for(const page of pdf.getPages())page.drawText('DEMONSTRATION - FICTIONAL COMPANY - NOT SUBMITTED',{x:28,y:10,size:8,font,color:rgb(.55,.1,.1)});
 const output=await pdf.save();assertCurrent();
 ensure((latest()?.hash||null)===(previous?.hash||null),'STALE_ARTIFACT','Another PDF revision was saved; reopen the latest version',409);
 const id=randomUUID(),hash=digest(output);
 const artifact={id,kind:'official_pdf',format:'pdf',templateId:template.id,title:'KDIPA branch application · demonstration',conversationId:t.conversationId,caseId:t.caseId,turnId:t.id,businessRevision:t.businessRevision,factsHash:t.factsHash,version:(previous?.version||0)+1,supersedesArtifactId:previous?.id||null,createdAt:new Date().toISOString(),hash,pdfBase64:Buffer.from(output).toString('base64'),previewUrl:`/api/chat/artifacts/${id}/draft`,reviewUrl:`/api/chat/artifacts/${id}/review`,exportUrl:`/api/chat/artifacts/${id}/export?hash=${hash}`,fields,fieldDefinitions:template.fields.map((f:any)=>({fieldName:f.fieldName,label:f.label,page:f.page})),sourceURL:template.sourceURL,templateSha256:template.templateSha256,capturedAt:template.capturedAt,citations:[{id:template.id,title:'KDIPA Application B',url:template.sourceURL}],missingFields:template.missing,provenance:'Filled by Dukkan native PDF tool using user-supplied demonstration values. Eligibility unconfirmed.',approved:false,sent:false,review:null};
 store.put('chat_artifact',id,t.caseId,artifact);
 for(const key of Object.keys(args.fields))onField(key);
 return artifact;
}
