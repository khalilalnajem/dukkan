import {useState} from 'react'
import {ArrowRight,ChevronRight,Pencil,Paperclip,FileText,FlaskConical,SlidersHorizontal,ChevronDown} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {EditorFrame} from '@/components/editors'
import {Field,Choice} from '@/components/fields'
import {formatMoney,nextHypothesis,signal,unreviewedChallenges,type Workspace,type Hypothesis,type Evidence} from '@/lib/workspace'

export function shortName(w:Workspace){return w.brief.idea.split(' · ')[0]||'Your business'}
export function noteName(e:Evidence){return e.source.startsWith('Fictional interview')?`Interview note · ${e.source.split('Customer ')[1]||''}`:e.source||e.kind}
export function displayDate(date:string){return new Date(date.length===10?`${date}T12:00:00`:date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
export function focusTitle(w:Workspace,h:Hypothesis|undefined){
 if(!h)return 'Choose your next practical step';
 if(h.id==='madar-setup'&&w.nextAction.task)return w.nextAction.task;
 if(h.reviewReason)return 'Review what changed';
 if(w.savedTests.some(t=>t.hypothesisId===h.id))return 'Your next test is ready';
 if(unreviewedChallenges(w,h))return h.id==='sample-demand'?'Review the delivery concern':'Review the conflicting evidence';
 return h.title;
}
type Props={workspace:Workspace;demo:boolean;preparation?:string;selectedId:string;onSelectTask:(id:string)=>void;onBrief:()=>void;onProfile:(p:Workspace['profile'])=>void;onOpen:(h:Hypothesis,tab?:string)=>void;onEvidence:()=>void;onNote:(e:Evidence)=>void;onCosts:()=>void;onSetup:()=>void}
export function HomeDashboard({workspace:w,demo,preparation,selectedId,onSelectTask:setSelectedTask,onBrief,onProfile,onOpen,onEvidence,onNote,onCosts,onSetup}:Props){
 const [editing,setEditing]=useState(false),[profile,setProfile]=useState(w.profile),[error,setError]=useState('');
 const selectedTask=selectedId;
 const attention=w.hypotheses.filter(h=>h.status!=='Paused'&&(h.status!=='Supported so far'||h.reviewReason||unreviewedChallenges(w,h)));
 const next=attention.find(h=>h.id===selectedTask)||nextHypothesis(w),count=next?signal(w,next).total:0,prepared=next&&w.savedTests.some(t=>t.hypothesisId===next.id);
 const recent=[...w.evidence.map(e=>({id:e.id,title:noteName(e),type:demo?'Sample note':e.kind,date:e.date,icon:FileText,open:()=>onNote(e)})),...w.savedTests.map(t=>({id:t.id,title:'Test plan · '+t.title,type:'Saved test',date:t.date,icon:FlaskConical,open:()=>{const h=w.hypotheses.find(h=>h.id===t.hypothesisId);if(h)onOpen(h,'test')}})),...w.decisions.map(d=>({id:d.id,title:d.outcome+' · '+d.assumption,type:'Decision',date:d.date,icon:FileText,open:()=>{const h=w.hypotheses.find(h=>h.id===d.hypothesisId);if(h)onOpen(h,'decide')}}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
 const hasCosts=Object.values(w.costs).some(Boolean);
 return <div className="home-dashboard">
  <div className="business-overview"><div className="home-heading"><div><div className="business-title-line"><h1>{shortName(w)}</h1><button className="stage-control" aria-label={`Change stage: ${w.profile.stage}`} onClick={()=>{setProfile(w.profile);setEditing(true)}}>{w.profile.stage}<ChevronDown size={14}/></button></div><p>{w.brief.offer||'Start small. Work through one step at a time.'}</p></div><Button variant="outline" onClick={onBrief}><Pencil size={16}/>Edit idea</Button></div>
  <details className="simple-business-details"><summary>About your idea</summary><section className="business-context" aria-label="Business summary">
   <div><span>Who it’s for</span><strong>{w.brief.customer||'Not defined yet'}</strong></div>
   <div><span>Test budget</span><button onClick={()=>{setProfile(w.profile);setEditing(true)}}>{w.profile.budget!==''&&Number.isFinite(Number(w.profile.budget))?`KWD ${formatMoney(Number(w.profile.budget))}`:'Set a budget'}<Pencil size={13}/></button><small>Your estimate</small></div>
  </section></details>
  </div>
  <div className="focus-heading"><h2>Your plan</h2><span>Choose one step to work on.</span></div>
  <div className="home-priorities organised-focus">
   <div className="mobile-task-picker"><label htmlFor="home-task">Your steps · {attention.length}</label><select id="home-task" value={next?.id||''} onChange={e=>setSelectedTask(e.target.value)}>{!attention.length&&<option value="">No open tasks</option>}{attention.map(h=><option key={h.id} value={h.id}>{h.id==='sample-demand'?'Delivery willingness':h.id==='sample-economics'?'Packaging and delivery cost':h.id==='sample-setup'?'Activity and approvals':h.id==='madar-setup'?'Licence preparation':h.id==='madar-demand'?'Customer demand':h.title}</option>)}</select></div>
   <section className="home-attention"><div className="task-list-heading"><h3>Your steps</h3><Badge variant="secondary">{attention.length}</Badge></div>
    {attention.map(h=><button className={`attention-item ${next?.id===h.id?'is-selected':''}`} aria-pressed={next?.id===h.id} aria-controls="task-preview" key={h.id} onClick={()=>setSelectedTask(h.id)}><span className={`attention-dot ${unreviewedChallenges(w,h)||h.reviewReason?'urgent':''}`}/><span><strong>{h.id==='sample-demand'?'Delivery willingness':h.id==='sample-economics'?'Packaging and delivery cost':h.id==='sample-setup'?'Activity and approvals':h.id==='madar-setup'?'Licence preparation':h.id==='madar-demand'?'Customer demand':h.title}</strong><small>{h.reviewReason?'Brief changed · Review needed':unreviewedChallenges(w,h)?`Conflicting ${demo?'sample ':''}notes`:h.area==='Kuwait setup'?'Check what applies to your business':!signal(w,h).total?'Ready to plan':'Read your notes and choose what to do'}</small></span><ChevronRight size={17}/></button>)}
    {!attention.length&&<p className="home-empty">These steps have been reviewed. Check the setup questions before you launch.</p>}
   </section>
   <section className="home-next" id="task-preview" aria-label="Selected task"><span className="home-eyebrow">Your next step</span><h2>{focusTitle(w,next)}</h2><p>{next?.reviewReason?'Your idea changed. Check whether your old notes still fit.':prepared?'Try your saved plan, then come back and write down what happened.':next&&unreviewedChallenges(w,next)?`${demo?'A sample note':'A linked note'} raises a concern. Read it before planning your next step.`:next?.id==='madar-setup'&&w.nextAction.task?w.nextAction.dependency:next?.area==='Kuwait setup'?'Review the preparation questions and the sources behind them.':next?'Plan a small check: who will you ask, and what will you look for?':'Review the remaining setup questions and record your next step.'}</p>
    <button className="linked-notes" onClick={()=>next?onOpen(next):onEvidence()}><Paperclip size={18}/>{count} linked {count===1?'note':'notes'}{demo?' · Sample content':''}</button>
    <div className="home-next-actions"><Button onClick={()=>next?.area==='Kuwait setup'?onSetup():next?onOpen(next,prepared||count===0?'test':'evidence'):onSetup()}>{next?.area==='Kuwait setup'?'Check setup':prepared?'Open saved plan':'Plan this step'}<ArrowRight size={17}/></Button><details className="why-action"><summary>Why start here?</summary><p>Changed ideas and notes that raise concerns come first. After that, Dukkan uses the priorities in your plan. This order uses rules, not AI.</p></details></div>
    <div className="home-next-foot">{prepared?'Plan saved · Ready to try':selectedTask?'Selected by you':'You can choose a different step.'}</div>
   </section>
  </div>
  <details className="home-recent simple-recent"><summary>Recently saved</summary><div className="home-section-heading"><h2>Recent work</h2><button className="text-link" onClick={onEvidence}>View all<ArrowRight size={15}/></button></div><div className="recent-head"><span>Item</span><span>Type</span><span>Date</span><span/></div>
   {recent.map(({id,title,type,date,icon:Icon,open})=><button className="recent-row" key={id} onClick={open}><span><Icon size={18}/><strong>{title}</strong></span><span>{type}</span><time dateTime={date}>{displayDate(date)}</time><ChevronRight size={16}/></button>)}
   {hasCosts&&recent.length<4&&<button className="recent-row" onClick={onCosts}><span><SlidersHorizontal size={18}/><strong>Cost assumptions</strong></span><span>Estimate</span><span>Current</span><ChevronRight size={16}/></button>}
   {preparation&&<button className="recent-row" onClick={onSetup}><span><FileText size={18}/><strong>{preparation}</strong></span><span>Preparation</span><span>Current</span><ChevronRight size={16}/></button>}
   {!recent.length&&!hasCosts&&!preparation&&<div className="home-empty">Your notes, test plans and decisions will appear here as you save them.</div>}
  </details>
  {editing&&<EditorFrame title="Your business context" description="You choose the stage. The budget is a planning limit, not a forecast." onClose={()=>setEditing(false)}><form onSubmit={e=>{e.preventDefault();if(profile.budget!==''&&(!Number.isFinite(Number(profile.budget))||Number(profile.budget)<0||Number(profile.budget)>1e9)){setError('Use a budget between 0 and 1 billion KWD.');return}onProfile(profile);setEditing(false)}}><Choice label="Current stage" value={profile.stage} options={['Exploring the idea','Testing demand','Preparing to launch','Operating']} onChange={stage=>setProfile({...profile,stage:stage as Workspace['profile']['stage']})}/><Field label="Test budget (KWD)" type="number" value={profile.budget} onChange={budget=>setProfile({...profile,budget})}/><p role="alert" className="form-error">{error}</p><div className="editor-footer"><Button variant="outline" type="button" onClick={()=>setEditing(false)}>Cancel</Button><Button type="submit">Save details</Button></div></form></EditorFrame>}
 </div>
}
