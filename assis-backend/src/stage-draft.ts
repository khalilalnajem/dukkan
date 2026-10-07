import {ensure} from '../contracts/index.ts';
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const strings={type:'array',items:{type:'string',minLength:1,maxLength:2000},maxItems:20};
const text=(maxLength:number)=>({type:'string',minLength:1,maxLength});
export const ideaReviewDimensionKeys=['customer_need','differentiation','economics','feasibility','evidence'] as const;
export type ProposedTest={hypothesis:string;method:string;audience:string;decisionRule:string};
export type IdeaReview={dimensions:{key:typeof ideaReviewDimensionKeys[number];score:number;reason:string;evidenceNeeded:string}[];criticalRisks:string[];options:{title:string;kind:'feature'|'expansion'|'pivot';benefit:string;tradeoff:string;test:string}[];recommendation:'test'|'revise'|'park';rationale:string};
const proposedTestSchema={type:'object',properties:{hypothesis:text(2000),method:text(2000),audience:text(2000),decisionRule:text(2000)},required:['hypothesis','method','audience','decisionRule'],additionalProperties:false};
const ideaReviewSchema={type:'object',description:'Critical evidence-readiness review, not probability of success or proof of validation. Score each dimension 0–4 and explain gaps.',properties:{dimensions:{type:'array',minItems:5,maxItems:5,items:{type:'object',properties:{key:{type:'string',enum:ideaReviewDimensionKeys},score:{type:'integer',minimum:0,maximum:4},reason:text(2000),evidenceNeeded:text(2000)},required:['key','score','reason','evidenceNeeded'],additionalProperties:false}},criticalRisks:strings,options:{type:'array',maxItems:12,items:{type:'object',properties:{title:text(180),kind:{type:'string',enum:['feature','expansion','pivot']},benefit:text(2000),tradeoff:text(2000),test:text(2000)},required:['title','kind','benefit','tradeoff','test'],additionalProperties:false}},recommendation:{type:'string',enum:['test','revise','park']},rationale:text(2000)},required:['dimensions','criticalRisks','options','recommendation','rationale'],additionalProperties:false};
export const stageDraftSchema={type:'object',properties:{stage:{type:'string',enum:['idea','validate','plan']},title:text(180),content:text(16000),assumptions:strings,unknowns:strings,citationIds:strings,proposedTest:proposedTestSchema,ideaReview:ideaReviewSchema},required:['stage','title','content','assumptions','unknowns','citationIds'],additionalProperties:false};
function object(value:any,keys:string[],label:string){ensure(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(value,k)),'INVALID_STAGE_DRAFT',`${label} must contain only its required fields`);}
function bounded(value:any,max:number,label:string):string {ensure(typeof value==='string'&&value.trim().length>0&&value.length<=max,'INVALID_STAGE_DRAFT',`${label} must be nonempty bounded text`);return value;}
function listOfText(value:any,label:string):string[]{ensure(Array.isArray(value)&&value.length<=20,'INVALID_STAGE_DRAFT',`${label} must be a bounded list`);return value.map((v:any)=>bounded(v,2000,label));}
function proposedTest(value:any):ProposedTest {const keys=['hypothesis','method','audience','decisionRule'];object(value,keys,'Proposed test');return Object.fromEntries(keys.map(k=>[k,bounded(value[k],2000,`Proposed test ${k}`)])) as ProposedTest;}
function ideaReview(value:any):IdeaReview {
 object(value,['dimensions','criticalRisks','options','recommendation','rationale'],'Idea review');
 ensure(Array.isArray(value.dimensions)&&value.dimensions.length===5,'INVALID_STAGE_DRAFT','Idea review requires all five dimensions');
 const seen=new Set<string>();
 const dimensions=value.dimensions.map((d:any)=>{object(d,['key','score','reason','evidenceNeeded'],'Review dimension');ensure(ideaReviewDimensionKeys.includes(d.key)&&!seen.has(d.key),'INVALID_STAGE_DRAFT','Review dimensions must be unique and include all five keys');seen.add(d.key);ensure(Number.isInteger(d.score)&&d.score>=0&&d.score<=4,'INVALID_STAGE_DRAFT','Evidence-readiness scores must be integers from 0 to 4');return {key:d.key,score:d.score,reason:bounded(d.reason,2000,'Dimension reason'),evidenceNeeded:bounded(d.evidenceNeeded,2000,'Evidence needed')};});
 ensure(Array.isArray(value.options)&&value.options.length<=12,'INVALID_STAGE_DRAFT','Idea review options must be a bounded list');
 const options=value.options.map((o:any)=>{object(o,['title','kind','benefit','tradeoff','test'],'Review option');ensure(['feature','expansion','pivot'].includes(o.kind),'INVALID_STAGE_DRAFT','Choose feature, expansion or pivot');return {title:bounded(o.title,180,'Option title'),kind:o.kind,benefit:bounded(o.benefit,2000,'Option benefit'),tradeoff:bounded(o.tradeoff,2000,'Option tradeoff'),test:bounded(o.test,2000,'Option test')};});
 ensure(['test','revise','park'].includes(value.recommendation),'INVALID_STAGE_DRAFT','Choose test, revise or park');
 return {dimensions,criticalRisks:listOfText(value.criticalRisks,'Critical risks'),options,recommendation:value.recommendation,rationale:bounded(value.rationale,2000,'Review rationale')};
}
export function buildStageDraft(args:any,available:any[]){
 ensure(['idea','validate','plan'].includes(args.stage),'INVALID_STAGE','Choose idea, validate or plan');
 bounded(args.title,180,'Draft title');bounded(args.content,16000,'Draft content');
 for(const key of ['assumptions','unknowns','citationIds'])listOfText(args[key],key);
 const structured:{proposedTest?:ProposedTest;ideaReview?:IdeaReview}={};
 if(args.proposedTest!==undefined)structured.proposedTest=proposedTest(args.proposedTest);
 if(args.ideaReview!==undefined)structured.ideaReview=ideaReview(args.ideaReview);
 const citations=args.citationIds.map((id:string)=>{const found=available.find(c=>[c.sourceID,c.sourceId,c.id,c.chunkID].includes(id));ensure(found,'UNRETRIEVED_CITATION','Draft citations must match evidence retrieved during this turn');return found;});
 const caveats=['AI-authored working draft. Assumptions are unverified; this does not establish demand or legal eligibility.'];
 if(!citations.length)caveats.push('No source evidence is cited. Treat this as a proposal requiring validation.');
 if(structured.ideaReview)caveats.push('Scores assess evidence readiness, not business success. An AI recommendation does not validate the idea or complete a stage.');
 if(structured.proposedTest)caveats.push('This test is a proposal. Review and adopt it before recording any real results.');
 const list=(items:string[])=>'<ul>'+items.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';
 const review=structured.ideaReview;
 const reviewHtml=review?'<section><h2>Critical idea review</h2><p>Evidence readiness: '+review.dimensions.reduce((n,d)=>n+d.score,0)+'/20. This is not a success probability.</p>'+review.dimensions.map(d=>'<h3>'+esc(d.key.replaceAll('_',' '))+': '+d.score+'/4</h3><p>'+esc(d.reason)+'</p><p>Evidence needed: '+esc(d.evidenceNeeded)+'</p>').join('')+'<h3>Critical risks</h3>'+list(review.criticalRisks)+'<h3>Options to consider</h3>'+review.options.map(o=>'<article><h4>'+esc(o.title)+' ('+esc(o.kind)+')</h4><p>Benefit: '+esc(o.benefit)+'</p><p>Trade-off: '+esc(o.tradeoff)+'</p><p>Test: '+esc(o.test)+'</p></article>').join('')+'<h3>Recommendation: '+esc(review.recommendation)+'</h3><p>'+esc(review.rationale)+'</p></section>':'';
 const test=structured.proposedTest;
 const testHtml=test?'<section><h2>Proposed validation test</h2>'+Object.entries(test).map(([k,v])=>'<h3>'+esc(k)+'</h3><p>'+esc(v)+'</p>').join('')+'</section>':'';
 const html='<!doctype html><html><meta charset="utf-8"><title>'+esc(args.title)+'</title><body><h1>'+esc(args.title)+'</h1>'+list(caveats)+'<div style="white-space:pre-wrap">'+esc(args.content)+'</div>'+reviewHtml+testHtml+'<h2>Assumptions</h2>'+list(args.assumptions)+'<h2>Unknowns</h2>'+list(args.unknowns)+'<h2>Sources</h2><pre style="white-space:pre-wrap">'+esc(JSON.stringify(citations,null,2))+'</pre></body></html>';
 return {stage:args.stage,title:args.title,content:args.content,assumptions:args.assumptions,unknowns:args.unknowns,citations,caveats,...structured,html};
}

// Recognise explicit saved-output requests; ordinary discussion remains unforced.
export function explicitStageRequest(text:string){
 const clauses=text.split(/[.!?\n؛؟]/).map(s=>s.trim());
 for(const clause of clauses){
  if(/\b(?:do not|don't|dont|not yet|without|no need)\b|لا ت|لا أريد/.test(clause.toLowerCase()))continue;
  const match=clause.match(/^(?:please\s+)?(?:save|prepare|create|write|draft)\s+(?:me\s+)?(?:an?\s+|the\s+)?(idea|ideation|validation|planning|plan)(?:[- ]stage)?\s+(?:draft|review|plan)\b/i);
  if(match)return {type:'stage_draft' as const,stage:({idea:'idea',ideation:'idea',validation:'validate',planning:'plan',plan:'plan'} as const)[match[1].toLowerCase() as 'idea']};
  const ar=clause.match(/^(?:احفظ|جهز|أعد|اكتب)\s+مسودة\s+(الفكرة|التحقق|التخطيط)/);
  if(ar)return {type:'stage_draft' as const,stage:ar[1]==='الفكرة'?'idea':ar[1]==='التحقق'?'validate':'plan'};
 }
 return null;
}
