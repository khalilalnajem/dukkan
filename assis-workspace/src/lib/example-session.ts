import {workspaceSchema,type Workspace} from './workspace.ts'
type Cache=Pick<Storage,'getItem'|'setItem'>
const key=(id:string)=>'dukkan-example-session-v4:'+id
export function readExampleSession(storage:Cache,id:string,fallback:()=>Workspace):Workspace{
 try{const raw=storage.getItem(key(id));return raw?workspaceSchema.parse(JSON.parse(raw)):fallback()}catch{return fallback()}
}
export function saveExampleSession(storage:Cache,id:string,value:Workspace){
 const data=workspaceSchema.parse(value);storage.setItem(key(id),JSON.stringify(data))
}
