/** Keep shared validation language-neutral at the UI boundary. */
const arabic:Record<string,string>={
 'Could not retrieve this document.':'تعذّر تنزيل المستند. حاول مجدداً.',
 'Document bytes changed. Download stopped.':'لا يطابق الملف النسخة المحفوظة. أُوقف التنزيل.',
 'Use an integer quantity up to 1000000 and a KWD unit price with at most three decimals.':'أدخل كمية صحيحة لا تتجاوز ١٬٠٠٠٬٠٠٠ وسعر وحدة بالدينار الكويتي لا يزيد على ثلاث خانات عشرية.',
 'Line total exceeds the supported KWD amount.':'يتجاوز إجمالي البند الحد المسموح به بالدينار الكويتي.',
 'Amount must equal quantity multiplied by unit price.':'يجب أن يساوي المبلغ حاصل ضرب الكمية في سعر الوحدة.',
 'Unsupported business record fields.':'يحتوي السجل على حقول غير مدعومة.',
 'This business record no longer exists.':'لم يعد هذا السجل موجوداً. أعد فتح قائمة السجلات.',
 'A category, title and useful details are required.':'أضف فئة السجل وعنوانه والتفاصيل اللازمة.',
 'Keep the record category when revising it.':'لا يمكن تغيير فئة السجل عند تعديله.',
 'Choose a supported record status.':'اختر حالة متاحة للسجل.',
 'New work starts as prepared. Review it before approval.':'يبدأ السجل الجديد كمسودة مُعدّة. راجعه قبل اعتماده.',
 'Use a public HTTPS source link.':'أدخل رابط مصدر عام يبدأ بـ https://.',
 'Use a valid date in YYYY-MM-DD format.':'أدخل تاريخاً صحيحاً بصيغة السنة-الشهر-اليوم.',
 'Invalid time value':'أدخل تاريخاً صحيحاً.',
 'Changed content needs a fresh review. Save it as prepared first.':'تحتاج التعديلات إلى مراجعة جديدة. احفظ السجل كمسودة مُعدّة أولاً.',
 'Review this version before advancing its status.':'راجع هذه النسخة قبل تغيير حالتها إلى المرحلة التالية.',
 'Record the official submission before its outcome.':'سجّل التقديم الرسمي قبل تسجيل نتيجته.',
 'Record the receipt or outcome evidence first. Dukkan does not submit or verify it.':'أضف إيصال التقديم أو دليل النتيجة أولاً. دكان لا يقدّم الطلب ولا يتحقق من نتيجته.',
 'Record the actual event date, which cannot be in the future.':'أدخل تاريخ الحدث الفعلي. لا يمكن أن يكون تاريخاً مستقبلياً.',
 'Use a non-negative KWD amount with at most three decimal places.':'أدخل مبلغاً صفرياً أو موجباً بالدينار الكويتي، بحد أقصى ثلاث خانات عشرية.',
 'Choose an entity type supported by this category.':'اختر نوع سجل متاحاً ضمن هذه الفئة.',
 'Choose a sales record type.':'اختر نوع سجل المبيعات.',
 'Keep the record type when revising it.':'لا يمكن تغيير نوع السجل عند تعديله.',
 'Choose a stage supported by this record category.':'اختر مرحلة متاحة لهذا النوع من السجلات.',
 'An outcome stage needs actual or simulated provenance, dated reported evidence, and an event date no later than today. Keep planned work at its earlier stage.':'لتسجيل نتيجة، اختر بيانات فعلية أو محاكاة وأضف دليل النتيجة وتاريخاً لا يتجاوز اليوم. أبقِ العمل المخطط له في مرحلته السابقة.',
 'Only KWD amounts are supported.':'المبالغ بالدينار الكويتي فقط.',
 'Supply quantity and unit price together.':'أدخل الكمية وسعر الوحدة معاً.',
 'Line-item quantities belong to purchases or proposals.':'يمكن إضافة الكمية إلى سجلات المشتريات أو العروض فقط.',
 'Choose actual, estimate or simulated provenance.':'حدّد أساس البيانات: فعلية أو تقديرية أو محاكاة.',
 'Actual records require founder-reported evidence.':'أضف دليلاً قدّمته أنت لتوثيق البيانات الفعلية.',
 'An operating entry needs amount, income/expense, date and actual/estimate/simulated basis.':'أدخل المبلغ ونوع التدفق والتاريخ، وحدّد ما إذا كانت البيانات فعلية أو تقديرية أو محاكاة.',
 'Actual entries need a founder-reported receipt or source reference.':'أضف إيصالاً أو مرجعاً قدّمته أنت لتوثيق المعاملة الفعلية.',
 'Record the evidence and trade-off behind this decision.':'سجّل الأدلة والمفاضلة التي يستند إليها هذا القرار.',
 'Link an existing, different business record.':'اربط هذا السجل بسجل آخر موجود في المشروع.',
 'Export a backup before adding more business records.':'صدّر نسخة احتياطية قبل إضافة مزيد من السجلات.',
 'This record has reached its revision limit. Export it before continuing.':'بلغ السجل الحد الأقصى للنسخ. صدّره قبل المتابعة.',
 'Save failed':'تعذّر الحفظ. احتفظ بتعديلاتك وحاول مجدداً.'
}
export function recordError(error:unknown,language:'en'|'ar'){
 const message=error instanceof Error?error.message:String(error||'Save failed')
 const known=Object.keys(arabic).find(key=>message===key||message.startsWith(key+' '))
 return language==='ar'?((known&&arabic[known])||'تعذّر حفظ التغييرات. احتفظ بها وأعد فتح أحدث نسخة من السجل.') : message
}
