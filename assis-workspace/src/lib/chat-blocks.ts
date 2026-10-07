export type ChatBlock={kind:'paragraph'|'heading'|'code';text:string}|{kind:'list';ordered:boolean;items:string[]}|{kind:'table';headers:string[];rows:string[][]}
function cells(line:string){
 let s=line.trim();if(s.startsWith('|'))s=s.slice(1);if(s.endsWith('|')&&!s.endsWith('\\|'))s=s.slice(0,-1)
 return s.split(/(?<!\\)\|/).map(v=>v.trim().replace(/\\\|/g,'|'))
}
export function chatBlocks(content:string):ChatBlock[]{
 const lines=content.replace(/\r\n/g,'\n').split('\n'),blocks:ChatBlock[]=[]
 for(let i=0;i<lines.length;){
  const line=lines[i];if(!line.trim()){i++;continue}
  if(/^\s*```/.test(line)){const code:string[]=[];i++;while(i<lines.length&&!/^\s*```\s*$/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;blocks.push({kind:'code',text:code.join('\n')});continue}
  const heading=line.match(/^#{1,6}\s+(.+)$/);if(heading){blocks.push({kind:'heading',text:heading[1]});i++;continue}
  const header=cells(line),separator=i+1<lines.length?cells(lines[i+1]):[]
  if(line.includes('|')&&header.length>1&&separator.length===header.length&&separator.every(v=>/^:?-{3,}:?$/.test(v))){
   i+=2;const rows:string[][]=[];while(i<lines.length&&lines[i].includes('|')&&cells(lines[i]).length===header.length)rows.push(cells(lines[i++]));blocks.push({kind:'table',headers:header,rows});continue
  }
  const item=line.match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)$/)
  if(item){const ordered=!item[1],items=[item[2]];i++;while(i<lines.length){const next=lines[i].match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)$/);if(!next||!next[1]!==ordered)break;items.push(next[2]);i++}blocks.push({kind:'list',ordered,items});continue}
  blocks.push({kind:'paragraph',text:line});i++
 }
 return blocks
}
