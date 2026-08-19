import { describe, expect, it, vi } from 'vitest'
import { SidebarRowRegistry } from '../src/core/row-registry.ts'

describe('SidebarRowRegistry', () => {
  it('sorts rows by slot, order, and id and refreshes expanded state', () => {
    const registry = new SidebarRowRegistry()
    let expanded = false
    registry.register({ id: 'ssh', slot: 'top', order: 20, label: 'SSH', expanded: () => expanded, toggle: vi.fn() })
    registry.register({ id: 'balance', slot: 'bottom', order: 10, label: 'Balance', toggle: vi.fn() })
    registry.register({ id: 'task-board', slot: 'top', order: 10, label: 'Tasks', toggle: vi.fn() })

    expect(registry.getSnapshot().rows.map((row) => row.id)).toEqual(['balance', 'task-board', 'ssh'])
    expect(registry.getSnapshot().rows.find((row) => row.id === 'ssh')?.expanded).toBe(false)
    expanded = true
    registry.refresh('ssh')
    expect(registry.getSnapshot().rows.find((row) => row.id === 'ssh')?.expanded).toBe(true)
  })

  it('rejects duplicate ids and removes rows idempotently', () => {
    const registry = new SidebarRowRegistry()
    const dispose = registry.register({ id: 'task-board', slot: 'top', order: 10, label: 'Tasks', toggle: vi.fn() })
    expect(() => registry.register({ id: 'task-board', slot: 'bottom', order: 20, label: 'Duplicate', toggle: vi.fn() })).toThrow('already registered')
    dispose()
    dispose()
    expect(registry.getSnapshot().rows).toEqual([])
  })

  it('contains failures in dynamic expanded state', () => {
    const registry = new SidebarRowRegistry()
    registry.register({
      id: 'task-board', slot: 'top', order: 10, label: 'Tasks', toggle: vi.fn(),
      expanded: () => { throw new Error('stale controller') },
    })
    expect(registry.getSnapshot().rows[0]?.expanded).toBe(false)
  })
})
