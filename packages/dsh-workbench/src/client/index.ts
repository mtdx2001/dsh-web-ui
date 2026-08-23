/**
 * Workbench browser half. Status and module navigation contribute through
 * official slots. Runtime reads, optional contributions, and observers start only
 * after the shell has painted; dormant Overview DOM integration stays disabled.
 * @module dsh-workbench/client
 */

import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { ComponentSettingsSection } from './ComponentSettingsSection.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { createWorkbenchStores } from '../core/store.ts'
import { CustomComponentService } from '../core/custom-components.ts'
import { afterFirstPaint } from './after-first-paint.ts'
import { startController } from './controller.ts'
import { StatusBar } from './status-bar.tsx'
import { OverviewPanel } from './OverviewPanel.tsx'
import { FilesPanel } from './FilesPanel.tsx'
import { ChangesPanel } from './ChangesPanel.tsx'
import { SidebarRows, type SidebarRowsOwnerProps } from './SidebarRows.tsx'
import { registerBuiltinModules } from './builtin-modules.ts'
import { registerBuiltinSidebarRows } from './builtin-sidebar-rows.tsx'
import { WorkbenchRightPanelHost, type WorkbenchRightPanelOwnerProps } from './WorkbenchRightPanelHost.tsx'
import { WorkbenchMainSurfaceHost, type WorkbenchMainSurfaceOwnerProps } from './WorkbenchMainSurfaceHost.tsx'
import { BranchIcon, FolderIcon } from './icons.tsx'
import { dictionaries, NS, setLanguage, t, type WorkbenchKey } from './locales.ts'
import { provideWorkbenchService } from './workbench-service.ts'
import { registerCustomComponents } from './custom-component-runtime.tsx'
import { loadMainSurfaceState, saveMainSurfaceState } from './main-surface-persistence.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workbench surface copy. */
    'workbench': WorkbenchKey
  }

  interface SlotMap {
    /** Official ui-layout additive frame overlay seat. */
    'shell.overlay': { kind: 'list'; scope: 'root' }
    /** Optional future Sidebar-owned row stack after New Session. */
    'sidebar.rows.top': { kind: 'list'; scope: 'root'; owner: SidebarRowsOwnerProps }
    /** Optional future Sidebar-owned row stack before Settings. */
    'sidebar.rows.bottom': { kind: 'list'; scope: 'root'; owner: SidebarRowsOwnerProps }
    /** Optional official settings section for component management. */
    'settings.section': { kind: 'list'; scope: 'root' }
    /** Optional Conversation-owned central main-surface host. */
    'conversation.mainSurface': { kind: 'single'; scope: 'session-maybe'; owner: WorkbenchMainSurfaceOwnerProps }
    /** Optional Desktop-owned right-sidebar host. */
    'desktop.rightSidebar': { kind: 'single'; scope: 'session-maybe'; owner: WorkbenchRightPanelOwnerProps & { details: import('react').ReactNode; detailsRequestRevision: number; close: () => void } }
  }
}

/** Required services: official runtime projections, slots, and locale. */
export const inject = ['sessions', 'workspaces', 'slots', 'locale', 'connection']

const APPLIED = Symbol.for('dsh-workbench.client-applied')

export { afterFirstPaint } from './after-first-paint.ts'

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  const registry = ctx as ClientContext & { [APPLIED]?: boolean }
  if (registry[APPLIED] === true) return
  registry[APPLIED] = true
  ctx.effect(() => () => { registry[APPLIED] = false }, 'dsh-workbench: apply claim')
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-workbench: dictionaries')
  const service = provideWorkbenchService(ctx)
  const localeT = ctx.locale.bind(NS) as (key: WorkbenchKey) => string

  const stores = createWorkbenchStores()
  const customComponents = new CustomComponentService()
  const getLayout = (): { openRightSidebar?: () => void } | undefined => {
    const getService = (ctx as unknown as { get?: (name: string, strict?: boolean) => unknown }).get
    return typeof getService === 'function' ? getService.call(ctx, 'layout', false) as { openRightSidebar?: () => void } | undefined : undefined
  }
  setLanguage(document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en')

  // Keep the contribution in the official React tree. Registration failures
  // degrade this surface only and cannot abort browser plugin startup.
  try {
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'workbench-status',
      order: 80,
      locale: NS,
    }, () => createElement(StatusBar, { stores, openRightSidebar: () => { getLayout()?.openRightSidebar?.() } })))
  } catch (error) {
    console.error('[dsh-workbench] status utility registration failed:', error)
  }

  try {
    ctx.slots.inject('conversation.mainSurface', () => ctx.slots.register({
      name: 'conversation.mainSurface', locale: NS,
    }, (props) => createElement(WorkbenchMainSurfaceHost, { ...props, service })))
  } catch (error) {
    console.error('[dsh-workbench] main-surface host registration failed:', error)
  }

  try {
    ctx.slots.inject('desktop.rightSidebar', () => ctx.slots.register({
      name: 'desktop.rightSidebar', locale: NS,
    }, (props) => createElement(WorkbenchRightPanelHost, { ...props, service, stores })))
  } catch (error) {
    console.error('[dsh-workbench] right-sidebar host registration failed:', error)
  }

  for (const slot of ['top', 'bottom'] as const) {
    const name = `sidebar.rows.${slot}` as const
    try {
      ctx.slots.inject(name, () => ctx.slots.register({
        name,
        id: `workbench-${slot}-rows`,
        order: 10,
      }, ({ wide }) => createElement(SidebarRows, { service, slot, wide })))
    } catch (error) {
      console.error(`[dsh-workbench] ${slot} sidebar row injection failed:`, error)
    }
  }

  ctx.effect(() => {
    const disposers: Array<() => void | Promise<void>> = []
    let disposed = false
    const cancelStart = afterFirstPaint(() => {
      if (disposed) return
      const mainSurfaceState = service.getMainSurfaceState()
      const persistenceAbort = new AbortController()
      mainSurfaceState.setWriter(async (value) => { await saveMainSurfaceState(value) })
      disposers.push(() => { persistenceAbort.abort(); mainSurfaceState.setWriter(undefined) })
      void loadMainSurfaceState(persistenceAbort.signal).then((value) => {
        if (!disposed && value !== undefined) mainSurfaceState.hydrate(value)
      }, () => undefined)
      try {
        disposers.push(startController(ctx, stores, service.getComponentPreferences()))
      } catch (error) {
        console.error('[dsh-workbench] runtime controller failed:', error)
      }
      try {
        disposers.push(registerBuiltinSidebarRows(service, stores, ctx.sessions))
        disposers.push(registerCustomComponents(service, customComponents))
      } catch (error) {
        console.error('[dsh-workbench] sidebar host mounting failed:', error)
      }
      try {
        disposers.push(registerBuiltinModules(service))
      } catch (error) {
        console.error('[dsh-workbench] built-in module registration failed:', error)
      }
      try {
        const componentPreferences = service.getComponentPreferences()
        disposers.push(service.registerRightPanel({
          id: 'overview', order: 10, label: () => t('overview.tab'), source: 'workbench', builtin: true,
          render: () => createElement(OverviewPanel, { stores }),
        }))
        try {
          disposers.push(service.registerRightPanel({
            id: 'files', order: 20, label: () => t('files.tab'), source: 'workbench-files',
            icon: () => createElement(FolderIcon, { size: 16 }),
            render: () => createElement(FilesPanel, { stores }),
          }))
        } catch (error) {
          console.error('[dsh-workbench] files right-panel registration failed:', error)
        }
        try {
          disposers.push(service.registerRightPanel({
            id: 'changes', order: 30, label: () => t('changes.tab'), source: 'workbench-changes',
            icon: () => createElement(BranchIcon, { size: 16 }),
            render: () => createElement(ChangesPanel, { stores }),
          }))
        } catch (error) {
          console.error('[dsh-workbench] changes right-panel registration failed:', error)
        }
        try {
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section', id: 'workbench-components', order: 115, label: () => localeT('settings.components.title'), locale: NS,
          }, (props) => createElement(ComponentSettingsSection, { ...props, service: componentPreferences, mainSurface: service.getMainSurfaceState(), custom: customComponents })))
        } catch (error) {
          console.error('[dsh-workbench] component settings registration failed:', error)
        }
      } catch (error) {
        console.error('[dsh-workbench] right-sidebar component registration failed:', error)
      }
      const syncLanguage = (): void => {
        setLanguage(document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en')
        service.refresh()
        service.refreshSidebarRow()
        service.refreshRightPanel()
        service.refreshMainSurface()
      }
      const langObserver = new MutationObserver(syncLanguage)
      langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
      disposers.push(() => langObserver.disconnect())
    })
    return async () => {
      disposed = true
      cancelStart()
      for (const dispose of disposers.splice(0).reverse()) await dispose()
    }
  }, 'dsh-workbench: deferred runtime wiring')
}
