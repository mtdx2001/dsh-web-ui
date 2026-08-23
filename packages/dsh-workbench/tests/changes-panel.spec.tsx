// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkbenchStores, type WorkbenchStores } from '../src/core/store.ts'
import { ChangesPanel } from '../src/client/ChangesPanel.tsx'
import type { ChangesApi, ChangesStatusPayload } from '../src/client/changes-api.ts'
import { WorkbenchRightPanelHost } from '../src/client/WorkbenchRightPanelHost.tsx'
import { WorkbenchService } from '../src/client/workbench-service.ts'
import { setLanguage } from '../src/client/locales.ts'

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const STATUS: ChangesStatusPayload = {
  root: 'C:/ws',
  branch: 'main',
  staged: [{ path: 'staged.ts', state: 'modified' }],
  unstaged: [{ path: 'dirty.ts', state: 'modified' }, { path: 'partial.ts', state: 'partially-staged' }, { path: 'conflicted.ts', state: 'conflicted' }],
  untracked: [{ path: 'new.ts', state: 'untracked' }],
}

interface TrackedApi extends ChangesApi {
  calls: { status: number; stage: string[]; unstage: string[]; discard: string[]; diff: string[] }
}

function fakeApi(overrides: Partial<ChangesApi> = {}): TrackedApi {
  const calls = { status: 0, stage: [] as string[], unstage: [] as string[], discard: [] as string[], diff: [] as string[] }
  return {
    calls,
    status: async () => { calls.status += 1; return STATUS },
    diff: async (_root, path) => { calls.diff.push(path); return { ok: true, value: { content: `diff for ${path}`, truncated: path === 'big.ts' } } },
    stage: async (_root, path) => { calls.stage.push(path); return { ok: true, value: {} } },
    unstage: async (_root, path) => { calls.unstage.push(path); return { ok: true, value: {} } },
    discard: async (_root, path) => { calls.discard.push(path); return { ok: true, value: {} } },
    ...overrides,
  }
}

function rowOf(owner: HTMLElement, path: string): HTMLButtonElement {
  return owner.querySelector(`button[title="${path}"]`) as HTMLButtonElement
}

function actionOf(owner: HTMLElement, path: string, label: string): HTMLButtonElement {
  const row = rowOf(owner, path).closest('div')!
  return [...row.querySelectorAll('button')].find((button) => button.textContent === label) as HTMLButtonElement
}

describe('ChangesPanel', () => {
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

  it('renders staged, unstaged, and untracked groups with policy-shaped actions', async () => {
    root.render(createElement(ChangesPanel, { stores, api: fakeApi() }))
    await settle()
    expect(owner.querySelector('[data-group="staged"]')?.textContent).toContain('Staged')
    expect(owner.querySelector('[data-group="unstaged"]')?.textContent).toContain('Unstaged')
    expect(owner.querySelector('[data-group="untracked"]')?.textContent).toContain('Untracked')
    expect(actionOf(owner, 'staged.ts', 'Unstage')).toBeTruthy()
    expect(actionOf(owner, 'dirty.ts', 'Stage')).toBeTruthy()
    expect(actionOf(owner, 'dirty.ts', 'Discard')).toBeTruthy()
    expect(actionOf(owner, 'partial.ts', 'Stage')).toBeTruthy()
    expect(actionOf(owner, 'partial.ts', 'Discard')).toBeUndefined()
    expect(actionOf(owner, 'new.ts', 'Stage')).toBeTruthy()
    expect(actionOf(owner, 'new.ts', 'Delete')).toBeTruthy()
    // Conflict rows render without any write buttons.
    const conflictRow = rowOf(owner, 'conflicted.ts').closest('div')!
    expect(conflictRow.textContent).toContain('Conflicted')
    expect([...conflictRow.querySelectorAll('button')]).toHaveLength(1)
  })

  it('opens a bounded diff view on file click and returns to the list', async () => {
    const api = fakeApi()
    root.render(createElement(ChangesPanel, { stores, api }))
    await settle()
    rowOf(owner, 'dirty.ts').click()
    await settle()
    expect(owner.textContent).toContain('diff for dirty.ts')
    expect(api.calls.diff).toEqual(['dirty.ts'])
    ;(owner.querySelector('button[aria-label="Back to changes"]') as HTMLButtonElement).click()
    await settle()
    expect(rowOf(owner, 'dirty.ts')).toBeTruthy()
  })

  it('shows a truncation marker when the host reports a truncated diff', async () => {
    const api = fakeApi({ diff: async () => ({ ok: true, value: { content: 'partial diff', truncated: true } }) })
    root.render(createElement(ChangesPanel, { stores, api }))
    await settle()
    rowOf(owner, 'dirty.ts').click()
    await settle()
    expect(owner.textContent).toContain('partial diff')
    expect(owner.textContent).toContain('exceeded the size limit and was truncated')
  })

  it('re-reads host status after a successful write instead of optimistic updates', async () => {
    const api = fakeApi()
    root.render(createElement(ChangesPanel, { stores, api }))
    await settle()
    expect(api.calls.status).toBe(1)
    actionOf(owner, 'dirty.ts', 'Stage').click()
    await settle()
    expect(api.calls.stage).toEqual(['dirty.ts'])
    expect(api.calls.status).toBe(2)
    actionOf(owner, 'staged.ts', 'Unstage').click()
    await settle()
    expect(api.calls.unstage).toEqual(['staged.ts'])
    expect(api.calls.status).toBe(3)
  })

  it('requires explicit confirmation for discard and delete', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const api = fakeApi()
    root.render(createElement(ChangesPanel, { stores, api }))
    await settle()
    actionOf(owner, 'dirty.ts', 'Discard').click()
    await settle()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('dirty.ts'))
    expect(api.calls.discard).toEqual([])
    confirm.mockReturnValue(true)
    actionOf(owner, 'dirty.ts', 'Discard').click()
    await settle()
    expect(api.calls.discard).toEqual(['dirty.ts'])
    actionOf(owner, 'new.ts', 'Delete').click()
    await settle()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('new.ts'))
    expect(api.calls.discard).toEqual(['dirty.ts', 'new.ts'])
    confirm.mockRestore()
  })

  it('surfaces structured refusal errors without mutating the list', async () => {
    const api = fakeApi({ stage: async () => ({ ok: false, error: 'conflict-forbidden' }) })
    root.render(createElement(ChangesPanel, { stores, api }))
    await settle()
    actionOf(owner, 'dirty.ts', 'Stage').click()
    await settle()
    expect(owner.textContent).toContain('Resolve the conflict before writing')
    expect(rowOf(owner, 'dirty.ts')).toBeTruthy()
    expect(api.calls.status).toBe(1)
  })

  it('keeps the newest diff when an older diff request resolves late', async () => {
    let releaseFirst!: (value: Awaited<ReturnType<ChangesApi['diff']>>) => void
    const first = new Promise<Awaited<ReturnType<ChangesApi['diff']>>>((resolve) => { releaseFirst = resolve })
    const racing = fakeApi({
      diff: async (_root, path) => path === 'dirty.ts' ? first : { ok: true, value: { content: 'second diff', truncated: false } },
    })
    root.render(createElement(ChangesPanel, { stores, api: racing }))
    await settle()
    rowOf(owner, 'dirty.ts').click()
    await settle()
    ;(owner.querySelector('button[aria-label="Back to changes"]') as HTMLButtonElement).click()
    await settle()
    rowOf(owner, 'staged.ts').click()
    await settle()
    releaseFirst({ ok: true, value: { content: 'stale diff', truncated: false } })
    await settle()
    expect(owner.textContent).toContain('second diff')
    expect(owner.textContent).not.toContain('stale diff')
  })

  it('drops in-flight results when the workspace root switches mid-request', async () => {
    let releaseFirst!: (value: ChangesStatusPayload | null) => void
    const first = new Promise<ChangesStatusPayload | null>((resolve) => { releaseFirst = resolve })
    const statuses: (ChangesStatusPayload | null | Promise<ChangesStatusPayload | null>)[] = [
      first,
      { ...STATUS, branch: 'other', staged: [], unstaged: [], untracked: [] },
    ]
    const api = fakeApi({ status: async () => statuses.shift() ?? null })
    root.render(createElement(ChangesPanel, { stores, api }))
    await settle()
    stores.overview.update((prev) => ({ ...prev, root: 'D:/other' }))
    await settle()
    releaseFirst(STATUS)
    await settle()
    expect(owner.textContent).toContain('Clean working tree')
    expect(owner.textContent).not.toContain('dirty.ts')
  })

  it('ignores a completed write after the workspace switches', async () => {
    let releaseWrite!: (value: Awaited<ReturnType<ChangesApi['stage']>>) => void
    const pending = new Promise<Awaited<ReturnType<ChangesApi['stage']>>>((resolve) => { releaseWrite = resolve })
    const statuses = [STATUS, { ...STATUS, branch: 'other', staged: [], unstaged: [], untracked: [] }]
    let statusCalls = 0
    const api = fakeApi({
      status: async () => { statusCalls += 1; return statuses.shift() ?? null },
      stage: async () => pending,
    })
    root.render(createElement(ChangesPanel, { stores, api }))
    await settle()
    actionOf(owner, 'dirty.ts', 'Stage').click()
    await settle()
    stores.overview.update((prev) => ({ ...prev, root: 'D:/other' }))
    await settle()
    releaseWrite({ ok: true, value: {} })
    await settle()
    expect(statusCalls).toBe(2)
    expect(owner.textContent).toContain('Clean working tree')
    expect(owner.textContent).not.toContain('dirty.ts')
  })

  it('unmounts cleanly with requests in flight', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    const never = new Promise<ChangesStatusPayload | null>(() => {})
    const api = fakeApi({ status: async () => never })
    root.render(createElement(ChangesPanel, { stores, api }))
    await settle()
    root.unmount()
    await settle()
    expect(silence).not.toHaveBeenCalled()
    silence.mockRestore()
  })

  it('shows local states for non-repositories, failures, and missing sessions', async () => {
    const notRepository = fakeApi({ status: async () => null })
    root.render(createElement(ChangesPanel, { stores, api: notRepository }))
    await settle()
    expect(owner.textContent).toContain('The current workspace is not a Git repository')

    const failureOwner = document.createElement('div')
    document.body.append(failureOwner)
    const failureRoot = createRoot(failureOwner)
    failureRoot.render(createElement(ChangesPanel, { stores, api: fakeApi({ status: async () => undefined }) }))
    await settle()
    expect(failureOwner.textContent).toContain('Change status read failed')
    failureRoot.unmount()

    const second = document.createElement('div')
    document.body.append(second)
    const secondRoot = createRoot(second)
    const noSession = createWorkbenchStores()
    secondRoot.render(createElement(ChangesPanel, { stores: noSession, api: fakeApi() }))
    await settle()
    expect(second.textContent).toContain('No active session')
    secondRoot.unmount()
  })

  it('registers as workbench-changes:changes (non-builtin), unregisters, and isolates sibling failures', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = new WorkbenchService()
    service.registerRightPanel({
      id: 'overview', order: 10, label: 'Overview', source: 'workbench', builtin: true,
      render: () => createElement('div', null, 'Overview content'),
    })
    const unregisterChanges = service.registerRightPanel({
      id: 'changes', order: 30, label: 'Changes', source: 'workbench-changes',
      render: () => createElement(ChangesPanel, { stores, api: fakeApi() }),
    })
    service.registerRightPanel({
      id: 'broken', order: 40, label: 'Broken', source: 'extension',
      render: () => { throw new Error('boom') },
    })
    const snapshot = service.getRightPanels()
    const changes = snapshot.panels.find((panel) => panel.id === 'workbench-changes:changes')
    expect(changes).toBeTruthy()
    expect(changes!.builtin).toBe(false)
    expect(changes!.order).toBe(30)

    root.render(createElement(WorkbenchRightPanelHost, {
      service, stores, width: 360, details: 'Details', detailsRequestRevision: 0, close: vi.fn(),
    }))
    await settle()
    const tabs = owner.querySelectorAll('[role="tab"]')
    expect(tabs).toHaveLength(4)
    ;(tabs[1] as HTMLButtonElement).click()
    await settle()
    expect(rowOf(owner, 'dirty.ts')).toBeTruthy()
    ;(owner.querySelectorAll('[role="tab"]')[2] as HTMLButtonElement).click()
    await settle()
    expect(owner.textContent).toContain('This component is unavailable')
    ;(owner.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click()
    await settle()
    expect(rowOf(owner, 'dirty.ts')).toBeTruthy()
    await unregisterChanges()
    await settle()
    expect(service.getRightPanels().panels.some((panel) => panel.id === 'workbench-changes:changes')).toBe(false)
    expect(owner.querySelectorAll('[role="tab"]')).toHaveLength(3)
    await service.dispose()
    silence.mockRestore()
  })
})
