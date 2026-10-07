// Pure helpers that make identically titled drafts distinguishable without changing stored data.
// A document is the chain of artefacts linked by supersedesArtifactId; each link is a version.
export type DraftLike={id:string;title:string;version?:number;supersedesArtifactId?:string|null;createdAt?:unknown;conversationId?:string}
export type DraftGroup<T extends DraftLike>={key:string;title:string;latest:T;versions:T[];stamp:string;sameTitleElsewhere:boolean}
const time=(item:DraftLike)=>{const t=Date.parse(typeof item.createdAt==='string'?item.createdAt:'');return Number.isNaN(t)?0:t}
function rootOf<T extends DraftLike>(item:T,byId:Map<string,T>){
 let current=item;const seen=new Set<string>([item.id])
 while(current.supersedesArtifactId){
  const previous=byId.get(current.supersedesArtifactId)
  if(!previous)break
  if(seen.has(previous.id))return [...seen].sort()[0] // circular links: pick one stable root for every member
  seen.add(previous.id);current=previous
 }
 return current.id
}
function dayKey(item:DraftLike){const t=time(item);return t?new Date(t).toDateString():''}
export function draftStamp(item:DraftLike,language:'en'|'ar',withTime:boolean){
 const t=time(item);if(!t)return ''
 const locale=language==='ar'?'ar-KW':'en-GB'
 const date=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric'}).format(t)
 return withTime?date+' · '+new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(t):date
}
export function versionLabel(item:DraftLike,latest:boolean,language:'en'|'ar'){
 const ar=language==='ar'
 return (ar?'النسخة ':'Version ')+(item.version||1)+(latest?(ar?' · الأحدث':' · Latest'):(ar?' · نسخة سابقة':' · Earlier version'))
}
// Groups keep the order in which their first artefact appeared; versions run latest first.
export function groupDrafts<T extends DraftLike>(items:T[],language:'en'|'ar'='en'):DraftGroup<T>[]{
 const byId=new Map(items.map(item=>[item.id,item] as const)),groups=new Map<string,T[]>()
 for(const item of items){const key=rootOf(item,byId);const list=groups.get(key);if(list)list.push(item);else groups.set(key,[item])}
 const built=[...groups].map(([key,versions])=>{
  const sorted=versions.slice().sort((a,b)=>(b.version||0)-(a.version||0)||time(b)-time(a)||b.id.localeCompare(a.id))
  return {key,title:sorted[0].title,latest:sorted[0],versions:sorted}
 })
 return built.map(group=>{
  const twins=built.filter(other=>other!==group&&other.title===group.title)
  const sameDay=twins.some(other=>dayKey(other.latest)===dayKey(group.latest)||other.versions.some(v=>group.versions.some(w=>dayKey(v)===dayKey(w))))
  return {...group,sameTitleElsewhere:twins.length>0,stamp:draftStamp(group.latest,language,sameDay)}
 })
}
