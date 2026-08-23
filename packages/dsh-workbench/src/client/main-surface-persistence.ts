import { parseMainSurfaceState, type MainSurfacePersistedState } from '../core/main-surface-persisted.ts'

const ROUTE = '/dsh-workbench/main-surface-state'
interface Envelope { ok?: unknown; value?: unknown }

export async function loadMainSurfaceState(signal?: AbortSignal): Promise<MainSurfacePersistedState | undefined> {
  const response = await fetch(ROUTE, { method: 'GET', signal, headers: { accept: 'application/json' } })
  if (!response.ok) return undefined
  const envelope = await response.json() as Envelope
  return envelope.ok === true ? parseMainSurfaceState(envelope.value) : undefined
}

export async function saveMainSurfaceState(value: MainSurfacePersistedState): Promise<boolean> {
  const admitted = parseMainSurfaceState(value)
  if (admitted === undefined) return false
  try {
    const response = await fetch(ROUTE, {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(admitted),
    })
    return response.ok
  } catch {
    return false
  }
}
