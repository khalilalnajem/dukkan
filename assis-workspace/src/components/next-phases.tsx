import {ArrowLeft,BriefcaseBusiness,Building2,ChartNoAxesCombined,Check,ChevronDown,Compass,Handshake,Languages,Mail,MapPinned,Megaphone,MonitorSmartphone,MousePointerClick,Network,ShieldCheck,Store,Users,WalletCards} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import type {BusinessArea} from '@/lib/workspaces'
import {Button} from '@/components/ui/button'
import './next-phases.css'
import {FundingDesign,OfficialRouteMarks,PhaseDesignPreview,type PhasePreviewId} from './phase-previews'

type Page=BusinessArea|'home'|'work'|'roadmap'|'estimates'|'saved'|'about'|'guide'|'evidence'|'phases'
type Lang='en'|'ar'
type Text=Record<Lang,string>
type Feature={icon:LucideIcon;title:Text;detail:Text;preview:PhasePreviewId}
type Group={icon:LucideIcon;title:Text;features:Feature[]}
const tx=(en:string,ar:string):Text=>({en,ar})

const groups:Group[]=[
 {icon:Compass,title:tx('Find trusted support','اعثر على دعم موثوق'),features:[
  {preview:'marketplace',icon:Store,title:tx('Marketplace directory for providers and mentors','سوق ودليل لمقدمي الخدمات والمرشدين'),detail:tx('Discover and compare verified service providers, advisers, mentors and partner opportunities.','اكتشف وقارن مقدمي الخدمات والمستشارين والمرشدين وفرص الشراكة بعد التحقق منهم.')},
  {preview:'investors',icon:Handshake,title:tx('Investor and partner matching','التواصل مع المستثمرين والشركاء'),detail:tx('Match business profiles with stated criteria, then review introductions before sharing details. No investor access or funding commitment is assumed.','طابق ملفات المشاريع مع معايير معلنة، ثم راجع التعارف قبل مشاركة التفاصيل. لا يُفترض توفر مستثمرين أو التزام تمويلي.')},
  {preview:'funding',icon:WalletCards,title:tx('Funding and crowdfunding referrals','الإحالة إلى التمويل والتمويل الجماعي'),detail:tx('Prepare for funding and refer founders to authorised providers after checking each route and its requirements.','استعد للتمويل وأحِل المؤسسين إلى جهات مرخصة بعد التحقق من متطلبات كل مسار.')},
  {preview:'incubator',icon:Users,title:tx('Incubator and accelerator support','دعم الحاضنات والمسرّعات'),detail:tx('Track milestones and mentor reviews when an actual programme or adviser relationship is in place.','تابع المراحل ومراجعات المرشدين عند وجود برنامج أو علاقة استشارية فعلية.')}
 ]},
 {icon:BriefcaseBusiness,title:tx('Run and grow the business','أدر المشروع وطوّره'),features:[
  {preview:'marketing',icon:Megaphone,title:tx('Agentic marketing','تسويق ينفذه الوكيل'),detail:tx('Draft campaigns and run bounded experiments; publishing and spend require approval and authorised accounts.','أعد الحملات واختبارات محدودة؛ يتطلب النشر والإنفاق موافقة وحسابات مصرحاً بها.')},
  {preview:'connectors',icon:Store,title:tx('Business and POS connectors','ربط أنظمة الأعمال ونقاط البيع'),detail:tx('Bring in sales, orders, expenses, invoices and CRM data with source, period and reconciliation checks.','استورد بيانات المبيعات والطلبات والمصروفات والفواتير والعملاء مع فحص المصدر والفترة والمطابقة.')},
  {preview:'intelligence',icon:MapPinned,title:tx('Fresh local intelligence','معلومات محلية حديثة'),detail:tx('Add current news and location-level data with visible dates and coverage limits.','أضف الأخبار والبيانات حسب الموقع مع تواريخ وحدود التغطية بوضوح.')},
  {preview:'simulation',icon:ChartNoAxesCombined,title:tx('Transparent market simulation','محاكاة سوق واضحة الافتراضات'),detail:tx('Explore what-if scenarios with visible assumptions; simulated people and demand never count as customer evidence.','استكشف سيناريوهات افتراضية بافتراضات ظاهرة؛ ولا تُعامل الشخصيات أو الطلب المحاكى كدليل من العملاء.')}
 ]},
 {icon:MousePointerClick,title:tx('Connect services and complete work','اربط الخدمات وأكمل المهام'),features:[
  {preview:'email',icon:Mail,title:tx('Gmail connection','ربط Gmail'),detail:tx('Connect an owner-controlled sender for reviewed drafts, with clear permissions, revoke and send receipts.','اربط بريداً يتحكم به المالك للمسودات المراجعة، بصلاحيات واضحة وإلغاء للربط وإيصالات إرسال.')},
  {preview:'browser',icon:MonitorSmartphone,title:tx('Controlled browser execution','تنفيذ مضبوط عبر المتصفح'),detail:tx('Give agents a visible action log, cancellation and human approval before consequential steps.','وفّر للوكيل سجل إجراءات ظاهراً وإمكانية الإلغاء وموافقة بشرية قبل الخطوات المؤثرة.')},
  {preview:'handoff',icon:ShieldCheck,title:tx('Official route handoffs','تسليم إلى المسارات الرسمية'),detail:tx('Check sourced eligibility, prepare a handoff pack and record the official receipt. Preparation alone is not submission.','تحقق من الأهلية بمصادر، وجهّز حزمة التسليم وسجّل الإيصال الرسمي. الإعداد وحده لا يعني التقديم.')}
 ]},
 {icon:Network,title:tx('Work together and in more languages','اعملوا معاً وبلغات أكثر'),features:[
  {preview:'teams',icon:Building2,title:tx('Team and cloud workspaces','مساحات عمل للفِرق والسحابة'),detail:tx('Add secure business accounts, roles, shared records, backups and hosted operation.','أضف حسابات أعمال آمنة وأدواراً وسجلات مشتركة ونسخاً احتياطية وتشغيلاً مستضافاً.')},
  {preview:'languages',icon:Languages,title:tx('More languages','لغات إضافية'),detail:tx('Expand beyond English and Arabic when demand and translation quality are established.','توسّع إلى لغات تتجاوز الإنجليزية والعربية عند ثبوت الطلب وجودة الترجمة.')}
 ]}
]

export function NextPhases({language,onNavigate}:{language:Lang;onNavigate:(page:Page)=>void}){
 const ar=language==='ar'
 const core=ar?'متاح الآن في مساحة العمل':'In the workspace today'
 const coreItems=ar?['الفكرة والأدلة','الاختبارات والقرارات','التكاليف والسجلات','إعداد المستندات ومراجعتها']:['Ideas and evidence','Tests and decisions','Costs and business records','Document preparation and review']
 return <main className="dukkan-phases" lang={language}>
  <header className="dukkan-phases-intro">
   <span className="dukkan-kicker">{ar?'خارطة الطريق':'Roadmap'}</span>
   <h1>{ar?'المراحل التالية':'Next phases'}</h1>
   <p>{ar?'المساحة الحالية تساعدك على تحويل الفكرة إلى اختبارات وقرارات وسجلات. القدرات أدناه مخططة للمراحل التالية.':'The current workspace helps turn an idea into tests, decisions and business records. The capabilities below are planned for later phases.'}</p>
  </header>

  <FundingDesign language={language}/><OfficialRouteMarks language={language}/>

  <section className="dukkan-phases-core" aria-labelledby="phases-core-title">
   <div className="dukkan-phases-core-heading"><span className="dukkan-phases-core-icon"><Check size={16} aria-hidden="true"/></span><div><span className="dukkan-kicker">{core}</span><h2 id="phases-core-title">{ar?'سير عمل المشروع':'Business workflow'}</h2></div></div>
   <ul>{coreItems.map((item,index)=><li key={item}><button onClick={()=>onNavigate((['work','roadmap','finance','saved'] as Page[])[index])}>{item}</button></li>)}</ul>
  </section>

  <div className="dukkan-phases-groups">
   {[groups[3],groups[2],groups[1],groups[0]].map((group,index)=>{const GroupIcon=group.icon;return <section className="dukkan-phases-group" key={group.title.en} aria-labelledby={`phases-group-${index}`}>
    <header className="dukkan-phases-group-heading"><span className="dukkan-phases-group-icon"><GroupIcon size={19} aria-hidden="true"/></span><h2 id={`phases-group-${index}`}>{group.title[language]}</h2><span className="dukkan-phase-planned" title={ar?'ميزة مستقبلية غير متاحة حالياً':'Future capability, not available today'}>{ar?'مخطط':'Planned'}</span></header>
    <ul className="dukkan-phases-features">
     {group.features.map(feature=>{const Icon=feature.icon;return <li key={feature.title.en}>
      <details className="dukkan-phase-feature-copy"><summary><span className="dukkan-phase-feature-icon" aria-hidden="true"><Icon size={17}/></span><h3>{feature.title[language]}</h3><ChevronDown size={14} aria-hidden="true"/></summary><p>{feature.detail[language]}</p><PhaseDesignPreview id={feature.preview} language={language}/></details>
     </li>})}
    </ul>
   </section>})}
  </div>

  <footer className="dukkan-phases-foot">
   <p>{ar?'تتحدد الأولويات بعد قبول النطاق الأساسي، والاستماع إلى المؤسسين، وتأكيد الوصول إلى واجهات الربط والشركاء.':'Priorities follow core release acceptance, founder evidence, and confirmed API and partner access.'}</p>
   <Button variant="outline" onClick={()=>onNavigate('guide')}><ArrowLeft size={15} aria-hidden="true" className="dukkan-phases-back-icon"/>{ar?'العودة إلى دليل المؤسس':'Back to the founder guide'}</Button>
  </footer>
 </main>
}
