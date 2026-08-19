// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { PanelController } from '../src/client/panel/controller.ts'
import { registerSshWorkbenchRow, type WorkbenchSidebarRowRegistration } from '../src/client/workbench-row.tsx'

describe('SSH Workbench row adapter', () => {
  it('registers the existing controller and restores the retained entry state on dispose', () => {
    const controller = new PanelController()
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

    const dispose = registerSshWorkbenchRow(service, controller)
    expect(registration).toMatchObject({ id: 'ssh', slot: 'top', order: 20 })
    registration?.onHostPresenceChange?.(true)
    expect(document.documentElement.hasAttribute('data-dsh-workbench-ssh-row')).toBe(true)
    registration?.toggle()
    expect(controller.getSnapshot().panelOpen).toBe(true)
    expect(refreshSidebarRow).toHaveBeenCalledWith('ssh')

    dispose()
    expect(document.documentElement.hasAttribute('data-dsh-workbench-ssh-row')).toBe(false)
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('fails soft when Workbench is absent', () => {
    const controller = new PanelController()
    expect(() => registerSshWorkbenchRow(undefined, controller)()).not.toThrow()
  })
})
