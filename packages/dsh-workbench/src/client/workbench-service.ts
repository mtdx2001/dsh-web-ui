import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { ModuleRegistry, type ModuleRegistrySnapshot, type WorkbenchModuleRegistration } from '../core/module-registry.ts'
import { NavigationController, type NavigationResult, type NavigationSnapshot } from '../core/navigation-state.ts'
import { SidebarRowRegistry, type SidebarRowRegistration, type SidebarRowRegistrySnapshot } from '../core/row-registry.ts'

export type WorkbenchModuleDisposer = () => void | Promise<void>

export interface AionUiDockTabRegistration {
  id: string
  order: number
  label: string | (() => string)
  render: () => ReactNode
  onActiveChange?: (active: boolean) => void
}

export interface AionUiPanelServiceFace {
  registerDockTab(tab: AionUiDockTabRegistration): () => void
  activateDockTab(id: string): boolean
  getActiveDockTab(): string
  subscribeActiveDockTab(listener: () => void): () => void
}

export interface WorkbenchServiceFace {
  register(module: WorkbenchModuleRegistration): WorkbenchModuleDisposer
  registerSidebarRow(row: SidebarRowRegistration): WorkbenchModuleDisposer
  refreshSidebarRow(rowId?: string): void
  getSidebarRows(): SidebarRowRegistrySnapshot
  getSidebarRow(rowId: string): SidebarRowRegistration | undefined
  subscribeSidebarRows(listener: () => void): () => void
  refresh(moduleId?: string): void
  getModules(): ModuleRegistrySnapshot
  subscribeModules(listener: () => void): () => void
  activate(moduleId: string): Promise<NavigationResult>
  /** Synchronize state already changed by a legacy host entry. */
  adopt(moduleId: string | undefined): Promise<NavigationResult>
  deactivate(): Promise<NavigationResult>
  getNavigation(): NavigationSnapshot
  subscribeNavigation(listener: () => void): () => void
}

export class WorkbenchService implements WorkbenchServiceFace {
  private readonly registry = new ModuleRegistry()
  private readonly rows = new SidebarRowRegistry()
  private readonly navigation = new NavigationController(this.registry)
  private disposal: Promise<void> | undefined
  private disposed = false

  register(module: WorkbenchModuleRegistration): WorkbenchModuleDisposer {
    if (this.disposed) throw new Error('Workbench service is disposed')
    const unregister = this.registry.register(module)
    let active = true
    return async () => {
      if (!active) return
      active = false
      const snapshot = this.navigation.getSnapshot()
      if (snapshot.targetId === module.id) {
        unregister()
        await this.navigation.settle()
        return
      }
      if (snapshot.activeId === module.id) await this.navigation.deactivate()
      unregister()
    }
  }

  registerSidebarRow(row: SidebarRowRegistration): WorkbenchModuleDisposer {
    if (this.disposed) throw new Error('Workbench service is disposed')
    return this.rows.register(row)
  }

  refreshSidebarRow(rowId?: string): void {
    if (this.disposed) return
    this.rows.refresh(rowId)
  }

  getSidebarRows(): SidebarRowRegistrySnapshot {
    return this.rows.getSnapshot()
  }

  getSidebarRow(rowId: string): SidebarRowRegistration | undefined {
    return this.rows.get(rowId)
  }

  subscribeSidebarRows(listener: () => void): () => void {
    return this.rows.subscribe(listener)
  }

  refresh(moduleId?: string): void {
    if (this.disposed) return
    this.registry.refresh(moduleId)
  }

  getModules(): ModuleRegistrySnapshot {
    return this.registry.getSnapshot()
  }

  subscribeModules(listener: () => void): () => void {
    return this.registry.subscribe(listener)
  }

  activate(moduleId: string): Promise<NavigationResult> {
    return this.navigation.activate(moduleId)
  }

  adopt(moduleId: string | undefined): Promise<NavigationResult> {
    return this.navigation.adopt(moduleId)
  }

  deactivate(): Promise<NavigationResult> {
    return this.navigation.deactivate()
  }

  getNavigation(): NavigationSnapshot {
    return this.navigation.getSnapshot()
  }

  subscribeNavigation(listener: () => void): () => void {
    return this.navigation.subscribe(listener)
  }

  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    return this.disposal = (async () => {
      await this.navigation.dispose()
      this.rows.clear()
      this.registry.clear()
    })()
  }
}

/** Provide the optional registry face for workbench-aware client plugins. */
export function provideWorkbenchService(ctx: Context): WorkbenchService {
  const service = new WorkbenchService()
  ctx.effect(() => {
    const unprovide = ctx.provide('workbench', service)
    return async () => {
      await service.dispose()
      await unprovide()
    }
  }, 'dsh-workbench: module registry service')
  return service
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional module registry for workbench-aware client plugins. */
    workbench: WorkbenchServiceFace
    /** Optional AionUI-owned Explorer Dock extension. */
    aionuiPanel: AionUiPanelServiceFace
  }
}
