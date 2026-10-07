import test from 'node:test';import assert from 'node:assert/strict';import {explicitStageRequest} from '../src/stage-draft.ts';
test('explicit saved drafts select the matching output while discussion and negation stay unforced',()=>{
 assert.deepEqual(explicitStageRequest('Critique Mingyuan. Save an idea-stage draft with a score.'),{type:'stage_draft',stage:'idea'});
 assert.deepEqual(explicitStageRequest('Please prepare a validation draft.'),{type:'stage_draft',stage:'validate'});
 assert.deepEqual(explicitStageRequest('احفظ مسودة الفكرة'),{type:'stage_draft',stage:'idea'});
 for(const text of ['Do not save an idea draft.','What is an idea draft?','If we prepare an idea draft, what happens?','لا أريد أن احفظ مسودة الفكرة'])assert.equal(explicitStageRequest(text),null);
});

test('explicit stage revisions require a saved output but questions and negation do not',()=>{
 assert.deepEqual(explicitStageRequest('Revise this validation draft. Keep KWD 90.'),{type:'stage_draft',stage:'validate'});
 assert.deepEqual(explicitStageRequest('Please update the planning draft.'),{type:'stage_draft',stage:'plan'});
 for(const text of ["Do not revise this validation draft.",'Can you explain how to revise a validation draft?','If I update the planning draft, will it save?'])assert.equal(explicitStageRequest(text),null);
});
