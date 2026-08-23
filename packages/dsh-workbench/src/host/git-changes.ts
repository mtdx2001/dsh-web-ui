/**
 * Package-owned, loopback-only git change route behind the Changes tab. The
 * server re-derives every file's porcelain state itself and enforces the
 * write policy (staged rows unstage only; unstaged rows stage or discard;
 * untracked rows stage or single-file delete; unmerged rows refuse all
 * writes). Client-supplied state hints are never trusted. All git invocation
 * is execFile with `--` and `:(literal)` pathspecs — no shell. Untracked
 * delete realpaths the parent directory and removes the final component
 * without following it, so a symlink inside the repo loses the link, never
 * the target.
 * @module dsh-workbench/host/git-changes
 */

import { execFile } from 'node:child_process'
import { lstat, realpath, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { WorkspaceGate } from './workspace-gate.ts'

const execFileAsync = promisify(execFile)
const MAX_BODY_BYTES = 16 * 1024
const MAX_OUTPUT_BYTES = 1024 * 1024
const MAX_DIFF_BYTES = 512 * 1024
const TIMEOUT_MS = 10_000

export type GitChangeOperation = 'diff' | 'stage' | 'unstage' | 'discard'

export interface GitChangeRequest {
  readonly root: string
  readonly op: GitChangeOperation
  readonly path: string
}

export type GitFileState =
  | 'staged' | 'unstaged' | 'staged-and-unstaged' | 'untracked'
  | 'unmerged' | 'clean' | 'missing'

export type GitChangeError =
  | 'loopback-only' | 'method-not-allowed' | 'invalid-request' | 'invalid-path'
  | 'path-outside-root' | 'workspace-unknown' | 'not-repository' | 'not-found'
  | 'no-changes' | 'conflict-forbidden' | 'staged-discard-forbidden'
  | 'not-staged' | 'not-unstaged' | 'is-directory' | 'delete-failed'
  | 'timeout' | 'output-too-large' | 'git-unavailable' | 'git-failed'
  | 'internal-error'

export type GitChangeOutcome<T> = { ok: true; value: T } | { ok: false; error: GitChangeError }

/** True when `candidate` equals or sits inside `root` (both separators normalized). */
export function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  if (rel === '') return true
  if (isAbsolute(rel)) return false
  return !rel.split(/[\\/]+/).some((part) => part === '..')
}

/**
 * Validate a client-supplied repo-relative path. Rejects empty, overlong,
 * NUL-containing, absolute, drive-letter, UNC, and `..` traversal input.
 * Pure; performs no fs access. Returns the `/`-normalized relative path.
 */
export function validateGitPath(repo: string, rel: string): GitChangeOutcome<string> {
  if (typeof rel !== 'string' || rel === '' || rel.length > 4096 || rel.includes(String.fromCharCode(0))) {
    return { ok: false, error: 'invalid-path' }
  }
  if (isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel) || rel.startsWith('\\\\') || rel.startsWith('//')) {
    return { ok: false, error: 'invalid-path' }
  }
  const segments = rel.split(/[\\/]+/).filter((part) => part !== '' && part !== '.')
  if (segments.length === 0 || segments.some((part) => part === '..')) {
    return { ok: false, error: 'invalid-path' }
  }
  const absolute = resolve(repo, ...segments)
  return isInsideRoot(repo, absolute)
    ? { ok: true, value: segments.join('/') }
    : { ok: false, error: 'path-outside-root' }
}

/** Parse the first record of `git status --porcelain=v1 -z` output. Pure. */
export function parsePorcelainEntry(output: string): { x: string; y: string; path: string } | null {
  const fields = output.split('\0')
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (!field) continue
    const x = field[0] ?? ' '
    const y = field[1] ?? ' '
    if (x === 'R' || x === 'C') index += 1 // rename/copy records carry the source path next
    return { x, y, path: field.slice(3) }
  }
  return null
}

/** Classify one porcelain XY pair into the policy state. Pure. */
export function classifyPorcelain(x: string, y: string): GitFileState {
  if (x === '?' || y === '?') return 'untracked'
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return 'unmerged'
  const staged = x !== ' '
  const unstaged = y !== ' '
  if (staged && unstaged) return 'staged-and-unstaged'
  if (staged) return 'staged'
  if (unstaged) return 'unstaged'
  return 'clean'
}

/**
 * Server-side write policy. Returns the refusal error for a forbidden
 * operation, or undefined when allowed. `diff` is read-only and always
 * allowed. Pure.
 */
export function operationError(state: GitFileState, op: GitChangeOperation): GitChangeError | undefined {
  if (op === 'diff') return undefined
  if (state === 'unmerged') return 'conflict-forbidden'
  if (state === 'missing') return 'not-found'
  if (state === 'clean') return 'no-changes'
  if (op === 'discard' && (state === 'staged' || state === 'staged-and-unstaged')) return 'staged-discard-forbidden'
  if (op === 'unstage' && (state === 'unstaged' || state === 'untracked')) return 'not-staged'
  if (op === 'stage' && state === 'staged') return 'not-unstaged'
  return undefined
}

/** Diff argv for a derived state; untracked files diff against /dev/null. Pure. */
export function diffArgsFor(state: GitFileState, path: string): string[] {
  const pathspec = `:(literal)${path}`
  if (state === 'untracked') return ['diff', '--no-index', '--', '/dev/null', path]
  if (state === 'staged') return ['diff', '--cached', '--', pathspec]
  if (state === 'staged-and-unstaged') return ['diff', 'HEAD', '--', pathspec]
  return ['diff', '--', pathspec]
}

type RunResult =
  | { kind: 'done'; code: number; stdout: string }
  | { kind: 'timeout' }
  | { kind: 'output-too-large'; stdout: string }
  | { kind: 'unavailable' }

async function runGit(cwd: string, args: string[], maxBuffer: number = MAX_OUTPUT_BYTES): Promise<RunResult> {
  try {
    const result = await execFileAsync('git', args, { cwd, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer, windowsHide: true })
    return { kind: 'done', code: 0, stdout: result.stdout }
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; killed?: boolean; signal?: string | null; message?: string }
    if (failure.code === 'ENOENT') return { kind: 'unavailable' }
    if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      || (typeof failure.message === 'string' && failure.message.includes('maxBuffer'))) {
      return { kind: 'output-too-large', stdout: failure.stdout ?? '' }
    }
    if (failure.killed === true && failure.signal != null) return { kind: 'timeout' }
    return { kind: 'done', code: typeof failure.code === 'number' ? failure.code : 1, stdout: failure.stdout ?? '' }
  }
}

function runFailure(result: RunResult & { kind: 'timeout' | 'output-too-large' | 'unavailable' }): GitChangeOutcome<never> {
  return { ok: false, error: result.kind === 'timeout' ? 'timeout' : result.kind === 'unavailable' ? 'git-unavailable' : 'output-too-large' }
}

/** Resolve the realpathed toplevel containing the admitted root; reject worktree escape. */
async function repoOf(root: string): Promise<string | undefined> {
  const result = await runGit(root, ['rev-parse', '--show-toplevel'])
  if (result.kind !== 'done' || result.code !== 0) return undefined
  const printed = result.stdout.trim()
  if (printed === '') return undefined
  const canonical = await realpath(printed).catch(() => undefined)
  if (canonical === undefined || !isInsideRoot(canonical, root)) return undefined
  return canonical
}

/** Convert a workspace-relative UI path to a repo-relative literal pathspec. */
function repoPathOf(repo: string, workspaceRoot: string, path: string): GitChangeOutcome<string> {
  const checked = validateGitPath(workspaceRoot, path)
  if (!checked.ok) return checked
  const absolute = resolve(workspaceRoot, ...checked.value.split('/'))
  if (!isInsideRoot(workspaceRoot, absolute)) return { ok: false, error: 'path-outside-root' }
  const repoRelative = relative(repo, absolute)
  if (repoRelative === '' || isAbsolute(repoRelative) || repoRelative.split(/[\\/]+/).some((part) => part === '..')) {
    return { ok: false, error: 'path-outside-root' }
  }
  return { ok: true, value: repoRelative.split(/[\\/]+/).join('/') }
}

/** Derive the file's state from porcelain output scoped to its pathspec; never trust the client. */
async function deriveState(repo: string, path: string): Promise<GitChangeOutcome<GitFileState>> {
  const status = await runGit(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', `:(literal)${path}`])
  if (status.kind !== 'done') return runFailure(status)
  if (status.code !== 0) return { ok: false, error: 'git-failed' }
  const entry = parsePorcelainEntry(status.stdout)
  if (entry !== null) return { ok: true, value: classifyPorcelain(entry.x, entry.y) }
  const tracked = await runGit(repo, ['ls-files', '--error-unmatch', '--', `:(literal)${path}`])
  if (tracked.kind !== 'done') return runFailure(tracked)
  if (tracked.code === 0) return { ok: true, value: 'clean' }
  const stat = await lstat(join(repo, ...path.split('/'))).catch(() => undefined)
  return { ok: true, value: stat === undefined ? 'missing' : 'untracked' }
}

async function diffFile(repo: string, path: string, state: GitFileState): Promise<GitChangeOutcome<{ content: string; truncated: boolean }>> {
  const result = await runGit(repo, diffArgsFor(state, path), MAX_DIFF_BYTES)
  if (result.kind === 'output-too-large') return { ok: true, value: { content: result.stdout, truncated: true } }
  if (result.kind !== 'done') return runFailure(result)
  // diff exits 0 (no differences) or 1 (differences; also --no-index), >1 on error.
  return result.code <= 1
    ? { ok: true, value: { content: result.stdout, truncated: false } }
    : { ok: false, error: 'git-failed' }
}

async function runWrite(repo: string, args: string[]): Promise<GitChangeOutcome<Record<string, never>>> {
  const result = await runGit(repo, args)
  if (result.kind !== 'done') return runFailure(result)
  return result.code === 0 ? { ok: true, value: {} } : { ok: false, error: 'git-failed' }
}

/**
 * Delete one untracked file. The parent directory is realpathed and verified
 * inside the repo, then the final component is removed without following it:
 * a symlink loses the link, never its target. Directories are refused
 * (recursive stays false) and rm failures become structured errors.
 */
async function deleteUntracked(repo: string, path: string): Promise<GitChangeOutcome<Record<string, never>>> {
  const absolute = join(repo, ...path.split('/'))
  const canonicalParent = await realpath(dirname(absolute)).catch(() => undefined)
  if (canonicalParent === undefined || !isInsideRoot(repo, canonicalParent)) {
    return { ok: false, error: 'path-outside-root' }
  }
  const target = join(canonicalParent, basename(absolute))
  const stat = await lstat(target).catch(() => undefined)
  if (stat === undefined) return { ok: false, error: 'not-found' }
  if (stat.isDirectory()) return { ok: false, error: 'is-directory' }
  try {
    await rm(target, { recursive: false })
    return { ok: true, value: {} }
  } catch {
    return { ok: false, error: 'delete-failed' }
  }
}

/**
 * Execute one validated change request against the repository containing the
 * admitted workspace root. The state is re-derived per request and the write
 * policy is enforced server-side.
 */
export async function executeGitChange(
  root: string,
  payload: { op: GitChangeOperation; path: string },
): Promise<GitChangeOutcome<{ content?: string; truncated?: boolean }>> {
  const repo = await repoOf(root)
  if (repo === undefined) return { ok: false, error: 'not-repository' }
  const checked = repoPathOf(repo, root, payload.path)
  if (!checked.ok) return checked
  const path = checked.value
  const state = await deriveState(repo, path)
  if (!state.ok) return state
  if (payload.op === 'diff') return diffFile(repo, path, state.value)
  const refusal = operationError(state.value, payload.op)
  if (refusal !== undefined) return { ok: false, error: refusal }
  if (payload.op === 'stage') return runWrite(repo, ['add', '--', `:(literal)${path}`])
  if (payload.op === 'unstage') return runWrite(repo, ['restore', '--staged', '--', `:(literal)${path}`])
  if (state.value === 'untracked') return deleteUntracked(repo, path)
  return runWrite(repo, ['restore', '--worktree', '--', `:(literal)${path}`])
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function statusForError(error: GitChangeError): number {
  if (error === 'workspace-unknown' || error === 'loopback-only') return 403
  if (error === 'timeout' || error === 'output-too-large' || error === 'git-unavailable' || error === 'git-failed') return 502
  if (error === 'internal-error') return 500
  return 400
}

async function readPayload(req: IncomingMessage): Promise<GitChangeRequest | undefined> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<GitChangeRequest> | null
    if (typeof value !== 'object' || value === null) return undefined
    if (typeof value.root !== 'string' || value.root.trim() === '' || value.root.length > 4096) return undefined
    if (typeof value.path !== 'string') return undefined
    if (!['diff', 'stage', 'unstage', 'discard'].includes(value.op ?? '')) return undefined
    return { root: value.root, path: value.path, op: value.op as GitChangeOperation }
  } catch {
    return undefined
  }
}

/**
 * Build the route handler. The whole async body is wrapped so parse, gate, and
 * execution failures answer with structured JSON instead of hanging the
 * response or leaking an unhandled rejection.
 */
export function createGitChangesHandler(gate: WorkspaceGate): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method-not-allowed' }); return }
    void (async (): Promise<void> => {
      try {
        const payload = await readPayload(req)
        if (payload === undefined) { json(res, 400, { ok: false, error: 'invalid-request' }); return }
        const admitted = await gate(payload.root)
        if (!admitted.ok) { json(res, 403, { ok: false, error: admitted.error }); return }
        const outcome = await executeGitChange(admitted.canonical, payload)
        json(res, outcome.ok ? 200 : statusForError(outcome.error), outcome)
      } catch (error) {
        console.error('[dsh-workbench] git-changes route failed:', error)
        if (!res.headersSent) json(res, 500, { ok: false, error: 'internal-error' })
        else res.end()
      }
    })()
  }
}

/** Register the git-changes route; returns the disposer. */
export function registerGitChangesRoute(ctx: Context, gate: WorkspaceGate): () => void {
  return ctx.webServer.register({ kind: 'prefix', path: '/dsh-workbench/git-changes', handler: createGitChangesHandler(gate) })
}
