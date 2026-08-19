/**
 * Workbench browser half. Status and module navigation contribute through
 * official slots. Runtime reads, optional adapters, and observers start only
 * after the shell has painted; dormant Overview DOM integration stays disabled.
 * @module dsh-workbench/client
 */

import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { createWorkbenchStores } from '../core/store.ts'
import { afterFirstPaint } from './after-first-paint.ts'
import { startController } from './controller.ts'
import { StatusBar } from './status-bar.tsx'
import { WorkbenchOverlay } from './WorkbenchOverlay.tsx'
import { OverviewPanel } from './OverviewPanel.tsx'
import { SidebarRows, type SidebarRowsOwnerProps } from './SidebarRows.tsx'
import { registerBuiltinModules } from './builtin-modules.ts'
import { dictionaries, NS, setLanguage, t, type WorkbenchKey } from './locales.ts'
import { provideWorkbenchService } from './workbench-service.ts'

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
  }
}

/** Required services: official runtime projections, slots, and locale. */
export const inject = ['sessions', 'workspaces', 'slots', 'locale', 'connection']

const APPLIED = Symbol.for('dsh-workbench.client-applied')

export { afterFirstPaint } from './after-first-paint.ts'

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  const registry = globalThis as { [APPLIED]?: boolean }
  if (registry[APPLIED] === true) return
  registry[APPLIED] = true
  ctx.effect(() => () => { registry[APPLIED] = false }, 'dsh-workbench: apply claim')
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-workbench: dictionaries')
  const service = provideWorkbenchService(ctx)

  const stores = createWorkbenchStores()
  setLanguage(document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en')

  // Keep the contribution in the official React tree. Registration failures
  // degrade this surface only and cannot abort browser plugin startup.
  try {
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'workbench-status',
      order: 80,
      locale: NS,
    }, () => createElement(StatusBar, { stores })))
  } catch (error) {
    console.error('[dsh-workbench] status utility registration failed:', error)
  }

  try {
    ctx.slots.inject('shell.overlay', () => {
      try {
        return ctx.slots.register({
          name: 'shell.overlay',
          id: 'workbench-navigation',
          order: 30,
          locale: NS,
        }, () => createElement(WorkbenchOverlay, { service, stores, sessions: ctx.sessions }))
      } catch (error) {
        console.error('[dsh-workbench] navigation overlay registration failed:', error)
        return () => {}
      }
    })
  } catch (error) {
    console.error('[dsh-workbench] navigation overlay injection failed:', error)
  }

  for (const slot of ['top', 'bottom'] as const) {
    const name = `sidebar.rows.${slot}` as const
    try {
      ctx.slots.inject(name, () => {
        try {
          return ctx.slots.register({
            name,
            id: `workbench-${slot}-rows`,
            order: 10,
          }, ({ wide }) => createElement(SidebarRows, { service, slot, wide }))
        } catch (error) {
          console.error(`[dsh-workbench] ${slot} sidebar row registration failed:`, error)
          return () => {}
        }
      })
    } catch (error) {
      console.error(`[dsh-workbench] ${slot} sidebar row injection failed:`, error)
    }
  }

  ctx.effect(() => {
    const disposers: Array<() => void | Promise<void>> = []
    let disposed = false
    const cancelStart = afterFirstPaint(() => {
      if (disposed) return
      try {
        disposers.push(startController(ctx, stores))
      } catch (error) {
        console.error('[dsh-workbench] runtime controller failed:', error)
      }
      try {
        disposers.push(registerBuiltinModules(service))
      } catch (error) {
        console.error('[dsh-workbench] built-in module registration failed:', error)
      }
      try {
        const getService = (ctx as unknown as { get?: (name: string, strict?: boolean) => unknown }).get
        const aionuiPanel = typeof getService === 'function'
          ? getService.call(ctx, 'aionuiPanel', false) as import('./workbench-service.ts').AionUiPanelServiceFace | undefined
          : undefined
        if (aionuiPanel !== undefined) {
          let suppressActivePersistence = true
          let restoreTimer: ReturnType<typeof setTimeout> | undefined
          let restoreAttempts = 0
          const cancelRestore = (): void => {
            if (restoreTimer !== undefined) clearTimeout(restoreTimer)
            restoreTimer = undefined
            restoreAttempts = 0
          }
          const syncActive = (active: boolean): void => {
            if (active) cancelRestore()
            if (!suppressActivePersistence && stores.ui.getSnapshot().overviewActive !== active) stores.setOverviewActive(active)
          }
          const unregisterOverview = aionuiPanel.registerDockTab({
            id: 'overview',
            order: 10,
            label: () => t('overview.tab'),
            render: () => createElement(OverviewPanel, { stores }),
            onActiveChange: syncActive,
          })
          const unsubscribeActive = aionuiPanel.subscribeActiveDockTab(() => {
            syncActive(aionuiPanel.getActiveDockTab() === 'overview')
          })
          const tryRestoreOverview = (): void => {
            restoreTimer = undefined
            if (!stores.ui.getSnapshot().overviewActive || aionuiPanel.getActiveDockTab() === 'overview') return
            if (aionuiPanel.activateDockTab('overview')) return
            restoreAttempts += 1
            if (restoreAttempts < 20) restoreTimer = setTimeout(tryRestoreOverview, 250)
          }
          const syncRestorePreference = (): void => {
            if (!stores.ui.getSnapshot().overviewActive) {
              cancelRestore()
              return
            }
            if (restoreTimer === undefined && aionuiPanel.getActiveDockTab() !== 'overview') tryRestoreOverview()
          }
          const unsubscribeRestorePreference = stores.ui.subscribe(syncRestorePreference)
          suppressActivePersistence = false
          syncRestorePreference()
          disposers.push(() => {
            suppressActivePersistence = true
            cancelRestore()
            unsubscribeRestorePreference()
            unsubscribeActive()
            unregisterOverview()
          })
        }
      } catch (error) {
        console.error('[dsh-workbench] overview dock registration failed:', error)
      }
      const syncLanguage = (): void => {
        setLanguage(document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en')
        service.refresh()
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
