import test from 'node:test'
import assert from 'node:assert/strict'
import {parseCsv,previewFinance,applyFinanceImport} from '../src/lib/finance-import.ts'
import {operatingTotals} from '../../shared/lifecycle.ts'
const mapping={reference:0,date:1,title:2,direction:3,amount:4}
const csv='reference,date,title,direction,amount\r\nA,2026-01-01,"Sale, one",income,0.999\r\nB,2026-01-02,"Cost ""two""",expense,0.333\r\n'
test('CSV handles BOM, quoted commas, quotes and newlines without evaluating contents',()=>{
 const rows=parseCsv('\uFEFF'+csv);assert.equal(rows[1][2],'Sale, one');assert.equal(rows[2][2],'Cost "two"')
 assert.equal(parseCsv('a,b\n"two\nlines",=SUM(A1)')[1][1],'=SUM(A1)')
 for(const raw of ['a,b\n"broken,x','a,b\n"x"z,y','a,a\nx,y','a,b\nx,y,z'])assert.throws(()=>parseCsv(raw))
})
test('reviewed import preserves exact amounts and sources, skips repeat references and stays out of actual cash totals',async()=>{
 const rows=parseCsv(csv),preview=await previewFinance(rows,mapping,'POS January','actual',[])
 assert.equal(preview.income,0.999);assert.equal(preview.expenses,0.333)
 const saved=applyFinanceImport([],preview,'2026-01-03T00:00:00Z')
 assert.equal(saved.length,2);assert.match(saved[0].values.evidence!,/POS January; transaction: A/)
 assert.equal(saved[0].values.status,'prepared');assert.equal(operatingTotals(saved,'2026-01').count,0)
 const repeated=await previewFinance(rows,mapping,'POS January','actual',saved)
 assert.ok(repeated.rows.every(r=>r.duplicate));assert.equal(repeated.income,0)
 assert.deepEqual(applyFinanceImport(saved,repeated,'2026-01-04'),saved)
 await assert.rejects(previewFinance(parseCsv(csv.replace('0.999','1.999')),mapping,'POS January','actual',saved),/different data/)
 assert.throws(()=>applyFinanceImport(saved,preview,'2026-01-04'),/changed/)
})
test('invalid rows and ambiguous mappings reject the entire import',async()=>{
 for(const replacement of ['-1','1.2345','1e3','NaN'])await assert.rejects(previewFinance(parseCsv(csv.replace('0.999',replacement)),mapping,'Source','actual',[]))
 await assert.rejects(previewFinance(parseCsv(csv.replace('2026-01-01','2026-02-30')),mapping,'Source','actual',[]))
 await assert.rejects(previewFinance(parseCsv(csv.replace('B,','A,')),mapping,'Source','actual',[]),/unique/)
 await assert.rejects(previewFinance(parseCsv(csv),{...mapping,amount:3},'Source','actual',[]),/different column/)
})
