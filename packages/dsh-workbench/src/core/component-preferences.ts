import type { AdmittedSidebarRowRegistration, SidebarRowRegistrySnapshot } from './row-registry.ts'

export type ComponentRegion = 'main-surface' | 'left-top' | 'left-bottom' | 'right-sidebar'

export interface ComponentDescriptor {
  readonly id: string
  readonly region: ComponentRegion
  readonly label: string
  readonly source: string
  readonly order: number
  readonly defaultEnabled: boolean
  readonly removable: boolean
  readonly builtin: boolean
}

export interface ComponentPreference { readonly enabled?: boolean; readonly position?: number; readonly removed?: boolean }
export interface ComponentPreferencesState { readonly version: 1; readonly components: Readonly<Record<string, ComponentPreference>> }
export interface EffectiveComponent extends ComponentDescriptor { readonly enabled: boolean; readonly effectivePosition: number; readonly removed: boolean }
export interface EffectiveComponentSnapshot { readonly revision: number; readonly components: readonly EffectiveComponent[] }

export function descriptorsFromSidebar(snapshot: SidebarRowRegistrySnapshot, getRow?: (id: string) => AdmittedSidebarRowRegistration | undefined): ComponentDescriptor[] {
  return snapshot.rows.map((row) => {
    const registration = getRow?.(row.id)
    return {
      id: row.componentId,
      region: row.slot === 'top' ? 'left-top' : 'left-bottom',
      label: row.label,
      source: row.source,
      order: row.order,
      defaultEnabled: true,
      removable: true,
      builtin: registration?.builtin ?? false,
    }
  })
}

export interface DockComponentRegistration {
  readonly id: string
  readonly order: number
  readonly label: string | (() => string)
  readonly source?: string
  readonly kind?: 'builtin' | 'extension'
  readonly defaultEnabled?: boolean
  readonly removable?: boolean
}

export function descriptorsFromDock(tabs: readonly DockComponentRegistration[]): ComponentDescriptor[] {
  return tabs.map((tab) => {
    const builtin = tab.kind === 'builtin'
    const source = tab.source?.trim() || (builtin ? 'workbench' : 'extension')
    return {
      id: `${source}:${tab.id}`,
      region: 'right-sidebar',
      label: typeof tab.label === 'function' ? tab.label() : tab.label,
      source,
      order: tab.order,
      defaultEnabled: tab.defaultEnabled ?? true,
      removable: true,
      builtin,
    }
  })
}

export const COMPONENT_PREFERENCES_KEY = 'dsh-workbench-component-preferences:v1:global'
export function componentPreferencesKey(root: string): string {
  return root === '' ? COMPONENT_PREFERENCES_KEY : `dsh-workbench-component-preferences:v1:project:${encodeURIComponent(root)}`
}
const ID = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z][a-z0-9._/-]*:[a-z][a-z0-9-]*$/
const MAX = 200
const empty = (): ComponentPreferencesState => ({ version: 1, components: {} })
const position = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

export function parseComponentPreferences(raw: string | null): ComponentPreferencesState {
  if (raw === null) return empty()
  try {
    const value = JSON.parse(raw) as { version?: unknown; components?: unknown }
    if (value.version !== 1 || value.components === null || typeof value.components !== 'object') return empty()
    const components: Record<string, ComponentPreference> = {}
    for (const [id, rawPreference] of Object.entries(value.components).slice(0, MAX)) {
      if (!ID.test(id) || rawPreference === null || typeof rawPreference !== 'object') continue
      const item = rawPreference as Record<string, unknown>
      const preference: ComponentPreference = {
        ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
        ...(position(item.position) ? { position: item.position } : {}),
        ...(typeof item.removed === 'boolean' ? { removed: item.removed } : {}),
      }
      if (Object.keys(preference).length > 0) components[id] = preference
    }
    return { version: 1, components }
  } catch { return empty() }
}

export function deriveEffectiveComponents(descriptors: readonly ComponentDescriptor[], state: ComponentPreferencesState): EffectiveComponent[] {
  return descriptors.map((descriptor) => {
    const preference = state.components[descriptor.id]
    return {
      ...descriptor,
      enabled: preference?.enabled ?? descriptor.defaultEnabled,
      effectivePosition: preference?.position ?? descriptor.order,
      removed: descriptor.removable && preference?.removed === true,
    }
  }).sort((left, right) => left.region.localeCompare(right.region)
    || left.effectivePosition - right.effectivePosition
    || left.order - right.order
    || left.id.localeCompare(right.id))
}

export class ComponentPreferencesService {
  private state: ComponentPreferencesState
  private root = ''
  private readonly collections = new Map<string, readonly ComponentDescriptor[]>()
  private descriptors: readonly ComponentDescriptor[] = []
  private snapshot: EffectiveComponentSnapshot = Object.freeze({ revision: 0, components: Object.freeze([]) })
  private readonly listeners = new Set<() => void>()

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {
    this.state = parseComponentPreferences(storage?.getItem(COMPONENT_PREFERENCES_KEY) ?? null)
  }

  getSnapshot = (): EffectiveComponentSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  /** Switch the layout preference layer with the active project root. */
  setRoot(root: string): void {
    if (root === this.root) return
    this.root = root
    const raw = this.storage?.getItem(componentPreferencesKey(root)) ?? null
    this.state = raw === null && root !== '' ? parseComponentPreferences(this.storage?.getItem(COMPONENT_PREFERENCES_KEY) ?? null) : parseComponentPreferences(raw)
    this.publish()
  }

  /** Compatibility entry point for callers that own the complete descriptor list. */
  reconcile(descriptors: readonly ComponentDescriptor[]): void { this.reconcileCollection('default', descriptors) }

  /** Reconcile one independently owned descriptor collection without dropping others. */
  reconcileCollection(owner: string, descriptors: readonly ComponentDescriptor[]): void {
    this.collections.set(owner, Object.freeze([...descriptors]))
    const merged = new Map<string, ComponentDescriptor>()
    for (const collection of this.collections.values()) {
      for (const descriptor of collection) if (!merged.has(descriptor.id)) merged.set(descriptor.id, descriptor)
    }
    this.descriptors = Object.freeze([...merged.values()])
    this.publish()
  }

  setEnabled(id: string, enabled: boolean): void { if (this.has(id)) this.patch(id, { enabled }) }
  setPosition(id: string, region: ComponentRegion, value: number): void {
    if (position(value) && this.descriptors.some((descriptor) => descriptor.id === id && descriptor.region === region)) this.patch(id, { position: value })
  }

  move(id: string, direction: -1 | 1): void {
    const current = this.snapshot.components.find((candidate) => candidate.id === id)
    if (current === undefined) return
    if (current.removed) return
    const items = this.snapshot.components.filter((item) => item.region === current.region && !item.removed)
    const index = items.findIndex((item) => item.id === id)
    const target = items[index + direction]
    if (index < 0 || target === undefined) return
    this.state = { version: 1, components: {
      ...this.state.components,
      [id]: { ...this.state.components[id], position: target.effectivePosition },
      [target.id]: { ...this.state.components[target.id], position: current.effectivePosition },
    } }
    this.persist()
    this.publish()
  }

  setRemoved(id: string, removed: boolean): void {
    if (this.descriptors.find((descriptor) => descriptor.id === id)?.removable === true) this.patch(id, { removed })
  }

  reset(id?: string): void {
    const components = { ...this.state.components }
    if (id !== undefined) delete components[id]
    else for (const key of Object.keys(components)) delete components[key]
    this.state = { version: 1, components }
    this.persist()
    this.publish()
  }

  private has(id: string): boolean { return this.descriptors.some((descriptor) => descriptor.id === id) }
  private patch(id: string, patch: ComponentPreference): void {
    this.state = { version: 1, components: { ...this.state.components, [id]: { ...this.state.components[id], ...patch } } }
    this.persist()
    this.publish()
  }
  private publish(): void {
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, components: Object.freeze(deriveEffectiveComponents(this.descriptors, this.state)) })
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* isolate settings consumers */ }
    }
  }
  private persist(): void { try { this.storage?.setItem(componentPreferencesKey(this.root), JSON.stringify(this.state)) } catch { /* best effort */ } }
}
