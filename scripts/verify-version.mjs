#!/usr/bin/env node
/**
 * Verify every publishable family package matches the release tag and is not
 * marked private. The tag is the single version source of truth for the
 * dsh-web-ui release pipeline; any mismatch fails before npm publish.
 *
 * Usage: node scripts/verify-version.mjs <x.y.z|vX.Y.Z>
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

/** Every package.json under packages/ and packages/skins/, non-recursive. */
export function packageFiles(cwd = REPO_ROOT) {
  const out = []
  for (const root of ['packages', join('packages', 'skins')]) {
    const abs = join(cwd, root)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs)) {
      const pkgPath = join(abs, entry, 'package.json')
      if (existsSync(pkgPath)) out.push(pkgPath)
    }
  }
  return out.sort()
}

/** Return release-blocking diagnostics without printing or exiting. */
export function verifyPackages(files, version) {
  const errors = []
  for (const file of files) {
    let pkg
    try {
      pkg = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      errors.push({ file, message: `unreadable package.json (${error instanceof Error ? error.message : String(error)})` })
      continue
    }
    if (pkg.version !== version) errors.push({ file, message: `version ${pkg.version} does not match tag v${version}` })
    if (pkg.private === true) errors.push({ file, message: 'package is private and cannot be published' })
  }
  return errors
}

function main() {
  const tag = process.argv[2] ?? ''
  const match = /^v?(\d+\.\d+\.\d+)$/.exec(tag)
  if (match === null) {
    console.error('usage: node scripts/verify-version.mjs <x.y.z | vX.Y.Z>')
    process.exit(2)
  }
  const version = match[1]
  const files = packageFiles()
  if (files.length === 0) {
    console.error('no package.json found under packages/')
    process.exit(1)
  }
  const errors = verifyPackages(files, version)
  for (const error of errors) console.error(`::error file=${error.file}::${error.message}`)
  if (errors.length > 0) process.exit(1)
  console.log(`[verify-version] all ${files.length} packages are publishable at v${version}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
