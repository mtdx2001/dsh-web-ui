import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AionUiPanelService, orderedExplorerTabs } from '../src/client/dock-service.ts'
import { createState, type ExplorerStore, type ExplorerState } from '../src/client/store.ts'

function fakeExplorer(initial = 'files'): ExplorerStore {
  const state: ExplorerState = {
    root: '/workspace', dirs: {}, expanded: [], selected: null, loading: [], activeTab: initial,
    search: { query: '', status: 'idle', hits: [], truncated: false }, version: 0,
  }
  const handle = createState(state)
  return Object.assign(handle, {
    setRoot: vi.fn(),
    // A spy so tests can prove the grace fallback never takes the persisting path.
    setActiveTab: vi.fn((tab: string) => handle.update((prev) => ({ ...prev, activeTab: tab }))),
    toggleDir: vi.fn(), select: vi.fn(), reveal: vi.fn(), setSearchQuery: vi.fn(), cancelSearch: vi.fn(),
    handleFsChange: vi.fn(), revealInFileManager: vi.fn(), openWithDefaultApp: vi.fn(), renameEntry: vi.fn(),
    createDir: vi.fn(), createFile: vi.fn(), deleteEntry: vi.fn(),
  }) as unknown as ExplorerStore
}

const tab = (id: string, order: number, active?: (value: boolean) => void) => ({
  id, order, label: id, render: () => null, onActiveChange: active,
})

describe('AionUI Explorer Dock service', () => {
  it('orders extension tabs together with the built-in tabs', () => {
    expect(orderedExplorerTabs([
      tab('later', 40),
      { ...tab('overview', 10), label: () => 'Overview' },
    ], { files: 'Files', changes: 'Changes' })).toEqual([
      { id: 'overview', label: 'Overview', order: 10 },
      { id: 'files', label: 'Files', order: 20 },
      { id: 'changes', label: 'Changes', order: 30 },
      { id: 'later', label: 'later', order: 40 },
    ])
  })

  it('sorts registered tabs and rejects built-in, malformed, and duplicate ids', () => {
    const service = new AionUiPanelService()
    service.registerDockTab(tab('later', 20))
    service.registerDockTab(tab('first', 10))
    expect(service.getDockTabs().tabs.map((item) => item.id)).toEqual(['first', 'later'])
    expect(() => service.registerDockTab(tab('files', 0))).toThrow(/Invalid/)
    expect(() => service.registerDockTab(tab('bad_id', 0))).toThrow(/Invalid/)
    expect(() => service.registerDockTab(tab('first', 0))).toThrow(/already registered/)
  })

  it('routes activation through the explorer and reports active changes', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer()
    const changes: boolean[] = []
    service.bindExplorer(explorer)
    service.registerDockTab(tab('overview', 10, (active) => changes.push(active)))
    expect(service.activateDockTab('overview')).toBe(true)
    expect(explorer.getSnapshot().activeTab).toBe('overview')
    expect(service.getActiveDockTab()).toBe('overview')
    expect(changes).toEqual([false, true])
    expect(service.activateDockTab('missing')).toBe(false)
  })

  it('falls back to Files when an active extension is unregistered', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer()
    service.bindExplorer(explorer)
    const unregister = service.registerDockTab(tab('overview', 10))
    service.activateDockTab('overview')
    unregister()
    expect(explorer.getSnapshot().activeTab).toBe('files')
    expect(service.getActiveDockTab()).toBe('files')
  })

  it('restores a persisted extension tab when registration arrives after Explorer binding', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer('overview')
    service.bindExplorer(explorer)
    expect(explorer.getSnapshot().activeTab).toBe('overview')
    service.registerDockTab(tab('overview', 10))
    expect(explorer.getSnapshot().activeTab).toBe('overview')
    expect(service.getActiveDockTab()).toBe('overview')
  })

  it('restores an extension tab loaded by a project root after Explorer binding', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer('files')
    service.bindExplorer(explorer)
    explorer.setActiveTab('overview')
    expect(explorer.getSnapshot().activeTab).toBe('overview')
    service.registerDockTab(tab('overview', 10))
    expect(service.getActiveDockTab()).toBe('overview')
  })
})

describe('AionUI Explorer Dock restore grace (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('grace expiry falls the view back to Files WITHOUT overwriting the persisted tab preference', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer('overview')
    service.bindExplorer(explorer)
    expect(explorer.getSnapshot().activeTab).toBe('overview')
    vi.advanceTimersByTime(5000)
    // The view fell back in memory…
    expect(explorer.getSnapshot().activeTab).toBe('files')
    expect(service.getActiveDockTab()).toBe('files')
    // …but never through setActiveTab, so the persisted per-root preference
    // still says "overview" and the next session retries the restore.
    expect(explorer.setActiveTab).not.toHaveBeenCalled()
    // Late registration after the fallback activates normally.
    service.registerDockTab(tab('overview', 10))
    expect(service.activateDockTab('overview')).toBe(true)
    expect(service.getActiveDockTab()).toBe('overview')
    service.dispose()
  })

  it('a rebind kills the old explorer restore timer (it never fires against the stale explorer)', () => {
    const service = new AionUiPanelService()
    const stale = fakeExplorer('overview')
    service.bindExplorer(stale)
    const fresh = fakeExplorer('files')
    service.bindExplorer(fresh)
    vi.advanceTimersByTime(10_000)
    // The stale explorer keeps its pending tab — no fallback fired on it.
    expect(stale.getSnapshot().activeTab).toBe('overview')
    expect(stale.setActiveTab).not.toHaveBeenCalled()
    expect(fresh.getSnapshot().activeTab).toBe('files')
    expect(service.getActiveDockTab()).toBe('files')
    service.dispose()
  })

  it('the binding disposer clears the pending restore timer', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer('overview')
    const unbind = service.bindExplorer(explorer)
    unbind()
    vi.advanceTimersByTime(10_000)
    expect(explorer.getSnapshot().activeTab).toBe('overview')
    expect(explorer.setActiveTab).not.toHaveBeenCalled()
    service.dispose()
  })

  it('unregistering a NON-active extension tab leaves the active tab untouched', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer()
    service.bindExplorer(explorer)
    const unregister = service.registerDockTab(tab('overview', 10))
    expect(service.getActiveDockTab()).toBe('files')
    unregister()
    expect(explorer.getSnapshot().activeTab).toBe('files')
    expect(service.getActiveDockTab()).toBe('files')
    // Idempotent: a second call is a no-op (no publish, no throw).
    unregister()
    expect(service.getDockTabs().tabs).toEqual([])
    service.dispose()
  })

  it('unregister after dispose is safe (no double notification, no explorer write)', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer()
    service.bindExplorer(explorer)
    const changes: boolean[] = []
    const unregister = service.registerDockTab(tab('overview', 10, (active) => changes.push(active)))
    service.activateDockTab('overview')
    service.dispose()
    expect(changes).toEqual([false, true, false])
    unregister()
    unregister()
    expect(changes).toEqual([false, true, false])
    expect(explorer.setActiveTab).toHaveBeenCalledTimes(1)
  })

  it('dispose clears a pending restore timer (nothing fires afterwards)', () => {
    const service = new AionUiPanelService()
    const explorer = fakeExplorer('overview')
    service.bindExplorer(explorer)
    service.dispose()
    vi.advanceTimersByTime(10_000)
    expect(explorer.getSnapshot().activeTab).toBe('overview')
    expect(explorer.setActiveTab).not.toHaveBeenCalled()
    // Dispose is idempotent too.
    service.dispose()
  })
})
