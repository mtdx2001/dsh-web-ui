import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarRows } from '../src/client/SidebarRows.tsx'
import { registerBuiltinSidebarRows } from '../src/client/builtin-sidebar-rows.tsx'
import { WorkbenchService } from '../src/client/workbench-service.ts'

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function fixtures() {
  const overview = {
    getSnapshot: () => ({
      expertCatalog: { kind: 'empty' },
      jobs: { kind: 'ready', value: [] },
      subagents: { kind: 'ready', value: [] },
      tokenUsage: { kind: 'unavailable' },
      recentTools: { kind: 'ready', value: [] },
      status: 'idle',
    }),
    subscribe: vi.fn(() => vi.fn()),
  }
  const open = vi.fn()
  const search = vi.fn(async () => ({
    ok: true,
    value: { items: [{ sessionId: 'session-hit', snippet: 'needle in a saved turn' }], hasMore: false },
  }))
  const sessions = {
    search,
    searchResultLimit: 20,
    open,
    list: { getSnapshot: () => ({ byId: { 'session-hit': { displayTitle: 'Matched session' } } }) },
  }
  return { stores: { overview } as any, sessions: sessions as any, search, open }
}

describe('built-in sidebar row declarations', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('keeps Workbench ownership while admitting built-ins into the removable free zone', async () => {
    const service = new WorkbenchService()
    const { stores, sessions } = fixtures()
    const dispose = registerBuiltinSidebarRows(service, stores, sessions)

    expect(service.getSidebarRows().rows.map((row) => ({ id: row.id, componentId: row.componentId, kind: row.kind }))).toEqual([
      { id: 'status-check', componentId: 'workbench:status-check', kind: 'disclosure' },
      { id: 'knowledge', componentId: 'workbench:knowledge', kind: 'disclosure' },
      { id: 'experts', componentId: 'workbench:experts', kind: 'disclosure' },
      { id: 'news', componentId: 'workbench:news', kind: 'disclosure' },
      { id: 'monitoring', componentId: 'workbench:monitoring', kind: 'disclosure' },
    ])
    expect(service.getComponentPreferences().getSnapshot().components.map((component) => ({ id: component.id, builtin: component.builtin, removable: component.removable }))).toEqual([
      { id: 'workbench:status-check', builtin: true, removable: true },
      { id: 'workbench:knowledge', builtin: true, removable: true },
      { id: 'workbench:experts', builtin: true, removable: true },
      { id: 'workbench:news', builtin: true, removable: true },
      { id: 'workbench:monitoring', builtin: true, removable: true },
    ])

    dispose()
    await service.dispose()
  })

  it('converts an official Knowledge search exception into an inline error state', async () => {
    const service = new WorkbenchService()
    const { stores, sessions, search } = fixtures()
    search.mockRejectedValueOnce(new Error('search unavailable'))
    const dispose = registerBuiltinSidebarRows(service, stores, sessions)
    const owner = document.createElement('div')
    document.body.append(owner)
    const root = createRoot(owner)
    root.render(createElement(SidebarRows, { service, slot: 'top', wide: true }))
    await settle()
    ;(owner.querySelector('[data-component-id="workbench:knowledge"] > button') as HTMLButtonElement).click()
    await settle()
    const input = owner.querySelector('input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, 'needle')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    ;(owner.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await settle()
    expect(owner.textContent).toContain('会话搜索失败')
    expect(owner.querySelector('form')).not.toBeNull()
    root.unmount()
    dispose()
    await service.dispose()
  })

  it('shows explicit runtime empty states in the Monitoring row', async () => {
    const service = new WorkbenchService()
    const { stores, sessions } = fixtures()
    const dispose = registerBuiltinSidebarRows(service, stores, sessions)
    const owner = document.createElement('div')
    document.body.append(owner)
    const root = createRoot(owner)
    root.render(createElement(SidebarRows, { service, slot: 'top', wide: true }))
    await settle()
    ;(owner.querySelector('[data-component-id="workbench:monitoring"] > button') as HTMLButtonElement).click()
    await settle()
    expect(owner.textContent).toContain('Token：运行时暂无数据')
    expect(owner.textContent).toContain('最近工具：暂无数据')
    root.unmount()
    dispose()
    await service.dispose()
  })

  it('searches the official session index from the Knowledge row and opens a result', async () => {
    const service = new WorkbenchService()
    const { stores, sessions, search, open } = fixtures()
    const dispose = registerBuiltinSidebarRows(service, stores, sessions)
    const owner = document.createElement('div')
    document.body.append(owner)
    const root = createRoot(owner)
    root.render(createElement(SidebarRows, { service, slot: 'top', wide: true }))
    await settle()

    ;(owner.querySelector('[data-component-id="workbench:knowledge"] > button') as HTMLButtonElement).click()
    await settle()
    const input = owner.querySelector('input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, 'needle')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    ;(owner.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await settle()

    expect(search).toHaveBeenCalledWith('needle', expect.any(AbortSignal))
    expect(owner.textContent).toContain('Matched session')
    ;([...owner.querySelectorAll('button')].find((button) => button.textContent?.includes('Matched session')) as HTMLButtonElement).click()
    await settle()
    expect(open).toHaveBeenCalledWith('session-hit')
    expect(owner.querySelector('[data-component-id="workbench:knowledge"]')?.getAttribute('data-expanded')).toBeNull()

    root.unmount()
    dispose()
    await service.dispose()
  })
})
