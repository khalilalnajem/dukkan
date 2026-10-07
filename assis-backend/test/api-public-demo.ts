import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {createApp} from '../src/server.ts';
import {openrouterConfig} from '../src/openrouter.ts';
import {openaiConfig} from '../src/openai.ts';
import {Store} from '../src/store.ts';
import {blank} from '../../assis-workspace/src/lib/workspace.ts';
import {applyConversationProposal} from '../../assis-workspace/src/lib/conversation-flow.ts';
const provider=process.env.DIKAN_PROVIDER||process.env.ASSIS_MODEL||'openai';
if(!['openai','openrouter'].includes(provider))throw new Error('The public API demo supports the OpenAI and OpenRouter providers.');
const config=provider==='openai'?openaiConfig():openrouterConfig();config.daily=Math.min(config.daily,12);
const root=mkdtempSync(join(tmpdir(),'dukkan-public-api-'));
const app=await createApp({privateRoot:root,...(provider==='openai'?{openai:config}:{openrouter:config})});
let workspace=blank();workspace.brief.idea='FICTIONAL demo: Sand Studio';
const receipt:any={provider,model:config.model,at:new Date().toISOString(),steps:[],sent:false,submitted:false};
const c=app.chat.create({title:'Fictional public API demo',workspaceId:'public-api-fictional'}).conversation;
async function done(id:string){const deadline=Date.now()+180000;while(Date.now()<deadline){const s=app.chat.turnSnapshot(id);if(!['queued','running'].includes(s.turn.status)){receipt.steps.push({status:s.turn.status,error:s.turn.error,trace:s.turn.modelTrace});assert.equal(s.turn.status,'completed',JSON.stringify(s.turn.error));return s;}await new Promise(r=>setTimeout(r,300));}app.chat.stop(id,'public-api-fictional');throw Error('Demo deadline exceeded');}
let expected:any;
try{
 const before=JSON.stringify(workspace);
 const quote=await done(app.chat.enqueue(c.id,{content:'FICTIONAL SIMULATED demo only. Propose a prepared supplier quote via propose_workspace_update: category operation, entityType quote, title Fictional quote, basis simulated, quantity 3, unitPrice 0.333 KWD. Nothing ordered or paid.',workspaceContext:workspace}).turn.id);
 assert.equal(JSON.stringify(workspace),before);
 const p=quote.messages.flatMap((m:any)=>m.actions||[]).find((a:any)=>a.type==='workspace_update').payload;
 workspace=applyConversationProposal(workspace,p);assert.equal(workspace.lifecycle[0].values.amount,'0.999');
 // This explicit fixture acceptance exercises the same save validator; no automatic user save.
 app.store.put('public_demo_workspace','fictional',c.caseId,workspace);
 const filled=await done(app.chat.enqueue(c.id,{content:'Fill the real PDF with fictional supplied values only: Name Sand Studio - fictional, Email founder@example.test. Leave signatures and other unknowns blank. No submission.',requestedAction:{type:'official_pdf'},workspaceContext:workspace}).turn.id);
 const original=filled.artifacts.find((a:any)=>a.kind==='official_pdf');assert.ok(original);
 const revised=await done(app.chat.reviseArtifact(original.id,{hash:original.hash,fields:{Name:'Sand Studio revised - fictional'}}).turn.id);
 const a=revised.artifacts[0];assert.equal(a.version,2);assert.equal(a.supersedesArtifactId,original.id);assert.equal(app.chat.artifact(original.id).hash,original.hash);
 app.chat.reviewArtifact(a.id,{hash:a.hash,actor:'Fictional demo reviewer',acknowledgeDraft:true});
 const pdf=await PDFDocument.load(Buffer.from(app.chat.artifact(a.id).pdfBase64,'base64'));assert.equal(pdf.getPageCount(),11);assert.equal(pdf.getForm().getTextField('Name').getText(),'Sand Studio revised - fictional');
 expected={id:a.id,hash:a.hash};receipt.pdf=expected;receipt.passed=true;
}catch(e){receipt.passed=false;receipt.failure={code:(e as any).code,message:(e as Error).message};process.exitCode=1;}
finally{for(const abort of app.chat.active.values())abort.abort();app.chat.closed=true;receipt.budget=app.store.all('provider_budget');app.store.close();}
if(receipt.passed){const reopened=new Store(root);assert.equal(reopened.get('chat_artifact',expected.id).hash,expected.hash);assert.equal(reopened.get('public_demo_workspace','fictional').lifecycle[0].values.amount,'0.999');receipt.persistenceAfterReopen=true;reopened.close();}
const path=join(root,'receipt.json');writeFileSync(path,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:receipt.passed,receipt:path}));
