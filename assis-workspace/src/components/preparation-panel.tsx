import {useEffect,useRef,useState} from 'react'
import {z} from 'zod'
import {ArrowRight,Check,ChevronRight,Download,FileText,LoaderCircle,ShieldCheck,TriangleAlert} from 'lucide-react'
import {Button} from './ui/button'
import {Field} from './fields'
import {API,request,healthSchema,fixtureSchema,caseSchema,caseResponseSchema,jobSchema,bundleSchema,reviewSchema,preparationLabel,executionLabel,message,safeLink,type PreparationBundle,type ExecutionMode,type PreparationSummary} from '../lib/preparation-api'
import {workspaceToken,type WriteResult} from '../lib/workspace-writer'
import type {Workspace} from '../lib/workspace'

const sessionKey='assis-madar-case-v1'
const running=(b:PreparationBundle|null)=>!!b&&['queued','running','retry_wait'].includes(b.job.status)
type Operation={path:string;body:unknown;key:string}
type Props={active:boolean;workspace:Workspace;onOpen:()=>void;onApply:(expected:string,action:Workspace['nextAction'])=>Promise<WriteResult>;onProgress:(summary:PreparationSummary)=>void}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{}

export function PreparationPanel({active,workspace,onOpen,onApply,onProgress}:Props){
 const [health,setHealth]=useState<z.infer<typeof healthSchema>|null>(null),[mode,setMode]=useState<ExecutionMode>('live_agent')
 const [bundle,setBundle]=useState<PreparationBundle|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('')
 const [unit,setUnit]=useState(''),[confirmed,setConfirmed]=useState(false),[ack,setAck]=useState(false),[actor,setActor]=useState('Mariam (synthetic)')
 const [view,setView]=useState<'summary'|'draft'|'sources'>('summary'),[proposal,setProposal]=useState<{token:string;action:Workspace['nextAction']}|null>(null)
 const [caseId,setCaseId]=useState(''),[pollTick,setPollTick]=useState(0)
 const controller=useRef<AbortController|null>(null),operation=useRef<Operation|null>(null),operationName=useRef('')
 const fixture=useRef<z.infer<typeof fixtureSchema>|null>(null),created=useRef<z.infer<typeof caseSchema>|null>(null)
 const launch=useRef<{businessId:string;mode:ExecutionMode}|null>(null),gate=useRef(false)
 const awaitingRefresh=useRef<string|null>(null),progress=useRef(onProgress),[recovering,setRecovering]=useState(active)
 progress.current=onProgress
 useEffect(()=>{if(bundle)progress.current({label:preparationLabel(bundle),jobId:bundle.job.jobId,mode:bundle.job.executionMode,reviewed:!!bundle.review?.valid&&bundle.review.packHash===bundle.pack?.hash})},[bundle])
 useEffect(()=>{
  const c=new AbortController();controller.current=c
  if(active){
   request('/api/health',healthSchema,c.signal).then(v=>{if(!c.signal.aborted)setHealth(v)}).catch(()=>{if(!c.signal.aborted)setError('The local preparation service is unavailable. Your workspace is unchanged.')})
   let stored='';try{stored=sessionStorage.getItem(sessionKey)||''}catch{/* Optional recovery metadata only. */}
   if(stored){setCaseId(stored);request('/api/cases/'+encodeURIComponent(stored),caseResponseSchema,c.signal).then(async v=>{
    created.current=v.case
    const job=v.jobs.filter(j=>j.status!=='superseded').at(-1)
    if(job){const b=await request('/api/jobs/'+job.jobId,bundleSchema,c.signal);if(!c.signal.aborted)setBundle(b)}
   }).catch(e=>{if(!c.signal.aborted){setError(e.message);if(e.status===404){try{sessionStorage.removeItem(sessionKey)}catch{}setCaseId('')}}}).finally(()=>{if(!c.signal.aborted)setRecovering(false)})}else setRecovering(false)
  }
  return()=>{c.abort();controller.current=null}
 },[active])
 useEffect(()=>{
  if(!running(bundle))return
  const c=controller.current;if(!c)return
  const timer=setTimeout(()=>{request('/api/jobs/'+bundle!.job.jobId,bundleSchema,c.signal).then(b=>{if(!c.signal.aborted){setBundle(b);setError('');setPollTick(v=>v+1)}}).catch(e=>{if(!c.signal.aborted)setError('Status could not refresh. '+e.message)})},1400)
  return()=>clearTimeout(timer)
 },[bundle,pollTick])
 async function run(name:string,fn:(signal:AbortSignal)=>Promise<void>){
  const c=controller.current;if(!c||gate.current)return
  gate.current=true;operationName.current=name;setBusy(true);setError('');setFeedback('')
  try{await fn(c.signal)}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'The operation failed. No success was recorded.')}
  finally{if(!c.signal.aborted){gate.current=false;setBusy(false)}}
 }
 async function mutation<T>(path:string,body:unknown,schema:z.ZodType<T>,signal:AbortSignal){
  // Retain the exact request and receipt key after an uncertain response.
  if(!operation.current)operation.current={path,body,key:crypto.randomUUID()}
  const op=operation.current
  if(op.path!==path)throw new Error('Retry the previous operation before continuing.')
  const result=await request(op.path,schema,signal,op.body,op.key)
  if(signal.aborted)throw new DOMException('Cancelled','AbortError')
  operation.current=null;return result
 }
 async function refresh(signal:AbortSignal,id=awaitingRefresh.current||bundle?.job.jobId){if(!id)return;const b=await request('/api/jobs/'+id,bundleSchema,signal);if(!signal.aborted){setBundle(b);setAck(false);awaitingRefresh.current=null}}
 function start(){void run('start',async signal=>{
  if(awaitingRefresh.current){await refresh(signal);return}
  if(!launch.current)launch.current={businessId:'madar-'+crypto.randomUUID(),mode}
  if(!fixture.current)fixture.current=await request('/api/demo-fixture',fixtureSchema,signal)
  if(!created.current){const r=await mutation('/api/cases',{businessId:launch.current.businessId,facts:fixture.current.facts},z.object({case:caseSchema}),signal);created.current=r.case;setCaseId(r.case.businessId);try{sessionStorage.setItem(sessionKey,r.case.businessId)}catch{}}
  const c=created.current
  if(!c.documentVersionIds.length){const r=await mutation('/api/cases/'+c.businessId+'/documents',{expectedRevision:c.businessRevision,synthetic:true,files:fixture.current.files},z.object({case:caseSchema}),signal);created.current=r.case}
  const r=await mutation('/api/cases/'+c.businessId+'/jobs',{expectedRevision:created.current!.businessRevision,executionMode:launch.current.mode},z.object({job:jobSchema}),signal)
  awaitingRefresh.current=r.job.jobId;await refresh(signal);fixture.current=null
 })}
 function correct(){void run('correct',async signal=>{
  if(awaitingRefresh.current){await refresh(signal);return}
  if(!bundle||(!confirmed&&!operation.current)||(!unit.trim()&&!operation.current))return
  const b=bundle
  const r=await mutation('/api/cases/'+b.case.businessId+'/answers',{expectedRevision:b.case.businessRevision,supersedesJobId:b.job.jobId,executionMode:b.job.executionMode,facts:[{field:'premises.unit',value:unit.trim(),origin:'founder',sourceRef:'synthetic-lease.pdf#page=1',confirmedBy:actor.trim(),confirmedAt:new Date().toISOString()}]},z.object({case:caseSchema,job:jobSchema}),signal)
  created.current=r.case;awaitingRefresh.current=r.job.jobId;setConfirmed(false);setUnit('');setAck(false);setView('summary');await refresh(signal)
 })}
 function review(){void run('review',async signal=>{
  if(awaitingRefresh.current){await refresh(signal);return}
  if(!bundle?.pack||(!ack&&!operation.current))return
  await mutation('/api/jobs/'+bundle.job.jobId+'/review',{expectedRevision:bundle.case.businessRevision,packHash:bundle.pack.hash,actor:actor.trim(),acknowledgeIncomplete:true},z.object({review:reviewSchema}),signal)
  awaitingRefresh.current=bundle.job.jobId;await refresh(signal);setFeedback('Review recorded against this exact draft. Applicability and handoff remain blocked.')
 })}
 function retry(){if(!health){void run('health',async signal=>{const h=await request('/api/health',healthSchema,signal);if(!signal.aborted)setHealth(h)});return}if(operationName.current==='start'&&(operation.current||awaitingRefresh.current))start();else if(operationName.current==='correct')correct();else if(operationName.current==='review')review();else void run('refresh',refresh)}
 function exportDraft(){void run('export',async signal=>{
  if(!bundle?.pack)return
  const r=await fetch(API+'/api/jobs/'+bundle.job.jobId+'/export?packHash='+encodeURIComponent(bundle.pack.hash),{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])})
  if(!r.ok){const e=await r.json();throw new Error(e.error?.message||'Export failed.')}
  const bytes=await r.arrayBuffer();if(signal.aborted)return
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
  if(hash!==bundle.pack.hash)throw new Error('Export does not match the reviewed draft. Download was stopped.')
  if(signal.aborted)return
  const url=URL.createObjectURL(new Blob([bytes],{type:'text/html'})),a=document.createElement('a');a.href=url;a.download='dikan-madar-incomplete-preparation.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  setFeedback('Incomplete worksheet downloaded. No application was submitted.')
 })}
 const reviewed=!!bundle?.review?.valid&&bundle.review.packHash===bundle.pack?.hash&&bundle.review.businessRevision===bundle.case.businessRevision&&bundle.job.businessRevision===bundle.case.businessRevision
 const inspect=object(bundle?.job.results?.inspect_documents),checks=(Array.isArray(inspect.checks)?inspect.checks:bundle?.pack?.checks||[]).map(object)
 const mismatch=checks.find(c=>c.field==='premises.unit'&&c.state!=='checked'),observed=Array.isArray(mismatch?.observed)?mismatch.observed.map(object):[]
 const pending=running(bundle),stage=!bundle?0:bundle.job.status==='needs_input'?1:pending?0:2
 if(!active)return <section className="preparation-entry"><div><span className="eyebrow">Preparation companion</span><h2>See a check become a reviewable draft.</h2><p>Follow Madar, a fictional design studio, through a document discrepancy and a sourced preparation worksheet.</p></div><Button onClick={onOpen}>Open Madar example<ArrowRight size={15}/></Button><small>Separate from your business records. No official submission.</small></section>
 return <section className="preparation-panel" aria-label="Madar preparation companion">
  <header className="preparation-heading"><div><span className="eyebrow">Madar Design Studio · Synthetic example</span><h2>Prepare the next step.</h2><p>Check the supplied details, resolve discrepancies and review an incomplete worksheet.</p></div><span className="preparation-mode">{bundle?executionLabel(bundle.job.executionMode):'Choose how to run the check'}</span></header>
  <ol className="preparation-steps" aria-label="Preparation steps">{['Check inputs','Confirm details','Review draft'].map((s,i)=><li key={s} aria-current={stage===i?'step':undefined}><span>{i<stage?<Check size={14}/>:i+1}</span>{s}{i<2&&<ChevronRight size={14}/>}</li>)}</ol>
  {error&&<div className="preparation-alert" role="alert"><TriangleAlert size={18}/><div><strong>Action needs attention</strong><p>{error}</p><Button variant="outline" size="sm" disabled={busy} onClick={retry}>Retry {operation.current?'same request':'status check'}</Button></div></div>}
  {feedback&&<p className="preparation-feedback" role="status">{feedback}</p>}
  {!bundle&&<div className="preparation-start"><div><h3>A deliberate inconsistency to work through</h3><p>The fictional intake records Unit 21. The supplied synthetic lease will be checked against it. Incorporation is assumed, not verified.</p><dl><div><dt>Business</dt><dd>Visual identity and digital design</dd></div><div><dt>Evidence</dt><dd>One synthetic lease PDF, stored privately by the local service</dd></div><div><dt>Retention</dt><dd>Retained locally. Documents are excluded from workspace backups.</dd></div></dl></div><div className="preparation-start-action"><label htmlFor="execution-mode">Execution mode</label><select id="execution-mode" value={mode} disabled={busy||!!launch.current||!!caseId} onChange={e=>setMode(e.target.value as ExecutionMode)}>{health?.executionModes.includes('live_agent')&&<option value="live_agent">API model</option>}</select><p>{mode==='live_agent'?`${health?.model?.name||'API model'} chooses tools. Availability is confirmed by the run, not configuration.`:'Fixed tool sequence using actual local checks, not a simulated conversation.'}</p><Button disabled={busy||recovering||!health?.executionModes.includes('live_agent')} onClick={start}>{busy?<LoaderCircle className="spin" size={16}/>:<ArrowRight size={16}/>} {recovering?'Restoring preparation':caseId?'Continue preparation':'Start preparation'}</Button></div></div>}
  {bundle&&<>
   <div className="preparation-state" role="status">{pending?<LoaderCircle className="spin" size={19}/>:reviewed?<ShieldCheck size={19}/>:<FileText size={19}/>}<div><h3>{preparationLabel(bundle)}</h3><p>{pending?`Current step: ${bundle.job.step.replaceAll('_',' ')}. Actual tool results appear below.`:bundle.job.status==='needs_input'?'Your confirmation is required before a corrected draft can be reviewed.':'A preparation record, not eligibility, a licence or approval.'}</p></div></div>
   {bundle.job.status==='failed'&&<div className="preparation-alert"><TriangleAlert size={18}/><div><p>{bundle.job.error?.message||bundle.job.reasonCode||'The local run failed.'}</p><Button disabled={busy} onClick={()=>{launch.current={businessId:bundle.case.businessId,mode:bundle.job.executionMode};created.current=bundle.case;start()}}>Start a new check</Button></div></div>}
   {bundle.job.status==='needs_input'&&<div className="preparation-correction"><div><h3>Which premises unit is correct?</h3><p>The extracted value is a candidate, not an authenticated document fact.</p><div className="preparation-comparison"><div><span>Founder intake</span><strong>Unit {String(mismatch?.expected??bundle.case.facts.find(f=>f.field==='premises.unit')?.value??'Unknown')}</strong></div><div><span>Supplied document</span><strong>{observed.length?observed.map(o=>'Unit '+String(o.value)).join(', '):'Needs manual review'}</strong>{observed.map((o,i)=><small key={i}>Page {String(o.page)} · “{String(o.quote)}”</small>)}</div></div>{bundle.job.questions.map((q,i)=><p className="field-hint" key={i}>{message(q)}</p>)}</div><form onSubmit={e=>{e.preventDefault();correct()}}><Field label="Confirmed premises unit" disabled={busy||!!operation.current} value={unit} onChange={setUnit} required/><Field label="Confirmed by" disabled={busy||!!operation.current} value={actor} onChange={setActor} required/><label className="check-label"><input type="checkbox" disabled={busy||!!operation.current} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this correction for the synthetic example.</label><Button type="submit" disabled={busy||!!operation.current||!confirmed||!unit.trim()||!actor.trim()}>Confirm and check again<ArrowRight size={15}/></Button></form></div>}
   {bundle.pack&&!pending&&<div className="preparation-review">
    <div className="preparation-view-tabs" role="group" aria-label="Draft views">{(['summary','draft','sources'] as const).map(v=><Button key={v} variant="ghost" aria-pressed={view===v} onClick={()=>setView(v)}>{v==='summary'?'Review summary':v==='draft'?'Full draft':`Sources (${bundle.pack!.sources.length})`}</Button>)}</div>
    {view==='summary'&&<div className="preparation-summary"><h3>What is checked, and what remains open</h3><ul>{bundle.pack.checks.map((c,i)=><li key={i}><span className="preparation-check-state">{String(object(c).state||'Open')}</span>{message(c)}</li>)}</ul><details open={reviewed}><summary>Applicability questions · {bundle.pack.blockers.length} open</summary><ul>{bundle.pack.blockers.map((b,i)=><li key={i}>{message(b)}</li>)}</ul></details><Button variant="outline" onClick={()=>setView('draft')}>Read the complete draft<ArrowRight size={14}/></Button></div>}
    {view==='draft'&&<iframe title="Incomplete preparation worksheet" sandbox="" src={API+'/api/jobs/'+bundle.job.jobId+'/draft'} className="preparation-draft"/>}
    {view==='sources'&&<div className="preparation-sources"><p>Captured official references. Requirement applicability is not activated or verified.</p>{bundle.pack.sources.map((v,i)=>{const s=object(v),url=safeLink(s.url);return <article key={i}><h3>{String(s.title||s.id||'Source')}</h3><p>{String(s.locator||'')} · Captured {String(s.retrievedAt||'Date unavailable')}</p>{url&&<a href={url} target="_blank" rel="noopener noreferrer">Open official reference</a>}<details><summary>Source provenance</summary><code>{String(s.rawHash||'Hash unavailable')}</code></details></article>})}</div>}
    {bundle.job.status!=='needs_input'&&<div className="preparation-review-action">{reviewed?<><div><strong>Reviewed preparation draft: applicability questions open</strong><p>Official handoff remains blocked. Export is an incomplete worksheet only.</p></div><Button disabled={busy} onClick={exportDraft}><Download size={15}/>Export incomplete worksheet</Button></>:<><Field label="Reviewer" disabled={busy||!!operation.current} value={actor} onChange={setActor}/><label className="check-label"><input type="checkbox" disabled={busy||!!operation.current} checked={ack} onChange={e=>setAck(e.target.checked)}/>I reviewed this draft and acknowledge the open applicability questions.</label><Button disabled={busy||!!operation.current||!ack||!actor.trim()||['superseded','cancelled','failed'].includes(bundle.job.status)} onClick={review}>Record draft review<Check size={15}/></Button></>}<details><summary>Exact draft identity</summary><code>SHA-256 {bundle.pack.hash}</code><p>Revision {bundle.pack.businessRevision} · Review is bound to these exact export bytes.</p></details></div>}
   </div>}
   <details className="preparation-trace"><summary>Run details · {bundle.job.trace.length} actual tool attempts</summary><p>{executionLabel(bundle.job.executionMode)} · {bundle.job.status} · Handoff {bundle.handoff.state}</p>{bundle.job.executionMode==='live_agent'&&<p>{bundle.job.modelTrace.length} recorded model responses{bundle.job.model?' · '+bundle.job.model.name:''}. Tool execution is listed below.</p>}<ol>{bundle.job.trace.map(t=><li key={t.callId+':'+t.at}><span>{t.name.replaceAll('_',' ')}</span><small>Attempt {t.attempt} · {t.ok?'Result recorded':'Failed'}</small></li>)}</ol><code>Job {bundle.job.jobId} · Revision {bundle.job.businessRevision}</code></details>
   {reviewed&&<section className="preparation-followup"><h3>Keep the next action connected</h3>{!proposal?<Button variant="outline" onClick={()=>setProposal({token:workspaceToken(workspace),action:{task:'Confirm Madar licence-route applicability with KBC',owner:'Mariam (synthetic)',due:'',dependency:'Resolve open applicability questions. Preparation review is not approval.'}})}>Preview follow-up</Button>:<><dl><div><dt>Current next action</dt><dd>{workspace.nextAction.task||'Not set'}</dd></div><div><dt>Proposed replacement</dt><dd>{proposal.action.task}</dd></div></dl><p>Only the next action changes, in this example workspace. Existing notes and setup answers are preserved.</p><div className="preparation-inline"><Button variant="outline" onClick={()=>setProposal(null)}>Keep current action</Button><Button disabled={busy} onClick={()=>void run('apply',async signal=>{const r=await onApply(proposal.token,proposal.action);if(signal.aborted)return;if(!r.ok)throw new Error(r.reason);setProposal(null);setFeedback('Example next action updated. Personal records are unchanged.')})}>Use this follow-up</Button></div></>}</section>}
  </>}
  <p className="preparation-boundary">No government submission. Source activation, document authenticity and eligibility remain unverified.</p>
 </section>
}
