import { describe, expect, it, vi } from 'vitest'
import { MAIN_SURFACE_STATE_KEY, MainSurfaceStateService } from '../src/core/main-surface-state.ts'

function storage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[MAIN_SURFACE_STATE_KEY, initial]])
  return { values, face: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } }
}

describe('main surface state', () => {
  it('restores the last mode by default and persists only qualified ids', () => {
    const saved = storage(JSON.stringify({ version: 1, activeId: 'dsh-ssh:ssh', defaultId: 'dsh-task-board:tasks', restoreLast: true }))
    const state = new MainSurfaceStateService(saved.face)
    expect(state.getSnapshot()).toMatchObject({ activeId: 'dsh-ssh:ssh', defaultId: 'dsh-task-board:tasks', restoreLast: true })
    state.activate('bad id')
    expect(state.getSnapshot().activeId).toBe('dsh-ssh:ssh')
    state.activate('agent')
    expect(JSON.parse(saved.values.get(MAIN_SURFACE_STATE_KEY) ?? '{}')).toMatchObject({ activeId: 'agent' })
  })

  it('starts from the default when restore-last is disabled', () => {
    const saved = storage(JSON.stringify({ version: 1, activeId: 'dsh-ssh:ssh', defaultId: 'dsh-task-board:tasks', restoreLast: false }))
    const state = new MainSurfaceStateService(saved.face)
    expect(state.getSnapshot().activeId).toBe('dsh-task-board:tasks')
  })

  it('publishes settings changes and resets safely', () => {
    const saved = storage()
    const state = new MainSurfaceStateService(saved.face)
    const listener = vi.fn()
    state.subscribe(listener)
    state.setDefault('dsh-ssh:ssh')
    state.setRestoreLast(false)
    state.reset()
    expect(state.getSnapshot()).toMatchObject({ activeId: 'agent', defaultId: 'agent', restoreLast: true })
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('hydrates host state across origins and serializes remote writes', async () => {
    const saved = storage()
    const writes: string[] = []
    const state = new MainSurfaceStateService(saved.face)
    state.setWriter(async (value) => { writes.push(value.activeId); await Promise.resolve() })
    state.hydrate({ version: 1, activeId: 'dsh-ssh:ssh', defaultId: 'dsh-task-board:tasks', restoreLast: true })
    expect(state.getSnapshot()).toMatchObject({ activeId: 'dsh-ssh:ssh', defaultId: 'dsh-task-board:tasks' })
    state.activate('agent')
    state.activate('dsh-task-board:tasks')
    await vi.waitFor(() => expect(writes).toEqual(['agent', 'dsh-task-board:tasks']))
    expect(JSON.parse(saved.values.get(MAIN_SURFACE_STATE_KEY) ?? '{}').activeId).toBe('dsh-task-board:tasks')
  })
})
