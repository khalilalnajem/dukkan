import test from 'node:test'
import assert from 'node:assert/strict'
import {buildAreaChatPrompt} from '../src/lib/area-chat-context.ts'
import type {LifecycleRecord} from '../../shared/lifecycle.ts'

function record(id: string, values: LifecycleRecord['values']): LifecycleRecord {
 return {id, revision: 1, at: '2026-09-26T00:00:00.000Z', values: {recordId: id, ...values}, history: []}
}

test('summarises finance records with human labels, newest first, capped and under the character budget', () => {
 const records = [
  record('pearl-fin-expense-freight', {title: 'Freight', status: 'prepared', direction: 'expense', amount: '145.500', date: '2026-07-15', basis: 'simulated'}),
  record('pearl-fin-income-1', {title: 'Distributor A deposit', status: 'prepared', direction: 'income', amount: '850.000', date: '2026-07-10', basis: 'simulated'}),
 ]
 const prompt = buildAreaChatPrompt({language: 'en', areaLabel: 'Finance', viewLabel: 'Transactions', records})
 assert.ok(prompt.startsWith('Here are my current Finance transactions.'))
 assert.ok(prompt.includes('KWD 850.000'))
 assert.ok(prompt.includes('Simulated') || prompt.includes('simulated'))
 assert.ok(prompt.includes('income'))
 assert.ok(prompt.includes('Distributor A deposit'))
 assert.ok(prompt.length <= 1500)
 assert.ok(!prompt.includes(records[0].id))
 assert.ok(!prompt.includes(records[1].id))
 // mirrors the record list's own ordering: the most recently saved (last in the array) comes first
 assert.ok(prompt.indexOf('850.000') < prompt.indexOf('145.500'))
})

test('caps at 12 rows even when more records are supplied', () => {
 const records = Array.from({length: 20}, (_, i) =>
  record('r' + i, {title: 'Row ' + i, status: 'prepared', direction: 'expense', amount: '1.000', date: '2026-09-0' + (1 + (i % 9)), basis: 'estimate'}),
 )
 const prompt = buildAreaChatPrompt({language: 'en', areaLabel: 'Finance', viewLabel: 'Transactions', records})
 const rowLines = prompt.split('\n').filter(line => line.startsWith('- '))
 assert.equal(rowLines.length, 12)
 assert.ok(prompt.length <= 1500)
})

test('stays under the character budget even with very long titles', () => {
 const records = Array.from({length: 12}, (_, i) =>
  record('r' + i, {title: 'A very long saved record title that goes on and on '.repeat(3), status: 'approved', direction: 'expense', amount: '999999.000', date: '2026-09-01', basis: 'actual'}),
 )
 const prompt = buildAreaChatPrompt({language: 'en', areaLabel: 'Finance', viewLabel: 'Transactions', records})
 assert.ok(prompt.length <= 1500)
})

test('renders in Arabic when the UI language is Arabic, with no records showing a clear empty state', () => {
 const prompt = buildAreaChatPrompt({language: 'ar', areaLabel: 'المالية', viewLabel: 'المعاملات', records: []})
 assert.ok(prompt.includes('المالية'))
 assert.ok(prompt.includes('لا توجد سجلات'))
 assert.ok(!/[A-Za-z]/.test(prompt.replace('KWD', '')))
})

test('uses stage instead of direction when a record has no direction, and never leaks record ids or raw category codes', () => {
 const records = [record('sales-1', {title: 'Acme Trading', status: 'prepared', stage: 'qualified', category: 'sales', entityType: 'lead', date: '2026-09-01'})]
 const prompt = buildAreaChatPrompt({language: 'en', areaLabel: 'Customers & sales', viewLabel: 'Pipeline', records})
 assert.ok(prompt.includes('Qualified'))
 assert.ok(!prompt.includes('sales-1'))
 assert.ok(!prompt.includes('entityType'))
})
