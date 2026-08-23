import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

describe('balance rows Workbench contribution', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('publishes only implemented entry points and keeps type-only modules uninjected', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.exports['./invariant']).toBeUndefined()
    expect(manifest.exports['.'].default).toBe('./lib/index.js')
    expect(manifest.exports['./client'].default).toBe('./lib/client.js')
    expect(manifest.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-ui-slots')
  })

  it('registers one independent disclosure row per safe account result', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        accounts: [
          { id: 'primary', label: 'Primary', currency: '¥', state: 'ready', value: 50.16 },
          { id: 'secondary', label: 'Secondary', currency: '$', state: 'not_configured' },
        ],
      }),
    })))
    const registrations: any[] = []
    const disposers: Array<() => void> = []
    const workbench = {
      registerSidebarRow: vi.fn((row: unknown) => {
        registrations.push(row)
        return vi.fn()
      }),
      refreshSidebarRow: vi.fn(),
    }
    const ctx = {
      inject: (_services: string[], callback: (scope: { get(name: string): unknown }) => () => void) => {
        disposers.push(callback({ get: () => workbench }))
      },
      sessions: {
        list: {
          getSnapshot: () => ({ ids: [], byId: {} }),
          subscribe: () => vi.fn(),
        },
      },
      effect: (callback: () => () => void) => { disposers.push(callback()) },
    }

    apply(ctx as any)
    await vi.waitFor(() => expect(registrations).toHaveLength(2))

    expect(registrations.map((row) => ({ id: row.id, slot: row.slot, kind: row.kind, source: row.source }))).toEqual([
      { id: 'balance-primary', slot: 'bottom', kind: 'disclosure', source: 'dsh-balance-rows' },
      { id: 'balance-secondary', slot: 'bottom', kind: 'disclosure', source: 'dsh-balance-rows' },
    ])
    for (const row of registrations) {
      expect(row.builtin).toBe(false)
      expect(row.removable).toBe(true)
      expect(typeof row.details).toBe('function')
      expect(typeof row.expanded).toBe('function')
      expect(typeof row.onToggle).toBe('function')
      expect('credential' in row).toBe(false)
      expect('token' in row).toBe(false)
      expect('metadata' in row).toBe(false)
    }

    for (const dispose of disposers.reverse()) dispose()
  })
})
