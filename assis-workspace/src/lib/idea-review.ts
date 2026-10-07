import type {ChatArtifact} from './chat-api'

export function ideaReadiness(review:NonNullable<ChatArtifact['ideaReview']>){
 const byKey=new Map(review.dimensions.map(item=>[item.key,item]))
 const keys=['customer_need','differentiation','economics','feasibility','evidence'] as const
 return {complete:keys.every(key=>byKey.has(key)),score:keys.reduce((total,key)=>total+(byKey.get(key)?.score||0),0),maximum:20}
}
