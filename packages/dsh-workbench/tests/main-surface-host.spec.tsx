// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchService } from '../src/client/workbench-service.ts'
import { WorkbenchMainSurfaceHost } from '../src/client/WorkbenchMainSurfaceHost.tsx'
import { ComponentPreferencesService } from '../src/core/component-preferences.ts'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

let root: Root | undefined
const settle = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
const click = async (label: string): Promise<void> => {
  const target = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent?.includes(label))
  if (target === undefined) throw new Error(`missing tab ${label}`)
  await act(async () => { target.click() })
}

beforeEach(() => { ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  localStorage.clear()
  vi.restoreAllMocks()
})

function bench() {
  document.body.innerHTML = '<div id="owner"></div>'
  const preferences = new ComponentPreferencesService(new MemoryStorage())
  const service = new WorkbenchService(preferences)
  service.getMainSurfaceState().reset()
  let closeTask: (() => void) | undefined
  const disposeTask = service.registerMainSurface({
    id: 'tasks', source: 'dsh-task-board', order: 20, label: 'Tasks',
    render: ({ close }) => { closeTask = close; return <div data-testid="tasks">Board</div> },
  })
  service.registerMainSurface({ id: 'ssh', source: 'dsh-ssh', order: 30, label: 'SSH', render: () => <div data-testid="ssh">SSH panel</div> })
  root = createRoot(document.querySelector('#owner')!)
  act(() => root?.render(<WorkbenchMainSurfaceHost service={service} agent={<div data-testid="agent"><input defaultValue="draft" /></div>} />))
  return { service, preferences, disposeTask, closeTask: () => closeTask?.() }
}

describe('Workbench main surface host', () => {
  it('uses compact container-responsive tabs with stable icon geometry', () => {
    bench()
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    expect(tabs.map((tab) => tab.title)).toEqual(['会话', 'Tasks', 'SSH'])
    const css = readFileSync('src/client/main-surface-host.module.css', 'utf8')
    expect(css).toContain('container-name: workbench-main-surface')
    expect(css).toContain('@container workbench-main-surface (max-width: 480px)')
    expect(css).not.toContain('@container workbench-main-surface (max-width: 640px)')
    expect(css).toContain('.tab > svg')
    expect(css).toContain('height: 32px')
    expect(css).toContain('width: 36px')
    expect(css).not.toContain('@media (max-width: 900px)')
  })

  it('switches modes while preserving the same Agent DOM subtree', async () => {
    const b = bench()
    const agent = document.querySelector('[data-testid="agent"]')!
    const input = document.querySelector('input')!
    expect(document.querySelector('[data-testid="tasks"]')).toBeNull()
    await click('Tasks')
    expect(document.querySelector('[data-testid="tasks"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="agent"]')).toBe(agent)
    expect(document.querySelector('input')).toBe(input)
    expect(agent.parentElement?.getAttribute('aria-hidden')).toBe('true')
    await act(async () => b.closeTask())
    expect(document.querySelector('[data-testid="tasks"]')).toBeNull()
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('会话')
  })

  it('returns to Agent when the active contribution is removed or hidden', async () => {
    const b = bench()
    await click('Tasks')
    await act(async () => b.disposeTask())
    await settle()
    expect(document.querySelector('[data-testid="tasks"]')).toBeNull()
    expect(b.service.getMainSurfaceState().getSnapshot().activeId).toBe('agent')

    await click('SSH')
    await act(async () => b.preferences.setRemoved('dsh-ssh:ssh', true))
    await settle()
    expect(document.querySelector('[data-testid="ssh"]')).toBeNull()
    expect(b.service.getMainSurfaceState().getSnapshot().activeId).toBe('agent')
  })

  it('isolates a failing contribution and returns to Agent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.addEventListener('error', (event) => event.preventDefault(), { once: true })
    document.body.innerHTML = '<div id="owner"></div>'
    const service = new WorkbenchService(new ComponentPreferencesService(new MemoryStorage()))
    service.getMainSurfaceState().reset()
    service.registerMainSurface({ id: 'broken', source: 'plugin', order: 20, label: 'Broken', render: () => { throw new Error('boom') } })
    root = createRoot(document.querySelector('#owner')!)
    act(() => root?.render(<WorkbenchMainSurfaceHost service={service} agent={<div data-testid="agent">Agent body</div>} />))
    await click('Broken')
    await settle()
    expect(service.getMainSurfaceState().getSnapshot().activeId).toBe('agent')
    expect(document.querySelector('[data-testid="agent"]')).not.toBeNull()
  })
})
