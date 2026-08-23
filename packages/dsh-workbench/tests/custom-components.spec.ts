import { describe, expect, it, vi } from 'vitest'
import { CUSTOM_COMPONENTS_KEY, CustomComponentService, parseCustomComponents } from '../src/core/custom-components.ts'
import { registerCustomComponents } from '../src/client/custom-component-runtime.tsx'
import { ComponentPreferencesService } from '../src/core/component-preferences.ts'
import { WorkbenchService } from '../src/client/workbench-service.ts'

class StorageStub {
  readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('custom component persistence and runtime projection', () => {
  it('persists valid structured definitions and restores them without executable fields', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const storage = new StorageStub()
    const service = new CustomComponentService(storage)
    const created = service.create({ kind: 'information', label: ' Build notes ', region: 'left-bottom', summary: ' Today ', content: ' Run tests. ' })

    expect(created).toMatchObject({ kind: 'information', label: 'Build notes', region: 'left-bottom', summary: 'Today', content: 'Run tests.', createdAt: 1234 })
    expect(new CustomComponentService(storage).getSnapshot().components).toEqual([created])
    expect(JSON.parse(storage.values.get(CUSTOM_COMPONENTS_KEY) ?? '{}')).not.toHaveProperty('components.0.render')
  })

  it('rejects invalid kinds, regions, empty content, duplicates, and oversized values while parsing', () => {
    const raw = JSON.stringify({ version: 1, components: [
      { id: 'custom-a-b', kind: 'text-panel', label: 'Valid', region: 'right-sidebar', summary: 'Valid', content: 'Text', createdAt: 1 },
      { id: 'custom-a-b', kind: 'text-panel', label: 'Duplicate', region: 'right-sidebar', summary: 'Duplicate', content: 'Text', createdAt: 2 },
      { id: 'custom-c-d', kind: 'text-panel', label: 'Wrong region', region: 'left-top', summary: 'Wrong', content: 'Text', createdAt: 3 },
      { id: 'custom-e-f', kind: 'information', label: '', region: 'left-top', summary: 'Empty', content: 'Text', createdAt: 4 },
    ] })
    expect(parseCustomComponents(raw)).toHaveLength(1)
    const service = new CustomComponentService(undefined)
    expect(() => service.create({ kind: 'text-panel', label: 'Bad', region: 'left-top', content: 'Text' })).toThrow()
    expect(() => service.create({ kind: 'information', label: 'Bad', region: 'left-top', content: '' })).toThrow()
    expect(() => service.create({ kind: 'information', label: 'x'.repeat(61), region: 'left-top', content: 'Text' })).toThrow()
  })

  it('projects information rows and text panels through existing source-qualified registries', () => {
    const custom = new CustomComponentService(undefined)
    const information = custom.create({ kind: 'information', label: 'Status note', region: 'left-top', summary: 'Ready', content: 'All checks passed.' })
    const panel = custom.create({ kind: 'text-panel', label: 'Team notes', region: 'right-sidebar', content: 'Shared notes.' })
    const central = custom.create({ kind: 'text-panel', label: 'Central notes', region: 'main-surface', content: 'Central content.' })
    const workbench = new WorkbenchService(new ComponentPreferencesService(undefined))
    const dispose = registerCustomComponents(workbench, custom)

    expect(workbench.getSidebarRows().rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: information.id, componentId: `workbench-custom:${information.id}`, slot: 'top', kind: 'disclosure' })]))
    expect(workbench.getRightPanels().panels).toEqual(expect.arrayContaining([expect.objectContaining({ id: `workbench-custom:${panel.id}`, localId: panel.id, source: 'workbench-custom' })]))
    expect(workbench.getMainSurfaces().modes).toEqual(expect.arrayContaining([expect.objectContaining({ id: `workbench-custom:${central.id}`, localId: central.id, source: 'workbench-custom' })]))
    expect(workbench.getComponentPreferences().getSnapshot().components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `workbench-custom:${information.id}`, region: 'left-top' }),
      expect.objectContaining({ id: `workbench-custom:${panel.id}`, region: 'right-sidebar' }),
    ]))

    custom.remove(information.id)
    expect(workbench.getSidebarRows().rows.some((row) => row.id === information.id)).toBe(false)
    dispose()
    expect(workbench.getRightPanels().panels.some((item) => item.localId === panel.id)).toBe(false)
  })
})
