import type {Workspace} from './workspace.ts'
import type {LifecycleRecord} from '../../../shared/lifecycle.ts'
// Change detection only: these markers are not document signatures or proof of authenticity.
function marker(value:unknown){const text=JSON.stringify(value);let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i)}return `${text.length}:${a>>>0}:${b>>>0}`}
export const impactLabels:Record<string,string>={brief:'Business brief',costs:'Cost assumptions',evidence:'Evidence',tests:'Tests and results',setup:'Setup checks',decisions:'Decisions',related:'Linked record'}
const cache=new WeakMap<Workspace,Record<string,string>>()
export function impactContext(w:Workspace,row:LifecycleRecord){
 const all=cache.get(w)||{brief:marker(w.brief),costs:marker(w.costs),evidence:marker(w.evidence),tests:marker(w.hypotheses.map(h=>({id:h.id,title:h.title,test:h.test}))),setup:marker(w.setup),decisions:marker([w.decisions,w.ideaReviewDecisions])}
 cache.set(w,all)
 const domains:Record<string,string[]>={licence:['brief','setup'],document:['brief','setup'],launch:['brief','costs','evidence','tests','setup','decisions'],hiring:['brief','costs','decisions'],business_decision:['brief','costs','evidence','tests','setup','decisions'],sales:['brief','costs','evidence'],operation:[]}
 const entity=row.values.entityType;const relevant=row.values.category==='operation'&&entity&&entity!=='finance'?['brief','costs']:domains[row.values.category||'']||[]
 const result=Object.fromEntries(relevant.map(k=>[k,all[k]]))
 if(row.values.relatedId)result.related=marker(w.lifecycle.find(r=>r.id===row.values.relatedId)||null)
 return result
}
export function recordImpact(w:Workspace,row:LifecycleRecord){
 const current=impactContext(w,row),saved=w.contextReviews[row.id]
 return {missing:!saved&&Object.keys(current).length>0,changed:saved?Object.keys(current).filter(key=>current[key]!==saved.markers[key]):[],at:saved?.at||''}
}
export function captureRecordContext(w:Workspace,row:LifecycleRecord){return {...w,contextReviews:{...w.contextReviews,[row.id]:{revision:row.revision,at:new Date().toISOString(),markers:impactContext(w,row)}}}}
export function reconcileContext(before:Workspace,next:Workspace){
 let result=next
 for(const row of next.lifecycle){const old=before.lifecycle.find(item=>item.id===row.id)
  // New content is explicitly saved for review. Status-only transitions must not erase warnings.
  if(!old||row.values.status==='prepared'&&row.revision!==old.revision)result=captureRecordContext(result,row)
 }
 return result
}
