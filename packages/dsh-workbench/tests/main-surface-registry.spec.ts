import { describe, expect, it, vi } from 'vitest'
import { MainSurfaceRegistry } from '../src/core/main-surface-registry.ts'

describe('main surface registry', () => {
  it('qualifies identities, orders modes, and isolates availability failures', () => {
    const registry = new MainSurfaceRegistry()
    registry.register({ id: 'ssh', source: 'dsh-ssh', order: 30, label: 'SSH', render: () => null, availability: () => { throw new Error('offline') } })
    registry.register({ id: 'tasks', source: 'dsh-task-board', order: 20, label: 'Tasks', render: () => null })
    expect(registry.getSnapshot().modes).toEqual([
      expect.objectContaining({ id: 'dsh-task-board:tasks', localId: 'tasks', availability: { kind: 'available' } }),
      expect.objectContaining({ id: 'dsh-ssh:ssh', localId: 'ssh', availability: { kind: 'unavailable', reason: 'offline' } }),
    ])
  })

  it('refreshes dynamic labels and disposes independently', () => {
    const registry = new MainSurfaceRegistry()
    let label = '任务看板'
    const listener = vi.fn()
    registry.subscribe(listener)
    const dispose = registry.register({ id: 'tasks', source: 'dsh-task-board', order: 20, label: () => label, render: () => null })
    expect(registry.getSnapshot().modes[0]?.label).toBe('任务看板')
    label = 'Task Board'
    registry.refresh('dsh-task-board:tasks')
    expect(registry.getSnapshot().modes[0]?.label).toBe('Task Board')
    dispose()
    expect(registry.getSnapshot().modes).toEqual([])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('rejects invalid or duplicate contributions', () => {
    const registry = new MainSurfaceRegistry()
    expect(() => registry.register({ id: 'Bad Id', source: 'plugin', order: 1, label: 'Bad', render: () => null })).toThrow('Invalid')
    registry.register({ id: 'mode', source: 'plugin', order: 1, label: 'Mode', render: () => null })
    expect(() => registry.register({ id: 'mode', source: 'plugin', order: 2, label: 'Again', render: () => null })).toThrow('already registered')
  })
})
