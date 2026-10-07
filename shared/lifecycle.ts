// Shared boundary for AI suggestions and human-reviewed lifecycle records.
export const lifecycleFields=['recordId','category','title','details','status','owner','due','evidence','source','amount','direction','date','basis','relatedId','entityType','stage','contact','channel','nextAction','quantity','unitPrice','currency'] as const
export type LifecycleValues=Partial<Record<typeof lifecycleFields[number],string>>
export const categories=['licence','document','launch','operation','hiring','business_decision','sales'] as const
export const entityTypes:Record<string,readonly string[]>={sales:['lead','contact','proposal','followup'],hiring:['role','candidate','onboarding'],operation:['finance','budget','supplier','quote','order','task']}
export const recordStages:Record<string,readonly string[]>={lead:['prospect','contacted','qualified','won','lost'],contact:['new','active','inactive'],proposal:['draft','sent','accepted','declined'],followup:['planned','due','done'],supplier:['researching','shortlisted','selected'],quote:['requested','received','accepted','declined'],order:['planned','ordered','received','cancelled'],task:['todo','in_progress','blocked','done'],role:['draft','open','closed'],candidate:['sourced','screening','interview','offered','hired','rejected'],onboarding:['not_started','in_progress','complete'],budget:['planned','revised'],finance:[]}
export function lifecycleEntity(values:LifecycleValues){return values.entityType||(values.category==='operation'?'finance':values.category==='hiring'?'role':'')}
export function isFinancialEntry(values:LifecycleValues){return values.category==='operation'&&['finance','budget'].includes(lifecycleEntity(values))}
// Integer fils avoid floating-point drift; quantity is an integer item count.
export function lineAmount(quantity:string,unitPrice:string):string {
 if(!/^\d+$/.test(quantity)||Number(quantity)>1e6||!/^\d+(\.\d{1,3})?$/.test(unitPrice))throw new Error('Use an integer quantity up to 1000000 and a KWD unit price with at most three decimals.')
 const [whole,fraction='']=unitPrice.split('.')
 const fils=(BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0')))*BigInt(quantity)
 if(fils>1000000000000n)throw new Error('Line total exceeds the supported KWD amount.')
 return `${fils/1000n}.${String(fils%1000n).padStart(3,'0')}`
}
export function normaliseLifecycle(values:LifecycleValues):LifecycleValues {
 const result={...values}
 if(result.quantity!==undefined&&result.quantity!==''&&result.unitPrice!==undefined&&result.unitPrice!==''){
  const calculated=lineAmount(result.quantity,result.unitPrice)
  if(result.amount&&Number(result.amount)!==Number(calculated))throw new Error('Amount must equal quantity multiplied by unit price. Set amount to '+calculated+' or leave amount blank so it is calculated.')
  result.amount=calculated
 }
 return result
}
export const statuses=['prepared','approved','submitted','completed','archived'] as const
export type LifecycleRecord={id:string;revision:number;at:string;values:LifecycleValues;history:Array<{revision:number;at:string;values:LifecycleValues}>}
const fail=(message:string):never=>{throw new Error(message)}
export function validateLifecycle(values:LifecycleValues,records:LifecycleRecord[]=[]){
 if(!values||Object.entries(values).some(([k,v])=>!lifecycleFields.includes(k as any)||typeof v!=='string'||v.length>4000))fail('Unsupported business record fields.')
 const old=values.recordId?records.find(r=>r.id===values.recordId):undefined
 if(values.recordId&&!old)fail('This business record no longer exists.')
 if(!values.title?.trim()||!values.details?.trim()||!categories.includes(values.category as any))fail('A category, title and useful details are required. Category must be one of: '+categories.join(', ')+'.')
 if(old&&old.values.category!==values.category)fail('Keep the record category when revising it.')
 if(!statuses.includes(values.status as any))fail('Choose a supported record status.')
 if(!old&&values.status!=='prepared')fail('New work starts as prepared. Review it before approval.')
 if(values.source){try{const u=new URL(values.source);if(u.protocol!=='https:'||u.username||u.password)fail('Use a public HTTPS source link. Leave source blank when there is no public https:// page to cite.')}catch{fail('Use a public HTTPS source link. Leave source blank when there is no public https:// page to cite.')}}
 for(const key of ['date','due'] as const)if(values[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(values[key]!)||new Date(values[key]!).toISOString().slice(0,10)!==values[key]))fail('Use a valid date in YYYY-MM-DD format.')
 if(old){
  const previous=old.values.status!
  const changed=lifecycleFields.filter(k=>!['recordId','status','evidence',...(values.category==='operation'?[]:['date'])].includes(k)).some(k=>(values[k]||'')!==(old.values[k]||''))
  if(changed&&values.status!=='prepared')fail('Changed content needs a fresh review. Save it as prepared first.')
  const next:Record<string,string[]>={prepared:['prepared','approved','archived'],approved:['approved','prepared','submitted','completed','archived'],submitted:['submitted','completed','prepared','archived'],completed:['completed','prepared','archived'],archived:['prepared','archived']}
  if(!next[previous]?.includes(values.status!))fail('Review this version before advancing its status.')
  if(values.category==='licence'&&values.status==='completed'&&previous!=='submitted'&&previous!=='completed')fail('Record the official submission before its outcome.')
 }
 if(['submitted','completed'].includes(values.status!)){
  if(!values.evidence?.trim())fail('Record the receipt or outcome evidence first. Dukkan does not submit or verify it.')
  if(!values.date||values.date>new Date().toISOString().slice(0,10))fail('Record the actual event date, which cannot be in the future.')
 }
 if(values.amount){if(!/^\d+(\.\d{1,3})?$/.test(values.amount)||Number(values.amount)>1e9)fail('Use a non-negative KWD amount with at most three decimal places.')}
 if(values.entityType&&!(entityTypes[values.category!]||[]).includes(values.entityType))fail('Choose an entity type supported by this category.')
 if(values.category==='sales'&&!values.entityType)fail('Choose a sales record type.')
 if(old&&lifecycleEntity(old.values)!==lifecycleEntity(values))fail('Keep the record type when revising it.')
 if(values.stage&&!(recordStages[lifecycleEntity(values)]||[]).includes(values.stage))fail('Choose a stage supported by this record category.')
 const outcomeStages:Record<string,readonly string[]>={lead:['contacted','qualified','won','lost'],proposal:['sent','accepted','declined'],followup:['done'],supplier:['selected'],quote:['received','accepted','declined'],order:['ordered','received','cancelled'],task:['done'],role:['open','closed'],candidate:['interview','offered','hired','rejected'],onboarding:['complete']}
 if(values.stage&&outcomeStages[lifecycleEntity(values)]?.includes(values.stage)){
  if(!['actual','simulated'].includes(values.basis||'')||!values.evidence?.trim()||!values.date||values.date>new Date().toISOString().slice(0,10))fail('An outcome stage needs actual or simulated provenance, dated reported evidence, and an event date no later than today. Keep planned work at its earlier stage.')
 }
 if(values.currency&&values.currency!=='KWD')fail('Only KWD amounts are supported.')
 if(!!values.quantity!==!!values.unitPrice)fail('Supply quantity and unit price together.')
 if(values.quantity){if(!['quote','order','proposal'].includes(lifecycleEntity(values)))fail('Line-item quantities belong to purchases or proposals.');normaliseLifecycle(values)}
 if(values.entityType||values.category==='sales'){
  if(!['actual','estimate','simulated'].includes(values.basis||''))fail('Choose actual, estimate or simulated provenance.')
  if(values.basis==='actual'&&!values.evidence?.trim())fail('Actual records require founder-reported evidence.')
 }
 if(isFinancialEntry(values)){
  if(!['income','expense'].includes(values.direction||'')||!['actual','estimate','simulated'].includes(values.basis||'')||!values.amount||!values.date)fail('An operating entry needs amount, income/expense, date and actual/estimate/simulated basis.')
  if(values.basis==='actual'&&!values.evidence?.trim())fail('Actual entries need a founder-reported receipt or source reference.')
 }
 if(values.category==='business_decision'&&!values.evidence?.trim())fail('Record the evidence and trade-off behind this decision.')
 if(values.relatedId&&!records.some(r=>r.id===values.relatedId&&r.id!==values.recordId))fail('Link an existing, different business record.')
 return old
}
export function saveLifecycle(records:LifecycleRecord[],values:LifecycleValues,id:string,at:string){
 values=normaliseLifecycle(values)
 const old=validateLifecycle(values,records)
 if(records.length>=300&&!old)fail('Export a backup before adding more business records.')
 if(old&&old.history.length>=100)fail('This record has reached its revision limit. Export it before continuing.')
 const row:LifecycleRecord={id:old?.id||id,revision:(old?.revision||0)+1,at,values:{...values,recordId:old?.id||id},history:old?[...old.history,{revision:old.revision,at:old.at,values:{...old.values}}]:[]}
 return old?records.map(r=>r.id===old.id?row:r):[...records,row]
}
export function operatingTotals(records:LifecycleRecord[],month:string){
 if(!/^\d{4}-\d{2}$/.test(month))return {count:0,income:0,expenses:0,net:0}
 const rows=records.filter(r=>r.values.category==='operation'&&lifecycleEntity(r.values)==='finance'&&r.values.status==='completed'&&r.values.basis==='actual'&&r.values.date?.startsWith(month))
 const sum=(direction:string)=>rows.filter(r=>r.values.direction===direction).reduce((n,r)=>n+Math.round(Number(r.values.amount)*1000),0)/1000
 return {count:rows.length,income:sum('income'),expenses:sum('expense'),net:Math.round((sum('income')-sum('expense'))*1000)/1000}
}
