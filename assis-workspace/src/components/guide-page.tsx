import type {BusinessArea} from '@/lib/workspaces'
import {Button} from '@/components/ui/button'
import {ArrowUpRight,BookOpenCheck,ChartNoAxesCombined,Check,ClipboardList,FileCheck2,FlaskConical,History,Lightbulb,Library,MessageSquareText,Plus,Route,Scale,ShieldCheck,Users,WalletCards} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import './guide-page.css'

type Page=BusinessArea|'home'|'work'|'roadmap'|'estimates'|'saved'|'about'|'guide'|'evidence'|'phases'
type Language='en'|'ar'
type Action={kind:'ask';intent?:'idea'|'choice'|'test'|'result'|'decision';prompt:string}|{kind:'go';page:Page}|{kind:'new'}
type Step={icon:LucideIcon;title:string;detail:string;cta:string;action:Action}
type Props={language:Language;demo:boolean;hasIdea:boolean;onNavigate:(page:Page)=>void;onAsk:(prompt:string,intent?:'idea'|'choice'|'test'|'result'|'decision')=>void;onOpenExample:()=>void;onNewIdea:()=>void}

const copy={
 en:{kicker:'A founder’s guide',title:'From idea to a business you can run',intro:'Work through one clear loop. Evidence, tests, decisions and records stay together as your business changes.',example:'Open the sample business',exampleCurrent:'Sample business open',newIdea:'Enter your idea',flow:'Your working journey',journey:'Eight steps, one business record',needIdea:'Start an idea or open the sample business to use these steps.',step1:'Enter your idea',detail1:'Describe what you offer, who it helps and how it earns money.',cta1:'Enter an idea',step2:'Stress test with evidence',detail2:'Check assumptions against Kuwait market sources and see what remains unknown.',cta2:'Review my idea',step3:'Choose a response',detail3:'Choose to test, revise or pause, and keep the reason with the critique.',cta3:'Choose what to do',step4:'Plan a small test',detail4:'Set the audience, method and result that would change your mind.',cta4:'Plan a test',step5:'Record the actual result',detail5:'After the test, record what happened and where the evidence came from.',cta5:'Record a result',step6:'Decide what comes next',detail6:'Use the result to continue, change direction or stop; save the decision.',cta6:'Record a decision',step7:'Work through the costs',detail7:'Compare named KWD scenarios. Estimates stay separate from actual money.',cta7:'Open costs',step8:'Prepare documents and keep records',detail8:'Review document drafts, then keep customer, finance and operating records in the same business.',cta8:'Open documents',more:'Open records',finance:'Finance',sales:'Customers and sales',people:'People',operations:'Operations',saved:'Saved records',trust:'Built around reviewable work',evidence:'Kuwait sources keep their publisher, date and limits.',approval:'You review proposals before they become records.',history:'Decisions and document versions stay together.',boundaries:'Preparation does not mean eligibility or submission.',openEvidence:'Browse the evidence',openPhases:'See what is planned'},
 ar:{kicker:'دليل المؤسس',title:'من الفكرة إلى مشروع تديره',intro:'اتبع مساراً واضحاً. تبقى الأدلة والاختبارات والقرارات والسجلات معاً مع تطور مشروعك.',example:'افتح المشروع التجريبي',exampleCurrent:'المشروع التجريبي مفتوح',newIdea:'أدخل فكرتك',flow:'مسار عملك',journey:'ثماني خطوات وسجل واحد للمشروع',needIdea:'ابدأ فكرة أو افتح المشروع التجريبي لاستخدام هذه الخطوات.',step1:'أدخل فكرتك',detail1:'اشرح ما تقدمه، ولمن، وكيف يحقق دخلاً.',cta1:'أدخل فكرة',step2:'اختبر الفكرة بالأدلة',detail2:'قارن الافتراضات بمصادر السوق الكويتي واعرف ما لا يزال مجهولاً.',cta2:'راجع فكرتي',step3:'اختر ما ستفعله',detail3:'اختر الاختبار أو التعديل أو التوقف، واحتفظ بالسبب مع النقد.',cta3:'اختر الخطوة التالية',step4:'خطط اختباراً صغيراً',detail4:'حدد الجمهور والطريقة والنتيجة التي قد تغيّر رأيك.',cta4:'خطط اختباراً',step5:'سجّل النتيجة الفعلية',detail5:'بعد الاختبار، سجّل ما حدث ومصدر الدليل.',cta5:'سجّل نتيجة',step6:'قرر الخطوة التالية',detail6:'استخدم النتيجة للاستمرار أو تغيير الاتجاه أو التوقف، ثم سجّل القرار.',cta6:'سجّل قراراً',step7:'راجع التكاليف',detail7:'قارن سيناريوهات مسماة بالدينار الكويتي. تبقى التقديرات منفصلة عن المال الفعلي.',cta7:'افتح التكاليف',step8:'جهّز المستندات واحتفظ بالسجلات',detail8:'راجع مسودات المستندات، ثم احتفظ بسجلات العملاء والمالية والتشغيل في المشروع نفسه.',cta8:'افتح المستندات',more:'افتح السجلات',finance:'المالية',sales:'العملاء والمبيعات',people:'الأشخاص',operations:'العمليات',saved:'السجلات المحفوظة',trust:'عمل واضح وقابل للمراجعة',evidence:'تحتفظ مصادر الكويت بناشرها وتاريخها وحدودها.',approval:'تراجع المقترحات قبل أن تصبح سجلات.',history:'تبقى القرارات ونسخ المستندات معاً.',boundaries:'الإعداد لا يعني الأهلية أو التقديم.',openEvidence:'تصفح الأدلة',openPhases:'اعرف ما هو مخطط'}
}

const steps:Record<Language,Step[]>={
 en:[
  {icon:Lightbulb,title:copy.en.step1,detail:copy.en.detail1,cta:copy.en.cta1,action:{kind:'new'}},
  {icon:ChartNoAxesCombined,title:copy.en.step2,detail:copy.en.detail2,cta:copy.en.cta2,action:{kind:'ask',intent:'idea',prompt:'Stress test my saved business idea against relevant Kuwait market evidence. Cite the sources and dates, separate evidence from assumptions, identify the most important unknowns, and suggest practical options. Do not describe the evidence-readiness score as a probability of success.'}},
  {icon:Scale,title:copy.en.step3,detail:copy.en.detail3,cta:copy.en.cta3,action:{kind:'ask',intent:'choice',prompt:'Help me choose a response to the critique of my saved idea: test it, revise it, or pause it. Explain the trade-offs, ask which choice I make, then propose a decision record that keeps my reason beside the critique. Do not save until I review it.'}},
  {icon:FlaskConical,title:copy.en.step4,detail:copy.en.detail4,cta:copy.en.cta4,action:{kind:'ask',intent:'test',prompt:'Propose a small test for the riskiest assumption in my saved idea. Include the audience, method, question, sample size and a decision rule set before the test. Keep customer contact and the test itself for me to carry out.'}},
  {icon:ClipboardList,title:copy.en.step5,detail:copy.en.detail5,cta:copy.en.cta5,action:{kind:'ask',intent:'result',prompt:'Help me record the result of a test for my saved idea. First ask whether it took place. Use only my supplied observations to record the actual result, date, source or notes, and what happened against the decision rule. Ask for missing facts, keep assumptions separate, and label the result simulated if no real test took place. Propose a record for me to review.'}},
  {icon:Check,title:copy.en.step6,detail:copy.en.detail6,cta:copy.en.cta6,action:{kind:'ask',intent:'decision',prompt:'Help me decide what to do next using the saved test plan and its recorded result. Show how the result compares with the advance decision rule, ask whether I will continue, revise or stop, and propose a decision record for review.'}},
  {icon:WalletCards,title:copy.en.step7,detail:copy.en.detail7,cta:copy.en.cta7,action:{kind:'go',page:'estimates'}},
  {icon:FileCheck2,title:copy.en.step8,detail:copy.en.detail8,cta:copy.en.cta8,action:{kind:'go',page:'licences'}},
 ],
 ar:[
  {icon:Lightbulb,title:copy.ar.step1,detail:copy.ar.detail1,cta:copy.ar.cta1,action:{kind:'new'}},
  {icon:ChartNoAxesCombined,title:copy.ar.step2,detail:copy.ar.detail2,cta:copy.ar.cta2,action:{kind:'ask',intent:'idea',prompt:'اختبر فكرة مشروعي المحفوظة مقابل أدلة السوق الكويتي ذات الصلة. اذكر المصادر والتواريخ، وافصل الدليل عن الافتراضات، وحدد أهم المجهولات والخيارات العملية. لا تصف درجة جاهزية الأدلة بأنها احتمال للنجاح.'}},
  {icon:Scale,title:copy.ar.step3,detail:copy.ar.detail3,cta:copy.ar.cta3,action:{kind:'ask',intent:'choice',prompt:'ساعدني على اختيار استجابة لنقد فكرتي المحفوظة: اختبارها أو تعديلها أو التوقف عنها. وضح المفاضلات واسألني عن اختياري، ثم اقترح سجل قرار يحتفظ بالسبب بجانب النقد. لا تحفظ شيئاً قبل أن أراجعه.'}},
  {icon:FlaskConical,title:copy.ar.step4,detail:copy.ar.detail4,cta:copy.ar.cta4,action:{kind:'ask',intent:'test',prompt:'اقترح اختباراً صغيراً لأخطر افتراض في فكرتي المحفوظة. حدد الجمهور والطريقة والسؤال وحجم العينة وقاعدة قرار تُحدد قبل الاختبار. اترك التواصل مع العملاء وتنفيذ الاختبار لي.'}},
  {icon:ClipboardList,title:copy.ar.step5,detail:copy.ar.detail5,cta:copy.ar.cta5,action:{kind:'ask',intent:'result',prompt:'ساعدني على تسجيل نتيجة اختبار لفكرتي المحفوظة. اسأل أولاً إن كان الاختبار قد نُفّذ، واستخدم الملاحظات التي أقدمها فقط لتسجيل النتيجة الفعلية وتاريخها ومصدرها أو ملاحظاتها وما حدث مقارنة بقاعدة القرار. اسأل عن الحقائق الناقصة وافصل الافتراضات وسمّ النتيجة محاكاة إذا لم يحدث اختبار حقيقي. اقترح سجلاً أراجعه.'}},
  {icon:Check,title:copy.ar.step6,detail:copy.ar.detail6,cta:copy.ar.cta6,action:{kind:'ask',intent:'decision',prompt:'ساعدني على اتخاذ الخطوة التالية بناءً على خطة الاختبار المحفوظة ونتيجته المسجلة. وضح مقارنة النتيجة بقاعدة القرار المحددة مسبقاً، واسألني إن كنت سأستمر أو أعدّل أو أتوقف، ثم اقترح سجل قرار للمراجعة.'}},
  {icon:WalletCards,title:copy.ar.step7,detail:copy.ar.detail7,cta:copy.ar.cta7,action:{kind:'go',page:'estimates'}},
  {icon:FileCheck2,title:copy.ar.step8,detail:copy.ar.detail8,cta:copy.ar.cta8,action:{kind:'go',page:'licences'}},
 ]
}

const recordLinks:{page:Page;key:'finance'|'sales'|'people'|'operations'|'saved';icon:LucideIcon}[]=[
 {page:'finance',key:'finance',icon:WalletCards},{page:'sales',key:'sales',icon:Users},{page:'people',key:'people',icon:Users},{page:'operations',key:'operations',icon:ClipboardList},{page:'saved',key:'saved',icon:History}
]

export function GuidePage({language,demo,hasIdea,onNavigate,onAsk,onOpenExample,onNewIdea}:Props){
 const t=copy[language],ready=hasIdea||demo
 function run(action:Action){
  if(action.kind==='new'){onNewIdea();return}
  if(!ready){onNewIdea();return}
  if(action.kind==='ask')onAsk(action.prompt,action.intent);else onNavigate(action.page)
 }
 return <main className="dukkan-guide" lang={language} dir={language==='ar'?'rtl':'ltr'}>
  <header className="dukkan-guide-intro">
   <span className="dukkan-kicker">{t.kicker}</span>
   <h1>{t.title}</h1>
   <p>{t.intro}</p>
   <div className="dukkan-guide-actions">
    <Button onClick={onOpenExample} aria-current={demo?'true':undefined}><BookOpenCheck size={17} aria-hidden="true"/>{demo?t.exampleCurrent:t.example}</Button>
    <Button variant="outline" onClick={onNewIdea}><Plus size={17} aria-hidden="true"/>{t.newIdea}</Button>
   </div>
   {!ready&&<p className="dukkan-guide-note" role="note">{t.needIdea}</p>}
  </header>

  <section className="dukkan-guide-section" aria-labelledby="guide-journey-title">
   <div className="dukkan-guide-heading"><span className="dukkan-kicker">{t.flow}</span><h2 id="guide-journey-title">{t.journey}</h2></div>
   <ol className="dukkan-guide-journey">
    {steps[language].map((step,index)=>{const Icon=step.icon;return <li key={step.title}>
     <span className="dukkan-guide-step-icon" aria-hidden="true"><Icon size={19}/></span>
     <div className="dukkan-guide-step-copy"><span className="dukkan-guide-number">{String(index+1).padStart(2,'0')}</span><h3>{step.title}</h3><p>{step.detail}</p>
      <button className="dukkan-guide-cta" type="button" onClick={()=>run(step.action)}>{step.cta}<ArrowUpRight size={15} aria-hidden="true"/></button>
      {index===7&&<nav className="dukkan-guide-records" aria-label={t.more}>{recordLinks.map(({page,key,icon:RecordIcon})=><button key={page} type="button" onClick={()=>run({kind:'go',page})}><RecordIcon size={14} aria-hidden="true"/>{t[key]}</button>)}</nav>}
     </div>
    </li>})}
   </ol>
  </section>

  <section className="dukkan-guide-trust" aria-label={t.trust}>
   <h2>{t.trust}</h2>
   <ul>
    <li><Library size={17} aria-hidden="true"/><span>{t.evidence}</span></li>
    <li><ShieldCheck size={17} aria-hidden="true"/><span>{t.approval}</span></li>
    <li><History size={17} aria-hidden="true"/><span>{t.history}</span></li>
    <li><MessageSquareText size={17} aria-hidden="true"/><span>{t.boundaries}</span></li>
   </ul>
   <div className="dukkan-guide-actions">
    <Button variant="outline" onClick={()=>onNavigate('evidence')}><Library size={16} aria-hidden="true"/>{t.openEvidence}</Button>
    <Button variant="outline" onClick={()=>onNavigate('phases')}><Route size={16} aria-hidden="true"/>{t.openPhases}</Button>
   </div>
  </section>
 </main>
}
