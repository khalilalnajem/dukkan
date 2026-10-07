import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {searchBusinessKnowledge} from '../tools/business-knowledge.ts';
import {createApp} from '../src/server.ts';

test('actual downloaded population and framework retrieval carries citations, units and limits',async()=>{
 const population=await searchBusinessKnowledge({query:'population age nationality',phase:'ideation',limit:3});
 assert.equal(population.sources[0].id,'MK-CSB-POP-2025');
 const s=population.sources[0];assert.equal(s.citation.page,1);assert.equal(s.citation.resolved,true);assert.equal(s.dataPeriod,'2025-01-01');
 assert.equal(s.structuredData.rows.at(-1).allResidents.total,4881254);assert.equal(s.structuredData.rows.at(-1).unit,'persons');
 const fw=await searchBusinessKnowledge({query:'test hypothesis experiment metrics',phase:'validation',kind:'business_framework'});
 assert.ok(fw.sources.some((s:any)=>s.id==='FW-TEST'));assert.ok(fw.sources.every((s:any)=>s.kind==='business_framework'));assert.match(fw.phaseGuidance.gate,/threshold/);
 const ar=await searchBusinessKnowledge({query:'مطاعم مقاهي ترفيه',phase:'ideation'});assert.ok(ar.sources.some((s:any)=>s.id==='MK-IPSOS-LEISURE'));
});

test('unknown questions abstain; unsupported phases and oversized inputs reject; no legal evidence activation',async()=>{
 const r=await searchBusinessKnowledge({query:'teleportation lunar unicorn'});assert.equal(r.abstained,true);assert.equal(r.coverageComplete,false);
 assert.equal((await searchBusinessKnowledge({query:'population',phase:'licensing'})).abstained,true);
 for(const args of [{query:''},{query:'x',phase:'unknown'},{query:'x',kind:'law'},{query:'x',limit:9},{query:'x'.repeat(2001)}])await assert.rejects(searchBusinessKnowledge(args as any));
 const abort=new AbortController();abort.abort();await assert.rejects(searchBusinessKnowledge({query:'population'},abort.signal));
});

test('local HTTP and chat model-tool boundary return real research citations without modifying case facts',async t=>{
 const root=mkdtempSync(join(tmpdir(),'dukkan-market-test-'));let responses=0;
 const app=await createApp({allowDeterministicTests:true,privateRoot:root,chatModel:{name:'test-model',version:'mock-v1',respond:async({messages,tools})=>{
  assert.ok(tools.some((tool:any)=>tool.function.name==='search_business_knowledge')||responses>0);
  if(responses++===0)return {content:'',calls:[{name:'search_business_knowledge',arguments:{query:'population age nationality',phase:'ideation'}},{name:'search_business_knowledge',arguments:{query:'test hypothesis experiment',phase:'validation',kind:'business_framework'}}],usage:{mock:true}};
  const result=JSON.parse(messages.find((m:any)=>m.role==='tool').content);
  assert.equal(result.evidence[0].id,'MK-CSB-POP-2025');assert.equal(result.evidence[0].structuredData.rows.at(-1).unit,'persons');
  return {content:'Test response: population evidence supports segmentation, not proof of demand.',calls:[],usage:{mock:true}};
 }}});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise<void>(resolve=>app.server.close(()=>resolve()));rmSync(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${(app.server.address() as any).port}`;let key=0;
 async function post(path:string,body:any){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`market-${++key}`},body:JSON.stringify(body)});assert.ok(r.ok,JSON.stringify(await r.clone().json()));return r.json();}
 const api=await fetch(base+'/api/business-knowledge?query=population%20age%20nationality&phase=ideation');assert.equal(api.status,200);assert.equal((await api.json()).sources[0].id,'MK-CSB-POP-2025');
 assert.equal((await fetch(base+'/api/business-knowledge?query=population&phase=invalid')).status,400);
 const c=await post('/api/conversations',{title:'Research integration test'});
 const pending=await post(`/api/conversations/${c.conversation.id}/messages`,{content:'Who are the consumer segments in Kuwait?',executionMode:'live_agent'});
 let done:any;for(let i=0;i<200;i++){done=await (await fetch(base+`/api/chat/turns/${pending.turn.id}`)).json();if(!['queued','running'].includes(done.turn.status))break;await new Promise(r=>setTimeout(r,25));}
 assert.equal(done.turn.status,'completed');assert.deepEqual(done.case.facts,[]);assert.equal(done.artifacts.length,0);
 assert.ok(done.messages.at(-1).citations.some((c:any)=>c.sourceID==='MK-CSB-POP-2025'&&c.resolved));
 assert.equal(done.turn.events.filter((e:any)=>e.name==='search_business_knowledge'&&e.type==='tool_completed').length,2);assert.ok(done.messages.at(-1).citations.some((c:any)=>c.sourceID==='FW-TEST')); 
});
