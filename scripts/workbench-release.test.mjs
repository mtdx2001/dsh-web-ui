import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  auditRelease, decidePublication, packagesFor, publishRelease,
  suiteDependenciesFor,
} from './workbench-release.mjs'

const VERSION = '0.1.20'

function manifest(name, version) {
  const value = {
    name,
    version,
    type: 'module',
    dsh: {
      engines: { dsh: '>=0.1.1-rc.1' },
      bundle: { patch: './cordis.patch.yml' },
    },
    exports: { './src/*': './src/*' },
  }
  if (name === '@mtdx2001/dsh-workbench-suite') value.dependencies = suiteDependenciesFor(version)
  return value
}

function makeTarball(directory, spec, options = {}) {
  const staging = mkdtempSync(join(tmpdir(), 'workbench-release-fixture-'))
  try {
    const root = join(staging, 'package')
    mkdirSync(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest(spec.name, VERSION)))
    writeFileSync(join(root, 'cordis.patch.yml'), 'version: 1\n')
    writeFileSync(join(root, 'LICENSE'), 'Apache-2.0\n')
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'fixture.js'), 'export {}\n')
    if (options.sensitive) writeFileSync(join(root, '.env'), 'forbidden fixture content\n')
    execFileSync('tar', ['-czf', join(directory, spec.file), '-C', staging, 'package'])
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

function releaseFixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-release-set-'))
  const specs = packagesFor(VERSION)
  for (const spec of specs) makeTarball(directory, spec, {
    sensitive: options.sensitive === spec.name,
  })
  return { directory, specs }
}

test('auditRelease validates all three package identities and Suite dependencies', () => {
  const fixture = releaseFixture()
  try {
    const audited = auditRelease(fixture.directory, VERSION)
    assert.deepEqual(audited.map((pkg) => pkg.name), fixture.specs.map((pkg) => pkg.name))
    assert.ok(audited.every((pkg) => pkg.integrity.startsWith('sha512-')))
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('auditRelease scans extracted files and rejects sensitive paths', () => {
  const fixture = releaseFixture({ sensitive: '@mtdx2001/dsh-client-ui-workbench' })
  try {
    assert.throws(() => auditRelease(fixture.directory, VERSION), /forbidden release path.*\.env/)
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test('decidePublication publishes only an absent version and skips an identical version', () => {
  assert.equal(decidePublication('sha512-local', null), 'publish')
  assert.equal(decidePublication('sha512-local', 'sha512-local'), 'skip')
  assert.throws(() => decidePublication('sha512-local', 'sha512-other'), /integrity mismatch/)
})

test('publishRelease publishes new packages in dependency order and waits for each', () => {
  const audited = packagesFor(VERSION).map((pkg, index) => ({ ...pkg, integrity: `sha512-${index}` }))
  const registry = new Map()
  const events = []
  const result = publishRelease(audited, VERSION, {
    view: (name) => registry.get(name) ?? null,
    publish: (pkg) => {
      events.push(`publish:${pkg.name}`)
      registry.set(pkg.name, pkg.integrity)
    },
    attempts: 1,
    delayMs: 0,
  })
  assert.deepEqual(result.map((item) => item.action), ['publish', 'publish', 'publish'])
  assert.deepEqual(events, audited.map((pkg) => `publish:${pkg.name}`))
})

test('publishRelease recovers after the first two packages were already published', () => {
  const audited = packagesFor(VERSION).map((pkg, index) => ({ ...pkg, integrity: `sha512-${index}` }))
  const registry = new Map(audited.slice(0, 2).map((pkg) => [pkg.name, pkg.integrity]))
  const published = []
  const result = publishRelease(audited, VERSION, {
    view: (name) => registry.get(name) ?? null,
    publish: (pkg) => {
      published.push(pkg.name)
      registry.set(pkg.name, pkg.integrity)
    },
    attempts: 1,
    delayMs: 0,
  })
  assert.deepEqual(result.map((item) => item.action), ['skip', 'skip', 'publish'])
  assert.deepEqual(published, ['@mtdx2001/dsh-workbench-suite'])
})

test('publishRelease refuses an existing version with different bytes', () => {
  const audited = packagesFor(VERSION).map((pkg, index) => ({ ...pkg, integrity: `sha512-${index}` }))
  assert.throws(() => publishRelease(audited, VERSION, {
    view: () => 'sha512-wrong',
    publish: () => assert.fail('publish must not run'),
    attempts: 1,
    delayMs: 0,
  }), /integrity mismatch/)
})

test('publishRelease times out before proceeding to Suite when a dependency does not propagate', () => {
  const audited = packagesFor(VERSION).map((pkg, index) => ({ ...pkg, integrity: `sha512-${index}` }))
  const published = []
  assert.throws(() => publishRelease(audited, VERSION, {
    view: () => null,
    publish: (pkg) => published.push(pkg.name),
    attempts: 2,
    delayMs: 0,
  }), /timed out waiting for npm propagation/)
  assert.deepEqual(published, ['@mtdx2001/dsh-client-ui-workbench'])
})
