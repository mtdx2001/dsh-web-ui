import { createElement, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { SidebarRowSlot } from '../core/row-registry.ts'
import type { WorkbenchServiceFace } from './workbench-service.ts'
import styles from './sidebar-rows.module.css'

export interface SidebarRowsOwnerProps {
  readonly wide: boolean
}

export interface SidebarRowsProps extends SidebarRowsOwnerProps {
  readonly service: WorkbenchServiceFace
  readonly slot: SidebarRowSlot
}

function fallbackSummary(label: string): ReactNode {
  return createElement('span', { className: styles.label }, label)
}

function compactMarker(): ReactNode {
  return createElement('span', { className: styles.compactMarker, 'aria-hidden': true }, 'T')
}

export function SidebarRows({ service, slot, wide }: SidebarRowsProps): ReactNode {
  const snapshot = useSyncExternalStore(
    (listener) => service.subscribeSidebarRows(listener),
    () => service.getSidebarRows(),
    () => service.getSidebarRows(),
  )
  const rows = snapshot.rows.filter((row) => row.slot === slot)
  useEffect(() => {
    const hosted = rows.map((row) => service.getSidebarRow(row.id)).filter((row) => row !== undefined)
    for (const row of hosted) row.onHostPresenceChange?.(true)
    return () => {
      for (const row of hosted) row.onHostPresenceChange?.(false)
    }
  }, [service, slot, snapshot.revision])
  if (rows.length === 0) return null

  return createElement('div', {
    className: styles.stack,
    'data-dsh-workbench-row-stack': slot,
  }, rows.map((row) => {
    const concrete = service.getSidebarRow(row.id)
    return createElement('div', {
      className: styles.row,
      key: row.id,
      'data-dsh-workbench-row': row.id,
      'data-expanded': row.expanded ? 'true' : undefined,
    }, [
      createElement('button', {
        type: 'button',
        className: styles.trigger,
        'aria-label': row.label,
        'aria-expanded': row.expanded,
        onClick: () => { void concrete?.toggle() },
        key: 'trigger',
      }, wide ? concrete?.summary?.() ?? fallbackSummary(row.label) : compactMarker()),
      row.expanded && concrete?.details !== undefined
        ? createElement('div', { className: styles.details, key: 'details' }, concrete.details())
        : null,
    ])
  }))
}
