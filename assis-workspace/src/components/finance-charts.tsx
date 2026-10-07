import {useId, useMemo} from 'react'
import type {ReactNode} from 'react'
import {buildFinanceDashboard, type BudgetPoint, type CategoryPoint, type MonthlyPoint} from '../lib/finance-charts'
import {formatMoney, type Workspace} from '../lib/workspace'
import './finance-charts.css'

type Lang = 'en' | 'ar'
const tr = (language: Lang, en: string, ar: string) => language === 'ar' ? ar : en
const kwd = (n: number) => `${formatMoney(n)} KWD`
const monthLabel = (month: string, language: Lang) => {
 const d = new Date(month + '-01T12:00:00')
 return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString(language === 'ar' ? 'ar-KW' : 'en-GB', {month: 'short'})
}
// A "nice" round axis ceiling (1/2/5 x a power of ten) so gridline labels are readable, not raw maxima.
function niceCeiling(value: number): number {
 if (value <= 0) return 10
 const exp = Math.pow(10, Math.floor(Math.log10(value)))
 const frac = value / exp
 const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
 return step * exp
}

export function FinanceCharts({workspace, language}: {workspace: Workspace; language: Lang}) {
 const data = useMemo(() => buildFinanceDashboard(workspace.lifecycle), [workspace.lifecycle])
 const budgetPct = data.kpis.budgetLimit > 0 ? Math.round((data.kpis.budgetUsed / data.kpis.budgetLimit) * 100) : null
 return <section className="finance-dashboard" aria-label={tr(language, 'Finance overview', 'نظرة عامة على المالية')}>
  <h2>{tr(language, 'Finance overview', 'نظرة عامة على المالية')}</h2>
  <p className="finance-basis">{data.empty
   ? tr(language, 'No finance records yet.', 'لا توجد سجلات مالية بعد.')
   : data.simulated
    ? tr(language, 'Showing simulated records. No completed actual entries yet.', 'عرض سجلات محاكاة. لا توجد معاملات فعلية مكتملة بعد.')
    : tr(language, 'Showing completed actual entries only.', 'يعرض المعاملات الفعلية المكتملة فقط.')}</p>
  {!data.empty && <>
   <div className="finance-kpis">
    <div className="finance-kpi"><span>{tr(language, 'Income', 'الدخل')}</span><strong dir="ltr">{kwd(data.kpis.income)}</strong></div>
    <div className="finance-kpi"><span>{tr(language, 'Expenses', 'المصروفات')}</span><strong dir="ltr">{kwd(data.kpis.expenses)}</strong></div>
    <div className="finance-kpi"><span>{tr(language, 'Net', 'الصافي')}</span><strong dir="ltr" className={data.kpis.net < 0 ? 'is-negative' : ''}>{kwd(data.kpis.net)}</strong></div>
    <div className="finance-kpi"><span>{tr(language, 'Budget used', 'المستخدم من الميزانية')}</span><strong dir="ltr">{kwd(data.kpis.budgetUsed)} / {kwd(data.kpis.budgetLimit)}</strong>{budgetPct !== null && <em>{budgetPct}%</em>}</div>
   </div>
   <div className="finance-charts-grid">
    <MonthlyChart months={data.months} language={language}/>
    <CategoryChart categories={data.categories} language={language}/>
    <BudgetChart budgets={data.budgets} language={language}/>
   </div>
  </>}
 </section>
}

function ChartCard({title, caption, children}: {title: string; caption: string; children: ReactNode}) {
 return <div className="finance-chart-card">
  <h3>{title}</h3>
  {children}
  <small>{caption}</small>
 </div>
}

function Legend({items}: {items: {swatch: 'green' | 'neutral'; label: string}[]}) {
 return <div className="finance-legend">{items.map(item => <span key={item.label}><i className={`swatch-${item.swatch}`}/>{item.label}</span>)}</div>
}

function MonthlyChart({months, language}: {months: MonthlyPoint[]; language: Lang}) {
 const id = useId()
 if (!months.length) return <ChartCard title={tr(language, 'Income vs expenses', 'الدخل مقابل المصروفات')} caption={tr(language, 'No dated entries in this period.', 'لا توجد معاملات مؤرخة في هذه الفترة.')}><p className="finance-chart-empty">{tr(language, 'Nothing to chart yet.', 'لا يوجد ما يُعرض بعد.')}</p></ChartCard>
 const width = 320, height = 190, top = 16, bottom = 34, left = 40, right = 8
 const max = niceCeiling(Math.max(...months.flatMap(m => [m.income, m.expenses]), 1))
 const plotH = height - top - bottom, plotW = width - left - right
 const slot = plotW / months.length, barW = Math.min(30, slot * 0.3)
 const y = (v: number) => top + plotH * (1 - v / max)
 const ticks = [0, max / 2, max]
 const title = tr(language, 'Monthly income versus expenses', 'الدخل الشهري مقابل المصروفات')
 const desc = months.map(m => `${monthLabel(m.month, language)}: ${tr(language, 'income', 'دخل')} ${kwd(m.income)}, ${tr(language, 'expenses', 'مصروفات')} ${kwd(m.expenses)}`).join('. ')
 return <ChartCard title={title} caption={tr(language, 'KWD, by month.', 'بالدينار الكويتي، حسب الشهر.')}>
  <Legend items={[{swatch: 'green', label: tr(language, 'Income', 'الدخل')}, {swatch: 'neutral', label: tr(language, 'Expenses', 'المصروفات')}]}/>
  <svg className="finance-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
   <title id={`${id}-t`}>{title}</title>
   <desc id={`${id}-d`}>{desc}</desc>
   {ticks.map(tick => <g key={tick}>
    <line className="grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)}/>
    <text x={left - 6} y={y(tick) + 3.5} fontSize="8.5" textAnchor="end">{Math.round(tick)}</text>
   </g>)}
   {months.map((m, i) => {
    const cx = left + slot * i + slot / 2
    return <g key={m.month}>
     <rect className="bar-green" x={cx - barW - 2} y={y(m.income)} width={barW} height={Math.max(0, y(0) - y(m.income))} rx="2"/>
     <rect className="bar-neutral" x={cx + 2} y={y(m.expenses)} width={barW} height={Math.max(0, y(0) - y(m.expenses))} rx="2"/>
     <text className="value" x={cx} y={y(Math.max(m.income, m.expenses)) - 6} fontSize="8" textAnchor="middle">{formatMoney(Math.max(m.income, m.expenses))}</text>
     <text x={cx} y={height - 10} fontSize="10" textAnchor="middle">{monthLabel(m.month, language)}</text>
    </g>
   })}
  </svg>
 </ChartCard>
}

function CategoryChart({categories, language}: {categories: CategoryPoint[]; language: Lang}) {
 const id = useId()
 const title = tr(language, 'Expense breakdown by category', 'توزيع المصروفات حسب الفئة')
 if (!categories.length) return <ChartCard title={title} caption={tr(language, 'No expense entries in this period.', 'لا توجد مصروفات في هذه الفترة.')}><p className="finance-chart-empty">{tr(language, 'Nothing to chart yet.', 'لا يوجد ما يُعرض بعد.')}</p></ChartCard>
 const rows = categories.slice(0, 6)
 const rowH = 26, top = 8, left = 8, right = 66, width = 320, height = top + rows.length * rowH + 8
 const barW = width - left - right
 const max = niceCeiling(Math.max(...rows.map(r => r.amount), 1))
 const desc = rows.map(r => `${r.label}: ${kwd(r.amount)}`).join('. ')
 return <ChartCard title={title} caption={tr(language, 'KWD, largest first.', 'بالدينار الكويتي، الأعلى أولاً.')}>
  <svg className="finance-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
   <title id={`${id}-t`}>{title}</title>
   <desc id={`${id}-d`}>{desc}</desc>
   {rows.map((row, i) => {
    const cy = top + i * rowH, w = Math.max(2, (row.amount / max) * barW)
    return <g key={row.label}>
     <rect className="bar-track" x={left} y={cy} width={barW} height={14} rx="2"/>
     <rect className="bar-neutral" x={left} y={cy} width={w} height={14} rx="2"/>
     <text x={left} y={cy - 3} fontSize="9">{row.label}</text>
     <text x={left + barW + 6} y={cy + 11} fontSize="9" textAnchor="start">{formatMoney(row.amount)}</text>
    </g>
   })}
  </svg>
 </ChartCard>
}

function BudgetChart({budgets, language}: {budgets: BudgetPoint[]; language: Lang}) {
 const id = useId()
 const title = tr(language, 'Budget used versus limit', 'المستخدم من الميزانية مقابل الحد')
 if (!budgets.length) return <ChartCard title={title} caption={tr(language, 'No budgets recorded.', 'لا توجد ميزانيات مسجّلة.')}><p className="finance-chart-empty">{tr(language, 'Nothing to chart yet.', 'لا يوجد ما يُعرض بعد.')}</p></ChartCard>
 const rowH = 34, top = 8, left = 8, right = 66, width = 320, height = top + budgets.length * rowH + 8
 const barW = width - left - right
 const max = niceCeiling(Math.max(...budgets.flatMap(b => [b.used, b.limit]), 1))
 const desc = budgets.map(b => `${monthLabel(b.month, language)}: ${tr(language, 'used', 'مستخدم')} ${kwd(b.used)} ${tr(language, 'of a limit of', 'من حد')} ${kwd(b.limit)}`).join('. ')
 return <ChartCard title={title} caption={tr(language, 'KWD, by budget month.', 'بالدينار الكويتي، حسب شهر الميزانية.')}>
  <Legend items={[{swatch: 'green', label: tr(language, 'Used', 'المستخدم')}, {swatch: 'neutral', label: tr(language, 'Limit', 'الحد')}]}/>
  <svg className="finance-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
   <title id={`${id}-t`}>{title}</title>
   <desc id={`${id}-d`}>{desc}</desc>
   {budgets.map((b, i) => {
    const cy = top + i * rowH, usedW = Math.max(2, (b.used / max) * barW), limitW = Math.max(2, (b.limit / max) * barW)
    return <g key={b.month}>
     <text x={left} y={cy - 2} fontSize="9">{monthLabel(b.month, language)}</text>
     <rect className="bar-track" x={left} y={cy + 2} width={barW} height={9} rx="2"/>
     <rect className={b.used > b.limit ? 'bar-over' : 'bar-green'} x={left} y={cy + 2} width={usedW} height={9} rx="2"/>
     <line className="limit-tick" x1={left + limitW} x2={left + limitW} y1={cy - 1} y2={cy + 15}/>
     <text x={left + barW + 6} y={cy + 10} fontSize="8.5" textAnchor="start">{formatMoney(b.used)}/{formatMoney(b.limit)}</text>
    </g>
   })}
  </svg>
 </ChartCard>
}
