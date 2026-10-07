import {matchesView,recordViews,type BusinessArea} from './workspaces.ts'
import type {LifecycleRecord} from '../../../shared/lifecycle.ts'
/** Resolve a dashboard row to the section that can actually open its record type. */
export function recordArea(record:LifecycleRecord):Exclude<BusinessArea,'market'>|null {
 for(const [area,views] of Object.entries(recordViews))if(views.some(view=>matchesView(record,view)))return area as Exclude<BusinessArea,'market'>
 return null
}
export function isSampleWorkspace(search:string){return new URLSearchParams(search).has('example')}
