import {saveLifecycle} from '../../../shared/lifecycle.ts'
import type {LifecycleValues} from '../../../shared/lifecycle.ts'
import {blank,newHypothesis,workspaceSchema,type Workspace} from './workspace.ts'
import {reconcileContext} from './business-impact.ts'

/**
 * Opt-in fictional Kuwait service-business walkthrough. Every lifecycle row is
 * prepared and simulated; nothing here represents an actual person, customer,
 * transaction, supplier, hiring outcome or licence requirement.
 */
export function kuwaitServiceExample():Workspace {
 const w=blank()
 w.brief={
  idea:'Sidr Studio · Monthly social content support (fictional example)',
  customer:'Small Kuwait-based shops that need a steady set of social posts',
  problem:'A shop owner may have limited time to plan and prepare regular content. This is an assumption to test.',
  alternative:'The owner prepares posts in-house, hires a freelancer, or posts less often.',
  offer:'A monthly service package with a content plan and prepared social post designs.',
  boundary:'Illustrative planning only. No real customer research, sales, employment, supplier engagement or legal eligibility has been verified.',
  sector:'Professional services',location:'Kuwait'
 }
 w.profile={stage:'Testing demand',budget:'300'}
 w.costs={price:'90',variable:'15',fixed:'120',units:'3'}
 w.nextAction={task:'Plan a small customer study before offering the service.',owner:'Founder',due:'',dependency:'Choose five shop owners to invite; no invitations have been sent.'}
 const demand=newHypothesis('Would a small shop pay KWD 90 per month for this content package?','Demand')
 demand.id='sidr-sample-demand'
 demand.status='Unexplored'
 demand.test={
  method:'Proposed customer study · five short interviews',
  audience:'Five shop owners in Kuwait who prepare their own social content',
  rule:'Continue exploring if at least three describe a recent content-planning problem and agree to review a sample package.',
  result:''
 }
 const delivery=newHypothesis('Can the monthly package be delivered for KWD 15 variable cost per client?','Economics')
 delivery.id='sidr-sample-delivery';delivery.priority='Important'
 const setup=newHypothesis('Which business activity and approvals apply to this service?','Kuwait setup')
 setup.id='sidr-sample-setup';setup.priority='Important'
 w.hypotheses=[demand,delivery,setup]
 w.evidence=[{
  id:'sidr-sample-interview-01',hypothesisId:demand.id,kind:'Customer conversation',
  text:'Completed sample interview exercise: a hypothetical shop owner says planning posts takes time, but would first compare the package with doing the work in-house.',
  source:'Fictional interview rehearsal · sample only',date:'2026-10-01',signal:'Unclear',
  limitation:'This is a completed illustrative exercise, not a real interview or customer finding.',origin:'simulated'
 }]
 w.setup=[
  {id:'activity',done:false,note:'Question to verify: which activity wording and licence route fit this proposed service?',source:'https://moci.example.invalid/activity-guide',date:''},
  {id:'premises',done:false,note:'Question to verify: are premises or a home-business route relevant?',source:'https://moci.example.invalid/premises-guide',date:''},
  {id:'operations',done:false,note:'Question to verify: are any additional approvals relevant to the final activity?',source:'https://moci.example.invalid/approvals-guide',date:''}
 ]
 const records:Array<{id:string;values:LifecycleValues}>=[
  ...[1,2,3].map((n)=>({id:`sidr-sample-customer-${n}`,values:{category:'sales',entityType:'contact',title:`Sample customer ${String(n).padStart(2,'0')} · fictional`,details:'Generic illustrative shop-owner profile. No real person, business relationship or contact attempt.',basis:'simulated',stage:'new',contact:`customer-${String(n).padStart(2,'0')}@example.invalid`,channel:'Not contacted',source:'https://directory.example.invalid/sample-shop',nextAction:'Potential interview participant only; invite only after the founder chooses to run the study.'}})),
  {id:'sidr-sample-lead-01',values:{category:'sales',entityType:'lead',title:'Sample lead · neighbourhood shop (fictional)',details:'Illustrative pipeline example only. No enquiry or interest has been received.',basis:'simulated',stage:'prospect',contact:'customer-01@example.invalid',nextAction:'If the founder chooses, ask about the last time social content was delayed.'}},
  {id:'sidr-sample-proposal-01',values:{category:'sales',entityType:'proposal',title:'Draft package outline · sample customer 01',details:'Fictional one-month content package for review. Not sent, accepted or promised.',basis:'simulated',stage:'draft',relatedId:'sidr-sample-lead-01',quantity:'1',unitPrice:'90.000',contact:'customer-01@example.invalid',source:'https://offers.example.invalid/sidr/sample-package'}},
  {id:'sidr-sample-followup-01',values:{category:'sales',entityType:'followup',title:'Possible study invitation · sample customer 01',details:'Proposed follow-up for a future study. No message has been drafted or sent.',basis:'simulated',stage:'planned',relatedId:'sidr-sample-customer-1',contact:'customer-01@example.invalid',nextAction:'Decide whether to invite this sample profile after reviewing the study plan.'}},
  {id:'sidr-sample-fin-income-01',values:{category:'operation',entityType:'finance',title:'Illustrative monthly package · sample customer 01',details:'KWD 90 scenario amount for the worked example. Not earned revenue and not a transaction.',direction:'income',date:'2026-10-01',amount:'90.000',basis:'simulated',evidence:'Fictional arithmetic example only; no invoice or payment exists.',currency:'KWD'}},
  {id:'sidr-sample-fin-income-02',values:{category:'operation',entityType:'finance',title:'Illustrative monthly package · sample customer 02',details:'KWD 90 scenario amount for the worked example. Not earned revenue and not a transaction.',direction:'income',date:'2026-10-01',amount:'90.000',basis:'simulated',evidence:'Fictional arithmetic example only; no invoice or payment exists.',currency:'KWD'}},
  {id:'sidr-sample-fin-income-03',values:{category:'operation',entityType:'finance',title:'Illustrative monthly package · sample customer 03',details:'KWD 90 scenario amount for the worked example. Not earned revenue and not a transaction.',direction:'income',date:'2026-10-01',amount:'90.000',basis:'simulated',evidence:'Fictional arithmetic example only; no invoice or payment exists.',currency:'KWD'}},
  {id:'sidr-sample-fin-variable-01',values:{category:'operation',entityType:'finance',title:'Illustrative variable delivery cost · sample customer 01',details:'KWD 15 scenario amount per client. Not an incurred cost or payment.',direction:'expense',date:'2026-10-01',amount:'15.000',basis:'simulated',evidence:'Fictional unit-cost assumption only.',currency:'KWD'}},
  {id:'sidr-sample-fin-variable-02',values:{category:'operation',entityType:'finance',title:'Illustrative variable delivery cost · sample customer 02',details:'KWD 15 scenario amount per client. Not an incurred cost or payment.',direction:'expense',date:'2026-10-01',amount:'15.000',basis:'simulated',evidence:'Fictional unit-cost assumption only.',currency:'KWD'}},
  {id:'sidr-sample-fin-variable-03',values:{category:'operation',entityType:'finance',title:'Illustrative variable delivery cost · sample customer 03',details:'KWD 15 scenario amount per client. Not an incurred cost or payment.',direction:'expense',date:'2026-10-01',amount:'15.000',basis:'simulated',evidence:'Fictional unit-cost assumption only.',currency:'KWD'}},
  {id:'sidr-sample-fin-fixed',values:{category:'operation',entityType:'finance',title:'Illustrative monthly fixed costs',details:'KWD 120 scenario amount per month. Not an incurred cost or payment.',direction:'expense',date:'2026-10-01',amount:'120.000',basis:'simulated',evidence:'Fictional monthly fixed-cost assumption only.',currency:'KWD'}},
  {id:'sidr-sample-budget',values:{category:'operation',entityType:'budget',title:'Illustrative monthly operating budget',details:'KWD 180 monthly operating limit for the three-client scenario. The KWD 165 modelled operating cost fits inside this allowance; no spend has occurred.',direction:'expense',date:'2026-10-01',amount:'180.000',basis:'simulated',evidence:'Illustrative budget limit; not actual cash.',currency:'KWD'}},
  {id:'sidr-sample-role',values:{category:'hiring',entityType:'role',title:'Sample role · freelance content designer',details:'Generic role outline for a possible future contractor. No vacancy, candidate, offer or hiring decision exists.',basis:'simulated',stage:'draft',owner:'Founder',evidence:'Fictional role example. Scope and budget require review.'}},
  {id:'sidr-sample-candidate',values:{category:'hiring',entityType:'candidate',title:'Sample candidate record · no identity',details:'Placeholder showing how a candidate record can be organised. No real applicant is represented.',basis:'simulated',stage:'sourced',relatedId:'sidr-sample-role',contact:'candidate-01@example.invalid',evidence:'Illustrative placeholder only; no application or sourcing took place.'}},
  {id:'sidr-sample-onboarding',values:{category:'hiring',entityType:'onboarding',title:'Sample contractor onboarding checklist',details:'Proposed checklist for review if a contractor is engaged in future. No one has been hired.',basis:'simulated',stage:'not_started',relatedId:'sidr-sample-role',owner:'Founder',nextAction:'Confirm scope, agreement and access needs before any engagement.'}},
  {id:'sidr-sample-supplier',values:{category:'operation',entityType:'supplier',title:'Sample design support supplier',details:'Generic example supplier profile for comparing freelance design support. No supplier has been identified or contacted.',basis:'simulated',stage:'researching',contact:'studio@example.invalid',source:'https://suppliers.example.invalid/design-support',nextAction:'Compare scope, revision limits and delivery terms if the founder chooses to request quotes.'}},
  {id:'sidr-sample-task',values:{category:'operation',entityType:'task',title:'Prepare a sample content brief',details:'Illustrative task to draft one sample post for internal review. No customer asset or content has been received.',basis:'simulated',stage:'todo',owner:'Founder',nextAction:'Choose a fictional shop category and label all mock content.'}},
  {id:'sidr-sample-quote',values:{category:'operation',entityType:'quote',title:'Example quote request · design support',details:'Example request outline only. No quote was requested or received.',basis:'simulated',contact:'studio@example.invalid',source:'https://quotes.example.invalid/design-support',nextAction:'Leave pricing blank until a real written quote is received.'}},
  {id:'sidr-sample-order',values:{category:'operation',entityType:'order',title:'Sample purchase request · design support',details:'Unapproved example purchase request. No order or payment was made.',basis:'simulated',stage:'planned',relatedId:'sidr-sample-quote',quantity:'1',unitPrice:'15.000',evidence:'Illustrative unit-cost assumption, not a supplier quote.'}},
  {id:'sidr-sample-licence',values:{category:'licence',title:'Question to check · service activity and route',details:'Illustrative research question. This is not a legal requirement or confirmation of eligibility.',basis:'simulated',source:'https://moci.example.invalid/activity-guide',evidence:'Verify against the relevant current official service before relying on an answer.'}},
  {id:'sidr-sample-document',values:{category:'document',title:'Sample checklist · founder information to gather',details:'Preparation checklist example: proposed activity description, founder details and premises question. Applicability and exact requirements remain unverified.',basis:'simulated',relatedId:'sidr-sample-licence',source:'https://moci.example.invalid/document-guide',evidence:'Illustrative checklist only; not an official requirement list.'}},
  {id:'sidr-sample-launch',values:{category:'launch',title:'Milestone · review sample package',details:'Possible internal review milestone after a sample package is prepared. Not a launch or customer delivery.',basis:'simulated',owner:'Founder',nextAction:'Review the scope and cost assumptions before discussing the offer.'}},
  {id:'sidr-sample-decision',values:{category:'business_decision',title:'Working decision · study before launch',details:'Keep the service at planning stage until a small customer study and delivery-cost check are completed.',basis:'simulated',evidence:'Illustrative decision only. No study has taken place and no market demand is claimed.'}}
 ]
 for(const row of records)w.lifecycle=saveLifecycle(w.lifecycle,{...row.values,status:'prepared'},row.id,'2026-10-01T09:00:00.000Z')
 w.costScenarios=[{id:'sidr-sample-monthly',name:'Illustrative month · 3 clients',note:'Scenario arithmetic only. Three simulated client records × KWD 90; KWD 15 variable cost per client; KWD 120 fixed cost. No revenue or expenditure is actual.',date:'2026-10-01',archived:false,costs:{price:'90',variable:'15',fixed:'120',units:'3'}}]
 return reconcileContext(blank(),workspaceSchema.parse(w))
}
