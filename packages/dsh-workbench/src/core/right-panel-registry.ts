import type { ReactNode } from 'react'

export interface WorkbenchRightPanelRegistration {
  readonly id: string
  readonly order: number
  readonly label: string | (() => string)
  readonly icon?: ReactNode | (() => ReactNode)
  readonly render: () => ReactNode
  readonly source?: string
  readonly builtin?: boolean
  readonly availability?: () => { kind: 'available' } | { kind: 'unavailable'; reason: string }
}

export interface WorkbenchRightPanelSummary {
  /** Stable source-qualified identity used by preferences and active state. */
  readonly id: string
  /** Contributor-local registration id. */
  readonly localId: string
  readonly order: number
  readonly label: string
  readonly icon?: ReactNode
  readonly source: string
  readonly builtin: boolean
  readonly availability: { kind: 'available' } | { kind: 'unavailable'; reason: string }
}

export interface WorkbenchRightPanelSnapshot {
  readonly revision: number
  readonly panels: readonly WorkbenchRightPanelSummary[]
}

const PANEL_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SOURCE_ID = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z][a-z0-9._/-]*$/

function keyOf(registration: WorkbenchRightPanelRegistration): string {
  const source = registration.source?.trim() || 'extension'
  if (!SOURCE_ID.test(source)) throw new TypeError(`Invalid workbench right panel source: ${source}`)
  return `${source}:${registration.id}`
}

function normalize(registration: WorkbenchRightPanelRegistration): WorkbenchRightPanelRegistration {
  const id = registration.id.trim()
  if (!PANEL_ID.test(id)) throw new TypeError(`Invalid workbench right panel id: ${registration.id}`)
  if (!Number.isFinite(registration.order)) throw new TypeError(`Workbench right panel ${id} requires a finite order`)
  const label = typeof registration.label === 'function' ? registration.label() : registration.label
  if (label.trim() === '') throw new TypeError(`Workbench right panel ${id} requires a label`)
  const source = registration.source?.trim() || 'extension'
  if (!SOURCE_ID.test(source)) throw new TypeError(`Invalid workbench right panel source: ${source}`)
  return Object.freeze({ ...registration, id, source })
}

function availabilityOf(panel: WorkbenchRightPanelRegistration): WorkbenchRightPanelSummary['availability'] {
  try {
    return panel.availability?.() ?? { kind: 'available' }
  } catch (error) {
    return { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
  }
}

export class RightPanelRegistry {
  private readonly registrations = new Map<string, WorkbenchRightPanelRegistration>()
  private readonly listeners = new Set<() => void>()
  private snapshot: WorkbenchRightPanelSnapshot = Object.freeze({ revision: 0, panels: Object.freeze([]) })

  getSnapshot = (): WorkbenchRightPanelSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  register(registration: WorkbenchRightPanelRegistration): () => void {
    const panel = normalize(registration)
    const key = keyOf(panel)
    if (this.registrations.has(key)) throw new Error(`Workbench right panel already registered: ${key}`)
    this.registrations.set(key, panel)
    this.rebuild()
    let active = true
    return () => {
      if (!active || this.registrations.get(key) !== panel) return
      active = false
      this.registrations.delete(key)
      this.rebuild()
    }
  }

  get(id: string): WorkbenchRightPanelRegistration | undefined { return this.registrations.get(id) }
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
    const panels = [...this.registrations.values()]
      .sort((left, right) => left.order - right.order || keyOf(left).localeCompare(keyOf(right)))
      .map((panel): WorkbenchRightPanelSummary => Object.freeze({
        id: keyOf(panel),
        localId: panel.id,
        order: panel.order,
        label: typeof panel.label === 'function' ? panel.label() : panel.label,
        ...(panel.icon === undefined ? {} : { icon: typeof panel.icon === 'function' ? panel.icon() : panel.icon }),
        source: panel.source?.trim() || 'extension',
        builtin: panel.builtin === true,
        availability: availabilityOf(panel),
      }))
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, panels: Object.freeze(panels) })
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* isolate optional panel consumers */ }
    }
  }
}
