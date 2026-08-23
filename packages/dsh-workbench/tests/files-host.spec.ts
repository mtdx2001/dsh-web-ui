import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  isContained, listWorkspaceDir, readWorkspaceFile, resolveWorkspacePath,
} from '../src/host/files.ts'

describe('resolveWorkspacePath', () => {
  const root = path.resolve('C:/ws')
  it('rejects dot-dot traversal and absolute paths', () => {
    expect(resolveWorkspacePath(root, '..').ok).toBe(false)
    expect(resolveWorkspacePath(root, '../outside').ok).toBe(false)
    expect(resolveWorkspacePath(root, 'a/../../b').ok).toBe(false)
    expect(resolveWorkspacePath(root, '..\\win').ok).toBe(false)
    expect(resolveWorkspacePath(root, '/etc/passwd').ok).toBe(false)
    expect(resolveWorkspacePath(root, 'C:/other').ok).toBe(false)
    expect(resolveWorkspacePath(root, 'C:\\other').ok).toBe(false)
    expect(resolveWorkspacePath(root, '\\\\share\\x').ok).toBe(false)
  })
  it('accepts nested relative paths inside the root', () => {
    const outcome = resolveWorkspacePath(root, 'src/a.ts')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.value).toBe(path.join(root, 'src', 'a.ts'))
  })
  it('rejects overlong and NUL-containing paths', () => {
    expect(resolveWorkspacePath(root, 'x'.repeat(2000)).ok).toBe(false)
    expect(resolveWorkspacePath(root, `a${String.fromCharCode(0)}b`)).toEqual({ ok: false, error: 'invalid-path' })
  })
})

describe('isContained', () => {
  it('accepts self and children, rejects siblings with shared prefixes', () => {
    const base = path.resolve('/ws')
    expect(isContained(base, base)).toBe(true)
    expect(isContained(base, path.join(base, 'a'))).toBe(true)
    expect(isContained(base, path.resolve('/ws2'))).toBe(false)
  })
})

describe('workspace files host (tmp tree)', () => {
  let dir = ''
  let outside = ''
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-files-'))
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-files-out-'))
    await fs.mkdir(path.join(dir, 'sub'))
    await fs.mkdir(path.join(dir, '.git'))
    await fs.writeFile(path.join(dir, '.git', 'config'), 'private repository metadata')
    await fs.writeFile(path.join(dir, '.env.example'), 'SAFE_EXAMPLE=true')
    await fs.writeFile(path.join(dir, 'sub', 'a.txt'), 'hello')
    await fs.writeFile(path.join(dir, 'b.txt'), 'world')
    await fs.writeFile(path.join(dir, 'bin.dat'), Buffer.from([0, 1, 2]))
    await fs.writeFile(path.join(dir, 'big.txt'), 'x'.repeat(256 * 1024 + 1))
    await fs.writeFile(path.join(outside, 'secret.txt'), 'secret')
    try {
      await fs.symlink(outside, path.join(dir, 'escape'), 'junction')
    } catch { /* platform without symlink permission: escape test skips */ }
  })
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
    await fs.rm(outside, { recursive: true, force: true })
  })

  it('lists directories first with sorted entries', async () => {
    const outcome = await listWorkspaceDir(dir, '')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const names = outcome.value.entries.map((entry) => entry.name)
    expect(names[0]).toBe('sub')
    expect(outcome.value.entries[0].kind).toBe('directory')
    expect(names.slice(1)).toEqual(['.env.example', 'b.txt', 'big.txt', 'bin.dat', 'escape'].sort())
    expect(names).not.toContain('.git')
    expect(outcome.value.truncated).toBe(false)
  })

  it('hides and rejects repository metadata while preserving ordinary dotfiles', async () => {
    expect(resolveWorkspacePath(dir, '.git/config')).toEqual({ ok: false, error: 'invalid-path' })
    expect(resolveWorkspacePath(dir, 'nested/.GIT/config')).toEqual({ ok: false, error: 'invalid-path' })
    expect(await readWorkspaceFile(dir, '.git/config')).toEqual({ ok: false, error: 'invalid-path' })
    const dotfile = await readWorkspaceFile(dir, '.env.example')
    expect(dotfile.ok).toBe(true)
    if (dotfile.ok) expect(dotfile.value.content).toBe('SAFE_EXAMPLE=true')
  })

  it('reads a text file inside the workspace', async () => {
    const outcome = await readWorkspaceFile(dir, 'sub/a.txt')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.value.content).toBe('hello')
  })

  it('rejects traversal, oversized files, and binary content', async () => {
    expect((await readWorkspaceFile(dir, '../x')).ok).toBe(false)
    const big = await readWorkspaceFile(dir, 'big.txt')
    expect(big.ok).toBe(false)
    if (!big.ok) expect(big.error).toBe('too-large')
    const bin = await readWorkspaceFile(dir, 'bin.dat')
    expect(bin.ok).toBe(false)
    if (!bin.ok) expect(bin.error).toBe('binary')
  })

  it('rejects symlink escapes pointing outside the workspace', async () => {
    const hasLink = await fs.stat(path.join(dir, 'escape')).then(() => true, () => false)
    if (!hasLink) return
    const listed = await listWorkspaceDir(dir, 'escape')
    expect(listed.ok).toBe(false)
    if (!listed.ok) expect(listed.error).toBe('path-escape')
    const read = await readWorkspaceFile(dir, 'escape/secret.txt')
    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.error).toBe('path-escape')
  })

  it('caps directory entries at the bound with a truncation flag', async () => {
    const many = path.join(dir, 'many')
    await fs.mkdir(many)
    for (let index = 0; index < 2005; index += 1) {
      await fs.writeFile(path.join(many, `f${String(index).padStart(4, '0')}.txt`), '')
    }
    const outcome = await listWorkspaceDir(dir, 'many')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.value.entries).toHaveLength(2000)
    expect(outcome.value.truncated).toBe(true)
  }, 20_000)
})
