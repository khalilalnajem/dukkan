import {recordImpact} from './business-impact.ts'
import {saveLifecycle,lifecycleFields} from '../../../shared/lifecycle.ts'
import {z} from 'zod'
import {workspaceSchema,reviseBrief,recordDecision,type Workspace} from './workspace.ts'
const base={summary:z.string().min(1).max(2000),expectedUpdatedAt:z.string()}
export const workspaceProposalSchema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('lifecycle'),values:z.partialRecord(z.enum(lifecycleFields),z.string().max(4000))}),
 z.object({...base,kind:z.literal('brief'),values:workspaceSchema.shape.brief.partial().strict()}),
 z.object({...base,kind:z.literal('costs'),values:workspaceSchema.shape.costs.partial().strict()}),
 z.object({...base,kind:z.literal('test_result'),values:z.object({hypothesisId:z.string(),result:z.string().min(1).max(4000)}).strict()}),
 z.object({...base,kind:z.literal('decision'),values:z.object({hypothesisId:z.string(),outcome:z.enum(['Keep testing','Supported so far','Revise the idea','Pause the idea']),reason:z.string().min(1).max(4000)}).strict()})
])
export function applyConversationProposal(workspace:Workspace,input:unknown):Workspace{
 const proposal=workspaceProposalSchema.parse(input)
 if(proposal.expectedUpdatedAt!==workspace.updatedAt)throw new Error('Your idea changed after this suggestion. Ask Dukkan to refresh it before saving.')
 if(!Object.keys(proposal.values).length)throw new Error('This suggestion has no changes to save.')
 if(proposal.kind==='lifecycle'){if(proposal.values.recordId&&['approved','submitted','completed'].includes(proposal.values.status||'')){const row=workspace.lifecycle.find(r=>r.id===proposal.values.recordId);if(row){const impact=recordImpact(workspace,row);if(impact.missing||impact.changed.length)throw new Error('Review the changed business context before advancing this record.')}}return {...workspace,lifecycle:saveLifecycle(workspace.lifecycle,proposal.values,crypto.randomUUID(),new Date().toISOString())}}
 if(proposal.kind==='brief')return reviseBrief(workspace,{...workspace.brief,...proposal.values})
 if(proposal.kind==='costs'){if(Object.values(proposal.values).some(value=>value!==''&&(!/^\d+(\.\d+)?$/.test(value)||Number(value)>1e12)))throw new Error('Cost assumptions must be non-negative numbers, or blank if unknown.');return {...workspace,costs:{...workspace.costs,...proposal.values}}}
 const hypothesis=workspace.hypotheses.find(item=>item.id===proposal.values.hypothesisId)
 if(!hypothesis)throw new Error('This test no longer exists. Ask for an updated suggestion.')
 if(proposal.kind==='decision'){
  if(!hypothesis.test.result.trim())throw new Error('Record what actually happened before saving a decision.')
  return recordDecision(workspace,hypothesis,proposal.values.outcome,proposal.values.reason)
 }
 return {...workspace,hypotheses:workspace.hypotheses.map(item=>item.id===hypothesis.id?{...item,test:{...item.test,result:proposal.values.result}}:item)}
}
export const conversationStages=[
 {id:'idea',label:'Challenge',prompt:'Challenge my business idea using relevant Kuwait evidence. Give a candid critique, an evidence-readiness score with reasons and practical options. Ask only one essential question if needed. Save the critique.',action:{type:'stage_draft',stage:'idea'}},
 {id:'validate',label:'Test demand',prompt:'Use my saved idea and critique to propose the smallest useful customer test. Draft the hypothesis, method, audience and decision rule for me to approve here. Do not invent results. Save the validation draft.',action:{type:'stage_draft',stage:'validate'}},
 {id:'plan',label:'Plan costs',prompt:'Help me work out the economics of my saved idea. Use recorded tests and decisions, label missing evidence and estimates, and ask one essential question at a time. Prepare a plan draft using Kuwait sources. Never treat a spending budget as revenue.',action:{type:'stage_draft',stage:'plan'}},
 {id:'apply',label:'Prepare setup',prompt:'Prepare the business setup worksheet from what you already know. Retrieve relevant official Kuwait guidance, fill only known details, leave unknowns blank and ask the next essential question here. Nothing is submitted.',action:{type:'application_worksheet'}}
] as const
