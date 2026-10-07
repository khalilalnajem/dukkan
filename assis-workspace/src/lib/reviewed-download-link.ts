/** Build a same-origin attachment URL only for the local API. The caller must
 * verify the downloaded bytes before exposing this link to the user. */
export function localReviewedDownloadHref(
  apiBase: string,
  validatedExportPath: string,
  artifactId: string,
  hash: string,
  originalExportUrl: string,
): string | null {
  const api = new URL(apiBase)
  if (api.protocol !== 'http:' && api.protocol !== 'https:') throw new Error('Unsupported API URL scheme.')
  if (api.username || api.password || api.search || api.hash) throw new Error('The API URL contains unexpected credentials or parameters.')
  const hostname = api.hostname.toLowerCase()
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return null
  if (api.pathname !== '/' && api.pathname !== '') throw new Error('The local API URL must be an origin.')

  const pathname = `/api/chat/artifacts/${encodeURIComponent(artifactId)}/export`
  const original = new URL(originalExportUrl, api.origin)
  if (original.protocol !== api.protocol || original.origin !== api.origin || original.username || original.password || original.pathname !== pathname) {
    throw new Error('The export URL is not the expected local attachment route.')
  }
  const validated = new URL(validatedExportPath, api.origin)
  if (validated.origin !== api.origin || validated.username || validated.password || validated.pathname !== pathname) {
    throw new Error('The validated export path does not match this document.')
  }

  for (const url of [original, validated]) {
    const keys = [...url.searchParams.keys()]
    if (keys.some(key => key !== 'hash') || url.searchParams.getAll('hash').length > 1) {
      throw new Error('The export URL contains unexpected query parameters.')
    }
  }
  if (!hash) throw new Error('The reviewed document hash is missing.')

  const attachment = new URL(pathname, api.origin)
  attachment.searchParams.set('hash', hash)
  return attachment.href
}
