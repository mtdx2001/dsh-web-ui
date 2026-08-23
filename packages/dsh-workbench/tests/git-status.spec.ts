import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkbenchGitStatus, readWorkbenchGitStatus } from '../src/host/git-status.ts'

describe('Workbench read-only git status', () => {
  it('parses staged, unstaged, untracked, and renamed rows', () => {
    const status = parseWorkbenchGitStatus('C:\\repo', 'main\n', 'M  staged.ts\0 M unstaged.ts\0?? new.ts\0R  new.ts\0old.ts\0')
    expect(status.branch).toBe('main')
    expect(status.staged).toEqual([
      { path: 'staged.ts', state: 'modified', staged: true },
      { path: 'new.ts', state: 'renamed', staged: true },
    ])
    expect(status.unstaged).toEqual([{ path: 'unstaged.ts', state: 'modified', staged: false }])
    expect(status.untracked).toEqual([{ path: 'new.ts', state: 'untracked', staged: false }])
  })

  it('keeps the rename destination, emits a conflict once, and marks partial staging', () => {
    const status = parseWorkbenchGitStatus('C:\\repo', 'main\n', 'R  new.ts\0old.ts\0UU conflict.ts\0MM partial.ts\0')
    expect(status.staged).toEqual([
      { path: 'new.ts', state: 'renamed', staged: true },
      { path: 'partial.ts', state: 'modified', staged: true },
    ])
    expect(status.unstaged).toEqual([
      { path: 'conflict.ts', state: 'conflicted', staged: false },
      { path: 'partial.ts', state: 'partially-staged', staged: false },
    ])
  })

  it('limits a nested workspace status to that workspace', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-status-scope-'))
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir })
      execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir })
      execFileSync('git', ['config', 'user.email', 'test@invalid'], { cwd: dir })
      await fs.writeFile(path.join(dir, 'baseline.txt'), 'baseline')
      execFileSync('git', ['add', 'baseline.txt'], { cwd: dir })
      execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: dir })
      await fs.mkdir(path.join(dir, 'workspace'))
      await fs.writeFile(path.join(dir, 'outside.txt'), 'outside')
      await fs.writeFile(path.join(dir, 'workspace', 'inside.txt'), 'inside')
      const status = await readWorkbenchGitStatus(path.join(dir, 'workspace'))
      expect(status?.untracked.map((row) => row.path)).toEqual(['inside.txt'])
    } finally {
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
})
