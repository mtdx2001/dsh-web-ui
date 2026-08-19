import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

interface MockContextResult {
  ctx: any
  cleanups: Array<() => void | Promise<void>>
  sessionReads: () => number
  injectedSlots: string[]
  registeredSlots: string[]
}

function mockContext(failingSlot?: string, declaredSlots: string[] = [
  'conversation.session.header.utilities',
  'shell.overlay',
]): MockContextResult {
  const cleanups: Array<() => void | Promise<void>> = []
  const injectedSlots: string[] = []
  const registeredSlots: string[] = []
  let reads = 0
  const ctx: any = {
    effect(execute: () => unknown) {
      const result = execute()
      if (typeof result === 'function') cleanups.push(result as () => void | Promise<void>)
      return result
    },
    locale: { register: () => () => {} },
    provide: () => () => {},
    slots: {
      inject(name: string, register: () => unknown) {
        injectedSlots.push(name)
        if (failingSlot === name) throw new Error('slot unavailable')
        if (!declaredSlots.includes(name)) return undefined
        registeredSlots.push(name)
        return register()
      },
      register: () => () => {},
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
  return { ctx, cleanups, sessionReads: () => reads, injectedSlots, registeredSlots }
}

describe('client startup isolation', () => {
  afterEach(() => vi.restoreAllMocks())

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

  it('contains a missing shell.overlay declaration without blocking startup', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { ctx, cleanups, sessionReads } = mockContext('shell.overlay')

    expect(() => apply(ctx)).not.toThrow()
    expect(error).toHaveBeenCalledWith('[dsh-workbench] navigation overlay injection failed:', expect.any(Error))
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

  it('retries Overview restoration and suppresses persistence during teardown', async () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('MutationObserver', vi.fn(function () { return { observe: vi.fn(), disconnect: vi.fn() } }))
    const { ctx, cleanups } = mockContext()
    const listeners = new Set<() => void>()
    let activeId = 'files'
    let activeChange: ((active: boolean) => void) | undefined
    let activationAttempts = 0
    const events: string[] = []
    ctx.get = () => ({
      registerDockTab(tab: { onActiveChange?: (active: boolean) => void }) {
        activeChange = tab.onActiveChange
        activeChange?.(false)
        return () => { events.push('unregister'); activeId = 'files'; activeChange?.(false) }
      },
      subscribeActiveDockTab(listener: () => void) {
        listeners.add(listener)
        return () => { events.push('unsubscribe'); listeners.delete(listener) }
      },
      getActiveDockTab: () => activeId,
      activateDockTab() {
        activationAttempts += 1
        if (activationAttempts < 2) return false
        activeId = 'overview'
        activeChange?.(true)
        for (const listener of listeners) listener()
        return true
      },
    })
    localStorage.setItem('dsh-workbench-ui:E:\\deepseek\\project', JSON.stringify({ overviewActive: true }))
    let current: string | undefined
    let listListener: (() => void) | undefined
    ctx.sessions.list.getSnapshot = () => ({
      current,
      byId: current === undefined ? {} : { 'session-1': { id: 'session-1', cwd: 'E:\\deepseek\\project', displayTitle: 'Project', running: false, blank: false } },
      jobsBySession: {},
      subagentsByParent: {},
    })
    ctx.sessions.list.subscribe = (listener: () => void) => {
      listListener = listener
      return () => { listListener = undefined }
    }
    ctx.sessions.binding = () => undefined

    apply(ctx)
    frames.shift()?.(0)
    frames.shift()?.(16)
    expect(activationAttempts).toBe(0)

    // The persisted project preference arrives after the Dock tab registered,
    // matching a cold GUI boot where the session list hydrates asynchronously.
    current = 'session-1'
    listListener?.()
    expect(activationAttempts).toBe(1)
    expect(JSON.parse(localStorage.getItem('dsh-workbench-ui:E:\\deepseek\\project')!).overviewActive).toBe(true)
    await vi.advanceTimersByTimeAsync(250)
    expect(activationAttempts).toBe(2)

    for (const cleanup of cleanups.reverse()) await cleanup()
    expect(events.slice(-2)).toEqual(['unsubscribe', 'unregister'])
    expect(JSON.parse(localStorage.getItem('dsh-workbench-ui:E:\\deepseek\\project')!).overviewActive).toBe(true)
    vi.useRealTimers()
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
      'shell.overlay',
      'sidebar.rows.top',
      'sidebar.rows.bottom',
    ])
    expect(registeredSlots).toEqual([
      'conversation.session.header.utilities',
      'shell.overlay',
    ])
    expect(document.querySelector('[data-dsh-workbench-portal]')).toBeNull()
    for (const cleanup of cleanups.reverse()) await cleanup()
  })
})
