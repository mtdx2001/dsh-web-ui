// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkbenchStores, type WorkbenchStores } from '../src/core/store.ts'
import { FilesPanel } from '../src/client/FilesPanel.tsx'
import type { FilesApi } from '../src/client/files-api.ts'
import { WorkbenchRightPanelHost } from '../src/client/WorkbenchRightPanelHost.tsx'
import { WorkbenchService } from '../src/client/workbench-service.ts'
import { setLanguage } from '../src/client/locales.ts'

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

function fakeApi(): FilesApi {
  return {
    list: async (_root, rel) => {
      if (rel === '') {
        return {
          ok: true,
          value: {
            entries: [
              { name: 'src', kind: 'directory' },
              { name: 'app.txt', kind: 'file' },
              { name: 'bin.exe', kind: 'file' },
            ],
            truncated: false,
          },
        }
      }
      if (rel === 'src') return { ok: true, value: { entries: [{ name: 'deep.ts', kind: 'file' }], truncated: false } }
      return { ok: false, error: 'not-found' }
    },
    read: async (_root, rel) => {
      if (rel === 'app.txt') return { ok: true, value: { kind: 'text', content: 'file body' } }
      if (rel === 'bin.exe') return { ok: false, error: 'binary' }
      return { ok: false, error: 'read-failed' }
    },
    gitStatus: async () => ({
      staged: [],
      unstaged: [{ path: 'app.txt', state: 'modified' }],
      untracked: [{ path: 'bin.exe', state: 'untracked' }],
    }),
  }
}

function panelRow(owner: HTMLElement, path: string): HTMLButtonElement {
  return owner.querySelector(`button[title="${path}"]`) as HTMLButtonElement
}

describe('FilesPanel', () => {
  let owner: HTMLElement
  let root: Root
  let stores: WorkbenchStores
  beforeEach(() => {
    document.body.innerHTML = '<div id="owner"></div>'
    owner = document.querySelector('#owner')!
    root = createRoot(owner)
    stores = createWorkbenchStores()
    stores.overview.update((prev) => ({ ...prev, root: 'C:/ws' }))
    setLanguage('en')
  })

  it('renders the tree with git status badges, expands directories, and collapses all', async () => {
    root.render(createElement(FilesPanel, { stores, api: fakeApi() }))
    await settle()
    expect(panelRow(owner, 'app.txt').textContent).toContain('M')
    expect(panelRow(owner, 'bin.exe').textContent).toContain('?')
    panelRow(owner, 'src').click()
    await settle()
    expect(panelRow(owner, 'src/deep.ts')).toBeTruthy()
    ;(owner.querySelector('button[aria-label="Collapse all"]') as HTMLButtonElement).click()
    await settle()
    expect(owner.querySelector('button[title="src/deep.ts"]')).toBeNull()
  })

  it('reports when a directory listing is truncated', async () => {
    const truncated: FilesApi = {
      ...fakeApi(),
      list: async (_root, rel) => rel === ''
        ? { ok: true, value: { entries: [{ name: 'visible.txt', kind: 'file' }], truncated: true } }
        : { ok: false, error: 'not-found' },
    }
    root.render(createElement(FilesPanel, { stores, api: truncated }))
    await settle()
    expect(owner.textContent).toContain('limited to the first 2,000 entries')
  })

  it('filters the loaded tree by file name search', async () => {
    root.render(createElement(FilesPanel, { stores, api: fakeApi() }))
    await settle()
    panelRow(owner, 'src').click()
    await settle()
    const search = owner.querySelector('input[type="search"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(search, 'deep')
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect(owner.querySelector('button[title="src/deep.ts"]')).toBeTruthy()
    expect(owner.querySelector('button[title="app.txt"]')).toBeNull()
  })

  it('opens a read-only preview with breadcrumb and returns to the tree', async () => {
    root.render(createElement(FilesPanel, { stores, api: fakeApi() }))
    await settle()
    panelRow(owner, 'app.txt').click()
    await settle()
    expect(owner.textContent).toContain('file body')
    expect(owner.textContent).toContain('app.txt')
    ;(owner.querySelector('button[aria-label="Back to tree"]') as HTMLButtonElement).click()
    await settle()
    expect(panelRow(owner, 'app.txt')).toBeTruthy()
  })

  it('keeps the latest preview when an older read resolves late', async () => {
    let releaseFirst!: (value: Awaited<ReturnType<FilesApi['read']>>) => void
    const first = new Promise<Awaited<ReturnType<FilesApi['read']>>>((resolve) => { releaseFirst = resolve })
    const racing: FilesApi = {
      ...fakeApi(),
      read: async (_root, rel) => rel === 'app.txt' ? first : { ok: true, value: { kind: 'text', content: 'second body' } },
    }
    root.render(createElement(FilesPanel, { stores, api: racing }))
    await settle()
    panelRow(owner, 'app.txt').click()
    await settle()
    ;(owner.querySelector('button[aria-label="Back to tree"]') as HTMLButtonElement).click()
    await settle()
    panelRow(owner, 'bin.exe').click()
    await settle()
    releaseFirst({ ok: true, value: { kind: 'text', content: 'stale body' } })
    await settle()
    expect(owner.textContent).toContain('second body')
    expect(owner.textContent).not.toContain('stale body')
  })

  it('shows an explicit notice for binary files', async () => {
    root.render(createElement(FilesPanel, { stores, api: fakeApi() }))
    await settle()
    panelRow(owner, 'bin.exe').click()
    await settle()
    expect(owner.textContent).toContain('Binary file; preview unavailable')
  })

  it('shows local states for failures, empty workspaces, and missing sessions', async () => {
    const failing: FilesApi = { ...fakeApi(), list: async () => ({ ok: false, error: 'read-failed' }) }
    root.render(createElement(FilesPanel, { stores, api: failing }))
    await settle()
    expect(owner.textContent).toContain('Directory read failed')

    const second = document.createElement('div')
    document.body.append(second)
    const secondRoot = createRoot(second)
    const empty: FilesApi = { ...fakeApi(), list: async () => ({ ok: true, value: { entries: [], truncated: false } }) }
    secondRoot.render(createElement(FilesPanel, { stores, api: empty }))
    await settle()
    expect(second.textContent).toContain('Workspace is empty')

    const third = document.createElement('div')
    document.body.append(third)
    const thirdRoot = createRoot(third)
    const noSession = createWorkbenchStores()
    thirdRoot.render(createElement(FilesPanel, { stores: noSession, api: fakeApi() }))
    await settle()
    expect(third.textContent).toContain('No active session')
    secondRoot.unmount()
    thirdRoot.unmount()
  })

  it('registers as a workbench right panel, isolates sibling failures, and unregisters cleanly', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = new WorkbenchService()
    service.registerRightPanel({
      id: 'overview', order: 10, label: 'Overview', source: 'workbench', builtin: true,
      render: () => createElement('div', null, 'Overview content'),
    })
    const unregisterFiles = service.registerRightPanel({
      id: 'files', order: 20, label: 'Files', source: 'workbench-files',
      render: () => createElement(FilesPanel, { stores, api: fakeApi() }),
    })
    service.registerRightPanel({
      id: 'broken', order: 30, label: 'Broken', source: 'extension',
      render: () => { throw new Error('boom') },
    })
    root.render(createElement(WorkbenchRightPanelHost, {
      service, stores, width: 360, details: 'Details', detailsRequestRevision: 0, close: vi.fn(),
    }))
    await settle()
    const tabs = owner.querySelectorAll('[role="tab"]')
    expect(tabs).toHaveLength(4)
    ;(tabs[2] as HTMLButtonElement).click()
    await settle()
    expect(owner.textContent).toContain('This component is unavailable')
    ;(owner.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click()
    await settle()
    expect(panelRow(owner, 'app.txt')).toBeTruthy()
    await unregisterFiles()
    await settle()
    expect(owner.querySelectorAll('[role="tab"]')).toHaveLength(3)
    await service.dispose()
    silence.mockRestore()
  })
})
