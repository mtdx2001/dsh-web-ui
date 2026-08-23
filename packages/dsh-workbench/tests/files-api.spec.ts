import { describe, expect, it, vi } from 'vitest'
import { createFilesApi } from '../src/client/files-api.ts'

describe('Files API client', () => {
  it('unwraps git-status route payload exactly once', async () => {
    const payload = {
      staged: [{ path: 'a.ts', state: 'modified' }],
      unstaged: [],
      untracked: [],
    }
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, value: payload }) }))
    const api = createFilesApi(fetch)
    await expect(api.gitStatus('C:/ws')).resolves.toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/dsh-workbench/git-status', expect.objectContaining({ method: 'POST' }))
  })

  it('preserves structured file errors from non-2xx responses', async () => {
    const fetch = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: 'binary' }) }))
    const api = createFilesApi(fetch)
    await expect(api.read('C:/ws', 'image.bin')).resolves.toEqual({ ok: false, error: 'binary' })
  })

  it('fails closed on malformed or failed responses', async () => {
    const fetch = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: 'workspace-unknown' }) }))
    const api = createFilesApi(fetch)
    await expect(api.gitStatus('C:/unknown')).resolves.toBeNull()
  })
})
