export type WorkbenchModuleIcon = 'agent' | 'tasks' | 'knowledge' | 'experts' | 'news' | 'monitoring' | 'ssh' | 'settings' | 'extension'

export type WorkbenchModuleAvailability =
  | { kind: 'available' }
  | { kind: 'unavailable'; reason: string }

export interface WorkbenchModuleRegistration {
  readonly id: string
  readonly order: number
  readonly label: string
  readonly icon: WorkbenchModuleIcon
  readonly availability?: () => WorkbenchModuleAvailability
  readonly activate: () => void | Promise<void>
  readonly deactivate?: () => void | Promise<void>
}

export interface WorkbenchModuleSummary {
  readonly id: string
  readonly order: number
  readonly label: string
  readonly icon: WorkbenchModuleIcon
  readonly availability: WorkbenchModuleAvailability
}

export interface ModuleRegistrySnapshot {
  readonly revision: number
  readonly modules: readonly WorkbenchModuleSummary[]
}

const MODULE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

function normalize(registration: WorkbenchModuleRegistration): WorkbenchModuleRegistration {
  const id = registration.id.trim()
  const label = registration.label.trim()
  if (!MODULE_ID.test(id)) throw new TypeError(`Invalid workbench module id: ${registration.id}`)
  if (label === '') throw new TypeError(`Workbench module ${id} requires a label`)
  if (!Number.isFinite(registration.order)) throw new TypeError(`Workbench module ${id} requires a finite order`)
  return Object.freeze({ ...registration, id, label })
}

function availabilityOf(module: WorkbenchModuleRegistration): WorkbenchModuleAvailability {
  try {
    return module.availability?.() ?? { kind: 'available' }
  } catch (error) {
    return { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
  }
}

export class ModuleRegistry {
  private readonly registrations = new Map<string, WorkbenchModuleRegistration>()
  private readonly listeners = new Set<() => void>()
  private snapshot: ModuleRegistrySnapshot = Object.freeze({ revision: 0, modules: Object.freeze([]) })

  getSnapshot = (): ModuleRegistrySnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  register(registration: WorkbenchModuleRegistration): () => void {
    const module = normalize(registration)
    if (this.registrations.has(module.id)) throw new Error(`Workbench module already registered: ${module.id}`)
    this.registrations.set(module.id, module)
    this.rebuild()
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.registrations.get(module.id) !== module) return
      this.registrations.delete(module.id)
      this.rebuild()
    }
  }

  get(id: string): WorkbenchModuleRegistration | undefined {
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
    const modules = [...this.registrations.values()]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((module): WorkbenchModuleSummary => Object.freeze({
        id: module.id,
        order: module.order,
        label: module.label,
        icon: module.icon,
        availability: availabilityOf(module),
      }))
    this.snapshot = Object.freeze({
      revision: this.snapshot.revision + 1,
      modules: Object.freeze(modules),
    })
    for (const listener of [...this.listeners]) listener()
  }
}
