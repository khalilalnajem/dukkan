import {test} from 'node:test'
import assert from 'node:assert/strict'
import {chatModelChoices,chatModelLabel,isInteractiveChatModel} from '../src/lib/chat-model-choices.ts'

test('featured models appear only when the server marks them permitted',()=>{
 const choices=chatModelChoices('configured/model','',[
  {id:'gpt-4.1-mini',freeVerified:true},
  {id:'gpt-4o-mini',freeVerified:true},
  {id:'openai/gpt-4.1-mini',freeVerified:true},
  {id:'openai/gpt-4o-mini',freeVerified:false},
  {id:'openai/gpt-5-mini',freeVerified:true},
 ])
 assert.deepEqual(choices.featured,['gpt-4.1-mini','gpt-4o-mini','openai/gpt-4.1-mini','openai/gpt-5-mini'])
 assert.equal(chatModelLabel('gpt-4.1-mini'),'GPT-4.1 mini')
 assert.equal(chatModelLabel('gpt-4o-mini'),'GPT-4o mini')
 assert.equal(chatModelLabel('openai/gpt-4.1-mini'),'GPT-4.1 mini')
})

test('current configured and selected models are preserved without widening permitted choices',()=>{
 const choices=chatModelChoices('configured/model','openai/gpt-4.1-mini',[
  {id:'configured/model',freeVerified:false},
  {id:'openai/gpt-4.1-mini',freeVerified:true},
  {id:'vendor/allowed',freeVerified:true},
  {id:'vendor/unverified',freeVerified:false},
 ])
 assert.deepEqual(choices.featured,['openai/gpt-4.1-mini'])
 assert.deepEqual(choices.more,['vendor/allowed'])
 assert.equal(choices.selectedChoice,'')
 const advanced=chatModelChoices('configured/model','vendor/allowed',[
  {id:'configured/model',freeVerified:false},
  {id:'vendor/allowed',freeVerified:true},
 ])
 assert.equal(advanced.selectedChoice,'vendor/allowed')
 assert.equal(advanced.selectedChoicePermitted,true)
 assert.deepEqual(advanced.more,[])
})

test('automatic routers and batch model variants stay out of interactive choices',()=>{
 for(const id of ['openrouter/auto','vendor/model:auto','vendor/model:batch'])assert.equal(isInteractiveChatModel(id),false)
 assert.equal(isInteractiveChatModel('vendor/model:free'),true)
 const choices=chatModelChoices('', '',[
  {id:'openrouter/auto',freeVerified:true},
  {id:'vendor/model:auto',freeVerified:true},
  {id:'vendor/model:batch',freeVerified:true},
  {id:'vendor/model:free',freeVerified:true},
 ])
 assert.deepEqual(choices.more,['vendor/model:free'])
})
