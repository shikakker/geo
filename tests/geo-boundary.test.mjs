import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

const middleware = read('middleware.ts')
const app = read('pages/_app.tsx')
const page = read('pages/index.tsx')
const pkg = JSON.parse(read('package.json'))

test('runtime dependencies are pinned to the maintained Next 16 release line', () => {
  assert.equal(pkg.dependencies.next, '16.3.5')
  assert.equal(pkg.dependencies.react, '19.3.0')
  assert.equal(pkg.dependencies['react-dom'], '19.3.0')
  assert.equal(pkg.engines?.node, '22.x')
  assert.equal(pkg.dependencies['@vercel/examples-ui'], undefined)
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

test('Next 16 uses proxy convention instead of deprecated middleware convention', () => {
  assert.equal(exists('proxy.ts'), true)
  assert.equal(exists('middleware.ts'), false)
})

test('app shell is repository-owned and page avoids legacy Next image props', () => {
  assert.doesNotMatch(app, /@vercel\/examples-ui/)
  assert.doesNotMatch(page, /@vercel\/examples-ui/)
  assert.doesNotMatch(page, /layout=["']fill["']/)
  assert.doesNotMatch(page, /objectFit=/)
})
