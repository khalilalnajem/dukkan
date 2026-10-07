import { randomUUID } from 'node:crypto';
import { ensure, hash } from '../contracts/index.ts';
import type { Store } from './store.ts';

export type EmailContent = { to:string; subject:string; body:string };
export type EmailAdapter = { name:string; sender:string; send:(content:EmailContent,key:string)=>Promise<{id:string}> };
export class EmailDeliveryError extends Error { definite:boolean; constructor(message:string,definite=false){super(message);this.definite=definite;} }
function content(input:any):EmailContent {
 ensure(input&&typeof input==='object','INVALID_EMAIL','Email content required');
 const {to,subject,body}=input;
 ensure(typeof to==='string'&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(to)&&to.length<=254,'INVALID_EMAIL','Enter one valid recipient');
 ensure(typeof subject==='string'&&subject.trim().length>0&&subject.length<=200&&!/[\r\n]/.test(subject),'INVALID_EMAIL','Subject required, maximum 200 characters');
 ensure(typeof body==='string'&&body.trim().length>0&&body.length<=30000,'INVALID_EMAIL','Message required, maximum 30000 characters');
 return {to,subject,body};
}
export function emailAdapterFromEnv(env:NodeJS.ProcessEnv=process.env,request:typeof fetch=fetch):EmailAdapter|undefined {
 if(!env.DUKKAN_RESEND_API_KEY||!env.DUKKAN_EMAIL_FROM)return undefined;
 const key=env.DUKKAN_RESEND_API_KEY,sender=env.DUKKAN_EMAIL_FROM;
 return {name:'resend',sender,async send(message,idempotencyKey){
  let response:Response;
  try {response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from:sender,to:[message.to],subject:message.subject,text:message.body}),signal:AbortSignal.timeout(20000)});}catch{throw new EmailDeliveryError('Delivery outcome is unknown. Check the provider before trying again.');}
  if(!response.ok)throw new EmailDeliveryError(`Email provider rejected the request (HTTP ${response.status}).`,response.status>=400&&response.status<500&&response.status!==408&&response.status!==409);
  let data:any;try{data=await response.json();}catch{throw new EmailDeliveryError('Provider returned an unreadable receipt. Check delivery before trying again.');}
  if(typeof data.id!=='string'||!data.id)throw new EmailDeliveryError('Provider did not return a message receipt. Check delivery before trying again.');
  return {id:data.id};
 }};
}
export class EmailService {
 store:Store;adapter?:EmailAdapter;
 constructor(store:Store,adapter?:EmailAdapter){this.store=store;this.adapter=adapter;}
 recoverInterrupted(){
  for(const item of this.store.all('email'))if(item.status==='sending'){item.status='unknown';item.error='Sending was interrupted. Check the provider before trying again.';this.save(item);}
 }
 status(){return {configured:!!this.adapter,provider:this.adapter?.name||null,sender:this.adapter?.sender||null,reason:this.adapter?null:'Connect an email provider and verified sender to send from Dukkan.'};}
 get(id:string){const item=this.store.get('email',id);ensure(item&&this.store.get('conversation',item.conversationId)&&this.store.get('case',item.caseId),'NOT_FOUND','Email not found',404);return item;}
 list(conversationId:string){this.conversation(conversationId);return this.store.all('email').filter(x=>x.conversationId===conversationId);}
 conversation(id:string){const c=this.store.get('conversation',id);ensure(c&&this.store.get('case',c.caseId),'NOT_FOUND','Conversation not found',404);return c;}
 save(item:any){this.store.put('email',item.id,item.caseId,item);return item;}
 create(conversationId:string,input:any){const c=this.conversation(conversationId),message=content(input),time=new Date().toISOString();return this.save({id:randomUUID(),conversationId,caseId:c.caseId,...message,hash:hash(message),status:'draft',review:null,receipt:null,createdAt:time,updatedAt:time});}
 edit(id:string,expectedHash:string,input:any){const item=this.get(id);ensure(item.hash===expectedHash,'STALE_EMAIL','The email changed. Reload before editing.',409);ensure(!['sending','sent','unknown'].includes(item.status),'EMAIL_LOCKED','This delivery is locked. Create a new draft instead.',409);const message=content(input);return this.save({...item,...message,hash:hash(message),status:'draft',review:null,error:null,updatedAt:new Date().toISOString()});}
 review(id:string,expectedHash:string){const item=this.get(id);ensure(item.hash===expectedHash,'STALE_EMAIL','Review the current email content.',409);ensure(!['sending','sent','unknown'].includes(item.status),'EMAIL_LOCKED','This delivery is locked.',409);const reviewedAt=new Date().toISOString();return this.save({...item,status:'reviewed',review:{hash:item.hash,sender:this.adapter?.sender||null,reviewedAt},updatedAt:reviewedAt});}
 async send(id:string,expectedHash:string,approval:boolean){const item=this.get(id);ensure(this.adapter,'EMAIL_NOT_CONNECTED','Connect an email provider and verified sender to send.',409);ensure(item.hash===expectedHash,'STALE_EMAIL','The email changed. Review it again.',409);ensure(approval===true,'SEND_APPROVAL_REQUIRED','Explicit send approval required',409);
  if(item.status==='sent')return item;
  ensure(!['sending','unknown'].includes(item.status),'DELIVERY_PENDING','Check the existing delivery outcome before any retry.',409);
  ensure(item.review?.hash===item.hash&&item.review?.sender===this.adapter.sender,'REVIEW_REQUIRED','Review this exact recipient, content and sender before sending.',409);
  const startedAt=new Date().toISOString();const current=this.save({...item,status:'sending',updatedAt:startedAt,error:null});
  try{const receipt=await this.adapter.send(content(item),`dukkan-email-${item.id}-${hash({contentHash:item.hash,sender:this.adapter.sender})}`);return this.save({...current,status:'sent',receipt:{provider:this.adapter.name,messageId:receipt.id,acceptedAt:new Date().toISOString(),contentHash:item.hash,sender:this.adapter.sender},updatedAt:new Date().toISOString()});}
  catch(error){const definite=error instanceof EmailDeliveryError&&error.definite;return this.save({...current,status:definite?'failed':'unknown',error:error instanceof EmailDeliveryError?error.message:'Delivery outcome is unknown. Check the provider before trying again.',updatedAt:new Date().toISOString()});}
 }
}
