import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

const proxy = read('proxy.ts')
const app = read('pages/_app.tsx')
const page = read('pages/index.tsx')
const nextConfig = read('next.config.js')
const tailwindConfig = read('tailwind.config.js')
const pkg = JSON.parse(read('package.json'))

test('runtime dependencies are pinned to the maintained Next 16 release line', () => {
  assert.equal(pkg.dependencies.next, '16.3.5')
  assert.equal(pkg.dependencies.react, '19.3.0')
  assert.equal(pkg.dependencies['react-dom'], '19.3.0')
  assert.equal(pkg.engines?.node, '22.x')
  assert.equal(pkg.dependencies['@vercel/examples-ui'], undefined)
})

test('geolocation reads Vercel headers instead of removed NextRequest.geo', () => {
  assert.doesNotMatch(proxy, /\bgeo\b\s*}\s*=\s*req|req\.geo/)
  assert.match(proxy, /x-vercel-ip-country/)
  assert.match(proxy, /x-vercel-ip-city/)
  assert.match(proxy, /x-vercel-ip-country-region/)
})

test('unknown or missing country codes fail closed instead of fabricating a US location', () => {
  assert.doesNotMatch(proxy, /fallbackCountry/)
  assert.doesNotMatch(proxy, /['"]San Francisco['"]/)
  assert.doesNotMatch(proxy, /['"]CA['"]/)
  assert.match(proxy, /countryInfo\?\./)
})

test('country header is normalized before optional lookup', () => {
  assert.match(proxy, /toUpperCase\(\)/)
  assert.match(proxy, /countryInfo\?\.cca2/)
})

test('personalized geolocation output is not shared through caches', () => {
  assert.match(proxy, /Cache-Control/)
  assert.match(proxy, /private, no-store/)
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

test('production styling and build config do not depend on removed example UI packages', () => {
  assert.doesNotMatch(nextConfig, /@vercel\/examples-ui/)
  assert.doesNotMatch(tailwindConfig, /@vercel\/examples-ui/)
  assert.doesNotMatch(nextConfig, /withCountryInfo/)
  assert.doesNotMatch(nextConfig, /scripts\/countries/)
  assert.match(nextConfig, /remotePatterns/)
})


test('geo metadata stays out of rewritten query parameters', () => {
  assert.match(proxy, /GEO_REQUEST_HEADERS/)
  assert.match(proxy, /request:\s*\{ headers: requestHeaders \}/)
  assert.doesNotMatch(proxy, /url\.searchParams\.set\(key, value\)/)
})

test('SSR trusts proxy-owned geo headers instead of geo query values', () => {
  assert.match(page, /req\.headers\['x-geo-country'\]/)
  assert.match(page, /req\.headers\['x-geo-city'\]/)
  assert.match(page, /res\.setHeader\('Cache-Control', 'private, no-store'\)/)
  assert.doesNotMatch(page, /\{ query \}/)
})

test('proxy clears client-supplied internal geo headers before writing trusted values', () => {
  assert.match(proxy, /requestHeaders\.delete\(headerName\)/)
})
