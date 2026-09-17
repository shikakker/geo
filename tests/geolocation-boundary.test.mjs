import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
const page = await readFile(new URL('../pages/index.tsx', import.meta.url), 'utf8')

test('missing edge geolocation is not replaced with a fabricated city/country', () => {
  assert.doesNotMatch(proxy, /geo\.country\s*\|\|\s*['"]US['"]/)
  assert.doesNotMatch(proxy, /geo\.city\s*\|\|\s*['"]San Francisco['"]/)
  assert.doesNotMatch(proxy, /geo\.region\s*\|\|\s*['"]CA['"]/)
  assert.match(page, /Location unavailable/)
})

test('incoming query parameters cannot spoof edge-derived geolocation', () => {
  assert.match(proxy, /const GEO_QUERY_KEYS = \[/)
  for (const key of ['country', 'city', 'region', 'currencyCode', 'currencySymbol', 'name', 'languages']) {
    assert.match(proxy, new RegExp(`['"]${key}['"]`))
  }

  const clearStart = proxy.indexOf('for (const key of GEO_QUERY_KEYS)')
  const deleteQuery = proxy.indexOf('url.searchParams.delete(key)', clearStart)
  const trustedWrite = proxy.indexOf('for (const [key, value] of Object.entries(location))')
  assert.ok(clearStart >= 0 && deleteQuery > clearStart, 'internal geo query keys must be removed')
  assert.ok(trustedWrite > deleteQuery, 'trusted edge-derived values must be written only after clearing client query values')
})

test('country metadata lookup is fail-safe for unknown edge country codes', () => {
  assert.match(proxy, /countryInfo\?\./)
  assert.doesNotMatch(proxy, /Object\.keys\(countryInfo\.currencies\)/)
})

test('location-derived HTML is explicitly private and non-cacheable', () => {
  assert.match(proxy, /Cache-Control/)
  assert.match(proxy, /private, no-store/)
})

test('location strings are rendered as data and decoded defensively', () => {
  assert.doesNotMatch(page, /decodeURIComponent\(name\)/)
  assert.doesNotMatch(page, /decodeURIComponent\(city\)/)
})
