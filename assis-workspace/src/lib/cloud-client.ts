import {createClient} from '@supabase/supabase-js'
import type {RemoteWorkspace} from './account-storage.ts'

const url=import.meta.env?.VITE_SUPABASE_URL as string|undefined
const publishableKey=import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined
export const cloudConfigured=!!(url&&publishableKey)
function makeClient(){
 if(!url||!publishableKey)return null
 if(new URL(url).protocol!=='https:'||publishableKey.startsWith('sb_secret_'))throw new Error('Invalid public account configuration.')
 // A legacy service-role JWT is also a secret, never a browser configuration.
 if(publishableKey.split('.').length===3){
  const payload=JSON.parse(atob(publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
  if(payload.role!=='anon')throw new Error('A public account key is required.')
 }
 return createClient(url,publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'dukkan-auth-v1'}})
}
export const cloudClient=makeClient()
export function remoteWorkspace(owner:string):RemoteWorkspace{
 const client=cloudClient
 if(!client)throw new Error('Cloud accounts are not configured.')
 return {
  async read(){
   const {data,error}=await client.from('dukkan_workspaces').select('revision,records').eq('owner_id',owner).maybeSingle()
   if(error)throw new Error('Account records could not be loaded. Your recovery copy is unchanged.')
   return data||{revision:0,records:{}}
  },
  async save(expected,records,requestId){
   const {data,error}=await client.rpc('dukkan_save_workspace',{expected_revision:expected,next_records:records,request_id:requestId})
   if(error)throw new Error(error.code==='40001'?'WORKSPACE_CONFLICT: Newer account records exist. Export your edits before reloading.':'Cloud save failed. Your browser recovery copy is retained; sign in or retry.')
   if(typeof data!=='number')throw new Error('Cloud save returned an invalid revision.')
   return data
  },
 }
}

export async function accountHeaders():Promise<Record<string,string>>{
 if(!cloudClient)return {}
 const {data,error}=await cloudClient.auth.getSession()
 if(error||!data.session)throw new Error('Sign in before continuing.')
 return {Authorization:`Bearer ${data.session.access_token}`}
}
