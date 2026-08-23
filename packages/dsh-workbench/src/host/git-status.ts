import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { WorkspaceGate } from './workspace-gate.ts'

const execFileAsync = promisify(execFile)
const MAX_BODY_BYTES = 16 * 1024
const MAX_OUTPUT_BYTES = 512 * 1024
const TIMEOUT_MS = 5_000

function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function readRoot(req: IncomingMessage): Promise<string | undefined> {
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
    const root = (value as { root?: unknown }).root
    return typeof root === 'string' && root.trim() !== '' && root.length <= 4096 ? root : undefined
  } catch {
    return undefined
  }
}

interface ChangeRow { path: string; state: string; staged: boolean }

function stateOf(code: string): string {
  switch (code) {
    case 'A': return 'created'
    case 'M': return 'modified'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'created'
    case 'U': return 'conflicted'
    case '?': return 'untracked'
    default: return 'unknown'
  }
}

export function parseWorkbenchGitStatus(root: string, branch: string, output: string, prefix = ''): {
  root: string
  branch: string
  staged: ChangeRow[]
  unstaged: ChangeRow[]
  untracked: ChangeRow[]
} {
  const staged: ChangeRow[] = []
  const unstaged: ChangeRow[] = []
  const untracked: ChangeRow[] = []
  const fields = output.split('\0')
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (!field) continue
    const x = field[0] ?? ' '
    const y = field[1] ?? ' '
    const repoPath = field.slice(3)
    const path = prefix !== '' && repoPath.startsWith(prefix) ? repoPath.slice(prefix.length) : repoPath
    if (x === '?' && y === '?') {
      untracked.push({ path, state: 'untracked', staged: false })
      continue
    }
    if (x === 'R' || x === 'C') index += 1 // -z emits destination first, then source
    const conflicted = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')
    if (conflicted) {
      unstaged.push({ path, state: 'conflicted', staged: false })
      continue
    }
    if (x !== ' ') staged.push({ path, state: stateOf(x), staged: true })
    if (y !== ' ') unstaged.push({ path, state: x !== ' ' ? 'partially-staged' : stateOf(y), staged: false })
  }
  return { root, branch: branch.trim() || 'HEAD', staged, unstaged, untracked }
}

export async function readWorkbenchGitStatus(root: string): Promise<ReturnType<typeof parseWorkbenchGitStatus> | null> {
  try {
    const options = { cwd: root, encoding: 'utf8' as const, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true }
    const [{ stdout: branch }, { stdout: prefix }, { stdout: porcelain }] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], options),
      execFileAsync('git', ['rev-parse', '--show-prefix'], options),
      execFileAsync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], options),
    ])
    return parseWorkbenchGitStatus(root, branch, porcelain, prefix.trim())
  } catch {
    return null
  }
}

export function registerGitStatusRoute(ctx: Context, gate: WorkspaceGate): () => void {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method-not-allowed' }); return }
    void readRoot(req).then(async (root) => {
      if (root === undefined) { json(res, 400, { ok: false, error: 'invalid-root' }); return }
      const admitted = await gate(root)
      if (!admitted.ok) { json(res, 403, { ok: false, error: admitted.error }); return }
      json(res, 200, { ok: true, value: await readWorkbenchGitStatus(admitted.canonical) })
    }, () => json(res, 400, { ok: false, error: 'invalid-request' }))
  }
  return ctx.webServer.register({ kind: 'prefix', path: '/dsh-workbench/git-status', handler })
}
