import { createElement, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { AdmittedSidebarRowRegistration, SidebarRowSlot, SidebarRowSummary } from '../core/row-registry.ts'
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
  return createElement('span', { className: styles.compactMarker, 'aria-hidden': true, key: 'marker' }, 'W')
}

function safeNode(render: (() => ReactNode) | undefined, fallback: ReactNode): ReactNode {
  try { return render?.() ?? fallback } catch { return fallback }
}

function notifyPresence(row: AdmittedSidebarRowRegistration, present: boolean): void {
  try { row.onHostPresenceChange?.(present) } catch { /* isolate contributor lifecycle callbacks */ }
}

function invoke(row: AdmittedSidebarRowRegistration | undefined): void {
  if (row === undefined) return
  try {
    const result = row.invoke()
    if (result !== undefined) void Promise.resolve(result).catch(() => {})
  } catch { /* isolate contributor interaction callbacks */ }
}

function invokeInStack(service: WorkbenchServiceFace, rows: readonly SidebarRowSummary[], target: SidebarRowSummary): void {
  if (target.kind === 'disclosure' && !target.expanded) {
    for (const row of rows) {
      if (row.id !== target.id && row.kind === 'disclosure' && row.expanded) invoke(service.getSidebarRow(row.id))
    }
  }
  invoke(service.getSidebarRow(target.id))
}

function triggerAttributes(row: SidebarRowSummary): Record<string, unknown> {
  if (row.kind === 'disclosure') return { 'aria-expanded': row.expanded }
  if (row.kind === 'toggle') return { role: 'switch', 'aria-checked': row.checked }
  return { 'data-active': row.active ? 'true' : undefined, 'aria-current': row.active ? 'page' : undefined }
}

export function SidebarRows({ service, slot, wide }: SidebarRowsProps): ReactNode {
  const snapshot = useSyncExternalStore(
    (listener) => service.subscribeSidebarRows(listener),
    () => service.getSidebarRows(),
    () => service.getSidebarRows(),
  )
  const preferences = service.getComponentPreferences()
  const componentSnapshot = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot, preferences.getSnapshot)
  const effective = new Map(componentSnapshot.components
    .filter((component) => component.region === `left-${slot}`)
    .map((component) => [component.id, component]))
  const rows = snapshot.rows
    .filter((row) => row.slot === slot && (effective.get(row.componentId)?.enabled ?? true) && !(effective.get(row.componentId)?.removed ?? false))
    .sort((left, right) => (effective.get(left.componentId)?.effectivePosition ?? left.order) - (effective.get(right.componentId)?.effectivePosition ?? right.order)
      || left.order - right.order
      || left.registrationIndex - right.registrationIndex)

  useEffect(() => {
    const hosted = rows.map((row) => service.getSidebarRow(row.id)).filter((row): row is AdmittedSidebarRowRegistration => row !== undefined)
    for (const row of hosted) notifyPresence(row, true)
    return () => { for (const row of hosted) notifyPresence(row, false) }
  }, [service, slot, snapshot.revision, componentSnapshot.revision])

  if (rows.length === 0) return null
  return createElement('div', { className: styles.stack, 'data-dsh-workbench-row-stack': slot }, rows.map((row) => {
    const concrete = service.getSidebarRow(row.id)
    const disclosure = row.kind === 'disclosure'
    const details = disclosure && row.expanded
      ? createElement('div', { className: styles.details, key: 'details' }, safeNode(concrete?.details, null))
      : null
    const trigger = createElement('button', {
      type: 'button',
      className: styles.trigger,
      'aria-label': row.label,
      ...triggerAttributes(row),
      onClick: () => invokeInStack(service, rows, row),
      key: 'trigger',
    }, [
      createElement('span', { className: styles.icon, 'aria-hidden': true, key: 'icon' }, safeNode(concrete?.icon, compactMarker())),
      wide ? createElement('span', { className: styles.label, key: 'summary' }, safeNode(concrete?.summary, fallbackSummary(row.label))) : null,
      disclosure
        ? createElement('span', { className: styles.chevron, 'data-expanded': row.expanded || undefined, 'data-direction': slot === 'bottom' ? 'up' : 'down', 'aria-hidden': true, key: 'chevron' })
        : row.kind === 'toggle'
          ? createElement('span', { className: styles.toggleState, 'data-checked': row.checked ? 'true' : 'false', 'aria-hidden': true, key: 'toggle' })
          : null,
    ])
    return createElement('div', {
      className: styles.row,
      key: row.componentId,
      'data-dsh-workbench-row': row.id,
      'data-component-id': row.componentId,
      'data-kind': row.kind,
      'data-active': row.active ? 'true' : undefined,
      'data-expanded': disclosure && row.expanded ? 'true' : undefined,
      'data-checked': row.kind === 'toggle' && row.checked ? 'true' : undefined,
    }, slot === 'bottom' ? [details, trigger] : [trigger, details])
  }))
}
