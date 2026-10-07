import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceProposal} from '../src/workspace-proposal.ts';
const workspace={updatedAt:'v1',hypotheses:[{id:'h',test:{result:''}}]};
test('workspace proposals bind to the saved context and do not mutate it',()=>{
 const before=JSON.stringify(workspace),result=workspaceProposal({kind:'brief',summary:'Idea',values:{idea:'Service'}},workspace);
 assert.equal(result.expectedUpdatedAt,'v1');assert.equal(JSON.stringify(workspace),before);
});
test('proposal rejects extra fields, bad numbers and invented tests',()=>{
 for(const args of [{kind:'brief',summary:'Bad',values:{confirmed:true}},{kind:'costs',summary:'Bad',values:{price:'-10'}},{kind:'test_result',summary:'Bad',values:{hypothesisId:'invented',result:'Claim'}},{kind:'decision',summary:'Bad',values:{hypothesisId:'h',outcome:'Supported so far',reason:'No result'}}])assert.throws(()=>workspaceProposal(args,workspace));
});
