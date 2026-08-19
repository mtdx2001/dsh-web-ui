import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinModuleRegistrations, registerBuiltinModules } from '../src/client/builtin-modules.ts'
import { setLanguage } from '../src/client/locales.ts'
import { WorkbenchService } from '../src/client/workbench-service.ts'

function installButton(selector: 'task' | 'ssh' | 'settings'): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  if (selector === 'task') button.dataset.dshTaskboardEntry = ''
  if (selector === 'ssh') button.dataset.dshSshEntry = ''
  if (selector === 'settings') {
    button.setAttribute('aria-haspopup', 'dialog')
    const triggerSlot = document.createElement('div')
    triggerSlot.dataset.slot = 'settings.trigger'
    button.appendChild(triggerSlot)
    const sidebar = document.createElement('div')
    sidebar.dataset.pane = 'sidebar'
    sidebar.appendChild(button)
    document.body.appendChild(sidebar)
    return button
  }
  document.body.appendChild(button)
  return button
}

describe('legacy Task Board, SSH, and Settings adapters', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-dsh-taskboard-active')
    document.documentElement.removeAttribute('data-dsh-ssh-active')
    setLanguage('en')
  })

  it('registers the product modules and marks data-less modules unavailable', () => {
    const modules = builtinModuleRegistrations()
    expect(modules.map((entry) => entry.id)).toEqual(['agent', 'tasks', 'knowledge', 'experts', 'news', 'monitoring', 'ssh', 'settings'])
    // Knowledge, Experts and News all have real data paths and are always available.
    expect(['knowledge', 'experts'].every((id) => modules.find((entry) => entry.id === id)?.availability === undefined)).toBe(true)
    expect(modules.find((entry) => entry.id === 'news')?.availability).toBeUndefined()
  })

  it('opens one legacy panel at a time and returns to Agent without touching core controllers', () => {
    const task = installButton('task')
    const ssh = installButton('ssh')
    task.addEventListener('click', () => document.documentElement.toggleAttribute('data-dsh-taskboard-active'))
    ssh.addEventListener('click', () => document.documentElement.toggleAttribute('data-dsh-ssh-active'))
    const modules = builtinModuleRegistrations()
    const agent = modules.find((entry) => entry.id === 'agent')!
    const tasks = modules.find((entry) => entry.id === 'tasks')!
    const sshModule = modules.find((entry) => entry.id === 'ssh')!

    tasks.activate()
    expect(document.documentElement.hasAttribute('data-dsh-taskboard-active')).toBe(true)
    sshModule.activate()
    expect(document.documentElement.hasAttribute('data-dsh-taskboard-active')).toBe(false)
    expect(document.documentElement.hasAttribute('data-dsh-ssh-active')).toBe(true)
    agent.activate()
    expect(document.documentElement.hasAttribute('data-dsh-ssh-active')).toBe(false)
  })

  it.each([
    ['tasks', 'data-dsh-taskboard-active'],
    ['ssh', 'data-dsh-ssh-active'],
  ] as const)('adopts an already-open %s panel without closing or replaying it', async (activeId, attribute) => {
    const task = installButton('task')
    const ssh = installButton('ssh')
    installButton('settings')
    const taskClick = vi.spyOn(task, 'click')
    const sshClick = vi.spyOn(ssh, 'click')
    document.documentElement.setAttribute(attribute, '')
    const service = new WorkbenchService()
    const dispose = registerBuiltinModules(service)
    await Promise.resolve()
    await Promise.resolve()

    expect(service.getNavigation().activeId).toBe(activeId)
    expect(taskClick).not.toHaveBeenCalled()
    expect(sshClick).not.toHaveBeenCalled()
    await dispose()
    await service.dispose()
  })

  it('adopts one external Settings click without replaying the host trigger', async () => {
    installButton('task')
    installButton('ssh')
    const settings = installButton('settings')
    const click = vi.spyOn(settings, 'click')
    const service = new WorkbenchService()
    const dispose = registerBuiltinModules(service)
    await Promise.resolve()

    settings.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(click).toHaveBeenCalledTimes(1)
    expect(service.getNavigation().activeId).toBe('settings')
    await dispose()
    await service.dispose()
  })

  it('does not mirror internal panel clicks back into a stale navigation request', async () => {
    const task = installButton('task')
    const ssh = installButton('ssh')
    task.addEventListener('click', () => document.documentElement.toggleAttribute('data-dsh-taskboard-active'))
    ssh.addEventListener('click', () => document.documentElement.toggleAttribute('data-dsh-ssh-active'))
    installButton('settings')
    const service = new WorkbenchService()
    const dispose = registerBuiltinModules(service)
    await service.activate('tasks')
    await service.activate('ssh')
    await Promise.resolve()
    await Promise.resolve()

    expect(service.getNavigation().activeId).toBe('ssh')
    expect(document.documentElement.hasAttribute('data-dsh-ssh-active')).toBe(true)
    await dispose()
    expect(document.documentElement.hasAttribute('data-dsh-ssh-active')).toBe(true)
    await service.dispose()
  })

  it('refreshes a legacy module when its entry mounts after registration', async () => {
    const service = new WorkbenchService()
    const refresh = vi.spyOn(service, 'refresh')
    const dispose = registerBuiltinModules(service)
    expect(service.getModules().modules.find((entry) => entry.id === 'tasks')?.availability.kind).toBe('unavailable')

    installButton('task')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(refresh).toHaveBeenCalledWith('tasks')
    expect(service.getModules().modules.find((entry) => entry.id === 'tasks')?.availability.kind).toBe('available')
    await dispose()
    await service.dispose()
  })

  it('opens the official Settings trigger and degrades missing entries', () => {
    const sidebar = document.createElement('div')
    sidebar.dataset.pane = 'sidebar'
    const unrelatedDialog = document.createElement('button')
    unrelatedDialog.setAttribute('aria-haspopup', 'dialog')
    sidebar.appendChild(unrelatedDialog)
    document.body.appendChild(sidebar)
    const unrelatedClick = vi.spyOn(unrelatedDialog, 'click')
    const settings = installButton('settings')
    const click = vi.spyOn(settings, 'click')
    let modules = builtinModuleRegistrations()
    modules.find((entry) => entry.id === 'settings')?.activate()
    expect(click).toHaveBeenCalledTimes(1)
    expect(unrelatedClick).not.toHaveBeenCalled()

    document.body.innerHTML = ''
    modules = builtinModuleRegistrations()
    expect(modules.find((entry) => entry.id === 'tasks')?.availability?.()).toEqual({
      kind: 'unavailable', reason: 'Module entry is currently unavailable',
    })
    expect(() => modules.find((entry) => entry.id === 'ssh')?.activate()).toThrow('Module entry is currently unavailable')
  })
})
