import { describe, expect, it } from 'vitest'
import { registerWorkbenchRows, SidebarOwnerFixture, type SidebarRowContribution } from './fixtures/sidebar-owner.ts'

const rows: readonly SidebarRowContribution[] = [
  { id: 'top-task-board', render: ({ wide }) => `top:${wide ? 'wide' : 'rail'}` },
  { id: 'bottom-balance', render: ({ wide }) => `bottom:${wide ? 'wide' : 'rail'}` },
]

describe('Sidebar owner contract fixture', () => {
  it('accepts compatible top and bottom row declarations', () => {
    const sidebar = new SidebarOwnerFixture()
    const unload = sidebar.mountOwner('official-sidebar')
    const disposeRows = registerWorkbenchRows(sidebar, rows)

    expect(sidebar.declaredSlots()).toEqual(['sidebar.rows.top', 'sidebar.rows.bottom'])
    expect(sidebar.render('sidebar.rows.top')).toEqual(['top:wide'])
    expect(sidebar.render('sidebar.rows.bottom', false)).toEqual(['bottom:rail'])

    disposeRows()
    unload()
  })

  it('does not register rows when the owner has not declared a slot', () => {
    const sidebar = new SidebarOwnerFixture()
    sidebar.mountOwner('legacy-sidebar', ['sidebar.rows.top'])
    registerWorkbenchRows(sidebar, rows)

    expect(sidebar.render('sidebar.rows.top')).toEqual(['top:wide'])
    expect(sidebar.render('sidebar.rows.bottom')).toEqual([])
  })

  it('does not replace the official Sidebar when a duplicate owner mounts', () => {
    const sidebar = new SidebarOwnerFixture()
    const unloadOfficial = sidebar.mountOwner('official-sidebar')
    const unloadDuplicate = sidebar.mountOwner('workbench-sidebar')
    registerWorkbenchRows(sidebar, rows)

    expect(sidebar.hasOwner()).toBe(true)
    expect(sidebar.render('sidebar.rows.top')).toEqual(['top:wide'])
    unloadDuplicate()
    expect(sidebar.hasOwner()).toBe(true)
    expect(sidebar.render('sidebar.rows.bottom')).toEqual(['bottom:wide'])
    unloadOfficial()
  })

  it('cleans row registrations when Workbench unloads', () => {
    const sidebar = new SidebarOwnerFixture()
    const unloadOwner = sidebar.mountOwner('official-sidebar')
    const disposeRows = registerWorkbenchRows(sidebar, rows)

    disposeRows()
    expect(sidebar.render('sidebar.rows.top')).toEqual([])
    expect(sidebar.render('sidebar.rows.bottom')).toEqual([])
    unloadOwner()
  })

  it('collapses child declarations when the Sidebar parent unloads', () => {
    const sidebar = new SidebarOwnerFixture()
    const unloadOwner = sidebar.mountOwner('official-sidebar')
    registerWorkbenchRows(sidebar, rows)

    unloadOwner()
    expect(sidebar.hasOwner()).toBe(false)
    expect(sidebar.declaredSlots()).toEqual([])
    expect(sidebar.render('sidebar.rows.top')).toEqual([])
    expect(sidebar.render('sidebar.rows.bottom')).toEqual([])
  })

  it('makes stale row and owner disposers no-ops', () => {
    const sidebar = new SidebarOwnerFixture()
    const unloadFirst = sidebar.mountOwner('official-sidebar')
    const disposeRows = registerWorkbenchRows(sidebar, rows)
    unloadFirst()

    expect(() => {
      disposeRows()
      disposeRows()
      unloadFirst()
    }).not.toThrow()

    const unloadSecond = sidebar.mountOwner('official-sidebar-reloaded')
    expect(sidebar.render('sidebar.rows.top')).toEqual([])
    unloadSecond()
  })
})
