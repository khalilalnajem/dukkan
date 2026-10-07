import type {ReactNode} from 'react'
import {useId} from 'react'
import {Check,ChevronDown,ChevronRight,Eye,Flag,LockKeyhole,Pause,Unplug} from 'lucide-react'
import type {BusinessArea} from '@/lib/workspaces'
import {Button} from '@/components/ui/button'
import './next-phases.css'

type Page=BusinessArea|'home'|'work'|'roadmap'|'estimates'|'saved'|'about'|'guide'|'evidence'|'phases'
type Lang='en'|'ar'
type Text=Record<Lang,string>

const t=(language:Lang,text:Text)=>text[language]
const money=new Intl.NumberFormat('en-GB',{minimumFractionDigits:3,maximumFractionDigits:3})
const kwd=(language:Lang,value:number)=>`${money.format(value)} ${language==='ar'?'د.ك':'KWD'}`

const revenue:{month:Text;value:number}[]=[
 {month:{en:'Apr',ar:'أبريل'},value:1180.25},
 {month:{en:'May',ar:'مايو'},value:1342},
 {month:{en:'Jun',ar:'يونيو'},value:1095.75},
 {month:{en:'Jul',ar:'يوليو'},value:1488.5},
 {month:{en:'Aug',ar:'أغسطس'},value:1610},
 {month:{en:'Sep',ar:'سبتمبر'},value:1732.25}
]

function PreviewLabel({language}:{language:Lang}){
 return <span className="dukkan-phases-preview"><Eye size={12} aria-hidden="true"/>{language==='ar'?'معاينة ببيانات تجريبية · غير متصل':'Preview with sample data · not connected'}</span>
}

function RevenueChart({language}:{language:Lang}){
 const id=useId()
 const width=360,height=196,top=24,bottom=30,left=44,right=8,max=2000
 const plotH=height-top-bottom,plotW=width-left-right,slot=plotW/revenue.length,barW=slot*0.54
 const y=(v:number)=>top+plotH*(1-v/max)
 const ticks=[0,500,1000,1500,2000]
 const total=revenue.reduce((sum,row)=>sum+row.value,0)
 const title=language==='ar'?'الإيراد الشهري، ستة أشهر، بيانات تجريبية':'Monthly revenue, six months, sample data'
 const desc=revenue.map(row=>`${t(language,row.month)} ${kwd(language,row.value)}`).join(', ')+`. ${language==='ar'?'المجموع':'Total'} ${kwd(language,total)}.`
 return <svg className="dukkan-mock-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
  <title id={`${id}-title`}>{title}</title>
  <desc id={`${id}-desc`}>{desc}</desc>
  {ticks.map(tick=><g key={tick}>
   <line className="grid" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/>
   <text x={left-6} y={y(tick)+3.5} fontSize="9.5" textAnchor="end">{tick.toLocaleString('en-GB')}</text>
  </g>)}
  {revenue.map((row,index)=>{
   const x=left+slot*index+(slot-barW)/2,h=plotH*(row.value/max)
   return <g key={row.month.en}>
    <rect className="bar" x={x} y={y(row.value)} width={barW} height={h} rx="2"/>
    <text className="value" x={x+barW/2} y={y(row.value)-6} fontSize="9" textAnchor="middle">{money.format(row.value)}</text>
    <text x={x+barW/2} y={height-10} fontSize="10" textAnchor="middle">{t(language,row.month)}</text>
   </g>
  })}
 </svg>
}

function Phase({language,number,title,outcome,exists,existsLabel,existsPage,adds,why,mockTitle,mockSub,children,onNavigate}:{
 language:Lang;number:number;title:Text;outcome:Text;exists:Text;existsLabel:Text;existsPage:Page;adds:Text;why:[Text,Text,Text];mockTitle:Text;mockSub:Text;children:ReactNode;onNavigate:(page:Page)=>void
}){
 const whyLabels:Text[]=[{en:'For the founder',ar:'للمؤسس'},{en:'For the judge',ar:'للمحكّم'},{en:'For defensibility',ar:'لقابلية الدفاع'}]
 return <section className="dukkan-phase" aria-labelledby={`phase-${number}`}>
  <div className="dukkan-phase-head">
   <span>{language==='ar'?`المرحلة ${number}`:`Phase ${number}`}</span>
   <h2 id={`phase-${number}`}>{t(language,title)}</h2>
   <p>{t(language,outcome)}</p>
  </div>
  <div className="dukkan-phase-status">
   <div>
    <span className="dukkan-kicker">{language==='ar'?'موجود اليوم':'Exists today'}</span>
    <p>{t(language,exists)}</p>
    <button type="button" className="dukkan-phases-link" onClick={()=>onNavigate(existsPage)}>{t(language,existsLabel)}<ChevronRight size={13} className="dukkan-chevron-forward" aria-hidden="true"/></button>
   </div>
   <div>
    <span className="dukkan-kicker">{language==='ar'?'تضيفه هذه المرحلة':'This phase adds'}</span>
    <p>{t(language,adds)}</p>
   </div>
  </div>
  <div className="dukkan-mock" aria-label={language==='ar'?'معاينة ببيانات تجريبية':'Preview with sample data'}>
   <div className="dukkan-mock-bar"><strong>{t(language,mockTitle)}<small>{t(language,mockSub)}</small></strong><PreviewLabel language={language}/></div>
   <div className="dukkan-mock-body">{children}</div>
  </div>
  <dl className="dukkan-why">
   {why.map((line,index)=><div key={whyLabels[index].en}><dt>{t(language,whyLabels[index])}</dt><dd>{t(language,line)}</dd></div>)}
  </dl>
 </section>
}

export function NextPhases({language,onNavigate}:{language:Lang;onNavigate:(page:Page)=>void}){
 const ar=language==='ar'
 const steps:Text[]=[
  {en:'Now: verified locally',ar:'الآن: مُتحقق محلياً'},
  {en:'Connected data',ar:'بيانات متصلة'},
  {en:'Connected email',ar:'بريد متصل'},
  {en:'Agent execution',ar:'تنفيذ الوكيل'},
  {en:'Route handoff',ar:'تسليم المسار'},
  {en:'Team and cloud',ar:'الفريق والسحابة'}
 ]
 const biz=ar?'شركة الدانة التجريبية للتجارة':'Al-Dana Sample Trading Co.'
 return <div className="dukkan-phases">
  <div className="dukkan-phases-intro">
   <span className="dukkan-kicker">{ar?'خارطة الطريق':'Roadmap'}</span>
   <h1>{ar?'المراحل القادمة':'Next phases'}</h1>
   <p>{ar?'هذه معاينات ببيانات تجريبية تُعرض ليكون الاتجاه ملموساً؛ لا شيء هنا متصل بعد.':'These are previews with sample data, shown so the direction is concrete; nothing here is connected yet.'}</p>
  </div>
  <ol className="dukkan-phases-stepper" aria-label={ar?'تسلسل المراحل':'Phase sequence'}>
   {steps.map((step,index)=><li key={step.en} aria-current={index===0?'step':undefined}><i aria-hidden="true">{index===0?<Check size={12}/>:index}</i>{t(language,step)}</li>)}
  </ol>

  <Phase language={language} number={1} onNavigate={onNavigate} existsPage="finance"
   title={{en:'Connected business data',ar:'بيانات الأعمال المتصلة'}}
   outcome={{en:'Sales and expenses arrive with their source, observation period and reconciliation status, so every figure can be traced.',ar:'تصل المبيعات والمصروفات مع مصدرها وفترة رصدها وحالة مطابقتها، فيُتتبع كل رقم.'}}
   exists={{en:'Reviewed CSV import in Finance: rows are proposed, checked and approved before they become records.',ar:'استيراد CSV مُراجع في المالية: تُقترح الصفوف وتُفحص وتُعتمد قبل أن تصبح سجلات.'}}
   existsLabel={{en:'Open Finance',ar:'افتح المالية'}}
   adds={{en:'Sales, orders and expenses connected with source, observation period, last sync, basis (actual, estimate or simulated) and reconciliation status.',ar:'ربط المبيعات والطلبات والمصروفات مع المصدر وفترة الرصد وآخر مزامنة والأساس (فعلي أو تقدير أو محاكاة) وحالة المطابقة.'}}
   why={[
    {en:'Real figures without manual entry, and each figure carries where it came from.',ar:'أرقام حقيقية دون إدخال يدوي، وكل رقم يحمل مصدره.'},
    {en:'Financial claims trace to a source and a period rather than a slide.',ar:'الادعاءات المالية تُتتبع إلى مصدر وفترة لا إلى شريحة عرض.'},
    {en:'Declared basis and reconciliation keep estimates from being mixed with actuals.',ar:'الأساس المعلن والمطابقة يمنعان خلط التقديرات بالفعلي.'}
   ]}
   mockTitle={{en:'Business data',ar:'بيانات الأعمال'}} mockSub={{en:biz,ar:biz}}>
   <div className="dukkan-mock-grid two">
    <div className="dukkan-mock-panel">
     <h3>{ar?'الإيراد الشهري':'Revenue by month'}</h3>
     <RevenueChart language={language}/>
     <p className="dukkan-mock-caption">{ar?`بيانات تجريبية. المبالغ بالدينار الكويتي. الأساس: فعلي. الفترة: أبريل إلى سبتمبر 2026.`:'Sample data. Amounts in KWD. Basis: actual. Period: April to September 2026.'}</p>
    </div>
    <div className="dukkan-kpis">
     <div className="dukkan-kpi"><span>{ar?'الإيراد المسجل':'Recorded revenue'}</span><strong>{money.format(8448.75)}<small>{ar?'د.ك':'KWD'}</small></strong><em>{ar?'المصدر: طلبات إلكترونية + نقاط بيع · الأساس: فعلي':'Source: online orders + POS · basis: actual'}</em></div>
     <div className="dukkan-kpi"><span>{ar?'فواتير مستحقة':'Outstanding invoices'}</span><strong>{money.format(640)}<small>{ar?'د.ك':'KWD'}</small></strong><em>{ar?'المصدر: دفتر الفواتير · الأساس: فعلي · 4 مفتوحة':'Source: invoice ledger · basis: actual · 4 open'}</em></div>
     <div className="dukkan-kpi"><span>{ar?'طلبات متكررة':'Repeat orders'}</span><strong>38%</strong><em>{ar?'المصدر: طلبات إلكترونية · الأساس: فعلي · رصد 6 أشهر':'Source: online orders · basis: actual · 6 months observed'}</em></div>
    </div>
   </div>
   <div className="dukkan-table-wrap" style={{marginTop:18}}>
    <table className="dukkan-mock-table">
     <caption>{ar?'حالة المزامنة (عينة)':'Sync status (sample)'}</caption>
     <thead><tr><th>{ar?'المصدر':'Source'}</th><th>{ar?'الفترة':'Period'}</th><th>{ar?'آخر مزامنة':'Last sync'}</th><th className="num">{ar?'الصفوف':'Rows'}</th><th>{ar?'مطابق':'Reconciled'}</th></tr></thead>
     <tbody>
      <tr><td>{ar?'طلبات إلكترونية (CSV)':'Online orders (CSV)'}</td><td>{ar?'أبريل إلى سبتمبر 2026':'Apr to Sep 2026'}</td><td>26 Sep 2026 09:40</td><td className="num">412</td><td><span className="dukkan-chip ok"><b/>{ar?'نعم':'Yes'}</span></td></tr>
      <tr><td>{ar?'تصدير نقاط البيع (CSV)':'POS export (CSV)'}</td><td>{ar?'أبريل إلى سبتمبر 2026':'Apr to Sep 2026'}</td><td>26 Sep 2026 09:41</td><td className="num">1,208</td><td><span className="dukkan-chip ok"><b/>{ar?'نعم':'Yes'}</span></td></tr>
      <tr><td>{ar?'كشف حساب بنكي (CSV)':'Bank statement (CSV)'}</td><td>{ar?'أغسطس إلى سبتمبر 2026':'Aug to Sep 2026'}</td><td>25 Sep 2026 18:05</td><td className="num">96</td><td><span className="dukkan-chip open"><b/>{ar?'لا · بانتظار المراجعة':'No · awaiting review'}</span></td></tr>
     </tbody>
    </table>
   </div>
   <div className="dukkan-mock-flag" role="note"><Flag size={14} aria-hidden="true"/><div>{ar?'تم تخطي 3 مراجع مكررة':'3 duplicate references skipped'} <span>{ar?'· طلبات إلكترونية · معروضة للمراجعة، لم يُحذف شيء':'· online orders · shown for review, nothing deleted'}</span></div></div>
  </Phase>

  <Phase language={language} number={2} onNavigate={onNavigate} existsPage="work"
   title={{en:'Connected email',ar:'البريد المتصل'}}
   outcome={{en:'A reviewed draft goes out from the founder\'s own address, with a receipt that proves what was sent.',ar:'تخرج المسودة المُراجعة من عنوان المؤسس نفسه، مع إيصال يثبت ما أُرسل.'}}
   exists={{en:'Draft, edit, review and a duplicate-safe send adapter, without a connected sender.',ar:'مسودة وتحرير ومراجعة ومحوّل إرسال يمنع التكرار، دون مُرسل متصل.'}}
   existsLabel={{en:'Open the workspace',ar:'افتح مساحة العمل'}}
   adds={{en:'Gmail OAuth with a send-only scope, a verified sender, per-owner tokens and a revoke control.',ar:'ربط Gmail عبر OAuth بصلاحية إرسال فقط، ومُرسل موثق، ورموز لكل مالك، وزر إلغاء الربط.'}}
   why={[
    {en:'Customer tests and supplier questions leave the workspace without copy and paste.',ar:'تخرج اختبارات العملاء وأسئلة الموردين من مساحة العمل دون نسخ ولصق.'},
    {en:'Sending is gated by review and leaves a receipt; nothing goes out silently.',ar:'الإرسال مشروط بالمراجعة ويترك إيصالاً؛ لا يخرج شيء بصمت.'},
    {en:'Send-only scope and per-owner tokens limit what a compromise could reach.',ar:'صلاحية الإرسال فقط والرموز لكل مالك تحدّان مما يمكن أن يطاله أي اختراق.'}
   ]}
   mockTitle={{en:'Outbox',ar:'صندوق الصادر'}} mockSub={{en:'Reviewed draft',ar:'مسودة مُراجعة'}}>
   <div className="dukkan-mail-head">
    <span className="dukkan-chip ok"><b/><span>{ar?'متصل: founder@example.com · إرسال فقط':'Connected: founder@example.com · send-only'}</span></span>
    <p>{ar?'الرمز مخزّن لهذا المالك فقط · يمكن إلغاؤه في أي وقت':'Token stored for this owner only · revocable at any time'}</p>
   </div>
   <div className="dukkan-mail-draft">
    <dl>
     <dt>{ar?'إلى':'To'}</dt><dd>{ar?'حلويات أم دانة (عينة) · orders@ummdana.example':'Umm Dana Sweets (sample) · orders@ummdana.example'}</dd>
     <dt>{ar?'الموضوع':'Subject'}</dt><dd>{ar?'طلب تجريبي: علب هدايا رمضان، 40 علبة':'Sample order: Ramadan gift boxes, 40 units'}</dd>
    </dl>
    <p>{ar?'السلام عليكم،\nنجهّز طلبية تجريبية من 40 علبة هدايا لعملائنا في السالمية. هل يمكن تأكيد سعر الوحدة ومدة التسليم قبل الخميس؟':'Good afternoon,\nWe are preparing a trial order of 40 gift boxes for our Salmiya customers. Could you confirm the unit price and delivery time before Thursday?'}</p>
    <div className="dukkan-mail-foot">
     <span className="dukkan-mock-btn done" aria-disabled="true"><Check size={14} aria-hidden="true"/>{ar?'اعتُمد وأُرسل':'Approved and sent'}</span>
     <span className="dukkan-mock-btn danger"><Unplug size={14} aria-hidden="true"/>{ar?'إلغاء الربط':'Disconnect'}</span>
    </div>
   </div>
   <div className="dukkan-receipt">
    <h3>{ar?'الإيصال':'Receipt'}</h3>
    <dl>
     <dt>{ar?'معرّف الرسالة':'Message id'}</dt><dd>&lt;sample-7f3a9c1d@mail.example&gt;</dd>
     <dt>{ar?'الوقت':'Time'}</dt><dd>2026-09-26 10:12:34 (Asia/Kuwait)</dd>
     <dt>{ar?'بصمة المحتوى المُراجع':'Reviewed content hash'}</dt><dd>sha256 3b9f2c7e 41ad 08c5 e21c 6f0a 9d47 b3e8</dd>
    </dl>
   </div>
  </Phase>

  <Phase language={language} number={3} onNavigate={onNavigate} existsPage="work"
   title={{en:'Agent execution with a visible log',ar:'تنفيذ الوكيل مع سجل ظاهر'}}
   outcome={{en:'The agent works a portal task step by step, on screen, and stops before anything is submitted.',ar:'ينجز الوكيل مهمة البوابة خطوة بخطوة على الشاشة، ويتوقف قبل تقديم أي شيء.'}}
   exists={{en:'Tool calls in chat (retrieval, PDF fill, record proposals) with an Activity trace and a Stop control.',ar:'استدعاءات الأدوات في المحادثة (استرجاع، تعبئة PDF، اقتراح سجلات) مع أثر النشاط وزر إيقاف.'}}
   existsLabel={{en:'Open the workspace',ar:'افتح مساحة العمل'}}
   adds={{en:'A controlled browser session for portal tasks with a step log, screenshots, an approval gate before any external consequential action, cancellation and receipts.',ar:'جلسة متصفح مضبوطة لمهام البوابات مع سجل خطوات ولقطات شاشة وبوابة موافقة قبل أي إجراء خارجي مؤثر، وإلغاء وإيصالات.'}}
   why={[
    {en:'Portal work gets done without handing over passwords or losing sight of the steps.',ar:'يُنجز عمل البوابة دون تسليم كلمات المرور أو فقدان رؤية الخطوات.'},
    {en:'Every action is logged and screenshotted; the gate before submit is visible.',ar:'كل إجراء مسجّل ومصوّر؛ والبوابة قبل التقديم ظاهرة.'},
    {en:'Consequential actions need explicit approval, so the agent cannot commit the founder alone.',ar:'الإجراءات المؤثرة تحتاج موافقة صريحة، فلا يستطيع الوكيل إلزام المؤسس وحده.'}
   ]}
   mockTitle={{en:'Task log',ar:'سجل المهمة'}} mockSub={{en:'Portal form preparation',ar:'تجهيز نموذج البوابة'}}>
   <div className="dukkan-mock-grid two">
    <div>
     <ol className="dukkan-steps">
      <li className="done"><i><Check size={11} aria-hidden="true"/></i><strong>{ar?'فتح البوابة':'Opened portal'}</strong><small>10:14:02 · portal.example</small></li>
      <li className="done"><i><Check size={11} aria-hidden="true"/></i><strong>{ar?'تحديد النموذج':'Located form'}</strong><small>10:14:09 · {ar?'نموذج طلب الترخيص، 12 حقلاً':'Licence application form, 12 fields'}</small></li>
      <li className="done"><i><Check size={11} aria-hidden="true"/></i><strong>{ar?'تعبئة الحقول من الحقائق المؤكدة':'Filled fields from confirmed facts'}</strong><small>10:14:31 · {ar?'الاسم التجاري، رمز النشاط، عنوان المحل · من السجلات المعتمدة فقط':'Trade name, activity code, premises address · from approved records only'}</small></li>
      <li className="paused"><i><Pause size={10} aria-hidden="true"/></i><strong>{ar?'متوقف: الموافقة مطلوبة قبل التقديم':'Paused: approval required before submit'}</strong><small>10:14:33 · {ar?'لم يُرسل شيء إلى الجهة':'Nothing has been sent to the authority'}</small></li>
     </ol>
     <div className="dukkan-approval" role="group" aria-label={ar?'شريط الموافقة':'Approval bar'}>
      <LockKeyhole size={15} aria-hidden="true" color="#8a5a1c"/>
      <p>{ar?'راجع الحقول المعبأة. لا يُقدَّم شيء حتى توافق.':'Review the filled fields. Nothing is submitted until you approve.'}</p>
      <span className="dukkan-mock-btn primary">{ar?'موافقة':'Approve'}</span>
      <span className="dukkan-mock-btn">{ar?'إلغاء':'Cancel'}</span>
     </div>
    </div>
    <div className="dukkan-shots">
     {[
      {en:'Step 1 · Portal landing page',ar:'الخطوة 1 · صفحة البوابة الرئيسية'},
      {en:'Step 2 · Application form located',ar:'الخطوة 2 · تحديد نموذج الطلب'},
      {en:'Step 3 · Fields filled, awaiting approval',ar:'الخطوة 3 · الحقول معبأة، بانتظار الموافقة'}
     ].map((caption,index)=><figure key={caption.en} className="dukkan-shot">
      <div className="dukkan-shot-chrome" aria-hidden="true"><i/><i/><i/><span dir="ltr">portal.example/{index===0?'':index===1?'services/licence':'services/licence/apply'}</span></div>
      <div className="dukkan-shot-frame">{ar?'لقطة شاشة (عينة)':'Screenshot (sample)'}</div>
      <figcaption>{t(language,caption)}</figcaption>
     </figure>)}
    </div>
   </div>
  </Phase>

  <Phase language={language} number={4} onNavigate={onNavigate} existsPage="licences"
   title={{en:'Official route handoff',ar:'تسليم المسار الرسمي'}}
   outcome={{en:'The founder reaches the portal with the right route confirmed, a complete pack, and a place to record the receipt.',ar:'يصل المؤسس إلى البوابة بمسار مؤكد وحزمة مكتملة ومكان لتسجيل الإيصال.'}}
   exists={{en:'PDF preparation, field inspection and version history. No submission.',ar:'تجهيز PDF وفحص الحقول وسجل الإصدارات. لا تقديم.'}}
   existsLabel={{en:'Open Licences',ar:'افتح التراخيص'}}
   adds={{en:'A route eligibility check with sourced questions, a prepared pack checklist, portal handoff steps and a receipt capture record.',ar:'فحص أهلية المسار بأسئلة موثقة المصدر، وقائمة تحقق للحزمة، وخطوات التسليم للبوابة، وسجل لالتقاط الإيصال.'}}
   why={[
    {en:'No wasted trips: the missing item is named before the founder leaves the desk.',ar:'لا مشاوير ضائعة: يُسمّى العنصر الناقص قبل أن يغادر المؤسس مكتبه.'},
    {en:'The tool stops at the official boundary and says so; it never pretends to submit.',ar:'تتوقف الأداة عند الحد الرسمي وتصرّح بذلك؛ لا تدّعي التقديم أبداً.'},
    {en:'Route stays unresolved until eligibility is sourced, so wrong routes are not baked in.',ar:'يبقى المسار غير محسوم حتى تُوثق الأهلية، فلا تُثبَّت مسارات خاطئة.'}
   ]}
   mockTitle={{en:'Handoff pack',ar:'حزمة التسليم'}} mockSub={{en:'Home business licence (sample)',ar:'رخصة مشروع منزلي (عينة)'}}>
   <div className="dukkan-mock-grid split">
    <div className="dukkan-mock-panel">
     <h3>{ar?'قائمة التحقق':'Prepared pack checklist'}</h3>
     <ul className="dukkan-check">
      {[
       {done:true,text:{en:'Trade name reservation confirmation',ar:'تأكيد حجز الاسم التجاري'}},
       {done:true,text:{en:'Civil ID details of the owner',ar:'بيانات البطاقة المدنية للمالك'}},
       {done:true,text:{en:'Premises address and lease reference',ar:'عنوان المقر ومرجع عقد الإيجار'}},
       {done:false,text:{en:'Signatory ID copy',ar:'نسخة هوية الموقّع'},note:{en:'missing: signatory ID copy',ar:'ناقص: نسخة هوية الموقّع'}},
       {done:false,text:{en:'Authorised signatory declaration',ar:'إقرار الموقّع المفوض'},note:{en:'missing: signatory ID copy (needed first)',ar:'ناقص: نسخة هوية الموقّع (مطلوبة أولاً)'}}
      ].map(item=><li key={item.text.en} className={item.done?'done':undefined}><i aria-hidden="true">{item.done&&<Check size={12}/>}</i><span>{t(language,item.text)}{item.note&&<small>{t(language,item.note)}</small>}</span><span className="sr-only">{item.done?(ar?'مكتمل':'done'):(ar?'مفتوح':'open')}</span></li>)}
     </ul>
    </div>
    <div>
     <div className="dukkan-route">
      <strong>{ar?'المسار: غير محسوم حتى تأكيد الأهلية':'Route: unresolved until eligibility confirmed'}</strong>
      <ul>
       <li>{ar?'هل النشاط ضمن الأنشطة المسموح بها للمشاريع المنزلية؟':'Is the activity on the permitted home-business list?'}<small>{ar?'المصدر: بانتظار التأكيد من الجهة':'Source: awaiting confirmation from the authority'}</small></li>
       <li>{ar?'هل المالك مواطن كويتي بالغ؟':'Is the owner an adult Kuwaiti citizen?'}<small>{ar?'المصدر: سجل المؤسس (مؤكد)':'Source: founder record (confirmed)'}</small></li>
       <li>{ar?'هل المقر سكني ومسجل باسم المالك؟':'Is the premises residential and registered to the owner?'}<small>{ar?'المصدر: مرجع عقد الإيجار (بانتظار المراجعة)':'Source: lease reference (awaiting review)'}</small></li>
      </ul>
     </div>
     <div className="dukkan-form" aria-label={ar?'سجل الإيصال (فارغ)':'Receipt record (empty)'}>
      <h3>{ar?'التقاط الإيصال':'Receipt capture'}</h3>
      <label>{ar?'رقم المرجع':'Reference number'}<input disabled placeholder={ar?'يُلتقط بعد التسليم':'Captured after handoff'}/></label>
      <label>{ar?'التاريخ':'Date'}<input disabled placeholder={ar?'يُلتقط بعد التسليم':'Captured after handoff'}/></label>
      <label>{ar?'الجهة':'Authority'}<input disabled placeholder={ar?'يُلتقط بعد التسليم':'Captured after handoff'}/></label>
     </div>
    </div>
   </div>
  </Phase>

  <Phase language={language} number={5} onNavigate={onNavigate} existsPage="saved"
   title={{en:'Team and cloud workspace',ar:'الفريق ومساحة العمل السحابية'}}
   outcome={{en:'An adviser or accountant works in the same business record with their own role, and every approval is on the trail.',ar:'يعمل المستشار أو المحاسب في سجل الأعمال نفسه بدوره الخاص، وكل اعتماد مسجّل في الأثر.'}}
   exists={{en:'Single-owner local storage with export, import and a recovery bin.',ar:'تخزين محلي لمالك واحد مع تصدير واستيراد وسلة استرجاع.'}}
   existsLabel={{en:'Open saved records',ar:'افتح السجلات المحفوظة'}}
   adds={{en:'Hosted per-business isolation, roles (founder, adviser, accountant), an audit trail, and an Arabic-first mobile app later.',ar:'استضافة بعزل لكل نشاط، وأدوار (مؤسس، مستشار، محاسب)، وأثر تدقيق، وتطبيق جوال عربي أولاً لاحقاً.'}}
   why={[
    {en:'Work with the people who already help, without emailing files back and forth.',ar:'العمل مع من يساعدون أصلاً، دون تبادل الملفات بالبريد.'},
    {en:'Roles and the audit trail show who approved what and when, with a record hash.',ar:'الأدوار وأثر التدقيق يوضحان من اعتمد ماذا ومتى، مع بصمة السجل.'},
    {en:'Per-business isolation keeps one founder\'s data from ever mixing with another\'s.',ar:'العزل لكل نشاط يمنع اختلاط بيانات مؤسس ببيانات آخر.'}
   ]}
   mockTitle={{en:'Workspace members',ar:'أعضاء مساحة العمل'}} mockSub={{en:biz,ar:biz}}>
   <div className="dukkan-mock-grid two">
    <div>
     <div className="dukkan-table-wrap">
      <table className="dukkan-mock-table">
       <caption>{ar?'الأعضاء (أسماء تجريبية)':'Members (sample names)'}</caption>
       <thead><tr><th>{ar?'الاسم':'Name'}</th><th>{ar?'الدور':'Role'}</th><th>{ar?'الوصول':'Access'}</th><th>{ar?'آخر نشاط':'Last active'}</th></tr></thead>
       <tbody>
        <tr><td>{ar?'دانة المثال':'Dana Al-Mithal'}<small>dana@example.com</small></td><td><span className="dukkan-chip ok"><b/>{ar?'مؤسس':'Founder'}</span></td><td>{ar?'كامل · يعتمد':'Full · approves'}</td><td>26 Sep 2026 09:40</td></tr>
        <tr><td>{ar?'يوسف التجريبي':'Yousef Al-Tajribi'}<small>yousef@example.com</small></td><td><span className="dukkan-chip muted"><b/>{ar?'مستشار':'Adviser'}</span></td><td>{ar?'قراءة · تعليق':'Read · comment'}</td><td>24 Sep 2026 16:20</td></tr>
        <tr><td>{ar?'حصة النموذج':'Hessa Al-Namuthaj'}<small>hessa@example.com</small></td><td><span className="dukkan-chip muted"><b/>{ar?'محاسب':'Accountant'}</span></td><td>{ar?'المالية · يقترح':'Finance · proposes'}</td><td>25 Sep 2026 11:05</td></tr>
       </tbody>
      </table>
     </div>
     <div className="dukkan-mock-panel" style={{marginTop:14}}>
      <h3>{ar?'أثر التدقيق':'Audit trail'}</h3>
      <ol className="dukkan-audit">
       <li><time>26 Sep 2026 09:40</time><div>{ar?'دانة اعتمدت استيراد المالية (412 صفاً)':'Dana approved the Finance import (412 rows)'}<code>record a41c 9e07 f2b3 5d18</code></div></li>
       <li><time>25 Sep 2026 11:05</time><div>{ar?'حصة اقترحت سجل مصروف: إيجار سبتمبر، 450.000 د.ك · بانتظار اعتماد المؤسس':'Hessa proposed an expense record: September rent, 450.000 KWD · awaiting founder approval'}<code>record c07d 33e1 8ab4 6f2e</code></div></li>
       <li><time>24 Sep 2026 16:20</time><div>{ar?'يوسف اطّلع على خطة التكاليف، الإصدار 3 · قراءة فقط':'Yousef viewed the cost plan, version 3 · read only'}<code>record 5be2 0d9a 71c6 e4f0</code></div></li>
      </ol>
     </div>
    </div>
    <div className="dukkan-mock-panel">
     <h3>{ar?'تبديل النشاط':'Business switcher'}</h3>
     <div className="dukkan-switcher">
      <div className="dukkan-switcher-trigger"><span>{biz}<small>{ar?'3 أعضاء · معزول':'3 members · isolated'}</small></span><ChevronDown size={15} aria-hidden="true"/></div>
      <ul aria-label={ar?'الأنشطة (عينة)':'Businesses (sample)'}>
       <li><span>{biz}</span><small>{ar?'الحالي':'current'}</small></li>
       <li><span>{ar?'مقهى بيت النور التجريبي':'Bait Al-Noor Sample Café'}</span><small>{ar?'مستشار':'adviser'}</small></li>
       <li><span>{ar?'استوديو مرسى التجريبي للياقة':'Marsa Sample Fit Studio'}</span><small>{ar?'محاسب':'accountant'}</small></li>
      </ul>
      <p className="dukkan-mock-caption">{ar?'كل نشاط له بياناته المعزولة. عينة: لا يوجد حساب سحابي حقيقي هنا.':'Each business holds its own isolated data. Sample: no real cloud account exists here.'}</p>
     </div>
    </div>
   </div>
  </Phase>

  <div className="dukkan-phases-foot">
   <p>{ar?'التسلسل والنطاق قراران للمؤسس؛ ويبقى النشر متوقفاً حتى يُستأنف صراحةً.':'Sequence and scope are decisions for the founder; deployment stays paused until explicitly resumed.'}</p>
   <Button variant="outline" onClick={()=>onNavigate('guide')}>{ar?'العودة إلى الدليل':'Back to the guide'}</Button>
  </div>
 </div>
}
