import {useState} from 'react'
import {ArrowRight,BookOpen,Check,Compass} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {linked,unreviewedChallenges,type Workspace,type Hypothesis} from '@/lib/workspace'
export function WorkspaceGuide({workspace:w,hypothesis:h,demo,onTest,onEvidence,onBrief}:{workspace:Workspace;hypothesis:Hypothesis;demo:boolean;onTest:()=>void;onEvidence:()=>void;onBrief:()=>void}){
 const [expanded,setExpanded]=useState(false),notes=linked(w,h.id),challenged=unreviewedChallenges(w,h)>0,saved=w.savedTests.some(t=>t.hypothesisId===h.id);
 return <aside className="work-guide"><div className="guide-title"><Compass size={19}/><strong>Dukkan guide</strong><Badge variant="outline">Not live AI</Badge></div><p className="guide-disclosure">Suggestions from your saved work.</p>
  <div className="guide-message"><span className="home-eyebrow">Keep the decision in focus</span><h2>{h.reviewReason?'Start with what changed.':challenged?'Check the concern first.':'Keep this step small.'}</h2><p>{h.reviewReason|| (challenged?'One of your notes raises a concern. Include it in what you ask next.':'Write your question, choose who to ask and decide what result you’re looking for.')}</p><button className="guide-source" onClick={onEvidence}><BookOpen size={15}/>{notes.length} linked {demo?'sample ':''}notes<ArrowRight size={14}/></button></div>
  {saved?<div className="guide-saved"><Check size={18}/><div><strong>Test plan saved</strong><p>Home and recent work have been updated. Bring back the findings after the test.</p></div></div>:<div className="guide-next"><strong>Make a small plan</strong><p>Answer the questions in the form. You choose what to do and when to save it.</p><Button variant="outline" onClick={onTest}>Make a plan<ArrowRight size={15}/></Button></div>}
  <details open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>What should I ask?</summary><p>{h.area==='Economics'?'Ask for an itemised quotation: packaging, delivery, minimum quantities and any conditions. Record the source and date.':h.area==='Kuwait setup'?'Check which activity and legal form apply, then record the exact official source and date. A Dukkan note is not an approval.':'Ask about the last time they faced the problem, what they did instead and what it cost. Ask what would stop them choosing your offer.'}</p><small>General prompt template, not a research finding.</small></details>
  <button className="guide-brief" onClick={onBrief}>Edit my idea<ArrowRight size={14}/></button>
 </aside>
}
