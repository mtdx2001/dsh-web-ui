import { beforeEach, describe, expect, it } from 'vitest'
import { readUiState, writeUiState, KEY_UI_PREFIX } from '../src/core/persist.ts'
import { createWorkbenchStores, uiSetRoot } from '../src/core/store.ts'
import { DEFAULT_UI_STATE } from '../src/core/types.ts'

describe('per-project UI persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the UI state under the project key', () => {
    writeUiState('/repo/a', { overviewActive: true, activeRightPanel: 'workbench:overview' })
    expect(localStorage.getItem(`${KEY_UI_PREFIX}/repo/a`)).toBe('{"overviewActive":true,"activeRightPanel":"workbench:overview"}')
    expect(readUiState('/repo/a')).toEqual({ overviewActive: true, activeRightPanel: 'workbench:overview' })
  })

  it('falls back to defaults for missing, broken, or mistyped records', () => {
    expect(readUiState('/repo/missing')).toEqual(DEFAULT_UI_STATE)
    localStorage.setItem(`${KEY_UI_PREFIX}/repo/broken`, 'not json')
    expect(readUiState('/repo/broken')).toEqual(DEFAULT_UI_STATE)
    localStorage.setItem(`${KEY_UI_PREFIX}/repo/mistyped`, '{"overviewActive":"yes"}')
    expect(readUiState('/repo/mistyped')).toEqual({ overviewActive: false, activeRightPanel: 'workbench:overview' })
    localStorage.setItem(`${KEY_UI_PREFIX}/repo/null`, 'null')
    expect(readUiState('/repo/null')).toEqual(DEFAULT_UI_STATE)
  })

  it('never writes the empty root', () => {
    writeUiState('', { overviewActive: true, activeRightPanel: 'workbench:overview' })
    expect(localStorage.length).toBe(0)
    expect(readUiState('')).toEqual(DEFAULT_UI_STATE)
  })
})

describe('workbench stores', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists the overview tab flag against the current project root', () => {
    const stores = createWorkbenchStores()
    stores.overview.update((prev) => ({ ...prev, root: '/repo/a' }))
    stores.setOverviewActive(true)
    expect(stores.ui.getSnapshot().overviewActive).toBe(true)
    expect(readUiState('/repo/a').overviewActive).toBe(true)
  })

  it('reloads the persisted state when the project changes', () => {
    writeUiState('/repo/a', { overviewActive: true, activeRightPanel: 'workbench:overview' })
    const stores = createWorkbenchStores()
    uiSetRoot(stores, '/repo/a')
    expect(stores.ui.getSnapshot().overviewActive).toBe(true)
    uiSetRoot(stores, '/repo/b')
    expect(stores.ui.getSnapshot().overviewActive).toBe(false)
    uiSetRoot(stores, '')
    expect(stores.ui.getSnapshot().overviewActive).toBe(false)
  })

  it('notifies subscribers on state changes only', () => {
    const stores = createWorkbenchStores()
    let calls = 0
    const unsubscribe = stores.ui.subscribe(() => { calls += 1 })
    stores.setOverviewActive(true)
    stores.setOverviewActive(true) // no change: no second notification
    expect(calls).toBe(1)
    unsubscribe()
  })
})
