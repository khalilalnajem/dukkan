import {useState} from 'react'
import {Check,FlaskConical} from 'lucide-react'
import {Button} from '@/components/ui/button'
import type {ChatArtifact} from '@/lib/chat-api'

type ProposedTest=NonNullable<ChatArtifact['proposedTest']>
export function TestProposal({artifact,language,adopted,onSave}:{artifact:ChatArtifact;language:'en'|'ar';adopted:boolean;onSave:(proposal:ProposedTest)=>void}){
 const [draft,setDraft]=useState<ProposedTest>(()=>({...artifact.proposedTest!}))
 const ar=language==='ar'
 if(!artifact.proposedTest)return null
 return <section className="dukkan-test-proposal"><div><FlaskConical size={17}/><h3>{ar?'حوّل المقترح إلى اختبار':'Turn this proposal into a test'}</h3></div><p>{ar?'اقرأ الحقول وعدّلها بنفسك. حفظ الخطة لا يعني أن الاختبار أُجري أو أن الفكرة ثبتت.':'Review and edit each field yourself. Saving a plan does not mean the test happened or proved the idea.'}</p>{adopted?<p className="dukkan-proposal-saved"><Check size={15}/>{ar?'خطة اختبار محفوظة من هذه المسودة':'Test plan saved from this draft'}</p>:<form onSubmit={event=>{event.preventDefault();onSave(draft)}}>{([['hypothesis',ar?'ما الافتراض؟':'What is the assumption?'],['method',ar?'كيف ستختبره؟':'How will you test it?'],['audience',ar?'من ستسأل؟':'Who will you ask?'],['decisionRule',ar?'كيف ستقرر بعد النتيجة؟':'What result changes your decision?']] as const).map(([field,label])=><label key={field}>{label}<textarea dir="auto" rows={2} value={draft[field]} onChange={event=>setDraft({...draft,[field]:event.target.value})}/></label>)}<Button type="submit" disabled={Object.values(draft).some(value=>!value.trim())}><Check size={15}/>{ar?'احفظ خطة الاختبار':'Save test plan'}</Button></form>}</section>
}
