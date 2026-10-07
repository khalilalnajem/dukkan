import {useEffect,useMemo,useRef,useState} from 'react'
import {PDFDocument} from 'pdf-lib'
import {GlobalWorkerOptions,getDocument,type PDFDocumentProxy} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {Pause,Play,RotateCcw} from 'lucide-react'
import {verifiedPreview,verifiedPdfProgress,type PdfProgressPreview,type ChatArtifact} from '../lib/chat-api'
import {preparePdfFillPlayback,pdfFillPlaybackValuesAt,type PdfFillArtifact,type PdfFieldUpdate,type PdfTemplateManifest,type PdfFillPlayback} from './pdf-fill-playback-model'
import './pdf-fill-playback.css'

GlobalWorkerOptions.workerSrc=workerUrl
const manifestSchema={id:'pearl-delta-official-form',templatePath:'/demo/pearl-delta/Application-B-original.pdf'} as const
function sha256(bytes:Uint8Array){return crypto.subtle.digest('SHA-256',bytes.slice().buffer).then(hash=>Array.from(new Uint8Array(hash)).map(value=>value.toString(16).padStart(2,'0')).join(''))}
function assetUrl(path:string){
 if(path!==manifestSchema.templatePath)throw new Error('Unsupported template path.')
 const base=new URL(import.meta.env.BASE_URL,window.location.href),url=new URL(path.replace(/^\/+/,''),base)
 const prefix=base.pathname.endsWith('/')?base.pathname:base.pathname+'/'
 if(url.origin!==base.origin||!url.pathname.startsWith(prefix+'demo/pearl-delta/'))throw new Error('Template URL is outside the application assets.')
 return url
}
async function fetchVerifiedAsset(url:URL,signal:AbortSignal){
 const response=await fetch(url,{signal,credentials:'same-origin',cache:'no-cache'})
 if(!response.ok||new URL(response.url).origin!==url.origin)throw new Error('A required public PDF asset could not be verified.')
 return new Uint8Array(await response.arrayBuffer())
}
async function loadOriginalTemplate(signal:AbortSignal){
 const base=new URL(import.meta.env.BASE_URL,window.location.href)
 const manifestBytes=await fetchVerifiedAsset(new URL('demo/pearl-delta/form-manifest.json',base),signal)
 let parsed:unknown;try{parsed=JSON.parse(new TextDecoder().decode(manifestBytes))}catch{throw new Error('The original template manifest is invalid.')}
 const manifest=validateManifest(parsed),originalBytes=await fetchVerifiedAsset(assetUrl(manifest.templatePath),signal),templateHash=await sha256(originalBytes)
 if(templateHash!==manifest.templateSha256)throw new Error('The original PDF template failed its hash check.')
 return {manifest,originalBytes,templateHash}
}
function reducedMotion(){return typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches}
function validateManifest(value:unknown):PdfTemplateManifest{
 if(!value||typeof value!=='object')throw new Error('The original template manifest is invalid.')
 const candidate=value as Record<string,unknown>
 if(candidate.id!==manifestSchema.id||candidate.templatePath!==manifestSchema.templatePath||typeof candidate.templateSha256!=='string'||!/^[a-f0-9]{64}$/i.test(candidate.templateSha256))throw new Error('The original template manifest is invalid.')
 if(!Array.isArray(candidate.fields)||!candidate.fields.every(field=>field&&typeof field==='object'&&typeof (field as Record<string,unknown>).fieldName==='string'&&typeof (field as Record<string,unknown>).label==='string'&&Number.isInteger((field as Record<string,unknown>).page)&&(field as Record<string,unknown>).page as number>0))throw new Error('The original template field manifest is invalid.')
 return {id:candidate.id as string,templatePath:candidate.templatePath as string,templateSha256:candidate.templateSha256 as string,fields:candidate.fields as Array<{fieldName:string;label:string;page:number}>}
}
async function loadPlayback(artifact:ChatArtifact,progress:PdfFieldUpdate[],signal:AbortSignal){
 const blob=await verifiedPreview(artifact,signal),savedBytes=new Uint8Array(await blob.arrayBuffer()),savedHash=await sha256(savedBytes)
 if(savedHash!==artifact.hash)throw new Error('The saved PDF failed its hash check.')
 const {manifest,originalBytes,templateHash}=await loadOriginalTemplate(signal)
 if(templateHash!==artifact.templateSha256)throw new Error('The original PDF template failed its hash check.')
 const typedArtifact=artifact as ChatArtifact&PdfFillArtifact
 const timeline=preparePdfFillPlayback(typedArtifact,progress,savedHash,manifest)
 const savedPdf=await PDFDocument.load(savedBytes),originalPdf=await PDFDocument.load(originalBytes)
 const savedForm=savedPdf.getForm(),originalForm=originalPdf.getForm()
 if(manifest.fields?.some(field=>!typedArtifact.fieldDefinitions.some(definition=>definition.fieldName===field.fieldName)))throw new Error('The saved field mapping is incomplete.')
 for(const definition of typedArtifact.fieldDefinitions){
  const savedField=savedForm.getTextField(definition.fieldName),originalField=originalForm.getTextField(definition.fieldName)
  const finalValue=typedArtifact.fields[definition.fieldName]??''
  if(savedField.getText()!==finalValue||originalField.getName()!==definition.fieldName||definition.page>originalPdf.getPageCount())throw new Error('The saved PDF fields do not match the verified artifact.')
 }
 return {timeline,originalBytes}
}

export function LivePdfFillPreview({progress,preview,turnId,scope,language='en'}:{progress:PdfFieldUpdate[];preview?:PdfProgressPreview;turnId:string;scope:string;language:'en'|'ar'}){
 const ar=language==='ar',canvas=useRef<HTMLCanvasElement>(null),[pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[width,setWidth]=useState(600),[error,setError]=useState(''),[fitPage,setFitPage]=useState(false)
 const latest=progress.at(-1)
 useEffect(()=>{
  if(!preview)return
  const controller=new AbortController();let disposed=false,task:ReturnType<typeof getDocument>|undefined
  void verifiedPdfProgress(preview,turnId,scope,controller.signal).then(async bytes=>{
   if(disposed)return;task=getDocument({data:bytes});const document=await task.promise
   if(!disposed){setPdf(document);setPage(Math.min(preview.page,document.numPages));setError('')}
  }).catch(()=>{if(!disposed)setError(ar?'تعذر التحقق من معاينة المستند المحفوظة.':'The saved document preview could not be verified.')})
  return()=>{disposed=true;controller.abort();void task?.destroy()}
 },[preview?.hash,turnId,scope,ar])
 useEffect(()=>{const element=canvas.current?.parentElement;if(!element)return;const observer=new ResizeObserver(()=>setWidth(element.clientWidth));observer.observe(element);setWidth(element.clientWidth);return()=>observer.disconnect()},[!!pdf])
 useEffect(()=>{if(!pdf||!canvas.current)return;let cancelled=false,render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined
  void pdf.getPage(page).then(async pdfPage=>{
   if(cancelled||!canvas.current)return
   const original=pdfPage.getViewport({scale:1}),scale=Math.max(.2,Math.min(1.6,(width-20)/original.width,fitPage?(window.innerHeight*.57-30)/original.height:Infinity)),viewport=pdfPage.getViewport({scale}),element=canvas.current
   element.width=viewport.width;element.height=viewport.height;render=pdfPage.render({canvas:element,viewport});await render.promise
   if(cancelled)return
   const fields=await pdfPage.getAnnotations(),field=fields.find(item=>item.fieldValue===latest?.value)
   if(field?.rect&&!fitPage&&element.parentElement){const [,b,,d,,f]=viewport.transform;const y1=b*field.rect[0]+d*field.rect[1]+f,y2=b*field.rect[2]+d*field.rect[3]+f;element.parentElement.scrollTop=Math.max(0,Math.min(y1,y2)-110)}
  }).catch(()=>{if(!cancelled)setError(ar?'تعذر عرض صفحة المستند.':'The document page could not be displayed.')})
  return()=>{cancelled=true;render?.cancel()}
 },[pdf,page,width,fitPage,ar])
 return <section className="pdf-fill-playback pdf-fill-live" aria-label={ar?'معاينة المستند المباشرة':'Live document preview'}>
  <header><div><h3>{ar?'المستند أثناء التعبئة':'Document being filled'}</h3><p>{ar?'نسخة PDF محفوظة ومتحقق منها بعد كل تحديث للحقل.':'A verified PDF saved after each field update.'}</p></div></header>
  {latest&&<div className="pdf-playback-current" aria-live="polite"><strong>{latest.name}</strong><span dir="auto">{latest.value|| (ar?'فارغ':'Blank')}</span><small>{ar?`صفحة ${latest.page}`:`Page ${latest.page}`}</small></div>}
  <div className="pdf-playback-controls"><button aria-pressed={!fitPage} onClick={()=>setFitPage(false)}>{ar?'ملاءمة العرض':'Fit width'}</button><button aria-pressed={fitPage} onClick={()=>setFitPage(true)}>{ar?'الصفحة كاملة':'Fit page'}</button>{pdf&&<span>{ar?`صفحة ${page} من ${pdf.numPages}`:`Page ${page} of ${pdf.numPages}`}</span>}</div>
  {error&&<p className="pdf-playback-error" role="alert">{error}</p>}
  {!pdf&&<p role="status">{ar?'بانتظار أول حقل محفوظ…':'Waiting for the first saved field…'}</p>}
  <div className="pdf-playback-page" hidden={!pdf}><canvas ref={canvas} aria-label={`${ar?'معاينة المستند المباشرة':'Live document preview'}, page ${page}`}/></div>
 </section>
}

export function PdfFillPlayback({artifact,progress,language='en'}:{artifact:ChatArtifact;progress:PdfFieldUpdate[];language:'en'|'ar'}){
 const ar=language==='ar',canvas=useRef<HTMLCanvasElement>(null),[timeline,setTimeline]=useState<PdfFillPlayback|null>(null),[originalBytes,setOriginalBytes]=useState<Uint8Array|null>(null),[index,setIndex]=useState(-1),[page,setPage]=useState(1),[pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[width,setWidth]=useState(600),[error,setError]=useState(''),[playing,setPlaying]=useState(false)
 const current=timeline&&index>=0?timeline.updates[index]:undefined
 const title=useMemo(()=>ar?'تشغيل تحديثات الحقول المحفوظة':'Playback of saved field updates',[ar])
 useEffect(()=>{
  const controller=new AbortController();let disposed=false
  setTimeline(null);setOriginalBytes(null);setIndex(-1);setPage(1);setPdf(null);setPlaying(false);setError('')
  void loadPlayback(artifact,progress,controller.signal).then(result=>{if(!disposed){setTimeline(result.timeline);setOriginalBytes(result.originalBytes);setIndex(0);setPlaying(!reducedMotion())}}).catch(()=>{if(!disposed)setError(ar?'تعذر التحقق من نسخة المستند المحفوظة أو النموذج الأصلي.':'The saved document or original template could not be verified.')})
  return()=>{disposed=true;controller.abort()}
 },[artifact.id,artifact.hash,artifact.templateSha256,progress,ar])
 useEffect(()=>{if(!timeline||!playing)return;const timer=window.setInterval(()=>setIndex(position=>{if(position+1>=timeline.updates.length){setPlaying(false);return position}return position+1}),1200);return()=>window.clearInterval(timer)},[timeline,playing])
 useEffect(()=>{
  if(!timeline||!originalBytes)return
  let cancelled=false,task:ReturnType<typeof getDocument>|undefined
  void (async()=>{
   try{
    const document=await PDFDocument.load(originalBytes),form=document.getForm(),values=pdfFillPlaybackValuesAt(timeline,index)
    for(const [name,value] of Object.entries(values))form.getTextField(name).setText(value)
    const bytes=await document.save();if(cancelled)return
    task=getDocument({data:bytes});const rendered=await task.promise
    if(!cancelled){setPdf(rendered);setPage(current?.page??1)}
   }catch{if(!cancelled)setError(ar?'تعذر عرض صفحة التشغيل.':'The replay page could not be rendered.')}
  })()
  return()=>{cancelled=true;void task?.destroy()}
 },[timeline,originalBytes,index,ar,current?.page])
 useEffect(()=>{const element=canvas.current?.parentElement;if(!element)return;const observer=new ResizeObserver(()=>setWidth(element.clientWidth));observer.observe(element);setWidth(element.clientWidth);return()=>observer.disconnect()},[timeline])
 useEffect(()=>{if(!pdf||!canvas.current)return;let cancelled=false,render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined
  void pdf.getPage(page).then(pdfPage=>{if(cancelled||!canvas.current)return;const viewport=pdfPage.getViewport({scale:Math.min(1.5,Math.max(.5,(width-20)/pdfPage.getViewport({scale:1}).width))}),element=canvas.current;element.width=viewport.width;element.height=viewport.height;render=pdfPage.render({canvas:element,viewport});return render.promise}).catch(()=>{if(!cancelled)setError(ar?'تعذر عرض صفحة التشغيل.':'The replay page could not be rendered.')})
  return()=>{cancelled=true;render?.cancel()}
 },[pdf,page,width,ar])
 function start(){if(!timeline)return;if(index+1>=timeline.updates.length)setIndex(0);else if(index<0)setIndex(0);setPlaying(true)}
 return <section className="pdf-fill-playback" aria-label={title}>
  <header><div><h3>{title}</h3><p>{ar?'هذا تشغيل للتحديثات المحفوظة بعد اكتمال المستند، وليس تعبئة مباشرة.':'This replays updates recorded in the saved PDF after completion; it is not live filling.'}</p></div></header>
  {error?<p className="pdf-playback-error" role="alert">{error}</p>:!timeline?<p role="status">{ar?'جارٍ التحقق من المستند والنموذج…':'Verifying the saved document and original template…'}</p>:<>
   <div className="pdf-playback-controls">
    {playing?<button onClick={()=>setPlaying(false)}><Pause size={15}/>{ar?'إيقاف مؤقت':'Pause'}</button>:<button onClick={start}><Play size={15}/>{ar?'تشغيل التعبئة':'Play updates'}</button>}
    <button onClick={()=>{setPlaying(false);setIndex(0);setPage(1);if(!reducedMotion())setPlaying(true)}}><RotateCcw size={15}/>{ar?'إعادة التشغيل':'Replay field updates'}</button>
    <span>{index+1} / {timeline.updates.length}</span>
   </div>
   <div className="pdf-playback-current" aria-live="polite">{current?<><strong>{current.label}</strong><span dir="auto">{current.value|| (ar?'فارغ':'Blank')}</span><small>{ar?`صفحة ${current.page}`:`Page ${current.page}`}</small></>:<span>{ar?'جاهز لعرض التحديثات المحفوظة.':'Ready to replay the saved field updates.'}</span>}</div>
   <div className="pdf-playback-page"><p>{ar?`صفحة ${page} من ${pdf?.numPages??timeline.pageCount}`:`Page ${page} of ${pdf?.numPages??timeline.pageCount}`}</p><canvas ref={canvas} aria-label={`${title}, page ${page}`}/></div>
  </>}
 </section>
}
