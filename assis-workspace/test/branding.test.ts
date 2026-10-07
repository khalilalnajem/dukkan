import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {KEY,OLD_KEY,workedExample,exportPlan,migrate} from '../src/lib/workspace.ts'
const read=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8')
test('Dukkan naming preserves storage compatibility and existing records',()=>{
 assert.equal(KEY,'assis-connected-workspace-v2')
 assert.equal(OLD_KEY,'assis-guided-mvp-v1')
 const w=workedExample();assert.deepEqual(migrate(JSON.parse(JSON.stringify(w))),w)
 assert.match(exportPlan(w),/^# Dukkan/)
})
test('UI uses supplied Dukkan assets and keeps both language routes',()=>{
 const app=read('src/App.tsx'),html=read('index.html'),guide=read('src/components/workspace-guide.tsx'),workbench=read('src/components/founder-workbench.tsx')
 assert.match(app,/dukkan-06-arabic-wordmark\.svg/);assert.match(app,/dukkan-07-english-wordmark\.svg/)
 assert.match(app,/dukkan-language/);assert.match(app,/Switch to Arabic/)
 assert.match(html,/<title>Dukkan \| دُكَّان/)
 assert.match(html,/dukkan-08-door-icon\.svg/)
 assert.match(workbench,/idea:'Challenge'/);assert.match(workbench,/idea:'الفكرة'/)
 assert.match(workbench,/onSaveBrief/);assert.match(workbench,/onSaveCosts/)
 for(const text of [app,html,guide])assert.doesNotMatch(text,/Assis|assis-primary\.png|assis-app-icon\.png/)
 assert.match(app,/dikan-workspace-v2\.json/);assert.match(app,/dikan-decision-record\.md/)
 assert.match(read('src/components/preparation-panel.tsx'),/const sessionKey='assis-madar-case-v1'/)
})
