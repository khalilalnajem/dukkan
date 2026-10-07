import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.ts';
import {ChatController} from '../src/chat.ts';

test('subsequent tool rounds retain the selected native model ID when usage reports a dated snapshot',async t=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-model-id-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const selected='gpt-4.1-mini',snapshot='gpt-4.1-mini-2025-04-14';const requests:string[]=[],prompts:string[]=[];let count=0;
 const model={name:'openai',version:selected,canSelect:(id:string)=>id===selected,async respond({modelId,messages}:any){requests.push(modelId);prompts.push(messages[0].content);if(count++===0)return {content:'',calls:[{name:'retrieve_guidance',arguments:{query:'official business guidance'}}],usage:{provider:'openai',model:snapshot}};return {content:'A concise answer based on the retrieved result.',calls:[],usage:{provider:'openai',model:snapshot}};}};
 const chat=new ChatController(store,async()=>({ok:true,provenance:[],data:{query:'official business guidance',abstained:true,route:null,citations:[],requirements:[],blockers:[],caveats:[],sources:[]}}),model as any,()=>{});
 const conversation=chat.create({workspaceId:'synthetic-model-test'}).conversation;
 const pending=chat.enqueue(conversation.id,{content:'Summarise the official route.',modelId:selected});
 for(let i=0;i<200&&['queued','running'].includes(store.get('chat_turn',pending.turn.id).status);i++)await new Promise(resolve=>setTimeout(resolve,5));
 const turn=chat.turnSnapshot(pending.turn.id).turn;
 assert.equal(turn.status,'completed',JSON.stringify(turn.error));assert.deepEqual(requests,[selected,selected]);assert.equal(turn.requestedModel,selected);assert.equal(turn.model.version,snapshot);assert.match(prompts[0],/keep country and currency consistent with it/);assert.match(prompts[0],/observation year and population inline/);assert.match(prompts[0],/headings, contents pages and extraction labels are not evidence/);assert.match(prompts[0],/Keep validation drafts focused on the saved adopted test/);assert.match(prompts[0],/omit ideaReview unless a new idea critique is explicitly requested/);
});
