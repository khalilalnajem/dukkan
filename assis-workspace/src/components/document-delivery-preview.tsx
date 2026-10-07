import {useEffect,useId,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Check,FileCheck,Mail,Send,X} from 'lucide-react'
import type {ChatArtifact} from '../lib/chat-api'
import './document-delivery-preview.css'

export function DocumentDeliveryPreview({artifact,ar}:{artifact:ChatArtifact;ar:boolean}){
 const [open,setOpen]=useState(false),[recipient,setRecipient]=useState(''),[complete,setComplete]=useState(false)
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId()
 const valid=/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(recipient.trim())
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();if(!open&&dialog.current?.open)dialog.current.close()},[open])
 function close(){setOpen(false);setComplete(false)}
 return <><button className="document-delivery-trigger" onClick={()=>setOpen(true)}><Mail size={15}/>{ar?'معاينة الإرسال':'Preview delivery'}</button>{createPortal(<dialog ref={dialog} className="document-delivery-dialog" dir={ar?'rtl':'ltr'} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();close()}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();close()}}}>
  <header><h2 id={titleId}>{ar?'معاينة تسليم المستند':'Document delivery preview'}</h2><button aria-label={ar?'إغلاق المعاينة':'Close delivery preview'} onClick={close}><X size={18}/></button></header>
  <p className="delivery-preview-note">{ar?'معاينة داخل دكان فقط. لا يُرسل بريد أو طلب إلى أي جهة.':'Preview within Dukkan. No email or application is sent.'}</p>
  <div className="delivery-preview-document"><FileCheck size={20}/><div><strong>{artifact.title}</strong><span>{ar?'النسخة المراجعة':'Reviewed version'} {artifact.version}</span></div></div>
  <form onSubmit={event=>{event.preventDefault();if(valid)setComplete(true)}}>
   <label>{ar?'بريد المستلم للمعاينة':'Recipient for this preview'}<input type="email" dir="ltr" value={recipient} autoComplete="off" maxLength={254} required disabled={complete} placeholder="recipient@example.com" onChange={event=>setRecipient(event.target.value)}/></label>
   {complete?<div className="delivery-preview-result" role="status"><Check size={20}/><div><strong>{ar?'اكتملت معاينة الإرسال':'Delivery preview complete'}</strong><p>{ar?'المستند والمستلم جاهزان للخطوة النهائية. لم تُرسل أي رسالة؛ يتطلب الإرسال الفعلي ربط حساب مرسل وموافقتك.':'The document and recipient are ready for the final step. No message was sent. Actual delivery requires a connected sender and your approval.'}</p></div></div>:<button className="delivery-preview-submit" type="submit" disabled={!valid}><Send size={15}/>{ar?'شغّل معاينة الإرسال':'Run delivery preview'}</button>}
  </form>
  {complete&&<button className="delivery-preview-reset" onClick={()=>setComplete(false)}>{ar?'تعديل المستلم':'Change recipient'}</button>}
 </dialog>,document.body)}</>
}
