export function workPanelCloseGuidance(dirty:boolean,language:'en'|'ar'):string|null {
 if(!dirty)return null
 return language==='ar'
  ?'هناك تعديلات غير محفوظة. احفظها أو تجاهلها قبل إغلاق اللوحة.'
  :'There are unsaved changes. Save or discard them before closing this panel.'
}

export function selectedWorkDocumentId(active:string,openDocumentIds:string[],currentDocumentId:string|null|undefined):string {
 if(active==='saved')return ''
 return openDocumentIds.includes(active)?active:(currentDocumentId||'')
}
