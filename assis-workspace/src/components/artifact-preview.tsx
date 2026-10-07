import {lazy,Suspense,useEffect,useState} from 'react'
import {verifiedPreview,type ChatArtifact} from '../lib/chat-api'

const PdfArtifactPreview=lazy(()=>import('./pdf-artifact-preview').then(m=>({default:m.PdfArtifactPreview})))
export function ArtifactPreview(props:{artifact:ChatArtifact;title:string;className?:string;language?:'en'|'ar'}){return props.artifact.kind==='official_pdf'||props.artifact.format==='pdf'?<Suspense fallback={<p>Loading PDF…</p>}><PdfArtifactPreview artifact={props.artifact} title={props.title} language={props.language}/></Suspense>:<HtmlArtifactPreview {...props}/>}

/** Fetch with account headers before displaying a sandboxed, verified document. */
function HtmlArtifactPreview({artifact,title,className,language='en'}:{artifact:ChatArtifact;title:string;className?:string;language?:'en'|'ar'}){
 const identity=JSON.stringify([artifact.id,artifact.hash,artifact.previewUrl])
 const [preview,setPreview]=useState<{identity:string;html:string;error:string}>({identity:'',html:'',error:''})
 useEffect(()=>{
  const controller=new AbortController()
  setPreview({identity,html:'',error:''})
  void verifiedPreview(artifact,controller.signal).then(async blob=>{
   const html=await blob.text()
   if(controller.signal.aborted)return
   setPreview({identity,html,error:''})
  }).catch(error=>{
   if(controller.signal.aborted)return
   setPreview({identity,html:'',error:error instanceof Error?error.message:'Preview unavailable.'})
  })
  return()=>controller.abort()
 },[identity])
 const current=preview.identity===identity?preview:null
 if(current?.error)return <p className={className} role="alert">{language==='ar'?'تعذّر عرض المستند.':'Document preview failed.'} {current.error}</p>
 if(!current?.html)return <p className={className} role="status">{language==='ar'?'جارٍ تحميل المستند والتحقق منه…':'Loading and verifying document…'}</p>
 return <iframe className={className} title={title} srcDoc={current.html} sandbox="" referrerPolicy="no-referrer"/>
}
