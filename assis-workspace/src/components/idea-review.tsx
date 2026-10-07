import {useEffect,useState} from 'react'
import {Check,FlaskConical,PenLine,PauseCircle} from 'lucide-react'
import {Button} from '@/components/ui/button'
import type {ChatArtifact} from '@/lib/chat-api'
import type {Workspace} from '@/lib/workspace'
import {ideaReadiness} from '@/lib/idea-review'

type Choice='test'|'revise'|'park'
type CustomOption={title:string;kind:'feature'|'expansion'|'pivot';tradeoff:string}
type Props={artifact:ChatArtifact;language:'en'|'ar';decision:Workspace['ideaReviewDecisions'][number]|undefined;onSave:(choice:Choice,reason:string,selectedOption:string,customOption?:CustomOption)=>void}
const labels={customer_need:['Customer need','حاجة العملاء'],differentiation:['Difference','التميّز'],economics:['Economics','الجدوى المالية'],feasibility:['Delivery','إمكانية التنفيذ'],evidence:['Evidence','الأدلة']} as const

export function IdeaReview({artifact,language,decision,onSave}:Props){
 const review=artifact.ideaReview
 const [choice,setChoice]=useState<Choice>('test')
 const [reason,setReason]=useState('')
 const [selectedOption,setSelectedOption]=useState('')
 const [customTitle,setCustomTitle]=useState('')
 const [customKind,setCustomKind]=useState<CustomOption['kind']>('feature')
 const [customTradeoff,setCustomTradeoff]=useState('')
 const [editing,setEditing]=useState(false)
 useEffect(()=>setEditing(false),[decision?.id])
 if(!review)return null
 const score=ideaReadiness(review),ar=language==='ar'
 const latest=decision
 return <section className="dukkan-idea-review" aria-label={ar?'مراجعة الفكرة':'Idea review'}>
  <div className="dukkan-review-head"><div><span>{ar?'مراجعة من الذكاء الاصطناعي':'AI critique · for review'}</span><h3>{ar?'ما الذي يجب اختباره؟':'What needs proving?'}</h3></div><div className="dukkan-review-score"><strong>{score.complete?`${score.score}/${score.maximum}`:'—'}</strong><small>{ar?'جاهزية الأدلة':'Evidence readiness'}</small></div></div>
  <p className="dukkan-review-caveat">{ar?'هذا ليس احتمال نجاح أو تقييماً نهائياً. الدرجات المنخفضة تعني أن معلومات مهمة ما زالت مجهولة.':'This is not a success probability or verdict. Lower scores mean important facts remain unknown.'}</p>
  <p className="dukkan-review-rationale">{review.rationale}</p>
  <details className="dukkan-review-details"><summary>{ar?'لماذا هذه الدرجات؟':'Why these scores?'}</summary>{review.dimensions.map(item=><div key={item.key}><strong>{labels[item.key][ar?1:0]} · {item.score}/4</strong><p>{item.reason}</p><small>{ar?'تحقق من: ':'Find out: '}{item.evidenceNeeded}</small></div>)}</details>
  {!!review.criticalRisks.length&&<div className="dukkan-review-risks"><strong>{ar?'أسئلة مهمة قبل التوسع':'Critical questions before expanding'}</strong><ul>{review.criticalRisks.map((risk,index)=><li key={index}>{risk}</li>)}</ul></div>}
  {!!review.options.length&&<details className="dukkan-review-details"><summary>{ar?'خيارات للتطوير أو التغيير':'Options to explore'} · {review.options.length}</summary><div className="dukkan-review-options">{review.options.map(option=><button type="button" aria-pressed={selectedOption===option.title} key={option.title} onClick={()=>setSelectedOption(current=>current===option.title?'':option.title)}><small>{option.kind}</small><strong>{option.title}</strong><span>{option.benefit}</span><span>{ar?'المقابل: ':'Trade-off: '}{option.tradeoff}</span><em>{ar?'اختبر: ':'Test: '}{option.test}</em></button>)}</div></details>}
  {latest&&!editing?<div className="dukkan-review-saved" role="status"><Check size={16}/><span><strong>{ar?'قرارك المحفوظ':'Your saved choice'}: {latest.choice==='test'?ar?'اختبر':'Test':latest.choice==='revise'?ar?'عدّل':'Revise':ar?'أوقف مؤقتاً':'Park'}</strong><small>{latest.reason}{latest.selectedOption?' · '+latest.selectedOption:''}{latest.customOption?' · '+latest.customOption.title+' ('+latest.customOption.tradeoff+')':''}</small><button type="button" onClick={()=>{setChoice(latest.choice);setReason(latest.reason);setSelectedOption(latest.selectedOption);setCustomTitle(latest.customOption?.title||'');setCustomKind(latest.customOption?.kind||'feature');setCustomTradeoff(latest.customOption?.tradeoff||'');setEditing(true)}}>{ar?'غيّر القرار':'Change decision'}</button></span></div>:<form className="dukkan-review-decision" onSubmit={event=>{event.preventDefault();if(reason.trim()&&(!customTitle.trim()||customTradeoff.trim()))onSave(choice,reason.trim(),selectedOption,customTitle.trim()?{title:customTitle.trim(),kind:customKind,tradeoff:customTradeoff.trim()}:undefined)}}><strong>{ar?'قرارك أنت':'Your decision'}</strong><div role="group" aria-label={ar?'اختر الخطوة':'Choose the next step'}><button type="button" aria-pressed={choice==='test'} onClick={()=>setChoice('test')}><FlaskConical size={15}/>{ar?'اختبر':'Test'}</button><button type="button" aria-pressed={choice==='revise'} onClick={()=>setChoice('revise')}><PenLine size={15}/>{ar?'عدّل':'Revise'}</button><button type="button" aria-pressed={choice==='park'} onClick={()=>setChoice('park')}><PauseCircle size={15}/>{ar?'أوقف مؤقتاً':'Park'}</button></div><details className="dukkan-review-own"><summary>{ar?'أضف خياراً من عندك':'Add your own option'}</summary><label>{ar?'اسم الخيار':'Option'}<input value={customTitle} maxLength={120} onChange={event=>setCustomTitle(event.target.value)}/></label><label>{ar?'النوع':'Type'}<select value={customKind} onChange={event=>setCustomKind(event.target.value as CustomOption['kind'])}><option value="feature">{ar?'ميزة':'Feature'}</option><option value="expansion">{ar?'توسّع':'Expansion'}</option><option value="pivot">{ar?'تغيير الاتجاه':'Pivot'}</option></select></label><label>{ar?'ما الذي ستتنازل عنه أو تخاطر به؟':'What is the trade-off?'}<textarea rows={2} value={customTradeoff} onChange={event=>setCustomTradeoff(event.target.value)}/></label></details><label>{ar?'لماذا اخترت هذا؟':'Why this choice?'}<textarea rows={2} dir="auto" value={reason} onChange={event=>setReason(event.target.value)} placeholder={ar?'اذكر ما تحتاج إلى معرفته أو تغييره':'Say what you need to learn or change'}/></label><Button type="submit" disabled={!reason.trim()||!!customTitle.trim()&&!customTradeoff.trim()}><Check size={15}/>{ar?'احفظ القرار':'Save decision'}</Button>{latest&&<button type="button" className="dukkan-review-cancel" onClick={()=>setEditing(false)}>{ar?'إلغاء':'Cancel'}</button>}<p>{ar?'يمكنك العودة إلى أي مرحلة. لا تُعد المسودة دليلاً على طلب العملاء.':'You can revisit any stage. A draft is not customer evidence.'}</p></form>}
 </section>
}
