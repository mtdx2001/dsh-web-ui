import type { ReactNode } from 'react'

export interface MainSurfaceRenderActions {
  readonly close: () => void
}

export interface WorkbenchMainSurfaceRegistration {
  readonly id: string
  readonly order: number
  readonly label: string | (() => string)
  readonly icon?: ReactNode | (() => ReactNode)
  readonly render: (actions: MainSurfaceRenderActions) => ReactNode
  readonly source?: string
  readonly availability?: () => { kind: 'available' } | { kind: 'unavailable'; reason: string }
}

export interface WorkbenchMainSurfaceSummary {
  readonly id: string
  readonly localId: string
  readonly order: number
  readonly label: string
  readonly icon?: ReactNode
  readonly source: string
  readonly availability: { kind: 'available' } | { kind: 'unavailable'; reason: string }
}

export interface MainSurfaceRegistrySnapshot {
  readonly revision: number
  readonly modes: readonly WorkbenchMainSurfaceSummary[]
}

const MODE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SOURCE_ID = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z][a-z0-9._\/-]*$/

function sourceOf(registration: WorkbenchMainSurfaceRegistration): string {
  return registration.source?.trim() || 'extension'
}

function keyOf(registration: WorkbenchMainSurfaceRegistration): string {
  return `${sourceOf(registration)}:${registration.id}`
}

function normalize(registration: WorkbenchMainSurfaceRegistration): WorkbenchMainSurfaceRegistration {
  const id = registration.id.trim()
  const source = sourceOf(registration)
  if (!MODE_ID.test(id)) throw new TypeError(`Invalid workbench main surface id: ${registration.id}`)
  if (!SOURCE_ID.test(source)) throw new TypeError(`Invalid workbench main surface source: ${source}`)
  if (!Number.isFinite(registration.order)) throw new TypeError(`Workbench main surface ${id} requires a finite order`)
  const label = typeof registration.label === 'function' ? registration.label() : registration.label
  if (label.trim() === '') throw new TypeError(`Workbench main surface ${id} requires a label`)
  return Object.freeze({ ...registration, id, source })
}

function availabilityOf(mode: WorkbenchMainSurfaceRegistration): WorkbenchMainSurfaceSummary['availability'] {
  try {
    return mode.availability?.() ?? { kind: 'available' }
  } catch (error) {
    return { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
  }
}

export class MainSurfaceRegistry {
  private readonly registrations = new Map<string, WorkbenchMainSurfaceRegistration>()
  private readonly listeners = new Set<() => void>()
  private snapshot: MainSurfaceRegistrySnapshot = Object.freeze({ revision: 0, modes: Object.freeze([]) })

  getSnapshot = (): MainSurfaceRegistrySnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  register(registration: WorkbenchMainSurfaceRegistration): () => void {
    const mode = normalize(registration)
    const key = keyOf(mode)
    if (this.registrations.has(key)) throw new Error(`Workbench main surface already registered: ${key}`)
    this.registrations.set(key, mode)
    this.rebuild()
    let active = true
    return () => {
      if (!active || this.registrations.get(key) !== mode) return
      active = false
      this.registrations.delete(key)
      this.rebuild()
    }
  }

  get(id: string): WorkbenchMainSurfaceRegistration | undefined { return this.registrations.get(id) }
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
    const modes = [...this.registrations.values()]
      .sort((left, right) => left.order - right.order || keyOf(left).localeCompare(keyOf(right)))
      .map((mode): WorkbenchMainSurfaceSummary => Object.freeze({
        id: keyOf(mode),
        localId: mode.id,
        order: mode.order,
        label: typeof mode.label === 'function' ? mode.label() : mode.label,
        ...(mode.icon === undefined ? {} : { icon: typeof mode.icon === 'function' ? mode.icon() : mode.icon }),
        source: sourceOf(mode),
        availability: availabilityOf(mode),
      }))
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, modes: Object.freeze(modes) })
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* isolate optional consumers */ }
    }
  }
}
