import { describe, expect, it, vi } from 'vitest'
import { ModuleRegistry } from '../src/core/module-registry.ts'

function module(id: string, order: number, extra: object = {}) {
  return { id, order, label: id.toUpperCase(), icon: 'extension' as const, activate: vi.fn(), ...extra }
}

describe('workbench module registry', () => {
  it('normalizes, sorts, publishes, and unregisters modules', () => {
    const registry = new ModuleRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    const removeSsh = registry.register(module('ssh', 20))
    registry.register(module('agent', 10))

    expect(registry.getSnapshot().modules.map((entry) => entry.id)).toEqual(['agent', 'ssh'])
    expect(registry.getSnapshot().revision).toBe(2)
    expect(listener).toHaveBeenCalledTimes(2)

    removeSsh()
    removeSsh()
    expect(registry.getSnapshot().modules.map((entry) => entry.id)).toEqual(['agent'])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('rejects malformed and duplicate registrations without replacing the owner', () => {
    const registry = new ModuleRegistry()
    registry.register(module('tasks', 10))
    expect(() => registry.register(module('tasks', 20))).toThrow('already registered')
    expect(() => registry.register(module('Bad Id', 20))).toThrow('Invalid workbench module id')
    expect(() => registry.register({ ...module('empty', 20), label: ' ' })).toThrow('requires a label')
    expect(registry.get('tasks')?.order).toBe(10)
  })

  it('contains availability failures and refreshes the public snapshot', () => {
    const registry = new ModuleRegistry()
    let enabled = false
    registry.register(module('tasks', 10, {
      availability: () => enabled ? { kind: 'available' } : { kind: 'unavailable', reason: 'disabled' },
    }))
    registry.register(module('ssh', 20, { availability: () => { throw new Error('offline') } }))

    expect(registry.getSnapshot().modules.map((entry) => entry.availability)).toEqual([
      { kind: 'unavailable', reason: 'disabled' },
      { kind: 'unavailable', reason: 'offline' },
    ])
    enabled = true
    registry.refresh('tasks')
    expect(registry.getSnapshot().modules[0].availability).toEqual({ kind: 'available' })
  })
})
