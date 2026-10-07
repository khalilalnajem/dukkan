import type {BusinessArea} from '@/lib/workspaces'
import {Button} from '@/components/ui/button'
import {ArrowRight,BookOpenCheck,ClipboardCheck,Link2,ShieldCheck,Ban,ListChecks,History,Square,PanelRight,FileSearch,Library,Route,Sparkles,Plus,ChevronRight} from 'lucide-react'
import './guide-page.css'

type Page=BusinessArea|'home'|'work'|'roadmap'|'estimates'|'saved'|'about'|'guide'|'evidence'|'phases'
type Language='en'|'ar'
type Props={language:Language;demo:boolean;hasIdea:boolean;onNavigate:(page:Page)=>void;onAsk:(prompt:string)=>void;onOpenExample:()=>void;onNewIdea:()=>void}
type Step={title:string;you:string;dukkan:string;get:string;cta:string;action:{kind:'ask';prompt:string}|{kind:'go';page:Page}}
type Item={icon:typeof ArrowRight;title:string;body:string}

const copy={
 en:{
  kicker:'Guide',
  title:'How Dukkan works',
  intro:'Describe an idea in chat, test it against Kuwait evidence, then keep every plan, document and record in one reviewed business.',
  example:'Open the worked example',exampleCurrent:'Worked example (open now)',newIdea:'Start your own idea',
  needIdea:'Step buttons need an open idea. Start one or open the example first.',
  flowKicker:'The flow',flowTitle:'Six steps from idea to operating business',
  you:'You do',dukkan:'Dukkan does',get:'You get',
  more:'Also',
  readingKicker:'Reading the agent’s work',readingTitle:'What you will meet in chat',
  whyKicker:'Why Dukkan is different',whyTitle:'Where the advantage is',
  evidence:'Open the evidence library',phases:'See the next phases',
  notKicker:'Boundaries',notTitle:'What Dukkan will not do',
 },
 ar:{
  kicker:'الدليل',
  title:'كيف يعمل دكان',
  intro:'اشرح فكرتك في المحادثة، واختبرها مقابل أدلة السوق الكويتي، ثم احتفظ بكل خطة ومستند وسجل في مشروع واحد مُراجَع.',
  example:'افتح المثال العملي',exampleCurrent:'المثال العملي (مفتوح الآن)',newIdea:'ابدأ فكرتك',
  needIdea:'تحتاج أزرار الخطوات إلى فكرة مفتوحة. ابدأ فكرة أو افتح المثال أولاً.',
  flowKicker:'المسار',flowTitle:'ست خطوات من الفكرة إلى مشروع يعمل',
  you:'أنت تفعل',dukkan:'دكان يفعل',get:'تحصل على',
  more:'أيضاً',
  readingKicker:'قراءة عمل الوكيل',readingTitle:'ما ستقابله في المحادثة',
  whyKicker:'لماذا دكان مختلف',whyTitle:'أين تكمن الميزة',
  evidence:'افتح مكتبة الأدلة',phases:'اعرض المراحل القادمة',
  notKicker:'الحدود',notTitle:'ما لا يفعله دكان',
 },
}

const steps:Record<Language,Step[]>={
 en:[
  {title:'Describe your idea in chat',you:'Say what you sell, to whom, and why they would pay. Plain words are enough.',dukkan:'Asks for what is missing and saves the brief as a business record.',get:'A saved idea brief that every later step builds on.',cta:'Describe my idea',action:{kind:'ask',prompt:'I want to describe my business idea. Ask me what you need to understand it: what it is, who it is for, what problem it solves and how it would earn money. Then propose the brief for me to save.'}},
  {title:'Get a candid critique',you:'Read the critique, then choose Test, Revise or Park.',dukkan:'Scores evidence readiness out of 20, names the weak assumptions and cites Kuwait sources where they exist.',get:'A recorded decision with the reasons kept beside it.',cta:'Critique my idea',action:{kind:'ask',prompt:'Give me a candid critique of my saved idea with an evidence-readiness score out of 20. Name the weakest assumptions, cite Kuwait sources where they exist, and offer Test, Revise or Park.'}},
  {title:'Plan a small customer test',you:'Pick one assumption, run the test, then record what happened.',dukkan:'Proposes a test small enough to run this week, with the pass condition set in advance.',get:'A saved test plan and result that move the readiness score.',cta:'Plan a customer test',action:{kind:'ask',prompt:'Propose one small customer test for my riskiest assumption. Include who to talk to, how many, the question to ask and the pass condition. Keep it small enough to run this week.'}},
  {title:'Plan costs',you:'Enter price, unit cost and fixed costs, or let the chat draft them.',dukkan:'Calculates break-even and keeps named scenarios you can compare.',get:'Cost scenarios marked as estimates until real figures replace them.',cta:'Open costs',action:{kind:'go',page:'estimates'}},
  {title:'Prepare official documents',you:'Confirm the facts, review each field, then download.',dukkan:'Fills the real KDIPA PDF from confirmed facts and keeps every version.',get:'A reviewed PDF you submit yourself. Dukkan submits nothing.',cta:'Prepare a PDF',action:{kind:'ask',prompt:'Prepare the official PDF for my business from the facts already saved. Show which fields you can fill and which are still missing, and keep a version I can review before downloading.'}},
  {title:'Run the business',you:'Record what happens: money, customers, hires, suppliers, licences.',dukkan:'Keeps each record typed and marked actual, estimate or simulated.',get:'One connected business record you can search, export and revisit.',cta:'Open finance',action:{kind:'go',page:'finance'}},
 ],
 ar:[
  {title:'اشرح فكرتك في المحادثة',you:'قل ماذا تبيع، ولمن، ولماذا سيدفعون. الكلمات البسيطة تكفي.',dukkan:'يسأل عما ينقص ويحفظ الملخص كسجل للمشروع.',get:'ملخص فكرة محفوظ تبني عليه كل خطوة لاحقة.',cta:'اشرح فكرتي',action:{kind:'ask',prompt:'أريد شرح فكرة مشروعي. اسألني عما تحتاجه لفهمها: ما هي، لمن، أي مشكلة تحل، وكيف ستكسب المال. ثم اقترح الملخص لأحفظه.'}},
  {title:'احصل على نقد صريح',you:'اقرأ النقد ثم اختر: اختبر، أو عدّل، أو أوقف.',dukkan:'يقيّم جاهزية الأدلة من 20، ويسمّي الافتراضات الضعيفة، ويستشهد بمصادر كويتية حيث توجد.',get:'قرار مسجّل مع أسبابه بجانبه.',cta:'انقد فكرتي',action:{kind:'ask',prompt:'قدّم نقداً صريحاً لفكرتي المحفوظة مع درجة جاهزية الأدلة من 20. سمِّ أضعف الافتراضات، واستشهد بمصادر كويتية حيث توجد، ثم اعرض خيارات: اختبر، أو عدّل، أو أوقف.'}},
  {title:'خطط اختباراً صغيراً مع العملاء',you:'اختر افتراضاً واحداً، نفّذ الاختبار، ثم سجّل ما حدث.',dukkan:'يقترح اختباراً صغيراً يمكن تنفيذه هذا الأسبوع، مع شرط نجاح محدد مسبقاً.',get:'خطة اختبار ونتيجة محفوظتان تغيّران درجة الجاهزية.',cta:'خطط اختباراً',action:{kind:'ask',prompt:'اقترح اختباراً صغيراً واحداً لأخطر افتراض في فكرتي. حدد من أكلّم، وكم عددهم، والسؤال الذي أطرحه، وشرط النجاح. اجعله صغيراً بما يكفي لتنفيذه هذا الأسبوع.'}},
  {title:'خطط التكاليف',you:'أدخل السعر وتكلفة الوحدة والتكاليف الثابتة، أو دع المحادثة تسوّدها.',dukkan:'يحسب نقطة التعادل ويحتفظ بسيناريوهات مسماة يمكنك مقارنتها.',get:'سيناريوهات تكاليف موسومة كتقديرات حتى تحل الأرقام الفعلية محلها.',cta:'افتح التكاليف',action:{kind:'go',page:'estimates'}},
  {title:'جهّز المستندات الرسمية',you:'أكّد المعطيات، راجع كل حقل، ثم نزّل الملف.',dukkan:'يملأ نموذج هيئة تشجيع الاستثمار الفعلي من معطيات مؤكدة ويحتفظ بكل نسخة.',get:'ملف PDF مُراجَع تقدّمه بنفسك. دكان لا يقدّم شيئاً.',cta:'جهّز PDF',action:{kind:'ask',prompt:'جهّز نموذج PDF الرسمي لمشروعي من المعطيات المحفوظة. أظهر الحقول التي يمكنك ملؤها والحقول الناقصة، واحتفظ بنسخة أراجعها قبل التنزيل.'}},
  {title:'شغّل المشروع',you:'سجّل ما يحدث: المال، العملاء، التوظيف، الموردون، التراخيص.',dukkan:'يحفظ كل سجل بنوعه موسوماً: فعلي، أو تقدير، أو محاكاة.',get:'سجل مشروع واحد مترابط يمكنك البحث فيه وتصديره والعودة إليه.',cta:'افتح المالية',action:{kind:'go',page:'finance'}},
 ],
}

const areaLinks:{page:Page;en:string;ar:string}[]=[
 {page:'sales',en:'Customers and sales',ar:'العملاء والمبيعات'},
 {page:'people',en:'People',ar:'الأشخاص'},
 {page:'operations',en:'Operations',ar:'العمليات'},
 {page:'licences',en:'Licences',ar:'التراخيص'},
 {page:'saved',en:'Saved work',ar:'العمل المحفوظ'},
]

const reading:Record<Language,Item[]>={
 en:[
  {icon:ClipboardCheck,title:'Proposed changes card',body:'When the agent wants to change your record it shows a card. Save changes writes it, Edit details lets you correct fields first, Discuss sends it back to chat without saving.'},
  {icon:FileSearch,title:'N sources',body:'The sources disclosure under an answer opens every citation used: publisher, period and page.'},
  {icon:ListChecks,title:'Activity trace',body:'Activity lists which tools ran on the turn, so you can see whether it searched, read a record or filled a form.'},
  {icon:History,title:'Version history',body:'Documents keep every version. Open an earlier one, compare, and restore if needed.'},
  {icon:Square,title:'Stop',body:'Stop halts the current turn. Nothing partial is saved.'},
  {icon:PanelRight,title:'Documents & work',body:'The right sidebar has three tabs: Records for saved facts, Active work for open tasks and documents, Costs for scenarios.'},
 ],
 ar:[
  {icon:ClipboardCheck,title:'بطاقة التغييرات المقترحة',body:'عندما يريد الوكيل تغيير سجلك يعرض بطاقة. حفظ التغييرات يكتبها، وتعديل التفاصيل يتيح تصحيح الحقول أولاً، وناقش يعيدها إلى المحادثة دون حفظ.'},
  {icon:FileSearch,title:'المصادر',body:'قائمة المصادر أسفل الإجابة تفتح كل استشهاد مستخدم: الناشر والفترة والصفحة.'},
  {icon:ListChecks,title:'سجل النشاط',body:'النشاط يعرض الأدوات التي عملت في هذه الجولة، فترى هل بحث أو قرأ سجلاً أو ملأ نموذجاً.'},
  {icon:History,title:'سجل النسخ',body:'تحتفظ المستندات بكل نسخة. افتح نسخة سابقة وقارن واستعدها عند الحاجة.'},
  {icon:Square,title:'إيقاف',body:'إيقاف يوقف الجولة الحالية. لا يُحفظ أي شيء ناقص.'},
  {icon:PanelRight,title:'المستندات والعمل',body:'شريط المستندات الجانبي فيه ثلاثة تبويبات: السجل للمعطيات المحفوظة، والعمل للمهام والمستندات المفتوحة، والتكاليف للسيناريوهات.'},
 ],
}

const why:Record<Language,Item[]>={
 en:[
  {icon:BookOpenCheck,title:'Kuwait evidence with provenance',body:'44 sources and 1,130 passages across market statistics, surveys and official law. Every citation shows publisher, period and page.'},
  {icon:ShieldCheck,title:'Review before save',body:'The agent proposes, you approve. Nothing is sent, ordered, hired or submitted by itself.'},
  {icon:Link2,title:'Decisions connected to records',body:'Critique, test, decision, plan, document and operating records stay linked in one business.'},
  {icon:Sparkles,title:'Honest boundaries',body:'It abstains when the sources do not support an answer. It never claims eligibility or a success probability.'},
 ],
 ar:[
  {icon:BookOpenCheck,title:'أدلة كويتية بمصدرها',body:'44 مصدراً و1,130 مقطعاً تشمل إحصاءات السوق والاستبيانات والقانون الرسمي. كل استشهاد يعرض الناشر والفترة والصفحة.'},
  {icon:ShieldCheck,title:'مراجعة قبل الحفظ',body:'الوكيل يقترح وأنت توافق. لا يُرسل أو يُطلب أو يُوظَّف أو يُقدَّم شيء من تلقاء نفسه.'},
  {icon:Link2,title:'قرارات مرتبطة بالسجلات',body:'النقد والاختبار والقرار والخطة والمستند وسجلات التشغيل تبقى مترابطة في مشروع واحد.'},
  {icon:Sparkles,title:'حدود صادقة',body:'يمتنع عندما لا تدعم المصادر الإجابة. لا يدّعي الأهلية ولا احتمال النجاح أبداً.'},
 ],
}

const willNot:Record<Language,string[]>={
 en:['Submit anything to a government portal.','Send email on its own.','Confirm legal eligibility.','Give a probability of success.'],
 ar:['تقديم أي شيء إلى بوابة حكومية.','إرسال بريد إلكتروني من تلقاء نفسه.','تأكيد الأهلية القانونية.','إعطاء احتمال للنجاح.'],
}

export function GuidePage({language,demo,hasIdea,onNavigate,onAsk,onOpenExample,onNewIdea}:Props){
 const t=copy[language],ready=hasIdea||demo
 // Without an open idea the chat and record areas are empty, so the step buttons start one instead.
 function run(action:Step['action']){if(!ready){onNewIdea();return}if(action.kind==='ask')onAsk(action.prompt);else onNavigate(action.page)}
 return <div className="dukkan-guide">
  <header className="dukkan-guide-intro">
   <span className="dukkan-kicker">{t.kicker}</span>
   <h1>{t.title}</h1>
   <p>{t.intro}</p>
   <div className="dukkan-guide-actions">
    <Button onClick={onOpenExample} aria-current={demo?'true':undefined}><BookOpenCheck size={17}/>{demo?t.exampleCurrent:t.example}</Button>
    <Button variant="outline" onClick={onNewIdea}><Plus size={17}/>{t.newIdea}</Button>
   </div>
   {!ready&&<small className="dukkan-guide-note">{t.needIdea}</small>}
  </header>

  <section className="dukkan-guide-section" aria-labelledby="guide-flow">
   <div className="dukkan-guide-heading"><span className="dukkan-kicker">{t.flowKicker}</span><h2 id="guide-flow">{t.flowTitle}</h2></div>
   <ol className="dukkan-guide-steps">
    {steps[language].map((step,index)=><li key={step.title}><article className="dukkan-guide-card">
     <span className="dukkan-guide-number">{String(index+1).padStart(2,'0')}</span>
     <h3>{step.title}</h3>
     <dl>
      <div><dt>{t.you}</dt><dd>{step.you}</dd></div>
      <div><dt>{t.dukkan}</dt><dd>{step.dukkan}</dd></div>
      <div><dt>{t.get}</dt><dd>{step.get}</dd></div>
     </dl>
     <button className="dukkan-guide-cta" onClick={()=>run(step.action)}>{step.cta}<ChevronRight className="dukkan-chevron-forward" size={15}/></button>
     {index===5&&<p className="dukkan-guide-links"><span>{t.more}</span>{areaLinks.map(link=><button key={link.page} onClick={()=>run({kind:'go',page:link.page})}>{language==='ar'?link.ar:link.en}</button>)}</p>}
    </article></li>)}
   </ol>
  </section>

  <section className="dukkan-guide-section" aria-labelledby="guide-reading">
   <div className="dukkan-guide-heading"><span className="dukkan-kicker">{t.readingKicker}</span><h2 id="guide-reading">{t.readingTitle}</h2></div>
   <ul className="dukkan-guide-reading">
    {reading[language].map(({icon:Icon,title,body})=><li key={title}><Icon size={18}/><div><strong>{title}</strong><p>{body}</p></div></li>)}
   </ul>
  </section>

  <section className="dukkan-guide-section" aria-labelledby="guide-why">
   <div className="dukkan-guide-heading"><span className="dukkan-kicker">{t.whyKicker}</span><h2 id="guide-why">{t.whyTitle}</h2></div>
   <div className="dukkan-guide-why">
    {why[language].map(({icon:Icon,title,body})=><article className="dukkan-guide-card" key={title}><Icon size={20}/><h3>{title}</h3><p>{body}</p></article>)}
   </div>
   <div className="dukkan-guide-actions">
    <Button variant="outline" onClick={()=>onNavigate('evidence')}><Library size={16}/>{t.evidence}</Button>
    <Button variant="outline" onClick={()=>onNavigate('phases')}><Route size={16}/>{t.phases}</Button>
   </div>
  </section>

  <section className="dukkan-guide-section dukkan-guide-boundary" aria-labelledby="guide-not">
   <div className="dukkan-guide-heading"><span className="dukkan-kicker">{t.notKicker}</span><h2 id="guide-not">{t.notTitle}</h2></div>
   <ul className="dukkan-guide-not">
    {willNot[language].map(line=><li key={line}><Ban size={15}/>{line}</li>)}
   </ul>
  </section>
 </div>
}
