import type { ModuleRegistry, WorkbenchModuleRegistration } from './module-registry.ts'

export type NavigationPhase = 'idle' | 'activating' | 'active' | 'error'

export interface NavigationSnapshot {
  readonly phase: NavigationPhase
  readonly activeId: string | undefined
  readonly targetId: string | undefined
  readonly error: string | undefined
}

export type NavigationResult =
  | { ok: true; activeId: string | undefined }
  | { ok: false; error: string; activeId: string | undefined }

const IDLE: NavigationSnapshot = Object.freeze({
  phase: 'idle', activeId: undefined, targetId: undefined, error: undefined,
})

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class NavigationController {
  private readonly listeners = new Set<() => void>()
  private readonly disposeRegistry: () => void
  private snapshot: NavigationSnapshot = IDLE
  private queue: Promise<unknown> = Promise.resolve()
  private disposal: Promise<void> | undefined
  private disposed = false
  private transition = 0

  constructor(private readonly registry: ModuleRegistry) {
    this.disposeRegistry = registry.subscribe(() => {
      const activeRemoved = this.snapshot.activeId !== undefined && registry.get(this.snapshot.activeId) === undefined
      const targetRemoved = this.snapshot.targetId !== undefined && registry.get(this.snapshot.targetId) === undefined
      if (activeRemoved || targetRemoved) {
        this.transition += 1
        this.update(IDLE)
      }
    })
  }

  getSnapshot = (): NavigationSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  activate(id: string): Promise<NavigationResult> {
    return this.enqueue(() => this.activateNow(id))
  }

  deactivate(): Promise<NavigationResult> {
    return this.enqueue(() => this.deactivateNow())
  }

  /** Adopt state already changed by a legacy host entry without replaying its adapter. */
  adopt(id: string | undefined): Promise<NavigationResult> {
    if (this.disposed) return Promise.resolve({ ok: false, error: 'Workbench navigation is disposed', activeId: this.snapshot.activeId })
    if (id !== undefined && this.registry.get(id) === undefined) {
      return Promise.resolve(this.fail(`Unknown workbench module: ${id}`))
    }
    this.transition += 1
    if (id === undefined) {
      this.update(IDLE)
      return Promise.resolve({ ok: true, activeId: undefined })
    }
    this.update(Object.freeze({ phase: 'active', activeId: id, targetId: undefined, error: undefined }))
    return Promise.resolve({ ok: true, activeId: id })
  }

  settle(): Promise<void> {
    return this.queue.then(() => undefined, () => undefined)
  }

  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.transition += 1
    this.disposeRegistry()
    this.listeners.clear()
    return this.disposal = (async () => {
      await this.queue
      const hasMountedActive = this.snapshot.phase === 'active' || this.snapshot.phase === 'error'
      const active = !hasMountedActive || this.snapshot.activeId === undefined ? undefined : this.registry.get(this.snapshot.activeId)
      try {
        await active?.deactivate?.()
      } catch {
        // Unload is best-effort; registry removal must still complete.
      }
      this.snapshot = IDLE
    })()
  }

  private enqueue(task: () => Promise<NavigationResult>): Promise<NavigationResult> {
    if (this.disposed) return Promise.resolve({ ok: false, error: 'Workbench navigation is disposed', activeId: this.snapshot.activeId })
    const guarded = (): Promise<NavigationResult> => this.disposed
      ? Promise.resolve({ ok: false, error: 'Workbench navigation is disposed', activeId: this.snapshot.activeId })
      : task()
    const result = this.queue.then(guarded, guarded)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private async activateNow(id: string): Promise<NavigationResult> {
    const next = this.registry.get(id)
    if (next === undefined) return this.fail(`Unknown workbench module: ${id}`)
    let availability
    try {
      availability = next.availability?.() ?? { kind: 'available' as const }
    } catch (error) {
      return this.fail(messageOf(error))
    }
    if (availability.kind === 'unavailable') return this.fail(availability.reason)
    if (this.snapshot.activeId === id && this.snapshot.phase === 'active') {
      return { ok: true, activeId: id }
    }

    const previous = this.snapshot.activeId === undefined ? undefined : this.registry.get(this.snapshot.activeId)
    const token = ++this.transition
    this.update(Object.freeze({ phase: 'activating', activeId: previous?.id, targetId: id, error: undefined }))
    try {
      await previous?.deactivate?.()
    } catch (error) {
      if (!this.transitionIsCurrent(token, id, next)) return this.cancelTransition(next, false)
      return this.fail(messageOf(error), previous?.id)
    }
    if (!this.transitionIsCurrent(token, id, next)) return this.cancelTransition(next, false)
    try {
      await next.activate()
      if (!this.transitionIsCurrent(token, id, next)) return this.cancelTransition(next, true)
      this.update(Object.freeze({ phase: 'active', activeId: id, targetId: undefined, error: undefined }))
      return { ok: true, activeId: id }
    } catch (error) {
      if (!this.transitionIsCurrent(token, id, next)) return this.cancelTransition(next, false)
      return this.rollback(token, id, next, previous, error)
    }
  }

  private transitionIsCurrent(token: number, id: string, registration: WorkbenchModuleRegistration): boolean {
    return !this.disposed && this.transition === token && this.registry.get(id) === registration
  }

  private async cancelTransition(next: WorkbenchModuleRegistration, activated: boolean): Promise<NavigationResult> {
    if (activated && this.snapshot.activeId !== next.id) {
      try { await next.deactivate?.() } catch { /* A cancelled target unload is best-effort. */ }
    }
    if (this.disposed) return { ok: false, error: 'Workbench navigation is disposed', activeId: undefined }
    return { ok: false, error: 'Workbench navigation transition was cancelled', activeId: this.snapshot.activeId }
  }

  private async rollback(
    token: number,
    id: string,
    next: WorkbenchModuleRegistration,
    previous: WorkbenchModuleRegistration | undefined,
    cause: unknown,
  ): Promise<NavigationResult> {
    let detail = messageOf(cause)
    const canRestore = previous !== undefined && this.registry.get(previous.id) === previous && !this.disposed
    if (canRestore) {
      try {
        await previous.activate()
      } catch (rollbackError) {
        if (!this.transitionIsCurrent(token, id, next)) return this.cancelTransition(next, false)
        detail = `${detail}; rollback failed: ${messageOf(rollbackError)}`
        return this.fail(detail, undefined)
      }
    }
    if (!this.transitionIsCurrent(token, id, next)) return this.cancelTransition(next, false)
    return this.fail(detail, canRestore ? previous.id : undefined)
  }

  private async deactivateNow(): Promise<NavigationResult> {
    const active = this.snapshot.activeId === undefined ? undefined : this.registry.get(this.snapshot.activeId)
    if (active === undefined) {
      this.update(IDLE)
      return { ok: true, activeId: undefined }
    }
    const token = ++this.transition
    try {
      await active.deactivate?.()
      if (!this.deactivationIsCurrent(token, active)) return this.cancelDeactivation()
      this.update(IDLE)
      return { ok: true, activeId: undefined }
    } catch (error) {
      if (!this.deactivationIsCurrent(token, active)) return this.cancelDeactivation()
      return this.fail(messageOf(error), active.id)
    }
  }

  private deactivationIsCurrent(token: number, active: WorkbenchModuleRegistration): boolean {
    return !this.disposed && this.transition === token && this.registry.get(active.id) === active
  }

  private cancelDeactivation(): NavigationResult {
    if (this.disposed) return { ok: false, error: 'Workbench navigation is disposed', activeId: undefined }
    return { ok: false, error: 'Workbench navigation transition was cancelled', activeId: this.snapshot.activeId }
  }

  private fail(error: string, activeId = this.snapshot.activeId): NavigationResult {
    this.update(Object.freeze({ phase: 'error', activeId, targetId: undefined, error }))
    return { ok: false, error, activeId }
  }

  private update(next: NavigationSnapshot): void {
    if (this.snapshot === next) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}
