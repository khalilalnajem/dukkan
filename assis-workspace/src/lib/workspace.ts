import {businessStorage} from './account-storage.ts'
import {lifecycleFields,validateLifecycle} from '../../../shared/lifecycle.ts'
import { z } from 'zod'

const lifecycleValuesSchema=z.partialRecord(z.enum(lifecycleFields),z.string().max(4000)).superRefine((values,ctx)=>{try{const checked={...values,recordId:'schema'};delete checked.relatedId;validateLifecycle(checked,[{id:'schema',revision:1,at:'',values:checked,history:[]}])}catch(e){ctx.addIssue({code:'custom',message:(e as Error).message})}if(!['prepared','approved','submitted','completed','archived'].includes(values.status||''))ctx.addIssue({code:'custom',message:'Invalid lifecycle status'})})
const lifecycleRecordSchema=z.object({id:z.string(),revision:z.number().int().positive(),at:z.string(),values:lifecycleValuesSchema,history:z.array(z.object({revision:z.number(),at:z.string(),values:lifecycleValuesSchema})).max(100)})
const text = z.string().max(12000)
export const sectors = ['Retail & ecommerce', 'Food & drink', 'Professional services', 'Digital product', 'Other'] as const
export const areas = ['Customer need', 'Demand', 'Delivery', 'Economics', 'Kuwait setup'] as const
export const outcomes = ['Keep testing', 'Supported so far', 'Revise the idea', 'Pause the idea'] as const
export const kinds = ['Customer conversation', 'Observation', 'Published source', 'Assumption'] as const
const briefSchema = z.object({idea:text,customer:text,problem:text,alternative:text,offer:text,boundary:text,sector:z.enum(sectors),location:text})
const hypothesisSchema=z.object({id:text,title:text,area:z.enum(areas),priority:z.enum(['Critical','Important','Later']),status:z.enum(['Unexplored','Testing','Supported so far','Revisit','Paused']),reviewReason:text,test:z.object({method:text,audience:text,rule:text,result:text,provenance:z.object({artifactId:text,conversationId:text,title:text,adoptedAt:text}).optional()})})
const evidenceSchema=z.object({origin:z.enum(['real','simulated','unclassified']).optional(),id:text,hypothesisId:text,kind:z.enum(kinds),text,source:text,date:text,signal:z.enum(['Supports','Challenges','Unclear']),limitation:text})
const decisionSchema=z.object({id:text,hypothesisId:text,date:text,outcome:z.enum(outcomes),reason:text,assumption:text,rule:text,evidence:z.array(evidenceSchema).max(200)})
export const workspaceSchema=z.object({
  contextReviews:z.record(z.string(),z.object({revision:z.number().int().positive(),at:text,markers:z.record(z.string(),z.string().max(100))})).default({}),
  costScenarios:z.array(z.object({id:text,name:z.string().min(1).max(80),note:z.string().min(1).max(2000),date:text,archived:z.boolean(),costs:z.object({price:text,variable:text,fixed:text,units:text})})).max(30).default([]),
  lifecycle:z.array(lifecycleRecordSchema).max(300).default([]),version:z.literal(2),brief:briefSchema,hypotheses:z.array(hypothesisSchema).max(100),evidence:z.array(evidenceSchema).max(200),decisions:z.array(decisionSchema).max(200),
  costs:z.object({price:text,variable:text,fixed:text,units:text}),
  nextAction:z.object({task:text,owner:text,due:text,dependency:text}),
  setup:z.array(z.object({id:text,title:text.optional(),done:z.boolean(),note:text,source:text,date:text})).max(20),
  legacy:z.unknown().optional(),updatedAt:text,
  profile:z.object({stage:z.enum(['Exploring the idea','Testing demand','Preparing to launch','Operating']),budget:text}).default({stage:'Exploring the idea',budget:''}),
  savedTests:z.array(z.object({id:text,hypothesisId:text,title:text,date:text})).max(100).default([]),
  ideaReviewDecisions:z.array(z.object({id:text,artifactId:text,conversationId:text,date:text,choice:z.enum(['test','revise','park']),reason:text,selectedOption:text,reviewSummary:text,customOption:z.object({title:text,kind:z.enum(['feature','expansion','pivot']),tradeoff:text}).optional()})).max(100).default([]),
})
export type Workspace=z.infer<typeof workspaceSchema>
export type Hypothesis=z.infer<typeof hypothesisSchema>
export type Evidence=z.infer<typeof evidenceSchema>
export type Decision=z.infer<typeof decisionSchema>
export type Brief=z.infer<typeof briefSchema>
export const KEY='assis-connected-workspace-v2'
export const OLD_KEY='assis-guided-mvp-v1'
export const uid=()=>crypto.randomUUID()
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export const blank=():Workspace=>({contextReviews:{},costScenarios:[],lifecycle:[],version:2,brief:{idea:'',customer:'',problem:'',alternative:'',offer:'',boundary:'',sector:'Retail & ecommerce',location:'Kuwait'},hypotheses:[],evidence:[],decisions:[],costs:{price:'',variable:'',fixed:'',units:''},nextAction:{task:'',owner:'',due:'',dependency:''},setup:['activity','premises','operations'].map(id=>({id,done:false,note:'',source:'',date:''})),profile:{stage:'Exploring the idea',budget:''},savedTests:[],ideaReviewDecisions:[],updatedAt:new Date().toISOString()})
export function newHypothesis(title='',area:Hypothesis['area']='Customer need'):Hypothesis{return {id:uid(),title,area,priority:'Critical',status:'Unexplored',reviewReason:'',test:{method:area==='Economics'||area==='Delivery'?'Cost or supplier check':area==='Kuwait setup'?'Official source check':'Customer conversations',audience:'',rule:'',result:''}}}
export function startingHypotheses(brief:Brief):Hypothesis[]{return [newHypothesis(brief.problem?`Is this a problem people want to solve: ${brief.problem}`:'What problem would this solve for people?','Customer need'),{...newHypothesis('Would people choose this idea?','Demand'),priority:'Important'}, {...newHypothesis('Can we deliver it within our budget?','Delivery'),priority:'Important'}]}
const str=(v:unknown)=>typeof v==='string'?v:typeof v==='number'?String(v):''
export function migrate(raw:unknown):Workspace {
  if(!raw||typeof raw!=='object')throw new Error('Not a Dukkan backup')
  const old=raw as Record<string,any>
  if(old.version===2)return workspaceSchema.parse(raw)
  if(old.version!==1||!old.brief||!Array.isArray(old.evidence))throw new Error('Not a Dukkan backup')
  const w=blank();w.legacy=raw
  for(const k of ['idea','customer','problem','alternative','offer','boundary'] as const)w.brief[k]=str(old.brief[k])
  if(w.brief.idea)w.hypotheses=startingHypotheses(w.brief)
  const test=old.test||{}
  if(test.assumption){const h=newHypothesis(str(test.assumption),'Demand');h.status='Testing';h.test={method:str(test.method),audience:str(test.audience),rule:str(test.rule),result:str(test.result)};w.hypotheses.unshift(h)}
  w.evidence=old.evidence.map((e:any)=>({id:str(e.id)||uid(),hypothesisId:e.assumption? w.hypotheses.find(h=>h.title===e.assumption)?.id||'':'',kind:kinds.includes(e.kind)?e.kind:'Observation',text:str(e.text),source:str(e.source),date:str(e.date),signal:['Supports','Challenges','Unclear'].includes(e.signal)?e.signal:'Unclear',limitation:str(e.limitation)}))
  w.decisions=(old.history||[]).map((d:any)=>({id:uid(),hypothesisId:w.hypotheses.find(h=>h.title===d.assumption)?.id||'',date:str(d.date),outcome:outcomes.includes(d.decision)?d.decision:'Keep testing',reason:str(d.result),assumption:str(d.assumption),rule:str(d.rule),evidence:[]}))
  for(const k of ['price','variable','fixed','units'] as const)w.costs[k]=str(old.costs?.[k])
  for(const k of ['task','owner','due','dependency'] as const)w.nextAction[k]=str(old.action?.[k])
  return workspaceSchema.parse(w)
}
export function loadWorkspace():{workspace:Workspace;error:string;migrated:boolean}{
  try{const raw=businessStorage.getItem(KEY);if(raw)return {workspace:workspaceSchema.parse(JSON.parse(raw)),error:'',migrated:false};const old=businessStorage.getItem(OLD_KEY);return {workspace:old?migrate(JSON.parse(old)):blank(),error:'',migrated:!!old}}
  catch{return {workspace:blank(),error:'Saved data could not be read. It has been left intact. Export this session before closing it, or restore a valid backup.',migrated:false}}
}
export function linked(w:Workspace,id:string){return w.evidence.filter(e=>e.hypothesisId===id)}
export function signal(w:Workspace,h:Hypothesis){const all=linked(w,h.id).filter(e=>e.kind!=='Assumption');return {supports:all.filter(e=>e.signal==='Supports').length,challenges:all.filter(e=>e.signal==='Challenges').length,total:all.length}}
export function unreviewedChallenges(w:Workspace,h:Hypothesis){
  const last=w.decisions.filter(d=>d.hypothesisId===h.id).at(-1)
  return linked(w,h.id).filter(e=>e.kind!=='Assumption'&&e.signal==='Challenges'&&!last?.evidence.some(saved=>saved.id===e.id&&saved.text===e.text&&saved.signal===e.signal&&saved.source===e.source)).length
}
export function nextHypothesis(w:Workspace){return [...w.hypotheses].sort((a,b)=>{
  const score=(h:Hypothesis)=>(h.reviewReason?100:0)+(unreviewedChallenges(w,h)?50:0)+(h.status==='Revisit'?30:0)+(h.priority==='Critical'?20:h.priority==='Important'?10:0)-(h.status==='Supported so far'&&!h.reviewReason&&!unreviewedChallenges(w,h)||h.status==='Paused'?200:0)
  return score(b)-score(a)
}).find(h=>h.status!=='Paused'&&(h.status!=='Supported so far'||h.reviewReason||unreviewedChallenges(w,h)))}
export const formatMoney=(n:number)=>new Intl.NumberFormat('en-GB',{minimumFractionDigits:3,maximumFractionDigits:3}).format(n)
export function calculate(c:Workspace['costs']) {
  if(Object.values(c).some(v=>v.trim()===''))return {valid:false as const,message:'Add your own estimates to see the trade-offs.'}
  const {price,variable,fixed,units}=Object.fromEntries(Object.entries(c).map(([k,v])=>[k,Number(v)])) as Record<keyof Workspace['costs'],number>
  if([price,variable,fixed,units].some(v=>!Number.isFinite(v)||v<0||v>1e9)||!Number.isInteger(units))return {valid:false as const,message:'Use non-negative figures up to 1 billion and a whole number of units.'}
  const margin=Math.round(price*1000)-Math.round(variable*1000),cost=Math.round(fixed*1000)
  if(!Number.isSafeInteger(margin*units))return {valid:false as const,message:'Reduce these figures to calculate reliably.'}
  return {valid:true as const,margin:margin/1000,result:(margin*units-cost)/1000,breakEven:margin>0?Math.ceil(cost/margin):null,units,message:margin<=0?'A positive contribution is needed to recover fixed costs.':'Based on your assumptions. This is not a demand forecast.'}
}
export function reviseBrief(w:Workspace,brief:Brief):Workspace {
  const changes=(['customer','problem','offer','boundary'] as const).filter(k=>w.brief[k]&&w.brief[k]!==brief[k])
  return {...w,brief,hypotheses:w.hypotheses.length?w.hypotheses.map(h=>({...h,reviewReason:changes.length?`Your ${changes.join(', ')} changed. Review whether this assumption and its evidence still apply.`:h.reviewReason})):startingHypotheses(brief)}
}
export function recordDecision(w:Workspace,h:Hypothesis,outcome:Decision['outcome'],reason:string):Workspace {
  const status:Record<Decision['outcome'],Hypothesis['status']>={'Keep testing':'Testing','Supported so far':'Supported so far','Revise the idea':'Revisit','Pause the idea':'Paused'}
  const action:Record<Decision['outcome'],string>={'Keep testing':'Design the next small test','Supported so far':'Review costs and delivery','Revise the idea':'Revise the business brief','Pause the idea':'Review this idea when something changes'}
  return {...w,hypotheses:w.hypotheses.map(a=>a.id===h.id?{...a,status:status[outcome],reviewReason:''}:a),decisions:[...w.decisions,{id:uid(),hypothesisId:h.id,date:new Date().toISOString(),outcome,reason,assumption:h.title,rule:h.test.rule,evidence:structuredClone(linked(w,h.id))}],nextAction:{...w.nextAction,task:action[outcome],dependency:''}}
}
export function saveTestPlan(w:Workspace,h:Hypothesis):Workspace {
  const exists=w.hypotheses.some(item=>item.id===h.id)
  if(!exists&&(w.hypotheses.length>=100||w.savedTests.length>=100))throw new Error('This workspace has reached its test limit. Export a backup before adding more.')
  return {...w,hypotheses:exists?w.hypotheses.map(a=>a.id===h.id?h:a):[...w.hypotheses,h],savedTests:[...w.savedTests.filter(t=>t.hypothesisId!==h.id),{id:`test-${h.id}`,hypothesisId:h.id,title:h.title,date:new Date().toISOString()}],nextAction:{...w.nextAction,task:`Run the test: ${h.test.method||'customer conversations'}`,owner:w.nextAction.owner||'Founder',dependency:h.test.audience||'Choose who to test with'}}
}
export function adoptProposedTest(w:Workspace,proposal:{hypothesis:string;method:string;audience:string;decisionRule:string},source:{artifactId:string;conversationId:string;title:string}):Workspace{
 if(w.hypotheses.length>=100||w.savedTests.length>=100)throw new Error('This workspace has reached its test limit. Export a backup before adding more.')
 if(w.hypotheses.some(h=>h.test.provenance?.artifactId===source.artifactId))throw new Error('This draft already has a saved test.')
 const title=proposal.hypothesis.trim(),method=proposal.method.trim(),audience=proposal.audience.trim(),rule=proposal.decisionRule.trim()
 if(!title||!method||!audience||!rule)throw new Error('Review and complete each test field before saving.')
 const h:Hypothesis={...newHypothesis(title,'Demand'),priority:'Critical',status:'Testing',test:{method,audience,rule,result:'',provenance:{artifactId:source.artifactId,conversationId:source.conversationId,title:source.title,adoptedAt:new Date().toISOString()}}}
 return saveTestPlan({...w,hypotheses:[...w.hypotheses,h]},h)
}
export function recordIdeaReviewChoice(w:Workspace,entry:{artifactId:string;conversationId:string;choice:'test'|'revise'|'park';reason:string;selectedOption?:string;reviewSummary:string;customOption?:{title:string;kind:'feature'|'expansion'|'pivot';tradeoff:string}}):Workspace{
 if(w.ideaReviewDecisions.length>=100)throw new Error('This workspace has reached its review-decision limit. Export a backup before adding more.')
 if(!entry.reason.trim())throw new Error('Add a reason for your decision.')
 if(entry.customOption&&(!entry.customOption.title.trim()||!entry.customOption.tradeoff.trim()))throw new Error('Describe your option and its trade-off before saving.')
 return {...w,ideaReviewDecisions:[...w.ideaReviewDecisions,{id:uid(),artifactId:entry.artifactId,conversationId:entry.conversationId,date:new Date().toISOString(),choice:entry.choice,reason:entry.reason.trim(),selectedOption:entry.selectedOption||'',reviewSummary:entry.reviewSummary,customOption:entry.customOption}],nextAction:{...w.nextAction,task:entry.choice==='test'?'Design a small customer test':entry.choice==='revise'?'Revise the business idea':'Idea parked; review before continuing'}}
}
export function ideaReviewPriority(input:{hasReview:boolean;choice:Workspace['ideaReviewDecisions'][number]|undefined;draftAt:string;testAt:string;validationDecisionAt:string}):'reviewIdea'|'test'|'revise'|'park'|null{
 if(!input.hasReview)return null
 const time=(value:string)=>{const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:0}
 const validationAt=Math.max(time(input.testAt),time(input.validationDecisionAt))
 if(input.choice&&time(input.choice.date)>=validationAt)return input.choice.choice
 if(!input.choice&&time(input.draftAt)>=validationAt)return 'reviewIdea'
 return null
}
export function workedExample():Workspace {
  const w=blank();w.brief={idea:'Noura · Perfume discovery sets',customer:'People in Kuwait buying unfamiliar perfume online',problem:'They cannot try a scent before committing to a full bottle.',alternative:'Visit a shop, ask a friend or buy a familiar brand.',offer:'Three small fragrance samples, delivered locally.',boundary:'KWD 300 test budget. Evenings only. Verify approvals before taking orders.',sector:'Retail & ecommerce',location:'Kuwait City'}
  w.hypotheses=[{...newHypothesis('Will people pay to try a scent before buying a full bottle?','Demand'),id:'sample-demand',status:'Testing',test:{method:'Customer conversations',audience:'Five recent online perfume buyers',rule:'If three describe a recent buying problem, test the offer with a small interest list.',result:'Fictional example: two interview notes point in different directions.'}},{...newHypothesis('Can one discovery set cover packaging and local delivery?','Economics'),id:'sample-economics',priority:'Important'},{...newHypothesis('Which activity and approvals apply to fragrance samples?','Kuwait setup'),id:'sample-setup',priority:'Important'}]
  w.evidence=[{id:'sample-e1',hypothesisId:'sample-demand',kind:'Customer conversation',text:'“I left the bottle in my basket because I couldn’t try it.”',source:'Fictional interview · Customer A',date:today(),signal:'Supports',limitation:'One illustrative account. No market finding.',},{id:'sample-e2',hypothesisId:'sample-demand',kind:'Customer conversation',text:'“I’d try a sample, but paying delivery for it feels expensive.”',source:'Fictional interview · Customer B',date:today(),signal:'Challenges',limitation:'Illustrative willingness to pay, not a real transaction.'}]
  w.profile={stage:'Testing demand',budget:'300'};w.costs={price:'12',variable:'7.5',fixed:'90',units:'20'};w.nextAction={task:'Find out whether delivery cost changes interest in the set.',owner:'Founder',due:'',dependency:'Speak to three more recent buyers.'};return w
}
export function preparationExample():Workspace{
 const w=blank();w.brief={idea:'Madar Design Studio',customer:'Small businesses in Kuwait exploring a visual identity',problem:'A fictional founder needs to organise the first commercial-licence preparation.',alternative:'Collect sources and compare documents manually.',offer:'Visual identity and digital design deliverables.',boundary:'Synthetic demonstration only. Incorporation is assumed, not verified. No official licence or readiness claim.',sector:'Professional services',location:'Kuwait'};
 w.profile={stage:'Preparing to launch',budget:''};w.hypotheses=[{...newHypothesis('Which applicability questions remain before licence preparation?','Kuwait setup'),id:'madar-setup'},{...newHypothesis('Will the proposed customers choose the design offer?','Demand'),id:'madar-demand',priority:'Important'}];return w
}
export function download(content:string,name:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
export function exportPlan(w:Workspace){const c=calculate(w.costs), lines=['# Dukkan — decision record',`Exported: ${new Date().toISOString()}`,'','## Business brief',...Object.entries(w.brief).map(([k,v])=>`${k}: ${v||'Not yet defined'}`),'','## Business context',`Stage (set by founder): ${w.profile.stage}`,`Planning budget (KWD): ${w.profile.budget||'Not set'}`,'','## Assumptions and evidence'];w.hypotheses.forEach(h=>{lines.push('',`### ${h.title}`,`Area: ${h.area}; Priority: ${h.priority}; Status: ${h.status}`,`Review needed: ${h.reviewReason||'No change flagged'}`,`Method: ${h.test.method}`,`Audience: ${h.test.audience}`,`Decision rule: ${h.test.rule}`,`Test result: ${h.test.result}`);linked(w,h.id).forEach(e=>lines.push(`- [${e.kind} / ${e.signal}] ${e.text}`,`  Source: ${e.source}; Date: ${e.date}; Limitation: ${e.limitation||'Not recorded'}`))});lines.push('','## Unlinked notes');w.evidence.filter(e=>!e.hypothesisId).forEach(e=>lines.push(`[${e.kind}] ${e.text} — ${e.source} (${e.date})`));lines.push('','## Decision trail');w.decisions.forEach(d=>{lines.push('',`${d.date}: ${d.outcome}`,d.assumption,`Rule: ${d.rule}`,`Reason: ${d.reason}`);d.evidence.forEach(e=>lines.push(`Evidence snapshot: ${e.text} — ${e.source} (${e.date}), ${e.signal}`))});lines.push('','## Economics',...Object.entries(w.costs).map(([k,v])=>`${k}: ${v||'Unknown'}`));if(c.valid)lines.push(`Unit contribution: KWD ${formatMoney(c.margin)}`,`Break-even units: ${c.breakEven??'No finite break-even with positive contribution'}`,`Operating result: KWD ${formatMoney(c.result)}`);lines.push(c.message,'Excludes startup investment, financing, tax and cash timing.','','## Kuwait setup');w.setup.forEach(s=>lines.push(`${s.id}: ${s.done?'Reviewed by founder':'Open'}`,`Note: ${s.note}`,`Source: ${s.source}; Date: ${s.date}`));lines.push('','## Next action',...Object.entries(w.nextAction).map(([k,v])=>`${k}: ${v||'Not set'}`),'','Local business record. AI drafts are separate from saved facts. Nothing is submitted to official services.');return lines.join('\n')}
export function exportPlanWithReviews(w:Workspace){
 const reviewLines=w.ideaReviewDecisions.flatMap(entry=>['',`### ${entry.date}: ${entry.choice}`,`Draft: ${entry.artifactId}`,`Reason: ${entry.reason}`,`AI review summary: ${entry.reviewSummary||'Not recorded'}`,`Selected AI option: ${entry.selectedOption||'None'}`,...(entry.customOption?[`Founder option (${entry.customOption.kind}): ${entry.customOption.title}`,`Trade-off: ${entry.customOption.tradeoff}`]:[])])
 const provenanceLines=w.hypotheses.filter(item=>item.test.provenance).flatMap(item=>['',`${item.title}: ${item.test.provenance!.title} (${item.test.provenance!.artifactId})`, `Adopted: ${item.test.provenance!.adoptedAt}`])
 return [exportPlan(w),'','## Saved cost scenarios (estimates)',...w.costScenarios.map(row=>JSON.stringify(row)),'','## Context review markers',JSON.stringify(w.contextReviews),'','## Business lifecycle records',...w.lifecycle.map(row=>JSON.stringify(row)), '', '## Founder idea-review choices',...(reviewLines.length?reviewLines:['None recorded.']),'','## Test-plan draft origins',...(provenanceLines.length?provenanceLines:['None recorded.'])].join('\n')
}
