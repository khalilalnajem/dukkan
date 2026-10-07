import test from 'node:test'
import assert from 'node:assert/strict'
import {preparePdfFillPlayback,pdfFillPlaybackValuesAt,prepareLivePdfFillPreview,pdfTypingFrames,pdfTypingStartIndex,pdfNextTypingIndex,type PdfFillArtifact,type PdfTemplateManifest} from '../src/components/pdf-fill-playback-model.ts'

const templateHash='a'.repeat(64),artifactHash='b'.repeat(64)
const manifest:PdfTemplateManifest={id:'pearl-delta-official-form',templateSha256:templateHash,templatePath:'/demo/pearl-delta/Application-B-original.pdf'}
function artifact(fields:Record<string,string|null>):PdfFillArtifact{return {kind:'official_pdf',templateId:manifest.id,hash:artifactHash,templateSha256:templateHash,fields,fieldDefinitions:Object.keys(fields).map((fieldName,index)=>({fieldName,label:fieldName,page:index%2+1}))}}

test('reconstructs the five saved v1 updates in order without changing artifact metadata',()=>{
 const saved=artifact({Name:'Pearl Delta',Nationality:'Kuwait',Objectives:'Lighting',Email:'founder@example.test',Activity:'Distribution'})
 const original=structuredClone(saved)
 const progress=[
  {name:'Name',value:'Pearl Delta',page:1},{name:'Nationality',value:'Kuwait',page:2},
  {name:'Objectives',value:'Lighting',page:1},{name:'Email',value:'founder@example.test',page:2},
  {name:'Activity',value:'Distribution',page:1},
 ]
 const playback=preparePdfFillPlayback(saved,progress,artifactHash,manifest)
 assert.deepEqual(playback.updates.map(x=>x.name),progress.map(x=>x.name))
 assert.equal(playback.pageCount,2)
 assert.deepEqual(pdfFillPlaybackValuesAt(playback,0),{Name:'Pearl Delta',Nationality:'',Objectives:'',Email:'',Activity:''})
 assert.deepEqual(pdfFillPlaybackValuesAt(playback,4),saved.fields)
 assert.deepEqual(saved,original)
})

test('one v2 update preserves unchanged prior fields and blanks only the updated field',()=>{
 const saved=artifact({Name:'Pearl Delta',Nationality:'Kuwait',Objectives:'Updated plan'})
 const playback=preparePdfFillPlayback(saved,[{name:'Objectives',value:'Updated plan',page:1}],artifactHash,manifest)
 assert.deepEqual(playback.initialValues,{Name:'Pearl Delta',Nationality:'Kuwait',Objectives:''})
 assert.deepEqual(pdfFillPlaybackValuesAt(playback,-1),playback.initialValues)
 assert.deepEqual(pdfFillPlaybackValuesAt(playback,0),saved.fields)
})

test('rejects mismatched hashes, field definitions, pages and final values',()=>{
 const saved=artifact({Name:'Pearl Delta',Objectives:'Lighting'})
 const event=[{name:'Name',value:'Pearl Delta',page:1}]
 assert.throws(()=>preparePdfFillPlayback(saved,event,'c'.repeat(64),manifest),/hash check/)
 assert.throws(()=>preparePdfFillPlayback(saved,event,artifactHash,{...manifest,templateSha256:'d'.repeat(64)}),/template failed its hash check/)
 assert.throws(()=>preparePdfFillPlayback(saved,[{...event[0],page:2}],artifactHash,manifest),/page does not match/)
 assert.throws(()=>preparePdfFillPlayback(saved,[{...event[0],value:'Changed'}],artifactHash,manifest),/final PDF values/)
 assert.throws(()=>preparePdfFillPlayback(saved,[{name:'Unknown',value:'x',page:1}],artifactHash,manifest),/verified template/)
 assert.throws(()=>preparePdfFillPlayback(saved,event,artifactHash,{...manifest,fields:[{fieldName:'Name',label:'Different field',page:1}]}),/original template manifest/)
 assert.throws(()=>preparePdfFillPlayback(saved,event,artifactHash,{...manifest,templatePath:'https://example.test/form.pdf'}),/path is not supported/)
})

test('live preview accepts only observed values mapped to the verified source manifest',()=>{
 const liveManifest:PdfTemplateManifest={...manifest,fields:[{fieldName:'Name',label:'Applicant name',page:2},{fieldName:'Objectives',label:'Objectives',page:4}]}
 const empty=prepareLivePdfFillPreview(liveManifest,[],templateHash)
 assert.deepEqual(empty.fieldValues,{})
 const live=prepareLivePdfFillPreview(liveManifest,[{name:'Name',value:'Pearl Delta',page:2}],templateHash)
 assert.deepEqual(live.fieldValues,{Name:'Pearl Delta'})
 assert.equal(live.updates[0].label,'Applicant name')
 assert.throws(()=>prepareLivePdfFillPreview(liveManifest,[{name:'Name',value:'Pearl Delta',page:4}],templateHash),/page does not match/)
 assert.throws(()=>prepareLivePdfFillPreview(liveManifest,[{name:'Unknown',value:'Invented',page:2}],templateHash),/does not belong/)
 assert.throws(()=>prepareLivePdfFillPreview(liveManifest,[{name:'Name',page:2}],templateHash),/incomplete/)
 assert.throws(()=>prepareLivePdfFillPreview(liveManifest,[],artifactHash),/hash check/)
})

test('live field typing advances in order and keeps Unicode characters intact',()=>{
 const frames=pdfTypingFrames('A🙂ب')
 assert.deepEqual(frames,['A','A🙂','A🙂ب'])
 assert.equal(frames.at(-1),'A🙂ب')
 assert.deepEqual(pdfTypingFrames(''),[])
})

test('live queue advances even when the next event has not arrived and completed mounts skip animation',()=>{
 assert.equal(pdfNextTypingIndex(0),1)
 assert.equal(pdfNextTypingIndex(1),2)
 assert.equal(pdfTypingStartIndex('running',2),0)
 assert.equal(pdfTypingStartIndex('completed',2),2)
})
