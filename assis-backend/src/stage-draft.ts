import {ensure} from '../contracts/index.ts';
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const strings={type:'array',items:{type:'string',minLength:1,maxLength:2000},maxItems:20};
const citationIds={...strings,description:'Prefer the exact retrieved chunkID for a passage. A publication-level sourceID is accepted only when it resolves to one unique retrieved passage.'};
const text=(maxLength:number)=>({type:'string',minLength:1,maxLength});
const label=(value:string)=>({customer_need:'Customer need',decisionRule:'Decision rule',evidenceNeeded:'Evidence needed',criticalRisks:'Critical risks'} as Record<string,string>)[value]||value.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
function safeUrl(value:unknown):string|null {if(typeof value!=='string'||!value.trim())return null;try{const parsed=new URL(value);return ['http:','https:'].includes(parsed.protocol)?parsed.href:null;}catch{return null;}}
function inlineMarkdown(value:string):string {
 const pattern=/\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)|`([^`]+)`/g;
 let html='',last=0,match:RegExpExecArray|null;
 while((match=pattern.exec(value))){html+=esc(value.slice(last,match.index));if(match[1]!==undefined){const href=safeUrl(match[2]);html+=href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(match[1])}</a>`:esc(match[1]);}else if(match[3]!==undefined||match[4]!==undefined)html+=`<strong>${esc(match[3]??match[4])}</strong>`;else if(match[5]!==undefined||match[6]!==undefined)html+=`<em>${esc(match[5]??match[6])}</em>`;else html+=`<code>${esc(match[7])}</code>`;last=pattern.lastIndex;}
 return html+esc(value.slice(last));
}
function tableCells(line:string):string[]{return line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim());}
function isTableRule(line:string):boolean{return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);}
/** A deliberately small, safe Markdown renderer for saved stage-draft prose. Raw HTML is always text. */
export function renderStageMarkdown(markdown:string):string {
 const lines=markdown.replace(/\r\n?/g,'\n').split('\n');const blocks:string[]=[];let i=0;
 while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
  if(/^```/.test(line)){const code:string[]=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;blocks.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);continue;}
  const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);if(heading){const level=Math.min(heading[1].length+1,6);blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);i++;continue;}
  if(i+1<lines.length&&line.includes('|')&&isTableRule(lines[i+1])){const heads=tableCells(line);i+=2;const rows:string[][]=[];while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){rows.push(tableCells(lines[i++]));}blocks.push(`<div class="table-wrap"><table><thead><tr>${heads.map(cell=>`<th scope="col">${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${heads.map((_,col)=>`<td>${inlineMarkdown(row[col]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;}
  const listMatch=line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);if(listMatch){const ordered=!!listMatch[2],tag=ordered?'ol':'ul',items:string[]=[];while(i<lines.length){const item=lines[i].match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);if(!item||!!item[2]!==ordered)break;items.push(`<li>${inlineMarkdown(item[3])}</li>`);i++;}blocks.push(`<${tag}>${items.join('')}</${tag}>`);continue;}
  if(/^\s*>\s?/.test(line)){const quoted:string[]=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quoted.push(lines[i++].replace(/^\s*>\s?/,'').trim());blocks.push(`<blockquote>${quoted.map(v=>`<p>${inlineMarkdown(v)}</p>`).join('')}</blockquote>`);continue;}
  const paragraph=[line.trim()];i++;while(i<lines.length&&lines[i].trim()&&!/^\s{0,3}#{1,6}\s/.test(lines[i])&&!/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[i])&&!/^\s*>/.test(lines[i])&&!(i+1<lines.length&&lines[i].includes('|')&&isTableRule(lines[i+1]))&&!/^```/.test(lines[i]))paragraph.push(lines[i++].trim());
  blocks.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
 }
 return blocks.join('\n');
}
function sourceList(citations:any[]):string {
 if(!citations.length)return '<p class="muted">No sources were cited in this draft.</p>';
 return '<ol class="sources">'+citations.map((source:any,index:number)=>{
  const title=typeof source.title==='string'&&source.title.trim()?source.title:`Source ${index+1}`;const href=safeUrl(source.url);const publisher=source.publisher||source.authority;const excerpt=source.excerpt||source.passage;const limitations=Array.isArray(source.limitations)?source.limitations.filter(Boolean):source.limitations?[source.limitations]:[];
  const meta=[source.page!==undefined&&source.page!==null?`Page ${esc(source.page)}`:null,source.publicationDate?`Published ${esc(source.publicationDate)}`:null,source.dataPeriod?`Data period ${esc(source.dataPeriod)}`:null,source.capturedAt?`Captured ${esc(source.capturedAt)}`:null].filter(Boolean);
  const technical=Object.entries(source).filter(([key,value])=>!['title','url','publisher','authority','page','publicationDate','dataPeriod','capturedAt','excerpt','passage','limitations'].includes(key)&&value!==undefined&&value!==null&&value!=='').map(([key,value])=>`<dt>${esc(label(key))}</dt><dd>${esc(Array.isArray(value)?value.join(', '):typeof value==='object'?JSON.stringify(value):String(value))}</dd>`).join('');
  return `<li><h3>${href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`:esc(title)}</h3>${publisher?`<p class="publisher">${esc(publisher)}</p>`:''}${meta.length?`<p class="source-meta">${meta.join(' · ')}</p>`:''}${excerpt?`<blockquote class="excerpt"><p>${esc(excerpt)}</p></blockquote>`:''}${limitations.length?`<div><strong>Limitations</strong><ul>${limitations.map((v:any)=>`<li>${esc(v)}</li>`).join('')}</ul></div>`:''}${technical?`<details><summary>Source details</summary><dl>${technical}</dl></details>`:''}</li>`;
 }).join('')+'</ol>';
}
export const stageDocumentStyles=':root{color-scheme:light}*{box-sizing:border-box}body{max-width:820px;margin:0 auto;padding:48px 32px;color:#202820;background:#fff;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}h1,h2,h3,h4{line-height:1.25;color:#17251e}h1{font-size:2rem;margin:0 0 1rem}h2{font-size:1.35rem;margin:2rem 0 .7rem;padding-bottom:.35rem;border-bottom:1px solid #dbe3dc}h3{font-size:1.05rem;margin:1.2rem 0 .4rem}p{margin:.45rem 0 1rem}li{margin:.3rem 0}section{margin-top:2rem}section article{margin:1rem 0;padding:0 0 .5rem;border-bottom:1px solid #edf0ed}.caveats{padding:1rem 1.25rem;background:#f4f6f1;border-radius:12px;color:#465248}.draft-content{margin-top:1.5rem}.sources{padding-inline-start:1.4rem}.sources>li{padding:1rem 1.2rem;margin:1rem 0;background:#f7f8f6;border:1px solid #e3e8e2;border-radius:12px}.sources h3{margin-top:0}.publisher{font-weight:600;margin:.2rem 0}.source-meta,.muted{font-size:.9rem;color:#58635c}.excerpt{margin:.8rem 0;padding:.2rem 1rem;border-inline-start:3px solid #96aa9a;color:#465248}.excerpt p{white-space:pre-wrap}.sources details{margin-top:.8rem}.sources details summary{cursor:pointer;color:#4f6255;font-size:.9rem}.sources dl{display:grid;grid-template-columns:minmax(110px,max-content) minmax(0,1fr);gap:.2rem .8rem;overflow-wrap:anywhere;font-size:.8rem}.sources dt{font-weight:600}.sources dd{margin:0}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:.55rem .7rem;border:1px solid #dbe3dc;text-align:start;vertical-align:top}th{background:#f3f6f2}a{color:#176b4a;text-underline-offset:2px}code{padding:.12em .35em;background:#f0f2ef;border-radius:4px}pre{padding:1rem;background:#f3f5f2;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}blockquote{margin:1rem 0;padding-inline-start:1rem;border-inline-start:3px solid #cbd5cc}@media(max-width:600px){body{padding:24px 18px;font-size:14px}h1{font-size:1.6rem}.sources>li{padding:12px}.sources dl{display:block}.sources dd{margin-bottom:8px}.table-wrap{overflow:auto}}';
export const renderStageSources=sourceList;
export const ideaReviewDimensionKeys=['customer_need','differentiation','economics','feasibility','evidence'] as const;
export type ProposedTest={hypothesis:string;method:string;audience:string;decisionRule:string};
export type IdeaReview={dimensions:{key:typeof ideaReviewDimensionKeys[number];score:number;reason:string;evidenceNeeded:string}[];criticalRisks:string[];options:{title:string;kind:'feature'|'expansion'|'pivot';benefit:string;tradeoff:string;test:string}[];recommendation:'test'|'revise'|'park';rationale:string};
const proposedTestSchema={type:'object',description:'Required for every validation-stage draft, including ordinary typed requests. This is a proposed test, not evidence of validation.',properties:{hypothesis:text(2000),method:text(2000),audience:text(2000),decisionRule:text(2000)},required:['hypothesis','method','audience','decisionRule'],additionalProperties:false};
const ideaReviewSchema={type:'object',description:'Critical evidence-readiness review, not probability of success or proof of validation. Score each dimension 0–4 and explain gaps.',properties:{dimensions:{type:'array',minItems:5,maxItems:5,items:{type:'object',properties:{key:{type:'string',enum:ideaReviewDimensionKeys},score:{type:'integer',minimum:0,maximum:4},reason:text(2000),evidenceNeeded:text(2000)},required:['key','score','reason','evidenceNeeded'],additionalProperties:false}},criticalRisks:strings,options:{type:'array',maxItems:12,items:{type:'object',properties:{title:text(180),kind:{type:'string',enum:['feature','expansion','pivot']},benefit:text(2000),tradeoff:text(2000),test:text(2000)},required:['title','kind','benefit','tradeoff','test'],additionalProperties:false}},recommendation:{type:'string',enum:['test','revise','park']},rationale:text(2000)},required:['dimensions','criticalRisks','options','recommendation','rationale'],additionalProperties:false};
export const stageDraftSchema={type:'object',description:'For stage validate, always include the structured proposedTest object. Idea review is only required when explicitly requested.',properties:{stage:{type:'string',enum:['idea','validate','plan'],description:'Use validate only with a structured proposedTest in the same arguments.'},title:text(180),content:text(16000),assumptions:strings,unknowns:strings,citationIds,proposedTest:proposedTestSchema,ideaReview:ideaReviewSchema},required:['stage','title','content','assumptions','unknowns','citationIds'],additionalProperties:false};
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
 if(args.stage==='validate')ensure(args.proposedTest!==undefined,'TEST_PROPOSAL_REQUIRED','Every validation draft must include a structured proposedTest with hypothesis, method, audience and decisionRule');
 if(args.proposedTest!==undefined)structured.proposedTest=proposedTest(args.proposedTest);
 if(args.ideaReview!==undefined)structured.ideaReview=ideaReview(args.ideaReview);
 const citations=args.citationIds.map((id:string)=>{
  const exactChunks=available.filter(c=>c.chunkID===id);
  if(exactChunks.length)return exactChunks[0];
  const matches=available.filter(c=>[c.sourceID,c.sourceId,c.id].includes(id));
  const unique:any[]=[];const seen=new Set<any>();
  for(const citation of matches){const key=typeof citation.chunkID==='string'&&citation.chunkID?`chunk:${citation.chunkID}`:citation;if(seen.has(key))continue;seen.add(key);unique.push(citation);}
  ensure(unique.length<=1,'UNRETRIEVED_CITATION','Choose exact retrieved chunkID; publication reference matches multiple passages');
  const found=unique[0];ensure(found,'UNRETRIEVED_CITATION','Draft citations must match evidence retrieved during this turn');return found;
 });
 const caveats=['AI-authored working draft. Assumptions are unverified; this does not establish demand or legal eligibility.'];
 if(!citations.length)caveats.push('No source evidence is cited. Treat this as a proposal requiring validation.');
 if(structured.ideaReview)caveats.push('Scores assess evidence readiness, not business success. An AI recommendation does not validate the idea or complete a stage.');
 if(structured.proposedTest)caveats.push('This test is a proposal. Review and adopt it before recording any real results.');
 const list=(items:string[])=>'<ul>'+items.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';
 const review=structured.ideaReview;
 const reviewHtml=review?'<section><h2>Critical idea review</h2><p>Evidence readiness: '+review.dimensions.reduce((n,d)=>n+d.score,0)+'/20. This is not a success probability.</p>'+review.dimensions.map(d=>'<article><h3>'+esc(label(d.key))+': '+d.score+'/4</h3><p>'+esc(d.reason)+'</p><p><strong>Evidence needed:</strong> '+esc(d.evidenceNeeded)+'</p></article>').join('')+'<h3>Critical risks</h3>'+list(review.criticalRisks)+'<h3>Options to consider</h3>'+review.options.map(o=>'<article><h4>'+esc(o.title)+' ('+esc(o.kind)+')</h4><p><strong>Benefit:</strong> '+esc(o.benefit)+'</p><p><strong>Trade-off:</strong> '+esc(o.tradeoff)+'</p><p><strong>Test:</strong> '+esc(o.test)+'</p></article>').join('')+'<h3>Recommendation: '+esc(label(review.recommendation))+'</h3><p>'+esc(review.rationale)+'</p></section>':'';
 const test=structured.proposedTest;
 const testHtml=test?'<section><h2>Proposed validation test</h2>'+Object.entries(test).map(([k,v])=>'<h3>'+esc(label(k))+'</h3><p>'+esc(v)+'</p>').join('')+'</section>':'';
 const lang=/[\u0600-\u06ff]/.test(args.title+' '+args.content)?'ar':'en';

 const html='<!doctype html><html lang="'+lang+'" dir="'+(lang==='ar'?'rtl':'ltr')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(args.title)+'</title><style>'+stageDocumentStyles+'</style></head><body><main><h1>'+esc(args.title)+'</h1><ul class="caveats">'+caveats.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul><section class="draft-content" aria-label="Draft content">'+renderStageMarkdown(args.content)+'</section>'+reviewHtml+testHtml+'<section><h2>Assumptions</h2>'+list(args.assumptions)+'</section><section><h2>Unknowns</h2>'+list(args.unknowns)+'</section><section><h2>Sources</h2>'+sourceList(citations)+'</section></main></body></html>';
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
