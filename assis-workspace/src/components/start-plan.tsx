import {useState} from 'react'
import {ArrowLeft,ArrowRight} from 'lucide-react'
import {Button} from './ui/button'
import {Field} from './fields'
import {blank,type Brief} from '../lib/workspace'

export function StartPlan({onStart,onExample}:{onStart:(brief:Brief)=>void;onExample:()=>void}){
 const [brief,setBrief]=useState(blank().brief),[step,setStep]=useState(0),[error,setError]=useState('')
 function advance(){
  if(!brief.idea.trim()){setError('Write a short idea to get started.');return}
  setError('');if(step===0)setStep(1);else onStart({...brief,idea:brief.idea.trim(),customer:brief.customer.trim(),sector:'Other'})
 }
 return <section className="simple-start">
  <header><h1><strong>Your idea.</strong><br/>A plan to get started.</h1><p>Dukkan helps you work out <strong>what to do next</strong>, one step at a time.</p></header>
  <form onSubmit={e=>{e.preventDefault();advance()}} noValidate>
   <div className="simple-step">Question <strong>{step+1} of 2</strong></div>
   {step===0?<Field key="idea" label="What’s your business idea?" value={brief.idea} onChange={idea=>{setBrief({...brief,idea});setError('')}} multiline hint="One sentence is enough. You can change it later." placeholder="For example: affordable lunches delivered to students."/>:<Field key="customer" label="Who would use it?" value={brief.customer} onChange={customer=>setBrief({...brief,customer})} hint="Think of a specific group of people. It’s OK if you’re not sure yet." placeholder="For example: students who don’t have time to cook."/>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="simple-start-actions">{step===1&&<Button type="button" variant="ghost" onClick={()=>{setStep(0);setError('')}}><ArrowLeft size={16}/>Back</Button>}<Button type="submit" size="lg"><strong>{step===0?'Next':'Make my plan'}</strong><ArrowRight size={17}/></Button>{step===1&&!brief.customer.trim()&&<span>You can add the customer later.</span>}</div>
  </form>
  <div className="simple-start-footer"><p><strong>You’ll get a three-step starter plan.</strong><br/>A starting point to edit and test, not a prediction of success.</p><button className="text-link" onClick={onExample}>See an example<ArrowRight size={15}/></button></div>
 </section>
}
