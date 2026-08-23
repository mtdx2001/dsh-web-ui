import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { dshHome } from '../dsh-home.ts'
import { DEFAULT_MAIN_SURFACE_STATE, parseMainSurfaceState, parseMainSurfaceStateJson, type MainSurfacePersistedState } from '../core/main-surface-persisted.ts'

export const MAIN_SURFACE_STATE_ROUTE = '/dsh-workbench/main-surface-state'
export const MAIN_SURFACE_STATE_FILE = 'dsh-workbench-main-surface.json'
const MAX_BODY_BYTES = 1_024

function loopback(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export class MainSurfaceStateStore {
  constructor(readonly path: string = join(dshHome(), MAIN_SURFACE_STATE_FILE)) {}

  read(): MainSurfacePersistedState {
    try { return parseMainSurfaceStateJson(readFileSync(this.path, 'utf8')) ?? DEFAULT_MAIN_SURFACE_STATE } catch { return DEFAULT_MAIN_SURFACE_STATE }
  }

  write(value: MainSurfacePersistedState): void {
    const admitted = parseMainSurfaceState(value)
    if (admitted === undefined) throw new Error('invalid-state')
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(admitted)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, this.path)
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('body-too-large')
    chunks.push(buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('invalid-json') }
}

export function registerMainSurfaceStateRoute(ctx: Context, store: MainSurfaceStateStore = new MainSurfaceStateStore()): () => void {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    if (!loopback(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    const url = new URL(req.url ?? '/', 'http://workbench.local')
    if (url.pathname !== MAIN_SURFACE_STATE_ROUTE) { json(res, 404, { ok: false, error: 'not-found' }); return }
    if (req.method === 'GET') { json(res, 200, { ok: true, value: store.read() }); return }
    if (req.method !== 'PUT') { json(res, 405, { ok: false, error: 'method-not-allowed' }); return }
    void readBody(req).then((body) => {
      const admitted = parseMainSurfaceState(body)
      if (admitted === undefined) { json(res, 400, { ok: false, error: 'invalid-state' }); return }
      store.write(admitted)
      json(res, 200, { ok: true, value: admitted })
    }, (error: unknown) => json(res, error instanceof Error && error.message === 'body-too-large' ? 413 : 400, { ok: false, error: error instanceof Error ? error.message : 'invalid-body' }))
  }
  return ctx.webServer.register({ kind: 'prefix', path: MAIN_SURFACE_STATE_ROUTE, handler })
}
