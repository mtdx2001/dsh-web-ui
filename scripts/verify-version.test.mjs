import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packageFiles, verifyPackages } from './verify-version.mjs'

function fixture(packages) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-verify-version-'))
  for (const [path, pkg] of Object.entries(packages)) {
    const file = join(dir, path, 'package.json')
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, JSON.stringify(pkg))
  }
  return dir
}

test('packageFiles walks package and skin release roots only', () => {
  const dir = fixture({
    'packages/dsh-workbench': { name: 'workbench', version: '0.1.19' },
    'packages/skins/miku': { name: 'miku', version: '0.1.19' },
    'packages/dsh-skins/skins/nested': { name: 'nested', version: '0.1.19' },
  })
  try {
    assert.deepEqual(packageFiles(dir), [
      join(dir, 'packages/dsh-workbench/package.json'),
      join(dir, 'packages/skins/miku/package.json'),
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('verifyPackages rejects version drift and private release packages', () => {
  const dir = fixture({
    'packages/dsh-workbench': { name: 'workbench', version: '0.1.0', private: true },
    'packages/dsh-ssh': { name: 'ssh', version: '0.1.19' },
  })
  try {
    const errors = verifyPackages(packageFiles(dir), '0.1.19')
    assert.equal(errors.length, 2)
    assert.match(errors[0].message, /version 0\.1\.0 does not match tag v0\.1\.19/)
    assert.match(errors[1].message, /private and cannot be published/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('verifyPackages accepts aligned public packages', () => {
  const dir = fixture({
    'packages/dsh-workbench': { name: 'workbench', version: '0.1.19' },
    'packages/skins/miku': { name: 'miku', version: '0.1.19' },
  })
  try {
    assert.deepEqual(verifyPackages(packageFiles(dir), '0.1.19'), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
