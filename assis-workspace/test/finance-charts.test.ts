import test from 'node:test'
import assert from 'node:assert/strict'
import {buildFinanceDashboard, categoryLabel} from '../src/lib/finance-charts.ts'
import {pearlDeltaExample} from '../src/lib/pearl-delta-example.ts'
import {saveLifecycle, type LifecycleRecord} from '../../shared/lifecycle.ts'

test('categoryLabel buckets by the "Category: detail (fictional)" convention and falls back sensibly', () => {
 assert.equal(categoryLabel('Freight: sample shipment (fictional)'), 'Freight')
 assert.equal(categoryLabel('Co-working desk: August (fictional)'), 'Co-working desk')
 assert.equal(categoryLabel('Co-working desk: September (fictional)'), 'Co-working desk')
 assert.equal(categoryLabel('Literature translation (fictional)'), 'Literature translation')
 assert.equal(categoryLabel('Plain title with no annotation'), 'Plain title with no annotation')
 assert.equal(categoryLabel(''), 'Uncategorised')
})

test('an empty workspace produces a safe, zeroed, non-simulated-claiming empty dashboard', () => {
 const data = buildFinanceDashboard([])
 assert.equal(data.empty, true)
 assert.deepEqual(data.months, [])
 assert.deepEqual(data.categories, [])
 assert.deepEqual(data.budgets, [])
 assert.deepEqual(data.kpis, {income: 0, expenses: 0, net: 0, budgetUsed: 0, budgetLimit: 0})
})

test('the Pearl Delta worked example (all simulated) is aggregated correctly and flagged as simulated', () => {
 const w = pearlDeltaExample()
 const data = buildFinanceDashboard(w.lifecycle)
 assert.equal(data.simulated, true, 'no actual+completed entries exist, so the fallback must be simulated')
 assert.equal(data.empty, false)

 assert.deepEqual(data.months.map(m => m.month), ['2026-07', '2026-08', '2026-09'])
 assert.deepEqual(data.months[0], {month: '2026-07', income: 850, expenses: 235.5})
 assert.deepEqual(data.months[1], {month: '2026-08', income: 620, expenses: 225})
 assert.deepEqual(data.months[2], {month: '2026-09', income: 0, expenses: 45})

 assert.deepEqual(data.categories, [
  {label: 'Freight', amount: 145.5},
  {label: 'Licence consultation fee', amount: 120},
  {label: 'Product samples cost', amount: 90},
  {label: 'Co-working desk', amount: 90},
  {label: 'Literature translation', amount: 60},
 ])
 assert.equal(data.categories.reduce((n, c) => n + c.amount, 0), 505.5)

 assert.deepEqual(data.budgets, [
  {month: '2026-08', limit: 150, used: 225},
  {month: '2026-09', limit: 200, used: 45},
 ])

 assert.deepEqual(data.kpis, {income: 1470, expenses: 505.5, net: 964.5, budgetUsed: 270, budgetLimit: 350})
})

test('actual completed entries take priority and are never blended with simulated ones', () => {
 let lifecycle: LifecycleRecord[] = []
 lifecycle = saveLifecycle(lifecycle, {category: 'operation', entityType: 'finance', title: 'Real client payment', details: 'Founder-reported bank receipt', direction: 'income', date: '2026-07-20', amount: '400.000', basis: 'actual', evidence: 'Bank statement line 4', status: 'prepared'}, 'real-income', '2026-07-20')
 lifecycle = saveLifecycle(lifecycle, {...lifecycle[0].values, status: 'approved'}, 'real-income', '2026-07-21')
 lifecycle = saveLifecycle(lifecycle, {...lifecycle[0].values, status: 'completed'}, 'real-income', '2026-07-22')
 lifecycle = saveLifecycle(lifecycle, {category: 'operation', entityType: 'finance', title: 'Simulated noise: should be ignored (fictional)', details: 'Simulated, should not affect the actual-only view', direction: 'expense', date: '2026-07-20', amount: '999.000', basis: 'simulated', status: 'prepared'}, 'noise', '2026-07-20')

 const data = buildFinanceDashboard(lifecycle)
 assert.equal(data.simulated, false)
 assert.deepEqual(data.months, [{month: '2026-07', income: 400, expenses: 0}])
 assert.deepEqual(data.categories, [])
 assert.deepEqual(data.kpis, {income: 400, expenses: 0, net: 400, budgetUsed: 0, budgetLimit: 0})
})

test('archived finance and budget records are excluded from every chart', () => {
 let lifecycle: LifecycleRecord[] = []
 lifecycle = saveLifecycle(lifecycle, {category: 'operation', entityType: 'finance', title: 'Old expense (fictional)', details: 'Simulated, then archived', direction: 'expense', date: '2026-07-01', amount: '50.000', basis: 'simulated', status: 'prepared'}, 'archived-fin', '2026-07-01')
 lifecycle = saveLifecycle(lifecycle, {...lifecycle[0].values, status: 'archived'}, 'archived-fin', '2026-07-02')
 const data = buildFinanceDashboard(lifecycle)
 assert.equal(data.empty, true)
})
