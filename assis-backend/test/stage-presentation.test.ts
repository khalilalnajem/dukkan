import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStageDraft} from '../src/stage-draft.ts';

test('customer document renders readable evidence and escapes hostile content without changing citation metadata',()=>{
 const source={sourceID:'sample-source',title:'Sample source <unsafe>',url:'https://example.com/report',authority:'Sample publisher',page:2,dataPeriod:'2026',capturedAt:'2026-10-07',excerpt:'Sample evidence only.',limitations:['Not customer demand proof.'],rawSha256:'sample-hash'};
 const draft=buildStageDraft({stage:'validate',title:'Sample validation',content:'## Test plan\n\nUse **five** interviews.\n\n- Record exact words\n- Keep unknowns\n\n<script>alert(1)</script>',assumptions:['Sample assumption'],unknowns:['Sample unknown'],citationIds:['sample-source'],proposedTest:{hypothesis:'Sample hypothesis',method:'Sample method',audience:'Sample audience',decisionRule:'Sample rule'}},[source]);
 assert.match(draft.html,/<h3>Test plan<\/h3>/);assert.match(draft.html,/<strong>five<\/strong>/);assert.match(draft.html,/<li>Record exact words<\/li>/);assert.match(draft.html,/href="https:\/\/example.com\/report"/);assert.match(draft.html,/Sample publisher/);assert.match(draft.html,/Decision rule/);assert.match(draft.html,/&lt;script&gt;/);assert.doesNotMatch(draft.html,/<script>/);assert.doesNotMatch(draft.html,/"sourceID"\s*:/);assert.match(draft.html,/<summary>Source details<\/summary>/);assert.deepEqual(draft.citations,[source]);
});

test('unsafe citation URLs never become document links',()=>{
 const draft=buildStageDraft({stage:'plan',title:'Sample plan',content:'[Unsafe](javascript:alert) and [Safe](https://example.com).',assumptions:[],unknowns:[],citationIds:['unsafe']},[{sourceID:'unsafe',title:'Unsafe reference',url:'javascript:alert(1)'}]);
 assert.doesNotMatch(draft.html,/href="javascript:/);assert.match(draft.html,/href="https:\/\/example.com\/"/);
});
