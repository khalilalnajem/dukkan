import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {artifactPath,mergeById,modelLabel,turnSchema,sourceCaveats,turnResponse,verifiedDownload,type ChatArtifact} from '../src/lib/chat-api.ts'

test('provider identity belongs to each turn, not the current provider',()=>{
 const base={id:'old',conversationId:'c',status:'completed',executionMode:'live_agent',events:[]}
 const old=turnSchema.parse({...base,model:{name:'ollama',version:'qwen'}})
 const next=turnSchema.parse({...base,id:'new',model:{name:'codex',version:'test'}})
 assert.equal(modelLabel(old.model),'ollama · qwen')
 assert.equal(modelLabel(next.model),'codex · test')
 assert.equal(modelLabel(turnSchema.parse(base).model),'AI')
})

test('turn polling preserves previous conversation and updates without duplicates',()=>{
 const old=[{id:'one',content:'Previous question'},{id:'two',content:'Current question'}]
 const next=mergeById(old,[{id:'two',content:'Current question'},{id:'three',content:'Answer'}])
 assert.deepEqual(next.map(x=>x.id),['one','two','three'])
 assert.deepEqual(mergeById(next,[{id:'three',content:'Answer'}]),next)
 assert.equal(mergeById(next,[{id:'two',content:'Changed'}])[1].content,'Changed')
})
test('artefact URLs must match the local origin, file and operation',()=>{
 assert.equal(artifactPath('/api/chat/artifacts/a/draft','a','draft'),'/api/chat/artifacts/a/draft')
 for(const bad of ['https://evil.test/api/chat/artifacts/a/draft','javascript:alert(1)','/api/chat/artifacts/b/draft','/api/chat/artifacts/a/export'])assert.throws(()=>artifactPath(bad,'a','draft'))
})
test('unsupported chat payloads fail closed',()=>{
 assert.equal(turnResponse.safeParse({turn:{id:'a',status:'approved'},messages:[],artifacts:[],case:{}}).success,false)
})
test('source caveats stay honest, readable and deduplicated',()=>{
 assert.deepEqual(sourceCaveats(['CASE_APPLICABILITY_NOT_EVALUATED','CASE_APPLICABILITY_UNRESOLVED','CURRENTNESS_NOT_VERIFIED']),['Confirm this applies to your business.','Current status has not been verified.'])
 assert.deepEqual(sourceCaveats(['SOME_NEW_LIMIT']),['Some new limit.'])
 assert.deepEqual(sourceCaveats(['Exact source caveat.']),['Exact source caveat.'])
})
test('download rejects unreviewed responses and mismatched bytes',async()=>{
 const original=globalThis.fetch
 const bytes='<html><body>Reviewable draft</body></html>',hash=createHash('sha256').update(bytes).digest('hex')
 const artifact={id:'a',hash,exportUrl:'/api/chat/artifacts/a/export'} as ChatArtifact
 try{
  globalThis.fetch=async()=>new Response(bytes)
  assert.equal(await (await verifiedDownload(artifact,new AbortController().signal)).text(),bytes)
  await assert.rejects(verifiedDownload({...artifact,hash:'wrong'},new AbortController().signal),/changed after review/)
  globalThis.fetch=async()=>new Response('{}',{status:409})
  await assert.rejects(verifiedDownload(artifact,new AbortController().signal),/must be reviewed/)
 }finally{globalThis.fetch=original}
})
