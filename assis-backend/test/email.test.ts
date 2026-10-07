import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.ts';
import {EmailService,EmailDeliveryError,emailAdapterFromEnv} from '../src/email.ts';
function setup(adapter?:any){const root=mkdtempSync(join(tmpdir(),'dukkan-email-'));const store=new Store(root);store.put('case','case','case',{});store.put('conversation','chat','case',{id:'chat',caseId:'case'});return {store,service:new EmailService(store,adapter),close:()=>{store.close();rmSync(root,{recursive:true,force:true});}};}
const message={to:'recipient@example.com',subject:'Review catalogue',body:'A proposed message.'};
test('draft persists without a provider; send stays disabled',async()=>{const f=setup();try{const d=f.service.create('chat',message);f.service.review(d.id,d.hash);assert.equal(f.service.get(d.id).body,message.body);await assert.rejects(f.service.send(d.id,d.hash,true),/Connect an email/);assert.equal(f.service.status().configured,false);}finally{f.close();}});
test('exact-content review invalidates on edit and sender change',async()=>{const f=setup({name:'fake',sender:'a@example.com',send:async()=>({id:'r'})});try{let d=f.service.create('chat',message);f.service.review(d.id,d.hash);d=f.service.edit(d.id,d.hash,{...message,body:'Changed'});await assert.rejects(f.service.send(d.id,d.hash,true),/Review this exact/);f.service.review(d.id,d.hash);f.service.adapter!.sender='b@example.com';await assert.rejects(f.service.send(d.id,d.hash,true),/Review this exact/);}finally{f.close();}});
test('send has one receipt and cannot duplicate under concurrent or repeated calls',async()=>{let calls=0,done:any;const f=setup({name:'fake',sender:'a@example.com',send:()=>{calls++;return new Promise(r=>done=r);}});try{const d=f.service.create('chat',message);f.service.review(d.id,d.hash);const first=f.service.send(d.id,d.hash,true);await assert.rejects(f.service.send(d.id,d.hash,true),/Check the existing/);done({id:'provider-1'});const sent=await first;assert.equal(sent.receipt.messageId,'provider-1');await f.service.send(d.id,d.hash,true);assert.equal(calls,1);assert.throws(()=>f.service.edit(d.id,d.hash,message),/locked/);}finally{f.close();}});
test('uncertain network result and restart do not become sent or retry',async()=>{const f=setup({name:'fake',sender:'a@example.com',send:async()=>{throw new Error('secret');}});try{const d=f.service.create('chat',message);f.service.review(d.id,d.hash);const result=await f.service.send(d.id,d.hash,true);assert.equal(result.status,'unknown');assert.ok(!result.error.includes('secret'));await assert.rejects(f.service.send(d.id,d.hash,true),/Check the existing/);f.store.put('email',d.id,'case',{...d,status:'sending'});new EmailService(f.store).recoverInterrupted();assert.equal(f.service.get(d.id).status,'unknown');}finally{f.close();}});
test('definite rejection permits same-content explicit retry',async()=>{let calls=0;const f=setup({name:'fake',sender:'a@example.com',send:async()=>{if(++calls===1)throw new EmailDeliveryError('HTTP 429',true);return{id:'ok'};}});try{const d=f.service.create('chat',message);f.service.review(d.id,d.hash);assert.equal((await f.service.send(d.id,d.hash,true)).status,'failed');assert.equal((await f.service.send(d.id,d.hash,true)).status,'sent');}finally{f.close();}});
test('real adapter uses plain text, exact payload, server secret and idempotency',async()=>{let request:any;const adapter=emailAdapterFromEnv({DUKKAN_RESEND_API_KEY:'test-secret',DUKKAN_EMAIL_FROM:'sender@example.com'},(async(url:any,options:any)=>{request={url,...options};return new Response(JSON.stringify({id:'test-receipt'}),{status:200});}) as typeof fetch)!;assert.equal((await adapter.send(message,'stable')).id,'test-receipt');assert.equal(request.headers['Idempotency-Key'],'stable');assert.equal(JSON.parse(request.body).text,message.body);assert.equal(request.url,'https://api.resend.com/emails');});

test('HTTP draft routes replay idempotency and reject changed content; send is blocked offline',async()=>{
 const {handleEmailRoute}=await import('../src/email-routes.ts');const f=setup();let output:any;
 const invoke=async(path:string,method:string,data:any={},key='one')=>{output=null;await handleEmailRoute({req:{method,headers:{'content-type':'application/json','idempotency-key':key}},res:{writeHead(){},end(v:string){output=JSON.parse(v);}},url:new URL(path,'http://localhost'),service:f.service,readBody:async()=>data});return output;};
 try{const draft=await invoke('/api/conversations/chat/emails','POST',message);const again=await invoke('/api/conversations/chat/emails','POST',message);assert.equal(draft.email.id,again.email.id);assert.equal(f.service.list('chat').length,1);await assert.rejects(invoke('/api/conversations/chat/emails','POST',{...message,body:'Other'}),/Key already/);const reviewed=await invoke(`/api/emails/${draft.email.id}/review`,'POST',{expectedHash:draft.email.hash});assert.equal(reviewed.email.status,'reviewed');await assert.rejects(invoke(`/api/emails/${draft.email.id}/send`,'POST',{expectedHash:draft.email.hash,approval:true}),/Connect an email/);assert.equal((await invoke('/api/email/status','GET')).configured,false);}finally{f.close();}
});

test('send requires explicit approval and the exact reviewed recipient',async()=>{
 let calls=0;const f=setup({name:'fake',sender:'sender@example.com',send:async()=>{calls++;return{id:'receipt'};}});
 try{let draft=f.service.create('chat',message);f.service.review(draft.id,draft.hash);
 await assert.rejects(f.service.send(draft.id,draft.hash,false),/Explicit send approval/);
 const oldHash=draft.hash;draft=f.service.edit(draft.id,oldHash,{...message,to:'different@example.com'});
 await assert.rejects(f.service.send(draft.id,oldHash,true),/changed/);
 await assert.rejects(f.service.send(draft.id,draft.hash,true),/Review this exact/);
 assert.equal(calls,0);
 }finally{f.close();}
});

test('durable sent receipt prevents delivery after closing and reopening the database',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-email-restart-'));let store=new Store(root);let calls=0;
 const adapter={name:'fake',sender:'sender@example.com',send:async()=>{calls++;return{id:'durable-receipt'};}};
 try{store.put('case','case','case',{});store.put('conversation','chat','case',{id:'chat',caseId:'case'});
 const first=new EmailService(store,adapter),draft=first.create('chat',message);first.review(draft.id,draft.hash);
 await first.send(draft.id,draft.hash,true);store.close();store=new Store(root);
 const restarted=new EmailService(store,adapter);restarted.recoverInterrupted();
 const result=await restarted.send(draft.id,draft.hash,true);
 assert.equal(result.status,'sent');assert.equal(result.receipt.messageId,'durable-receipt');assert.equal(calls,1);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
