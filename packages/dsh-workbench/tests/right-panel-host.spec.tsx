// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkbenchStores, uiSetRoot } from '../src/core/store.ts'
import { writeUiState } from '../src/core/persist.ts'
import { WorkbenchRightPanelHost } from '../src/client/WorkbenchRightPanelHost.tsx'
import { WorkbenchService } from '../src/client/workbench-service.ts'
import { setLanguage } from '../src/client/locales.ts'

async function settle(): Promise<void> { await new Promise((resolve) => setTimeout(resolve, 0)); await new Promise((resolve) => setTimeout(resolve, 0)) }

describe('Workbench-owned right sidebar', () => {
  let owner: HTMLElement
  let root: Root
  let service: WorkbenchService
  let stores: ReturnType<typeof createWorkbenchStores>
  beforeEach(() => {
    document.body.innerHTML = '<div id="owner"></div>'
    owner = document.querySelector('#owner')!
    root = createRoot(owner)
    service = new WorkbenchService()
    stores = createWorkbenchStores()
    setLanguage('en')
    service.registerRightPanel({ id: 'overview', order: 10, label: 'Overview', source: 'workbench', builtin: true, render: () => createElement('div', null, 'Overview content') })
  })

  it('renders icon-and-text tabs, switches to upstream Details, and closes through Desktop', async () => {
    const close = vi.fn()
    root.render(createElement(WorkbenchRightPanelHost, { service, stores, width: 360, details: createElement('div', null, 'Official details'), detailsRequestRevision: 0, close }))
    await settle()
    expect(owner.querySelectorAll('[role="tab"]')).toHaveLength(2)
    expect(owner.textContent).toContain('Overview content')
    ;(owner.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click()
    await settle()
    expect(owner.textContent).toContain('Official details')
    ;(owner.querySelector('button[aria-label="Collapse right sidebar"]') as HTMLButtonElement).click()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('restores a saved extension tab even when an older Details request revision exists', async () => {
    service.registerRightPanel({ id: 'files', order: 20, label: 'Files', source: 'workbench-files', render: () => 'Files content' })
    stores.setActiveRightPanel('workbench-files:files')
    root.render(createElement(WorkbenchRightPanelHost, { service, stores, width: 360, details: 'Official details', detailsRequestRevision: 4, close: vi.fn() }))
    await settle()
    expect(owner.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Files')
    expect(owner.textContent).toContain('Files content')
  })

  it('follows persisted tab state loaded after the project root is known', async () => {
    service.registerRightPanel({ id: 'files', order: 20, label: 'Files', source: 'workbench-files', render: () => 'Files content' })
    root.render(createElement(WorkbenchRightPanelHost, { service, stores, width: 360, details: 'Official details', detailsRequestRevision: 0, close: vi.fn() }))
    await settle()
    expect(owner.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Overview')
    writeUiState('/repo/persisted', { overviewActive: false, activeRightPanel: 'workbench-files:files' })
    uiSetRoot(stores, '/repo/persisted')
    await settle()
    expect(owner.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Files')
  })

  it('applies settings visibility and ordering to registered right-sidebar components', async () => {
    const tabLabels = (): string[] => [...owner.querySelectorAll('[role="tab"]')].map((tab) => tab.querySelector('span[title]')?.textContent ?? tab.textContent ?? '')
    service.registerRightPanel({ id: 'files', order: 20, label: 'Files', source: 'workbench-files', render: () => 'Files content' })
    service.registerRightPanel({ id: 'changes', order: 30, label: 'Changes', source: 'workbench-changes', render: () => 'Changes content' })
    root.render(createElement(WorkbenchRightPanelHost, { service, stores, width: 360, details: 'Official details', detailsRequestRevision: 0, close: vi.fn() }))
    await settle()
    expect(tabLabels()).toEqual(['Overview', 'Files', 'Changes', 'Details'])

    const preferences = service.getComponentPreferences()
    preferences.setPosition('workbench-changes:changes', 'right-sidebar', 5)
    await settle()
    expect(tabLabels()).toEqual(['Changes', 'Overview', 'Files', 'Details'])

    ;([...owner.querySelectorAll('[role="tab"]')].find((tab) => tab.querySelector('span[title]')?.textContent === 'Files') as HTMLButtonElement).click()
    await settle()
    preferences.setEnabled('workbench-files:files', false)
    await settle()
    expect(tabLabels()).toEqual(['Changes', 'Overview', 'Details'])
    expect(owner.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Overview')

    preferences.setEnabled('workbench-files:files', true)
    preferences.setRemoved('workbench-files:files', true)
    await settle()
    expect(tabLabels()).not.toContain('Files')
    preferences.setRemoved('workbench-files:files', false)
    await settle()
    expect(tabLabels()).toContain('Files')
  })

  it('moves low-priority tabs into More while keeping the active tab visible', async () => {
    service.registerRightPanel({ id: 'files', order: 20, label: 'Files', source: 'workbench-files', render: () => 'Files content' })
    service.registerRightPanel({ id: 'changes', order: 30, label: 'Changes', source: 'workbench-changes', render: () => 'Changes content' })
    service.registerRightPanel({ id: 'tests', order: 40, label: 'Tests', source: 'sample', render: () => 'Tests content' })
    stores.setActiveRightPanel('sample:tests')
    root.render(createElement(WorkbenchRightPanelHost, { service, stores, width: 250, details: 'Official details', detailsRequestRevision: 0, close: vi.fn() }))
    await settle()
    expect([...owner.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent?.includes('Tests'))).toBe(true)
    expect(owner.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Tests')
    const more = owner.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement
    expect(more.textContent).toBe('More')
    more.click()
    await settle()
    const details = [...owner.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === 'Details') as HTMLButtonElement
    expect(details).not.toBeUndefined()
    details.click()
    await settle()
    expect(owner.textContent).toContain('Official details')
    expect(owner.querySelector('[role="menu"]')).toBeNull()
  })

  it('closes More with Escape and restores focus to its trigger', async () => {
    service.registerRightPanel({ id: 'files', order: 20, label: 'Files', source: 'workbench-files', render: () => 'Files content' })
    service.registerRightPanel({ id: 'changes', order: 30, label: 'Changes', source: 'workbench-changes', render: () => 'Changes content' })
    service.registerRightPanel({ id: 'tests', order: 40, label: 'Tests', source: 'sample', render: () => 'Tests content' })
    root.render(createElement(WorkbenchRightPanelHost, { service, stores, width: 250, details: 'Official details', detailsRequestRevision: 0, close: vi.fn() }))
    await settle()
    const more = owner.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement
    more.click()
    await settle()
    const menu = owner.querySelector('[role="menu"]') as HTMLElement
    expect(document.activeElement).toBe(menu.querySelector('[role="menuitem"]'))
    expect(more.getAttribute('aria-controls')).toBe('workbench-right-panel-more-menu')
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(owner.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(more)
  })

  it('selects Details when Desktop publishes a details request', async () => {
    root.render(createElement(WorkbenchRightPanelHost, { service, stores, width: 360, details: 'Official details', detailsRequestRevision: 0, close: vi.fn() }))
    await settle()
    root.render(createElement(WorkbenchRightPanelHost, { service, stores, width: 360, details: 'Official details', detailsRequestRevision: 1, close: vi.fn() }))
    await settle()
    expect(owner.textContent).toContain('Official details')
    expect(owner.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Details')
  })
})
