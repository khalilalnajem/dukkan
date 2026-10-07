import {readExampleSession,saveExampleSession} from '@/lib/example-session'
import {BusinessArea} from '@/components/business-area'
import {areaLabels,type BusinessArea as AreaName} from '@/lib/workspaces'
import {kuwaitServiceExample} from '@/lib/kuwait-service-example'
import type {WorkSidebarFillProgress} from '@/components/work-sidebar'
import {pearlDeltaExample,pearlPdfPrompt} from '@/lib/pearl-delta-example'
import {recordArea,isSampleWorkspace} from '@/lib/dashboard-navigation'
import type {LifecycleRecord} from '../../shared/lifecycle'
import {BusinessOverview} from '@/components/business-overview'
import {CostScenarios} from '@/components/cost-scenarios'
import {reconcileContext} from '@/lib/business-impact'
import {getBusinessStorage,captureBusinessSession,flushBusinessStorage} from '@/lib/account-storage'
import {WorkSidebar,DraftGroupList} from '@/components/work-sidebar'
import {LifecycleDashboard} from '@/components/lifecycle-dashboard'
import {applyConversationProposal,conversationStages} from '@/lib/conversation-flow'
import {evidenceNeedsReview} from '@/lib/research'
import {useCallback,useEffect,useRef,useState} from 'react'
import {z} from 'zod'
import {Users,ShoppingCart,BriefcaseBusiness,Wallet,ScrollText,Lightbulb,BookOpen,Check,Download,FileText,FolderClosed,FolderOpen,Home,Info,Menu,MessageCircle,Plus,Map,Calculator,Archive,Upload,PenLine,Trash2,X,Compass,Library,Route,ChevronRight,Presentation,ChevronDown,PanelRight,PanelRightClose} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {FounderWorkbench,type Stage} from '@/components/founder-workbench'
import {ChatWorkspace} from '@/components/chat-workspace'
import {DoorEntrance} from '@/components/door-entrance'
import {EvidenceEditor} from '@/components/editors'
import {addIdea,FOLDERS_KEY,moveIdeaToBin,restoreIdeaFromBin,readIdeaBin,ideaKey,readIdea,readIdeas,renameIdea,selectIdea} from '@/lib/idea-folders'
import {archiveOtherIdeas,exportIdea,importIdea,loadArchiveFile,readArchive,restoreArchivedIdeas} from '@/lib/idea-archive'
import {WorkspaceWriter,type WriteResult} from '@/lib/workspace-writer'
import {artifactSchema,chatRequest,type ChatArtifact,type RequestedAction} from '@/lib/chat-api'
import {GuidePage} from '@/components/guide-page'
import {EvidenceLibrary} from '@/components/evidence-library'
import {NextPhases} from '@/components/next-phases'
import {workedExample,reviseBrief,saveTestPlan,recordDecision,adoptProposedTest,recordIdeaReviewChoice,ideaReviewPriority,unreviewedChallenges,calculate,workspaceSchema,download,exportPlanWithReviews as exportPlan,type Decision,type Evidence,type Hypothesis,type Workspace} from '@/lib/workspace'
import {buildAreaChatPrompt} from '@/lib/area-chat-context'

type Page=AreaName|'home'|'work'|'roadmap'|'estimates'|'saved'|'about'|'guide'|'evidence'|'phases'
function pageFromUrl():Page{const query=new URLSearchParams(location.search),view=query.get('view');return view==='market'||view==='finance'||view==='sales'||view==='people'||view==='operations'||view==='licences'||view==='about'||view==='home'||view==='work'||view==='roadmap'||view==='estimates'||view==='saved'||view==='guide'||view==='evidence'||view==='phases'?view:query.has('conversation')?'work':'home'}
const aboutCopy={
 en:{label:'About Dukkan',title:'From idea to a clearer next step.',intro:'Dukkan keeps your business idea, questions, evidence and drafts in one workspace.',open:'Open your workspace',steps:[['Challenge','Describe the business, who it is for and the problem you want to solve.'],['Test demand','Separate assumptions from what you have actually observed or sourced.'],['Plan costs','Work through costs, choices and a practical next action.'],['Prepare setup','Prepare a draft for your review before using any official service.']],boundaryTitle:'You stay in control',boundary:'Check sources and edit every draft. Dukkan cannot confirm eligibility or submit government applications. Keep an exported copy of important records and reviewed documents.'},
 ar:{label:'عن دكان',title:'من الفكرة إلى الرخصة',intro:'يجمع دكان فكرتك وأسئلتك وأدلتك ومسوداتك في مساحة عمل واحدة.',open:'افتح مساحة العمل',steps:[['الفكرة','صف المشروع، ولمن هو، وما المشكلة التي تريد حلها.'],['التحقق','افصل افتراضاتك عما لاحظته فعلاً أو وجدته في مصدر.'],['التخطيط','راجع التكاليف والخيارات وحدد خطوة عملية تالية.'],['التقديم','حضّر مسودة تراجعها بنفسك قبل استخدام أي خدمة رسمية.']],boundaryTitle:'القرار لك',boundary:'تحقق من المصادر وراجع كل مسودة. لا يؤكد دكان أهليتك ولا يقدّم طلبات حكومية. صدّر نسخة من السجلات المهمة والمستندات التي راجعتها.'}
} as const
const words={
 en:{home:'Home',chat:'Chat',saved:'Saved work',ideas:'Ideas',newIdea:'New idea',newChat:'New chat',open:'Open chat',next:'Next step',notes:'Notes',decisions:'Decisions',addNote:'Add note',export:'Export',private:'Business workspace',example:'Fictional example',empty:'Start with a business idea. You can change it later.',onboard:'What is your idea?',onboardHint:'A sentence is enough to get started.',forWhom:'Who is it for? (optional)',saveIdea:'Save idea',skip:'Skip for now',door:'View entrance',record:'Business record',recent:'Your work'} as const,
 ar:{home:'الرئيسية',chat:'المحادثة',saved:'العمل المحفوظ',ideas:'الأفكار',newIdea:'فكرة جديدة',newChat:'محادثة جديدة',open:'افتح المحادثة',next:'الخطوة التالية',notes:'ملاحظات',decisions:'قرارات',addNote:'أضف ملاحظة',export:'تصدير',private:'مساحة المشروع',example:'مثال تخيلي',empty:'ابدأ بفكرة مشروع. يمكنك تغييرها لاحقاً.',onboard:'ما فكرتك؟',onboardHint:'جملة واحدة تكفي للبدء.',forWhom:'لمن هذه الفكرة؟ (اختياري)',saveIdea:'احفظ الفكرة',skip:'تخطّ الآن',door:'اعرض المدخل',record:'سجل المشروع',recent:'عملك'} as const
}
type ChatRequest={nonce:number;scope?:string;conversationId?:string;artifactId?:string;prompt?:string;stage?:'idea'|'validate'|'plan'|'apply';requestedAction?:RequestedAction;newChat?:boolean}
function artifactStage(item:ChatArtifact){return item.kind==='stage_draft'?(item.stage||'idea'):'apply'}
const stageOrder=['idea','validate','plan','apply'] as const

export default function DukkanApp(){
 const [ideas,setIdeas]=useState(readIdeas)
 const [loaded]=useState(()=>readIdea(ideas.selectedId))
 const [demo,setDemo]=useState(()=>isSampleWorkspace(location.search))
 const [workspace,setWorkspace]=useState<Workspace>(()=>{if(!demo)return loaded.workspace;const id=new URLSearchParams(location.search).get('example')||'default';const fallback=id==='kuwait-service'?kuwaitServiceExample:id==='pearl-delta'?pearlDeltaExample:workedExample;try{return readExampleSession(sessionStorage,id,fallback)}catch{return fallback()}})
 const [language,setLanguage]=useState<'en'|'ar'>(()=>{try{return localStorage.getItem('dukkan-language')==='ar'?'ar':'en'}catch{return 'en'}})
 const [lifecycleCategory,setLifecycleCategory]=useState('licence')
 const [selectedRecordId,setSelectedRecordId]=useState<string|null>(null)
 const [selectionRequest,setSelectionRequest]=useState(0)
 const [sidebarReveal,setSidebarReveal]=useState(0)
 const [documentPanelOpen,setDocumentPanelOpen]=useState(false)
 const [fillProgress,setFillProgress]=useState<WorkSidebarFillProgress|null>(null)
 const fillingTurnRef=useRef('')
 const [chatHistoryHost,setChatHistoryHost]=useState<HTMLDivElement|null>(null)
 const [businessPickerOpen,setBusinessPickerOpen]=useState(false)
 const [sectionsExpanded,setSectionsExpanded]=useState(false)
 const requestCounter=useRef(Date.now())
 const [sidebarTab,setSidebarTab]=useState<string>(()=>{const initial=pageFromUrl();return ['roadmap','saved','estimates'].includes(initial)?initial:'saved'})
 const sidebarTabRef=useRef(sidebarTab);sidebarTabRef.current=sidebarTab
 const [sidebarDocument,setSidebarDocument]=useState<ChatArtifact|null>(null)
 const [sidebarDirty,setSidebarDirty]=useState(false)
 const [areaDirty,setAreaDirty]=useState(false)
 const [lifecycleDirty,setLifecycleDirty]=useState(false)
 const [scenarioDirty,setScenarioDirty]=useState(false)
 const areaDirtyRef=useRef(false)
 const [page,setPage]=useState<Page>(pageFromUrl)
 const pageRef=useRef(page);pageRef.current=page
 const [journeyStage,setJourneyStage]=useState<Stage>(()=>{const stage=new URLSearchParams(location.search).get('stage');return stage==='validate'||stage==='plan'||stage==='apply'?stage:'idea'})
 const [journeyFocus,setJourneyFocus]=useState('')
 const [menu,setMenu]=useState(false)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState(ideas.error||loaded.error)
 const [evidenceOpen,setEvidenceOpen]=useState(false)
 const taskHost=null
 const [onboarding,setOnboarding]=useState(false)
 const [ideaDraft,setIdeaDraft]=useState('')
 const [projectTitleDraft,setProjectTitleDraft]=useState('')
 const [editingProjectTitle,setEditingProjectTitle]=useState(false)
 const [customerDraft,setCustomerDraft]=useState('')
 const [entranceReplay,setEntranceReplay]=useState(0)
 const [onboardingSaving,setOnboardingSaving]=useState(false)
 const [ideaActions,setIdeaActions]=useState('')
 const [renameDraft,setRenameDraft]=useState('')
 const [binOpen,setBinOpen]=useState(false)
 const [manageOpen,setManageOpen]=useState(false)
 const [archiveConfirm,setArchiveConfirm]=useState(false)
 const [managementBusy,setManagementBusy]=useState(false)
 const [managementError,setManagementError]=useState('')
 const [archiveRevision,setArchiveRevision]=useState(0)
 const [shownIdeaJson,setShownIdeaJson]=useState('')
 const [pastedIdeaJson,setPastedIdeaJson]=useState('')
 const [pastedArchiveJson,setPastedArchiveJson]=useState('')
 const [showArchiveJson,setShowArchiveJson]=useState(false)
 const [costDraft,setCostDraft]=useState(workspace.costs)
 const recordDirty=JSON.stringify(costDraft)!==JSON.stringify(workspace.costs)
 areaDirtyRef.current=areaDirty||lifecycleDirty||sidebarDirty||scenarioDirty||recordDirty
 const showPdfProgress=useCallback((progress:typeof fillProgress)=>{
  setFillProgress(progress)
  if(!progress&&sidebarTabRef.current==='fill-progress'){fillingTurnRef.current='';setSidebarTab('saved');setDocumentPanelOpen(false)}
  if(progress&&fillingTurnRef.current!==progress.turnId&&!areaDirtyRef.current){fillingTurnRef.current=progress.turnId;setSidebarTab('fill-progress');setDocumentPanelOpen(true)}
 },[])
 const [workspaceArtifacts,setWorkspaceArtifacts]=useState<ChatArtifact[]>([])
 const [artifactsError,setArtifactsError]=useState('')
 const [artifactScopeLoaded,setArtifactScopeLoaded]=useState('')
 const [artifactRefresh,setArtifactRefresh]=useState(0)
 const [chatRequestFromPage,setChatRequestFromPage]=useState<ChatRequest|null>(null)
 const [hasUnsentMessage,setHasUnsentMessage]=useState(false)
 const [writer]=useState(()=>{try{return new WorkspaceWriter(getBusinessStorage(),ideaKey(ideas.selectedId))}catch{return null}})
 const activeWriter=useRef(writer)
 const session=useRef(0)
 const mounted=useRef(true)
 const accountSession=useRef(captureBusinessSession())
 useEffect(()=>{if(!menu)return;const previous=document.activeElement as HTMLElement|null;const drawer=document.querySelector<HTMLElement>('.dukkan-sidebar');const controls=()=>Array.from(drawer?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],select')||[]).filter(el=>el.getClientRects().length>0);controls()[0]?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenu(false);return}if(event.key==='Tab'){const nodes=controls(),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus()}},[menu])
 useEffect(()=>{if(!businessPickerOpen)return;const close=(event:PointerEvent)=>{if(!(event.target as Element).closest('.business-picker'))setBusinessPickerOpen(false)};const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setBusinessPickerOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}},[businessPickerOpen])
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;session.current++}},[])
 const serial=useRef(0)
 const lastWrite=useRef<Promise<WriteResult>>(Promise.resolve({ok:true}))
 const realWorkspace=useRef(loaded.workspace)
 const t=words[language]
 const about=aboutCopy[language]
 const estimate=calculate(workspace.costs)
 const selected=ideas.folders.find(folder=>folder.id===ideas.selectedId)
 const selectedName=demo?(workspace.brief.idea.split('·')[0].trim()||'Mingyuan Lighting')+(language==='ar'?' · بيانات نموذجية':' · Sample business'):selected?.name||t.newIdea
 const scope=demo?(new URLSearchParams(location.search).get('example')==='kuwait-service'?'example-kuwait-service':new URLSearchParams(location.search).get('example')==='pearl-delta'?'example-pearl-delta':'example'):ideas.selectedId||'unselected'
 useEffect(()=>{document.querySelector('.customer-shell .dukkan-main')?.scrollTo({top:0,left:0})},[page,scope])
 const shownArtifacts=artifactScopeLoaded===scope?workspaceArtifacts:[]
 const latestArtifacts=shownArtifacts.filter(item=>!shownArtifacts.some(newer=>newer.supersedesArtifactId===item.id))
 const hasIdeaDraft=latestArtifacts.some(item=>item.kind==='stage_draft'&&item.stage==='idea')
 const latestIdeaDraft=latestArtifacts.filter(item=>item.kind==='stage_draft'&&item.stage==='idea').at(-1)
 const latestIdeaChoice=workspace.ideaReviewDecisions.filter(item=>item.artifactId===latestIdeaDraft?.id).at(-1)
 const hasPlanDraft=latestArtifacts.some(item=>item.kind==='stage_draft'&&item.stage==='plan')
 const focusTest=workspace.savedTests.at(-1)
 const focusHypothesis=workspace.hypotheses.find(item=>item.id===focusTest?.hypothesisId)||workspace.hypotheses.find(item=>item.priority==='Critical')||workspace.hypotheses[0]
 const lastDecision=workspace.decisions.filter(item=>item.hypothesisId===focusHypothesis?.id).at(-1)
 const decisionSummaries=[...workspace.decisions.map(item=>({id:item.id,date:item.date,label:item.outcome,reason:item.reason})),...workspace.ideaReviewDecisions.map(item=>({id:item.id,date:item.date,label:item.choice==='test'?'Test the idea':item.choice==='revise'?'Revise the idea':'Park the idea',reason:item.reason})),...workspace.lifecycle.filter(item=>item.values.category==='business_decision'&&item.values.status!=='archived').map(item=>({id:item.id,date:item.at,label:(item.values.status==='prepared'?'Draft · ':item.values.status==='approved'?'Approved by you · ':item.values.status==='submitted'?'Submission reported · ':'Completion reported · ')+item.values.title,reason:item.values.details+' Evidence: '+item.values.evidence}))].sort((a,b)=>a.date.localeCompare(b.date))
 const recentDecision=decisionSummaries.at(-1)
 const reviewDirection=ideaReviewPriority({hasReview:!!latestIdeaDraft?.ideaReview,choice:latestIdeaChoice,draftAt:String(latestIdeaDraft?.createdAt||''),testAt:focusTest?.date||'',validationDecisionAt:lastDecision?.date||''})
 const nextMove=!workspace.brief.idea.trim()?'enter':focusHypothesis&&(focusHypothesis.reviewReason||evidenceNeedsReview(workspace,focusHypothesis)||unreviewedChallenges(workspace,focusHypothesis))?'review':artifactScopeLoaded!==scope?artifactsError?'unavailable':'checking':reviewDirection==='reviewIdea'?'reviewIdea':reviewDirection==='park'?'parkIdea':reviewDirection==='revise'?'reviseIdea':reviewDirection==='test'?'designTest':lastDecision?.outcome==='Pause the idea'?'paused':lastDecision?.outcome==='Revise the idea'?'revise':!hasIdeaDraft&&!focusTest?'develop':!focusTest?'designTest':!focusHypothesis?.test.result.trim()?'recordResult':!lastDecision?'decide':lastDecision.outcome==='Keep testing'?'designTest':!hasPlanDraft?'plan':'prepare'
 const nextLabels={
  en:{enter:['Enter your idea','Start with a sentence. This saves a brief in this folder.'],checking:['Checking saved work','Looking for drafts already prepared for this idea.'],unavailable:['Saved drafts unavailable','Reconnect to check earlier drafts before suggesting the next step.'],develop:['Challenge this idea','Get a candid review of what is known, what is weak and what to test.'],reviewIdea:['Review the critique','Read the reasons, then choose to test, revise or park the idea.'],parkIdea:['Idea parked','Your reason is saved. Revisit it when something changes.'],reviseIdea:['Revise this idea','Edit the brief, then request another candid review.'],designTest:['Design a small test','Choose one uncertain claim and a way to check it with real people.'],recordResult:['Record what happened','Add what you observed. A plan is not a test result.'],decide:['Decide the next move','Review the result and record whether to test, revise, pause or plan.'],review:['Review your decision','Your assumptions or evidence changed. Check whether the earlier decision still holds.'],paused:['Idea paused','Your decision is saved. Revisit it when you have a reason to continue.'],revise:['Revise the idea','Use what you learned to change the brief, then test again.'],plan:['Plan the next step','Use the reviewed evidence to make a cost and delivery plan.'],prepare:['Prepare setup if useful','Check current requirements and prepare a draft for your review.']},
  ar:{enter:['أدخل فكرتك','ابدأ بجملة واحدة. تُحفظ الفكرة في هذا المجلد.'],checking:['جارٍ فحص العمل المحفوظ','نبحث عن المسودات التي أُعدت لهذه الفكرة.'],unavailable:['المسودات غير متاحة','أعد الاتصال لفحص المسودات السابقة قبل اقتراح الخطوة التالية.'],develop:['راجع هذه الفكرة','راجع ما هو معروف وما هو ضعيف وما يحتاج إلى اختبار.'],reviewIdea:['راجع التقييم','اقرأ الأسباب ثم اختر الاختبار أو التعديل أو التوقف مؤقتاً.'],parkIdea:['الفكرة متوقفة مؤقتاً','حُفظ سبب القرار. عد إليها عندما يتغير شيء.'],reviseIdea:['عدّل هذه الفكرة','عدّل الوصف ثم اطلب مراجعة نقدية جديدة.'],designTest:['صمّم اختباراً صغيراً','اختر افتراضاً غير مؤكد وطريقة للتحقق منه مع أشخاص حقيقيين.'],recordResult:['سجّل ما حدث','أضف ما لاحظته. خطة الاختبار ليست نتيجة.'],decide:['حدّد الخطوة التالية','راجع النتيجة ثم قرر: اختبار آخر أو تعديل أو توقف أو تخطيط.'],review:['راجع قرارك','تغيّرت الافتراضات أو الأدلة. تحقق مما إذا كان القرار السابق ما زال مناسباً.'],paused:['الفكرة متوقفة مؤقتاً','قرارك محفوظ. يمكنك العودة إليها عندما يتغير شيء.'],revise:['عدّل الفكرة','استخدم ما تعلمته لتعديل الوصف ثم اختبر مرة أخرى.'],plan:['خطّط للخطوة التالية','استخدم الأدلة التي راجعتها لوضع سيناريو للتكلفة والتنفيذ.'],prepare:['جهّز الإجراءات عند الحاجة','تحقق من المتطلبات الحالية وأعد مسودة لمراجعتك.']}
 } as const
 const [nextTitle,nextDescription]=nextLabels[language][nextMove]

 useEffect(()=>{
  if(!ideaActions&&!manageOpen)return
  const previous=document.activeElement as HTMLElement|null
  const dialog=document.querySelector<HTMLElement>('.dukkan-manage-dialog')
  const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')||[]).filter(item=>item.getClientRects().length>0)
  if(!dialog?.contains(document.activeElement))focusable()[0]?.focus()
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!managementBusy){event.preventDefault();setIdeaActions('');setManageOpen(false)}
   if(event.key==='Tab'){const items=focusable(),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
  }
  document.addEventListener('keydown',onKey)
  return()=>{document.removeEventListener('keydown',onKey);if(previous?.isConnected)previous.focus()}
 },[ideaActions,manageOpen,managementBusy])
 useEffect(()=>{try{localStorage.setItem('dukkan-language',language)}catch{}document.documentElement.lang=language==='ar'?'ar':'en-GB';document.documentElement.dir=language==='ar'?'rtl':'ltr'},[language])
 const previousCosts=useRef(workspace.costs)
 useEffect(()=>{const previous=previousCosts.current;setCostDraft(current=>JSON.stringify(current)===JSON.stringify(previous)?workspace.costs:current);previousCosts.current=workspace.costs},[workspace.costs])
 useEffect(()=>setCostDraft(workspace.costs),[scope])
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer)},[notice])
 useEffect(()=>{const sync=()=>{if(areaDirtyRef.current){const restore=new URL(location.href);restore.searchParams.set('view',pageRef.current);history.pushState(null,'',restore);setError('Save or discard your record edits first.');return}const target=pageFromUrl();setPage(target);const stage=new URLSearchParams(location.search).get('stage');setJourneyStage(stage==='validate'||stage==='plan'||stage==='apply'?stage:'idea');setJourneyFocus('')};addEventListener('popstate',sync);return()=>removeEventListener('popstate',sync)},[])
 useEffect(()=>{const onChange=(event:Event)=>{const next=(event as CustomEvent<'en'|'ar'>).detail;if(next==='en'||next==='ar')setLanguage(next)};addEventListener('dukkan-language-change',onChange);return()=>removeEventListener('dukkan-language-change',onChange)},[])
 useEffect(()=>{setChatRequestFromPage(null);setSelectedRecordId(null);setDocumentPanelOpen(false);setSidebarDocument(null);setWorkspaceArtifacts([]);setArtifactScopeLoaded('');setArtifactsError('')},[scope])
 useEffect(()=>{const controller=new AbortController();void chatRequest('/api/workspaces/'+encodeURIComponent(scope)+'/artifacts',z.object({artifacts:z.array(artifactSchema)}),controller.signal).then(result=>{if(!controller.signal.aborted){setWorkspaceArtifacts(result.artifacts);setArtifactScopeLoaded(scope);setArtifactsError('')}}).catch(()=>{if(!controller.signal.aborted)setArtifactsError(language==='ar'?'المسودات غير متاحة الآن. ملاحظاتك في المتصفح لم تتغير.':'AI drafts are unavailable just now. Your browser notes are unchanged.')});return()=>controller.abort()},[scope,artifactRefresh])

 function commit(next:Workspace):Promise<WriteResult>{
  if(!mounted.current)return Promise.resolve({ok:false,reason:"The workspace session ended."})
  if(!demo&&!ideas.selectedId)return Promise.resolve({ok:false,reason:'Create an idea first.'})
  const parsed=workspaceSchema.safeParse({...reconcileContext(workspace,next),updatedAt:new Date().toISOString()})
  if(!parsed.success){setError('Invalid change was not saved.');return Promise.resolve({ok:false,reason:'Invalid change was not saved.'})}
  const value=parsed.data,epoch=session.current,number=++serial.current,key=ideaKey(ideas.selectedId),currentWriter=activeWriter.current
  setWorkspace(value)
  if(demo){try{saveExampleSession(sessionStorage,new URLSearchParams(location.search).get('example')||'default',value);setError('');setNotice(language==='ar'?'حُفظ في جلسة المثال':'Saved in this example session');return Promise.resolve({ok:true})}catch{const reason=language==='ar'?'تعذّر حفظ المثال. تبقى التعديلات في هذه الصفحة فقط.':'Could not save the example. Changes remain on this page only.';setError(reason);return Promise.resolve({ok:false,reason})}}
  realWorkspace.current=value
  const persist=()=>currentWriter?currentWriter.persist(value,()=>session.current===epoch):{ok:false,reason:'Browser storage is unavailable.'}
  const pending=navigator.locks?navigator.locks.request(FOLDERS_KEY,()=>readIdeas().folders.some(folder=>folder.id===ideas.selectedId)?navigator.locks.request(key,persist):{ok:false,reason:'This idea was removed. Restore it from the bin before editing.'}):Promise.resolve({ok:false,reason:'Safe browser saving requires Web Locks. Your changes remain in this tab.'})
  lastWrite.current=pending.catch(e=>({ok:false,reason:e instanceof Error?e.message:'Saving failed.'} as WriteResult)).then(async result=>{if(result.ok){try{await flushBusinessStorage()}catch(e){result={ok:false,reason:e instanceof Error?e.message:'Cloud save failed. Recovery copy retained.'}}}if(epoch===session.current&&number===serial.current){setError(result.ok?'':result.reason||'Saving failed.');if(result.ok)setNotice(language==='ar'?'تم الحفظ':'Saved')}return result})
  return lastWrite.current
 }

 function openSample(){if(areaDirtyRef.current||hasUnsentMessage){setError(language==='ar'?'احفظ تعديلاتك أو تجاهلها قبل فتح المثال.':'Save or discard your edits before opening the sample.');return}location.href='./?example=kuwait-service&view=home&intro=0'}
 function leaveExample(){if(scenarioDirty||areaDirty||lifecycleDirty||sidebarDirty||recordDirty||hasUnsentMessage){setError(language==='ar'?'احفظ تعديلاتك قبل الخروج.':'Save your edits before leaving.');return}session.current++;setDemo(false);setWorkspace(realWorkspace.current);setOnboarding(false);const url=new URL(location.href);url.searchParams.delete('example');url.searchParams.delete('conversation');url.searchParams.delete('view');history.replaceState(null,'',url);setPage('work')}

 async function openIdea(id:string){
  if(id===ideas.selectedId&&!demo){navigate('home');return}
  if(scenarioDirty||areaDirty||lifecycleDirty||sidebarDirty||recordDirty){setError(language==='ar'?'احفظ تعديلات المستند قبل تغيير الفكرة.':'Save your document edits before changing ideas.');return}
  if(hasUnsentMessage){setError(language==='ar'?'لديك رسالة لم تُرسل. أرسلها أو امسحها قبل تغيير الفكرة.':'You have an unsent message. Send or clear it before switching ideas.');navigate('work');return}
  if(demo)leaveExample()
  const pending=await lastWrite.current
  if(!pending.ok){setError(pending.reason||'Save this idea before switching.');return}
  try{
   const next=await selectIdea(id),item=readIdea(id)
   if(item.error){setError(item.error);return}
   session.current++;serial.current=0;activeWriter.current=new WorkspaceWriter(getBusinessStorage(),ideaKey(id));realWorkspace.current=item.workspace
   setIdeas(next);setWorkspace(item.workspace);setError('');setPage('home');setMenu(false);setHasUnsentMessage(false)
   const url=new URL(location.href);url.searchParams.delete('conversation');url.searchParams.delete('example');url.searchParams.delete('view');history.replaceState(null,'',url)
  }catch(e){setError((e as Error).message)}
 }

 async function createIdea(){
  if(scenarioDirty||areaDirty||lifecycleDirty||sidebarDirty||recordDirty){setError(language==='ar'?'احفظ تعديلات المستند قبل تغيير الفكرة.':'Save your document edits before changing ideas.');return}
  if(hasUnsentMessage){setError(language==='ar'?'لديك رسالة لم تُرسل. أرسلها أو امسحها قبل إنشاء فكرة أخرى.':'You have an unsent message. Send or clear it before creating another idea.');navigate('work');return}
  const pending=await lastWrite.current
  if(!pending.ok){setError(pending.reason||'Save this idea before creating another.');return}
  try{
   const next=await addIdea(language==='ar'?'فكرة جديدة':'New idea'),item=readIdea(next.selectedId)
   session.current++;serial.current=0;activeWriter.current=new WorkspaceWriter(getBusinessStorage(),ideaKey(next.selectedId));realWorkspace.current=item.workspace
   setIdeas(next);setWorkspace(item.workspace);setIdeaDraft('');setProjectTitleDraft('');setCustomerDraft('');setOnboarding(true);setError('');setPage('work');setMenu(false);setDemo(false);setHasUnsentMessage(false)
   const url=new URL(location.href);url.searchParams.delete('conversation');url.searchParams.delete('example');url.searchParams.set('view','work');history.replaceState(null,'',url)
  }catch(e){setError((e as Error).message)}
 }

 function activateCollection(next:ReturnType<typeof readIdeas>){
  const item=readIdea(next.selectedId)
  session.current++;serial.current=0;activeWriter.current=new WorkspaceWriter(getBusinessStorage(),ideaKey(next.selectedId));realWorkspace.current=item.workspace
  setIdeas(next);setWorkspace(item.workspace);setDemo(false);setOnboarding(false);setEditingProjectTitle(false);setHasUnsentMessage(false);setIdeaDraft('');setCustomerDraft('');setError(item.error);setPage('home')
  const url=new URL(location.href);for(const key of ['conversation','example','view','stage'])url.searchParams.delete(key);history.replaceState(null,'',url)
 }
 async function removeIdea(id:string){
  if(scenarioDirty||areaDirty||lifecycleDirty||sidebarDirty||recordDirty){setError(language==='ar'?'احفظ تعديلات المستند قبل تغيير الفكرة.':'Save your document edits before changing ideas.');return}
  if(hasUnsentMessage){setManagementError('Send or clear your unsent message before removing an idea.');return}
  setManagementBusy(true);setManagementError('')
  try{const pending=await lastWrite.current;if(!pending.ok)throw new Error(pending.reason||'Save your changes first.')
   const next=await moveIdeaToBin(id)
   if(id===ideas.selectedId)activateCollection(next);else setIdeas(next)
   setIdeaActions('');setArchiveRevision(value=>value+1);setNotice('Idea moved to the bin. Restore it from Manage ideas.')
  }catch(e){setManagementError((e as Error).message)}finally{setManagementBusy(false)}
 }
 async function restoreIdea(id:string){
  setManagementBusy(true);setManagementError('')
  try{const next=await restoreIdeaFromBin(id);if(!ideas.selectedId)activateCollection(next);else setIdeas(next);setArchiveRevision(value=>value+1);setNotice('Idea restored.')}
  catch(e){setManagementError((e as Error).message)}finally{setManagementBusy(false)}
 }
 async function renameSidebarIdea(){
  setManagementBusy(true);setManagementError('')
  try{setIdeas(await renameIdea(ideaActions,renameDraft));setIdeaActions('');setNotice('Idea renamed.')}
  catch(e){setManagementError((e as Error).message)}finally{setManagementBusy(false)}
 }
 async function finishOnboarding(save:boolean){
  if(onboardingSaving)return
  if(save&&ideaDraft.trim()){
   setOnboardingSaving(true)
   const result=await commit(reviseBrief(workspace,{...workspace.brief,idea:ideaDraft.trim(),customer:customerDraft.trim()}))
   if(!result.ok){setOnboardingSaving(false);return}
   try{setIdeas(await renameIdea(ideas.selectedId,projectTitleDraft.trim()||ideaDraft.trim().split(/[,.،]/)[0].slice(0,55)))}catch(e){setError((e as Error).message);setOnboardingSaving(false);return}
   setOnboardingSaving(false)
  }
  try{localStorage.setItem('dukkan-onboarded-v1','1')}catch{}
  setOnboarding(false);navigate('work');if(save)requestStage('Stress-test this business idea using sourced Kuwait market evidence: '+ideaDraft.trim()+'. Intended customer: '+customerDraft.trim()+'. Separate sourced facts, assumptions and unknowns. Identify the weakest assumption, options with trade-offs and one small measurable customer test. Do not invent demand or results.','idea')
 }

 function navigate(next:Page,keepRecord=false){if((areaDirty||lifecycleDirty||sidebarDirty||scenarioDirty||recordDirty)&&next!==page){setError(language==='ar'?'احفظ تعديلاتك أو تجاهلها أولاً.':'Save or discard your edits first.');return}if(!keepRecord)setSelectedRecordId(null);setPage(next);setMenu(false);setBusinessPickerOpen(false);const url=new URL(location.href);url.searchParams.set('view',next);if(url.href!==location.href)history.pushState(null,'',url)}
 function openJourney(stage:Stage,focus=''){setJourneyStage(stage);setJourneyFocus(focus);navigate('roadmap');const url=new URL(location.href);url.searchParams.set('stage',stage);history.replaceState(null,'',url)}
 function requestStage(prompt:string,stage:Stage,requestedAction:RequestedAction=stage==='apply'?{type:'application_worksheet'}:{type:'stage_draft',stage}){setJourneyStage(stage);setChatRequestFromPage({nonce:++requestCounter.current,scope,stage,prompt:stage==='idea'?prompt+'\n'+conversationStages[0].prompt:prompt,requestedAction});navigate('work')}
 function businessSummary(){return buildAreaChatPrompt({language,areaLabel:selectedName,viewLabel:language==='ar'?'سجلات المشروع':'business records',records:workspace.lifecycle})}
 function startNextMove(){
  if(nextMove==='checking')return
  if(nextMove==='unavailable'){setArtifactsError('');setArtifactRefresh(value=>value+1);return}
  if(nextMove==='enter'){setIdeaDraft(workspace.brief.idea);setCustomerDraft(workspace.brief.customer);setProjectTitleDraft(selected?.name||'');setOnboarding(true);return}
  if(nextMove==='reviewIdea'&&latestIdeaDraft){setChatRequestFromPage({nonce:++requestCounter.current,scope,conversationId:latestIdeaDraft.conversationId});navigate('work');return}
  if(nextMove==='reviseIdea'||nextMove==='revise'){openJourney('idea');return}
  if(nextMove==='parkIdea'||nextMove==='paused'){openJourney('validate');return}
  if(nextMove==='recordResult'||nextMove==='decide'||nextMove==='review'){
   setJourneyStage('validate');setChatRequestFromPage({nonce:++requestCounter.current,scope,stage:'validate',prompt:businessSummary()+'\n\n'+'Help me review my customer test. Use what I have already told you, ask for the actual result if missing, and offer a result or decision update for me to approve here. Do not invent observations.'});navigate('work');return
  }
  const stage=nextMove==='designTest'?'validate':nextMove==='plan'?'plan':nextMove==='prepare'?'apply':'idea'
  const step=conversationStages.find(row=>row.id===stage)!
  requestStage(businessSummary()+'\n\n'+step.prompt,stage,step.action)
 }
 function openSavedArtifact(item:ChatArtifact){if(lifecycleDirty||areaDirty||sidebarDirty||scenarioDirty||recordDirty){setError(language==='ar'?'احفظ تعديلات السجل أو تجاهلها أولاً.':'Save or discard your record edits first.');return}setSidebarDocument({...item});setSidebarTab(item.id);setDocumentPanelOpen(true);navigate('work')}
 function openDashboardRecord(row:LifecycleRecord){if(areaDirty||lifecycleDirty||sidebarDirty||scenarioDirty||recordDirty){setError(language==='ar'?'احفظ تعديلاتك أولاً.':'Save or discard your edits first.');return}const area=recordArea(row);if(!area){setError('This record type cannot be opened.');return}setSelectedRecordId(row.id);setSelectionRequest(value=>value+1);navigate(area,true)}
 async function applyChatUpdate(payload:unknown):Promise<WriteResult>{
  try{
   const next=applyConversationProposal(workspace,payload),id=ideas.selectedId
   const result=await commit(next)
   if(result.ok&&!demo&&['New idea','Untitled idea','My first idea','فكرة جديدة'].includes(selected?.name||'')&&next.brief.idea.trim()&&readIdeas().selectedId===id){
    try{setIdeas(await renameIdea(id,next.brief.idea.split(/[.،\n]/)[0].slice(0,60)))}catch{setNotice('Your brief was saved. You can name the idea from its sidebar menu.')}
   }
   return result
  }catch(e){return {ok:false,reason:(e as Error).message}}
 }
 function saveEvidence(entry:Evidence){const exists=workspace.evidence.some(e=>e.id===entry.id);commit({...workspace,evidence:exists?workspace.evidence.map(e=>e.id===entry.id?entry:e):[...workspace.evidence,entry]});setEvidenceOpen(false)}
 async function saveProjectTitle(){
  const title=projectTitleDraft.trim()
  if(!title||demo)return
  try{setIdeas(await renameIdea(ideas.selectedId,title));setEditingProjectTitle(false);setError('')}
  catch(e){setError(e instanceof Error?e.message:'Project name was not saved.')}
 }

 async function bringIdeaText(raw:string){
  if(scenarioDirty||areaDirty||lifecycleDirty||sidebarDirty||recordDirty){setError(language==='ar'?'احفظ تعديلات المستند قبل تغيير الفكرة.':'Save your document edits before changing ideas.');return}
  if(hasUnsentMessage){setManagementError('Send or clear your unsent chat message before importing an idea.');return}
  if(raw.length>4_000_000){setManagementError('This idea is too large to import.');return}
  setManagementBusy(true);setManagementError('')
  try{
   const pending=await lastWrite.current
   accountSession.current.assert()
   if(!pending.ok)throw new Error(pending.reason||'Save the current idea before importing.')
   const next=await importIdea(raw)
   setManageOpen(false)
   setPastedIdeaJson('')
   await openIdea(next.selectedId)
  }catch(e){setManagementError(e instanceof Error?e.message:'The idea could not be imported.')}
  finally{setManagementBusy(false)}
 }
 async function bringIdea(file:File|null){
  if(!file)return
  if(file.size>4_000_000){setManagementError('This file is too large for a single idea.');return}
  const raw=await file.text();if(!mounted.current)return;accountSession.current.assert();await bringIdeaText(raw)
 }
 async function keepOnlySelected(){
  if(scenarioDirty||areaDirty||lifecycleDirty||sidebarDirty||recordDirty){setError(language==='ar'?'احفظ تعديلات المستند قبل تغيير الفكرة.':'Save your document edits before changing ideas.');return}
  if(hasUnsentMessage){setManagementError('Send or clear your unsent chat message before archiving ideas.');return}
  setManagementBusy(true);setManagementError('')
  try{
   const pending=await lastWrite.current
   accountSession.current.assert()
   if(!pending.ok)throw new Error(pending.reason||'Save this idea first.')
   const next=await archiveOtherIdeas(ideas.selectedId)
   setIdeas(next);setArchiveConfirm(false);setArchiveRevision(value=>value+1);setNotice(language==='ar'?'أُرشفت الأفكار الأخرى ويمكن استعادتها':'Other ideas archived. You can restore them.');setManageOpen(false);navigate('home')
  }catch(e){setManagementError(e instanceof Error?e.message:'Ideas could not be archived.')}
  finally{setManagementBusy(false)}
 }
 async function restoreIdeas(){
  setManagementBusy(true);setManagementError('')
  try{const next=await restoreArchivedIdeas();setIdeas(next);setArchiveRevision(value=>value+1);setNotice(language==='ar'?'استُعيدت الأفكار':'Ideas restored.')}
  catch(e){setManagementError(e instanceof Error?e.message:'The archive could not be restored.')}
  finally{setManagementBusy(false)}
 }
 function bringArchiveText(raw:string){
  if(raw.length>8_000_000){setManagementError('This archive is too large.');return}
  try{loadArchiveFile(raw);setArchiveRevision(value=>value+1);setPastedArchiveJson('');setManagementError('');setNotice('Archive loaded. Choose Restore archived ideas to review it.')}
  catch(e){setManagementError(e instanceof Error?e.message:'The archive file could not be read.')}
 }
 async function bringArchive(file:File|null){
  if(!file)return
  if(file.size>8_000_000){setManagementError('This archive is too large.');return}
  bringArchiveText(await file.text())
 }
 let bin:ReturnType<typeof readIdeaBin>=[]
 let binError=''
 try{bin=readIdeaBin()}catch(e){binError=(e as Error).message}
 let savedArchive:ReturnType<typeof readArchive>=null
 try{savedArchive=readArchive()}catch{}
 void archiveRevision

 const areaIcons={market:Lightbulb,finance:Wallet,sales:Users,people:BriefcaseBusiness,operations:ShoppingCart,licences:ScrollText}
 const nav=<>{(Object.keys(areaLabels) as AreaName[]).map(id=>{const Icon=areaIcons[id];return <button key={id} className={page===id?'active':''} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><Icon size={18}/><span>{areaLabels[id][language==='ar'?1:0]}</span></button>})}</>

 return <DoorEntrance replay={entranceReplay}><div className="dukkan-app customer-shell" lang={language} dir={language==='ar'?'rtl':'ltr'}>
  {menu&&<button className="navigation-scrim" aria-label={language==='ar'?'إغلاق التنقل':'Close navigation overlay'} onClick={()=>setMenu(false)}/>}
  <aside className={'dukkan-sidebar '+(menu?'mobile-open':'')} role={menu?'dialog':undefined} aria-modal={menu||undefined} aria-label={language==='ar'?'التنقل':'Navigation'}>
   <div className="dukkan-brand"><img src="./brand/dukkan-08-door-icon.svg" alt=""/><img className="dukkan-wordmark" src={language==='ar'?'./brand/dukkan-06-arabic-wordmark.svg':'./brand/dukkan-07-english-wordmark.svg'} alt={language==='ar'?'دُكَّان':'Dukkan'}/><button className="dukkan-close-mobile" aria-label={language==='ar'?'إغلاق القائمة':'Close navigation'} onClick={()=>setMenu(false)}><X size={19}/></button></div>
<p className="dukkan-brand-slogan">{language==='ar'?'من الفكرة إلى الرخصة':'From idea to licence'}</p>
   <div className="business-picker"><button className="business-picker-button" aria-expanded={businessPickerOpen} aria-controls="business-picker-menu" onClick={()=>setBusinessPickerOpen(value=>!value)}><FolderClosed size={17}/><span>{selectedName}</span><ChevronDown size={15}/></button>{businessPickerOpen&&<div id="business-picker-menu">   <section className="dukkan-ideas business-picker-menu" aria-label={t.ideas}><div className="dukkan-ideas-heading"><span>{t.ideas}</span><button aria-label={t.newIdea} title={t.newIdea} onClick={()=>void createIdea()}><Plus size={17}/></button></div><div className="dukkan-idea-list">{demo&&<div className="dukkan-idea-row"><button className="selected" onClick={()=>navigate('home')}><FolderClosed size={17}/><span>{selectedName}</span></button></div>}{ideas.folders.map(folder=><div className="dukkan-idea-row" key={folder.id}><button className={!demo&&ideas.selectedId===folder.id?'selected':''} aria-current={!demo&&ideas.selectedId===folder.id?'page':undefined} onClick={()=>void openIdea(folder.id)}><FolderClosed size={17}/><span>{folder.name}</span></button><button className="dukkan-idea-options" aria-label={(language==='ar'?'إدارة ':'Manage ')+folder.name} title={(language==='ar'?'إدارة ':'Manage ')+folder.name} disabled={demo||managementBusy} onClick={()=>{setIdeaActions(folder.id);setRenameDraft(folder.name);setManagementError('')}}><PenLine size={15}/></button></div>)}</div><button className="dukkan-sample-launch" onClick={openSample}><Presentation size={15}/>{language==='ar'?'استكشف مشروعاً توضيحياً':'Explore a sample business'}</button><button className="dukkan-manage-launch" disabled={demo} onClick={()=>{setManageOpen(true);setBinOpen(true);setArchiveConfirm(false);setManagementError('')}}><Archive size={15}/>{language==='ar'?'إدارة الأفكار':'Manage ideas'}</button></section></div>}</div>
   <nav className="dukkan-primary-nav" aria-label={language==='ar'?'التنقل الرئيسي':'Main navigation'}><button className={page==='home'?'active':''} aria-current={page==='home'?'page':undefined} onClick={()=>navigate('home')}><Home size={17}/><span>{language==='ar'?'الرئيسية':'Overview'}</span></button><button className={page==='saved'?'active':''} aria-current={page==='saved'?'page':undefined} onClick={()=>navigate('saved')}><BookOpen size={17}/><span>{t.saved}</span></button></nav>
   <section className="business-section-nav"><button className="sidebar-group-toggle" aria-expanded={sectionsExpanded} aria-controls="business-section-links" onClick={()=>setSectionsExpanded(value=>!value)}><span>{language==='ar'?'أقسام المشروع':'Business'}</span><ChevronDown size={14}/></button><nav id="business-section-links" className="dukkan-primary-nav" hidden={!sectionsExpanded} aria-label={language==='ar'?'أقسام المشروع':'Business sections'}>{nav}</nav></section>
   <div className="dukkan-chat-history-host" ref={setChatHistoryHost}/>
   <div className="dukkan-sidebar-bottom"><button aria-current={page==='guide'?'page':undefined} onClick={()=>navigate('guide')}><Compass size={16}/>{language==='ar'?'كيف يعمل دكان':'How Dukkan works'}</button><button aria-current={page==='evidence'?'page':undefined} onClick={()=>navigate('evidence')}><Library size={16}/>{language==='ar'?'مكتبة الأدلة':'Evidence library'}</button><button aria-current={page==='phases'?'page':undefined} onClick={()=>navigate('phases')}><Route size={16}/>{language==='ar'?'المراحل القادمة':'Next phases'}</button><button aria-current={page==='about'?'page':undefined} onClick={()=>navigate('about')}><Info size={16}/>{about.label}</button><div><Button variant="ghost" size="sm" onClick={()=>setLanguage(language==='en'?'ar':'en')}>{language==='en'?'العربية':'English'}</Button></div></div>
  </aside>
  <div className={'dukkan-main-shell '+(page!=='work'?'is-overview ':'')+(page==='work'&&documentPanelOpen?'has-context-panel':'')}>
   <header className="dukkan-topbar"><button className="dukkan-menu-button" aria-label={language==='ar'?'فتح القائمة':'Open navigation'} onClick={()=>setMenu(true)}><Menu size={19}/></button><div className="dukkan-top-title">{page==='about'?<Info size={17}/>:page==='guide'?<Compass size={17}/>:page==='evidence'?<Library size={17}/>:page==='phases'?<Route size={17}/>:<FolderOpen size={17}/>}<span>{page==='about'?about.label:page==='guide'?(language==='ar'?'كيف يعمل دكان':'How Dukkan works'):page==='evidence'?(language==='ar'?'مكتبة الأدلة':'Evidence library'):page==='phases'?(language==='ar'?'المراحل القادمة':'Next phases'):selectedName}</span></div><div className="dukkan-top-actions">{page==='work'&&(!!ideas.selectedId||demo)&&<button className="context-panel-toggle" aria-label={documentPanelOpen?(language==='ar'?'إغلاق المستندات':'Close documents'):(language==='ar'?'فتح المستندات':'Open documents')} title={documentPanelOpen?'Close documents':'Open documents'} aria-expanded={documentPanelOpen} onClick={()=>{if(documentPanelOpen&&sidebarDirty){setError(language==='ar'?'احفظ تعديلات المستند أو تجاهلها أولاً.':'Save or discard your document edits first.');return}setDocumentPanelOpen(value=>!value)}}>{documentPanelOpen?<PanelRightClose size={18}/>:<PanelRight size={18}/>}</button>}{demo&&<button onClick={leaveExample}>{language==='ar'?'اخرج من المثال':'Leave example'}</button>}{error&&<span>{language==='ar'?'لم يُحفظ':'Not saved'}</span>}</div></header>
   {error&&<div className="dukkan-error" role="alert">{error}</div>}
   <main className={'dukkan-main '+(page==='work'?'in-work':'')}>
    {!ideas.selectedId&&!demo&&!['guide','evidence','phases','about'].includes(page)&&<section className="dukkan-home"><h1>{language==='ar'?'ابدأ فكرتك الأولى':'Start your first idea'}</h1><p>{language==='ar'?'صف فكرتك، وراجعها بأدلة السوق، وصمّم اختباراً وحدّد خطوتك التالية.':'Describe an idea. Dukkan helps you challenge it with market evidence, design a test and choose the next step.'}</p><div className="flex flex-wrap gap-2"><Button onClick={()=>void createIdea()}>{language==='ar'?'فكرة جديدة':'New idea'}</Button><Button variant="outline" onClick={openSample}>{language==='ar'?'اعرض المثال':'See the worked example'}</Button><Button variant="ghost" onClick={()=>navigate('guide')}>{language==='ar'?'كيف يعمل دكان':'How Dukkan works'}</Button></div></section>}
    {page==='home'&&(!!ideas.selectedId||demo)&&<BusinessOverview demo={demo} language={language} workspace={workspace} name={selectedName} artifacts={shownArtifacts} nextTitle={nextTitle} nextDescription={nextDescription} decision={recentDecision} onStart={startNextMove} onContinue={()=>navigate('work')} onMarket={()=>navigate('market')} onOpenArtifact={openSavedArtifact} onRecords={()=>navigate('saved')} onCosts={()=>navigate('finance')} onWork={openDashboardRecord} onLicences={()=>navigate('licences')} onDraft={prompt=>{setChatRequestFromPage({nonce:++requestCounter.current,scope,prompt});navigate('work')}} onPdf={()=>{setChatRequestFromPage({nonce:++requestCounter.current,scope,prompt:pearlPdfPrompt,requestedAction:{type:'official_pdf'}});navigate('work')}}/>}
    {Object.hasOwn(areaLabels,page)&&(!!ideas.selectedId||demo)&&<BusinessArea key={scope+page} area={page as AreaName} selectedRecordId={selectedRecordId} selectionRequest={selectionRequest} onSelectedRecordChange={setSelectedRecordId} language={language} workspace={workspace} artifacts={shownArtifacts} onSave={commit} onDirty={setAreaDirty} onAsk={prompt=>{if(areaDirty){setError(language==='ar'?'احفظ التعديلات أو تجاهلها أولاً.':'Save or discard your edits first.');return}setChatRequestFromPage({nonce:++requestCounter.current,scope,prompt});navigate('work')}} onCosts={()=>navigate('estimates')} onEvidence={()=>setEvidenceOpen(true)} onOpenArtifact={artifact=>{if(areaDirty)return;openSavedArtifact(artifact);navigate('work')}} onPdf={()=>{if(areaDirty)return;setChatRequestFromPage({nonce:++requestCounter.current,scope,prompt:demo?pearlPdfPrompt:'Prepare the registered KDIPA investment application PDF only if it is relevant to my saved business. Use only confirmed facts and leave missing fields blank. Explain applicability uncertainties. Do not submit.',requestedAction:{type:'official_pdf'}});navigate('work')}}/>}
    <div className="dukkan-work-view" hidden={page!=='work'||(!ideas.selectedId&&!demo)}><ChatWorkspace onPdfProgress={showPdfProgress} historyHost={chatHistoryHost} navigationBlocked={areaDirty||lifecycleDirty||sidebarDirty||scenarioDirty||recordDirty} onOpenArtifact={openSavedArtifact} onApplyProposal={applyChatUpdate} onOpenBusiness={stage=>openJourney(stage)} key={demo?'example':ideas.selectedId} workspaceContext={workspace} scope={scope} taskHost={taskHost} onActivate={()=>navigate('work')} language={language} demo={demo} workspaceArtifacts={shownArtifacts} requested={chatRequestFromPage} onArtifactsChange={()=>setArtifactRefresh(value=>value+1)} onComposerChange={setHasUnsentMessage} onRequestBlocked={setError} onSaveBrief={brief=>commit(reviseBrief(workspace,brief))} onSaveCosts={costs=>commit({...workspace,costs})} onSaveTest={test=>commit(saveTestPlan(workspace,test))} onSaveResult={test=>commit({...workspace,hypotheses:workspace.hypotheses.map(item=>item.id===test.id?test:item)})} onRecordDecision={(hypothesis:Hypothesis,outcome:Decision['outcome'],reason:string)=>commit(recordDecision(workspace,hypothesis,outcome,reason))} onAdoptTest={(artifact,proposal)=>{try{return commit(adoptProposedTest(workspace,proposal,{artifactId:artifact.id,conversationId:artifact.conversationId,title:artifact.title}))}catch(e){setError((e as Error).message)}}} onSaveIdeaReview={(artifact,choice,reason,selectedOption,customOption)=>{try{return commit(recordIdeaReviewChoice(workspace,{artifactId:artifact.id,conversationId:artifact.conversationId,choice,reason,selectedOption,customOption,reviewSummary:artifact.ideaReview?.rationale||''}))}catch(e){setError((e as Error).message)}}} onOpenEvidence={()=>setEvidenceOpen(true)} onOpenSetup={()=>navigate('saved')}/></div>
    {page==='guide'&&<GuidePage language={language} demo={demo} hasIdea={!!ideas.selectedId} onNavigate={navigate} onAsk={(prompt,intent)=>{if(intent==='choice'&&latestIdeaDraft){setChatRequestFromPage({nonce:++requestCounter.current,scope,conversationId:latestIdeaDraft.conversationId});navigate('work');return}if(intent==='idea'){requestStage(prompt,'idea');return}if(intent==='test'){requestStage(prompt,'validate');return}setChatRequestFromPage({nonce:++requestCounter.current,scope,prompt});navigate('work')}} onOpenExample={openSample} onNewIdea={()=>void createIdea()}/>}
    {page==='evidence'&&<EvidenceLibrary language={language} onAsk={prompt=>{setChatRequestFromPage({nonce:++requestCounter.current,scope,prompt});navigate('work')}}/>}
    {page==='phases'&&<NextPhases language={language} onNavigate={navigate}/>}
    {page==='about'&&<div className="dukkan-about"><div className="dukkan-about-intro"><span className="dukkan-kicker">{about.label}</span><h1>{about.title}</h1><p>{about.intro}</p><Button onClick={()=>navigate('work')}><MessageCircle size={17}/>{about.open}</Button></div><div className="dukkan-about-flow">{about.steps.map(([title,body],index)=><section key={title}><span>{String(index+1).padStart(2,'0')}</span><h2>{title}</h2><p>{body}</p></section>)}</div><div className="dukkan-about-boundary"><h2>{about.boundaryTitle}</h2><p>{about.boundary}</p></div></div>}
    <div id="work-content-roadmap" role="tabpanel" aria-label={language==='ar'?'العمل النشط':'Active work'} className="dukkan-business-page" hidden={page!=='roadmap'||(!ideas.selectedId&&!demo)}>
     <header className="dukkan-business-heading"><div><span className="dukkan-kicker">{language==='ar'?'مساحة المشروع':'Business workspace'}</span><h1>{selectedName}</h1><p>{language==='ar'?'كل مرحلة تساعدك على اتخاذ قرار. تحفظ المسودات والاختبارات والقرارات مع هذه الفكرة.':'Each stage helps you make a decision. Drafts, tests and decisions stay with this idea.'}</p></div><button onClick={()=>navigate('saved')}><BookOpen size={17}/>{t.saved}</button></header>
<LifecycleDashboard onDirty={setLifecycleDirty} language={language} onOpenArea={navigate} initialCategory={lifecycleCategory} compact key={scope} scope={scope} onOpenChat={conversationId=>{setChatRequestFromPage({nonce:++requestCounter.current,scope,conversationId});navigate('work')}} workspace={workspace} artifacts={shownArtifacts} onSave={commit} onOpenArtifact={openSavedArtifact} onAsk={prompt=>{setChatRequestFromPage({nonce:++requestCounter.current,scope,prompt});navigate('work')}}/>     <details className="work-journey-details"><summary>{language==='ar'?'تفاصيل الفكرة والاختبارات':'Idea and test details'}</summary><FounderWorkbench onSaveEvidence={note=>commit({...workspace,evidence:workspace.evidence.some(item=>item.id===note.id)?workspace.evidence.map(item=>item.id===note.id?note:item):[...workspace.evidence,note]})} onSaveSetup={setup=>commit({...workspace,setup})} key={scope} workspace={workspace} artifacts={shownArtifacts} demo={demo} language={language} stage={journeyStage} focus={journeyFocus} onStageChange={stage=>openJourney(stage)} stepsDisabled={hasUnsentMessage||!workspace.brief.idea.trim()} onAskSteps={requestStage} onOpenArtifact={openSavedArtifact} onPrepareDraft={()=>requestStage('Prepare a business setup application worksheet for my Kuwait business using my saved brief. Fill only known fields, leave unknown fields blank and list what is missing. Ask at most one essential question. Do not submit anything.','apply',{type:'application_worksheet'})} onSaveBrief={brief=>commit(reviseBrief(workspace,brief))} onSaveCosts={costs=>commit({...workspace,costs})} onSaveTest={test=>commit(saveTestPlan(workspace,test))} onSaveResult={test=>commit({...workspace,hypotheses:workspace.hypotheses.map(item=>item.id===test.id?test:item)})} onRecordDecision={(hypothesis:Hypothesis,outcome:Decision['outcome'],reason:string)=>commit(recordDecision(workspace,hypothesis,outcome,reason))} onAdoptTest={(artifact,proposal)=>{try{return commit(adoptProposedTest(workspace,proposal,{artifactId:artifact.id,conversationId:artifact.conversationId,title:artifact.title}))}catch(e){setError((e as Error).message)}}} onSaveIdeaReview={(artifact,choice,reason,selectedOption,customOption)=>{try{return commit(recordIdeaReviewChoice(workspace,{artifactId:artifact.id,conversationId:artifact.conversationId,choice,reason,selectedOption,customOption,reviewSummary:artifact.ideaReview?.rationale||''}))}catch(e){setError((e as Error).message)}}} onOpenEvidence={()=>setEvidenceOpen(true)} onOpenSetup={()=>navigate('saved')}/></details>
     <footer className="dukkan-business-footer"><span>{language==='ar'?'يمكنك الرجوع لأي مرحلة.':'You can revisit any stage.'}</span><button onClick={()=>navigate('home')}>{language==='ar'?'اعرض الخطوة التالية':'See my next step'}<ChevronRight size={15} className="dukkan-chevron-forward"/></button></footer>
    </div>
<section id="work-content-estimates" role="tabpanel" aria-label={language==='ar'?'التكاليف':'Costs'} hidden={page!=='estimates'||(!ideas.selectedId&&!demo)}>    {(!!ideas.selectedId||demo)&&<div className="dukkan-detail-page"><span className="dukkan-kicker">{language==='ar'?'التخطيط المالي':'Financial planning'}</span><h1>{language==='ar'?'هل يمكن أن تنجح الأرقام؟':'Could the numbers work?'}</h1><p className="dukkan-detail-intro">{language==='ar'?'أدخل تقديراتك أنت. هذه ليست إيرادات أو أرباحاً فعلية، ولا توقعاً للطلب.':'Enter your own estimates. These are not actual revenue or profit, and are not a demand forecast.'}</p><form className="dukkan-estimate-form" onSubmit={event=>{event.preventDefault();void commit({...workspace,costs:costDraft})}}>{([['price',language==='ar'?'سعر الوحدة (د.ك)':'Price per unit (KWD)'],['variable',language==='ar'?'تكلفة الوحدة (د.ك)':'Cost per unit (KWD)'],['fixed',language==='ar'?'التكاليف الثابتة شهرياً (د.ك)':'Monthly fixed costs (KWD)'],['units',language==='ar'?'الوحدات شهرياً':'Units per month']] as const).map(([field,label])=><label key={field}>{label}<input type="number" min="0" step={field==='units'?'1':'0.001'} value={costDraft[field]} onChange={event=>setCostDraft({...costDraft,[field]:event.target.value})}/></label>)}<Button type="submit" disabled={JSON.stringify(costDraft)===JSON.stringify(workspace.costs)}><Check size={16}/>{language==='ar'?'احفظ التقديرات':'Save estimates'}</Button>{recordDirty&&<button type="button" className="work-discard" onClick={()=>setCostDraft(workspace.costs)}>{language==='ar'?'تجاهل التعديلات':'Discard edits'}</button>}</form><section className="dukkan-estimate-result"><span>{language==='ar'?'بناءً على افتراضاتك':'Based on your assumptions'}</span>{estimate.valid?<><strong>{estimate.breakEven===null?language==='ar'?'لا توجد نقطة تعادل بهذه المدخلات':'No break-even with these inputs':String(estimate.breakEven)+(language==='ar'?' وحدة للتعادل شهرياً':' units to break even monthly')}</strong><p>{language==='ar'?'العائد لكل وحدة بعد تكلفتها المتغيرة: ':'Contribution per unit after variable cost: '}KWD {estimate.margin.toFixed(3)}</p><p>{language==='ar'?'النتيجة التشغيلية في السيناريو: ':'Operating result in this scenario: '}KWD {estimate.result.toFixed(3)}</p></>:<p>{estimate.message}</p>}<small>{language==='ar'?'لا تشمل التقديرات التمويل أو الضرائب أو التدفق النقدي.':'Excludes funding, tax and cash timing.'}</small></section><CostScenarios key={scope} workspace={workspace} onSave={commit} unsaved={recordDirty} language={language} onDirty={setScenarioDirty}/></div>}
</section><section id="work-content-saved" role="tabpanel" aria-label={t.saved} hidden={page!=='saved'||(!ideas.selectedId&&!demo)}>    {(!!ideas.selectedId||demo)&&<div className="dukkan-saved"><div className="dukkan-saved-head"><div><span className="dukkan-kicker">{selectedName}</span><h1>{t.saved}</h1><p>{language==='ar'?'الملاحظات والقرارات ومسودات الذكاء الاصطناعي لهذه الفكرة.':'Notes, decisions and AI drafts for this idea.'}</p></div><Button variant="outline" onClick={()=>download((demo?'# Fictional example\n\n':'')+exportPlan(workspace),'dukkan-business-record.md','text/markdown')}><Download size={16}/>{t.export}</Button></div><section className="dukkan-saved-section"><h2>{language==='ar'?'مسودات للمراجعة':'Drafts to review'}</h2><p className="dukkan-section-explainer">{language==='ar'?'المسودات ناتجة عن المحادثات ولا تُضاف تلقائياً إلى سجل المشروع. افتح النسخة الأصلية للمراجعة.':'These come from your chats and do not automatically change your business record. Open the original version to review it.'}</p>{shownArtifacts.length?stageOrder.map((stage,index)=>{const items=shownArtifacts.filter(item=>artifactStage(item)===stage);return items.length?<div className="dukkan-saved-stage" key={stage}><h3>{about.steps[index][0]}</h3><DraftGroupList items={items} language={language} onOpen={openSavedArtifact}/></div>:null}):<p className="dukkan-empty">{artifactsError|| (language==='ar'?'لا توجد مسودات لهذه الفكرة بعد.':'No drafts for this idea yet.')}</p>}</section><section className="dukkan-saved-section"><div><h2>{t.notes}</h2><Button size="sm" onClick={()=>setEvidenceOpen(true)}><Plus size={15}/>{t.addNote}</Button></div>{workspace.evidence.length?workspace.evidence.map(note=><article key={note.id}><span>{note.kind} · {note.signal}</span><p>{note.text}</p><small>{note.source|| (language==='ar'?'دون مصدر محدد':'No source recorded')}</small></article>):<p className="dukkan-empty">{language==='ar'?'لا توجد ملاحظات بعد.':'No notes yet. Save a customer observation or a source you can check.'}</p>}</section><section className="dukkan-saved-section"><h2>{t.decisions}</h2>{decisionSummaries.length?decisionSummaries.slice().reverse().map(decision=><article key={decision.id}><span>{decision.label}</span><p>{decision.reason}</p></article>):<p className="dukkan-empty">{language==='ar'?'لا توجد قرارات محفوظة بعد.':'No decisions saved yet.'}</p>}</section></div>}
    {(!!ideas.selectedId||demo)&&!!workspace.savedTests.length&&<section className="dukkan-saved-review-history"><h2>{language==='ar'?'خطط الاختبار':'Test plans'}</h2>{workspace.savedTests.slice().reverse().map(saved=>{const test=workspace.hypotheses.find(item=>item.id===saved.hypothesisId);return <article key={saved.id}><span>{language==='ar'?'خطة محفوظة':'Saved plan'}</span><p>{saved.title}</p>{test&&<><small>{language==='ar'?'الطريقة: ':'Method: '}{test.test.method}</small><small>{language==='ar'?'معيار القرار: ':'Decision rule: '}{test.test.rule}</small><small>{test.test.result?language==='ar'?'سُجّلت نتيجة':'Result recorded':language==='ar'?'لا توجد نتيجة بعد':'No result recorded yet'}</small></>}{test?.test.provenance&&<small>{language==='ar'?'من مسودة: ':'From draft: '}{test.test.provenance.title}</small>}</article>})}</section>}
    {(!!ideas.selectedId||demo)&&!!workspace.ideaReviewDecisions.length&&<section className="dukkan-saved-review-history"><h2>{language==='ar'?'قرارات مراجعة الفكرة':'Idea-review choices'}</h2>{workspace.ideaReviewDecisions.slice().reverse().map(item=><article key={item.id}><span>{item.choice==='test'?language==='ar'?'اختبر':'Test':item.choice==='revise'?language==='ar'?'عدّل':'Revise':language==='ar'?'أوقف مؤقتاً':'Park'}</span><p>{item.reason}</p>{item.selectedOption&&<small>{language==='ar'?'الخيار المختار: ':'Selected option: '}{item.selectedOption}</small>}{item.customOption&&<small>{language==='ar'?'خيارك: ':'Your option: '}{item.customOption.title} · {item.customOption.tradeoff}</small>}{shownArtifacts.some(artifact=>artifact.id===item.artifactId)&&<button onClick={()=>openSavedArtifact(shownArtifacts.find(artifact=>artifact.id===item.artifactId)!)}>{language==='ar'?'افتح المراجعة الأصلية':'Open source review'}</button>}</article>)}</section>}
</section>
   </main>
   <WorkSidebar fillProgress={fillProgress} open={page==='work'&&documentPanelOpen} onClose={()=>{if(sidebarDirty){setError(language==='ar'?'احفظ تعديلات المستند أو تجاهلها أولاً.':'Save or discard your document edits first.');return}setDocumentPanelOpen(false)}} onRequestOpen={()=>setDocumentPanelOpen(true)} artifacts={shownArtifacts} onOpenArtifact={openSavedArtifact} revealRequest={sidebarReveal} recordDirty={recordDirty} language={language} scope={scope} active={sidebarTab} onSelect={setSidebarTab} document={sidebarDocument} onDirty={setSidebarDirty} onRefresh={()=>setArtifactRefresh(value=>value+1)}/>
  </div>
  {onboarding&&<div className="dukkan-onboarding-backdrop"><section className="dukkan-onboarding" role="dialog" aria-modal="true" aria-labelledby="onboard-title"><img src="./brand/dukkan-08-door-icon.svg" alt=""/><span>{language==='ar'?'ابدأ من هنا':'Start here'}</span><h1 id="onboard-title">{t.onboard}</h1><p>{t.onboardHint}</p><label>{language==='ar'?'اسم قصير للمشروع (اختياري)':'Short project name (optional)'}<input maxLength={80} value={projectTitleDraft} disabled={onboardingSaving} onChange={e=>setProjectTitleDraft(e.target.value)} placeholder={language==='ar'?'مثال: بيرل ستوديو':'For example: Pearl Studio'}/></label><label>{language==='ar'?'اشرح فكرتك':'Describe your idea'}<textarea autoFocus rows={3} maxLength={400} value={ideaDraft} disabled={onboardingSaving} onChange={e=>setIdeaDraft(e.target.value)} placeholder={language==='ar'?'مثال: متجر إلكتروني لمنتجات محلية':'For example: an online shop for local products'}/></label><label>{t.forWhom}<input maxLength={200} value={customerDraft} disabled={onboardingSaving} onChange={e=>setCustomerDraft(e.target.value)} placeholder={language==='ar'?'مثال: طلاب في الكويت':'For example: students in Kuwait'}/></label><div><Button disabled={!ideaDraft.trim()||onboardingSaving} onClick={()=>void finishOnboarding(true)}><Check size={16}/>{onboardingSaving?(language==='ar'?'جارٍ الحفظ':'Saving…'):t.saveIdea}</Button><button disabled={onboardingSaving} onClick={()=>void finishOnboarding(false)}>{t.skip}</button></div>{error&&<p role="alert" className="dukkan-onboarding-error">{error}</p>}</section></div>}
  {ideaActions&&<div className="dukkan-manage-backdrop"><section className="dukkan-manage-dialog" role="dialog" aria-modal="true" aria-label={language==='ar'?'إدارة الفكرة':'Manage idea'}><header className="dukkan-manage-head"><h2>{language==='ar'?'إدارة الفكرة':'Manage idea'}</h2><button aria-label={language==='ar'?'إغلاق':'Close'} onClick={()=>setIdeaActions('')}><X size={20}/></button></header><form onSubmit={e=>{e.preventDefault();void renameSidebarIdea()}}><label>{language==='ar'?'اسم الفكرة':'Idea name'}<input autoFocus maxLength={80} value={renameDraft} onChange={e=>setRenameDraft(e.target.value)}/></label><Button type="submit" disabled={managementBusy||!renameDraft.trim()}>{language==='ar'?'حفظ الاسم':'Save name'}</Button></form><hr/><p>{language==='ar'?'تُنقل الفكرة وعملها المحفوظ إلى السلة ويمكن استعادتها.':'The idea and its saved work move to the bin, where you can restore them.'}</p><Button variant="outline" disabled={managementBusy} onClick={()=>void removeIdea(ideaActions)}><Trash2 size={16}/>{language==='ar'?'نقل إلى السلة':'Move to bin'}</Button>{managementError&&<p role="alert">{managementError}</p>}</section></div>}
  {manageOpen&&<div className="dukkan-manage-backdrop"><section className="dukkan-manage-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-title" dir={language==='ar'?'rtl':'ltr'}><div className="dukkan-manage-head"><div><span className="dukkan-kicker">{language==='ar'?'مساحة العمل':'Workspace'}</span><h2 id="manage-title">{language==='ar'?'إدارة الأفكار':'Manage ideas'}</h2></div><button aria-label={language==='ar'?'إغلاق':'Close'} onClick={()=>{setManageOpen(false);setArchiveConfirm(false)}}><X size={18}/></button></div><p>{language==='ar'?'عدّل اسم الفكرة أو انقلها إلى السلة من الزر بجانب اسمها. استعد الأفكار المحذوفة هنا.':'Use the button beside an idea to rename it or move it to the bin. Restore removed ideas here.'}</p><details open={binOpen} onToggle={e=>setBinOpen(e.currentTarget.open)} className="dukkan-manage-group"><summary>{language==='ar'?'السلة':'Bin'} ({bin.length})</summary>{binError&&<p role="alert">{binError}</p>}{!bin.length&&!binError&&<p>{language==='ar'?'السلة فارغة.':'The bin is empty.'}</p>}{bin.map(folder=><div className="dukkan-bin-row" key={folder.id}><span>{folder.name}</span><Button variant="outline" disabled={managementBusy} onClick={()=>void restoreIdea(folder.id)}>{language==='ar'?'استعادة':'Restore'}</Button></div>)}</details><details className="dukkan-manage-group"><summary>{language==='ar'?'النسخ الاحتياطي والاستعادة':'Backup and recovery'}</summary><div className="dukkan-manage-group"><h3>{language==='ar'?'نقل فكرة':'Move an idea'}</h3><p>{language==='ar'?'نزّل الفكرة من المتصفح الأول ثم استورد الملف في المتصفح الثاني. سيبقى معرّفها كما هو حتى تظهر محادثاتها.':'Download the idea in one browser, then import it in the other. Its folder ID stays the same so its chats follow.'}</p><Button variant="outline" disabled={!ideas.selectedId||ideas.selectedId==='legacy'||managementBusy} onClick={()=>{try{download(exportIdea(ideas.selectedId),'dukkan-idea-'+ideas.selectedId+'.json','application/json')}catch(e){setManagementError((e as Error).message)}}}><Download size={15}/>{language==='ar'?'نزّل هذه الفكرة':'Download this idea'}</Button><label className="dukkan-file-label"><Upload size={15}/>{language==='ar'?'استورد ملف فكرة':'Import idea file'}<input type="file" accept=".json,application/json" disabled={managementBusy} onChange={e=>{void bringIdea(e.target.files?.[0]||null);e.target.value=''}}/></label><Button variant="ghost" disabled={!ideas.selectedId||ideas.selectedId==='legacy'||managementBusy} onClick={()=>{try{setShownIdeaJson(current=>current?'':exportIdea(ideas.selectedId));setManagementError('')}catch(e){setManagementError((e as Error).message)}}}>{language==='ar'?'اعرض بيانات الفكرة':'Show idea JSON'}</Button>{shownIdeaJson&&<label className="dukkan-json-label">{language==='ar'?'انسخ النص إلى المتصفح الآخر':'Select and copy into the other browser'}<textarea readOnly value={shownIdeaJson} rows={6} onFocus={e=>e.currentTarget.select()}/></label>}<label className="dukkan-json-label">{language==='ar'?'الصق بيانات الفكرة هنا':'Paste idea JSON here'}<textarea value={pastedIdeaJson} rows={4} onChange={e=>setPastedIdeaJson(e.target.value)} placeholder={language==='ar'?'ألصق النص المنسوخ':'Paste copied JSON'}/></label><Button variant="outline" disabled={!pastedIdeaJson.trim()||managementBusy} onClick={()=>void bringIdeaText(pastedIdeaJson)}><Upload size={15}/>{language==='ar'?'استورد النص':'Import pasted idea'}</Button></div><div className="dukkan-manage-group"><h3>{language==='ar'?'الأفكار السابقة':'Past ideas'}</h3><p>{language==='ar'?'احتفظ بالفكرة المحددة الآن وأرشف البقية داخل هذا المتصفح. يمكنك استعادتها لاحقاً.':'Keep the currently selected idea and archive the other browser folders. You can restore them later.'}</p><p className="dukkan-manage-keep"><FolderOpen size={15}/>{language==='ar'?'ستحتفظ بـ: ':'Keep: '}{selectedName}</p>{!archiveConfirm?<Button variant="outline" disabled={ideas.folders.length<=1||!!savedArchive||managementBusy} onClick={()=>setArchiveConfirm(true)}><Archive size={15}/>{language==='ar'?'أرشف الأفكار الأخرى':'Archive other ideas'}</Button>:<div className="dukkan-manage-confirm"><strong>{language==='ar'?'أرشفة '+(ideas.folders.length-1)+' فكرة أخرى؟':'Archive '+(ideas.folders.length-1)+' other idea folders?'}</strong><p>{language==='ar'?'يمكن استعادتها من النسخة المحفوظة هنا. نزّل نسخة منها أيضاً بعد الأرشفة.':'You can restore them from the archive. Download a copy after archiving too.'}</p><Button disabled={managementBusy} onClick={()=>void keepOnlySelected()}>{language==='ar'?'نعم، احتفظ بهذه الفكرة':'Yes, keep this idea'}</Button><Button variant="ghost" onClick={()=>setArchiveConfirm(false)}>{language==='ar'?'إلغاء':'Cancel'}</Button></div>}{savedArchive&&<div className="dukkan-manage-recovery"><span>{language==='ar'?'نسخة مؤرشفة متاحة':'An archive is available'}</span><Button variant="outline" disabled={managementBusy} onClick={()=>download(JSON.stringify(savedArchive,null,2),'dukkan-ideas-archive.json','application/json')}><Download size={15}/>{language==='ar'?'نزّل النسخة':'Download archive'}</Button><Button variant="outline" disabled={managementBusy} onClick={()=>void restoreIdeas()}>{language==='ar'?'استعد الأفكار':'Restore archived ideas'}</Button><Button variant="ghost" onClick={()=>setShowArchiveJson(value=>!value)}>{language==='ar'?'اعرض بيانات النسخة':'Show archive JSON'}</Button>{showArchiveJson&&<label className="dukkan-json-label">{language==='ar'?'انسخ هذا النص للاحتفاظ بنسخة':'Copy this text as a backup'}<textarea readOnly value={JSON.stringify(savedArchive,null,2)} rows={6} onFocus={e=>e.currentTarget.select()}/></label>}</div>}{!savedArchive&&<label className="dukkan-file-label"><Upload size={15}/>{language==='ar'?'حمّل نسخة مؤرشفة':'Load archive file'}<input type="file" accept=".json,application/json" disabled={managementBusy} onChange={e=>{void bringArchive(e.target.files?.[0]||null);e.target.value=''}}/></label>}{!savedArchive&&<><label className="dukkan-json-label">{language==='ar'?'أو الصق بيانات النسخة المؤرشفة':'Or paste archive JSON'}<textarea value={pastedArchiveJson} rows={4} onChange={e=>setPastedArchiveJson(e.target.value)}/></label><Button variant="outline" disabled={!pastedArchiveJson.trim()||managementBusy} onClick={()=>bringArchiveText(pastedArchiveJson)}>{language==='ar'?'حمّل النص':'Load pasted archive'}</Button></>}</div></details>{managementError&&<p className="dukkan-manage-error" role="alert">{managementError}</p>}</section></div>}
  {evidenceOpen&&<EvidenceEditor workspace={workspace} hypothesisId={focusHypothesis?.id||''} onClose={()=>setEvidenceOpen(false)} onSave={saveEvidence} onDelete={note=>{commit({...workspace,evidence:workspace.evidence.filter(e=>e.id!==note.id)});setEvidenceOpen(false)}}/>}
  {notice&&<div className="dukkan-toast" role="status"><Check size={15}/>{notice}</div>}
 </div></DoorEntrance>
}
