export type PdfFieldDefinition={fieldName:string;label:string;page:number};
export type PdfFieldUpdate={name:string;value?:string;page?:number};
export type PdfFillArtifact={kind:string;templateId:string;hash:string;templateSha256:string;fields:Record<string,string|null>;fieldDefinitions:PdfFieldDefinition[]};
export type PdfTemplateManifest={id:string;templateSha256:string;templatePath:string;fields?:Array<{fieldName:string;label:string;page:number}>};
export type PdfFillPlayback={initialValues:Record<string,string>;updates:Array<{name:string;label:string;value:string;page:number}>;pageCount:number};
const digest=/^[0-9a-f]{64}$/i;
function requireValue(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}

/** Validate saved provenance and turn progress into an exact, replayable field timeline. */
export function preparePdfFillPlayback(artifact:PdfFillArtifact,progress:PdfFieldUpdate[],verifiedArtifactHash:string,manifest:PdfTemplateManifest):PdfFillPlayback{
 requireValue(artifact.kind==='official_pdf','This saved item is not an official PDF.');
 requireValue(artifact.templateId===manifest.id,'The saved PDF and original template do not match.');
 requireValue(digest.test(artifact.hash)&&artifact.hash===verifiedArtifactHash,'The saved PDF failed its hash check.');
 requireValue(digest.test(artifact.templateSha256)&&artifact.templateSha256===manifest.templateSha256,'The original template failed its hash check.');
 requireValue(manifest.templatePath==='/demo/pearl-delta/Application-B-original.pdf','The verified template path is not supported.');
 requireValue(Array.isArray(artifact.fieldDefinitions)&&artifact.fieldDefinitions.length>0,'The saved PDF has no verified field mapping.');
 const definitions=new Map<string,PdfFieldDefinition>();let pageCount=0;
 for(const definition of artifact.fieldDefinitions){
  requireValue(typeof definition.fieldName==='string'&&definition.fieldName.length>0&&typeof definition.label==='string'&&Number.isInteger(definition.page)&&definition.page>0,'The saved field mapping is invalid.');
  requireValue(!definitions.has(definition.fieldName),'The saved field mapping contains duplicates.');definitions.set(definition.fieldName,definition);pageCount=Math.max(pageCount,definition.page);
 }
 for(const sourceField of manifest.fields||[]){
  const definition=definitions.get(sourceField.fieldName);
  requireValue(definition&&definition.label===sourceField.label&&definition.page===sourceField.page,'The saved field mapping does not match the original template manifest.');
 }
 requireValue(artifact.fields&&typeof artifact.fields==='object'&&!Array.isArray(artifact.fields),'The saved PDF field values are invalid.');
 for(const [name,value] of Object.entries(artifact.fields))requireValue(definitions.has(name)&&(typeof value==='string'||value===null),'The saved PDF field values do not match its mapping.');
 requireValue(Array.isArray(progress)&&progress.length>0,'No saved field updates are available to replay.');
 const updates=progress.map(update=>{
  requireValue(update&&typeof update.name==='string'&&typeof update.value==='string'&&Number.isInteger(update.page),'A saved field update is incomplete.');
  const definition=definitions.get(update.name);requireValue(definition,'A saved field update does not belong to the verified template.');
  requireValue(update.page===definition.page,'A saved field update page does not match the verified template.');
  requireValue(Object.hasOwn(artifact.fields,update.name)&&artifact.fields[update.name]===update.value,'A saved field update does not match the final PDF values.');
  return {name:update.name,label:definition.label,value:update.value,page:definition.page};
 });
 const touched=new Set(updates.map(update=>update.name));const initialValues:Record<string,string>={};
 for(const [name,value] of Object.entries(artifact.fields))initialValues[name]=touched.has(name)?'':typeof value==='string'?value:'';
 return {initialValues,updates,pageCount};
}

/** Return the saved baseline plus only updates reached at this playback position. */
export function pdfFillPlaybackValuesAt(playback:PdfFillPlayback,index:number):Record<string,string>{
 const values={...playback.initialValues};
 for(let i=0;i<=Math.floor(index)&&i<playback.updates.length;i++){const update=playback.updates[i];values[update.name]=update.value;}
 return values;
}

/** Validate only field updates actually reported while a PDF is being filled. */
export function prepareLivePdfFillPreview(manifest:PdfTemplateManifest,progress:PdfFieldUpdate[],verifiedTemplateHash:string){
 requireValue(manifest.id==='pearl-delta-official-form'&&manifest.templatePath==='/demo/pearl-delta/Application-B-original.pdf','The live preview template is not supported.');
 requireValue(digest.test(manifest.templateSha256)&&manifest.templateSha256===verifiedTemplateHash,'The original template failed its hash check.');
 requireValue(Array.isArray(manifest.fields)&&Array.isArray(progress),'The live field mapping is invalid.');
 const definitions=new Map<string,{fieldName:string;label:string;page:number}>();let pageCount=0;
 for(const definition of manifest.fields){
  requireValue(typeof definition.fieldName==='string'&&definition.fieldName.length>0&&typeof definition.label==='string'&&Number.isInteger(definition.page)&&definition.page>0,'The live field mapping is invalid.');
  requireValue(!definitions.has(definition.fieldName),'The live field mapping contains duplicates.');definitions.set(definition.fieldName,definition);pageCount=Math.max(pageCount,definition.page);
 }
 const updates=progress.map(update=>{
  requireValue(update&&typeof update.name==='string'&&typeof update.value==='string'&&Number.isInteger(update.page),'A live field update is incomplete.');
  const definition=definitions.get(update.name);requireValue(definition,'A live field update does not belong to the verified template.');
  requireValue(update.page===definition.page,'A live field update page does not match the verified template.');
  return {name:update.name,label:definition.label,value:update.value,page:definition.page};
 });
 const fieldValues:Record<string,string>={};for(const update of updates)fieldValues[update.name]=update.value;
 return {updates,fieldValues,pageCount};
}
