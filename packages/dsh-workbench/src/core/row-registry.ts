import type { ReactNode } from 'react'

export type SidebarRowSlot = 'top' | 'bottom'
export type SidebarRowKind = 'action' | 'disclosure' | 'toggle'
export type SidebarRowMetadataValue = string | number | boolean | null | readonly SidebarRowMetadataValue[] | { readonly [key: string]: SidebarRowMetadataValue }
export type SidebarRowMetadata = Readonly<Record<string, SidebarRowMetadataValue>>

interface SidebarRowBase {
  readonly id: string
  readonly slot: SidebarRowSlot
  readonly order: number
  readonly label: string | (() => string)
  readonly source: string
  readonly metadata?: SidebarRowMetadata
  readonly builtin?: boolean
  readonly removable?: boolean
  readonly icon?: () => ReactNode
  readonly summary?: () => ReactNode
  readonly onHostPresenceChange?: (present: boolean) => void
}

export interface SidebarActionRowRegistration extends SidebarRowBase {
  readonly kind: 'action'
  readonly onAction: () => void | Promise<void>
  readonly active?: () => boolean
}

export interface SidebarDisclosureRowRegistration extends SidebarRowBase {
  readonly kind: 'disclosure'
  readonly details: () => ReactNode
  readonly expanded: () => boolean
  readonly onToggle: () => void | Promise<void>
}

export interface SidebarToggleRowRegistration extends SidebarRowBase {
  readonly kind: 'toggle'
  readonly checked: () => boolean
  readonly onChange: (checked: boolean) => void | Promise<void>
}

/** Compatibility shape accepted from row contributors released before interaction kinds. */
export interface LegacySidebarRowRegistration {
  readonly id: string
  readonly slot: SidebarRowSlot
  readonly order: number
  readonly label: string | (() => string)
  readonly source?: string
  readonly metadata?: SidebarRowMetadata
  readonly builtin?: boolean
  readonly removable?: boolean
  readonly icon?: () => ReactNode
  readonly summary?: () => ReactNode
  readonly details?: () => ReactNode
  readonly expanded?: () => boolean
  readonly onHostPresenceChange?: (present: boolean) => void
  readonly toggle: () => void | Promise<void>
}

export type SidebarRowRegistration =
  | SidebarActionRowRegistration
  | SidebarDisclosureRowRegistration
  | SidebarToggleRowRegistration
  | LegacySidebarRowRegistration

export interface AdmittedSidebarRowRegistration {
  readonly id: string
  readonly componentId: string
  readonly source: string
  readonly slot: SidebarRowSlot
  readonly order: number
  readonly registrationIndex: number
  readonly label: string
  readonly resolveLabel: () => string
  readonly kind: SidebarRowKind
  readonly metadata: SidebarRowMetadata
  readonly builtin: boolean
  readonly removable: boolean
  readonly icon?: () => ReactNode
  readonly summary?: () => ReactNode
  readonly details?: () => ReactNode
  readonly active: () => boolean
  readonly expanded: () => boolean
  readonly checked: () => boolean
  readonly invoke: () => void | Promise<void>
  readonly onHostPresenceChange?: (present: boolean) => void
}

export interface SidebarRowSummary {
  readonly id: string
  readonly componentId: string
  readonly source: string
  readonly slot: SidebarRowSlot
  readonly order: number
  readonly registrationIndex: number
  readonly label: string
  readonly kind: SidebarRowKind
  readonly active: boolean
  readonly expanded: boolean
  readonly checked: boolean
}

export interface SidebarRowRegistrySnapshot {
  readonly revision: number
  readonly rows: readonly SidebarRowSummary[]
}

export type SidebarRowAdmissionCode =
  | 'invalid_registration'
  | 'invalid_id'
  | 'invalid_source'
  | 'invalid_slot'
  | 'invalid_label'
  | 'invalid_order'
  | 'invalid_metadata'
  | 'sensitive_metadata'
  | 'missing_callback'
  | 'duplicate_id'

export interface SidebarRowAdmissionDiagnostic {
  readonly code: SidebarRowAdmissionCode
  readonly message: string
  readonly id?: string
  readonly field?: string
}

export type SidebarRowAdmissionResult =
  | { readonly ok: true; readonly registration: AdmittedSidebarRowRegistration; readonly dispose: () => void }
  | { readonly ok: false; readonly diagnostic: SidebarRowAdmissionDiagnostic }

export class SidebarRowAdmissionError extends TypeError {
  readonly diagnostic: SidebarRowAdmissionDiagnostic

  constructor(diagnostic: SidebarRowAdmissionDiagnostic) {
    super(diagnostic.message)
    this.name = 'SidebarRowAdmissionError'
    this.diagnostic = diagnostic
  }
}

const ROW_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SOURCE_ID = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z][a-z0-9]*(?:[._/-][a-z0-9]+)*$/
const SENSITIVE_KEY = /(?:password|passwd|passphrase|secret|credential|authorization|privatekey|apikey|accesstoken|refreshtoken|bearertoken|recoverycode)$/
const SENSITIVE_VALUE = /^(?:bearer\s+\S+|-----begin [^-]*private key-----|(?:sk|ghp|github_pat|xox[baprs])[-_][a-z0-9])/i
const MAX_METADATA_DEPTH = 6
const MAX_METADATA_ENTRIES = 200

function diagnostic(code: SidebarRowAdmissionCode, message: string, id?: string, field?: string): SidebarRowAdmissionDiagnostic {
  return Object.freeze({ code, message, ...(id === undefined ? {} : { id }), ...(field === undefined ? {} : { field }) })
}

function callbackDiagnostic(id: string, field: string): SidebarRowAdmissionDiagnostic {
  return diagnostic('missing_callback', `Sidebar row ${id} requires callback ${field}`, id, field)
}

function cloneMetadataValue(value: unknown, path: string, depth: number, seen: Set<object>, count: { value: number }): SidebarRowMetadataValue {
  if (depth > MAX_METADATA_DEPTH) throw diagnostic('invalid_metadata', `Sidebar row metadata exceeds maximum depth at ${path}`, undefined, path)
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw diagnostic('invalid_metadata', `Sidebar row metadata requires finite numbers at ${path}`, undefined, path)
    return value
  }
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE.test(value.trim())) throw diagnostic('sensitive_metadata', `Sidebar row metadata contains credential-shaped data at ${path}`, undefined, path)
    return value
  }
  if (typeof value !== 'object') throw diagnostic('invalid_metadata', `Sidebar row metadata must be serializable at ${path}`, undefined, path)
  if (seen.has(value)) throw diagnostic('invalid_metadata', `Sidebar row metadata must not contain cycles at ${path}`, undefined, path)
  seen.add(value)
  if (Array.isArray(value)) {
    const result = value.map((entry, index) => {
      count.value += 1
      if (count.value > MAX_METADATA_ENTRIES) throw diagnostic('invalid_metadata', 'Sidebar row metadata has too many entries', undefined, path)
      return cloneMetadataValue(entry, `${path}[${index}]`, depth + 1, seen, count)
    })
    seen.delete(value)
    return Object.freeze(result)
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw diagnostic('invalid_metadata', `Sidebar row metadata must use plain objects at ${path}`, undefined, path)
  }
  const result: Record<string, SidebarRowMetadataValue> = {}
  for (const [key, entry] of Object.entries(value)) {
    count.value += 1
    if (count.value > MAX_METADATA_ENTRIES) throw diagnostic('invalid_metadata', 'Sidebar row metadata has too many entries', undefined, path)
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    const nextPath = `${path}.${key}`
    if (SENSITIVE_KEY.test(normalizedKey)) throw diagnostic('sensitive_metadata', `Sidebar row metadata key is credential-shaped at ${nextPath}`, undefined, nextPath)
    result[key] = cloneMetadataValue(entry, nextPath, depth + 1, seen, count)
  }
  seen.delete(value)
  return Object.freeze(result)
}

function normalizeMetadata(value: unknown): SidebarRowMetadata {
  if (value === undefined) return Object.freeze({})
  const cloned = cloneMetadataValue(value, 'metadata', 0, new Set(), { value: 0 })
  if (Array.isArray(cloned) || cloned === null || typeof cloned !== 'object') {
    throw diagnostic('invalid_metadata', 'Sidebar row metadata must be an object', undefined, 'metadata')
  }
  return cloned as SidebarRowMetadata
}

function safeBoolean(callback: (() => boolean) | undefined): boolean {
  try { return callback?.() === true } catch { return false }
}

function labelOf(value: string | (() => string)): string {
  try { return (typeof value === 'function' ? value() : value).trim() } catch { return '' }
}

function normalize(registration: SidebarRowRegistration, registrationIndex: number): AdmittedSidebarRowRegistration | SidebarRowAdmissionDiagnostic {
  if (registration === null || typeof registration !== 'object') return diagnostic('invalid_registration', 'Sidebar row registration must be an object')
  const id = typeof registration.id === 'string' ? registration.id.trim() : ''
  if (!ROW_ID.test(id)) return diagnostic('invalid_id', `Invalid sidebar row id: ${String(registration.id)}`, id || undefined, 'id')
  if (registration.slot !== 'top' && registration.slot !== 'bottom') return diagnostic('invalid_slot', `Sidebar row ${id} requires slot top or bottom`, id, 'slot')
  const label = typeof registration.label === 'string' || typeof registration.label === 'function' ? labelOf(registration.label) : ''
  if (label === '') return diagnostic('invalid_label', `Sidebar row ${id} requires a label`, id, 'label')
  const resolveLabel = (): string => labelOf(registration.label) || label
  if (!Number.isFinite(registration.order)) return diagnostic('invalid_order', `Sidebar row ${id} requires a finite order`, id, 'order')

  const legacy = !('kind' in registration)
  const declaredSource = legacy ? registration.source ?? 'legacy' : registration.source
  const source = typeof declaredSource === 'string' ? declaredSource.trim() : ''
  if (!SOURCE_ID.test(source)) return diagnostic('invalid_source', `Invalid sidebar row source: ${String(declaredSource)}`, id, 'source')

  let metadata: SidebarRowMetadata
  try { metadata = normalizeMetadata(registration.metadata) } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) return Object.freeze({ ...(error as SidebarRowAdmissionDiagnostic), id })
    return diagnostic('invalid_metadata', `Sidebar row ${id} has invalid metadata`, id, 'metadata')
  }

  const builtin = registration.builtin === true
  const removable = registration.removable ?? !builtin
  const common = {
    id,
    componentId: `${source}:${id}`,
    source,
    slot: registration.slot,
    order: registration.order,
    registrationIndex,
    label,
    resolveLabel,
    metadata,
    builtin,
    removable,
    icon: registration.icon,
    summary: registration.summary,
    onHostPresenceChange: registration.onHostPresenceChange,
  }

  if (legacy) {
    if (typeof registration.toggle !== 'function') return callbackDiagnostic(id, 'toggle')
    if (typeof registration.details !== 'function') {
      return Object.freeze({
        ...common,
        kind: 'action',
        details: undefined,
        active: () => safeBoolean(registration.expanded),
        expanded: () => false,
        checked: () => false,
        invoke: registration.toggle,
      })
    }
    const expanded = (): boolean => safeBoolean(registration.expanded)
    return Object.freeze({
      ...common,
      kind: 'disclosure',
      details: registration.details,
      active: expanded,
      expanded,
      checked: () => false,
      invoke: registration.toggle,
    })
  }

  if (registration.kind === 'action') {
    if (typeof registration.onAction !== 'function') return callbackDiagnostic(id, 'onAction')
    return Object.freeze({
      ...common,
      kind: 'action',
      details: undefined,
      active: () => safeBoolean(registration.active),
      expanded: () => false,
      checked: () => false,
      invoke: registration.onAction,
    })
  }
  if (registration.kind === 'disclosure') {
    if (typeof registration.details !== 'function') return callbackDiagnostic(id, 'details')
    if (typeof registration.expanded !== 'function') return callbackDiagnostic(id, 'expanded')
    if (typeof registration.onToggle !== 'function') return callbackDiagnostic(id, 'onToggle')
    const expanded = (): boolean => safeBoolean(registration.expanded)
    return Object.freeze({
      ...common,
      kind: 'disclosure',
      details: registration.details,
      active: expanded,
      expanded,
      checked: () => false,
      invoke: registration.onToggle,
    })
  }
  if (registration.kind === 'toggle') {
    if (typeof registration.checked !== 'function') return callbackDiagnostic(id, 'checked')
    if (typeof registration.onChange !== 'function') return callbackDiagnostic(id, 'onChange')
    const checked = (): boolean => safeBoolean(registration.checked)
    return Object.freeze({
      ...common,
      kind: 'toggle',
      details: undefined,
      active: checked,
      expanded: () => false,
      checked,
      invoke: () => registration.onChange(!checked()),
    })
  }
  return diagnostic('invalid_registration', `Sidebar row ${id} has an unsupported interaction kind`, id, 'kind')
}

export class SidebarRowRegistry {
  private readonly registrations = new Map<string, AdmittedSidebarRowRegistration>()
  private readonly listeners = new Set<() => void>()
  private nextRegistrationIndex = 0
  private snapshot: SidebarRowRegistrySnapshot = Object.freeze({ revision: 0, rows: Object.freeze([]) })

  getSnapshot = (): SidebarRowRegistrySnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  admit(registration: SidebarRowRegistration): SidebarRowAdmissionResult {
    const row = normalize(registration, this.nextRegistrationIndex)
    if ('code' in row) return { ok: false, diagnostic: row }
    if (this.registrations.has(row.id)) {
      return { ok: false, diagnostic: diagnostic('duplicate_id', `Sidebar row already registered: ${row.id}`, row.id, 'id') }
    }
    this.nextRegistrationIndex += 1
    this.registrations.set(row.id, row)
    this.rebuild()
    let active = true
    const dispose = (): void => {
      if (!active) return
      active = false
      if (this.registrations.get(row.id) !== row) return
      this.registrations.delete(row.id)
      this.rebuild()
    }
    return { ok: true, registration: row, dispose }
  }

  register(registration: SidebarRowRegistration): () => void {
    const result = this.admit(registration)
    if (!result.ok) throw new SidebarRowAdmissionError(result.diagnostic)
    return result.dispose
  }

  get(id: string): AdmittedSidebarRowRegistration | undefined {
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
      .sort((left, right) => left.slot.localeCompare(right.slot) || left.order - right.order || left.registrationIndex - right.registrationIndex)
      .map((row): SidebarRowSummary => Object.freeze({
        id: row.id,
        componentId: row.componentId,
        source: row.source,
        slot: row.slot,
        order: row.order,
        registrationIndex: row.registrationIndex,
        label: row.resolveLabel(),
        kind: row.kind,
        active: row.active(),
        expanded: row.expanded(),
        checked: row.checked(),
      }))
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, rows: Object.freeze(rows) })
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* isolate subscribers */ }
    }
  }
}
