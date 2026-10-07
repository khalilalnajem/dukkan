import {useEffect,useRef,useState} from 'react'
import {GlobalWorkerOptions,getDocument,type PDFDocumentProxy} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {ChevronLeft,ChevronRight} from 'lucide-react'
import {verifiedPreview,type ChatArtifact} from '../lib/chat-api'
import './pdf-form-workspace.css'
GlobalWorkerOptions.workerSrc=workerUrl
export function PdfArtifactPreview({artifact,title,language='en'}:{language?:'en'|'ar';artifact:ChatArtifact;title:string}){
 const tr=(en:string,ar:string)=>language==='ar'?ar:en
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(0),[availableWidth,setAvailableWidth]=useState(440),[error,setError]=useState('')
 const canvas=useRef<HTMLCanvasElement>(null)
 useEffect(()=>{const controller=new AbortController();let task:ReturnType<typeof getDocument>|undefined;setPdf(null);setError('');setPage(1);void verifiedPreview(artifact,controller.signal).then(blob=>blob.arrayBuffer()).then(bytes=>{controller.signal.throwIfAborted();task=getDocument({data:new Uint8Array(bytes)});return task.promise}).then(doc=>{if(!controller.signal.aborted)setPdf(doc)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>{controller.abort();void task?.destroy()}},[artifact.id,artifact.hash])
 useEffect(()=>{const el=canvas.current?.parentElement;if(!el)return;const observer=new ResizeObserver(()=>setAvailableWidth(el.clientWidth));observer.observe(el);setAvailableWidth(el.clientWidth);return()=>observer.disconnect()},[pdf])
 useEffect(()=>{if(!pdf||!canvas.current)return;let cancelled=false,render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;void pdf.getPage(page).then(p=>{if(cancelled||!canvas.current)return;const viewport=p.getViewport({scale:zoom?zoom/100:Math.max(100,availableWidth-16)/p.getViewport({scale:1}).width}),c=canvas.current;c.width=viewport.width;c.height=viewport.height;render=p.render({canvas:c,viewport});return render.promise}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true;render?.cancel()}},[pdf,page,zoom,availableWidth])
 return <section className="pdf-form-workspace" aria-label={title}><div className="pdf-toolbar"><button aria-label={tr('Previous PDF page','صفحة PDF السابقة')} disabled={page===1} onClick={()=>setPage(page-1)}><ChevronLeft size={16}/></button><span>{page} / {pdf?.numPages||'…'}</span><button aria-label={tr('Next PDF page','صفحة PDF التالية')} disabled={!pdf||page===pdf.numPages} onClick={()=>setPage(page+1)}><ChevronRight size={16}/></button><label>{tr('Zoom','التكبير')}<select value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={0}>{tr('Fit width','ملاءمة العرض')}</option>{[60,80,100,125,150].map(n=><option key={n} value={n}>{n}%</option>)}</select></label><span>{tr('Prepared · not submitted','مُعدّ · لم يُقدَّم')}</span></div>{error?<p role="alert">{error}</p>:!pdf?<p role="status">{tr('Verifying PDF…','جارٍ التحقق من ملف PDF…')}</p>:<div className="pdf-page"><canvas ref={canvas} aria-label={title+' page '+page}/></div>}</section>
}
