import {
  AGENT_MAIN_SURFACE_ID,
  DEFAULT_MAIN_SURFACE_STATE,
  isMainSurfaceId,
  parseMainSurfaceStateJson,
  type MainSurfacePersistedState,
} from './main-surface-persisted.ts'

export interface MainSurfaceStateSnapshot {
  readonly revision: number
  readonly activeId: string
  readonly defaultId: string
  readonly restoreLast: boolean
}

export const MAIN_SURFACE_STATE_KEY = 'dsh-workbench-main-surface:v1:global'
export type MainSurfaceStateWriter = (value: MainSurfacePersistedState) => void | Promise<void>

export class MainSurfaceStateService {
  private readonly listeners = new Set<() => void>()
  private state: MainSurfacePersistedState
  private snapshot: MainSurfaceStateSnapshot
  private writer: MainSurfaceStateWriter | undefined
  private writeQueue = Promise.resolve()

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {
    this.state = parseMainSurfaceStateJson(storage?.getItem(MAIN_SURFACE_STATE_KEY) ?? null) ?? DEFAULT_MAIN_SURFACE_STATE
    this.snapshot = Object.freeze({ revision: 0, activeId: this.state.restoreLast ? this.state.activeId : this.state.defaultId, defaultId: this.state.defaultId, restoreLast: this.state.restoreLast })
  }

  getSnapshot = (): MainSurfaceStateSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  setWriter(writer: MainSurfaceStateWriter | undefined): void { this.writer = writer }

  hydrate(value: MainSurfacePersistedState): void {
    if (this.sameState(value)) return
    this.state = value
    this.emit(value.restoreLast ? value.activeId : value.defaultId)
    try { this.storage?.setItem(MAIN_SURFACE_STATE_KEY, JSON.stringify(value)) } catch { /* compatibility cache only */ }
  }

  activate(id: string): void {
    if (!isMainSurfaceId(id) || this.snapshot.activeId === id) return
    this.state = { ...this.state, activeId: id }
    this.publish(id)
  }

  setDefault(id: string): void {
    if (!isMainSurfaceId(id) || this.state.defaultId === id) return
    this.state = { ...this.state, defaultId: id }
    this.publish(this.snapshot.activeId)
  }

  setRestoreLast(restoreLast: boolean): void {
    if (this.state.restoreLast === restoreLast) return
    this.state = { ...this.state, restoreLast }
    this.publish(this.snapshot.activeId)
  }

  reset(): void {
    this.state = DEFAULT_MAIN_SURFACE_STATE
    this.publish(AGENT_MAIN_SURFACE_ID)
  }

  private sameState(value: MainSurfacePersistedState): boolean {
    return value.activeId === this.state.activeId && value.defaultId === this.state.defaultId && value.restoreLast === this.state.restoreLast
  }

  private publish(activeId: string): void {
    try { this.storage?.setItem(MAIN_SURFACE_STATE_KEY, JSON.stringify(this.state)) } catch { /* compatibility cache only */ }
    const writer = this.writer
    const value = this.state
    if (writer !== undefined) this.writeQueue = this.writeQueue.then(() => writer(value)).then(() => undefined, () => undefined)
    this.emit(activeId)
  }

  private emit(activeId: string): void {
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, activeId, defaultId: this.state.defaultId, restoreLast: this.state.restoreLast })
    for (const listener of [...this.listeners]) {
      try { listener() } catch { /* isolate consumers */ }
    }
  }
}
