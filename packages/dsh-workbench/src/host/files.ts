/**
 * Package-owned, read-only, workspace-confined file route for the Workbench
 * Files tab. Follows the git-status route conventions: loopback-only POST,
 * bounded bodies, bounded listings and reads, no shell. All path resolution is
 * structured (node:path + realpath); directory traversal, absolute paths, and
 * symlink escapes are rejected before any fs read.
 * @module dsh-workbench/host/files
 */

import { promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { WorkspaceGate } from './workspace-gate.ts'

const MAX_BODY_BYTES = 16 * 1024
const MAX_PATH_CHARS = 1024
const MAX_ENTRIES = 2_000
const MAX_FILE_BYTES = 256 * 1024
const TIMEOUT_MS = 5_000

export type FilesError =
  | 'loopback-only' | 'method-not-allowed' | 'invalid-request' | 'invalid-root'
  | 'invalid-path' | 'path-escape' | 'not-found' | 'not-file' | 'not-directory'
  | 'workspace-unknown' | 'too-large' | 'binary' | 'timeout' | 'read-failed'

export interface WorkspaceEntry {
  readonly name: string
  readonly kind: 'file' | 'directory'
}

export interface FilesListResult {
  readonly entries: WorkspaceEntry[]
  readonly truncated: boolean
}

export interface FilesReadResult {
  readonly kind: 'text'
  readonly content: string
  readonly truncated: boolean
}

export type FilesOutcome<T> = { ok: true; value: T } | { ok: false; error: FilesError }

/**
 * Resolve a client-supplied relative path inside a workspace root. Rejects
 * absolute paths and any `..` traversal that would leave the root. Pure;
 * performs no fs access.
 */
export function resolveWorkspacePath(root: string, rel: string): FilesOutcome<string> {
  if (typeof root !== 'string' || root.trim() === '' || root.length > 4096) return { ok: false, error: 'invalid-root' }
  if (typeof rel !== 'string' || rel.length > MAX_PATH_CHARS) return { ok: false, error: 'invalid-path' }
  if (rel.includes(String.fromCharCode(0))) return { ok: false, error: 'invalid-path' }
  if (path.isAbsolute(rel) || /^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith('\\\\')) {
    return { ok: false, error: 'path-escape' }
  }
  const segments = rel.split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.')
  if (segments.some((segment) => segment === '..')) return { ok: false, error: 'path-escape' }
  if (segments.some((segment) => segment.toLowerCase() === '.git')) return { ok: false, error: 'invalid-path' }
  const resolved = path.resolve(root, ...segments)
  const base = path.resolve(root)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return { ok: false, error: 'path-escape' }
  return { ok: true, value: resolved }
}

/** True when `target` equals or sits inside `base` (both already resolved). */
export function isContained(base: string, target: string): boolean {
  return target === base || target.startsWith(base + path.sep)
}

async function withTimeout<T>(work: Promise<T>): Promise<FilesOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      work.then((value): FilesOutcome<T> => ({ ok: true, value })),
      new Promise<FilesOutcome<T>>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), TIMEOUT_MS)
      }),
    ])
    return result
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, error: 'not-found' }
    return { ok: false, error: 'read-failed' }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Realpath the target and verify it stays inside the real workspace root. */
async function resolveReal(rootReal: string, root: string, rel: string): Promise<FilesOutcome<string>> {
  const resolved = resolveWorkspacePath(root, rel)
  if (!resolved.ok) return resolved
  return withTimeout(fs.realpath(resolved.value)).then((outcome) => {
    if (!outcome.ok) return outcome
    return isContained(rootReal, outcome.value)
      ? { ok: true, value: outcome.value }
      : { ok: false, error: 'path-escape' as const }
  })
}

/**
 * List one directory of the workspace: directories first, then files, both
 * name-sorted; capped at MAX_ENTRIES with a truncation flag.
 */
export async function listWorkspaceDir(root: string, rel: string): Promise<FilesOutcome<FilesListResult>> {
  const rootRealOutcome = await withTimeout(fs.realpath(root))
  if (!rootRealOutcome.ok) return rootRealOutcome
  const real = await resolveReal(rootRealOutcome.value, root, rel)
  if (!real.ok) return real
  const stat = await withTimeout(fs.stat(real.value))
  if (!stat.ok) return stat
  if (!stat.value.isDirectory()) return { ok: false, error: 'not-directory' }
  const dirents = await withTimeout(fs.readdir(real.value, { withFileTypes: true }))
  if (!dirents.ok) return dirents
  const visible = dirents.value.filter((dirent) => dirent.name.toLowerCase() !== '.git')
  const truncated = visible.length > MAX_ENTRIES
  const entries: WorkspaceEntry[] = visible.slice(0, MAX_ENTRIES).map((dirent: import('node:fs').Dirent) => ({
    name: dirent.name,
    kind: dirent.isDirectory() ? 'directory' : 'file',
  }))
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1))
  return { ok: true, value: { entries, truncated } }
}

/**
 * Read one workspace file as UTF-8 text. Files over MAX_FILE_BYTES are
 * rejected (never partially served); NUL bytes mark binary content.
 */
export async function readWorkspaceFile(root: string, rel: string): Promise<FilesOutcome<FilesReadResult>> {
  const rootRealOutcome = await withTimeout(fs.realpath(root))
  if (!rootRealOutcome.ok) return rootRealOutcome
  const real = await resolveReal(rootRealOutcome.value, root, rel)
  if (!real.ok) return real
  const stat = await withTimeout(fs.stat(real.value))
  if (!stat.ok) return stat
  if (!stat.value.isFile()) return { ok: false, error: 'not-file' }
  if (stat.value.size > MAX_FILE_BYTES) return { ok: false, error: 'too-large' }
  const buffer = await withTimeout(fs.readFile(real.value))
  if (!buffer.ok) return buffer
  if (buffer.value.includes(0)) return { ok: false, error: 'binary' }
  return { ok: true, value: { kind: 'text', content: buffer.value.toString('utf8'), truncated: false } }
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

interface FilesRequest { op?: unknown; root?: unknown; path?: unknown }

async function readBody(req: IncomingMessage): Promise<FilesRequest | undefined> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (typeof value !== 'object' || value === null) return undefined
    return value as FilesRequest
  } catch {
    return undefined
  }
}

/** Register the read-only workspace files route; returns the disposer. */
export function registerFilesRoute(ctx: Context, gate: WorkspaceGate): () => void {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method-not-allowed' }); return }
    void readBody(req).then(async (body) => {
      if (body === undefined) { json(res, 400, { ok: false, error: 'invalid-request' }); return }
      const { op, root, path: rel } = body
      if (typeof root !== 'string' || root.trim() === '' || root.length > 4096) {
        json(res, 400, { ok: false, error: 'invalid-root' }); return
      }
      if (typeof rel !== 'string' || rel.length > MAX_PATH_CHARS) {
        json(res, 400, { ok: false, error: 'invalid-path' }); return
      }
      const admitted = await gate(root)
      if (!admitted.ok) { json(res, 403, { ok: false, error: admitted.error }); return }
      const outcome = op === 'list'
        ? await listWorkspaceDir(admitted.canonical, rel)
        : op === 'read'
          ? await readWorkspaceFile(admitted.canonical, rel)
          : { ok: false as const, error: 'invalid-request' as const }
      json(res, outcome.ok ? 200 : 400, outcome)
    }, () => json(res, 400, { ok: false, error: 'invalid-request' }))
  }
  return ctx.webServer.register({ kind: 'prefix', path: '/dsh-workbench/files', handler })
}
