export function entranceMotion(progress:number){
 const p=Math.max(0,Math.min(1,progress))
 const smooth=(x:number)=>{const n=Math.max(0,Math.min(1,x));return n*n*(3-2*n)}
 const opening=smooth((p-.08)/.5),forward=smooth((p-.57)/.4)
 return {progress:p,angle:opening*108,scale:1+forward*6,fade:1-smooth((p-.85)/.14),copy:1-smooth(p/.28),phase:p<.1?'closed':p<.58?'opening':p<.99?'entering':'complete'}
}
