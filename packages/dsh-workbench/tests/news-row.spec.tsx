import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewsRow, type NewsRowApi } from '../src/client/NewsRow.tsx'

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('NewsRow', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('renders the trusted-source empty state without loading a feed', async () => {
    const api: NewsRowApi = { list: vi.fn(async () => []), load: vi.fn() }
    const owner = document.createElement('div')
    document.body.append(owner)
    const root = createRoot(owner)
    root.render(<NewsRow api={api} />)
    await vi.waitFor(() => expect(owner.textContent).toContain('尚未配置可信新闻来源'))
    expect(api.load).not.toHaveBeenCalled()
    root.unmount()
  })

  it('loads only configured source ids and switches inside the row', async () => {
    const api: NewsRowApi = {
      list: vi.fn(async () => [{ id: 'a', label: 'Source A' }, { id: 'b', label: 'Source B' }]),
      load: vi.fn(async (id: string) => [{ title: `${id} title`, summary: `${id} summary` }]),
    }
    const owner = document.createElement('div')
    document.body.append(owner)
    const root = createRoot(owner)
    root.render(<NewsRow api={api} />)
    await settle()
    expect(api.load).toHaveBeenCalledWith('a', expect.any(AbortSignal))
    expect(owner.textContent).toContain('a title')
    const select = owner.querySelector('select') as HTMLSelectElement
    select.value = 'b'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
    expect(api.load).toHaveBeenCalledWith('b', expect.any(AbortSignal))
    expect(owner.textContent).toContain('b title')
    root.unmount()
  })

  it('aborts source discovery when the disclosure unmounts', async () => {
    let observed: AbortSignal | undefined
    const api: NewsRowApi = {
      list: vi.fn((signal: AbortSignal): Promise<import('../src/client/news-feed.ts').NewsSource[]> => { observed = signal; return new Promise(() => {}) }),
      load: vi.fn(),
    }
    const owner = document.createElement('div')
    document.body.append(owner)
    const root = createRoot(owner)
    root.render(<NewsRow api={api} />)
    await settle()
    root.unmount()
    expect(observed?.aborted).toBe(true)
  })
})
