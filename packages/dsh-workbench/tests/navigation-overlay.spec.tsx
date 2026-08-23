import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchOverlay } from '../src/client/WorkbenchOverlay.tsx'
import { setLanguage } from '../src/client/locales.ts'
import { WorkbenchService } from '../src/client/workbench-service.ts'
import { createWorkbenchStores } from '../src/core/store.ts'

async function settle(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForLayoutMode(owner: HTMLElement, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const navigation = owner.querySelector<HTMLElement>('[data-dsh-workbench-navigation]')
    const mode = navigation?.getAttribute('data-layout-mode')
    const sidebar = navigation?.style.getPropertyValue('--workbench-sidebar')
    if (mode === expected && sidebar === '280px') return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const navigation = owner.querySelector<HTMLElement>('[data-dsh-workbench-navigation]')
  const actual = navigation?.getAttribute('data-layout-mode')
  const sidebar = navigation?.style.getPropertyValue('--workbench-sidebar')
  throw new Error(`layout did not settle to ${expected} with a 280px sidebar; received ${actual ?? 'missing'} and ${sidebar ?? 'missing'}`)
}

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

function mount(service: WorkbenchService, width: number, frameWidth = width): { owner: HTMLElement; root: Root; stores: ReturnType<typeof createWorkbenchStores>; sessions: any } {
  setViewport(width)
  const frame = document.createElement('div')
  const sidebar = document.createElement('div')
  const overlayLayer = document.createElement('div')
  const owner = document.createElement('div')
  frame.dataset.dshFrame = ''
  sidebar.dataset.pane = 'sidebar'
  owner.dataset.shellOverlay = ''
  frame.getBoundingClientRect = () => ({ width: frameWidth, height: 900 } as DOMRect)
  sidebar.getBoundingClientRect = () => ({ width: 280, height: 900 } as DOMRect)
  overlayLayer.appendChild(owner)
  frame.append(sidebar, overlayLayer)
  document.body.appendChild(frame)
  const root = createRoot(owner)
  const stores = createWorkbenchStores()
  stores.overview.update((previous) => ({
    ...previous,
    projectName: 'A project name that is intentionally long enough to require ellipsis behavior',
    sessionTitle: 'A long active session title used for rendering coverage',
    status: 'running',
  }))
  const sessions = {
    list: { getSnapshot: () => ({ byId: {} }) },
    searchResultLimit: 20,
    search: vi.fn(async () => ({ ok: true as const, value: { items: [], hasMore: false } })),
    open: vi.fn(),
  } as any
  root.render(createElement(WorkbenchOverlay, { service, stores, sessions }))
  return { owner, root, stores, sessions }
}

describe('official shell.overlay navigation component', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    setLanguage('en')
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0))
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('defers geometry observation until two paints after slot rendering', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const resizeObserver = vi.fn(function () { return { observe: vi.fn(), disconnect: vi.fn() } })
    vi.stubGlobal('ResizeObserver', resizeObserver)
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    const { root } = mount(service, 1600)
    await settle()

    expect(resizeObserver).not.toHaveBeenCalled()
    expect(frames).toHaveLength(1)
    frames.shift()?.(0)
    expect(resizeObserver).not.toHaveBeenCalled()
    expect(frames).toHaveLength(1)
    frames.shift()?.(16)
    expect(resizeObserver).toHaveBeenCalledTimes(1)
    root.unmount()
    await service.dispose()
  })

  it.each([
    [1600, 'wide'],
    [1200, 'compact'],
    [900, 'drawer'],
    [899, 'mobile'],
  ] as const)('renders the %ipx responsive mode', async (width, mode) => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    const { owner, root } = mount(service, width)
    await waitForLayoutMode(owner, mode)

    const navigation = owner.querySelector<HTMLElement>('[data-dsh-workbench-navigation]')
    expect(navigation?.getAttribute('data-layout-mode')).toBe(mode)
    expect(navigation?.style.getPropertyValue('--workbench-sidebar')).toBe('280px')
    expect(owner.querySelector('nav[aria-label="Workbench navigation"]')).not.toBeNull()
    root.unmount()
    await service.dispose()
  })

  it('uses the AppFrame width instead of the browser viewport', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    const { owner, root } = mount(service, 1800, 899)
    await waitForLayoutMode(owner, 'mobile')

    expect(owner.querySelector('[data-dsh-workbench-navigation]')?.getAttribute('data-layout-mode')).toBe('mobile')
    root.unmount()
    await service.dispose()
  })

  it('opens the Agent context panel after activation', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    const { owner, root } = mount(service, 1200)
    await settle()
    owner.querySelector<HTMLButtonElement>('[data-module-id="agent"]')!.click()
    await settle()

    expect(owner.querySelector('#dsh-workbench-context')).not.toBeNull()
    expect(owner.querySelector('#dsh-workbench-context')?.textContent).toContain('A project name that is intentionally long enough to require ellipsis behavior')
    expect(owner.querySelector('#dsh-workbench-context')?.textContent).toContain('0 project sessions')
    root.unmount()
    await service.dispose()
  })

  it('shows live Goal, Todo, and job summaries in the Tasks context', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'tasks', order: 20, label: 'Tasks', icon: 'tasks', activate: () => {} })
    const { owner, root, stores } = mount(service, 1200)
    stores.overview.update((previous) => ({
      ...previous,
      goal: { kind: 'ready', value: { objective: 'Ship the workbench', phase: 'active', roundsStarted: 1, maxGoalRounds: 8 } },
      todos: { kind: 'ready', value: { done: 2, total: 3, next: ['Verify GUI'] } },
      jobs: { kind: 'ready', value: [{ id: 'job-1', kind: 'test', label: 'Run tests', status: 'running' }] },
    }))
    await settle()
    owner.querySelector<HTMLButtonElement>('[data-module-id="tasks"]')!.click()
    await settle()

    const text = owner.querySelector('#dsh-workbench-context')?.textContent ?? ''
    expect(text).toContain('Goal: Ship the workbench')
    expect(text).toContain('Todos: 2/3 done')
    expect(text).toContain('Background jobs: 1')
    expect(text).toContain('Run tests - running')
    root.unmount()
    await service.dispose()
  })

  it('shows live token and execution metrics in the Monitoring context', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'monitoring', order: 55, label: 'Monitoring', icon: 'monitoring', activate: () => {} })
    const { owner, root, stores } = mount(service, 1200)
    stores.overview.update((previous) => ({
      ...previous,
      tokenUsage: { kind: 'ready', value: { uncachedInputTokens: 100, outputTokens: 40, cacheReadTokens: 200, cacheWriteTokens: 0, estimated: false, tokensPerSecond: 18.5 } },
      jobs: { kind: 'ready', value: [{ id: 'job-1', kind: 'test', label: 'Tests', status: 'running' }] },
      subagents: { kind: 'ready', value: [{ id: 'agent-1', title: 'Review', running: true }] },
      recentTools: { kind: 'ready', value: [{ name: 'read', time: 1, state: 'done' }] },
    }))
    await settle()
    owner.querySelector<HTMLButtonElement>('[data-module-id="monitoring"]')!.click()
    await settle()

    const text = owner.querySelector('#dsh-workbench-context')?.textContent ?? ''
    expect(text).toContain('Tokens: input 300 · output 40 · cache 200')
    expect(text).toContain('Throughput: 18.5 tok/s')
    expect(text).toContain('Activity: 1 jobs · 1 subagents')
    expect(text).toContain('read - done')
    root.unmount()
    await service.dispose()
  })

  it('renders long labels, unavailable errors, and localized Chinese copy', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    const extensionActivate = vi.fn()
    service.register({
      id: 'long-extension',
      order: 20,
      label: 'A very long extension module label that must not resize the rail',
      icon: 'extension',
      availability: () => ({ kind: 'unavailable', reason: 'Extension service is offline' }),
      activate: extensionActivate,
    })
    const { owner, root } = mount(service, 1600)
    await service.activate('agent')
    await settle()

    const extension = owner.querySelector<HTMLButtonElement>('[data-module-id="long-extension"]')!
    expect(extension.getAttribute('aria-label')).toContain('Extension service is offline')
    expect(extension.getAttribute('data-module-unavailable')).toBe('true')
    extension.click()
    await settle()
    expect(extensionActivate).not.toHaveBeenCalled()
    expect(extension.getAttribute('aria-expanded')).toBe('true')
    expect(owner.querySelector('[role="status"]')?.textContent).toContain('Extension service is offline')
    expect(owner.querySelector('.contextTitle')?.textContent ?? owner.querySelector('aside')?.textContent).toContain('A very long extension module label')

    setLanguage('zh')
    service.refresh()
    await settle()
    expect(owner.querySelector('nav')?.getAttribute('aria-label')).toBe('工作台导航')
    expect(owner.textContent).toContain('不可用')
    expect(owner.textContent).toContain('Extension service is offline')
    root.unmount()
    await service.dispose()
  })

  it('keeps mobile drawer focus inside the dialog and handles Escape from its controls', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'tasks', order: 20, label: 'Tasks', icon: 'tasks', activate: () => {}, deactivate: () => {} })
    const { owner, root } = mount(service, 899)
    await service.activate('agent')
    await settle()
    const tasks = owner.querySelector<HTMLButtonElement>('[data-module-id="tasks"]')!

    tasks.click()
    await settle()
    const dialog = owner.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!
    const close = dialog.querySelector<HTMLButtonElement>('button')!
    expect(document.activeElement).toBe(close)
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(close)
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(owner.querySelector('#dsh-workbench-context')).toBeNull()
    expect(document.activeElement).toBe(tasks)
    root.unmount()
    await service.dispose()
  })

  it('includes native form controls in the mobile drawer focus loop', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'knowledge', order: 30, label: 'Knowledge', icon: 'knowledge', activate: () => {} })
    const { owner, root } = mount(service, 899)
    await service.activate('agent')
    await settle()

    owner.querySelector<HTMLButtonElement>('[data-module-id="knowledge"]')!.click()
    await settle()
    const dialog = owner.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!
    const close = dialog.querySelector<HTMLButtonElement>('header button')!
    const input = dialog.querySelector<HTMLInputElement>('#dsh-workbench-knowledge-query')!
    const search = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(search.disabled).toBe(true)

    close.focus()
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(input)

    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(close)

    root.unmount()
    await service.dispose()
  })

  it('wraps ArrowUp/ArrowDown around the first and last rail items', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'tasks', order: 20, label: 'Tasks', icon: 'tasks', activate: () => {} })
    const { owner, root } = mount(service, 1200)
    await service.activate('agent')
    await settle()

    const agent = owner.querySelector<HTMLButtonElement>('[data-module-id="agent"]')!
    const tasks = owner.querySelector<HTMLButtonElement>('[data-module-id="tasks"]')!

    // First item + ArrowUp wraps to the last item instead of stopping.
    agent.focus()
    agent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(document.activeElement).toBe(tasks)

    // Last item + ArrowDown wraps back to the first item.
    tasks.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(agent)
    root.unmount()
    await service.dispose()
  })

  it('moves rail focus to the first and last items with Home and End', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'tasks', order: 20, label: 'Tasks', icon: 'tasks', activate: () => {} })
    service.register({ id: 'ssh', order: 30, label: 'SSH', icon: 'ssh', activate: () => {} })
    const { owner, root } = mount(service, 1200)
    await service.activate('agent')
    await settle()

    const agent = owner.querySelector<HTMLButtonElement>('[data-module-id="agent"]')!
    const tasks = owner.querySelector<HTMLButtonElement>('[data-module-id="tasks"]')!
    const ssh = owner.querySelector<HTMLButtonElement>('[data-module-id="ssh"]')!

    agent.focus()
    agent.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(document.activeElement).toBe(ssh)

    ssh.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(agent)

    // Home/End from a middle item also land on the exact boundary items.
    tasks.focus()
    tasks.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(document.activeElement).toBe(ssh)
    root.unmount()
    await service.dispose()
  })

  it('keeps Tab cycling inside the mobile drawer so the rail cannot be a Tab escape point', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'tasks', order: 20, label: 'Tasks', icon: 'tasks', activate: () => {}, deactivate: () => {} })
    const { owner, root } = mount(service, 899)
    await service.activate('agent')
    await settle()

    owner.querySelector<HTMLButtonElement>('[data-module-id="tasks"]')!.click()
    await settle()
    const dialog = owner.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!
    const close = dialog.querySelector<HTMLButtonElement>('button')!
    const rail = owner.querySelector<HTMLElement>('nav')!
    const agent = owner.querySelector<HTMLButtonElement>('[data-module-id="agent"]')!
    const tasks = owner.querySelector<HTMLButtonElement>('[data-module-id="tasks"]')!
    expect(document.activeElement).toBe(close)
    expect(rail.getAttribute('aria-hidden')).toBe('true')
    expect(agent.tabIndex).toBe(-1)
    expect(tasks.tabIndex).toBe(-1)

    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(close)
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(close)

    close.click()
    await settle()
    expect(rail.getAttribute('aria-hidden')).toBeNull()
    expect(tasks.tabIndex).toBe(0)
    expect(document.activeElement).toBe(tasks)
    root.unmount()
    await service.dispose()
  })

  it('exposes localized accessible names and unavailable inspect semantics', async () => {
    setLanguage('zh')
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    const extensionActivate = vi.fn()
    service.register({
      id: 'panel',
      order: 20,
      label: '扩展面板',
      icon: 'extension',
      availability: () => ({ kind: 'unavailable', reason: '服务维护中' }),
      activate: extensionActivate,
    })
    const { owner, root } = mount(service, 1200)
    await service.activate('agent')
    await settle()

    expect(owner.querySelector('nav')?.getAttribute('aria-label')).toBe('工作台导航')

    // Unavailable entry: accessible name joins the label and the reason.
    const panel = owner.querySelector<HTMLButtonElement>('[data-module-id="panel"]')!
    expect(panel.getAttribute('aria-label')).toBe('扩展面板: 服务维护中')
    expect(panel.getAttribute('data-module-unavailable')).toBe('true')

    // Clicking an unavailable entry opens the inspect surface without activating.
    panel.click()
    await settle()
    expect(extensionActivate).not.toHaveBeenCalled()
    const context = owner.querySelector<HTMLElement>('#dsh-workbench-context')!
    expect(context.getAttribute('aria-label')).toBe('模块上下文')
    expect(context.querySelector('button')?.getAttribute('aria-label')).toBe('关闭上下文栏')
    expect(context.textContent).toContain('不可用')
    expect(context.querySelector('[role="status"]')?.textContent).toBe('服务维护中')
    root.unmount()
    await service.dispose()
  })

  it('searches Knowledge through sessions.search and opens a hit back in Agent', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'knowledge', order: 30, label: 'Knowledge', icon: 'knowledge', activate: () => {} })
    const { owner, root, sessions } = mount(service, 1200)
    sessions.list.getSnapshot = () => ({ byId: { 'session-hit': { displayTitle: 'Hit session' } } })
    sessions.search.mockResolvedValue({
      ok: true,
      value: { items: [{ sessionId: 'session-hit', snippet: 'the matching needle' }], hasMore: true },
    })
    await service.activate('agent')
    await settle()

    owner.querySelector<HTMLButtonElement>('[data-module-id="knowledge"]')!.click()
    await settle()
    const context = owner.querySelector<HTMLElement>('#dsh-workbench-context')!
    expect(context.textContent).toContain('Enter text to search visible message content across sessions')

    const input = context.querySelector<HTMLInputElement>('#dsh-workbench-knowledge-query')!
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    valueSetter.call(input, 'needle')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    context.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await settle()

    expect(sessions.search).toHaveBeenCalledWith('needle', expect.any(AbortSignal))
    expect(context.textContent).toContain('Hit session')
    expect(context.textContent).toContain('the matching needle')
    expect(context.textContent).toContain('Only the first 20 results are shown; narrow the query')

    context.querySelector<HTMLButtonElement>('.searchResults .searchResult, [aria-live="polite"] button')!.click()
    await settle()
    expect(sessions.open).toHaveBeenCalledWith('session-hit')
    expect(service.getNavigation().activeId).toBe('agent')
    expect(owner.querySelector('#dsh-workbench-context')).toBeNull()
    root.unmount()
    await service.dispose()
  })

  it('keeps the News source selector available after one source fails', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'news', order: 50, label: 'News', icon: 'news', activate: () => {} })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/dsh-workbench/news/sources')) return new Response(JSON.stringify({
        ok: true,
        value: [{ id: 'broken', label: 'Broken source' }, { id: 'healthy', label: 'Healthy source' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.includes('source=broken')) return new Response(JSON.stringify({ ok: false, error: 'upstream-failed' }), { status: 502 })
      return new Response(JSON.stringify({
        ok: true,
        value: { content: '<rss><channel><item><title>Recovered headline</title><description>Available feed</description></item></channel></rss>' },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const { owner, root } = mount(service, 1200)
    await service.activate('agent')
    await settle()

    owner.querySelector<HTMLButtonElement>('[data-module-id="news"]')!.click()
    await settle()
    const context = owner.querySelector<HTMLElement>('#dsh-workbench-context')!
    expect(context.querySelector('[role="alert"]')?.textContent).toBe('News source read failed')
    const select = context.querySelector<HTMLSelectElement>('select')
    expect(select).not.toBeNull()

    select!.value = 'healthy'
    select!.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
    expect(context.textContent).toContain('Recovered headline')
    expect(context.querySelector('[role="alert"]')).toBeNull()

    root.unmount()
    await service.dispose()
  })

  it('shows preset and skill states in the Experts context', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'experts', order: 40, label: 'Experts', icon: 'experts', activate: () => {} })
    const { owner, root, stores } = mount(service, 1200)
    stores.overview.update((previous) => ({
      ...previous,
      expertCatalog: {
        kind: 'ready',
        value: {
          presets: [
            { id: 'code-mode', name: 'Code Mode', description: undefined, trust: 'system', isDefault: true, broken: false },
            { id: 'writer', name: 'Writer', description: undefined, trust: 'user', isDefault: false, broken: false },
            { id: 'stale', name: 'Stale', description: undefined, trust: 'user', isDefault: false, broken: true },
          ],
          skills: [
            { name: 'pdf', description: 'PDF tools', modelInvocable: true },
            { name: 'plan-only', description: 'Manual', modelInvocable: false },
          ],
        },
      },
    }))
    await settle()
    owner.querySelector<HTMLButtonElement>('[data-module-id="experts"]')!.click()
    await settle()

    const text = owner.querySelector('#dsh-workbench-context')?.textContent ?? ''
    expect(text).toContain('Agent Presets: 3')
    expect(text).toContain('Code Mode · system · default')
    expect(text).toContain('Writer · user · available')
    expect(text).toContain('Stale · user · broken')
    expect(text).toContain('Skills: 2')
    expect(text).toContain('/pdf · model-invocable')
    expect(text).toContain('/plan-only · user-only')
    root.unmount()
    await service.dispose()
  })

  it('supports roving focus, Escape close, and focus restoration', async () => {
    const service = new WorkbenchService()
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: () => {} })
    service.register({ id: 'tasks', order: 20, label: 'Tasks', icon: 'tasks', activate: () => {}, deactivate: () => {} })
    const { owner, root } = mount(service, 1200)
    await service.activate('agent')
    await settle()

    const agent = owner.querySelector<HTMLButtonElement>('[data-module-id="agent"]')!
    const tasks = owner.querySelector<HTMLButtonElement>('[data-module-id="tasks"]')!
    expect(agent.tabIndex).toBe(0)
    expect(tasks.tabIndex).toBe(-1)
    agent.focus()
    agent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(tasks)

    tasks.click()
    await settle()
    expect(owner.querySelector('#dsh-workbench-context')).not.toBeNull()
    tasks.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(owner.querySelector('#dsh-workbench-context')).toBeNull()
    expect(document.activeElement).toBe(tasks)
    root.unmount()
    await service.dispose()
  })
})
