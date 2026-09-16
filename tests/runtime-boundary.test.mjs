import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const floating = value => /latest|canary|alpha|beta|rc/i.test(String(value || ''))

test('Geo example uses a stable pinned Next/React runtime', () => {
  assert.equal(floating(pkg.dependencies?.next), false)
  assert.equal(floating(pkg.dependencies?.react), false)
  assert.equal(floating(pkg.dependencies?.['react-dom']), false)
  assert.match(String(pkg.dependencies?.next || ''), /^15\.5\.24$/)
  assert.match(String(pkg.dependencies?.react || ''), /^18\.2\.0$/)
  assert.match(String(pkg.dependencies?.['react-dom'] || ''), /^18\.2\.0$/)
})

test('lint/runtime tooling is compatible and Node is pinned', () => {
  assert.equal(pkg.devDependencies?.['eslint-config-next'], '15.5.24')
  assert.equal(pkg.devDependencies?.eslint, '8.57.1')
  assert.match(String(pkg.engines?.node || ''), /^22\.x$/)
  assert.equal(pkg.packageManager, 'npm@10.9.8')
})
