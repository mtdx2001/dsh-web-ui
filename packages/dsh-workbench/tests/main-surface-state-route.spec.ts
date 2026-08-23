import { createServer, type RequestListener } from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MainSurfaceStateStore, registerMainSurfaceStateRoute } from '../src/host/main-surface-state.ts'

const disposers: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })

async function routeServer(store: MainSurfaceStateStore): Promise<string> {
  let handler: RequestListener | undefined
  const ctx = { webServer: { register: (entry: { handler: RequestListener }) => { handler = entry.handler; return () => {} } } } as any
  registerMainSurfaceStateRoute(ctx, store)
  const server = createServer((req, res) => handler?.(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  disposers.push(async () => { await new Promise<void>((resolve) => server.close(() => resolve())) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('listener unavailable')
  return `http://127.0.0.1:${address.port}/dsh-workbench/main-surface-state`
}

describe('main-surface host persistence', () => {
  it('defaults safely and atomically replaces valid state', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-main-surface-'))
    disposers.push(() => fs.rm(dir, { recursive: true, force: true }))
    const file = path.join(dir, 'state.json')
    const store = new MainSurfaceStateStore(file)
    expect(store.read()).toEqual({ version: 1, activeId: 'agent', defaultId: 'agent', restoreLast: true })
    store.write({ version: 1, activeId: 'dsh-ssh:ssh', defaultId: 'agent', restoreLast: true })
    expect(JSON.parse(await fs.readFile(file, 'utf8')).activeId).toBe('dsh-ssh:ssh')
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    await fs.writeFile(file, '{broken')
    expect(store.read().activeId).toBe('agent')
  })

  it('serves loopback GET/PUT and rejects invalid, oversized, and unsupported requests', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-main-surface-route-'))
    disposers.push(() => fs.rm(dir, { recursive: true, force: true }))
    const url = await routeServer(new MainSurfaceStateStore(path.join(dir, 'state.json')))
    const initial = await fetch(url)
    expect(initial.status).toBe(200)
    expect((await initial.json() as any).value.activeId).toBe('agent')
    const value = { version: 1, activeId: 'dsh-task-board:tasks', defaultId: 'dsh-ssh:ssh', restoreLast: false }
    expect((await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })).status).toBe(200)
    expect((await fetch(url).then((response) => response.json()) as any).value).toEqual(value)
    expect((await fetch(url, { method: 'PUT', body: JSON.stringify({ ...value, activeId: 'bad id' }) })).status).toBe(400)
    expect((await fetch(url, { method: 'PUT', body: 'x'.repeat(1_025) })).status).toBe(413)
    expect((await fetch(url, { method: 'POST' })).status).toBe(405)
  })
})
