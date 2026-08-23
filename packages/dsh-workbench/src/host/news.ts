import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const NEWS_MAX_BYTES = 512 * 1024
export const NEWS_TIMEOUT_MS = 10_000

export interface NewsSourceConfig {
  id: string
  label: string
  url: string
}

interface NewsPayload {
  id: string
  label: string
  contentType: string
  content: string
}

interface ResolvedSource extends NewsSourceConfig {
  target: URL
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

export function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

export function resolveNewsSources(configured: readonly NewsSourceConfig[]): ResolvedSource[] {
  const ids = new Set<string>()
  return configured.map((source) => {
    if (!/^[a-z][a-z0-9-]{0,47}$/.test(source.id) || ids.has(source.id)) throw new Error(`workbench news source has invalid or duplicate id: ${source.id}`)
    ids.add(source.id)
    const target = new URL(source.url)
    if (target.protocol !== 'https:' || (target.port !== '' && target.port !== '443') || target.username !== '' || target.password !== '') {
      throw new Error(`workbench news source ${source.id} must be an HTTPS URL without credentials or a custom port`)
    }
    if (source.label.trim() === '') throw new Error(`workbench news source ${source.id} must have a label`)
    return { ...source, label: source.label.trim(), target }
  })
}

async function fetchSource(source: ResolvedSource): Promise<NewsPayload> {
  const records = await lookup(source.target.hostname, { all: true, verbatim: true })
  const address = records.find((record) => record.family === 4 && isPublicIpv4(record.address))?.address
  if (address === undefined) throw new Error('source hostname has no permitted public IPv4 address')

  return await new Promise<NewsPayload>((resolve, reject) => {
    const req = httpsRequest({
      protocol: 'https:',
      hostname: address,
      port: 443,
      servername: source.target.hostname,
      method: 'GET',
      path: `${source.target.pathname}${source.target.search}`,
      headers: {
        host: source.target.host,
        accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9',
        'user-agent': 'dsh-workbench/0.1',
      },
      timeout: NEWS_TIMEOUT_MS,
    }, (response) => {
      const status = response.statusCode ?? 500
      if (status >= 300 && status < 400) {
        response.resume()
        reject(new Error('redirects are not allowed'))
        return
      }
      if (status < 200 || status >= 300) {
        response.resume()
        reject(new Error(`source returned HTTP ${status}`))
        return
      }
      const declared = Number(response.headers['content-length'] ?? 0)
      if (Number.isFinite(declared) && declared > NEWS_MAX_BYTES) {
        response.destroy()
        reject(new Error('source response is too large'))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > NEWS_MAX_BYTES) {
          response.destroy(new Error('source response is too large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({
        id: source.id,
        label: source.label,
        contentType: String(response.headers['content-type'] ?? 'application/xml'),
        content: Buffer.concat(chunks).toString('utf8'),
      }))
      response.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('source request timed out')))
    req.on('error', reject)
    req.end()
  })
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function registerNewsRoutes(ctx: Context, configured: readonly NewsSourceConfig[]): () => void {
  const sources = resolveNewsSources(configured)
  const byId = new Map(sources.map((source) => [source.id, source]))
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    if (!isLoopbackRequest(req)) {
      json(res, 403, { ok: false, error: 'loopback-only' })
      return
    }
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'method-not-allowed' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://workbench.local')
    if (url.pathname === '/dsh-workbench/news/sources') {
      json(res, 200, { ok: true, value: sources.map(({ id, label }) => ({ id, label })) })
      return
    }
    if (url.pathname !== '/dsh-workbench/news') {
      json(res, 404, { ok: false, error: 'not-found' })
      return
    }
    const id = url.searchParams.get('source') ?? ''
    const source = byId.get(id)
    if (source === undefined) {
      json(res, 404, { ok: false, error: 'source-not-found' })
      return
    }
    void fetchSource(source).then(
      (payload) => json(res, 200, { ok: true, value: payload }),
      (error: unknown) => json(res, 502, { ok: false, error: error instanceof Error ? error.message : 'source-fetch-failed' }),
    )
  }
  return ctx.webServer.register({ kind: 'prefix', path: '/dsh-workbench/news', handler })
}
