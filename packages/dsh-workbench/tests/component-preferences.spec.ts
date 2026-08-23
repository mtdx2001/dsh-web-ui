import { describe, expect, it } from 'vitest'
import { ComponentPreferencesService, COMPONENT_PREFERENCES_KEY, componentPreferencesKey, deriveEffectiveComponents, descriptorsFromDock, descriptorsFromSidebar, parseComponentPreferences, type ComponentDescriptor } from '../src/core/component-preferences.ts'
import { SidebarRowRegistry } from '../src/core/row-registry.ts'

const descriptors: ComponentDescriptor[] = [
  { id: 'workbench:agent', region: 'left-top', label: 'Agent', source: 'workbench', order: 10, defaultEnabled: true, removable: false, builtin: true },
  { id: 'plugin:tasks', region: 'left-top', label: 'Tasks', source: 'plugin', order: 20, defaultEnabled: true, removable: true, builtin: false },
  { id: 'workbench:overview', region: 'right-sidebar', label: 'Overview', source: 'workbench', order: 20, defaultEnabled: true, removable: false, builtin: true },
]

describe('component preferences', () => {
  it('maps enabled, position and removable preferences without changing registration order', () => {
    const state = parseComponentPreferences(JSON.stringify({ version: 1, components: { 'plugin:tasks': { enabled: false, position: 1, removed: true }, 'workbench:overview': { removed: true } } }))
    const result = deriveEffectiveComponents(descriptors, state)
    expect(result.find((item) => item.id === 'plugin:tasks')).toMatchObject({ enabled: false, removed: true, effectivePosition: 1, order: 20 })
    expect(result.find((item) => item.id === 'workbench:overview')).toMatchObject({ enabled: true, removed: false, order: 20 })
  })

  it('rejects malformed and secret-shaped fields while retaining bounded valid preferences', () => {
    const state = parseComponentPreferences(JSON.stringify({ version: 1, components: { 'plugin:tasks': { enabled: true, position: -1, token: 'secret' }, bad: { enabled: false } } }))
    expect(state.components).toEqual({ 'plugin:tasks': { enabled: true } })
    expect(parseComponentPreferences('{bad')).toEqual({ version: 1, components: {} })
  })

  it('derives sidebar descriptors from admitted metadata without concrete plugin id rules', () => {
    const registry = new SidebarRowRegistry()
    registry.register({ id: 'plain-entry', slot: 'top', order: 10, label: 'Plain', toggle: () => {} })
    registry.register({ id: 'scoped-entry', source: '@scope/sample-plugin', slot: 'bottom', order: 20, label: 'Scoped', kind: 'action', builtin: false, removable: true, onAction: () => {} })
    expect(descriptorsFromSidebar(registry.getSnapshot(), (id) => registry.get(id))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy:plain-entry', source: 'legacy', builtin: false, removable: true, region: 'left-top' }),
      expect.objectContaining({ id: '@scope/sample-plugin:scoped-entry', source: '@scope/sample-plugin', builtin: false, removable: true, region: 'left-bottom' }),
    ]))
    expect(parseComponentPreferences(JSON.stringify({ version: 1, components: { '@scope/sample-plugin:scoped-entry': { enabled: false } } })).components)
      .toEqual({ '@scope/sample-plugin:scoped-entry': { enabled: false } })
  })

  it('makes every registered left and right component removable regardless of ownership', () => {
    const registry = new SidebarRowRegistry()
    registry.register({ id: 'builtin-entry', source: 'workbench', slot: 'top', order: 10, label: 'Builtin', kind: 'action', builtin: true, removable: false, onAction: () => {} })
    expect(descriptorsFromSidebar(registry.getSnapshot(), (id) => registry.get(id))[0]).toMatchObject({ builtin: true, removable: true })
    expect(descriptorsFromDock([{ id: 'files', order: 10, label: 'Files', kind: 'builtin', removable: false }])[0]).toMatchObject({ builtin: true, removable: true })
  })

  it('preserves preferences for temporarily unavailable components across reconciliation', () => {
    const values = new Map<string, string>([[COMPONENT_PREFERENCES_KEY, JSON.stringify({ version: 1, components: { 'plugin:missing': { enabled: false, removed: true } } })]])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const service = new ComponentPreferencesService(storage)
    service.reconcile(descriptors)
    service.setEnabled('plugin:tasks', false)
    expect(JSON.parse(values.get(COMPONENT_PREFERENCES_KEY) ?? '{}').components).toMatchObject({
      'plugin:missing': { enabled: false, removed: true },
      'plugin:tasks': { enabled: false },
    })
  })

  it('isolates layout preferences per project while inheriting the global default once', () => {
    const values = new Map<string, string>([[COMPONENT_PREFERENCES_KEY, JSON.stringify({ version: 1, components: { 'plugin:tasks': { enabled: false } } })]])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const service = new ComponentPreferencesService(storage)
    service.reconcile(descriptors)
    service.setRoot('E:/project-a')
    expect(service.getSnapshot().components.find((item) => item.id === 'plugin:tasks')?.enabled).toBe(false)
    service.setEnabled('plugin:tasks', true)
    expect(values.has(componentPreferencesKey('E:/project-a'))).toBe(true)

    service.setRoot('E:/project-b')
    expect(service.getSnapshot().components.find((item) => item.id === 'plugin:tasks')?.enabled).toBe(false)
    service.setRemoved('plugin:tasks', true)
    service.setRoot('E:/project-a')
    expect(service.getSnapshot().components.find((item) => item.id === 'plugin:tasks')).toMatchObject({ enabled: true, removed: false })
    service.setRoot('E:/project-b')
    expect(service.getSnapshot().components.find((item) => item.id === 'plugin:tasks')).toMatchObject({ enabled: false, removed: true })
    service.setRoot('')
    expect(service.getSnapshot().components.find((item) => item.id === 'plugin:tasks')?.enabled).toBe(false)
  })

  it('persists UI preferences only and not descriptor data', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const service = new ComponentPreferencesService(storage)
    service.reconcile(descriptors)
    service.setEnabled('plugin:tasks', false)
    const saved = values.get(COMPONENT_PREFERENCES_KEY) ?? ''
    expect(saved).toContain('plugin:tasks')
    expect(saved).not.toContain('secret')
    expect(saved).not.toContain('Agent')
  })
})
