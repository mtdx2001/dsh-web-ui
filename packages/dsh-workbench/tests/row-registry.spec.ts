import { describe, expect, it, vi } from 'vitest'
import { SidebarRowAdmissionError, SidebarRowRegistry } from '../src/core/row-registry.ts'

describe('SidebarRowRegistry admission', () => {
  it('admits action, disclosure, and toggle interactions with stable component ids', () => {
    const registry = new SidebarRowRegistry()
    const action = vi.fn()
    const disclosure = vi.fn()
    const change = vi.fn()
    let expanded = true
    let checked = false

    registry.register({ id: 'primary', source: 'sample-plugin', slot: 'top', order: 10, label: 'Primary', kind: 'action', onAction: action, active: () => true })
    registry.register({ id: 'details', source: '@scope/sample-plugin', slot: 'top', order: 20, label: 'Details', kind: 'disclosure', details: () => 'details', expanded: () => expanded, onToggle: disclosure })
    registry.register({ id: 'feature', source: 'sample-plugin', slot: 'bottom', order: 10, label: 'Feature', kind: 'toggle', checked: () => checked, onChange: change })

    expect(registry.getSnapshot().rows).toMatchObject([
      { id: 'feature', componentId: 'sample-plugin:feature', kind: 'toggle', checked: false },
      { id: 'primary', componentId: 'sample-plugin:primary', kind: 'action', active: true },
      { id: 'details', componentId: '@scope/sample-plugin:details', kind: 'disclosure', expanded: true },
    ])
    void registry.get('primary')?.invoke()
    void registry.get('details')?.invoke()
    void registry.get('feature')?.invoke()
    expect(action).toHaveBeenCalledTimes(1)
    expect(disclosure).toHaveBeenCalledTimes(1)
    expect(change).toHaveBeenCalledWith(true)

    expanded = false
    checked = true
    registry.refresh()
    expect(registry.getSnapshot().rows.find((row) => row.id === 'details')?.expanded).toBe(false)
    expect(registry.getSnapshot().rows.find((row) => row.id === 'feature')?.checked).toBe(true)
  })

  it('normalizes legacy rows without details as actions and rows with details as disclosures', () => {
    const registry = new SidebarRowRegistry()
    const direct = vi.fn()
    const expand = vi.fn()
    registry.register({ id: 'direct', slot: 'top', order: 10, label: 'Direct', toggle: direct })
    registry.register({ id: 'expandable', slot: 'top', order: 20, label: 'Expandable', details: () => 'value', expanded: () => true, toggle: expand })

    expect(registry.getSnapshot().rows).toMatchObject([
      { id: 'direct', componentId: 'legacy:direct', kind: 'action', expanded: false },
      { id: 'expandable', componentId: 'legacy:expandable', kind: 'disclosure', expanded: true },
    ])
    void registry.get('direct')?.invoke()
    void registry.get('expandable')?.invoke()
    expect(direct).toHaveBeenCalledTimes(1)
    expect(expand).toHaveBeenCalledTimes(1)
  })

  it('returns structured diagnostics for invalid and sensitive registrations', () => {
    const registry = new SidebarRowRegistry()
    const invalidId = registry.admit({ id: 'Bad Id', source: 'sample-plugin', slot: 'top', order: 1, label: 'Bad', kind: 'action', onAction: vi.fn() })
    expect(invalidId).toMatchObject({ ok: false, diagnostic: { code: 'invalid_id', field: 'id' } })

    const missingSource = registry.admit({ id: 'missing-source', slot: 'top', order: 1, label: 'Missing source', kind: 'action', onAction: vi.fn() } as any)
    expect(missingSource).toMatchObject({ ok: false, diagnostic: { code: 'invalid_source', field: 'source' } })

    const missing = registry.admit({ id: 'missing', source: 'sample-plugin', slot: 'top', order: 1, label: 'Missing', kind: 'action' } as any)
    expect(missing).toMatchObject({ ok: false, diagnostic: { code: 'missing_callback', field: 'onAction' } })

    const extra = registry.admit({ id: 'extra', source: 'sample-plugin', slot: 'top', order: 1, label: 'Extra', kind: 'action', onAction: vi.fn(), credentialRef: 'must-not-pass-through' } as any)
    expect(extra.ok && 'credentialRef' in extra.registration).toBe(false)
    if (extra.ok) extra.dispose()

    const sensitive = registry.admit({ id: 'unsafe', source: 'sample-plugin', slot: 'top', order: 1, label: 'Unsafe', kind: 'action', metadata: { apiKey: 'not-stored' }, onAction: vi.fn() })
    expect(sensitive).toMatchObject({ ok: false, diagnostic: { code: 'sensitive_metadata', field: 'metadata.apiKey' } })
    expect(registry.getSnapshot().rows).toEqual([])
  })

  it('rejects concurrent duplicates but permits idempotent disposal and later re-admission', () => {
    const registry = new SidebarRowRegistry()
    const registration = { id: 'entry', source: 'sample-plugin', slot: 'top' as const, order: 10, label: 'Entry', kind: 'action' as const, onAction: vi.fn() }
    const dispose = registry.register(registration)
    expect(() => registry.register(registration)).toThrow(SidebarRowAdmissionError)
    dispose()
    dispose()
    expect(() => registry.register(registration)).not.toThrow()
  })

  it('isolates dynamic state and subscriber failures while preserving original order', () => {
    const registry = new SidebarRowRegistry()
    registry.subscribe(() => { throw new Error('stale subscriber') })
    registry.register({ id: 'first', source: 'sample-plugin', slot: 'top', order: 10, label: 'First', kind: 'action', onAction: vi.fn(), active: () => { throw new Error('stale controller') } })
    registry.register({ id: 'second', source: 'sample-plugin', slot: 'top', order: 10, label: 'Second', kind: 'toggle', checked: () => { throw new Error('stale controller') }, onChange: vi.fn() })
    registry.register({ id: 'third', source: 'sample-plugin', slot: 'top', order: 10, label: 'Third', kind: 'disclosure', details: () => 'value', expanded: () => { throw new Error('stale controller') }, onToggle: vi.fn() })

    expect(registry.getSnapshot().rows.map((row) => [row.id, row.registrationIndex, row.active, row.expanded, row.checked])).toEqual([
      ['first', 0, false, false, false],
      ['second', 1, false, false, false],
      ['third', 2, false, false, false],
    ])
  })
})
