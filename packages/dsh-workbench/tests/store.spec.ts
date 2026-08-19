import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkbenchStores, uiSetRoot } from '../src/core/store.ts'

describe('workbench project UI state', () => {
  beforeEach(() => localStorage.clear())

  it('persists Overview activation per project root', () => {
    const stores = createWorkbenchStores()
    stores.overview.update((prev) => ({ ...prev, root: 'E:\\a' }))
    stores.setOverviewActive(true)
    expect(JSON.parse(localStorage.getItem('dsh-workbench-ui:E:\\a') ?? '{}')).toEqual({ overviewActive: true })
    uiSetRoot(stores, 'E:\\b')
    expect(stores.ui.getSnapshot().overviewActive).toBe(false)
    uiSetRoot(stores, 'E:\\a')
    expect(stores.ui.getSnapshot().overviewActive).toBe(true)
  })

  it('notifies only on changed references', () => {
    const stores = createWorkbenchStores()
    const listener = vi.fn()
    stores.ui.subscribe(listener)
    stores.ui.update((prev) => prev)
    expect(listener).not.toHaveBeenCalled()
  })
})
