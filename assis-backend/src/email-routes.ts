import {ensure,hash} from '../contracts/index.ts';
import type {EmailService} from './email.ts';
export async function handleEmailRoute({req,res,url,service,readBody}:{req:any;res:any;url:URL;service:EmailService;readBody:()=>Promise<any>}):Promise<boolean>{
 const conversation=url.pathname.match(/^\/api\/conversations\/([^/]+)\/emails$/);
 const email=url.pathname.match(/^\/api\/emails\/([^/]+)(?:\/(edit|review|send))?$/);
 if(url.pathname!=='/api/email/status'&&!conversation&&!email)return false;
 const respond=(value:any)=>{res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
 if(req.method==='GET'){if(conversation)respond({emails:service.list(conversation[1])});else if(email&&!email[2])respond({email:service.get(email[1])});else if(url.pathname==='/api/email/status')respond(service.status());else ensure(false,'NOT_FOUND','Endpoint not found',404);return true;}
 ensure(req.method==='POST','NOT_FOUND','Endpoint not found',404);
 ensure(req.headers['content-type']?.split(';')[0]==='application/json','CONTENT_TYPE','application/json required',415);
 const key=req.headers['idempotency-key'];ensure(typeof key==='string'&&key.length>=1&&key.length<=160,'IDEMPOTENCY_REQUIRED','Idempotency-Key required');
 const data=await readBody(),requestHash=hash(data),receiptKey=`EMAIL:${url.pathname}:${key}`;
 const prior=service.store.receipt(receiptKey);if(prior){ensure(prior.hash===requestHash,'IDEMPOTENCY_CONFLICT','Key already used with different content',409);respond(prior.response);return true;}
 let value:any;
 if(conversation)value=service.create(conversation[1],data);
 else if(email?.[2]==='edit')value=service.edit(email[1],data.expectedHash,data);
 else if(email?.[2]==='review')value=service.review(email[1],data.expectedHash);
 else if(email?.[2]==='send')value=await service.send(email[1],data.expectedHash,data.approval);
 else ensure(false,'NOT_FOUND','Endpoint not found',404);
 const result={email:value};service.store.saveReceipt(receiptKey,requestHash,value.caseId,result);respond(result);return true;
}
