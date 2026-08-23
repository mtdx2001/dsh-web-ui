import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinModuleRegistrations, registerBuiltinModules } from '../src/client/builtin-modules.ts'
import { setLanguage } from '../src/client/locales.ts'
import { WorkbenchService } from '../src/client/workbench-service.ts'

function installSettingsButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  const triggerSlot = document.createElement('div')
  triggerSlot.dataset.slot = 'settings.trigger'
  button.appendChild(triggerSlot)
  const sidebar = document.createElement('div')
  sidebar.dataset.pane = 'sidebar'
  sidebar.appendChild(button)
  document.body.appendChild(sidebar)
  return button
}

describe('built-in navigation modules', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    setLanguage('en')
  })

  it('keeps Task Board and SSH exclusively in the central mode registry', () => {
    const modules = builtinModuleRegistrations()
    expect(modules.map((entry) => entry.id)).toEqual(['agent', 'knowledge', 'experts', 'news', 'monitoring', 'settings'])
    expect(modules.some((entry) => entry.id === 'tasks' || entry.id === 'ssh')).toBe(false)
  })

  it('opens the exact official Settings trigger', () => {
    const sidebar = document.createElement('div')
    sidebar.dataset.pane = 'sidebar'
    const unrelated = document.createElement('button')
    const unrelatedSlot = document.createElement('div')
    unrelatedSlot.dataset.slot = 'unrelated'
    unrelated.appendChild(unrelatedSlot)
    sidebar.appendChild(unrelated)
    document.body.appendChild(sidebar)
    const unrelatedClick = vi.spyOn(unrelated, 'click')
    const settings = installSettingsButton()
    const click = vi.spyOn(settings, 'click')

    builtinModuleRegistrations().find((entry) => entry.id === 'settings')?.activate()
    expect(click).toHaveBeenCalledTimes(1)
    expect(unrelatedClick).not.toHaveBeenCalled()
  })

  it('marks Settings unavailable until its official trigger mounts', async () => {
    const service = new WorkbenchService()
    const refresh = vi.spyOn(service, 'refresh')
    const dispose = registerBuiltinModules(service)
    expect(service.getModules().modules.find((entry) => entry.id === 'settings')?.availability.kind).toBe('unavailable')

    installSettingsButton()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(refresh).toHaveBeenCalledWith('settings')
    expect(service.getModules().modules.find((entry) => entry.id === 'settings')?.availability.kind).toBe('available')
    await dispose()
    await service.dispose()
  })

  it('adopts an external Settings click without replaying it', async () => {
    const settings = installSettingsButton()
    const click = vi.spyOn(settings, 'click')
    const service = new WorkbenchService()
    const dispose = registerBuiltinModules(service)
    settings.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(click).toHaveBeenCalledTimes(1)
    expect(service.getNavigation().activeId).toBe('settings')
    await dispose()
    await service.dispose()
  })
})
