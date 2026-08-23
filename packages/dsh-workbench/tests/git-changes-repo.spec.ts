import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { executeGitChange } from '../src/host/git-changes.ts'

const gitAvailable = (() => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
})()

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
}

async function initRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-changes-repo-'))
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'core.autocrlf', 'false'])
  await fs.writeFile(path.join(dir, 'a.txt'), 'one\ntwo\nthree\n')
  await fs.mkdir(path.join(dir, 'sub'))
  await fs.writeFile(path.join(dir, 'sub', 'b.txt'), 'bee\n')
  git(dir, ['add', '.'])
  git(dir, ['commit', '-qm', 'init'])
  return dir
}

describe.skipIf(!gitAvailable)('git-changes against a real temp repository', () => {
  let repos: string[] = []
  beforeAll(() => { repos = [] })
  afterEach(async () => {
    for (const repo of repos.splice(0)) await fs.rm(repo, { recursive: true, force: true })
  })
  const repo = async (): Promise<string> => {
    const dir = await initRepo()
    repos.push(dir)
    return dir
  }

  it('diffs an unstaged modification with bounded unified output', async () => {
    const dir = await repo()
    await fs.writeFile(path.join(dir, 'a.txt'), 'one\ntwo changed\nthree\n')
    const outcome = await executeGitChange(dir, { op: 'diff', path: 'a.txt' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.value.content).toContain('@@')
    expect(outcome.value.content).toContain('+two changed')
    expect(outcome.value.truncated).toBe(false)
  }, 30_000)

  it('stages and unstages through server-derived state, refusing mismatched ops', async () => {
    const dir = await repo()
    await fs.writeFile(path.join(dir, 'a.txt'), 'changed\n')
    expect(await executeGitChange(dir, { op: 'unstage', path: 'a.txt' })).toEqual({ ok: false, error: 'not-staged' })
    expect((await executeGitChange(dir, { op: 'stage', path: 'a.txt' })).ok).toBe(true)
    expect(git(dir, ['status', '--porcelain'])).toContain('M  a.txt')
    expect(await executeGitChange(dir, { op: 'stage', path: 'a.txt' })).toEqual({ ok: false, error: 'not-unstaged' })
    expect(await executeGitChange(dir, { op: 'discard', path: 'a.txt' })).toEqual({ ok: false, error: 'staged-discard-forbidden' })
    expect((await executeGitChange(dir, { op: 'unstage', path: 'a.txt' })).ok).toBe(true)
    expect(git(dir, ['status', '--porcelain'])).toContain(' M a.txt')
  }, 30_000)

  it('shows the staged diff after staging and the HEAD diff when partially staged', async () => {
    const dir = await repo()
    await fs.writeFile(path.join(dir, 'a.txt'), 'staged\n')
    await executeGitChange(dir, { op: 'stage', path: 'a.txt' })
    const staged = await executeGitChange(dir, { op: 'diff', path: 'a.txt' })
    expect(staged.ok && staged.value.content).toContain('+staged')
    await fs.writeFile(path.join(dir, 'a.txt'), 'staged\nplus worktree\n')
    const both = await executeGitChange(dir, { op: 'diff', path: 'a.txt' })
    expect(both.ok && both.value.content).toContain('+plus worktree')
  }, 30_000)

  it('discards an unstaged worktree modification, restoring committed content', async () => {
    const dir = await repo()
    await fs.writeFile(path.join(dir, 'sub/b.txt'), 'dirty\n')
    expect((await executeGitChange(dir, { op: 'discard', path: 'sub/b.txt' })).ok).toBe(true)
    await expect(fs.readFile(path.join(dir, 'sub', 'b.txt'), 'utf8')).resolves.toBe('bee\n')
  }, 30_000)

  it('stages an untracked file and diffs it against the empty file', async () => {
    const dir = await repo()
    await fs.writeFile(path.join(dir, 'new.txt'), 'fresh\n')
    const diff = await executeGitChange(dir, { op: 'diff', path: 'new.txt' })
    expect(diff.ok).toBe(true)
    if (diff.ok) {
      expect(diff.value.content).toContain('new file mode')
      expect(diff.value.content).toContain('+fresh')
    }
    expect((await executeGitChange(dir, { op: 'stage', path: 'new.txt' })).ok).toBe(true)
    expect(git(dir, ['status', '--porcelain'])).toContain('A  new.txt')
  }, 30_000)

  it('deletes a single untracked file and refuses untracked directories', async () => {
    const dir = await repo()
    await fs.writeFile(path.join(dir, 'loose.txt'), 'x\n')
    expect((await executeGitChange(dir, { op: 'discard', path: 'loose.txt' })).ok).toBe(true)
    await expect(fs.stat(path.join(dir, 'loose.txt'))).rejects.toThrow()
    await fs.mkdir(path.join(dir, 'bundle'))
    await fs.writeFile(path.join(dir, 'bundle', 'inner.txt'), 'y\n')
    expect(await executeGitChange(dir, { op: 'discard', path: 'bundle' })).toEqual({ ok: false, error: 'is-directory' })
    await expect(fs.stat(path.join(dir, 'bundle', 'inner.txt'))).resolves.toBeTruthy()
  }, 30_000)

  it('deletes an untracked symlink, never its target', async () => {
    const dir = await repo()
    let linked = true
    try {
      await fs.symlink(path.join(dir, 'a.txt'), path.join(dir, 'link.txt'))
    } catch {
      linked = false // platform without symlink privilege: skip gracefully
    }
    if (!linked) return
    const outcome = await executeGitChange(dir, { op: 'discard', path: 'link.txt' })
    expect(outcome.ok).toBe(true)
    await expect(fs.lstat(path.join(dir, 'link.txt'))).rejects.toThrow()
    await expect(fs.readFile(path.join(dir, 'a.txt'), 'utf8')).resolves.toContain('one')
  }, 30_000)

  it('refuses every write operation on a merge-conflicted file', async () => {
    const dir = await repo()
    git(dir, ['checkout', '-qb', 'side'])
    await fs.writeFile(path.join(dir, 'a.txt'), 'side\n')
    git(dir, ['commit', '-qam', 'side'])
    git(dir, ['checkout', '-q', 'main'])
    await fs.writeFile(path.join(dir, 'a.txt'), 'main\n')
    git(dir, ['commit', '-qam', 'main'])
    try { git(dir, ['merge', 'side']) } catch { /* merge conflicts exit non-zero */ }
    expect(git(dir, ['status', '--porcelain'])).toContain('UU a.txt')
    for (const op of ['stage', 'unstage', 'discard'] as const) {
      expect(await executeGitChange(dir, { op, path: 'a.txt' })).toEqual({ ok: false, error: 'conflict-forbidden' })
    }
    const diff = await executeGitChange(dir, { op: 'diff', path: 'a.txt' })
    expect(diff.ok).toBe(true)
  }, 30_000)

  it('rejects path escape, absolute paths, and clean files', async () => {
    const dir = await repo()
    expect(await executeGitChange(dir, { op: 'diff', path: '../outside.txt' })).toEqual({ ok: false, error: 'invalid-path' })
    expect(await executeGitChange(dir, { op: 'diff', path: 'C:/Windows/win.ini' })).toEqual({ ok: false, error: 'invalid-path' })
    expect(await executeGitChange(dir, { op: 'stage', path: 'a.txt' })).toEqual({ ok: false, error: 'no-changes' })
    const clean = await executeGitChange(dir, { op: 'diff', path: 'a.txt' })
    expect(clean.ok && clean.value.content).toBe('')
  }, 30_000)

  it('keeps writes inside an admitted workspace nested below the repository root', async () => {
    const dir = await repo()
    await fs.writeFile(path.join(dir, 'outside.txt'), 'outside\n')
    await fs.writeFile(path.join(dir, 'sub', 'inside.txt'), 'inside\n')
    expect(await executeGitChange(path.join(dir, 'sub'), { op: 'stage', path: '../outside.txt' }))
      .toEqual({ ok: false, error: 'invalid-path' })
    expect((await executeGitChange(path.join(dir, 'sub'), { op: 'stage', path: 'inside.txt' })).ok).toBe(true)
    expect(git(dir, ['status', '--porcelain'])).toContain('A  sub/inside.txt')
    expect(git(dir, ['status', '--porcelain'])).toContain('?? outside.txt')
  }, 30_000)

  it('reports not-repository for directories outside git', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-changes-plain-'))
    repos.push(plain)
    await fs.writeFile(path.join(plain, 'x.txt'), 'x')
    expect(await executeGitChange(plain, { op: 'diff', path: 'x.txt' })).toEqual({ ok: false, error: 'not-repository' })
  }, 30_000)

  it('reports missing for paths that exist neither in git nor on disk', async () => {
    const dir = await repo()
    expect(await executeGitChange(dir, { op: 'stage', path: 'ghost.txt' })).toEqual({ ok: false, error: 'not-found' })
  }, 30_000)
})
