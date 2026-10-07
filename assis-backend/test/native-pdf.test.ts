import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument,PDFName} from 'pdf-lib';
import {Store} from '../src/store.ts';
import {fillOfficialPdf,pdfTemplate} from '../src/native-pdf.ts';

test('actual PDF field roundtrip, preserved pages, scoped revisions and stale rejection',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-native-pdf-'));const store=new Store(root);
 try{
 const turn={id:'t1',caseId:'case1',conversationId:'c1',businessRevision:1,factsHash:'f1'};const events:string[]=[];
 const fill=(t:any,args:any,text:string)=>fillOfficialPdf(store,t,{templateId:'pearl-delta-official-form',...args},text,()=>{},field=>events.push(field));
 const first=await fill(turn,{fields:{Name:'Pearl Delta Lighting - fictional',Nationality:'China'}},'Demo company Pearl Delta Lighting - fictional in China');
 const doc=await PDFDocument.load(Buffer.from(first.pdfBase64,'base64'));
 assert.equal(doc.getPageCount(),11);assert.equal(doc.getForm().getTextField('Name').getText(),'Pearl Delta Lighting - fictional');assert.equal(doc.getForm().getSignature('Signature').acroField.dict.get(PDFName.of('V'))||'','');assert.equal(first.approved,false);assert.deepEqual(events,['Name','Nationality']);
 await assert.rejects(fill(turn,{fields:{Name:'New name'}},'New name'),{code:'STALE_ARTIFACT'});
 const next=await fill({...turn,id:'t2'},{expectedHash:first.hash,fields:{Name:'Updated fictional name'}},'Updated fictional name');
 assert.equal(next.version,2);assert.equal(next.supersedesArtifactId,first.id);assert.equal(next.fields.Nationality,'China');assert.equal(store.get('chat_artifact',first.id).hash,first.hash);
 await assert.rejects(fill({...turn,conversationId:'other'},{expectedHash:next.hash,fields:{Name:'Updated fictional name'}},'Updated fictional name'),{code:'STALE_ARTIFACT'});
 await assert.rejects(fill({...turn,conversationId:'other'},{fields:{Signature:'Fake sign'}},'Fake sign'),{code:'INVALID_PDF_FIELDS'});
 await assert.rejects(fill({...turn,conversationId:'other'},{fields:{Name:'Invented'}},'No company supplied'),{code:'UNSUPPORTED_PDF_VALUE'});
 await assert.rejects(fill({...turn,businessRevision:2},{expectedHash:next.hash,fields:{Name:'New'}},'New'),{code:'STALE_INPUT'});
 const reset=await fill({...turn,businessRevision:2},{expectedHash:next.hash,recreate:true,fields:{Name:'New'}},'New');assert.equal(reset.fields.Nationality,undefined);assert.equal(reset.version,3);
 assert.equal(store.all('chat_artifact').length,3);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});

import {createApp} from '../src/server.ts';
test('native chat saves PDF events and immutable human revision with review hash',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-pdf-chat-'));
 const app=await createApp({privateRoot:root,chatModel:{name:'test',version:'stub',respond:async()=>({content:'',calls:[{name:'fill_official_pdf',arguments:{templateId:'pearl-delta-official-form',fields:{Name:'Pearl Delta - fictional'}}}],usage:{test:true}})}});
 try{
 const c=app.chat.create({title:'Isolated synthetic PDF'}).conversation;
 const queued=app.chat.enqueue(c.id,{content:'Fill actual PDF: Pearl Delta - fictional',requestedAction:{type:'official_pdf'}});
 const wait=async(id:string)=>{for(let n=0;n<200;n++){const s=app.chat.turnSnapshot(id);if(!['queued','running'].includes(s.turn.status))return s;await new Promise(r=>setTimeout(r,10));}throw Error('Turn timeout');};
 const result=await wait(queued.turn.id);assert.equal(result.turn.status,'completed',JSON.stringify(result.turn.error));
 const original=result.artifacts[0];assert.equal(original.kind,'official_pdf');assert.equal(original.pdfBase64,undefined);assert.ok(result.turn.events.some((e:any)=>e.type==='pdf_field_updated'));app.chat.currentArtifact(app.chat.artifact(original.id));
 app.chat.reviewArtifact(original.id,{hash:original.hash,actor:'Synthetic test',acknowledgeDraft:true});
 const edit=app.chat.reviseArtifact(original.id,{hash:original.hash,fields:{Name:'Pearl Delta revision - fictional'}});const changed=await wait(edit.turn.id);
 assert.equal(changed.turn.status,'completed',JSON.stringify(changed.turn.error));assert.equal(changed.artifacts[0].version,2);assert.equal(changed.artifacts[0].review,null);assert.equal(app.chat.artifact(original.id).hash,original.hash);assert.equal(changed.turn.model,null);
 }finally{app.store.close();rmSync(root,{recursive:true,force:true});}
});

test('live PDF progress serves each real scoped AcroForm snapshot with exact hash',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-pdf-progress-'));
 const app=await createApp({privateRoot:root,chatModel:{name:'test',version:'stub',respond:async({messages}:any)=>messages.at(-1).role==='user'?({content:'',calls:[{name:'fill_official_pdf',arguments:{templateId:'pearl-delta-official-form',fields:{Name:'Pearl Delta - fictional',Nationality:'China'}}}],usage:{}}):({content:'The fictional PDF draft is prepared for review.',calls:[],usage:{}})}});
 try{
  const conversation=app.chat.create({workspaceId:'idea-a',title:'PDF progress'}).conversation;app.chat.create({workspaceId:'idea-b',title:'Other idea'});
  const queued=app.chat.enqueue(conversation.id,{content:'Fill Pearl Delta - fictional; nationality China',executionMode:'live_agent'});
  let settled:any;for(let i=0;i<300;i++){settled=app.chat.turnSnapshot(queued.turn.id);if(!['queued','running'].includes(settled.turn.status))break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(settled.turn.status,'completed',JSON.stringify(settled.turn.error));
  const events=settled.turn.events.filter((event:any)=>event.type==='pdf_field_updated');assert.equal(events.length,2);
  const read=(event:any)=>{const result=event.result,path=new URL(result.previewUrl,'http://local.test');const snapshotId=path.pathname.split('/').at(-1)!;return app.chat.pdfProgress(queued.turn.id,snapshotId,path.searchParams.get('workspaceId')!,path.searchParams.get('hash')!);};
  const first=read(events[0]);assert.ok(first.subarray(0,5).equals(Buffer.from('%PDF-')));
  const firstPdf=await PDFDocument.load(first);assert.equal(firstPdf.getForm().getTextField('Name').getText(),'Pearl Delta - fictional');assert.equal(firstPdf.getForm().getTextField('Nationality').getText()||'','');
  const second=read(events[1]);const secondPdf=await PDFDocument.load(second);assert.equal(secondPdf.getForm().getTextField('Nationality').getText(),'China');assert.notDeepEqual(first,second);
  const firstUrl=new URL(events[0].result.previewUrl,'http://local.test');const snapshotId=firstUrl.pathname.split('/').at(-1)!;
  assert.throws(()=>app.chat.pdfProgress(queued.turn.id,snapshotId,'idea-b',firstUrl.searchParams.get('hash')!),{code:'WORKSPACE_MISMATCH'});
  assert.throws(()=>app.chat.pdfProgress(queued.turn.id,snapshotId,'idea-a','0'.repeat(64)),{code:'PDF_PROGRESS_HASH_MISMATCH'});
  assert.ok(app.store.all('chat_pdf_progress',conversation.caseId).length<=16);
 }finally{app.store.close();rmSync(root,{recursive:true,force:true});}
});

test('revision progress bytes retain unchanged fields from the reviewed predecessor',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-pdf-revision-progress-'));const store=new Store(root);
 try{
  const base={caseId:'revision-case',conversationId:'revision-chat',businessRevision:1,factsHash:'facts'};
  const first=await fillOfficialPdf(store,{...base,id:'revision-turn-1'},{templateId:'pearl-delta-official-form',fields:{Name:'Pearl Delta - fictional',Nationality:'China'}},'Pearl Delta - fictional China',()=>{},()=>{});
  let progress:Buffer|undefined;
  await fillOfficialPdf(store,{...base,id:'revision-turn-2'},{templateId:'pearl-delta-official-form',expectedHash:first.hash,fields:{Name:'Pearl Delta revised - fictional'}},'Pearl Delta revised - fictional',()=>{},(_field,_value,_page,snapshot)=>{progress=snapshot.bytes});
  assert.ok(progress);const pdf=await PDFDocument.load(progress);assert.equal(pdf.getForm().getTextField('Name').getText(),'Pearl Delta revised - fictional');assert.equal(pdf.getForm().getTextField('Nationality').getText(),'China');
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});

test('case progress storage prunes oldest prior snapshots without changing saved PDF artifacts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-pdf-case-progress-'));const app=await createApp({privateRoot:root});
 try{
  const conversation=app.chat.create({workspaceId:'idea-retained',title:'Case progress retention'}).conversation;
  const caseRecord=app.store.get('case',conversation.caseId),base={caseId:conversation.caseId,conversationId:conversation.id,businessRevision:caseRecord.businessRevision,factsHash:caseRecord.factsHash};
  const priorTurn={...base,id:'older-pdf-turn',status:'completed'};app.store.put('chat_turn',priorTurn.id,priorTurn.caseId,priorTurn);
  let oldSnapshot:any;
  const first=await fillOfficialPdf(app.store,priorTurn,{templateId:'pearl-delta-official-form',fields:{Name:'Pearl Delta - fictional'}},'Pearl Delta - fictional',()=>{},(_field,_value,_page,snapshot)=>{oldSnapshot=snapshot});
  const oldKey=`${priorTurn.id}:1`,oldRow=app.store.get('chat_pdf_progress',oldKey);oldRow.bytes=64*1024*1024;oldRow.createdAt='2000-01-01T00:00:00.000Z';app.store.put('chat_pdf_progress',oldKey,conversation.caseId,oldRow);
  const currentTurn={...base,id:'current-pdf-turn',status:'running'};app.store.put('chat_turn',currentTurn.id,currentTurn.caseId,currentTurn);
  const next=await fillOfficialPdf(app.store,currentTurn,{templateId:'pearl-delta-official-form',expectedHash:first.hash,fields:{Name:'Pearl Delta revised - fictional'}},'Pearl Delta revised - fictional',()=>{},()=>{});
  assert.equal(app.store.get('chat_pdf_progress',oldKey),null);
  assert.throws(()=>app.chat.pdfProgress(priorTurn.id,oldSnapshot.snapshotId,'idea-retained',oldSnapshot.hash),{code:'NOT_FOUND'});
  const remaining=app.store.all('chat_pdf_progress',conversation.caseId);assert.ok(remaining.some(item=>item.turnId===currentTurn.id));
  assert.ok(remaining.reduce((sum,item)=>sum+item.bytes,0)<=64*1024*1024);
  assert.equal(app.store.get('chat_artifact',first.id).hash,first.hash);assert.equal(app.store.get('chat_artifact',next.id).hash,next.hash);
  app.chat.currentArtifact(app.chat.artifact(first.id));app.chat.currentArtifact(app.chat.artifact(next.id));
 }finally{app.store.close();rmSync(root,{recursive:true,force:true});}
});

test('complete synthetic company fills every supported mapped field',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-pdf-complete-'));const store=new Store(root);
 try{
 const values={Name:'Pearl Delta Lighting Co., Ltd. - fictional',Nationality:'China',Objectives:'Commercial LED lighting supply and support','Head Ofﬁce':'Shenzhen, China - fictional',Email:'contact@pearldelta.example','Type of economic activity':'LED lighting supply - eligibility unconfirmed',Objectives_2:'Explore Kuwait commercial lighting projects','Commercial Code':'DEMO-NOT-REGISTERED','Executive Management':'Li Wei - fictional','Cash':'KWD 300000 - synthetic','Inkind Contribution':'KWD 50000 - synthetic','Total Capital':'KWD 350000 - synthetic','Capital Expenditure CAPEX':'KWD 100000 - synthetic','Working Capital':'KWD 50000 - synthetic','Total Investment Value':'KWD 150000 - synthetic','Kuwait Branch Manager':'Chen Lin - fictional nominee'};
 assert.deepEqual(Object.keys(values).sort(),pdfTemplate().fields.map((f:any)=>f.fieldName).sort());
 const a=await fillOfficialPdf(store,{id:'demo',caseId:'synthetic',conversationId:'synthetic',businessRevision:1,factsHash:'x'},{templateId:'pearl-delta-official-form',fields:values},JSON.stringify(values),()=>{},()=>{});
 const pdf=await PDFDocument.load(Buffer.from(a.pdfBase64,'base64'));for(const [field,value] of Object.entries(values))assert.equal(pdf.getForm().getTextField(field).getText(),value);
 assert.equal(a.sent,false);assert.equal(a.fieldDefinitions.length,16);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
