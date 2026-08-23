import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  classifyPorcelain, createGitChangesHandler, diffArgsFor, isInsideRoot,
  operationError, parsePorcelainEntry, validateGitPath,
  type GitChangeOperation, type GitFileState,
} from '../src/host/git-changes.ts'
import type { WorkspaceGate } from '../src/host/workspace-gate.ts'

const REPO = path.resolve('C:/repo')

describe('validateGitPath', () => {
  it('rejects absolute, traversal, NUL, drive-letter, UNC, empty, and overlong paths', () => {
    for (const bad of ['', '..', '../outside', 'a/../../b', '..\\win', '/etc/passwd', 'C:/other', 'C:\\other', '\\\\share\\x', `a${String.fromCharCode(0)}b`, 'x'.repeat(5000)]) {
      expect(validateGitPath(REPO, bad).ok, bad).toBe(false)
    }
  })
  it('accepts nested relative paths and normalizes separators', () => {
    const outcome = validateGitPath(REPO, 'src\\deep/a.ts')
    expect(outcome).toEqual({ ok: true, value: 'src/deep/a.ts' })
    expect(validateGitPath(REPO, './a.ts')).toEqual({ ok: true, value: 'a.ts' })
  })
})

describe('isInsideRoot', () => {
  it('accepts self and children, rejects siblings and mixed-separator escapes', () => {
    const base = path.resolve('/ws')
    expect(isInsideRoot(base, base)).toBe(true)
    expect(isInsideRoot(base, path.join(base, 'a'))).toBe(true)
    expect(isInsideRoot(base, path.resolve('/ws2'))).toBe(false)
    expect(isInsideRoot(base, path.join(base, '..', 'ws2'))).toBe(false)
    expect(isInsideRoot('C:/ws', 'C:\\ws\\a')).toBe(process.platform === 'win32')
    expect(isInsideRoot('C:/ws', 'C:\\ws2')).toBe(false)
  })
})

describe('parsePorcelainEntry', () => {
  it('parses the first -z record and skips rename source fields', () => {
    expect(parsePorcelainEntry('M  staged.ts\0 M other.ts\0')).toEqual({ x: 'M', y: ' ', path: 'staged.ts' })
    expect(parsePorcelainEntry('R  new.ts\0old.ts\0')).toEqual({ x: 'R', y: ' ', path: 'new.ts' })
    expect(parsePorcelainEntry('?? new.ts\0')).toEqual({ x: '?', y: '?', path: 'new.ts' })
    expect(parsePorcelainEntry('')).toBeNull()
  })
})

describe('classifyPorcelain', () => {
  it('maps XY pairs to policy states', () => {
    expect(classifyPorcelain('?', '?')).toBe('untracked')
    expect(classifyPorcelain('U', 'U')).toBe('unmerged')
    expect(classifyPorcelain('A', 'A')).toBe('unmerged')
    expect(classifyPorcelain('D', 'D')).toBe('unmerged')
    expect(classifyPorcelain('U', 'A')).toBe('unmerged')
    expect(classifyPorcelain('D', 'U')).toBe('unmerged')
    expect(classifyPorcelain('M', ' ')).toBe('staged')
    expect(classifyPorcelain('A', ' ')).toBe('staged')
    expect(classifyPorcelain(' ', 'M')).toBe('unstaged')
    expect(classifyPorcelain(' ', 'D')).toBe('unstaged')
    expect(classifyPorcelain('M', 'M')).toBe('staged-and-unstaged')
    expect(classifyPorcelain(' ', ' ')).toBe('clean')
  })
})

describe('operationError (server-side write policy)', () => {
  const writes: GitChangeOperation[] = ['stage', 'unstage', 'discard']
  it('refuses every write on unmerged rows but allows diff', () => {
    for (const state of ['unmerged'] satisfies GitFileState[]) {
      for (const op of writes) expect(operationError(state, op)).toBe('conflict-forbidden')
      expect(operationError(state, 'diff')).toBeUndefined()
    }
  })
  it('staged rows unstage only', () => {
    expect(operationError('staged', 'unstage')).toBeUndefined()
    expect(operationError('staged', 'stage')).toBe('not-unstaged')
    expect(operationError('staged', 'discard')).toBe('staged-discard-forbidden')
  })
  it('unstaged rows stage or discard only', () => {
    expect(operationError('unstaged', 'stage')).toBeUndefined()
    expect(operationError('unstaged', 'discard')).toBeUndefined()
    expect(operationError('unstaged', 'unstage')).toBe('not-staged')
  })
  it('untracked rows stage or discard only', () => {
    expect(operationError('untracked', 'stage')).toBeUndefined()
    expect(operationError('untracked', 'discard')).toBeUndefined()
    expect(operationError('untracked', 'unstage')).toBe('not-staged')
  })
  it('partially staged rows refuse discard but allow stage and unstage', () => {
    expect(operationError('staged-and-unstaged', 'discard')).toBe('staged-discard-forbidden')
    expect(operationError('staged-and-unstaged', 'stage')).toBeUndefined()
    expect(operationError('staged-and-unstaged', 'unstage')).toBeUndefined()
  })
  it('clean and missing rows refuse writes', () => {
    for (const op of writes) expect(operationError('clean', op)).toBe('no-changes')
    for (const op of writes) expect(operationError('missing', op)).toBe('not-found')
  })
})

describe('diffArgsFor', () => {
  it('selects the diff flavor from the derived state', () => {
    expect(diffArgsFor('untracked', 'a.ts')).toEqual(['diff', '--no-index', '--', '/dev/null', 'a.ts'])
    expect(diffArgsFor('staged', 'a.ts')).toEqual(['diff', '--cached', '--', ':(literal)a.ts'])
    expect(diffArgsFor('staged-and-unstaged', 'a.ts')).toEqual(['diff', 'HEAD', '--', ':(literal)a.ts'])
    expect(diffArgsFor('unstaged', 'a.ts')).toEqual(['diff', '--', ':(literal)a.ts'])
    expect(diffArgsFor('unmerged', 'a.ts')).toEqual(['diff', '--', ':(literal)a.ts'])
  })
})

interface MockResponse extends ServerResponse { status: number; bodyText: string }

function mockRequest(body: string, method = 'POST', address = '127.0.0.1'): IncomingMessage {
  const req = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage
  Object.defineProperty(req, 'method', { value: method })
  Object.defineProperty(req, 'socket', { value: { remoteAddress: address } })
  return req
}

function mockResponse(): { res: MockResponse; done: Promise<{ status: number; payload: Record<string, unknown> }> } {
  let finish!: (value: { status: number; payload: Record<string, unknown> }) => void
  const done = new Promise<{ status: number; payload: Record<string, unknown> }>((resolve) => { finish = resolve })
  const state = { headersSent: false, status: 0, bodyText: '' }
  const res = {
    get headersSent(): boolean { return state.headersSent },
    get status(): number { return state.status },
    get bodyText(): string { return state.bodyText },
    writeHead(status: number): void { state.status = status; state.headersSent = true },
    end(chunk?: string): void {
      state.bodyText = chunk ?? ''
      finish({ status: state.status, payload: JSON.parse(state.bodyText) as Record<string, unknown> })
    },
  } as unknown as MockResponse
  return { res, done }
}

const admit: WorkspaceGate = async (root) => ({ ok: true, canonical: root })

describe('git-changes route handler', () => {
  let dir = ''
  beforeAll(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-changes-route-')) })
  afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('rejects non-loopback callers', async () => {
    const { res, done } = mockResponse()
    createGitChangesHandler(admit)(mockRequest('{}', 'POST', '10.0.0.5'), res)
    expect(await done).toEqual({ status: 403, payload: { ok: false, error: 'loopback-only' } })
  })

  it('rejects non-POST methods', async () => {
    const { res, done } = mockResponse()
    createGitChangesHandler(admit)(mockRequest('{}', 'GET'), res)
    expect(await done).toEqual({ status: 405, payload: { ok: false, error: 'method-not-allowed' } })
  })

  it('rejects oversized bodies and invalid payloads', async () => {
    const big = mockResponse()
    createGitChangesHandler(admit)(mockRequest(`{"root":"${'x'.repeat(20 * 1024)}"}`), big.res)
    expect((await big.done).status).toBe(400)
    const bad = mockResponse()
    createGitChangesHandler(admit)(mockRequest(JSON.stringify({ root: dir, op: 'explode', path: 'a.ts' })), bad.res)
    expect(await bad.done).toEqual({ status: 400, payload: { ok: false, error: 'invalid-request' } })
    const garbage = mockResponse()
    createGitChangesHandler(admit)(mockRequest('not-json'), garbage.res)
    expect((await garbage.done).status).toBe(400)
  })

  it('rejects workspaces the gate does not admit', async () => {
    const deny: WorkspaceGate = async () => ({ ok: false, error: 'workspace-unknown' })
    const { res, done } = mockResponse()
    createGitChangesHandler(deny)(mockRequest(JSON.stringify({ root: dir, op: 'diff', path: 'a.ts' })), res)
    expect(await done).toEqual({ status: 403, payload: { ok: false, error: 'workspace-unknown' } })
  })

  it('answers not-repository for admitted non-repo roots instead of hanging', async () => {
    const { res, done } = mockResponse()
    createGitChangesHandler(admit)(mockRequest(JSON.stringify({ root: dir, op: 'diff', path: 'a.ts' })), res)
    const result = await done
    expect(result.status).toBe(400)
    expect(result.payload).toEqual({ ok: false, error: 'not-repository' })
  }, 20_000)

  it('answers 500 when the gate itself throws', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwing: WorkspaceGate = async () => { throw new Error('boom') }
    const { res, done } = mockResponse()
    createGitChangesHandler(throwing)(mockRequest(JSON.stringify({ root: dir, op: 'diff', path: 'a.ts' })), res)
    expect(await done).toEqual({ status: 500, payload: { ok: false, error: 'internal-error' } })
    silence.mockRestore()
  })
})
