import {saveLifecycle,type LifecycleValues,type LifecycleRecord} from '../../../shared/lifecycle.ts'
export const importFields=['reference','date','title','direction','amount'] as const
export type ImportField=typeof importFields[number]
export type ColumnMap=Record<ImportField,number>
export function parseCsv(raw:string):string[][]{
 if(raw.length>200000)throw Error('Use a CSV file smaller than 200 KB.')
 const rows:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false
 const text=raw.replace(/^\uFEFF/,'')
 for(let i=0;i<text.length;i++){
  const c=text[i]
  if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++}else{quoted=false;closed=true}}else value+=c;continue}
  if(c==='"'){if(value||closed)throw Error('Invalid CSV quoting.');quoted=true;continue}
  if(c===','||c==='\n'||c==='\r'){
   row.push(value.trim());value='';closed=false
   if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(Boolean))rows.push(row);row=[]}
  }else{if(closed)throw Error('Unexpected text after a quoted CSV value.');value+=c}
 }
 if(quoted)throw Error('Unclosed CSV quote.')
 row.push(value.trim());if(row.some(Boolean))rows.push(row)
 if(rows.length<2||rows.length>201)throw Error('Include a header and between 1 and 200 transaction rows.')
 if(rows[0].length>30||rows.some(r=>r.length!==rows[0].length))throw Error('Each CSV row must have the same number of columns, up to 30.')
 if(rows[0].some(v=>!v)||new Set(rows[0]).size!==rows[0].length)throw Error('Column names must be non-empty and unique.')
 return rows
}
export type ImportPreview={rows:Array<{id:string;reference:string;values:LifecycleValues;duplicate:boolean}>;income:number;expenses:number}
export async function previewFinance(rows:string[][],mapping:ColumnMap,source:string,basis:'actual'|'simulated',records:LifecycleRecord[]):Promise<ImportPreview>{
 if(!source.trim()||source.length>200)throw Error('Enter a source name of up to 200 characters.')
 if(new Set(Object.values(mapping)).size!==5||Object.values(mapping).some(n=>!Number.isInteger(n)||n<0||n>=rows[0].length))throw Error('Map each required field to a different column.')
 const seen=new Set<string>(),result:ImportPreview={rows:[],income:0,expenses:0}
 for(const [index,row] of rows.slice(1).entries()){
  const get=(key:ImportField)=>row[mapping[key]]
  const reference=get('reference'),date=get('date'),amount=get('amount'),direction=get('direction').toLowerCase(),title=get('title')
  if(!reference||reference.length>200||seen.has(reference))throw Error(`Row ${index+2}: use a unique transaction reference.`)
  seen.add(reference)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>new Date().toISOString().slice(0,10))throw Error(`Row ${index+2}: use a valid past or present YYYY-MM-DD date.`)
  if(!/^\d+(\.\d{1,3})?$/.test(amount)||Number(amount)>1e9)throw Error(`Row ${index+2}: use a non-negative KWD amount with up to three decimals.`)
  if(!['income','expense'].includes(direction))throw Error(`Row ${index+2}: direction must be income or expense.`)
  if(!title||title.length>500)throw Error(`Row ${index+2}: add a title of up to 500 characters.`)
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([source.trim(),reference])))
  const id='csv-'+Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('')
  const values:LifecycleValues={category:'operation',entityType:'finance',title,details:'Imported for review from '+source.trim()+'. Transaction: '+reference,status:'prepared',basis,direction,amount:(Math.round(Number(amount)*1000)/1000).toFixed(3),date,evidence:'CSV source: '+source.trim()+'; transaction: '+reference,currency:'KWD'}
  const old=records.find(r=>r.id===id)
  if(old&&['title','amount','direction','date','basis','evidence'].some(k=>old.values[k as keyof LifecycleValues]!==values[k as keyof LifecycleValues]))throw Error(`Row ${index+2}: this reference already exists with different data. Review the saved record instead.`)
  // Validate the exact prepared shape through the shared business boundary.
  saveLifecycle([],values,id,new Date().toISOString())
  result.rows.push({id,reference,values,duplicate:!!old})
  if(!old){if(direction==='income')result.income+=Math.round(Number(amount)*1000);else result.expenses+=Math.round(Number(amount)*1000)}
 }
 if(records.length+result.rows.filter(r=>!r.duplicate).length>300)throw Error('This import exceeds the 300-record limit. Export a backup first.')
 result.income/=1000;result.expenses/=1000
 return result
}
export function applyFinanceImport(records:LifecycleRecord[],preview:ImportPreview,at:string){
 let next=records
 for(const row of preview.rows)if(!row.duplicate){if(next.some(r=>r.id===row.id))throw Error('Records changed. Preview this import again.');next=saveLifecycle(next,row.values,row.id,at)}
 return next
}
