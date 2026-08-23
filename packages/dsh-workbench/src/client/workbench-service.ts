import type { Context } from '@deepseek-ai/cordis'
import { ModuleRegistry, type ModuleRegistrySnapshot, type WorkbenchModuleRegistration } from '../core/module-registry.ts'
import { NavigationController, type NavigationResult, type NavigationSnapshot } from '../core/navigation-state.ts'
import { SidebarRowRegistry, type AdmittedSidebarRowRegistration, type SidebarRowAdmissionResult, type SidebarRowRegistration, type SidebarRowRegistrySnapshot } from '../core/row-registry.ts'
import { ComponentPreferencesService, descriptorsFromDock, descriptorsFromSidebar } from '../core/component-preferences.ts'
import { RightPanelRegistry, type WorkbenchRightPanelRegistration, type WorkbenchRightPanelSnapshot } from '../core/right-panel-registry.ts'
import { MainSurfaceRegistry, type MainSurfaceRegistrySnapshot, type WorkbenchMainSurfaceRegistration } from '../core/main-surface-registry.ts'
import { MainSurfaceStateService } from '../core/main-surface-state.ts'

export type WorkbenchModuleDisposer = () => void | Promise<void>

export interface WorkbenchServiceFace {
  register(module: WorkbenchModuleRegistration): WorkbenchModuleDisposer
  registerSidebarRow(row: SidebarRowRegistration): WorkbenchModuleDisposer
  admitSidebarRow(row: SidebarRowRegistration): SidebarRowAdmissionResult
  refreshSidebarRow(rowId?: string): void
  getSidebarRows(): SidebarRowRegistrySnapshot
  getSidebarRow(rowId: string): AdmittedSidebarRowRegistration | undefined
  subscribeSidebarRows(listener: () => void): () => void
  registerRightPanel(panel: WorkbenchRightPanelRegistration): WorkbenchModuleDisposer
  refreshRightPanel(panelId?: string): void
  getRightPanels(): WorkbenchRightPanelSnapshot
  getRightPanel(panelId: string): WorkbenchRightPanelRegistration | undefined
  subscribeRightPanels(listener: () => void): () => void
  registerMainSurface(mode: WorkbenchMainSurfaceRegistration): WorkbenchModuleDisposer
  refreshMainSurface(modeId?: string): void
  getMainSurfaces(): MainSurfaceRegistrySnapshot
  getMainSurface(modeId: string): WorkbenchMainSurfaceRegistration | undefined
  subscribeMainSurfaces(listener: () => void): () => void
  getMainSurfaceState(): MainSurfaceStateService
  getComponentPreferences(): ComponentPreferencesService
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
  private readonly rightPanels = new RightPanelRegistry()
  private readonly mainSurfaces = new MainSurfaceRegistry()
  private readonly mainSurfaceState = new MainSurfaceStateService()
  private readonly navigation = new NavigationController(this.registry)
  private readonly componentPreferences: ComponentPreferencesService
  private disposal: Promise<void> | undefined
  private disposed = false

  constructor(componentPreferences: ComponentPreferencesService = new ComponentPreferencesService()) {
    this.componentPreferences = componentPreferences
    this.syncSidebarComponents()
  }

  getComponentPreferences(): ComponentPreferencesService { return this.componentPreferences }
  getMainSurfaceState(): MainSurfaceStateService { return this.mainSurfaceState }

  private syncSidebarComponents(): void {
    this.componentPreferences.reconcileCollection('sidebar', descriptorsFromSidebar(this.rows.getSnapshot(), (id) => this.rows.get(id)))
  }

  private syncMainSurfaceComponents(): void {
    this.componentPreferences.reconcileCollection('main-surface', this.mainSurfaces.getSnapshot().modes.map((mode) => ({
      id: mode.id,
      region: 'main-surface' as const,
      label: mode.label,
      source: mode.source,
      order: mode.order,
      defaultEnabled: true,
      removable: true,
      builtin: false,
    })))
  }

  private syncRightPanelComponents(): void {
    this.componentPreferences.reconcileCollection('right-sidebar', descriptorsFromDock(this.rightPanels.getSnapshot().panels.map((panel) => ({
      id: panel.localId,
      order: panel.order,
      label: panel.label,
      source: panel.source,
      kind: panel.builtin ? 'builtin' : 'extension',
    }))))
  }

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
    const unregister = this.rows.register(row)
    this.syncSidebarComponents()
    return () => {
      unregister()
      this.syncSidebarComponents()
    }
  }

  admitSidebarRow(row: SidebarRowRegistration): SidebarRowAdmissionResult {
    if (this.disposed) return { ok: false, diagnostic: { code: 'invalid_registration', message: 'Workbench service is disposed' } }
    const result = this.rows.admit(row)
    if (!result.ok) return result
    this.syncSidebarComponents()
    return {
      ...result,
      dispose: () => {
        result.dispose()
        this.syncSidebarComponents()
      },
    }
  }

  refreshSidebarRow(rowId?: string): void {
    if (this.disposed) return
    this.rows.refresh(rowId)
  }

  getSidebarRows(): SidebarRowRegistrySnapshot {
    return this.rows.getSnapshot()
  }

  getSidebarRow(rowId: string): AdmittedSidebarRowRegistration | undefined {
    return this.rows.get(rowId)
  }

  subscribeSidebarRows(listener: () => void): () => void {
    return this.rows.subscribe(listener)
  }

  registerRightPanel(panel: WorkbenchRightPanelRegistration): WorkbenchModuleDisposer {
    if (this.disposed) throw new Error('Workbench service is disposed')
    const unregister = this.rightPanels.register(panel)
    this.syncRightPanelComponents()
    return () => {
      unregister()
      this.syncRightPanelComponents()
    }
  }

  refreshRightPanel(panelId?: string): void {
    if (this.disposed) return
    this.rightPanels.refresh(panelId)
    this.syncRightPanelComponents()
  }

  getRightPanels(): WorkbenchRightPanelSnapshot { return this.rightPanels.getSnapshot() }
  getRightPanel(panelId: string): WorkbenchRightPanelRegistration | undefined { return this.rightPanels.get(panelId) }
  subscribeRightPanels(listener: () => void): () => void { return this.rightPanels.subscribe(listener) }

  registerMainSurface(mode: WorkbenchMainSurfaceRegistration): WorkbenchModuleDisposer {
    if (this.disposed) throw new Error('Workbench service is disposed')
    const unregister = this.mainSurfaces.register(mode)
    const qualifiedId = `${mode.source?.trim() || 'extension'}:${mode.id.trim()}`
    this.syncMainSurfaceComponents()
    return () => {
      if (this.mainSurfaceState.getSnapshot().activeId === qualifiedId) this.mainSurfaceState.activate('agent')
      unregister()
      this.syncMainSurfaceComponents()
    }
  }

  refreshMainSurface(modeId?: string): void {
    if (this.disposed) return
    this.mainSurfaces.refresh(modeId)
    this.syncMainSurfaceComponents()
  }

  getMainSurfaces(): MainSurfaceRegistrySnapshot { return this.mainSurfaces.getSnapshot() }
  getMainSurface(modeId: string): WorkbenchMainSurfaceRegistration | undefined { return this.mainSurfaces.get(modeId) }
  subscribeMainSurfaces(listener: () => void): () => void { return this.mainSurfaces.subscribe(listener) }

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
      this.mainSurfaceState.activate('agent')
      this.mainSurfaces.clear()
      this.rightPanels.clear()
      this.rows.clear()
      this.registry.clear()
    })()
  }
}

/** Provide the optional registry face for workbench-aware client plugins. */
export function provideWorkbenchService(ctx: Context): WorkbenchService {
  const service = new WorkbenchService(new ComponentPreferencesService())
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
    /** Optional module and right-sidebar registry for workbench-aware client plugins. */
    workbench: WorkbenchServiceFace
  }
}
