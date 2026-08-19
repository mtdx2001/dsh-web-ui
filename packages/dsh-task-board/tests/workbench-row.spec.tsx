// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { registerTaskBoardWorkbenchRow, type WorkbenchSidebarRowRegistration } from '../src/client/workbench-row.tsx'

describe('task-board Workbench row adapter', () => {
  it('fails soft when Workbench is absent', () => {
    const controller = { getSnapshot: vi.fn(), subscribe: vi.fn(), toggleBoard: vi.fn() } as any
    const dispose = registerTaskBoardWorkbenchRow(undefined, controller)
    expect(() => dispose()).not.toThrow()
    expect(controller.subscribe).not.toHaveBeenCalled()
  })

  it('registers one top row backed by the existing controller and disposes it', () => {
    let listener: (() => void) | undefined
    let registration: WorkbenchSidebarRowRegistration | undefined
    const unregister = vi.fn()
    const refreshSidebarRow = vi.fn()
    const service = {
      registerSidebarRow: vi.fn((row: WorkbenchSidebarRowRegistration) => {
        registration = row
        return unregister
      }),
      refreshSidebarRow,
    }
    const controller = {
      getSnapshot: () => ({
        boardOpen: false,
        tasks: [
          { id: 'one', title: 'Running task', status: 'running' },
          { id: 'two', title: 'Queued task', status: 'todo' },
          { id: 'three', title: 'Completed task', status: 'done' },
        ],
      }),
      subscribe: vi.fn((next: () => void) => { listener = next; return vi.fn() }),
      toggleBoard: vi.fn(),
    } as any

    const dispose = registerTaskBoardWorkbenchRow(service, controller)
    expect(registration).toMatchObject({ id: 'task-board', slot: 'top', order: 10 })
    registration?.onHostPresenceChange?.(true)
    expect(document.documentElement.hasAttribute('data-dsh-workbench-task-row')).toBe(true)
    registration?.toggle()
    expect(controller.toggleBoard).toHaveBeenCalledTimes(1)
    listener?.()
    expect(refreshSidebarRow).toHaveBeenCalledWith('task-board')
    dispose()
    expect(document.documentElement.hasAttribute('data-dsh-workbench-task-row')).toBe(false)
    expect(unregister).toHaveBeenCalledTimes(1)
  })
})
