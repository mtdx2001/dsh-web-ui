/**
 * Framework-free state primitive of the workbench (the same minimal
 * subscribe/getSnapshot shape the sibling panel packages use), plus the
 * workbench store bundle: the live overview snapshot and the per-project UI
 * state. All reducers are pure; async work lives in the client controller.
 * @module dsh-workbench/core/store
 */

import { DEFAULT_UI_STATE, EMPTY_OVERVIEW, type OverviewSnapshot, type WorkbenchUiState } from './types.ts'
import { readUiState, writeUiState } from './persist.ts'

/** A minimal external store usable with useSyncExternalStore. */
export interface StateHandle<S> {
  getSnapshot: () => S
  subscribe: (listener: () => void) => () => void
  /** Pure update: fn receives the previous state and returns the next. */
  update: (fn: (prev: S) => S) => void
}

/** Create a state handle with an immutable snapshot (new object per update). */
export function createState<S>(initial: S): StateHandle<S> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update(fn) {
      const next = fn(state)
      if (next === state) return
      state = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** The workbench store bundle shared by the status bar and the overview. */
export interface WorkbenchStores {
  /** Live overview data (project, session, goal, todos, jobs, ...). */
  overview: StateHandle<OverviewSnapshot>
  /** Per-project UI state (persisted; reloaded on project switch). */
  ui: StateHandle<WorkbenchUiState>
  /** Toggle the compatibility Overview marker; persists against the current project root. */
  setOverviewActive: (active: boolean) => void
  /** Persist the active Workbench-owned right-sidebar component. */
  setActiveRightPanel: (id: string) => void
}

/** Create the store bundle (UI state loads lazily per project root). */
export function createWorkbenchStores(): WorkbenchStores {
  const overview = createState<OverviewSnapshot>(EMPTY_OVERVIEW)
  const ui = createState<WorkbenchUiState>({ ...DEFAULT_UI_STATE })
  return {
    overview,
    ui,
    setOverviewActive(active: boolean): void {
      const root = overview.getSnapshot().root
      ui.update((prev) => (prev.overviewActive === active ? prev : { ...prev, overviewActive: active }))
      writeUiState(root, ui.getSnapshot())
    },
    setActiveRightPanel(id: string): void {
      if (id !== 'details' && !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z][a-z0-9._/-]*:[a-z][a-z0-9-]*$/.test(id)) return
      const root = overview.getSnapshot().root
      ui.update((prev) => (prev.activeRightPanel === id ? prev : { ...prev, activeRightPanel: id, overviewActive: id === 'workbench:overview' }))
      writeUiState(root, ui.getSnapshot())
    },
  }
}

/**
 * Rebind the UI store to another project root: the persisted state of the new
 * root loads (defaults when absent or invalid).
 */
export function uiSetRoot(stores: WorkbenchStores, root: string): void {
  const next = root === '' ? { ...DEFAULT_UI_STATE } : readUiState(root)
  stores.ui.update((prev) => (
    prev.overviewActive === next.overviewActive && prev.activeRightPanel === next.activeRightPanel ? prev : next
  ))
}
