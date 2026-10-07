import test from 'node:test'
import assert from 'node:assert/strict'
import {localReviewedDownloadHref} from '../src/lib/reviewed-download-link.ts'

test('local attachment URL replaces stale hash with the reviewed artifact hash', () => {
  const href = localReviewedDownloadHref(
    'http://127.0.0.1:8789',
    '/api/chat/artifacts/doc-7/export?hash=old',
    'doc-7',
    'reviewed-hash',
    '/api/chat/artifacts/doc-7/export?hash=old',
  )
  assert.ok(href)
  const url = new URL(href)
  assert.equal(url.origin, 'http://127.0.0.1:8789')
  assert.equal(url.pathname, '/api/chat/artifacts/doc-7/export')
  assert.deepEqual([...url.searchParams.entries()], [['hash', 'reviewed-hash']])
})

test('hosted API uses the verified blob fallback', () => {
  assert.equal(localReviewedDownloadHref(
    'https://api.example.test',
    '/api/chat/artifacts/doc-7/export',
    'doc-7',
    'reviewed-hash',
    '/api/chat/artifacts/doc-7/export',
  ), null)
})

test('local attachment URL rejects unexpected origin, credentials, and query secrets', () => {
  const base = ['http://127.0.0.1:8789', '/api/chat/artifacts/doc-7/export', 'doc-7', 'reviewed-hash'] as const
  assert.throws(() => localReviewedDownloadHref(...base, 'https://evil.test/api/chat/artifacts/doc-7/export'))
  assert.throws(() => localReviewedDownloadHref(...base, 'http://user:pass@127.0.0.1:8789/api/chat/artifacts/doc-7/export'))
  assert.throws(() => localReviewedDownloadHref(...base, '/api/chat/artifacts/doc-7/export?token=secret'))
  assert.throws(() => localReviewedDownloadHref(...base, '/api/chat/artifacts/doc-8/export'))
})
