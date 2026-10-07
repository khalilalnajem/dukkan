export type ChatModelOption={id:string;freeVerified:boolean}

export const featuredChatModelIds=[
 'gpt-4.1-mini',
 'gpt-4o-mini',
 'openai/gpt-4.1-mini',
 'openai/gpt-4o-mini',
 'openai/gpt-5-mini',
] as const

const friendlyNames:Record<string,string>={
 'gpt-4.1-mini':'GPT-4.1 mini',
 'gpt-4o-mini':'GPT-4o mini',
 'openai/gpt-4.1-mini':'GPT-4.1 mini',
 'openai/gpt-4o-mini':'GPT-4o mini',
 'openai/gpt-5-mini':'GPT-5 mini',
}

export function chatModelLabel(id:string){
 if(friendlyNames[id])return friendlyNames[id]
 const [provider,...nameParts]=id.split('/')
 const name=(nameParts.join('/')||provider).replace(/:[^:]+$/,'').replace(/[-_]+/g,' ').replace(/\b[a-z]/g,letter=>letter.toUpperCase())
 const vendor=nameParts.length?provider.replace(/[-_]+/g,' ').replace(/\b[a-z]/g,letter=>letter.toUpperCase()):''
 return vendor?`${vendor} · ${name}`:name
}

export function isInteractiveChatModel(id:string){
 return !/(?:^|\/)auto$/i.test(id)&&!/(?::auto|:batch)$/i.test(id)
}

export function chatModelChoices(configuredId:string,selectedId:string,catalogue:ChatModelOption[]){
 const permitted=[...new Set(catalogue.filter(model=>model.freeVerified&&isInteractiveChatModel(model.id)).map(model=>model.id))]
 const permittedSet=new Set(permitted)
 const featured=featuredChatModelIds.filter(id=>permittedSet.has(id)&&id!==configuredId)
 const featuredSet=new Set<string>(featured)
 const selectedChoice=selectedId&&selectedId!==configuredId&&!featuredSet.has(selectedId)?selectedId:''
 const more=permitted.filter(id=>id!==configuredId&&!featuredSet.has(id)&&id!==selectedChoice)
 return {featured,more,selectedChoice,selectedChoicePermitted:!!selectedChoice&&permittedSet.has(selectedChoice)}
}
