#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const VERSION_RE = /^\d+\.\d+\.\d+$/
const ENGINE = '>=0.1.1-rc.1'
const REGISTRY = 'https://registry.npmjs.org/'
const SENSITIVE = /(npm_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|_authToken\s*=|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i
const FORBIDDEN_NAMES = new Set(['.npmrc', '.env', 'credentials.yaml', 'npm_recovery_codes.txt'])

export const packagesFor = (version) => [
  {
    name: '@mtdx2001/dsh-client-ui-workbench',
    file: `mtdx2001-dsh-client-ui-workbench-${version}.tgz`,
  },
  {
    name: '@mtdx2001/dsh-client-ui-balance-rows',
    file: `mtdx2001-dsh-client-ui-balance-rows-${version}.tgz`,
  },
  {
    name: '@mtdx2001/dsh-workbench-suite',
    file: `mtdx2001-dsh-workbench-suite-${version}.tgz`,
  },
]

export const suiteDependenciesFor = (version) => ({
  '@mtdx2001/dsh-client-ui-workbench': version,
  '@mtdx2001/dsh-client-ui-balance-rows': version,
  '@linxin666/dsh-client-ui-aionui-panel': '0.1.19',
  '@linxin666/dsh-client-ui-task-board': '0.1.19',
  '@linxin666/dsh-ssh': '0.1.19',
})

export function integrityFor(file) {
  return `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`
}

function sameRecord(actual, expected) {
  const keys = Object.keys(actual ?? {}).sort()
  const expectedKeys = Object.keys(expected).sort()
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key])
}

function walkFiles(root, dir = root, result = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const relative = path.slice(root.length + 1).split(sep).join('/')
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error(`symbolic link forbidden in tarball: ${relative}`)
    if (stat.isDirectory()) walkFiles(root, path, result)
    else if (stat.isFile()) result.push({ path, relative, size: stat.size })
    else throw new Error(`special file forbidden in tarball: ${relative}`)
  }
  return result
}

function auditExtracted(root, spec, version) {
  const manifestPath = join(root, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== spec.name || manifest.version !== version) {
    throw new Error(`unexpected manifest identity in ${spec.file}`)
  }
  if (manifest.dsh?.engines?.dsh !== ENGINE) throw new Error(`missing DSH engine in ${spec.file}`)
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error(`missing DSH bundle patch in ${spec.file}`)
  if (spec.name === '@mtdx2001/dsh-workbench-suite'
    && !sameRecord(manifest.dependencies, suiteDependenciesFor(version))) {
    throw new Error('unexpected Suite dependencies')
  }

  const files = walkFiles(root)
  if (files.length > 500) throw new Error(`too many files in ${spec.file}: ${files.length}`)
  if (files.some((file) => file.size > 8 * 1024 * 1024)) throw new Error(`oversized file in ${spec.file}`)
  if (files.reduce((sum, file) => sum + file.size, 0) > 16 * 1024 * 1024) throw new Error(`oversized package in ${spec.file}`)
  const names = new Set(files.map((file) => file.relative))
  if (!names.has('cordis.patch.yml') || !names.has('LICENSE')) {
    throw new Error(`required release file missing in ${spec.file}`)
  }
  for (const file of files) {
    const parts = file.relative.split('/')
    if (parts.includes('node_modules') || parts.some((part) => FORBIDDEN_NAMES.has(part))) {
      throw new Error(`forbidden release path in ${spec.file}: ${file.relative}`)
    }
    if (file.size <= 8 * 1024 * 1024) {
      const content = readFileSync(file.path)
      if (!content.includes(0) && SENSITIVE.test(content.toString('utf8'))) {
        throw new Error(`sensitive material in ${spec.file}: ${file.relative}`)
      }
    }
  }
  for (const target of Object.values(manifest.exports ?? {})) {
    const paths = typeof target === 'string' ? [target] : Object.values(target ?? {})
    for (const path of paths) {
      if (typeof path !== 'string' || !path.startsWith('./')) continue
      const relative = path.slice(2)
      const wildcard = relative.indexOf('*')
      const exists = wildcard === -1
        ? names.has(relative)
        : [...names].some((name) => name.startsWith(relative.slice(0, wildcard)))
      if (!exists) throw new Error(`missing exported file in ${spec.file}: ${path}`)
    }
  }
  return manifest
}

export function auditTarball(file, spec, version) {
  const listing = execFileSync('tar', ['-tf', file], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  const verbose = execFileSync('tar', ['-tvf', file], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  if (listing.length === 0) throw new Error(`empty tarball: ${spec.file}`)
  if (verbose.length !== listing.length) throw new Error(`unreadable tar metadata: ${spec.file}`)
  for (let index = 0; index < listing.length; index += 1) {
    const entry = listing[index]
    const normalized = entry.replaceAll('\\', '/')
    const kind = verbose[index][0]
    if (!['-', 'd'].includes(kind)) throw new Error(`unsafe tar entry type in ${spec.file}: ${entry}`)
    if (!normalized.startsWith('package/') || normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new Error(`unsafe tar entry in ${spec.file}: ${entry}`)
    }
  }
  const temp = mkdtempSync(join(tmpdir(), 'workbench-release-'))
  try {
    execFileSync('tar', ['-xf', file, '-C', temp])
    return auditExtracted(join(temp, 'package'), spec, version)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

export function auditRelease(directory, version) {
  if (!VERSION_RE.test(version)) throw new Error(`invalid version: ${version}`)
  return packagesFor(version).map((spec) => {
    const file = resolve(directory, spec.file)
    const manifest = auditTarball(file, spec, version)
    return { ...spec, file, manifest, integrity: integrityFor(file) }
  })
}

export function decidePublication(localIntegrity, registryIntegrity) {
  if (registryIntegrity == null) return 'publish'
  if (registryIntegrity === localIntegrity) return 'skip'
  throw new Error(`registry integrity mismatch: expected ${localIntegrity}, received ${registryIntegrity}`)
}

function registryIntegrity(name, version) {
  const args = ['view', `${name}@${version}`, 'dist.integrity', '--json', `--registry=${REGISTRY}`]
  const result = process.platform === 'win32'
    ? spawnSync(process.execPath, [
        join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        ...args,
      ], { encoding: 'utf8' })
    : spawnSync('npm', args, { encoding: 'utf8' })
  if (result.error) throw new Error(`cannot start npm view for ${name}@${version}: ${result.error.message}`)
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  if (result.status === 0) {
    const value = JSON.parse(stdout)
    if (typeof value !== 'string' || value === '') throw new Error(`empty registry integrity for ${name}@${version}`)
    return value
  }
  if (/E404|No match found|is not in this registry/i.test(`${stdout}\n${stderr}`)) return null
  throw new Error(`npm view failed for ${name}@${version}: ${stderr.trim()}`)
}

export function planRelease(audited, version, view = registryIntegrity) {
  return audited.map((pkg) => ({
    ...pkg,
    action: decidePublication(pkg.integrity, view(pkg.name, version)),
  }))
}

function waitForIntegrity(pkg, version, view, options = {}) {
  const attempts = options.attempts ?? 30
  const delayMs = options.delayMs ?? 10000
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const current = view(pkg.name, version)
    if (current === pkg.integrity) return
    if (current != null && current !== pkg.integrity) {
      throw new Error(`registry integrity mismatch after publish: ${pkg.name}@${version}`)
    }
    if (attempt < attempts && delayMs > 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
    }
  }
  throw new Error(`timed out waiting for npm propagation: ${pkg.name}@${version}`)
}

export function publishRelease(audited, version, options = {}) {
  const view = options.view ?? registryIntegrity
  const publish = options.publish ?? ((pkg) => execFileSync('npm', [
    'publish', pkg.file, '--access', 'public', '--tag', 'latest', `--registry=${REGISTRY}`,
  ], { stdio: 'inherit' }))
  const actions = []
  for (const pkg of audited) {
    const action = decidePublication(pkg.integrity, view(pkg.name, version))
    if (action === 'publish') publish(pkg)
    waitForIntegrity(pkg, version, view, options)
    actions.push({ name: pkg.name, action })
  }
  return actions
}

function main() {
  const command = process.argv[2]
  const directory = process.argv[3]
  const version = process.argv[4]
  if (!['audit', 'plan', 'publish'].includes(command) || !directory || !version) {
    console.error('usage: node scripts/workbench-release.mjs <audit|plan|publish> <tarball-dir> <version>')
    process.exit(2)
  }
  const audited = auditRelease(directory, version)
  if (command === 'audit') {
    for (const pkg of audited) console.log(`[audit] ${pkg.name}@${version} ${pkg.integrity}`)
    return
  }
  if (command === 'plan') {
    for (const item of planRelease(audited, version)) console.log(`[plan] ${item.action} ${item.name}@${version}`)
    return
  }
  for (const item of publishRelease(audited, version)) console.log(`[publish] ${item.action} ${item.name}@${version}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
