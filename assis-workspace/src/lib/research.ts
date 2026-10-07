import type {Evidence,Hypothesis,Workspace} from './workspace.ts'

export function evidenceOrigin(note:Evidence):'real'|'simulated'|'unclassified'{
 if(note.origin==='simulated'||/\b(simulated|synthetic|fictional)\b|تخيلي|محاكاة/i.test(note.text+' '+note.source))return 'simulated'
 return note.origin==='real'?'real':'unclassified'
}
export function evidenceSummary(notes:Evidence[]){
 const direct=notes.filter(n=>evidenceOrigin(n)==='real'&&(n.kind==='Customer conversation'||n.kind==='Observation'))
 return {direct:direct.length,supports:direct.filter(n=>n.signal==='Supports').length,challenges:direct.filter(n=>n.signal==='Challenges').length,public:notes.filter(n=>n.kind==='Published source'&&evidenceOrigin(n)!=='simulated').length,simulated:notes.filter(n=>evidenceOrigin(n)==='simulated').length,unclassified:notes.filter(n=>evidenceOrigin(n)==='unclassified').length}
}
export function researchQuestions(w:Workspace,ar=false){return ar?['احكِ عن آخر مرة واجهت فيها هذه المشكلة.','كيف تعاملت معها؟ وما البدائل التي استخدمتها؟','كم استغرقت من وقتك، وما الذي دفعته إن وُجد؟','ما الذي لم يناسبك في الحل الحالي؟','بعد عرض الفكرة: ما الخطوة التي ترغب في اتخاذها؟ سجّل ما فعله الشخص فعلاً.']:[`We are exploring this problem: ${w.brief.problem.trim()||'the problem this business aims to solve'} Tell me about the last time you experienced it.`,'What did you do about it? Which alternatives did you use?','How much time did it take, and what did you actually spend?','What was unsatisfactory about the solution you used?','After showing the concept: what would you do next? Record the action taken separately from stated interest.']}
export function researchPack(w:Workspace,h:Hypothesis,ar=false){
 const intro=ar?`نبحث عن آراء ${h.test.audience||w.brief.customer||'عملاء محتملين'} حول مشكلة ندرسها. هل ترغب في محادثة قصيرة اختيارية؟ المشاركة ليست طلب شراء، ويمكنك التوقف في أي وقت.`:`We are learning from ${h.test.audience||w.brief.customer||'potential customers'} about a problem we are exploring. Would you be willing to have a short, optional conversation? This is research, not a purchase request. You can stop at any time.`
 return [ar?'# حزمة بحث العملاء':'# Customer research pack',w.brief.idea,'',ar?'## الاختبار':'## Test',h.title,`Method: ${h.test.method}`,`Audience: ${h.test.audience}`,`Decision rule: ${h.test.rule}`,'',ar?'## دعوة مقترحة للمراجعة والإرسال بنفسك':'## Invitation draft for you to review and send',intro,'',ar?'## أسئلة المقابلة':'## Interview questions',...researchQuestions(w,ar).map((q,i)=>`${i+1}. ${q}`),'',ar?'## سجل لكل مشارك':'## Record for each participant',ar?'مرجع مجهول | التاريخ | السلوك السابق | القول مقابل الفعل | النتيجة | القيود':'Anonymous reference | Date | Previous behaviour | Statement versus action | Observation | Limitations','',ar?'لم يُدعَ أي شخص تلقائياً. لا تجمع بيانات شخصية غير ضرورية. العينة لا تمثل السوق كله.':'No participants have been contacted automatically. Avoid unnecessary personal details. Your sample does not represent the whole market.'].join('\n')
}
export function evidenceReport(w:Workspace,h:Hypothesis){
 const notes=w.evidence.filter(n=>n.hypothesisId===h.id),decisions=w.decisions.filter(d=>d.hypothesisId===h.id)
 return ['# Dukkan decision record',w.brief.idea,'',`Assumption: ${h.title}`,`Method: ${h.test.method}`,`Audience: ${h.test.audience}`,`Decision rule: ${h.test.rule}`,`Founder-reported result: ${h.test.result||'Not recorded'}`,'','## Evidence',...notes.flatMap(n=>[`### ${n.source||n.id}`,`Origin: ${evidenceOrigin(n)} | Kind: ${n.kind} | Signal: ${n.signal} | Date: ${n.date}`,n.text,`Limitations: ${n.limitation||'Not recorded'}`,'']),'## Decisions',...decisions.flatMap(d=>[`${d.date} — ${d.outcome}`,d.reason,`Evidence notes captured when decided: ${d.evidence.length}`,'']),'Records are founder supplied. No independent verification or market-wide success claim is implied.'].join('\n')
}
export function setupReviewStatus(item:Workspace['setup'][number],today:string){
 const parsed=Date.parse(item.date)
 const checked=/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===item.date?parsed:NaN
 const now=Date.parse(today)
 let source=false;try{const u=new URL(item.source);source=u.protocol==='https:'||u.protocol==='http:'}catch{}
 if(!item.done)return 'unchecked' as const
 if(!item.note.trim()||!source||!Number.isFinite(checked)||checked>now)return 'incomplete' as const
 return now-checked>90*86400000?'recheck' as const:'recorded' as const
}

export function evidenceNeedsReview(w:Workspace,h:Hypothesis){
 const decision=w.decisions.filter(d=>d.hypothesisId===h.id).at(-1)
 if(!decision)return false
 const current=w.evidence.filter(n=>n.hypothesisId===h.id)
 const snapshot=(notes:Evidence[])=>JSON.stringify(notes.map(n=>({id:n.id,kind:n.kind,origin:evidenceOrigin(n),text:n.text,source:n.source,date:n.date,signal:n.signal,limitation:n.limitation})).sort((a,b)=>a.id.localeCompare(b.id)))
 return snapshot(current)!==snapshot(decision.evidence)
}
