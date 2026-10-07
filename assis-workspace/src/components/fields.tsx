import {useId, type ReactNode} from 'react'
import {Input} from '@/components/ui/input'
import {Textarea} from '@/components/ui/textarea'
import {Label} from '@/components/ui/label'
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select'
export function Field({label,value,onChange,multiline=false,hint,required=false,disabled=false,type='text',placeholder,children}:{label:string;value?:string;onChange?:(v:string)=>void;multiline?:boolean;hint?:string;required?:boolean;disabled?:boolean;type?:string;placeholder?:string;children?:ReactNode}){
 const id=useId();const props={id,value:value??'',onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onChange?.(e.target.value),required,disabled,placeholder,maxLength:5000,'aria-describedby':hint?id+'-hint':undefined}
 return <div className="field"><Label htmlFor={id}>{label}</Label>{children||(multiline?<Textarea {...props}/>:<Input {...props} type={type} min={type==='number'?0:undefined} step={type==='number'?'any':undefined}/>)}{hint&&<p id={id+'-hint'} className="field-hint">{hint}</p>}</div>
}
export function Choice({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:readonly string[]}){const id=useId();return <div className="field"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue/></SelectTrigger><SelectContent>{options.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>}
