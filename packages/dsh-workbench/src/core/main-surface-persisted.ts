export interface MainSurfacePersistedState {
  readonly version: 1
  readonly activeId: string
  readonly defaultId: string
  readonly restoreLast: boolean
}

const QUALIFIED_ID = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z][a-z0-9._\/-]*:[a-z][a-z0-9-]*$/
export const AGENT_MAIN_SURFACE_ID = 'agent'
export const DEFAULT_MAIN_SURFACE_STATE: MainSurfacePersistedState = Object.freeze({
  version: 1,
  activeId: AGENT_MAIN_SURFACE_ID,
  defaultId: AGENT_MAIN_SURFACE_ID,
  restoreLast: true,
})

export function isMainSurfaceId(value: unknown): value is string {
  return value === AGENT_MAIN_SURFACE_ID || (typeof value === 'string' && QUALIFIED_ID.test(value))
}

export function parseMainSurfaceState(value: unknown): MainSurfacePersistedState | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record.version !== 1 || !isMainSurfaceId(record.activeId) || !isMainSurfaceId(record.defaultId) || typeof record.restoreLast !== 'boolean') return undefined
  return { version: 1, activeId: record.activeId, defaultId: record.defaultId, restoreLast: record.restoreLast }
}

export function parseMainSurfaceStateJson(raw: string | null): MainSurfacePersistedState | undefined {
  if (raw === null) return undefined
  try { return parseMainSurfaceState(JSON.parse(raw)) } catch { return undefined }
}
