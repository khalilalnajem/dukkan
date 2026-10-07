import test from 'node:test';import assert from 'node:assert/strict';import {explicitStageRequest} from '../src/stage-draft.ts';
test('explicit saved drafts select the matching output while discussion and negation stay unforced',()=>{
 assert.deepEqual(explicitStageRequest('Critique Mingyuan. Save an idea-stage draft with a score.'),{type:'stage_draft',stage:'idea'});
 assert.deepEqual(explicitStageRequest('Please prepare a validation draft.'),{type:'stage_draft',stage:'validate'});
 assert.deepEqual(explicitStageRequest('احفظ مسودة الفكرة'),{type:'stage_draft',stage:'idea'});
 for(const text of ['Do not save an idea draft.','What is an idea draft?','If we prepare an idea draft, what happens?','لا أريد أن احفظ مسودة الفكرة'])assert.equal(explicitStageRequest(text),null);
});
