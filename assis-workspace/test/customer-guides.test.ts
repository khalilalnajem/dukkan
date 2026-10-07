import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const guide=readFileSync(new URL('../src/components/guide-page.tsx',import.meta.url),'utf8')
const phases=readFileSync(new URL('../src/components/next-phases.tsx',import.meta.url),'utf8')

test('founder guide covers the full evidence-to-operation journey in order',()=>{
 const ordered=['step1:', 'step2:', 'step3:', 'step4:', 'step5:', 'step6:', 'step7:', 'step8:']
 let previous=-1
 for(const marker of ordered){const at=guide.indexOf(marker);assert.ok(at>previous,`${marker} should follow the prior journey step`);previous=at}
 for(const route of ["page:'estimates'","page:'licences'","page:'finance'","page:'sales'","page:'people'","page:'operations'","page:'saved'"])assert.ok(guide.includes(route),`guide should link to ${route}`)
 assert.match(guide,/record the actual result/i)
 assert.match(guide,/simulated if no real test took place/i)
})

test('roadmap names every planned platform capability without sample KPI or connected-state mock-ups',()=>{
 const planned=[
  'Marketplace directory for providers and mentors','Investor and partner matching','Funding and crowdfunding referrals','Incubator and accelerator support',
  'Agentic marketing','Business and POS connectors','Fresh local intelligence','Transparent market simulation',
  'Gmail connection','Controlled browser execution','Official route handoffs','Team and cloud workspaces','More languages'
 ]
 for(const capability of planned)assert.ok(phases.includes(capability),`roadmap should include ${capability}`)
 assert.match(phases,/className="dukkan-phase-planned"[^>]*>\{ar\?'مخطط':'Planned'\}/)
 assert.match(phases,/Preparation alone is not submission/)
 assert.match(phases,/simulated people and demand never count as customer evidence/)
 assert.doesNotMatch(phases,/RevenueChart|Recorded revenue|Outstanding invoices|Connected: founder@example\.com|Approved and sent/)
 assert.equal((phases.match(/title:tx\(/g)||[]).length,17,'four roadmap groups plus thirteen capabilities should be listed')
})
