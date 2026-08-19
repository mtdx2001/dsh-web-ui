import { describe, expect, it, vi } from 'vitest'
import { ModuleRegistry } from '../src/core/module-registry.ts'
import { NavigationController } from '../src/core/navigation-state.ts'

function registration(id: string, activate = vi.fn(), deactivate = vi.fn()) {
  return { id, order: 10, label: id, icon: 'extension' as const, activate, deactivate }
}

describe('workbench navigation state', () => {
  it('serializes activation and deactivates the previous module', async () => {
    const registry = new ModuleRegistry()
    const agent = registration('agent')
    const tasks = registration('tasks')
    registry.register(agent)
    registry.register(tasks)
    const navigation = new NavigationController(registry)

    expect(await navigation.activate('agent')).toEqual({ ok: true, activeId: 'agent' })
    expect(await navigation.activate('tasks')).toEqual({ ok: true, activeId: 'tasks' })
    expect(agent.deactivate).toHaveBeenCalledTimes(1)
    expect(tasks.activate).toHaveBeenCalledTimes(1)
    expect(navigation.getSnapshot()).toMatchObject({ phase: 'active', activeId: 'tasks' })
  })

  it('rolls back to the previous module when the target cannot activate', async () => {
    const registry = new ModuleRegistry()
    const agent = registration('agent')
    const tasks = registration('tasks', vi.fn(() => { throw new Error('board unavailable') }))
    registry.register(agent)
    registry.register(tasks)
    const navigation = new NavigationController(registry)

    await navigation.activate('agent')
    const result = await navigation.activate('tasks')
    expect(result).toEqual({ ok: false, error: 'board unavailable', activeId: 'agent' })
    expect(agent.activate).toHaveBeenCalledTimes(2)
    expect(navigation.getSnapshot()).toMatchObject({ phase: 'error', activeId: 'agent' })
  })

  it('does not reactivate a module when its own deactivation fails', async () => {
    const registry = new ModuleRegistry()
    const agent = registration('agent', vi.fn(), vi.fn(() => { throw new Error('close blocked') }))
    const ssh = registration('ssh')
    registry.register(agent)
    registry.register(ssh)
    const navigation = new NavigationController(registry)

    await navigation.activate('agent')
    const result = await navigation.activate('ssh')
    expect(result).toEqual({ ok: false, error: 'close blocked', activeId: 'agent' })
    expect(agent.activate).toHaveBeenCalledTimes(1)
    expect(ssh.activate).not.toHaveBeenCalled()
  })

  it('contains availability exceptions as navigation failures', async () => {
    const registry = new ModuleRegistry()
    registry.register({
      ...registration('ssh'),
      availability: () => { throw new Error('probe failed') },
    })
    const navigation = new NavigationController(registry)

    await expect(navigation.activate('ssh')).resolves.toEqual({ ok: false, error: 'probe failed', activeId: undefined })
    expect(navigation.getSnapshot()).toMatchObject({ phase: 'error', error: 'probe failed' })
  })

  it('deactivates the current module during navigation disposal', async () => {
    const registry = new ModuleRegistry()
    const agent = registration('agent')
    registry.register(agent)
    const navigation = new NavigationController(registry)
    await navigation.activate('agent')

    const first = navigation.dispose()
    const second = navigation.dispose()
    expect(second).toBe(first)
    await first
    expect(agent.deactivate).toHaveBeenCalledTimes(1)
    await expect(navigation.activate('agent')).resolves.toMatchObject({ ok: false, error: 'Workbench navigation is disposed' })
  })

  it('does not publish an asynchronously activated module after registration removal', async () => {
    const registry = new ModuleRegistry()
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const tasks = registration('tasks', vi.fn(() => pending))
    const remove = registry.register(tasks)
    const navigation = new NavigationController(registry)

    const activation = navigation.activate('tasks')
    await Promise.resolve()
    await Promise.resolve()
    remove()
    release()

    await expect(activation).resolves.toMatchObject({ ok: false, activeId: undefined })
    expect(tasks.deactivate).toHaveBeenCalledTimes(1)
    expect(navigation.getSnapshot().activeId).toBeUndefined()
  })

  it('does not publish an asynchronously activated module after disposal', async () => {
    const registry = new ModuleRegistry()
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const tasks = registration('tasks', vi.fn(() => pending))
    registry.register(tasks)
    const navigation = new NavigationController(registry)

    const activation = navigation.activate('tasks')
    await Promise.resolve()
    await Promise.resolve()
    const disposal = navigation.dispose()
    release()

    await expect(activation).resolves.toMatchObject({ ok: false, error: 'Workbench navigation is disposed' })
    await disposal
    expect(tasks.deactivate).toHaveBeenCalledTimes(1)
    expect(navigation.getSnapshot().activeId).toBeUndefined()
  })

  it('keeps externally adopted state when it cancels a pending activation', async () => {
    const registry = new ModuleRegistry()
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    registry.register(registration('agent'))
    const tasks = registration('tasks', vi.fn(() => pending))
    registry.register(tasks)
    const navigation = new NavigationController(registry)
    await navigation.activate('agent')

    const activation = navigation.activate('tasks')
    await Promise.resolve()
    await navigation.adopt('agent')
    release()

    await expect(activation).resolves.toEqual({
      ok: false,
      error: 'Workbench navigation transition was cancelled',
      activeId: 'agent',
    })
    expect(tasks.deactivate).not.toHaveBeenCalled()
    expect(navigation.getSnapshot()).toMatchObject({ phase: 'active', activeId: 'agent' })
  })

  it('keeps externally adopted state when a pending deactivation settles', async () => {
    const registry = new ModuleRegistry()
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const agent = registration('agent', vi.fn(), vi.fn(() => pending))
    registry.register(agent)
    registry.register(registration('tasks'))
    const navigation = new NavigationController(registry)
    await navigation.activate('agent')

    const deactivation = navigation.deactivate()
    await Promise.resolve()
    await Promise.resolve()
    await navigation.adopt('tasks')
    release()

    await expect(deactivation).resolves.toEqual({
      ok: false,
      error: 'Workbench navigation transition was cancelled',
      activeId: 'tasks',
    })
    expect(navigation.getSnapshot()).toMatchObject({ phase: 'active', activeId: 'tasks' })
  })

  it('does not publish a stale deactivation failure over adopted state', async () => {
    const registry = new ModuleRegistry()
    let reject!: (error: Error) => void
    const pending = new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise })
    const agent = registration('agent', vi.fn(), vi.fn(() => pending))
    registry.register(agent)
    registry.register(registration('tasks'))
    registry.register(registration('ssh'))
    const navigation = new NavigationController(registry)
    await navigation.activate('agent')

    const activation = navigation.activate('tasks')
    await Promise.resolve()
    await Promise.resolve()
    await navigation.adopt('ssh')
    reject(new Error('close blocked'))

    await expect(activation).resolves.toEqual({
      ok: false,
      error: 'Workbench navigation transition was cancelled',
      activeId: 'ssh',
    })
    expect(navigation.getSnapshot()).toMatchObject({ phase: 'active', activeId: 'ssh', error: undefined })
  })

  it('clears navigation when the active registration is removed', async () => {
    const registry = new ModuleRegistry()
    const remove = registry.register(registration('agent'))
    const navigation = new NavigationController(registry)
    await navigation.activate('agent')

    remove()
    expect(navigation.getSnapshot()).toEqual({ phase: 'idle', activeId: undefined, targetId: undefined, error: undefined })
  })
})
