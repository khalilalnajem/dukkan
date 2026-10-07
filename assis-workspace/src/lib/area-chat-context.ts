// Builds a compact, human-readable summary of saved records for the "Work with Dukkan" /
// "Prepare with Dukkan" buttons, so the chat opens with area-aware context instead of a
// generic prompt. Self-contained (no component imports) so it stays testable under Node.
import type {LifecycleRecord} from '../../../shared/lifecycle.ts'

const MAX_ROWS = 12
const MAX_LENGTH = 1500

type Language = 'en' | 'ar'

const statusLabels: Record<Language, Record<string, string>> = {
 en: {prepared: 'prepared', approved: 'approved', submitted: 'submitted', completed: 'completed', archived: 'archived'},
 ar: {prepared: 'مُعدّ', approved: 'معتمد', submitted: 'تم التقديم', completed: 'مكتمل', archived: 'مؤرشف'},
}
const basisLabels: Record<Language, Record<string, string>> = {
 en: {actual: 'actual', estimate: 'estimate', simulated: 'simulated'},
 ar: {actual: 'فعلي', estimate: 'تقدير', simulated: 'محاكاة'},
}
const directionLabels: Record<Language, Record<string, string>> = {
 en: {income: 'income', expense: 'expense'},
 ar: {income: 'دخل', expense: 'مصروف'},
}
const stageLabelsAr: Record<string, string> = {
 new: 'جديد', active: 'نشط', inactive: 'غير نشط', requested: 'مطلوب', due: 'مستحق', open: 'مفتوح', closed: 'مغلق',
 prospect: 'محتمل', contacted: 'تم التواصل', qualified: 'مؤهّل', won: 'مكتسب', lost: 'غير مكتسب', draft: 'مسودة',
 sent: 'مُرسل', accepted: 'مقبول', declined: 'مرفوض', researching: 'قيد البحث', shortlisted: 'قائمة مختصرة',
 selected: 'مختار', ordered: 'تم الطلب', received: 'تم الاستلام', cancelled: 'ملغى', todo: 'لم تبدأ',
 in_progress: 'قيد التنفيذ', blocked: 'متوقفة', done: 'منجزة', sourced: 'تم العثور عليه', screening: 'فرز أولي',
 interview: 'مقابلة', offered: 'تم تقديم عرض', hired: 'تم التوظيف', rejected: 'مرفوض', not_started: 'لم تبدأ',
 complete: 'مكتملة', planned: 'مخططة', revised: 'معدّلة',
}
const humanise = (value: string) => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
const stageLabel = (value: string, language: Language) => (language === 'ar' ? stageLabelsAr[value] || humanise(value) : humanise(value))

function rowLine(record: LifecycleRecord, language: Language): string {
 const v = record.values
 const title = (v.title || '').trim().slice(0, 60)
 const status = v.status ? statusLabels[language][v.status] || humanise(v.status) : ''
 const stageOrDirection = v.direction
  ? directionLabels[language][v.direction] || v.direction
  : v.stage
  ? stageLabel(v.stage, language)
  : ''
 const amount = v.amount ? `KWD ${v.amount}` : language === 'ar' ? 'بدون مبلغ' : 'no amount'
 const date = v.date || (language === 'ar' ? 'بدون تاريخ' : 'no date')
 const basis = v.basis ? basisLabels[language][v.basis] || v.basis : ''
 return '- ' + [title, status, stageOrDirection, amount, date, basis].filter(Boolean).join(' · ')
}

export interface AreaChatPromptInput {
 language: Language
 areaLabel: string
 viewLabel: string
 records: LifecycleRecord[]
}

/** Compact, human-readable prompt for the "Work with Dukkan" / "Prepare with Dukkan" buttons.
 * Never includes record ids or raw category/entity codes; simulated records are labelled as such. */
export function buildAreaChatPrompt({language, areaLabel, viewLabel, records}: AreaChatPromptInput): string {
 const en = language === 'en'
 const intro = en
  ? `Here are my current ${areaLabel} ${viewLabel.toLowerCase()}.`
  : `هذه سجلات ${areaLabel} · ${viewLabel} الحالية لدي.`
 const ask = en
  ? 'Review them, flag anything inconsistent, and propose the next useful record or action for review.'
  : 'راجعها، وأشر إلى أي تعارض، واقترح السجل أو الإجراء التالي الأنسب للمراجعة.'
 const empty = en ? 'No records saved here yet.' : 'لا توجد سجلات محفوظة هنا بعد.'
 const askEmpty = en
  ? 'Propose the next useful record to prepare for review.'
  : 'اقترح السجل التالي الأنسب لتجهيزه للمراجعة.'

 const ordered = records.slice().reverse()
 if (!ordered.length) return [intro, empty, askEmpty].join(' ')

 let rowCount = Math.min(MAX_ROWS, ordered.length)
 let prompt = ''
 do {
  const lines = ordered.slice(0, rowCount).map(r => rowLine(r, language))
  prompt = [intro, ...lines, ask].join('\n')
  rowCount--
 } while (prompt.length > MAX_LENGTH && rowCount > 0)

 return prompt.length > MAX_LENGTH ? prompt.slice(0, MAX_LENGTH) : prompt
}
