// The local workspace stays untouched. Signed-in accounts use a separate cache.
export type Records = Record<string, string>
export type CloudSnapshot = { revision: number; records: Records }
type Pending = { id: string; revision: number; records: Records }
type Cache = CloudSnapshot & { dirty: boolean; pending?: Pending }
export type RemoteWorkspace = {
  read(): Promise<CloudSnapshot>
  save(expected: number, records: Records, requestId: string): Promise<number>
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export const isBusinessKey = (key: string) => [
  'dukkan-idea-folders-v1', 'dukkan-idea-bin-v1', 'dukkan-idea-archive-v1',
  'assis-connected-workspace-v2', 'assis-guided-mvp-v1',
].includes(key) || /^dukkan-idea-workspace-v1:[A-Za-z0-9_-]{1,100}$/.test(key)

function checkedRecords(value: unknown): Records {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.entries(value).some(([key, item]) => !isBusinessKey(key) || typeof item !== 'string'))
    throw new Error('Saved account records could not be read. Nothing was replaced.')
  return value as Records
}
function checkedSnapshot(value: CloudSnapshot): CloudSnapshot {
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid account revision.')
  return { revision: value.revision, records: checkedRecords(value.records) }
}

export class AccountStorage implements StorageLike {
  readonly cacheKey: string
  private active = true
  private running: Promise<void> | null = null
  private conflict = false
  constructor(readonly owner: string, private cache: StorageLike, private remote: RemoteWorkspace,
    private locked: <T>(name: string, action: () => Promise<T>) => Promise<T>,
    private changed: () => void = () => {}) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)) throw new Error('Invalid account.')
    this.cacheKey = `dukkan-account-v1:${owner}`
  }
  private current(): Cache {
    if (!this.active) throw new Error('Your account session changed. Sign in again before saving.')
    const raw = this.cache.getItem(this.cacheKey)
    if (!raw) throw new Error('Account records are not loaded.')
    const value = JSON.parse(raw)
    checkedSnapshot(value)
    if (typeof value.dirty !== 'boolean') throw new Error('Account recovery data is invalid.')
    if (value.pending) {
      checkedSnapshot({ revision: value.pending.revision, records: value.pending.records })
      if (typeof value.pending.id !== 'string') throw new Error('Invalid pending save.')
    }
    return value
  }
  private write(value: Cache) { this.cache.setItem(this.cacheKey, JSON.stringify(value)); this.changed() }
  async load() {
    await this.locked(this.cacheKey, async () => {
      const cloud = checkedSnapshot(await this.remote.read())
      if (!this.active) throw new Error('Your account session changed.')
      const raw = this.cache.getItem(this.cacheKey)
      if (raw) {
        const local = this.current()
        // Retain failed/offline edits for explicit recovery, never replace them.
        if (local.dirty) {
          if (local.revision !== cloud.revision && !local.pending) {
            this.conflict = true
            throw new Error('Newer work exists in your account. Export this browser’s recovery copy before loading it.')
          }
          return
        }
      }
      this.write({ ...cloud, dirty: false })
    })
    if (this.isPending) await this.flush()
  }
  getItem(key: string) { return this.current().records[key] ?? null }
  setItem(key: string, value: string) {
    if (!isBusinessKey(key)) throw new Error('Unexpected business record.')
    if (this.conflict) throw new Error('Resolve the account conflict before saving more changes.')
    const current = this.current()
    this.write({ ...current, records: { ...current.records, [key]: value }, dirty: true })
  }
  removeItem(key: string) {
    if (!isBusinessKey(key)) throw new Error('Unexpected business record.')
    if (this.conflict) throw new Error('Resolve the account conflict before saving more changes.')
    const current = this.current(), records = { ...current.records }; delete records[key]
    this.write({ ...current, records, dirty: true })
  }
  get isPending() { return this.current().dirty }
  recoveryCopy() { return this.cache.getItem(this.cacheKey) }
  deactivate() { this.active = false }
  flush(): Promise<void> {
    if (this.running) return this.running
    this.running = this.locked(this.cacheKey, async () => {
      for (;;) {
        const before = this.current()
        if (!before.dirty) return
        const pending = before.pending || { id: crypto.randomUUID(), revision: before.revision, records: before.records }
        // Persist the request identity before sending, including across reloads.
        if (!before.pending) this.write({ ...before, pending })
        let revision: number
        try { revision = await this.remote.save(pending.revision, pending.records, pending.id) }
        catch (error) {
          if (error instanceof Error && error.message.includes('WORKSPACE_CONFLICT')) this.conflict = true
          throw error
        }
        if (revision !== pending.revision + 1) throw new Error('Cloud save could not be verified. Recovery copy retained.')
        const latest = this.current()
        // Edits made while the request was in flight are included in the next save.
        const dirty = JSON.stringify(latest.records) !== JSON.stringify(pending.records)
        this.write({ revision, records: latest.records, dirty })
        if (!dirty) return
      }
    }).finally(() => { this.running = null })
    return this.running
  }
}

let account: AccountStorage | null = null
let sessionVersion=0
export function useAccountStorage(next: AccountStorage | null) { account?.deactivate(); account = next;sessionVersion++ }
export const getBusinessStorage=():StorageLike=>account||localStorage
export function captureBusinessSession(){
 const version=sessionVersion,selected=account
 const assert=()=>{if(version!==sessionVersion)throw new Error('Your account session changed. This action was not applied.')}
 return {assert,async flush(){assert();await selected?.flush();assert()}}
}
export const businessStorage: StorageLike = {
  getItem: key => (account || localStorage).getItem(key),
  setItem: (key, value) => (account || localStorage).setItem(key, value),
  removeItem: key => (account || localStorage).removeItem(key),
}
export async function flushBusinessStorage() { await account?.flush() }
