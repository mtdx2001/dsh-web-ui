import { describe, expect, it, vi } from 'vitest'
import { provideWorkbenchService } from '../src/client/workbench-service.ts'

describe('Phase 2A workbench service', () => {
  it('provides a disposable optional registry face', async () => {
    const cleanups: Array<() => void> = []
    const provide = vi.fn(() => vi.fn())
    const ctx: any = {
      effect(execute: () => unknown) {
        const result = execute()
        if (typeof result === 'function') cleanups.push(result as () => void)
        return result
      },
      provide,
    }
    const service = provideWorkbenchService(ctx)
    service.register({ id: 'agent', order: 10, label: 'Agent', icon: 'agent', activate: vi.fn() })

    expect(provide).toHaveBeenCalledWith('workbench', service)
    expect(service.getModules().modules.map((entry) => entry.id)).toEqual(['agent'])
    for (const cleanup of cleanups.reverse()) await cleanup()
    expect(service.getModules().modules).toEqual([])
    expect(() => service.register({ id: 'ssh', order: 20, label: 'SSH', icon: 'ssh', activate: vi.fn() })).toThrow('disposed')
  })

  it('provides a disposable sidebar row registry', async () => {
    const ctx: any = {
      effect(execute: () => unknown) { return execute() },
      provide: () => () => {},
    }
    const service = provideWorkbenchService(ctx)
    const unregister = service.registerSidebarRow({
      id: 'task-board', slot: 'top', order: 10, label: 'Tasks', toggle: vi.fn(),
    })

    expect(service.getSidebarRows().rows.map((row) => row.id)).toEqual(['task-board'])
    expect(service.getSidebarRow('task-board')?.label).toBe('Tasks')
    unregister()
    expect(service.getSidebarRows().rows).toEqual([])
  })

  it('deactivates an active module before unregistering it', async () => {
    const ctx: any = {
      effect(execute: () => unknown) { return execute() },
      provide: () => () => {},
    }
    const service = provideWorkbenchService(ctx)
    const deactivate = vi.fn()
    const unregister = service.register({
      id: 'tasks', order: 10, label: 'Tasks', icon: 'tasks', activate: vi.fn(), deactivate,
    })
    await service.activate('tasks')

    await unregister()
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(service.getModules().modules).toEqual([])
    expect(service.getNavigation().activeId).toBeUndefined()
  })

  it('invalidates a pending target before unregister completes', async () => {
    const ctx: any = {
      effect(execute: () => unknown) { return execute() },
      provide: () => () => {},
    }
    const service = provideWorkbenchService(ctx)
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const deactivate = vi.fn()
    const unregister = service.register({
      id: 'tasks', order: 10, label: 'Tasks', icon: 'tasks', activate: () => pending, deactivate,
    })
    const activation = service.activate('tasks')
    await Promise.resolve()
    await Promise.resolve()
    const removal = unregister()
    release()

    await expect(activation).resolves.toMatchObject({ ok: false, activeId: undefined })
    await removal
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(service.getNavigation().activeId).toBeUndefined()
    expect(service.getModules().modules).toEqual([])
  })
})
