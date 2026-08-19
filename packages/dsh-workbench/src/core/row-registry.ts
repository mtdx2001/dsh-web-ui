import type { ReactNode } from 'react'

export type SidebarRowSlot = 'top' | 'bottom'

export interface SidebarRowRegistration {
  readonly id: string
  readonly slot: SidebarRowSlot
  readonly order: number
  readonly label: string
  readonly summary?: () => ReactNode
  readonly details?: () => ReactNode
  readonly expanded?: () => boolean
  readonly onHostPresenceChange?: (present: boolean) => void
  readonly toggle: () => void | Promise<void>
}

export interface SidebarRowSummary {
  readonly id: string
  readonly slot: SidebarRowSlot
  readonly order: number
  readonly label: string
  readonly expanded: boolean
}

export interface SidebarRowRegistrySnapshot {
  readonly revision: number
  readonly rows: readonly SidebarRowSummary[]
}

const ROW_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

function normalize(row: SidebarRowRegistration): SidebarRowRegistration {
  const id = row.id.trim()
  const label = row.label.trim()
  if (!ROW_ID.test(id)) throw new TypeError(`Invalid sidebar row id: ${row.id}`)
  if (label === '') throw new TypeError(`Sidebar row ${id} requires a label`)
  if (!Number.isFinite(row.order)) throw new TypeError(`Sidebar row ${id} requires a finite order`)
  return Object.freeze({ ...row, id, label })
}

function expandedOf(row: SidebarRowRegistration): boolean {
  try {
    return row.expanded?.() ?? false
  } catch {
    return false
  }
}

export class SidebarRowRegistry {
  private readonly registrations = new Map<string, SidebarRowRegistration>()
  private readonly listeners = new Set<() => void>()
  private snapshot: SidebarRowRegistrySnapshot = Object.freeze({ revision: 0, rows: Object.freeze([]) })

  getSnapshot = (): SidebarRowRegistrySnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  register(registration: SidebarRowRegistration): () => void {
    const row = normalize(registration)
    if (this.registrations.has(row.id)) throw new Error(`Sidebar row already registered: ${row.id}`)
    this.registrations.set(row.id, row)
    this.rebuild()
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.registrations.get(row.id) !== row) return
      this.registrations.delete(row.id)
      this.rebuild()
    }
  }

  get(id: string): SidebarRowRegistration | undefined {
    return this.registrations.get(id)
  }

  refresh(id?: string): void {
    if (id !== undefined && !this.registrations.has(id)) return
    this.rebuild()
  }

  clear(): void {
    if (this.registrations.size === 0) return
    this.registrations.clear()
    this.rebuild()
  }

  private rebuild(): void {
    const rows = [...this.registrations.values()]
      .sort((left, right) => left.slot.localeCompare(right.slot) || left.order - right.order || left.id.localeCompare(right.id))
      .map((row): SidebarRowSummary => Object.freeze({
        id: row.id,
        slot: row.slot,
        order: row.order,
        label: row.label,
        expanded: expandedOf(row),
      }))
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, rows: Object.freeze(rows) })
    for (const listener of [...this.listeners]) listener()
  }
}
