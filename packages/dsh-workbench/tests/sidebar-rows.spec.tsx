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

  it('applies component visibility and user ordering without mutating row order', async () => {
    const service = new WorkbenchService()
    service.registerSidebarRow({ id: 'first', source: 'workbench', slot: 'top', order: 10, label: 'First', kind: 'action', onAction: vi.fn() })
    service.registerSidebarRow({ id: 'second', source: 'workbench', slot: 'top', order: 20, label: 'Second', kind: 'action', onAction: vi.fn() })
    const preferences = service.getComponentPreferences()
    preferences.move('workbench:second', -1)
    const owner = document.createElement('div')
    document.body.appendChild(owner)
    const root = createRoot(owner)
    root.render(createElement(SidebarRows, { service, slot: 'top', wide: true }))
    await settle()
    expect([...owner.querySelectorAll('[data-dsh-workbench-row]')].map((node) => node.getAttribute('data-dsh-workbench-row'))).toEqual(['second', 'first'])
    preferences.setEnabled('workbench:second', false)
    await settle()
    expect(owner.querySelector('[data-dsh-workbench-row="second"]')).toBeNull()
    expect(service.getSidebarRows().rows.map((row) => [row.id, row.order])).toEqual([['first', 10], ['second', 20]])
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

  it('renders host-owned interaction semantics and isolates contributor failures', async () => {
    const service = new WorkbenchService()
    let expanded = true
    let checked = false
    const action = vi.fn(() => { throw new Error('action failed') })
    const onToggle = vi.fn(() => { expanded = !expanded; service.refreshSidebarRow('details') })
    const onChange = vi.fn((next: boolean) => { checked = next; service.refreshSidebarRow('feature') })
    service.registerSidebarRow({ id: 'command', source: 'sample-plugin', slot: 'top', order: 10, label: 'Command', kind: 'action', onAction: action, active: () => true, summary: () => { throw new Error('summary failed') } })
    service.registerSidebarRow({ id: 'details', source: 'sample-plugin', slot: 'top', order: 20, label: 'Details', kind: 'disclosure', details: () => createElement('span', null, 'Visible details'), expanded: () => expanded, onToggle })
    service.registerSidebarRow({ id: 'feature', source: 'sample-plugin', slot: 'top', order: 30, label: 'Feature', kind: 'toggle', checked: () => checked, onChange })
    service.registerSidebarRow({ id: 'presence', source: 'sample-plugin', slot: 'top', order: 40, label: 'Presence', kind: 'action', onAction: vi.fn(), icon: () => { throw new Error('icon failed') }, summary: () => { throw new Error('summary failed') }, onHostPresenceChange: () => { throw new Error('presence failed') } })
    const owner = document.createElement('div')
    document.body.appendChild(owner)
    const root = createRoot(owner)
    root.render(createElement(SidebarRows, { service, slot: 'top', wide: true }))
    await settle()

    const command = owner.querySelector('[data-dsh-workbench-row="command"] button') as HTMLButtonElement
    const details = owner.querySelector('[data-dsh-workbench-row="details"] button') as HTMLButtonElement
    const feature = owner.querySelector('[data-dsh-workbench-row="feature"] button') as HTMLButtonElement
    expect(command.getAttribute('aria-current')).toBe('page')
    expect(command.hasAttribute('aria-expanded')).toBe(false)
    expect(command.closest('[data-dsh-workbench-row]')?.querySelector('[class*="chevron"]')).toBeNull()
    expect(details.getAttribute('aria-expanded')).toBe('true')
    expect(details.closest('[data-dsh-workbench-row]')?.querySelector('[class*="chevron"]')).not.toBeNull()
    expect(feature.getAttribute('role')).toBe('switch')
    expect(feature.getAttribute('aria-checked')).toBe('false')
    expect(owner.textContent).toContain('Command')
    expect(owner.textContent).toContain('Details')
    expect(owner.textContent).toContain('Visible details')

    expect(() => command.click()).not.toThrow()
    expect(action).toHaveBeenCalledTimes(1)
    details.click()
    feature.click()
    await settle()
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(feature.getAttribute('aria-checked')).toBe('true')

    root.unmount()
    await service.dispose()
  })

  it('keeps one disclosure open per stack and renders bottom details above its trigger', async () => {
    const service = new WorkbenchService()
    let first = false
    let second = false
    let top = true
    service.registerSidebarRow({ id: 'top', source: 'sample', slot: 'top', order: 10, label: 'Top', kind: 'disclosure', details: () => createElement('span', null, 'Top details'), expanded: () => top, onToggle: () => { top = !top; service.refreshSidebarRow('top') } })
    service.registerSidebarRow({ id: 'first', source: 'sample', slot: 'bottom', order: 10, label: 'First', kind: 'disclosure', details: () => createElement('span', null, 'First details'), expanded: () => first, onToggle: () => { first = !first; service.refreshSidebarRow('first') } })
    service.registerSidebarRow({ id: 'second', source: 'sample', slot: 'bottom', order: 20, label: 'Second', kind: 'disclosure', details: () => createElement('span', null, 'Second details'), expanded: () => second, onToggle: () => { second = !second; service.refreshSidebarRow('second') } })
    const topOwner = document.createElement('div')
    const bottomOwner = document.createElement('div')
    document.body.append(topOwner, bottomOwner)
    const topRoot = createRoot(topOwner)
    const bottomRoot = createRoot(bottomOwner)
    topRoot.render(createElement(SidebarRows, { service, slot: 'top', wide: true }))
    bottomRoot.render(createElement(SidebarRows, { service, slot: 'bottom', wide: true }))
    await settle()

    ;(bottomOwner.querySelector('[data-dsh-workbench-row="first"] > button') as HTMLButtonElement).click()
    await settle()
    ;(bottomOwner.querySelector('[data-dsh-workbench-row="second"] > button') as HTMLButtonElement).click()
    await settle()
    expect(first).toBe(false)
    expect(second).toBe(true)
    expect(top).toBe(true)
    const row = bottomOwner.querySelector('[data-dsh-workbench-row="second"]') as HTMLElement
    expect(row.firstElementChild?.textContent).toContain('Second details')
    expect(row.lastElementChild?.tagName).toBe('BUTTON')

    topRoot.unmount()
    bottomRoot.unmount()
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
    expect(button.textContent).toBe('W')
    expect(owner.textContent).not.toContain('任务看板')
    button.click()
    expect(toggle).toHaveBeenCalledTimes(1)

    root.unmount()
    await service.dispose()
  })
})
