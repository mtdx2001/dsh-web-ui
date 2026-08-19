import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarRows } from '../src/client/SidebarRows.tsx'
import { WorkbenchService } from '../src/client/workbench-service.ts'

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('SidebarRows', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('renders only the requested stack and delegates toggle', async () => {
    const service = new WorkbenchService()
    const toggleTop = vi.fn()
    service.registerSidebarRow({
      id: 'task-board', slot: 'top', order: 10, label: 'Tasks', expanded: () => true,
      summary: () => createElement('span', null, 'Tasks 2'),
      details: () => createElement('span', null, 'Running task'),
      toggle: toggleTop,
    })
    service.registerSidebarRow({ id: 'balance', slot: 'bottom', order: 10, label: 'Balance', toggle: vi.fn() })
    const owner = document.createElement('div')
    document.body.appendChild(owner)
    const root = createRoot(owner)
    root.render(createElement(SidebarRows, { service, slot: 'top', wide: true }))
    await settle()

    expect(owner.querySelector('[data-dsh-workbench-row="task-board"]')).not.toBeNull()
    expect(owner.querySelector('[data-dsh-workbench-row="balance"]')).toBeNull()
    expect(owner.textContent).toContain('Tasks 2')
    expect(owner.textContent).toContain('Running task')
    ;(owner.querySelector('button') as HTMLButtonElement).click()
    expect(toggleTop).toHaveBeenCalledTimes(1)

    root.unmount()
    await service.dispose()
  })

  it('reports row host presence across mount and unmount', async () => {
    const service = new WorkbenchService()
    const onHostPresenceChange = vi.fn()
    service.registerSidebarRow({
      id: 'task-board', slot: 'top', order: 10, label: 'Tasks',
      onHostPresenceChange,
      toggle: vi.fn(),
    })
    const owner = document.createElement('div')
    document.body.appendChild(owner)
    const root = createRoot(owner)
    root.render(createElement(SidebarRows, { service, slot: 'top', wide: true }))
    await settle()
    expect(onHostPresenceChange).toHaveBeenCalledWith(true)

    root.unmount()
    expect(onHostPresenceChange).toHaveBeenLastCalledWith(false)
    await service.dispose()
  })

  it('uses an accessible fixed marker in the compact sidebar', async () => {
    const service = new WorkbenchService()
    const toggle = vi.fn()
    service.registerSidebarRow({ id: 'task-board', slot: 'top', order: 10, label: '任务看板', toggle })
    const owner = document.createElement('div')
    document.body.appendChild(owner)
    const root = createRoot(owner)
    root.render(createElement(SidebarRows, { service, slot: 'top', wide: false }))
    await settle()

    const button = owner.querySelector('button') as HTMLButtonElement
    expect(button.getAttribute('aria-label')).toBe('任务看板')
    expect(button.textContent).toBe('T')
    expect(owner.textContent).not.toContain('任务看板')
    button.click()
    expect(toggle).toHaveBeenCalledTimes(1)

    root.unmount()
    await service.dispose()
  })
})
