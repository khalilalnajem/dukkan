import {test} from 'node:test'
import assert from 'node:assert/strict'
import {selectedWorkDocumentId,workPanelCloseGuidance} from '../src/components/work-sidebar-model.ts'

test('clean document panel can close without a warning',()=>{
 assert.equal(workPanelCloseGuidance(false,'en'),null)
})

test('dirty document panel stays open with save or discard guidance in English and Arabic',()=>{
 assert.deepEqual(workPanelCloseGuidance(true,'en'),'There are unsaved changes. Save or discard them before closing this panel.')
 assert.deepEqual(workPanelCloseGuidance(true,'ar'),'هناك تعديلات غير محفوظة. احفظها أو تجاهلها قبل إغلاق اللوحة.')
})

test('library selection takes precedence over the last externally selected document',()=>{
 assert.equal(selectedWorkDocumentId('saved',['doc-1'],'doc-1'),'')
})

test('active opened document takes precedence, otherwise retain the current document',()=>{
 assert.equal(selectedWorkDocumentId('doc-2',['doc-1','doc-2'],'doc-1'),'doc-2')
 assert.equal(selectedWorkDocumentId('roadmap',['doc-1'],'doc-1'),'doc-1')
})
