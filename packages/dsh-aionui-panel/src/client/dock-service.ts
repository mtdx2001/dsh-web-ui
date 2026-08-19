import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { ExplorerStore } from './store.ts'

const BUILTIN_TAB_IDS = new Set(['files', 'changes'])
const EXTENSION_RESTORE_GRACE_MS = 5_000

export interface AionUiDockTabRegistration {
  id: string
  order: number
  label: string | (() => string)
  render: () => ReactNode
  onActiveChange?: (active: boolean) => void
}

export interface AionUiDockTabSnapshot {
  revision: number
  tabs: readonly AionUiDockTabRegistration[]
}

export interface AionUiDockTabItem {
  id: string
  label: string
  order: number
}

/** Merge built-in and extension tabs into one deterministic Explorer order. */
export function orderedExplorerTabs(
  tabs: readonly AionUiDockTabRegistration[],
  labels: { files: string; changes: string },
): AionUiDockTabItem[] {
  return [
    { id: 'files', label: labels.files, order: 20 },
    { id: 'changes', label: labels.changes, order: 30 },
    ...tabs.map((tab) => ({
      id: tab.id,
      label: typeof tab.label === 'function' ? tab.label() : tab.label,
      order: tab.order,
    })),
  ].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export interface AionUiPanelServiceFace {
  registerDockTab(tab: AionUiDockTabRegistration): () => void
  getDockTabs(): AionUiDockTabSnapshot
  subscribeDockTabs(listener: () => void): () => void
  getActiveDockTab(): string
  subscribeActiveDockTab(listener: () => void): () => void
  activateDockTab(id: string): boolean
}

function validateTab(tab: AionUiDockTabRegistration): void {
  if (!/^[a-z][a-z0-9-]*$/.test(tab.id) || BUILTIN_TAB_IDS.has(tab.id)) {
    throw new Error(`Invalid AionUI dock tab id: ${tab.id}`)
  }
  if (!Number.isFinite(tab.order) || tab.order < 0) throw new Error(`Invalid AionUI dock tab order: ${tab.order}`)
  if ((typeof tab.label === 'string' && tab.label.trim() === '') || typeof tab.render !== 'function') {
    throw new Error(`Invalid AionUI dock tab registration: ${tab.id}`)
  }
}

export class AionUiPanelService implements AionUiPanelServiceFace {
  private readonly tabs = new Map<string, AionUiDockTabRegistration>()
  private readonly dockListeners = new Set<() => void>()
  private readonly activeListeners = new Set<() => void>()
  private snapshot: AionUiDockTabSnapshot = { revision: 0, tabs: [] }
  private activeId = 'files'
  private pendingRestoreId: string | undefined
  /** The explorer a pending restore belongs to (rebind/unbind invalidates it). */
  private pendingRestoreExplorer: ExplorerStore | undefined
  private restoreTimer: ReturnType<typeof setTimeout> | undefined
  private explorer: ExplorerStore | undefined
  private disposeExplorer: (() => void) | undefined
  private disposed = false

  registerDockTab(tab: AionUiDockTabRegistration): () => void {
    if (this.disposed) throw new Error('AionUI panel service is disposed')
    validateTab(tab)
    if (this.tabs.has(tab.id)) throw new Error(`AionUI dock tab already registered: ${tab.id}`)
    this.tabs.set(tab.id, tab)
    this.publishTabs()
    const shouldRestore = this.pendingRestoreId === tab.id
    if (shouldRestore && this.explorer !== undefined) {
      this.pendingRestoreId = undefined
      if (this.restoreTimer !== undefined) clearTimeout(this.restoreTimer)
      this.restoreTimer = undefined
      this.activateDockTab(tab.id)
    } else {
      tab.onActiveChange?.(this.activeId === tab.id)
    }
    let active = true
    return () => {
      // Idempotent: a second call, or any call after dispose(), is a no-op —
      // the service already delivered onActiveChange(false) and cleared the
      // registry, so re-firing them would double-notify the owner.
      if (!active || this.disposed) return
      active = false
      const wasActive = this.activeId === tab.id
      this.tabs.delete(tab.id)
      // The tab leaves while active: its owner must hear the deactivation
      // (setActiveId cannot deliver it — the tab is already out of the map).
      if (wasActive) tab.onActiveChange?.(false)
      if (wasActive) this.explorer?.setActiveTab('files')
      if (this.pendingRestoreId === tab.id) this.clearPendingRestore()
      this.publishTabs()
      if (wasActive && this.activeId === tab.id) this.setActiveId('files')
    }
  }

  getDockTabs = (): AionUiDockTabSnapshot => this.snapshot

  subscribeDockTabs = (listener: () => void): (() => void) => {
    this.dockListeners.add(listener)
    return () => { this.dockListeners.delete(listener) }
  }

  getActiveDockTab = (): string => this.activeId

  subscribeActiveDockTab = (listener: () => void): (() => void) => {
    this.activeListeners.add(listener)
    return () => { this.activeListeners.delete(listener) }
  }

  activateDockTab(id: string): boolean {
    if (this.disposed || (!BUILTIN_TAB_IDS.has(id) && !this.tabs.has(id))) return false
    if (this.explorer === undefined) return false
    this.explorer.setActiveTab(id)
    this.setActiveId(id)
    return true
  }

  bindExplorer(explorer: ExplorerStore): () => void {
    // Rebinding replaces the previous binding wholesale: its subscription and
    // any pending restore timer die here, never against the new explorer.
    this.unbindExplorer()
    this.explorer = explorer
    const sync = (): void => {
      const id = explorer.getSnapshot().activeTab
      if (!BUILTIN_TAB_IDS.has(id) && !this.tabs.has(id)) {
        if (this.pendingRestoreId !== id || this.pendingRestoreExplorer !== explorer) {
          this.schedulePendingRestore(id, explorer)
        }
        return
      }
      if (this.pendingRestoreId !== undefined) this.clearPendingRestore()
      this.setActiveId(id)
    }
    const subscription = explorer.subscribe(sync)
    this.disposeExplorer = subscription
    sync()
    let bound = true
    return () => {
      if (!bound) return
      bound = false
      subscription()
      // Disposing a stale binding must not cut the current subscription (the
      // rebind already replaced this.disposeExplorer).
      if (this.disposeExplorer === subscription) this.disposeExplorer = undefined
      if (this.explorer === explorer) this.explorer = undefined
      if (this.pendingRestoreExplorer === explorer) this.clearPendingRestore()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearPendingRestore()
    this.disposeExplorer?.()
    this.disposeExplorer = undefined
    this.explorer = undefined
    for (const tab of this.tabs.values()) tab.onActiveChange?.(false)
    this.tabs.clear()
    this.publishTabs()
    this.activeListeners.clear()
    this.dockListeners.clear()
  }

  /** Drop the current explorer binding and any restore pending against it. */
  private unbindExplorer(): void {
    this.disposeExplorer?.()
    this.disposeExplorer = undefined
    this.explorer = undefined
    this.clearPendingRestore()
  }

  private clearPendingRestore(): void {
    this.pendingRestoreId = undefined
    this.pendingRestoreExplorer = undefined
    if (this.restoreTimer !== undefined) clearTimeout(this.restoreTimer)
    this.restoreTimer = undefined
  }

  private schedulePendingRestore(id: string, explorer: ExplorerStore): void {
    this.clearPendingRestore()
    this.pendingRestoreId = id
    this.pendingRestoreExplorer = explorer
    this.restoreTimer = setTimeout(() => {
      if (this.pendingRestoreId !== id || this.pendingRestoreExplorer !== explorer || this.disposed) return
      this.clearPendingRestore()
      // Grace expired without the extension registering: fall the VIEW back to
      // Files in memory only. The persisted per-root tab preference keeps the
      // extension id, so the next session retries the restore instead of
      // finding its preference silently overwritten (setActiveTab persists).
      explorer.update((prev) => (prev.activeTab === id ? { ...prev, activeTab: 'files' } : prev))
    }, EXTENSION_RESTORE_GRACE_MS)
  }

  private publishTabs(): void {
    this.snapshot = {
      revision: this.snapshot.revision + 1,
      tabs: [...this.tabs.values()].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
    }
    for (const listener of this.dockListeners) listener()
  }

  private setActiveId(id: string): void {
    if (id === this.activeId) return
    const previous = this.tabs.get(this.activeId)
    this.activeId = id
    previous?.onActiveChange?.(false)
    this.tabs.get(id)?.onActiveChange?.(true)
    for (const listener of this.activeListeners) listener()
  }
}

export function provideAionUiPanelService(ctx: Context): AionUiPanelService {
  const service = new AionUiPanelService()
  ctx.effect(() => {
    const unprovide = ctx.provide('aionuiPanel', service)
    return async () => {
      service.dispose()
      await unprovide()
    }
  }, 'dsh-aionui-panel: dock tab service')
  return service
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional extension surface owned and rendered by dsh-aionui-panel. */
    aionuiPanel: AionUiPanelServiceFace
  }
}
