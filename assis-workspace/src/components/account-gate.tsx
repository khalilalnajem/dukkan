import {useEffect,useRef,useState,type ReactNode} from 'react'
import {Cloud,Download,LogOut,RefreshCw} from 'lucide-react'
import {AccountStorage,useAccountStorage} from '@/lib/account-storage'
import {cloudClient,remoteWorkspace} from '@/lib/cloud-client'
import './account-gate.css'

const localPreview=['localhost','127.0.0.1'].includes(location.hostname)
const callback=()=>new URL(import.meta.env.BASE_URL,location.origin).href
function downloadRecovery(value:string){const blob=new Blob([value],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='dukkan-account-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

export function AccountGate({children}:{children:ReactNode}){
 const [language,setLanguage]=useState<'en'|'ar'>(()=>localStorage.getItem('dukkan-language')==='ar'?'ar':'en')
 const ar=language==='ar',[user,setUser]=useState<string|null>(null),[loading,setLoading]=useState(!!cloudClient)
 const [ready,setReady]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState<'login'|'signup'|'reset'|'password'>('login'),[busy,setBusy]=useState(false)
 const storage=useRef<AccountStorage|null>(null),epoch=useRef(0)
 const text=(en:string,arabic:string)=>ar?arabic:en
 useEffect(()=>{
  const client=cloudClient;if(!client)return
  let alive=true;let accountId:string|null=null
  const clear=()=>{epoch.current++;storage.current?.deactivate();storage.current=null;useAccountStorage(null);setReady(false);setUser(null)}
  async function accept(id:string|null){
   if(!alive)return
   if(id===accountId&&storage.current)return
   clear();accountId=id;setError('');setLoading(true)
   const generation=epoch.current
   if(!id){setLoading(false);return}
   try{
    // getUser checks the session with the Auth service before revealing cached data.
    const {data,error}=await client!.auth.getUser()
    if(error||data.user?.id!==id)throw new Error('Sign in again to open your account.')
    if(!navigator.locks)throw new Error('This browser cannot safely synchronise account records.')
    const current=new AccountStorage(id,localStorage,remoteWorkspace(id),(name,action)=>navigator.locks.request(name,action),()=>{
     if(!alive||generation!==epoch.current)return
     setPending(current.isPending)
    })
    storage.current=current
    await current.load()
    if(!alive||generation!==epoch.current){current.deactivate();return}
    useAccountStorage(current);setUser(id);setPending(current.isPending);setReady(true)
   }catch(e){if(alive&&generation===epoch.current)setError((e as Error).message)}
   finally{if(alive&&generation===epoch.current)setLoading(false)}
  }
  const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY')setMode('password')
   // Supabase auth callbacks must not synchronously await another auth call.
   queueMicrotask(()=>{void accept(session?.user.id||null)})
  })
  return()=>{alive=false;subscription.unsubscribe();storage.current?.deactivate();storage.current=null;useAccountStorage(null)}
 },[])
 useEffect(()=>{
  if(!ready||!pending)return
  let active=true
  const timer=setTimeout(()=>{void storage.current?.flush().then(()=>{if(active){setPending(false);setError('')}}).catch(e=>{if(active)setError((e as Error).message)})},400)
  return()=>{active=false;clearTimeout(timer)}
 },[ready,pending])
 useEffect(()=>{const listener=(event:Event)=>setLanguage((event as CustomEvent<'en'|'ar'>).detail);addEventListener('dukkan-language-change',listener);return()=>removeEventListener('dukkan-language-change',listener)},[])
 async function submit(){
  const client=cloudClient;if(!client)return
  setBusy(true);setError('');setNotice('')
  try{
   const response=mode==='login'?await client.auth.signInWithPassword({email,password}):mode==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:callback()}}):mode==='reset'?await client.auth.resetPasswordForEmail(email,{redirectTo:callback()}):await client.auth.updateUser({password})
   if(response.error)throw response.error
   if(mode==='signup'||mode==='reset')setNotice(text('Check your email for the next step.','تحقق من بريدك الإلكتروني للخطوة التالية.'))
   if(mode==='password'){setMode('login');setNotice(text('Password updated.','تم تحديث كلمة المرور.'))}
   setPassword('')
  }catch{setError(text('This request could not be completed. Check your details or try again.','تعذّر إكمال الطلب. تحقق من بياناتك أو حاول مجدداً.'))}finally{setBusy(false)}
 }
 async function signOut(){
  setBusy(true)
  try{await storage.current?.flush();const result=await cloudClient!.auth.signOut();if(result.error)throw result.error}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 if(!cloudClient&&localPreview)return children
 if(!cloudClient)return <main className="dukkan-account-door"><h1>Dukkan</h1><p>{text('Account services are not connected yet.','خدمات الحساب غير متصلة بعد.')}</p></main>
 if(ready&&user&&mode!=='password')return <div className="dukkan-account-shell" key={user}>
  <div className="dukkan-account-status" role="status" dir={ar?'rtl':'ltr'}><Cloud size={16}/><span>{error||text(pending?'Saving to your account…':'Saved to your account',pending?'جارٍ الحفظ في حسابك…':'تم الحفظ في حسابك')}</span>
   {error&&<button aria-label={text('Retry save','إعادة الحفظ')} title={text('Retry save','إعادة الحفظ')} onClick={()=>{void storage.current?.flush().then(()=>{setError('');setPending(false)}).catch(e=>setError(e.message))}}><RefreshCw size={17}/></button>}
   {pending&&<button aria-label={text('Download recovery copy','تنزيل نسخة استرداد')} title={text('Download recovery copy','تنزيل نسخة استرداد')} onClick={()=>{const raw=storage.current?.recoveryCopy();if(raw)downloadRecovery(raw)}}><Download size={17}/></button>}
   <button disabled={busy} onClick={()=>void signOut()} title={text('Sign out','تسجيل الخروج')} aria-label={text('Sign out','تسجيل الخروج')}><LogOut size={17}/></button>
  </div>{children}</div>
 return <main className="dukkan-account-door" dir={ar?'rtl':'ltr'}><h1>Dukkan</h1>
  <button className="dukkan-account-language" onClick={()=>setLanguage(ar?'en':'ar')}>{ar?'English':'العربية'}</button>
  {loading?<p role="status">{text('Opening your account…','جارٍ فتح حسابك…')}</p>:<>
   <h2>{mode==='signup'?text('Create your account','أنشئ حسابك'):mode==='reset'?text('Reset your password','إعادة تعيين كلمة المرور'):mode==='password'?text('Choose a new password','اختر كلمة مرور جديدة'):text('Sign in','تسجيل الدخول')}</h2>
   <form onSubmit={event=>{event.preventDefault();void submit()}}>
    {mode!=='password'&&<label>{text('Email','البريد الإلكتروني')}<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}
    {mode!=='reset'&&<label>{text('Password','كلمة المرور')}<input type="password" required minLength={8} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
    <button type="submit" disabled={busy}>{busy?text('Please wait…','يرجى الانتظار…'):text('Continue','متابعة')}</button>
   </form>
   <nav>{(['login','signup','reset'] as const).filter(item=>item!==mode).map(item=><button key={item} onClick={()=>{setMode(item);setError('');setNotice('')}}>{item==='login'?text('Sign in','تسجيل الدخول'):item==='signup'?text('Create account','إنشاء حساب'):text('Forgot password','نسيت كلمة المرور')}</button>)}</nav>
  </>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {storage.current?.recoveryCopy()&&error&&<button onClick={()=>downloadRecovery(storage.current!.recoveryCopy()!)}>{text('Download recovery copy','تنزيل نسخة استرداد')}</button>}
 </main>
}
