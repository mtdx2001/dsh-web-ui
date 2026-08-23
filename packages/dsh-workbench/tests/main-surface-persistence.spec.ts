// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadMainSurfaceState, saveMainSurfaceState } from '../src/client/main-surface-persistence.ts'

const remote = { version: 1 as const, activeId: 'dsh-ssh:ssh', defaultId: 'agent', restoreLast: true }

afterEach(() => vi.unstubAllGlobals())

describe('main-surface persistence client', () => {
  it('loads and validates the host-backed state', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, value: remote }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(loadMainSurfaceState()).resolves.toEqual(remote)
    expect(fetcher).toHaveBeenCalledWith('/dsh-workbench/main-surface-state', expect.objectContaining({ method: 'GET' }))
  })

  it('rejects invalid envelopes and writes only admitted state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })))
    await expect(loadMainSurfaceState()).resolves.toBeUndefined()
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(saveMainSurfaceState(remote)).resolves.toBe(true)
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(remote)
    await expect(saveMainSurfaceState({ ...remote, activeId: 'bad id' })).resolves.toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
