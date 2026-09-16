import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const middleware = read('middleware.ts')
const pkg = JSON.parse(read('package.json'))

test('runtime dependencies are pinned to maintained non-floating lines', () => {
  assert.notEqual(pkg.dependencies.next, 'canary')
  assert.notEqual(pkg.dependencies.react, 'latest')
  assert.notEqual(pkg.dependencies['react-dom'], 'latest')
  assert.match(pkg.engines?.node ?? '', /^22/)
})

test('geolocation reads Vercel headers instead of removed NextRequest.geo', () => {
  assert.doesNotMatch(middleware, /\bgeo\b\s*}\s*=\s*req|req\.geo/)
  assert.match(middleware, /x-vercel-ip-country/)
  assert.match(middleware, /x-vercel-ip-city/)
  assert.match(middleware, /x-vercel-ip-country-region/)
})

test('unknown or missing country codes fail closed instead of fabricating a US location', () => {
  assert.doesNotMatch(middleware, /fallbackCountry/)
  assert.doesNotMatch(middleware, /['"]San Francisco['"]/)
  assert.doesNotMatch(middleware, /['"]CA['"]/)
  assert.match(middleware, /countryInfo\?\./)
})

test('country header is normalized before optional lookup', () => {
  assert.match(middleware, /toUpperCase\(\)/)
  assert.match(middleware, /countryInfo\?\.cca2/)
})

test('personalized geolocation output is not shared through caches', () => {
  assert.match(middleware, /Cache-Control/)
  assert.match(middleware, /private, no-store/)
})
