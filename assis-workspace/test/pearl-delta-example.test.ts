import test from 'node:test'
import assert from 'node:assert/strict'
import {pearlDeltaExample} from '../src/lib/pearl-delta-example.ts'
import {workspaceSchema} from '../src/lib/workspace.ts'
import {operatingTotals} from '../../shared/lifecycle.ts'

test('pearlDeltaExample passes the workspace schema and survives a save/reload round trip', () => {
 const w = pearlDeltaExample()
 const parsed = workspaceSchema.parse(JSON.parse(JSON.stringify(w)))
 assert.equal(parsed.brief.idea.includes('Mingyuan'), true)
})

test('pearlDeltaExample seeds fictional finance transactions, budgets, a quote and a linked order', () => {
 const w = pearlDeltaExample()
 const finance = w.lifecycle.filter(r => r.values.category === 'operation' && r.values.entityType === 'finance')
 assert.ok(finance.length >= 8, 'expected at least 8 finance transactions')
 assert.ok(finance.every(r => r.values.basis === 'simulated'), 'all seeded transactions must be simulated')
 assert.ok(finance.every(r => r.values.status === 'prepared'), 'all seeded transactions must be prepared')
 assert.ok(finance.every(r => /^\d+\.\d{3}$/.test(r.values.amount || '')), 'amounts must be KWD with three decimals')
 assert.ok(finance.every(r => /fictional/i.test(r.values.details || '')), 'details must say fictional')
 assert.ok(finance.some(r => r.values.direction === 'income'))
 assert.equal(finance.filter(r => r.values.direction === 'expense').length >= 5, true)
 assert.ok(finance.every(r => r.values.date && r.values.date >= '2026-07-01' && r.values.date <= '2026-09-30'))

 const budgets = w.lifecycle.filter(r => r.values.entityType === 'budget')
 assert.equal(budgets.length, 2)
 assert.ok(budgets.every(r => r.values.basis === 'simulated' && r.values.status === 'prepared'))

 const quote = w.lifecycle.find(r => r.values.entityType === 'quote')
 const order = w.lifecycle.find(r => r.values.entityType === 'order')
 assert.ok(quote, 'expected a seeded supplier quote')
 assert.ok(order, 'expected a seeded order')
 assert.equal(order!.values.relatedId, quote!.id)
 assert.equal(quote!.values.amount, '360.000')
 assert.equal(order!.values.amount, '180.000')
})

test('pearlDeltaExample seeds cost assumptions and a matching cost scenario', () => {
 const w = pearlDeltaExample()
 assert.deepEqual(w.costs, {price: '15', variable: '9', fixed: '300', units: '40'})
 assert.equal(w.costScenarios.length, 1)
 assert.equal(w.costScenarios[0].archived, false)
})

test('simulated finance records are never counted as actual revenue in monthly totals', () => {
 const w = pearlDeltaExample()
 const totals = ['2026-07', '2026-08', '2026-09'].map(month => operatingTotals(w.lifecycle, month))
 assert.ok(totals.every(t => t.count === 0 && t.income === 0 && t.expenses === 0 && t.net === 0))
})

test('pearlDeltaExample seeds a fictional sales pipeline covering contacts, leads, proposals and follow-ups', () => {
 const w = pearlDeltaExample()
 const inRange = (r: {values: {date?: string}}) => !r.values.date || (r.values.date >= '2026-07-01' && r.values.date <= '2026-10-31')

 const contacts = w.lifecycle.filter(r => r.values.entityType === 'contact')
 assert.equal(contacts.length, 4)
 assert.ok(contacts.every(r => r.values.category === 'sales' && r.values.status === 'prepared' && r.values.basis === 'simulated'))
 assert.ok(contacts.every(r => /fictional/i.test(r.values.details || '')))
 assert.ok(contacts.every(r => (r.values.contact || '').endsWith('@example.com')), 'contact emails must use @example.com')
 assert.ok(contacts.every(inRange))

 const leads = w.lifecycle.filter(r => r.values.entityType === 'lead')
 assert.equal(leads.length, 4)
 assert.deepEqual(new Set(leads.map(r => r.values.stage)), new Set(['prospect', 'contacted', 'qualified', 'lost']))
 assert.ok(leads.every(r => r.values.status === 'prepared' && r.values.basis === 'simulated'))
 assert.ok(leads.every(r => r.values.relatedId && contacts.some(c => c.id === r.values.relatedId)), 'each lead must link to a seeded contact')
 assert.ok(leads.every(inRange))

 const proposals = w.lifecycle.filter(r => r.values.entityType === 'proposal')
 assert.equal(proposals.length, 2)
 assert.deepEqual(new Set(proposals.map(r => r.values.stage)), new Set(['draft', 'sent']))
 assert.ok(proposals.every(r => r.values.relatedId && leads.some(l => l.id === r.values.relatedId)), 'each proposal must link to a seeded lead')
 assert.ok(proposals.every(r => /^\d+\.\d{3}$/.test(r.values.amount || '')), 'proposal line amounts must be KWD with three decimals')
 assert.ok(proposals.every(inRange))

 const followups = w.lifecycle.filter(r => r.values.entityType === 'followup')
 assert.equal(followups.length, 3)
 assert.deepEqual(new Set(followups.map(r => r.values.stage)), new Set(['planned', 'due', 'done']))
 assert.ok(followups.every(r => r.values.status === 'prepared' && r.values.basis === 'simulated'))
})

test('pearlDeltaExample seeds a fictional hiring pipeline covering roles, candidates and onboarding', () => {
 const w = pearlDeltaExample()
 const roles = w.lifecycle.filter(r => r.values.entityType === 'role')
 assert.equal(roles.length, 2)
 assert.ok(roles.some(r => /technical support specialist/i.test(r.values.title || '')))
 assert.ok(roles.some(r => /sales coordinator/i.test(r.values.title || '')))
 assert.ok(roles.every(r => r.values.category === 'hiring' && r.values.status === 'prepared' && r.values.basis === 'simulated'))
 assert.ok(roles.every(r => /fictional/i.test(r.values.details || '')))

 const candidates = w.lifecycle.filter(r => r.values.entityType === 'candidate')
 assert.equal(candidates.length, 2)
 assert.notEqual(candidates[0].values.stage, candidates[1].values.stage)
 assert.ok(candidates.every(r => r.values.relatedId && roles.some(role => role.id === r.values.relatedId)), 'each candidate must link to a seeded role')

 const onboarding = w.lifecycle.filter(r => r.values.entityType === 'onboarding')
 assert.equal(onboarding.length, 1)
 assert.ok(onboarding.every(r => r.values.status === 'prepared' && r.values.basis === 'simulated'))
})

test('pearlDeltaExample seeds fictional operations: suppliers, launch tasks, extra decisions and a launch milestone', () => {
 const w = pearlDeltaExample()
 const suppliers = w.lifecycle.filter(r => r.values.entityType === 'supplier')
 assert.equal(suppliers.length, 2)
 assert.ok(suppliers.every(r => r.values.category === 'operation' && r.values.status === 'prepared' && r.values.basis === 'simulated'))
 assert.ok(suppliers.every(r => /fictional/i.test(r.values.details || '')))

 const tasks = w.lifecycle.filter(r => r.values.entityType === 'task')
 assert.equal(tasks.length, 4)
 assert.deepEqual(new Set(tasks.map(r => r.values.stage)), new Set(['todo', 'in_progress', 'blocked', 'done']))

 const decisions = w.lifecycle.filter(r => r.values.category === 'business_decision')
 assert.equal(decisions.length, 3, 'expected the original decision plus two new fictional decisions')
 assert.ok(decisions.every(r => (r.values.evidence || '').length > 0))

 const milestones = w.lifecycle.filter(r => r.values.category === 'launch')
 assert.equal(milestones.length, 1)
 assert.ok(/fictional/i.test(milestones[0].values.details || ''))
})

test('pearlDeltaExample keeps licence records and adds a document checklist and a sourced licence requirement', () => {
 const w = pearlDeltaExample()
 const licences = w.lifecycle.filter(r => r.values.category === 'licence')
 assert.ok(licences.length >= 2, 'expected the original licence record plus the new requirement')
 assert.ok(licences.some(r => (r.values.source || '') === 'https://kdipa.gov.kw/investors-service-center/investment-licensing-procedures/'))

 const documents = w.lifecycle.filter(r => r.values.category === 'document')
 assert.equal(documents.length, 1)
 assert.ok(/fictional/i.test(documents[0].values.details || ''))
})
