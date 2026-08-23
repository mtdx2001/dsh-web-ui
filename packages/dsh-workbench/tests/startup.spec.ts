import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

interface MockContextResult {
  ctx: any
  cleanups: Array<() => void | Promise<void>>
  sessionReads: () => number
  injectedSlots: string[]
  registeredSlots: string[]
  slotOptions: Array<Record<string, unknown>>
}

function mockContext(failingSlot?: string, declaredSlots: string[] = [
  'conversation.session.header.utilities',
  'shell.overlay',
]): MockContextResult {
  const cleanups: Array<() => void | Promise<void>> = []
  const injectedSlots: string[] = []
  const registeredSlots: string[] = []
  const slotOptions: Array<Record<string, unknown>> = []
  let reads = 0
  const ctx: any = {
    effect(execute: () => unknown) {
      const result = execute()
      if (typeof result === 'function') cleanups.push(result as () => void | Promise<void>)
      return result
    },
    locale: { register: () => () => {}, bind: () => (key: string) => key === 'settings.components.title' ? 'Workbench layout' : key },
    provide: () => () => {},
    slots: {
      inject(name: string, register: () => unknown) {
        injectedSlots.push(name)
        if (failingSlot === name) throw new Error('slot unavailable')
        if (!declaredSlots.includes(name)) return undefined
        registeredSlots.push(name)
        return register()
      },
      register: (options: Record<string, unknown>) => { slotOptions.push(options); return () => {} },
    },
    sessions: {
      list: {
        getSnapshot() {
          reads += 1
          return { current: undefined, byId: {}, jobsBySession: {}, subagentsByParent: {} }
        },
        subscribe: () => () => {},
      },
      binding: () => undefined,
    },
    workspaces: {
      list: {
        getSnapshot() {
          reads += 1
          return { items: [] }
        },
        subscribe: () => () => {},
      },
    },
  }
  return { ctx, cleanups, sessionReads: () => reads, injectedSlots, registeredSlots, slotOptions }
}

describe('client startup isolation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('declares only executable client modules and orders after conversation', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const injected = manifest.dsh.client.inject as string[]
    expect(injected).toContain('@deepseek-ai/dsh-client-ui-conversation')
    expect(injected).toContain('@deepseek-ai/dsh-client-connection')
    expect(injected).not.toContain('@deepseek-ai/dsh-client-ui-slots')
  })

  it('does not read runtime snapshots or create observers before two paints', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const observer = vi.fn(function () { return { observe: vi.fn(), disconnect: vi.fn() } })
    vi.stubGlobal('MutationObserver', observer)
    const { ctx, cleanups, sessionReads } = mockContext()

    apply(ctx)
    expect(sessionReads()).toBe(0)
    expect(observer).not.toHaveBeenCalled()
    expect(document.querySelector('[data-dsh-workbench-portal]')).toBeNull()
    expect(frames).toHaveLength(1)

    frames.shift()?.(0)
    expect(sessionReads()).toBe(0)
    expect(observer).not.toHaveBeenCalled()
    expect(document.querySelector('[data-dsh-workbench-portal]')).toBeNull()
    expect(frames).toHaveLength(1)

    frames.shift()?.(16)
    expect(sessionReads()).toBeGreaterThan(0)
    expect(observer).toHaveBeenCalledTimes(2)
    for (const cleanup of cleanups.reverse()) await cleanup()
  })

  it('cancels deferred runtime work when the plugin unloads before paint', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { ctx, cleanups, sessionReads } = mockContext()

    apply(ctx)
    for (const cleanup of cleanups.reverse()) await cleanup()
    frames.shift()?.(0)
    frames.shift()?.(16)
    expect(sessionReads()).toBe(0)
  })

  it('does not depend on the removed shell.overlay rail', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { ctx, cleanups, sessionReads, injectedSlots } = mockContext('shell.overlay')

    expect(() => apply(ctx)).not.toThrow()
    expect(injectedSlots).not.toContain('shell.overlay')
    expect(sessionReads()).toBe(0)
    for (const cleanup of cleanups.reverse()) await cleanup()
  })

  it('contains a synchronous slot registration failure', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { ctx, cleanups, sessionReads } = mockContext('conversation.session.header.utilities')

    expect(() => apply(ctx)).not.toThrow()
    expect(error).toHaveBeenCalledWith('[dsh-workbench] status utility registration failed:', expect.any(Error))
    expect(sessionReads()).toBe(0)
    for (const cleanup of cleanups.reverse()) await cleanup()
  })

  it('isolates an existing desktop right-sidebar owner conflict', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('MutationObserver', vi.fn(function () { return { observe: vi.fn(), disconnect: vi.fn() } }))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { ctx, cleanups, injectedSlots, registeredSlots, sessionReads } = mockContext('desktop.rightSidebar')

    expect(() => apply(ctx)).not.toThrow()
    expect(injectedSlots).toContain('desktop.rightSidebar')
    expect(registeredSlots).toContain('conversation.session.header.utilities')
    expect(error).toHaveBeenCalledWith('[dsh-workbench] right-sidebar host registration failed:', expect.any(Error))
    frames.shift()?.(0)
    frames.shift()?.(16)
    expect(sessionReads()).toBeGreaterThan(0)
    for (const cleanup of cleanups.reverse()) await cleanup()
  })

  it('starts without an AionUI service and registers the built-in Overview component', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('MutationObserver', vi.fn(function () { return { observe: vi.fn(), disconnect: vi.fn() } }))
    const { ctx, cleanups } = mockContext(undefined, ['conversation.session.header.utilities', 'desktop.rightSidebar'])
    ctx.get = (name: string) => name === 'layout' ? { openRightSidebar: vi.fn() } : undefined

    apply(ctx)
    frames.shift()?.(0)
    frames.shift()?.(16)

    expect(ctx.get('aionuiPanel')).toBeUndefined()
    for (const cleanup of cleanups.reverse()) await cleanup()
  })

  it('uses the official locale binding for the settings navigation label', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('MutationObserver', vi.fn(function () { return { observe: vi.fn(), disconnect: vi.fn() } }))
    const { ctx, cleanups, slotOptions } = mockContext(undefined, ['conversation.session.header.utilities', 'settings.section'])

    apply(ctx)
    frames.shift()?.(0)
    frames.shift()?.(16)
    const settings = slotOptions.find((options) => options.name === 'settings.section')
    expect(settings).toBeDefined()
    expect((settings?.label as () => string)()).toBe('Workbench layout')
    for (const cleanup of cleanups.reverse()) await cleanup()
  })

  it('ships no private-DOM Sidebar mount implementation', () => {
    const client = join(process.cwd(), 'src', 'client')
    expect(() => readFileSync(join(client, 'sidebar-host-mount.tsx'), 'utf8')).toThrow()
    const entry = readFileSync(join(client, 'index.ts'), 'utf8')
    expect(entry).not.toContain('mountWorkbenchSidebarHost')
    expect(entry).not.toContain('createRoot')
    expect(entry).not.toContain('insertBefore')
  })

  it('contributes official surfaces plus declaration-aware sidebar row slots', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { ctx, cleanups, injectedSlots, registeredSlots } = mockContext()

    apply(ctx)
    expect(injectedSlots).toEqual([
      'conversation.session.header.utilities',
      'conversation.mainSurface',
      'desktop.rightSidebar',
      'sidebar.rows.top',
      'sidebar.rows.bottom',
    ])
    expect(registeredSlots).toEqual([
      'conversation.session.header.utilities',
    ])
    expect(document.querySelector('[data-dsh-workbench-portal]')).toBeNull()
    for (const cleanup of cleanups.reverse()) await cleanup()
  })
})
