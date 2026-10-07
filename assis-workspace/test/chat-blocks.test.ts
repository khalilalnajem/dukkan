import {test} from 'node:test'
import assert from 'node:assert/strict'
import {chatBlocks} from '../src/lib/chat-blocks.ts'
test('PDF findings become a table without losing escaped pipes or surrounding prose',()=>{
 const blocks=chatBlocks('PDF findings\n\n| Field | Value |\n|---|---|\n| Name | Mingyuan |\n| Notes | A\\|B |\n\nNot submitted.')
 assert.deepEqual(blocks,[{kind:'paragraph',text:'PDF findings'},{kind:'table',headers:['Field','Value'],rows:[['Name','Mingyuan'],['Notes','A|B']]},{kind:'paragraph',text:'Not submitted.'}])
})
test('malformed table rows remain visible and code is never interpreted as table or HTML',()=>{
 const blocks=chatBlocks('| A | B |\n|---|---|\n| extra | cells | preserved |\n```html\n<script>alert(1)</script>\n|x|y|\n```')
 assert.equal(blocks[1].kind,'paragraph')
 assert.deepEqual(blocks[2],{kind:'code',text:'<script>alert(1)</script>\n|x|y|'})
})
test('paragraph spacing, Arabic headings and list types remain distinct',()=>{
 assert.deepEqual(chatBlocks('## المستند\n\n- First\n- Second\n1. Review\n2. Save'),[{kind:'heading',text:'المستند'},{kind:'list',ordered:false,items:['First','Second']},{kind:'list',ordered:true,items:['Review','Save']}])
})
