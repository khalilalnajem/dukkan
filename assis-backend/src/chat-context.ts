/** Provider request compaction. The provider's configured cap remains authoritative. */
export const CHAT_CONTEXT_TARGET_BYTES=48000;
const CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES=10000;

const clip=(value:unknown,max:number)=>typeof value==='string'&&value.length>max?value.slice(0,max)+'…':value;
const sourceId=(source:any)=>source?.sourceID||source?.sourceId||source?.id||null;
const chunkId=(source:any)=>source?.chunkID||source?.versionId||null;
const omittedStructuredKeys=new Set(['rawSha256','passageSha256','sha256','localPath','path']);
function boundedDataValue(value:any,depth=0):any{
 if(value===null||typeof value==='number'||typeof value==='boolean')return value;
 if(typeof value==='string')return clip(value,140);
 if(depth>=5)return undefined;
 if(Array.isArray(value))return value.slice(0,30).map(item=>boundedDataValue(item,depth+1)).filter(item=>item!==undefined);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!omittedStructuredKeys.has(key)).slice(0,30).map(([key,item])=>[key,boundedDataValue(item,depth+1)]).filter(([,item])=>item!==undefined));
 return undefined;
}
/** Retain inspectable numeric rows and their unit/period labels, with strict per-source bounds. */
function boundedStructuredData(value:any,maxBytes=6500){
 if(!value||typeof value!=='object')return undefined;
 const rows=Array.isArray(value.rows)?value.rows:[];const output:any={...(value.authority?{authority:clip(value.authority,180)}:{}),...(value.qa?{qa:clip(value.qa,240)}:{})};
 const selected:any[]=[];for(const row of rows.slice(0,40)){const candidate=boundedDataValue(row);if(candidate===undefined)continue;const proposed=[...selected,candidate];if(Buffer.byteLength(JSON.stringify(proposed))>maxBytes)break;selected.push(candidate);}
 if(rows.length&&selected.length<rows.length){const last=boundedDataValue(rows.at(-1));if(last!==undefined){while(selected.length&&Buffer.byteLength(JSON.stringify([...selected,last]))>maxBytes)selected.pop();if(Buffer.byteLength(JSON.stringify([...selected,last]))<=maxBytes)selected.push(last);}}
 if(selected.length)output.rows=selected;
 if(rows.length>selected.length)output.selection=`${selected.length} bounded rows retained from ${rows.length}; row values keep their supplied units and observation periods.`;
 return Object.keys(output).length?output:undefined;
}

/** Keep citation identity, publication/capture dates, scope, excerpts and limitations across turns. */
export function recentEvidenceContext(messages:any[],artifacts:any[]=[],limit=18){
 const items:any[]=[];const seen=new Set<string>();
 const add=(source:any)=>{
  const id=sourceId(source);if(!id)return;const chunk=chunkId(source)||'';const key=`${id}\u0000${chunk}`;if(seen.has(key)||items.length>=limit)return;seen.add(key);
  items.push({sourceID:id,...(chunk?{chunkID:chunk}:{}),title:clip(source.title,220),url:source.url||null,publisher:source.publisher||source.authority||null,page:source.page??null,publicationDate:source.publicationDate||source.publishedAt||null,dataPeriod:source.dataPeriod||null,capturedAt:source.capturedAt||source.retrievedAt||null,scope:clip(typeof source.scope==='string'?source.scope:source.scope?JSON.stringify(source.scope):'',240)||null,excerpt:clip(source.excerpt||source.passage||'',420)||null,limitations:Array.isArray(source.limitations)?source.limitations.filter(Boolean):source.limitations?[source.limitations]:[],currentness:clip(source.currentness||'',300)||null});
 };
 for(const message of [...messages].reverse())if(message.role==='assistant')for(const citation of message.citations||[])add(citation);
 for(const artifact of artifacts)for(const citation of artifact.citations||[])add(citation);
 return items;
}

/** Compact aggregate market evidence for model calls while retaining every retrieved source reference. */
export function researchContextForModel(data:any){
 const sources=Array.isArray(data?.sources)?data.sources:[];const citations=Array.isArray(data?.citations)?data.citations:[];let structuredBudget=9000;
 const evidence=sources.map((source:any)=>{const citation=source.citation||citations.find((item:any)=>item.chunkID===source.versionId||item.chunkID===source.chunkID||item.sourceID===source.id)||{};const structuredData=structuredBudget>0?boundedStructuredData(source.structuredData,Math.min(6500,structuredBudget)):undefined;if(structuredData)structuredBudget-=Buffer.byteLength(JSON.stringify(structuredData));return {sourceID:citation.sourceID||source.id,chunkID:citation.chunkID||source.versionId||source.chunkID||null,title:source.title||citation.title||source.id,url:source.url||citation.url||null,publisher:source.publisher||source.authority||citation.authority||null,page:citation.page??source.page??null,publicationDate:source.publicationDate||citation.publicationDate||null,dataPeriod:source.dataPeriod||citation.dataPeriod||null,capturedAt:source.capturedAt||citation.capturedAt||null,scope:source.scope||citation.scope||null,excerpt:clip(source.passage||source.excerpt||'',650),limitations:Array.isArray(source.limitations)?source.limitations:source.limitations?[source.limitations]:citation.limitations||[],...(structuredData?{structuredData}:{})};});
 const guidance=data?.phaseGuidance||{};
 return {query:data?.query||'',phase:data?.phase||null,abstained:!!data?.abstained,evidence,caveats:Array.isArray(data?.caveats)?data.caveats:[],phaseGuidance:{authority:guidance.authority||'Dukkan-authored method, not external evidence',decision:guidance.decision||null,output:guidance.output||[],gate:guidance.gate||null,steps:(guidance.steps||[]).slice(0,4)}};
}
export function guidanceContextForModel(data:any){
 const citations=Array.isArray(data?.citations)?data.citations:[];const sources=Array.isArray(data?.sources)?data.sources:Array.isArray(data?.evidence)?data.evidence:[];
 const evidence=sources.slice(0,12).map((source:any)=>{const citation=source.citation||citations.find((item:any)=>item.sourceID===source.id||item.sourceID===source.sourceID||item.chunkID===source.chunkID||item.chunkID===source.versionId)||{};return {sourceID:citation.sourceID||source.sourceID||source.id,chunkID:citation.chunkID||source.versionId||source.chunkID||null,title:source.title||citation.title||null,publisher:source.publisher||source.authority||citation.authority||null,url:source.url||citation.url||null,page:source.page??citation.page??null,publicationDate:source.publicationDate||citation.publicationDate||source.publishedAt||null,effectiveDate:source.effectiveDate||citation.effectiveDate||null,dataPeriod:source.dataPeriod||citation.dataPeriod||null,capturedAt:source.capturedAt||citation.capturedAt||source.retrievedAt||null,scope:source.scope||citation.scope||null,currentness:source.currentness||null,passage:clip(source.passage||source.excerpt||'',650),limitations:Array.isArray(source.limitations)?source.limitations:source.limitations?[source.limitations]:citation.limitations||[]};});
 for(const citation of citations)if(!evidence.some((source:any)=>source.sourceID===(citation.sourceID||citation.id)&&(!citation.chunkID||source.chunkID===citation.chunkID)))evidence.push({sourceID:citation.sourceID||citation.id,chunkID:citation.chunkID||null,title:citation.title||null,publisher:citation.publisher||citation.authority||null,url:citation.url||null,page:citation.page??null,publicationDate:citation.publicationDate||citation.publishedAt||null,effectiveDate:citation.effectiveDate||null,dataPeriod:citation.dataPeriod||null,capturedAt:citation.capturedAt||citation.retrievedAt||null,scope:citation.scope||null,currentness:citation.currentness||null,passage:clip(citation.excerpt||'',650),limitations:Array.isArray(citation.limitations)?citation.limitations:citation.limitations?[citation.limitations]:[]});
 return {query:data?.query||'',abstained:!!data?.abstained,route:data?.route||null,evidence,caveats:data?.caveats||[],blockers:data?.blockers||[],activationState:data?.activationState||null};
}

/** Earlier market results remain paired with their calls; their full evidence lives in the newest aggregate. */
export function foldEarlierResearchResults(messages:any[]){
 const latest=messages.map((message,index)=>message.role==='tool'&&message.tool_name==='search_business_knowledge'?index:-1).filter(index=>index>=0).at(-1);
 if(latest===undefined||latest<0)return;
 for(let index=0;index<latest;index++)if(messages[index].role==='tool'&&messages[index].tool_name==='search_business_knowledge')messages[index]={...messages[index],content:JSON.stringify({note:'Earlier search evidence is included in the latest aggregated market evidence result.'})};
}

function wireMessages(messages:any[]){
 const pending:Array<{id:string;name:string}>=[];let index=0;
 return messages.map(message=>{
  if(message.role==='assistant'&&message.tool_calls?.length){const calls=message.tool_calls.map((call:any)=>{const id=call.id||`dikan_${index++}`;pending.push({id,name:call.function.name});return {id,type:'function',function:{name:call.function.name,arguments:JSON.stringify(call.function.arguments)}};});return {role:'assistant',content:message.content||null,tool_calls:calls};}
  if(message.role==='tool'){const found=pending.findIndex(call=>call.name===message.tool_name);if(found<0)return {role:'tool',tool_name:message.tool_name,content:message.content};const [call]=pending.splice(found,1);return {role:'tool',tool_call_id:call.id,content:message.content};}
  return {role:message.role,content:message.content};
 });
}
function providerBodyBytes(messages:any[],tools:any[],model:string){
 // Reserve 2 KB for provider-specific request fields (OpenRouter has a larger envelope).
 return Buffer.byteLength(JSON.stringify({model,messages:wireMessages(messages),tools,stream:false,enable_thinking:false,max_tokens:1200}))+2048;
}
/** Numeric-only request-size telemetry; never returns prompt or tool contents. */
export function chatRequestSizeDiagnostics(messages:any[],tools:any[],model='chat-model'){
 const serialized=wireMessages(messages);const body=JSON.stringify({model,messages:serialized,tools,stream:false,enable_thinking:false,max_tokens:1200});
 const systems=serialized.filter((message:any)=>message.role==='system');let systemInstructionBytes=0,systemDynamicContextBytes=0;
 for(const message of systems){if(typeof message.content!=='string')continue;const start=message.content.lastIndexOf('\n{');if(start<0){systemInstructionBytes+=Buffer.byteLength(message.content);continue;}try{JSON.parse(message.content.slice(start+1));systemInstructionBytes+=Buffer.byteLength(message.content.slice(0,start));systemDynamicContextBytes+=Buffer.byteLength(message.content.slice(start+1));}catch{systemInstructionBytes+=Buffer.byteLength(message.content);}}
 const systemBytes=Buffer.byteLength(JSON.stringify(systems));
 return {bodyBytes:Buffer.byteLength(body),bodyBytesWithEnvelopeReserve:Buffer.byteLength(body)+2048,systemBytes,systemInstructionBytes,systemDynamicContextBytes,toolSchemaBytes:Buffer.byteLength(JSON.stringify(tools)),toolTranscriptBytes:Buffer.byteLength(JSON.stringify(serialized.filter((message:any)=>message.role==='tool'))),messageCount:serialized.length,toolCount:tools.length};
}
function shrinkEvidenceMessage(message:any,excerptLimit:number){
 if(message.role!=='tool'||typeof message.content!=='string')return message;
 let value:any;try{value=JSON.parse(message.content);}catch{return message;}
 const visit=(item:any,key=''):any=>{
  if(typeof item==='string'&&(key==='passage'||key==='excerpt'))return clip(item,excerptLimit);
  if(Array.isArray(item))return item.map(child=>visit(child,key));
  if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([childKey,child])=>[childKey,visit(child,childKey)]));
  return item;
 };
 return {...message,content:JSON.stringify(visit(value))};
}
function clipNestedStrings(value:any,max:number,depth=0):any{
 if(typeof value==='string')return value.length>max?value.slice(0,max)+'…':value;
 if(depth>=7||value===null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(item=>clipNestedStrings(item,max,depth+1));
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clipNestedStrings(item,max,depth+1)]));
}
function compactDynamicContext(content:string):string{
 const start=content.lastIndexOf('\n{');if(start<0)return content;
 let data:any;try{data=JSON.parse(content.slice(start+1));}catch{return content;}
 const base=content.slice(0,start);const mark=()=>{data.contextProjection={truncated:true,note:'Saved context was compacted. Preserve founder intent, retrieved evidence IDs, dates, limitations, and the selected test/decision; do not invent omissions.'};};
 const currentBytes=()=>Buffer.byteLength(JSON.stringify(data));if(currentBytes()<=CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES)return content;
 mark();
 const drafts=data.generatedDrafts?.drafts;
 if(Array.isArray(drafts)){
  data.generatedDrafts.truncated=true;
  data.generatedDrafts.drafts=drafts.map((draft:any)=>({...draft,content:clip(draft.content,450),contentTruncated:!!draft.contentTruncated||String(draft.content||'').length>450,assumptions:(draft.assumptions||[]).slice(0,4).map((v:any)=>clip(v,180)),unknowns:(draft.unknowns||[]).slice(0,4).map((v:any)=>clip(v,180)),proposedTest:draft.proposedTest?Object.fromEntries(Object.entries(draft.proposedTest).map(([key,value])=>[key,clip(value,300)])):null,ideaReview:draft.ideaReview?{dimensions:(draft.ideaReview.dimensions||[]).map((d:any)=>({...d,reason:clip(d.reason,170),evidenceNeeded:clip(d.evidenceNeeded,170)})),criticalRisks:(draft.ideaReview.criticalRisks||[]).slice(0,3).map((v:any)=>clip(v,160)),options:(draft.ideaReview.options||[]).slice(0,3).map((o:any)=>({...o,title:clip(o.title,100),benefit:clip(o.benefit,120),tradeoff:clip(o.tradeoff,120),test:clip(o.test,120)})),recommendation:draft.ideaReview.recommendation,rationale:clip(draft.ideaReview.rationale,220)}:null,citations:(draft.citations||[]).slice(0,8).map((c:any)=>({sourceID:c.sourceID,chunkID:c.chunkID,title:clip(c.title,90)}))}));
 }
 const evidence=data.recentEvidence;
 if(Array.isArray(evidence)){data.recentEvidenceTruncated=true;data.recentEvidence=evidence.slice(0,6).map((source:any)=>({...source,title:clip(source.title,140),url:clip(source.url,240),publisher:clip(source.publisher,120),scope:clip(source.scope,140),excerpt:clip(source.excerpt,100),limitations:(source.limitations||[]).slice(0,3).map((v:any)=>clip(v,180)),currentness:clip(source.currentness,140)}));}
 const workspace=data.workspaceContext?.data;
 if(workspace&&typeof workspace==='object'){
  data.workspaceContext.truncated=true;data.workspaceContext.data=clipNestedStrings(workspace,260);
  if(Array.isArray(data.workspaceContext.data.lifecycle))data.workspaceContext.data.lifecycle=data.workspaceContext.data.lifecycle.slice(-4);
  if(Array.isArray(data.workspaceContext.data.hypotheses))data.workspaceContext.data.hypotheses=data.workspaceContext.data.hypotheses.slice(0,5).map((h:any)=>({...h,evidence:(h.evidence||[]).slice(0,2)}));
 }
 if(Array.isArray(data.priorArtifacts)){data.priorArtifactsTruncated=true;data.priorArtifacts=data.priorArtifacts.slice(-6);}
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES&&Array.isArray(data.recentEvidence))data.recentEvidence=data.recentEvidence.map((source:any)=>({...source,excerpt:'',limitations:(source.limitations||[]).slice(0,2).map((v:any)=>clip(v,150))}));
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES&&data.workspaceContext?.data){const d=data.workspaceContext.data;const decisions=(d.lifecycle||[]).filter((r:any)=>r.values?.category==='business_decision'||r.values?.kind==='business_decision').slice(-2);data.workspaceContext.data={updatedAt:d.updatedAt,brief:clipNestedStrings(d.brief,240),profile:clipNestedStrings(d.profile,160),costs:d.costs,nextAction:clipNestedStrings(d.nextAction,160),projection:d.projection,hypotheses:(d.hypotheses||[]).slice(0,3).map((h:any)=>({...clipNestedStrings(h,180),evidence:(h.evidence||[]).slice(0,1)})),ideaReviewDecisions:(d.ideaReviewDecisions||[]).slice(-3).map((decision:any)=>clipNestedStrings(decision,220)),decisions:(d.decisions||[]).slice(-3).map((decision:any)=>({...clipNestedStrings(decision,200),evidence:(decision.evidence||[]).slice(-1)})),lifecycle:decisions.map((r:any)=>clipNestedStrings(r,180))};}
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES&&Array.isArray(data.generatedDrafts?.drafts))data.generatedDrafts.drafts=data.generatedDrafts.drafts.map((draft:any)=>({...draft,content:'',assumptions:(draft.assumptions||[]).slice(0,2).map((v:any)=>clip(v,100)),unknowns:(draft.unknowns||[]).slice(0,2).map((v:any)=>clip(v,100)),proposedTest:draft.proposedTest?Object.fromEntries(Object.entries(draft.proposedTest).map(([key,value])=>[key,clip(value,180)])):null,ideaReview:draft.ideaReview?{dimensions:(draft.ideaReview.dimensions||[]).map((d:any)=>({key:d.key,score:d.score,reason:clip(d.reason,100),evidenceNeeded:clip(d.evidenceNeeded,100)})),criticalRisks:(draft.ideaReview.criticalRisks||[]).slice(0,2).map((v:any)=>clip(v,100)),options:(draft.ideaReview.options||[]).slice(0,2).map((o:any)=>({title:clip(o.title,80),kind:o.kind,benefit:clip(o.benefit,90),tradeoff:clip(o.tradeoff,90),test:clip(o.test,90)})),recommendation:draft.ideaReview.recommendation,rationale:clip(draft.ideaReview.rationale,120)}:null,citations:(draft.citations||[]).slice(0,4).map((c:any)=>({sourceID:c.sourceID,chunkID:c.chunkID,title:clip(c.title,60)}))}));
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES&&Array.isArray(data.priorArtifacts))data.priorArtifacts=data.priorArtifacts.slice(-3);
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES&&data.workspaceContext?.data){const d=data.workspaceContext.data;d.lifecycle=(d.lifecycle||[]).slice(-1);d.hypotheses=(d.hypotheses||[]).slice(0,2);}
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES&&Array.isArray(data.recentEvidence))data.recentEvidence=data.recentEvidence.map((source:any)=>({sourceID:source.sourceID,chunkID:source.chunkID,title:clip(source.title,120),url:clip(source.url,220),publisher:clip(source.publisher,100),page:source.page,publicationDate:source.publicationDate,dataPeriod:source.dataPeriod,capturedAt:source.capturedAt,scope:clip(source.scope,100),limitations:(source.limitations||[]).slice(0,2).map((v:any)=>clip(v,130)),currentness:clip(source.currentness,100)}));
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES&&Array.isArray(data.generatedDrafts?.drafts))data.generatedDrafts.drafts=data.generatedDrafts.drafts.map((draft:any)=>({id:draft.id,conversationId:draft.conversationId,stage:draft.stage,title:clip(draft.title,100),origin:draft.origin,content:'',contentTruncated:true,assumptions:(draft.assumptions||[]).slice(0,2).map((v:any)=>clip(v,80)),unknowns:(draft.unknowns||[]).slice(0,2).map((v:any)=>clip(v,80)),proposedTest:draft.proposedTest?Object.fromEntries(Object.entries(draft.proposedTest).map(([key,value])=>[key,clip(value,150)])):null,ideaReview:draft.stage==='idea'&&draft.ideaReview?{dimensions:(draft.ideaReview.dimensions||[]).map((d:any)=>({key:d.key,score:d.score,reason:clip(d.reason,80),evidenceNeeded:clip(d.evidenceNeeded,80)})),criticalRisks:(draft.ideaReview.criticalRisks||[]).slice(0,2).map((v:any)=>clip(v,80)),options:(draft.ideaReview.options||[]).slice(0,3).map((o:any)=>({title:clip(o.title,80),kind:o.kind,benefit:clip(o.benefit,80),tradeoff:clip(o.tradeoff,80),test:clip(o.test,80)})),recommendation:draft.ideaReview.recommendation,rationale:clip(draft.ideaReview.rationale,100)}:null,citations:(draft.citations||[]).slice(0,2).map((c:any)=>({sourceID:c.sourceID,chunkID:c.chunkID,title:clip(c.title,50)}))}));
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES&&data.workspaceContext?.data){const d=data.workspaceContext.data;const decisions=(d.lifecycle||[]).filter((r:any)=>r.values?.category==='business_decision'||r.values?.kind==='business_decision').slice(-1);data.workspaceContext.data={updatedAt:d.updatedAt,brief:clipNestedStrings(d.brief,160),costs:d.costs,projection:d.projection,hypotheses:(d.hypotheses||[]).filter((h:any)=>h.test?.provenance).slice(-1).map((h:any)=>({id:h.id,title:clip(h.title,100),test:{method:clip(h.test?.method,180),audience:clip(h.test?.audience,120),rule:clip(h.test?.rule,180),provenance:clipNestedStrings(h.test?.provenance,120)}})),ideaReviewDecisions:(d.ideaReviewDecisions||[]).slice(-1).map((decision:any)=>({id:decision.id,artifactId:decision.artifactId,date:decision.date,choice:decision.choice,reason:clip(decision.reason,220),selectedOption:clip(decision.selectedOption,180),customOption:decision.customOption?{title:clip(decision.customOption.title,100),tradeoff:clip(decision.customOption.tradeoff,100)}:undefined})),decisions:(d.decisions||[]).slice(-1).map((decision:any)=>({id:decision.id,date:decision.date,outcome:decision.outcome,reason:clip(decision.reason,160),rule:clip(decision.rule,160),evidence:(decision.evidence||[]).slice(-1).map((e:any)=>clipNestedStrings(e,100))})),lifecycle:decisions.map((r:any)=>clipNestedStrings(r,150))};}
 if(currentBytes()>CHAT_SYSTEM_CONTEXT_DATA_TARGET_BYTES){data.priorArtifacts=(data.priorArtifacts||[]).slice(-2);if(Array.isArray(data.recentEvidence))data.recentEvidence=data.recentEvidence.slice(0,6).map((s:any)=>({...s,limitations:(s.limitations||[]).slice(0,1)}));}
 return base+'\n'+JSON.stringify(data);
}
function compactSystemMessages(messages:any[]){return messages.map(message=>message.role==='system'&&typeof message.content==='string'?{...message,content:compactDynamicContext(message.content)}:message);}
function historyWindow(messages:any[],keep:number,founderIndex:number){
 const boundary=Math.max(0,Math.min(founderIndex,messages.length));
 const prefix=messages.slice(0,boundary);const system=prefix.filter(message=>message.role==='system');const prior=prefix.filter(message=>message.role!=='system');const mostRecentFounderMessage=prior.filter(message=>message.role==='user').at(-1);const selected=keep?prior.slice(-keep):[];if(mostRecentFounderMessage&&!selected.includes(mostRecentFounderMessage))selected.unshift(mostRecentFounderMessage);const bounded=selected.map(message=>({...message,...(typeof message.content==='string'?{content:message.content.slice(0,message.role==='assistant'?1200:4000)}:{})}));
 return {messages:[...system,...bounded,...messages.slice(boundary)],founderIndex:system.length+bounded.length};
}
/** Fit the full messages+tools request while keeping the current user intent and current tool transcript intact. */
export function fitChatRequestMessages(messages:any[],tools:any[],model='chat-model',founderIndex?:number,targetBytes=CHAT_CONTEXT_TARGET_BYTES){
 let boundary=founderIndex??(messages.map((message,index)=>message.role==='user'?index:-1).filter(index=>index>=0).at(-1)??messages.length);
 let fitted=structuredClone(messages);if(providerBodyBytes(fitted,tools,model)<=targetBytes)return fitted;
 let windowed=historyWindow(fitted,6,boundary);fitted=windowed.messages;boundary=windowed.founderIndex;if(providerBodyBytes(fitted,tools,model)<=targetBytes)return fitted;
 fitted=fitted.map(message=>shrinkEvidenceMessage(message,650));if(providerBodyBytes(fitted,tools,model)<=targetBytes)return fitted;
 fitted=fitted.map(message=>shrinkEvidenceMessage(message,260));if(providerBodyBytes(fitted,tools,model)<=targetBytes)return fitted;
 windowed=historyWindow(fitted,2,boundary);fitted=windowed.messages;boundary=windowed.founderIndex;if(providerBodyBytes(fitted,tools,model)<=targetBytes)return fitted;
 windowed=historyWindow(fitted,0,boundary);fitted=windowed.messages;boundary=windowed.founderIndex;if(providerBodyBytes(fitted,tools,model)<=targetBytes)return fitted;
 fitted=compactSystemMessages(fitted);if(providerBodyBytes(fitted,tools,model)<=targetBytes)return fitted;
 fitted=fitted.map(message=>shrinkEvidenceMessage(message,100));if(providerBodyBytes(fitted,tools,model)<=targetBytes)return fitted;
 return fitted.map(message=>shrinkEvidenceMessage(message,0));
}
