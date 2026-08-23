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

  it('provides an independently disposable right-sidebar registry', () => {
    const ctx: any = { effect(execute: () => unknown) { return execute() }, provide: () => () => {} }
    const service = provideWorkbenchService(ctx)
    const unregister = service.registerRightPanel({ id: 'overview', order: 10, label: 'Overview', render: () => 'overview', source: 'workbench', builtin: true })
    expect(service.getRightPanels().panels).toEqual([expect.objectContaining({ id: 'workbench:overview', localId: 'overview', source: 'workbench', builtin: true })])
    expect(service.getRightPanel('workbench:overview')?.render()).toBe('overview')
    unregister()
    expect(service.getRightPanels().panels).toEqual([])
  })

  it('registers central modes and returns to Agent before removing the active contribution', () => {
    const ctx: any = { effect(execute: () => unknown) { return execute() }, provide: () => () => {} }
    const service = provideWorkbenchService(ctx)
    const unregister = service.registerMainSurface({ id: 'tasks', source: 'dsh-task-board', order: 20, label: 'Tasks', render: () => null })
    expect(service.getMainSurfaces().modes).toEqual([expect.objectContaining({ id: 'dsh-task-board:tasks' })])
    service.getMainSurfaceState().activate('dsh-task-board:tasks')
    unregister()
    expect(service.getMainSurfaceState().getSnapshot().activeId).toBe('agent')
    expect(service.getMainSurfaces().modes).toEqual([])
  })

  it('allows the same local panel id from different sources', () => {
    const ctx: any = { effect(execute: () => unknown) { return execute() }, provide: () => () => {} }
    const service = provideWorkbenchService(ctx)
    service.registerRightPanel({ id: 'files', source: 'plugin-a', order: 10, label: 'Files A', render: () => null })
    service.registerRightPanel({ id: 'files', source: 'plugin-b', order: 20, label: 'Files B', render: () => null })
    expect(service.getRightPanels().panels.map((panel) => panel.id)).toEqual(['plugin-a:files', 'plugin-b:files'])
  })

  it('refreshes dynamic sidebar and right-panel labels after locale changes', () => {
    const ctx: any = { effect(execute: () => unknown) { return execute() }, provide: () => () => {} }
    const service = provideWorkbenchService(ctx)
    let language: 'zh' | 'en' = 'zh'
    service.registerSidebarRow({ id: 'knowledge', source: 'workbench', slot: 'top', order: 10, label: () => language === 'zh' ? '知识' : 'Knowledge', toggle: vi.fn() })
    service.registerRightPanel({ id: 'overview', source: 'workbench', order: 10, label: () => language === 'zh' ? '概览' : 'Overview', render: () => null })
    expect(service.getSidebarRows().rows[0]?.label).toBe('知识')
    expect(service.getRightPanels().panels[0]?.label).toBe('概览')

    language = 'en'
    service.refreshSidebarRow()
    service.refreshRightPanel()
    expect(service.getSidebarRows().rows[0]?.label).toBe('Knowledge')
    expect(service.getRightPanels().panels[0]?.label).toBe('Overview')
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
