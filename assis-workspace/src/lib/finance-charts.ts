// Pure aggregation for the Finance dashboard charts. No React, no formatting strings.
// The app only ever treats basis 'actual' + status 'completed' entries as real cash
// (see shared/lifecycle.ts operatingTotals). Everything else, including every
// seeded worked-example record, which is basis 'simulated', must never be
// presented as actual income. When no actual entries exist yet, this falls back
// to simulated entries so the dashboard is not empty, and callers must label
// that state (data.simulated === true) instead of calling it revenue.
import {lifecycleEntity, type LifecycleRecord} from '../../../shared/lifecycle.ts'

export type MonthlyPoint = {month: string; income: number; expenses: number}
export type CategoryPoint = {label: string; amount: number}
export type BudgetPoint = {month: string; used: number; limit: number}
export type FinanceDashboardData = {
 simulated: boolean
 empty: boolean
 months: MonthlyPoint[]
 categories: CategoryPoint[]
 budgets: BudgetPoint[]
 kpis: {income: number; expenses: number; net: number; budgetUsed: number; budgetLimit: number}
}

const round = (n: number) => Math.round(n * 1000) / 1000
// Integer-fils sum avoids floating-point drift, matching shared/lifecycle.ts operatingTotals.
const sumAmounts = (rows: LifecycleRecord[]) => round(rows.reduce((n, r) => n + Math.round(Number(r.values.amount || 0) * 1000), 0) / 1000)
const month = (r: LifecycleRecord) => r.values.date?.slice(0, 7) || ''

// Transaction titles in this app follow a "Category: detail (fictional)" convention
// (see src/lib/pearl-delta-example.ts). Splitting on the dash and dropping the
// worked-example annotation gives a stable category bucket without a separate field.
export function categoryLabel(title: string): string {
 const withoutDash = title.split(/: | — /)[0]
 return withoutDash.replace(/\s*\(fictional\)\s*$/i, '').trim() || title.trim() || 'Uncategorised'
}

export function buildFinanceDashboard(records: LifecycleRecord[]): FinanceDashboardData {
 const finance = records.filter(r => r.values.category === 'operation' && lifecycleEntity(r.values) === 'finance' && r.values.status !== 'archived')
 const actual = finance.filter(r => r.values.status === 'completed' && r.values.basis === 'actual')
 const simulatedRows = finance.filter(r => r.values.basis === 'simulated')
 const simulated = actual.length === 0
 const source = simulated ? simulatedRows : actual

 const allMonths = [...new Set(source.map(month).filter(Boolean))].sort()
 const recentMonths = allMonths.slice(-3)
 const recentSet = new Set(recentMonths)

 const months: MonthlyPoint[] = recentMonths.map(m => {
  const rows = source.filter(r => month(r) === m)
  return {month: m, income: sumAmounts(rows.filter(r => r.values.direction === 'income')), expenses: sumAmounts(rows.filter(r => r.values.direction === 'expense'))}
 })

 const expenseRows = source.filter(r => r.values.direction === 'expense' && recentSet.has(month(r)))
 const categoryTotals = new Map<string, number>()
 for (const row of expenseRows) {
  const label = categoryLabel(row.values.title || '')
  categoryTotals.set(label, round((categoryTotals.get(label) || 0) + Number(row.values.amount || 0)))
 }
 const categories: CategoryPoint[] = [...categoryTotals.entries()].map(([label, amount]) => ({label, amount})).sort((a, b) => b.amount - a.amount)

 const budgetRecords = records.filter(r => r.values.category === 'operation' && lifecycleEntity(r.values) === 'budget' && r.values.status !== 'archived')
 const budgetMonths = [...new Set(budgetRecords.map(month).filter(Boolean))].sort()
 const budgets: BudgetPoint[] = budgetMonths.map(m => ({
  month: m,
  limit: sumAmounts(budgetRecords.filter(r => month(r) === m)),
  used: sumAmounts(source.filter(r => r.values.direction === 'expense' && month(r) === m)),
 }))

 const income = round(months.reduce((n, p) => n + p.income, 0))
 const expenses = round(months.reduce((n, p) => n + p.expenses, 0))
 const budgetUsed = round(budgets.reduce((n, b) => n + b.used, 0))
 const budgetLimit = round(budgets.reduce((n, b) => n + b.limit, 0))

 return {
  simulated,
  empty: source.length === 0,
  months,
  categories,
  budgets,
  kpis: {income, expenses, net: round(income - expenses), budgetUsed, budgetLimit},
 }
}
