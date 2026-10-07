import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react'
import {ExternalLink,MessageCircle,Search} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {askPrompt,businessPhases,excerptFor,fetchEvidenceCatalogue,formatDate,humanise,kindLabel,languageLabel,phaseLabel,searchEvidence,sortByPublication,type BusinessPhase,type EvidenceCatalogue,type EvidenceCitation,type EvidenceCollection,type EvidenceSearch,type EvidenceSource,type Language} from '@/lib/evidence-api'
import './evidence-library.css'

const copy={
 en:{kicker:'Sources with provenance',title:'Evidence library',intro:'Preserved Kuwait sources with publisher, period and page-level citations that Dukkan quotes from. When the sources do not cover a question, Dukkan abstains.',sources:'sources',passages:'passages',built:'Library built',loading:'Loading the library.',unavailable:'The evidence service is not reachable. Start the local backend and reload this page.',searchKicker:'Search',searchTitle:'Ask the sources a question',searchHint:'Searches the market and business collection offline. Results are passages, not conclusions.',placeholder:'For example: population by age, card payments, shopper behaviour',anyPhase:'Any phase',phase:'Phase',search:'Search',searching:'Searching',results:(n:number,q:string)=>`${n} supporting ${n===1?'passage':'passages'} for “${q}”`,abstained:'No supporting passage found. Dukkan will not guess.',verified:'Passage verified',unverified:'Locator unresolved',period:'Data period',page:'Page',locator:'Locator',open:'Open publisher page',ask:'Ask Dukkan about this',caveats:'Caveats from the retrieval service',browseKicker:'Collections',browseTitle:'Browse the sources',browseHint:'Every source keeps its publisher, capture date and stated limits. Public access does not establish permission to redistribute.',kind:'Kind',allKinds:'All kinds',allPhases:'All phases',shown:(n:number,m:number)=>`${n} of ${m} sources shown`,noMatch:'No sources match these filters.',published:'Published',captured:'Captured',phases:'Phases',noLimit:'No limitation recorded.'},
 ar:{kicker:'مصادر بمرجعية',title:'مكتبة الأدلة',intro:'مصادر كويتية محفوظة مع الناشر والفترة والاستشهاد على مستوى الصفحة، يقتبس منها دكان. وعندما لا تغطي المصادر سؤالاً، يمتنع دكان عن الإجابة.',sources:'مصادر',passages:'مقاطع',built:'تاريخ بناء المكتبة',loading:'جارٍ تحميل المكتبة.',unavailable:'خدمة الأدلة غير متاحة. شغّل الخادم المحلي ثم أعد تحميل الصفحة.',searchKicker:'بحث',searchTitle:'اطرح سؤالاً على المصادر',searchHint:'يبحث في مجموعة السوق والأعمال دون اتصال. النتائج مقاطع لا استنتاجات.',placeholder:'مثلاً: السكان حسب العمر، مدفوعات البطاقات، سلوك المتسوقين',anyPhase:'أي مرحلة',phase:'المرحلة',search:'ابحث',searching:'جارٍ البحث',results:(n:number,q:string)=>`${n} من المقاطع الداعمة لـ «${q}»`,abstained:'لم يُعثر على مقطع داعم. لن يخمّن دكان.',verified:'مقطع متحقق',unverified:'الموضع غير محسوم',period:'فترة البيانات',page:'الصفحة',locator:'الموضع',open:'افتح صفحة الناشر',ask:'اسأل دكان عن هذا',caveats:'تحفظات من خدمة الاسترجاع',browseKicker:'المجموعات',browseTitle:'تصفح المصادر',browseHint:'يحتفظ كل مصدر بناشره وتاريخ التقاطه وحدوده المعلنة. الوصول العام لا يمنح حق إعادة النشر.',kind:'النوع',allKinds:'كل الأنواع',allPhases:'كل المراحل',shown:(n:number,m:number)=>`عرض ${n} من ${m} مصادر`,noMatch:'لا توجد مصادر تطابق هذه المرشحات.',published:'نُشر',captured:'التُقط',phases:'المراحل',noLimit:'لم تُسجل حدود.'},
}
const collectionLabels:Record<Language,Record<EvidenceCollection['id'],string>>={en:{market:'Market and business',legal:'Legal and official services'},ar:{market:'السوق والأعمال',legal:'القانون والخدمات الرسمية'}}
type Filters=Record<EvidenceCollection['id'],{kind:string;phase:string}>
const noFilters:Filters={market:{kind:'',phase:''},legal:{kind:'',phase:''}}

export function EvidenceLibrary({language,onAsk}:{language:Language;onAsk:(prompt:string)=>void}){
 const t=copy[language]
 const [catalogue,setCatalogue]=useState<{status:'loading'}|{status:'ready';data:EvidenceCatalogue}|{status:'error'}>({status:'loading'})
 const [query,setQuery]=useState('')
 const [phase,setPhase]=useState<BusinessPhase|''>('')
 const [search,setSearch]=useState<{status:'idle'}|{status:'searching'}|{status:'done';result:EvidenceSearch}|{status:'error';message:string}>({status:'idle'})
 const [filters,setFilters]=useState<Filters>(noFilters)
 const inFlight=useRef<AbortController|null>(null)

 useEffect(()=>{
  const controller=new AbortController()
  fetchEvidenceCatalogue(controller.signal).then(data=>setCatalogue({status:'ready',data})).catch(()=>{if(!controller.signal.aborted)setCatalogue({status:'error'})})
  return ()=>controller.abort()
 },[])
 useEffect(()=>()=>inFlight.current?.abort(),[])

 function submit(event:FormEvent){
  event.preventDefault()
  const trimmed=query.trim()
  if(!trimmed)return
  inFlight.current?.abort()
  const controller=new AbortController();inFlight.current=controller
  setSearch({status:'searching'})
  searchEvidence({query:trimmed,phase},controller.signal).then(result=>{if(!controller.signal.aborted)setSearch({status:'done',result})}).catch(error=>{if(!controller.signal.aborted)setSearch({status:'error',message:error instanceof Error&&error.message?error.message:t.unavailable})})
 }

 return <div className="dukkan-library" lang={language}>
  <header className="dukkan-library-intro">
   <span className="dukkan-kicker">{t.kicker}</span>
   <h1>{t.title}</h1>
   <p>{t.intro}</p>
   {catalogue.status==='ready'?<dl className="dukkan-library-counts">
    {catalogue.data.collections.map(collection=><div key={collection.id}><dt>{collectionLabels[language][collection.id]}</dt><dd><strong>{collection.sourceCount.toLocaleString(language==='ar'?'ar-KW':'en-GB')}</strong> {t.sources}<span aria-hidden="true"> · </span><strong>{collection.chunkCount.toLocaleString(language==='ar'?'ar-KW':'en-GB')}</strong> {t.passages}</dd></div>)}
    <div><dt>{t.built}</dt><dd><strong>{formatDate(catalogue.data.builtAt,language)||'?'}</strong></dd></div>
   </dl>:<p className={catalogue.status==='error'?'dukkan-library-status is-error':'dukkan-library-status'} role="status">{catalogue.status==='error'?t.unavailable:t.loading}</p>}
  </header>

  <section className="dukkan-library-search" aria-labelledby="dukkan-library-search-title">
   <div className="dukkan-library-section-head">
    <div><span className="dukkan-kicker">{t.searchKicker}</span><h2 id="dukkan-library-search-title">{t.searchTitle}</h2><p>{t.searchHint}</p></div>
   </div>
   <form onSubmit={submit} className="dukkan-library-form">
    <label className="dukkan-library-query"><span className="sr-only">{t.search}</span><Search size={16} aria-hidden="true"/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder={t.placeholder} maxLength={400} autoComplete="off"/></label>
    <label className="dukkan-library-select"><span className="sr-only">{t.phase}</span><select value={phase} onChange={event=>setPhase(event.target.value as BusinessPhase|'')}><option value="">{t.anyPhase}</option>{businessPhases.map(item=><option key={item} value={item}>{phaseLabel(item,language)}</option>)}</select></label>
    <Button type="submit" disabled={search.status==='searching'||!query.trim()}>{search.status==='searching'?t.searching:t.search}</Button>
   </form>
   {search.status==='error'&&<p className="dukkan-library-status is-error" role="alert">{search.message}</p>}
   {search.status==='done'&&<SearchResults result={search.result} language={language} onAsk={onAsk}/>}
  </section>

  <section className="dukkan-library-browse" aria-labelledby="dukkan-library-browse-title">
   <div className="dukkan-library-section-head">
    <div><span className="dukkan-kicker">{t.browseKicker}</span><h2 id="dukkan-library-browse-title">{t.browseTitle}</h2><p>{t.browseHint}</p></div>
   </div>
   {catalogue.status==='ready'&&catalogue.data.collections.map(collection=><CollectionSection key={collection.id} collection={collection} language={language} filter={filters[collection.id]} onFilter={next=>setFilters(current=>({...current,[collection.id]:next}))} onAsk={onAsk}/>)}
  </section>
 </div>
}

function SearchResults({result,language,onAsk}:{result:EvidenceSearch;language:Language;onAsk:(prompt:string)=>void}){
 const t=copy[language]
 return <div className="dukkan-library-results">
  {result.abstained||result.citations.length===0
   ?<p className="dukkan-library-abstained" role="status">{t.abstained}</p>
   :<>
    <p className="dukkan-library-results-count" role="status">{t.results(result.citations.length,result.query)}</p>
    <div className="dukkan-library-grid">{result.citations.map(citation=><CitationCard key={citation.chunkID||citation.sourceID} citation={citation} result={result} language={language} onAsk={onAsk}/>)}</div>
   </>}
  {result.caveats.length>0&&<div className="dukkan-library-caveats"><h3>{t.caveats}</h3><ul>{result.caveats.map(caveat=><li key={caveat}>{caveat}</li>)}</ul></div>}
 </div>
}

function CitationCard({citation,result,language,onAsk}:{citation:EvidenceCitation;result:EvidenceSearch;language:Language;onAsk:(prompt:string)=>void}){
 const t=copy[language]
 const source=result.sources.find(item=>item.id===citation.sourceID)
 const excerpt=excerptFor(result,citation)
 const title=citation.title||citation.sourceID
 const publisher=citation.authority||source?.publisher||null
 const period=citation.dataPeriod||source?.dataPeriod||null
 return <article className="dukkan-library-card">
  <div className="dukkan-library-card-top">
   <span className="dukkan-library-tag">{publisher||citation.sourceID}</span>
   <span className={citation.resolved?'dukkan-library-badge is-verified':'dukkan-library-badge'}>{citation.resolved?t.verified:t.unverified}</span>
  </div>
  <h3>{title}</h3>
  <dl className="dukkan-library-meta">
   {period&&<div><dt>{t.period}</dt><dd>{period}</dd></div>}
   {citation.page!==null&&citation.page!==undefined&&<div><dt>{t.page}</dt><dd>{String(citation.page)}</dd></div>}
   {citation.localCitation&&<div><dt>{t.locator}</dt><dd><code>{citation.localCitation}</code></dd></div>}
  </dl>
  {excerpt&&<blockquote>{excerpt}</blockquote>}
  <div className="dukkan-library-card-actions">
   {citation.url&&<a href={citation.url} target="_blank" rel="noopener noreferrer">{t.open}<ExternalLink size={13} aria-hidden="true"/></a>}
   <Button type="button" variant="outline" size="sm" onClick={()=>onAsk(askPrompt({title,publisher,dataPeriod:period},language))}><MessageCircle size={14} aria-hidden="true"/>{t.ask}</Button>
  </div>
 </article>
}

function CollectionSection({collection,language,filter,onFilter,onAsk}:{collection:EvidenceCollection;language:Language;filter:{kind:string;phase:string};onFilter:(next:{kind:string;phase:string})=>void;onAsk:(prompt:string)=>void}){
 const t=copy[language]
 const ordered=useMemo(()=>collection.id==='market'?sortByPublication(collection.sources):collection.sources,[collection])
 const kinds=useMemo(()=>[...new Set(ordered.map(source=>source.kind).filter((kind):kind is string=>!!kind))],[ordered])
 const phases=useMemo(()=>businessPhases.filter(phase=>ordered.some(source=>source.phases?.includes(phase))),[ordered])
 const shown=ordered.filter(source=>(!filter.kind||source.kind===filter.kind)&&(!filter.phase||source.phases?.includes(filter.phase)))
 const kindId=`dukkan-library-kind-${collection.id}`,phaseId=`dukkan-library-phase-${collection.id}`
 return <section className="dukkan-library-collection" aria-labelledby={`dukkan-library-collection-${collection.id}`}>
  <div className="dukkan-library-collection-head">
   <div>
    <h3 id={`dukkan-library-collection-${collection.id}`}>{collectionLabels[language][collection.id]}</h3>
    <p>{collection.sourceCount.toLocaleString(language==='ar'?'ar-KW':'en-GB')} {t.sources}<span aria-hidden="true"> · </span>{collection.chunkCount.toLocaleString(language==='ar'?'ar-KW':'en-GB')} {t.passages}{collection.builtAt?<><span aria-hidden="true"> · </span>{t.built} {formatDate(collection.builtAt,language)}</>:null}</p>
   </div>
   <div className="dukkan-library-filters">
    <label className="dukkan-library-select" htmlFor={kindId}><span>{t.kind}</span><select id={kindId} value={filter.kind} onChange={event=>onFilter({...filter,kind:event.target.value})}><option value="">{t.allKinds}</option>{kinds.map(kind=><option key={kind} value={kind}>{kindLabel(kind,language)}</option>)}</select></label>
    {phases.length>0&&<label className="dukkan-library-select" htmlFor={phaseId}><span>{t.phase}</span><select id={phaseId} value={filter.phase} onChange={event=>onFilter({...filter,phase:event.target.value})}><option value="">{t.allPhases}</option>{phases.map(phase=><option key={phase} value={phase}>{phaseLabel(phase,language)}</option>)}</select></label>}
   </div>
  </div>
  <p className="dukkan-library-shown" role="status">{t.shown(shown.length,ordered.length)}</p>
  {shown.length?<div className="dukkan-library-grid">{shown.map(source=><SourceCard key={source.id} source={source} language={language} onAsk={onAsk}/>)}</div>:<p className="dukkan-library-status">{t.noMatch}</p>}
 </section>
}

function SourceCard({source,language,onAsk}:{source:EvidenceSource;language:Language;onAsk:(prompt:string)=>void}){
 const t=copy[language]
 const when=source.dataPeriod?`${t.period}: ${source.dataPeriod}`:source.publicationDate?`${t.published} ${formatDate(source.publicationDate,language)}`:source.capturedAt?`${t.captured} ${formatDate(source.capturedAt,language)}`:null
 const note=source.limitations?.[0]||(source.currentness?humanise(source.currentness):null)||(source.legalStatus?humanise(source.legalStatus):null)||t.noLimit
 return <article className="dukkan-library-card">
  <div className="dukkan-library-card-top">
   <span className="dukkan-library-tag">{kindLabel(source.kind,language)}</span>
   {source.language&&<span className="dukkan-library-lang">{languageLabel(source.language,language)}</span>}
  </div>
  <h3 dir="auto">{source.title}</h3>
  {source.publisher&&<p className="dukkan-library-publisher">{source.publisher}</p>}
  {when&&<p className="dukkan-library-when">{when}</p>}
  <p className="dukkan-library-note">{note}</p>
  {source.phases&&source.phases.length>0&&<ul className="dukkan-library-phases" aria-label={t.phases}>{source.phases.map(phase=><li key={phase}>{phaseLabel(phase,language)}</li>)}</ul>}
  <div className="dukkan-library-card-actions">
   {source.url&&<a href={source.url} target="_blank" rel="noopener noreferrer">{t.open}<ExternalLink size={13} aria-hidden="true"/></a>}
   <button type="button" className="dukkan-library-ask" onClick={()=>onAsk(askPrompt(source,language))}><MessageCircle size={14} aria-hidden="true"/>{t.ask}</button>
  </div>
 </article>
}
