// A model preview, never the authoritative snapshot used to validate or save proposals.
export function workspaceModelContext(workspace:any,query='',maxBytes=11000):any{
 if(!workspace)return null;
 const clip=(value:any,n=600):any=>typeof value==='string'?value.slice(0,n):value;
 const fields=(value:any,n=600)=>value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>['string','number','boolean'].includes(typeof v)).map(([k,v])=>[k,clip(v,n)])):value;
 const terms=query.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu)||[];
 const rank=(row:any)=>terms.reduce((n:number,word:string)=>n+(JSON.stringify(row).toLowerCase().includes(word)?1:0),0);
 const select=(rows:any[],n:number)=>rows.map((row,index)=>({row,index,score:rank(row)})).sort((a,b)=>b.score-a.score||b.index-a.index).slice(0,n).map(x=>x.row);
 const preview:any={updatedAt:workspace.updatedAt,brief:fields(workspace.brief,1600),profile:fields(workspace.profile),costs:workspace.costs,nextAction:fields(workspace.nextAction),projection:{truncated:true,note:'Bounded unverified context. Omitted records/history remain saved. Never infer missing values or claim this is complete.',totalLifecycle:workspace.lifecycle?.length||0,totalHypotheses:workspace.hypotheses?.length||0},hypotheses:select(workspace.hypotheses||[],5).map((h:any)=>({...fields(h),test:fields(h.test),evidence:select(h.evidence||[],2).map((e:any)=>fields(e))})),lifecycle:select(workspace.lifecycle||[],10).map((r:any)=>({id:r.id,revision:r.revision,values:fields(r.values,700)}))};
 const bytes=()=>Buffer.byteLength(JSON.stringify(preview));
 while(bytes()>maxBytes&&preview.lifecycle.length)preview.lifecycle.pop();
 while(bytes()>maxBytes&&preview.hypotheses.length)preview.hypotheses.pop();
 if(bytes()>maxBytes){preview.brief=fields(workspace.brief,400);preview.profile=fields(workspace.profile,200);preview.nextAction=undefined;}
 return preview;
}
