import {z} from 'zod'
import {request} from './preparation-api.ts'

// Read-only views over the preserved Kuwait evidence. Same origin rules as the chat API.
export const businessPhases=['ideation','validation','strategy','planning','application','licensing'] as const
export type BusinessPhase=typeof businessPhases[number]
export type Language='en'|'ar'

const nullableText=z.string().nullable().optional()
const nullableList=z.array(z.string()).nullable().optional()
export const evidenceSourceSchema=z.object({id:z.string(),title:z.string(),publisher:nullableText,url:nullableText,kind:nullableText,language:nullableText,dataPeriod:nullableText,publicationDate:nullableText,capturedAt:nullableText,phases:nullableList,topics:nullableList,limitations:nullableList,currentness:nullableText,legalStatus:nullableText})
export const evidenceCollectionSchema=z.object({id:z.enum(['market','legal']),label:z.string(),builtAt:nullableText,sourceCount:z.number().int().nonnegative(),chunkCount:z.number().int().nonnegative(),sources:z.array(evidenceSourceSchema)})
export const evidenceCatalogueSchema=z.object({builtAt:nullableText,totals:z.object({sourceCount:z.number().int().nonnegative(),chunkCount:z.number().int().nonnegative()}),collections:z.array(evidenceCollectionSchema)})
export const evidenceCitationSchema=z.object({sourceID:z.string(),chunkID:z.string().optional(),title:z.string().optional(),url:nullableText,authority:nullableText,page:z.union([z.number(),z.string()]).nullable().optional(),localCitation:nullableText,dataPeriod:nullableText,capturedAt:nullableText,passageSha256:nullableText,resolved:z.boolean().optional()}).passthrough()
export const evidenceSearchSchema=z.object({query:z.string(),phase:nullableText,kind:nullableText,abstained:z.boolean(),builtAt:nullableText,corpusSha256:nullableText,method:nullableText,coverageComplete:z.boolean().optional(),citations:z.array(evidenceCitationSchema).default([]),sources:z.array(z.object({id:z.string(),passage:z.string().optional(),publisher:nullableText,dataPeriod:nullableText}).passthrough()).default([]),caveats:z.array(z.string()).default([])}).passthrough()

export type EvidenceSource=z.infer<typeof evidenceSourceSchema>
export type EvidenceCollection=z.infer<typeof evidenceCollectionSchema>
export type EvidenceCatalogue=z.infer<typeof evidenceCatalogueSchema>
export type EvidenceCitation=z.infer<typeof evidenceCitationSchema>
export type EvidenceSearch=z.infer<typeof evidenceSearchSchema>

export function fetchEvidenceCatalogue(signal:AbortSignal){return request('/api/business-knowledge/sources',evidenceCatalogueSchema,signal)}
export function searchEvidence(options:{query:string;phase?:BusinessPhase|''},signal:AbortSignal){
 const params=new URLSearchParams({query:options.query.trim()})
 if(options.phase)params.set('phase',options.phase)
 return request('/api/business-knowledge?'+params.toString(),evidenceSearchSchema,signal)
}

// Labels. Backend identifiers are snake_case; the page shows readable words.
const phaseLabels:Record<Language,Record<BusinessPhase,string>>={
 en:{ideation:'Ideation',validation:'Validation',strategy:'Strategy',planning:'Planning',application:'Application',licensing:'Licensing'},
 ar:{ideation:'الفكرة',validation:'التحقق',strategy:'الاستراتيجية',planning:'التخطيط',application:'التقديم',licensing:'الترخيص'},
}
const kindLabels:Record<Language,Record<string,string>>={
 en:{official_statistics:'Official statistics',research_report:'Research report',business_framework:'Business framework',source_catalogue:'Source catalogue',official_service:'Official service',statute:'Statute',amending_statute:'Amending statute',implementing_regulation:'Implementing regulation',amending_ministerial_decision:'Ministerial decision',service_guide:'Service guide',service_catalogue:'Service catalogue',service_page:'Service page',service_information:'Service information',legal_public:'Legal text',official_service_public:'Official service'},
 ar:{official_statistics:'إحصاءات رسمية',research_report:'تقرير بحثي',business_framework:'إطار عمل',source_catalogue:'فهرس مصادر',official_service:'خدمة رسمية',statute:'قانون',amending_statute:'قانون معدِّل',implementing_regulation:'لائحة تنفيذية',amending_ministerial_decision:'قرار وزاري',service_guide:'دليل خدمة',service_catalogue:'فهرس خدمات',service_page:'صفحة خدمة',service_information:'معلومات خدمة',legal_public:'نص قانوني',official_service_public:'خدمة رسمية'},
}
export function phaseLabel(phase:string,language:Language){return (phaseLabels[language] as Record<string,string>)[phase]||humanise(phase)}
export function kindLabel(kind:string|null|undefined,language:Language){if(!kind)return language==='ar'?'غير مصنف':'Unclassified';return kindLabels[language][kind]||humanise(kind)}
export function humanise(value:string){const words=value.replaceAll('_',' ').trim();return words?words.charAt(0).toUpperCase()+words.slice(1):value}
export function languageLabel(code:string|null|undefined,language:Language){
 if(code==='ar')return language==='ar'?'العربية':'Arabic'
 if(code==='en')return language==='ar'?'الإنجليزية':'English'
 return language==='ar'?'اللغة غير مسجلة':'Language not recorded'
}

// Dates in the corpus are ISO strings or free text such as "January 2026 fieldwork". Only ISO dates are reformatted.
export function formatDate(value:string|null|undefined,language:Language){
 if(!value)return null
 const iso=/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T.*)?$/.exec(value.trim())
 if(!iso)return value
 const [,year,month,day]=iso
 if(!month)return year
 const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day||'1')))
 if(Number.isNaN(date.getTime()))return value
 return new Intl.DateTimeFormat(language==='ar'?'ar-KW':'en-GB',{timeZone:'UTC',year:'numeric',month:'long',...(day?{day:'numeric'}:{})}).format(date)
}

// Market sources first by publication date, newest first; undated sources keep their corpus order at the end.
export function sortByPublication(sources:EvidenceSource[]){
 return sources.map((source,index)=>({source,index})).sort((a,b)=>{
  const da=a.source.publicationDate||'',db=b.source.publicationDate||''
  if(da&&db)return db.localeCompare(da)||a.index-b.index
  if(da)return -1
  if(db)return 1
  return a.index-b.index
 }).map(item=>item.source)
}

export function excerptFor(result:EvidenceSearch,citation:EvidenceCitation,limit=320){
 const passage=result.sources.find(source=>source.id===citation.sourceID)?.passage
 if(!passage)return null
 const flat=passage.replace(/={3,}[^\n]*={3,}/g,' ').replace(/\s+/g,' ').trim()
 if(!flat)return null
 return flat.length>limit?flat.slice(0,limit).replace(/\s+\S*$/,'')+'…':flat
}

export function askPrompt(source:{title:string;publisher?:string|null;dataPeriod?:string|null},language:Language){
 const detail=[source.publisher,source.dataPeriod].filter(Boolean).join(', ')
 const name=detail?`"${source.title}" (${detail})`:`"${source.title}"`
 return language==='ar'
  ?`استخدم المصدر ${name} من مكتبة الأدلة. اشرح ما يعنيه لمشروعي المحفوظ، واقتبس المقاطع ذات الصلة مع الاستشهاد بالصفحة، وبيّن ما لا يخبرني به هذا المصدر.`
  :`Using the source ${name} from the evidence library, explain what it implies for my saved business. Quote the relevant passages with page-level citations and state what this source does not tell me.`
}
