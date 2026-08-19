import { createElement, type ReactNode } from 'react'
import type { BoardController } from '../core/controller.ts'
import { t } from './locales.ts'
import styles from './workbench-row.module.css'

export interface WorkbenchSidebarRowRegistration {
  readonly id: string
  readonly slot: 'top' | 'bottom'
  readonly order: number
  readonly label: string
  readonly summary?: () => ReactNode
  readonly details?: () => ReactNode
  readonly expanded?: () => boolean
  readonly onHostPresenceChange?: (present: boolean) => void
  readonly toggle: () => void | Promise<void>
}

export interface WorkbenchSidebarRowService {
  registerSidebarRow(row: WorkbenchSidebarRowRegistration): () => void | Promise<void>
  refreshSidebarRow(rowId?: string): void
}

function taskSummary(controller: BoardController): ReactNode {
  const tasks = controller.getSnapshot().tasks
  const running = tasks.filter((task) => task.status === 'running').length
  const open = tasks.filter((task) => task.status !== 'done' && task.status !== 'failed').length
  return createElement('span', { className: styles.summary }, [
    createElement('span', { className: styles.label, key: 'label' }, t('entry.label')),
    createElement('span', { className: styles.count, key: 'count' }, running > 0 ? `${running}/${open}` : String(open)),
  ])
}

function taskDetails(controller: BoardController): ReactNode {
  const tasks = controller.getSnapshot().tasks
    .filter((task) => task.status !== 'done')
    .slice(0, 3)
  if (tasks.length === 0) return createElement('div', { className: styles.empty }, t('board.empty'))
  return createElement('ul', { className: styles.list }, tasks.map((task) => createElement('li', {
    className: styles.item,
    key: task.id,
  }, task.title)))
}

export function registerTaskBoardWorkbenchRow(
  service: WorkbenchSidebarRowService | undefined,
  controller: BoardController,
): () => void {
  if (service === undefined) return () => {}
  const rowId = 'task-board'
  const unregister = service.registerSidebarRow({
    id: rowId,
    slot: 'top',
    order: 10,
    label: t('entry.label'),
    summary: () => taskSummary(controller),
    details: () => taskDetails(controller),
    expanded: () => controller.getSnapshot().boardOpen,
    onHostPresenceChange: (present) => {
      document.documentElement.toggleAttribute('data-dsh-workbench-task-row', present)
    },
    toggle: () => controller.toggleBoard(),
  })
  const unsubscribe = controller.subscribe(() => service.refreshSidebarRow(rowId))
  return () => {
    document.documentElement.removeAttribute('data-dsh-workbench-task-row')
    unsubscribe()
    void unregister()
  }
}
