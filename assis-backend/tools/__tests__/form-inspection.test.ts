import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {inspectFormFields} from '../form-inspection.ts';
test('stored form values distinguish blank, populated and unchecked without declaring requirements',async()=>{
 const pdf=await PDFDocument.create();const page=pdf.addPage();const form=pdf.getForm();
 form.createTextField('Company').setText('Synthetic company');
 form.createTextField('Optional address');
 form.createTextField('PDF required').enableRequired();
 form.createCheckBox('Unchecked').addToPage(page);const checked=form.createCheckBox('Checked');checked.addToPage(page);checked.check();
 const bytes=await pdf.save();const original=Buffer.from(bytes);
 const result=await inspectFormFields(bytes);
 assert.deepEqual(result.populated,['Company','Checked']);
 assert.deepEqual(result.blank,['Optional address','PDF required','Unchecked']);
 assert.equal(result.fields.find(f=>f.name==='PDF required')?.requiredByPdf,true);
 assert.match(result.scope,/do not establish legal requirements/);
 assert.deepEqual(Buffer.from(bytes),original);
});
test('flat PDFs have no invented fields and malformed bytes reject',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();
 assert.deepEqual((await inspectFormFields(await pdf.save())).fields,[]);
 await assert.rejects(inspectFormFields(Buffer.from('not a PDF')));
});
