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
  assert.notEqual(pkg.dependencies['@vercel/examples-ui'], 'latest')
  assert.match(pkg.engines?.node ?? '', /^22/)
})

test('geolocation reads Vercel headers instead of removed NextRequest.geo', () => {
  assert.doesNotMatch(middleware, /\bgeo\b\s*}\s*=\s*req|req\.geo/)
  assert.match(middleware, /x-vercel-ip-country/)
  assert.match(middleware, /x-vercel-ip-city/)
  assert.match(middleware, /x-vercel-ip-country-region/)
})

test('unknown country codes fall back without dereferencing undefined country data', () => {
  assert.match(middleware, /fallbackCountry/)
  assert.match(middleware, /countryInfo\s*\?\?\s*fallbackCountry/)
})

test('country header is normalized before lookup and flag rendering', () => {
  assert.match(middleware, /toUpperCase\(\)/)
  assert.match(middleware, /countryInfo\.cca2/)
})
