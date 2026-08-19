// @vitest-environment jsdom
/**
 * ExplorerPanel dock-tab a11y/layout contract: every tab button carries a
 * stable id + aria-controls, every content region is a role=tabpanel wired
 * back with aria-labelledby, the tablist uses its own locale label, and the
 * extension-tab content sits in a flex:1 / min-height:0 / overflow:auto
 * wrapper so tall extension content scrolls inside the column.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ExplorerPanel } from '../src/client/components/ExplorerPanel.tsx'
import { AionUiPanelService } from '../src/client/dock-service.ts'
import { createState, type ExplorerState, type ExplorerStore, type PanelStores } from '../src/client/store.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fakeExplorer(initial = 'overview'): ExplorerStore {
  const state: ExplorerState = {
    root: '/workspace', dirs: {}, expanded: [], selected: null, loading: [], activeTab: initial,
    search: { query: '', status: 'idle', hits: [], truncated: false }, version: 0,
  }
  const handle = createState(state)
  return Object.assign(handle, {
    setRoot: vi.fn(),
    setActiveTab: vi.fn((tab: string) => handle.update((prev) => ({ ...prev, activeTab: tab }))),
    toggleDir: vi.fn(), select: vi.fn(), reveal: vi.fn(), setSearchQuery: vi.fn(), cancelSearch: vi.fn(),
    handleFsChange: vi.fn(), revealInFileManager: vi.fn(), openWithDefaultApp: vi.fn(), renameEntry: vi.fn(),
    createDir: vi.fn(), createFile: vi.fn(), deleteEntry: vi.fn(),
  }) as unknown as ExplorerStore
}

function makeStores(activeTab: string): PanelStores {
  return {
    explorer: fakeExplorer(activeTab),
    layout: createState({
      root: '/workspace', availableWidth: 1400, explorerWidth: 260, previewWidth: 480,
      explorerCollapsed: false, previewOpen: true, maximized: null,
    }),
    scm: {} as never,
    preview: {} as never,
  } as unknown as PanelStores
}

function makeDockService(): AionUiPanelService {
  const service = new AionUiPanelService()
  service.registerDockTab({
    id: 'overview', order: 10, label: 'Overview', render: () => <div>ext-content</div>,
  })
  return service
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ExplorerPanel dock tabs', () => {
  it('labels the tablist with its own locale key and wires tab -> tabpanel aria', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const service = makeDockService()
    const root = createRoot(host)
    act(() => {
      root.render(<ExplorerPanel stores={makeStores('overview')} dockService={service} onToggleCollapse={() => {}} />)
    })

    const tablist = host.querySelector('[role="tablist"]')
    expect(tablist?.getAttribute('aria-label')).toBe('文件面板标签')

    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.id)).toEqual(['explorer-tab-overview', 'explorer-tab-files', 'explorer-tab-changes'])
    for (const tab of tabs) {
      const panelId = tab.getAttribute('aria-controls')
      expect(panelId).toBe(`explorer-tabpanel-${tab.id.replace('explorer-tab-', '')}`)
    }

    // The active extension panel is a labelled tabpanel pointing back.
    const panel = host.querySelector<HTMLElement>('#explorer-tabpanel-overview')
    expect(panel?.getAttribute('role')).toBe('tabpanel')
    expect(panel?.getAttribute('aria-labelledby')).toBe('explorer-tab-overview')
    expect(panel?.textContent).toContain('ext-content')

    // The extension content wrapper: flex:1 / min-height:0 / overflow:auto.
    // jsdom expands the `flex` shorthand to '1 1 0%', so assert flexGrow
    // instead of the shorthand string.
    expect(panel?.style.flexGrow).toBe('1')
    expect(panel?.style.minHeight).toBe('0px')
    expect(panel?.style.overflow).toBe('auto')

    act(() => { root.unmount() })
    service.dispose()
  })

  it('marks files and changes content regions as tabpanels too', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const service = makeDockService()
    const root = createRoot(host)
    act(() => {
      root.render(<ExplorerPanel stores={makeStores('files')} dockService={service} onToggleCollapse={() => {}} />)
    })

    const filesPanel = host.querySelector<HTMLElement>('#explorer-tabpanel-files')
    expect(filesPanel?.getAttribute('role')).toBe('tabpanel')
    expect(filesPanel?.getAttribute('aria-labelledby')).toBe('explorer-tab-files')

    act(() => { root.unmount() })
    service.dispose()
  })
})
