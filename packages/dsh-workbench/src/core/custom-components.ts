import type { ComponentRegion } from './component-preferences.ts'

export type CustomComponentKind = 'information' | 'text-panel'

export interface CustomComponentDefinition {
  readonly id: string
  readonly kind: CustomComponentKind
  readonly label: string
  readonly region: ComponentRegion
  readonly summary: string
  readonly content: string
  readonly createdAt: number
}

export interface CustomComponentSnapshot {
  readonly revision: number
  readonly components: readonly CustomComponentDefinition[]
}

export interface CreateCustomComponentInput {
  readonly kind: CustomComponentKind
  readonly label: string
  readonly region: ComponentRegion
  readonly summary?: string
  readonly content: string
}

interface PersistedCustomComponents {
  readonly version: 1
  readonly components: readonly CustomComponentDefinition[]
}

export const CUSTOM_COMPONENTS_KEY = 'dsh-workbench-custom-components:v1:global'
const LOCAL_ID = /^custom-[a-z0-9]+-[a-z0-9]+$/
const MAX_COMPONENTS = 50
const MAX_LABEL = 60
const MAX_SUMMARY = 160
const MAX_CONTENT = 8_000

function normalizedText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text.length > 0 && text.length <= max ? text : undefined
}

function validRegion(kind: CustomComponentKind, region: unknown): region is ComponentRegion {
  if (kind === 'text-panel') return region === 'main-surface' || region === 'right-sidebar'
  return region === 'left-top' || region === 'left-bottom' || region === 'main-surface' || region === 'right-sidebar'
}

function normalizeDefinition(value: unknown): CustomComponentDefinition | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const item = value as Record<string, unknown>
  const kind = item.kind === 'information' || item.kind === 'text-panel' ? item.kind : undefined
  const id = typeof item.id === 'string' && LOCAL_ID.test(item.id) ? item.id : undefined
  const label = normalizedText(item.label, MAX_LABEL)
  const summary = normalizedText(item.summary, MAX_SUMMARY)
  const content = normalizedText(item.content, MAX_CONTENT)
  const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt >= 0 ? item.createdAt : undefined
  if (kind === undefined || id === undefined || label === undefined || content === undefined || createdAt === undefined || !validRegion(kind, item.region)) return undefined
  return Object.freeze({ id, kind, label, region: item.region, summary: summary ?? label, content, createdAt })
}

export function parseCustomComponents(raw: string | null): readonly CustomComponentDefinition[] {
  if (raw === null) return Object.freeze([])
  try {
    const value = JSON.parse(raw) as { version?: unknown; components?: unknown }
    if (value.version !== 1 || !Array.isArray(value.components)) return Object.freeze([])
    const seen = new Set<string>()
    const components: CustomComponentDefinition[] = []
    for (const candidate of value.components.slice(0, MAX_COMPONENTS)) {
      const component = normalizeDefinition(candidate)
      if (component === undefined || seen.has(component.id)) continue
      seen.add(component.id)
      components.push(component)
    }
    return Object.freeze(components)
  } catch {
    return Object.freeze([])
  }
}

function randomPart(): string {
  const cryptoApi = typeof globalThis.crypto === 'object' ? globalThis.crypto : undefined
  if (cryptoApi !== undefined && typeof cryptoApi.getRandomValues === 'function') {
    const values = new Uint32Array(1)
    cryptoApi.getRandomValues(values)
    return values[0]!.toString(36)
  }
  return Math.floor(Math.random() * 0x1_0000_0000).toString(36)
}

export class CustomComponentService {
  private components: readonly CustomComponentDefinition[]
  private snapshot: CustomComponentSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {
    this.components = parseCustomComponents(storage?.getItem(CUSTOM_COMPONENTS_KEY) ?? null)
    this.snapshot = Object.freeze({ revision: 0, components: this.components })
  }

  getSnapshot = (): CustomComponentSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  create(input: CreateCustomComponentInput): CustomComponentDefinition {
    if (this.components.length >= MAX_COMPONENTS) throw new RangeError('Custom component limit reached')
    const label = normalizedText(input.label, MAX_LABEL)
    const summary = normalizedText(input.summary, MAX_SUMMARY)
    const content = normalizedText(input.content, MAX_CONTENT)
    if (label === undefined) throw new TypeError('Custom component requires a label of at most 60 characters')
    if (content === undefined) throw new TypeError('Custom component requires content of at most 8000 characters')
    if (!validRegion(input.kind, input.region)) throw new TypeError('Custom component region does not match its type')
    const now = Date.now()
    let id = `custom-${now.toString(36)}-${randomPart()}`
    while (this.components.some((item) => item.id === id)) id = `custom-${now.toString(36)}-${randomPart()}`
    const component = Object.freeze({ id, kind: input.kind, label, region: input.region, summary: summary ?? label, content, createdAt: now })
    this.components = Object.freeze([...this.components, component])
    this.publish()
    return component
  }

  remove(id: string): void {
    const next = this.components.filter((item) => item.id !== id)
    if (next.length === this.components.length) return
    this.components = Object.freeze(next)
    this.publish()
  }

  private publish(): void {
    const state: PersistedCustomComponents = { version: 1, components: this.components }
    try { this.storage?.setItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(state)) } catch { /* best effort */ }
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, components: this.components })
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* isolate settings and runtime consumers */ }
    }
  }
}
