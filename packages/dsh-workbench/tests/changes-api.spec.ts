import { describe, expect, it, vi } from 'vitest'
import { createChangesApi, sanitizeStatus } from '../src/client/changes-api.ts'

describe('sanitizeStatus', () => {
  it('accepts well-formed payloads and rejects shape violations', () => {
    const payload = { root: 'C:/ws', branch: 'main', staged: [{ path: 'a.ts', state: 'modified' }], unstaged: [], untracked: [] }
    expect(sanitizeStatus(payload)).toEqual(payload)
    expect(sanitizeStatus(null)).toBeNull()
    expect(sanitizeStatus({ staged: [], unstaged: [] })).toBeNull()
    expect(sanitizeStatus({ staged: [{ path: 1, state: 'x' }], unstaged: [], untracked: [] })).toBeNull()
    expect(sanitizeStatus({ staged: 'nope', unstaged: [], untracked: [] })).toBeNull()
  })
})

describe('Changes API client', () => {
  it('reads git-status with validation and bounding', async () => {
    const payload = { root: 'C:/ws', branch: 'main', staged: [], unstaged: [{ path: 'a.ts', state: 'modified' }], untracked: [] }
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, value: payload }) }))
    const api = createChangesApi(fetch)
    await expect(api.status('C:/ws')).resolves.toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/dsh-workbench/git-status', expect.objectContaining({ method: 'POST' }))
  })

  it('fails closed on malformed status payloads', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, value: { staged: 'bad' } }) }))
    const api = createChangesApi(fetch)
    await expect(api.status('C:/ws')).resolves.toBeUndefined()
    const failing = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: 'workspace-unknown' }) }))
    await expect(createChangesApi(failing).status('C:/unknown')).resolves.toBeUndefined()
    const notRepository = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, value: null }) }))
    await expect(createChangesApi(notRepository).status('C:/plain')).resolves.toBeNull()
  })

  it('sends write operations with validated bounded diff responses', async () => {
    const fetch = vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { op: string }
      if (body.op === 'diff') return { ok: true, json: async () => ({ ok: true, value: { content: '@@ -1 +1 @@', truncated: true } }) }
      return { ok: true, json: async () => ({ ok: true, value: {} }) }
    })
    const api = createChangesApi(fetch)
    await expect(api.diff('C:/ws', 'a.ts')).resolves.toEqual({ ok: true, value: { content: '@@ -1 +1 @@', truncated: true } })
    expect(fetch).toHaveBeenCalledWith('/dsh-workbench/git-changes', expect.objectContaining({
      body: JSON.stringify({ op: 'diff', root: 'C:/ws', path: 'a.ts' }),
    }))
    await expect(api.stage('C:/ws', 'a.ts')).resolves.toEqual({ ok: true, value: {} })
    await expect(api.unstage('C:/ws', 'a.ts')).resolves.toEqual({ ok: true, value: {} })
    await expect(api.discard('C:/ws', 'a.ts')).resolves.toEqual({ ok: true, value: {} })
    const ops = fetch.mock.calls.map((call) => (JSON.parse((call[1] as { body: string }).body) as { op: string }).op)
    expect(ops).toEqual(['diff', 'stage', 'unstage', 'discard'])
  })

  it('preserves structured policy errors and passes abort signals through', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: 'conflict-forbidden' }) }))
    const api = createChangesApi(fetch)
    await expect(api.stage('C:/ws', 'conflicted.ts', controller.signal)).resolves.toEqual({ ok: false, error: 'conflict-forbidden' })
    expect(fetch).toHaveBeenCalledWith('/dsh-workbench/git-changes', expect.objectContaining({ signal: controller.signal }))
  })

  it('fails closed when fetch throws', async () => {
    const fetch = vi.fn(async () => { throw new Error('network down') })
    const api = createChangesApi(fetch)
    await expect(api.diff('C:/ws', 'a.ts')).resolves.toEqual({ ok: false, error: 'read-failed' })
    await expect(api.status('C:/ws')).resolves.toBeUndefined()
  })
})
