import { createElement, type ReactNode } from 'react'
import type { PanelController } from './panel/controller.ts'
import { tt } from './panel/helpers.ts'

export interface WorkbenchSidebarRowRegistration {
  readonly id: string
  readonly slot: 'top' | 'bottom'
  readonly order: number
  readonly label: string
  readonly summary?: () => ReactNode
  readonly expanded?: () => boolean
  readonly onHostPresenceChange?: (present: boolean) => void
  readonly toggle: () => void | Promise<void>
}

export interface WorkbenchSidebarRowService {
  registerSidebarRow(row: WorkbenchSidebarRowRegistration): () => void | Promise<void>
  refreshSidebarRow(rowId?: string): void
}

export function registerSshWorkbenchRow(
  service: WorkbenchSidebarRowService | undefined,
  controller: PanelController,
): () => void {
  if (service === undefined) return () => {}
  const rowId = 'ssh'
  const unregister = service.registerSidebarRow({
    id: rowId,
    slot: 'top',
    order: 20,
    label: tt('entry.label'),
    summary: () => createElement('span', null, tt('entry.label')),
    expanded: () => controller.getSnapshot().panelOpen,
    onHostPresenceChange: (present) => {
      document.documentElement.toggleAttribute('data-dsh-workbench-ssh-row', present)
    },
    toggle: () => controller.toggle(),
  })
  const unsubscribe = controller.subscribe(() => service.refreshSidebarRow(rowId))
  return () => {
    document.documentElement.removeAttribute('data-dsh-workbench-ssh-row')
    unsubscribe()
    void unregister()
  }
}
