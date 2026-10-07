import {PDFDocument,PDFTextField,PDFCheckBox,PDFDropdown,PDFOptionList,PDFRadioGroup} from 'pdf-lib';

/** Read stored AcroForm values only. Does not run scripts or infer legal requirements. */
export async function inspectFormFields(bytes:Uint8Array){
 const pdf=await PDFDocument.load(bytes,{updateMetadata:false});
 const all=pdf.getForm().getFields();
 if(all.length>1000)throw new Error('PDF form exceeds the 1000-field inspection limit');
 const fields=all.map(field=>{
  let value:string|string[]|boolean|null=null;
  if(field instanceof PDFTextField)value=field.getText()||'';
  else if(field instanceof PDFCheckBox)value=field.isChecked();
  else if(field instanceof PDFDropdown||field instanceof PDFOptionList)value=field.getSelected();
  else if(field instanceof PDFRadioGroup)value=field.getSelected()||'';
  const supported=value!==null;
  const populated=typeof value==='boolean'?value:Array.isArray(value)?value.some(v=>v.trim()):typeof value==='string'&&!!value.trim();
  return {name:field.getName(),type:field.constructor.name,value,supported,populated,requiredByPdf:field.isRequired()};
 });
 return {pageCount:pdf.getPageCount(),fields,populated:fields.filter(f=>f.populated).map(f=>f.name),blank:fields.filter(f=>f.supported&&!f.populated).map(f=>f.name),unsupported:fields.filter(f=>!f.supported).map(f=>f.name),scope:'Stored form values only. Blank fields and PDF required flags do not establish legal requirements, completeness, authenticity or eligibility.'};
}
