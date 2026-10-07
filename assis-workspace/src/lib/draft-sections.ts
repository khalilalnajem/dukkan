export type DraftSection={heading:string;lines:string[]}

export function parseDraftSections(content:string):DraftSection[]{
 const blocks=content.trim().split(/\n\s*\n+/).map(block=>block.trim()).filter(Boolean)
 return blocks.map(block=>{
  const markdown=block.match(/^#{1,4}\s+([^\n]+)(?:\n([\s\S]*))?$/)
  if(markdown)return {heading:markdown[1].replace(/\*\*/g,'').trim(),lines:(markdown[2]||'').split('\n').map(line=>line.trim()).filter(Boolean)}
  const label=block.match(/^\*\*([^*\n]{2,100}?):\*\*\s*([\s\S]*)$/)
  if(label)return {heading:label[1].trim(),lines:label[2].split('\n').map(line=>line.trim()).filter(Boolean)}
  return {heading:'',lines:block.split('\n').map(line=>line.trim()).filter(Boolean)}
 })
}
