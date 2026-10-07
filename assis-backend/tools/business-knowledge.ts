import {spawn} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ensure} from '../contracts/index.ts';

export const businessPhases=['ideation','validation','strategy','planning','application','licensing'] as const;
export const evidenceKinds=['official_statistics','research_report','business_framework','source_catalogue','official_service'] as const;
export type BusinessKnowledgeOptions={query:string;phase?:typeof businessPhases[number];kind?:typeof evidenceKinds[number];limit?:number};

/** Offline research only. No case mutation, network access or legal-rule activation. */
export async function searchBusinessKnowledge(options:BusinessKnowledgeOptions,signal?:AbortSignal):Promise<any>{
 ensure(options&&typeof options==='object'&&!Array.isArray(options),'INVALID_QUERY','Provide a knowledge query');
 ensure(Object.keys(options).every(k=>['query','phase','kind','limit'].includes(k)),'INVALID_QUERY','Unknown knowledge option');
 ensure(typeof options.query==='string'&&options.query.trim().length>0&&options.query.length<=2000,'INVALID_QUERY','Query must contain 1–2000 characters');
 ensure(options.phase===undefined||businessPhases.includes(options.phase),'INVALID_PHASE','Unknown business phase');
 ensure(options.kind===undefined||evidenceKinds.includes(options.kind),'INVALID_KIND','Unknown evidence kind');
 ensure(options.limit===undefined||(Number.isInteger(options.limit)&&options.limit>=1&&options.limit<=6),'INVALID_LIMIT','Limit must be 1–6');
 signal?.throwIfAborted();
 return new Promise((accept,reject)=>{
  const child=spawn(process.env.DIKAN_PYTHON_PATH||'python3',['-B',fileURLToPath(new URL('../../knowledge/market/tools/library.py',import.meta.url)),'bridge'],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  let size=0,done=false;const chunks:Buffer[]=[];
  const finish=(error?:Error,value?:any)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):accept(value);};
  const abort=()=>{child.kill('SIGKILL');finish(new Error('Business research cancelled'));};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('Business knowledge verification timed out'));},20000);
  signal?.addEventListener('abort',abort,{once:true});
  child.on('error',()=>finish(new Error('Business knowledge reader unavailable')));
  child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
  child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>512*1024){child.kill('SIGKILL');finish(new Error('Business knowledge response too large'));}else chunks.push(b);});
  child.on('close',code=>{
   if(done)return;
   try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(code!==0||result.error)throw new Error('Business knowledge integrity or retrieval check failed');ensure(Array.isArray(result.sources)&&Array.isArray(result.citations)&&result.coverageComplete===false,'INVALID_KNOWLEDGE','Invalid business knowledge response');finish(undefined,result);}
   catch(e){finish(e instanceof Error?e:new Error('Invalid business knowledge response'));}
  });
  child.stdin.end(JSON.stringify(options));
 });
}

/** Read-only catalogue of the preserved evidence collections. Never exposes local file paths. */
export type EvidenceSourceRecord={id:string;title:string;publisher:string|null;url:string|null;kind:string|null;language:string|null;dataPeriod:string|null;publicationDate:string|null;capturedAt:string|null;phases:string[]|null;topics:string[]|null;limitations:string[]|null;currentness:string|null;legalStatus:string|null};
export type EvidenceCollection={id:'market'|'legal';label:string;builtAt:string|null;sourceCount:number;chunkCount:number;sources:EvidenceSourceRecord[]};
export type EvidenceSourceCatalogue={builtAt:string|null;totals:{sourceCount:number;chunkCount:number};collections:EvidenceCollection[]};
const corpusFiles={market:new URL('../../knowledge/market/generated/corpus.json',import.meta.url),legal:new URL('../../knowledge/context/generated/corpus.json',import.meta.url)} as const;
const corpusCache=new Map<string,{mtimeMs:number;size:number;data:any}>();
function readCorpus(id:keyof typeof corpusFiles):any{
 const path=fileURLToPath(corpusFiles[id]);const stat=statSync(path);const cached=corpusCache.get(id);
 if(cached&&cached.mtimeMs===stat.mtimeMs&&cached.size===stat.size)return cached.data;
 const data=JSON.parse(readFileSync(path,'utf8'));ensure(data&&Array.isArray(data.sources)&&Array.isArray(data.chunks),'INVALID_KNOWLEDGE','Evidence corpus is unreadable',503);
 corpusCache.set(id,{mtimeMs:stat.mtimeMs,size:stat.size,data});return data;
}
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:null;
const list=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&item.trim().length>0):null;
function normaliseSource(raw:any):EvidenceSourceRecord{
 return {id:String(raw.id??raw.sourceID),title:text(raw.title)??String(raw.id??raw.sourceID),publisher:text(raw.publisher)??text(raw.authority),url:text(raw.url),kind:text(raw.documentKind)??text(raw.kind),language:text(raw.language),dataPeriod:text(raw.dataPeriod),publicationDate:text(raw.publicationDate),capturedAt:text(raw.capturedAt),phases:list(raw.phases),topics:list(raw.topics),limitations:list(raw.limitations),currentness:text(raw.currentness),legalStatus:text(raw.legalStatus)};
}
export function listBusinessKnowledgeSources():EvidenceSourceCatalogue{
 const labels={market:'Market and business',legal:'Legal and official services'} as const;
 const collections=(['market','legal'] as const).map(id=>{const corpus=readCorpus(id);const sources=corpus.sources.map(normaliseSource);return {id,label:labels[id],builtAt:text(corpus.builtAt),sourceCount:Number.isInteger(corpus.sourceCount)?corpus.sourceCount:sources.length,chunkCount:Number.isInteger(corpus.chunkCount)?corpus.chunkCount:corpus.chunks.length,sources};});
 const builtAt=collections.map(c=>c.builtAt).filter((v):v is string=>!!v).sort().at(-1)??null;
 return {builtAt,totals:{sourceCount:collections.reduce((n,c)=>n+c.sourceCount,0),chunkCount:collections.reduce((n,c)=>n+c.chunkCount,0)},collections};
}
