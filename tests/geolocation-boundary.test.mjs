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
