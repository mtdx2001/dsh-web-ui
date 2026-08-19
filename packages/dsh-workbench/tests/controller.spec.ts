import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startController } from '../src/client/controller.ts'
import { createWorkbenchStores } from '../src/core/store.ts'

describe('runtime controller integration', () => {
  beforeEach(() => localStorage.clear())

  it('derives a complete snapshot from official runtime-shaped faces and suppresses equal updates', () => {
    let listListener: (() => void) | undefined
    const sessionListeners = new Set<() => void>()
    const goalListeners = new Set<() => void>()
    const todoListeners = new Set<() => void>()
    const tokenListeners = new Set<() => void>()
    const goalValue = { goal: { objective: 'Ship Phase 1', phase: 'active', maxGoalRounds: 8 }, roundsStarted: 2 }
    const todoValue = [{ content: 'Review', status: 'completed' }, { content: 'Smoke test', status: 'in_progress' }]
    const tokenValue = { uncachedInputTokens: 100, outputTokens: 40, cacheReadTokens: 200, cacheWriteTokens: 0, estimated: false, tokensPerSecond: 18.5 }
    const session = {
      getSnapshot: () => ({
        nodes: [{ kind: 'tool-result', time: 10, callId: 'read-1', call: { name: 'read', argsRaw: '{}' }, isError: false }],
        runningCalls: [{ name: 'build', time: 20 }],
      }),
      subscribe(listener: () => void) { sessionListeners.add(listener); return () => sessionListeners.delete(listener) },
      projections: {
        faceOf(key: string) {
          const listeners = key === 'goal' ? goalListeners : key === 'todos' ? todoListeners : tokenListeners
          return {
            getSnapshot: () => key === 'goal' ? goalValue : key === 'todos' ? todoValue : tokenValue,
            subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) },
          }
        },
      },
    }
    const listSnapshot = {
      current: 'session-1',
      byId: {
        'session-1': {
          cwd: 'E:\\deepseek\\project',
          displayTitle: 'Release review',
          title: 'fallback',
          running: true,
          pendingInteraction: null,
          agentPreset: 'Code Mode',
        },
      },
      jobsBySession: {
        'session-1': [{ id: 'job-1', kind: 'bash', label: 'Build package', status: 'running' }],
      },
      subagentsByParent: {
        'session-1': { state: 'ready', entries: [{ kind: 'child', id: 'agent-1', label: 'Review startup', activity: 'inactive' }] },
      },
    }
    const ctx: any = {
      sessions: {
        list: {
          getSnapshot: () => listSnapshot,
          subscribe(listener: () => void) { listListener = listener; return () => { listListener = undefined } },
        },
        binding: () => ({ session }),
      },
      workspaces: {
        list: {
          getSnapshot: () => ({ items: [{ title: 'Project workspace', sessionIds: ['session-1'] }] }),
          subscribe: () => () => {},
        },
      },
    }
    const stores = createWorkbenchStores()
    const dispose = startController(ctx, stores)
    const snapshot = stores.overview.getSnapshot()

    expect(snapshot).toMatchObject({
      root: 'E:\\deepseek\\project',
      projectName: 'Project workspace',
      sessionTitle: 'Release review',
      status: 'running',
      agentPreset: 'Code Mode',
      tokenUsage: { kind: 'ready', value: { uncachedInputTokens: 100, outputTokens: 40, cacheReadTokens: 200, tokensPerSecond: 18.5 } },
      goal: { kind: 'ready', value: { objective: 'Ship Phase 1', roundsStarted: 2 } },
      todos: { kind: 'ready', value: { done: 1, total: 2, next: ['Smoke test'] } },
    })
    expect(snapshot.jobs.kind === 'ready' ? snapshot.jobs.value[0].label : '').toBe('Build package')
    expect(snapshot.subagents.kind === 'ready' ? snapshot.subagents.value[0].title : '').toBe('Review startup')
    expect(snapshot.recentTools.kind === 'ready' ? snapshot.recentTools.value.map((row) => row.name) : []).toEqual(['build', 'read'])

    const listener = vi.fn()
    stores.overview.subscribe(listener)
    listListener?.()
    expect(listener).not.toHaveBeenCalled()

    dispose()
    expect(sessionListeners.size).toBe(0)
    expect(goalListeners.size).toBe(0)
    expect(todoListeners.size).toBe(0)
    expect(tokenListeners.size).toBe(0)
  })

  interface CatalogCall {
    payload: unknown
    signal: AbortSignal | undefined
    resolve: (response: unknown) => void
  }

  function catalogCtx(options?: { current?: string }): {
    ctx: any
    presetCalls: CatalogCall[]
    skillCalls: CatalogCall[]
    setCurrent: (sessionId: string | undefined) => void
  } {
    let listListener: (() => void) | undefined
    let current = options?.current
    const rows: Record<string, { cwd: string; title: string }> = {
      'session-1': { cwd: 'E:\\deepseek\\project', title: 'One' },
      'session-2': { cwd: 'E:\\deepseek\\project', title: 'Two' },
    }
    const presetCalls: CatalogCall[] = []
    const skillCalls: CatalogCall[] = []
    const defer = (calls: CatalogCall[]) => (payload: unknown, signal?: AbortSignal) => new Promise((resolve) => {
      calls.push({ payload, signal, resolve })
    })
    const ctx: any = {
      sessions: {
        list: {
          getSnapshot: () => ({ current, byId: rows, jobsBySession: {}, subagentsByParent: {} }),
          subscribe(listener: () => void) { listListener = listener; return () => { listListener = undefined } },
        },
        binding: () => undefined,
      },
      workspaces: {
        list: {
          getSnapshot: () => ({ items: [] }),
          subscribe: () => () => {},
        },
      },
      get(name: string, strict?: boolean) {
        if (name === 'connection') {
          return { api: { agentPresets: { list: defer(presetCalls) }, skills: { list: defer(skillCalls) } } }
        }
        if (strict === true) throw new Error(`unknown service: ${name}`)
        return undefined
      },
    }
    return {
      ctx,
      presetCalls,
      skillCalls,
      setCurrent(sessionId) {
        current = sessionId
        listListener?.()
      },
    }
  }

  const flush = async (): Promise<void> => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve()
  }

  const presetResponse = {
    result: {
      ok: true as const,
      value: {
        presets: [
          { id: 'code-mode', trust: 'system' as const, isDefault: true },
          { id: 'writer', name: 'Writer', description: 'Writes docs', trust: 'user' as const, isDefault: false },
          { id: 'broken-one', name: 'Broken One', trust: 'user' as const, isDefault: false, broken: 'missing entry' },
        ],
      },
    },
  }

  const skillResponse = {
    result: {
      ok: true as const,
      value: {
        skills: [
          { name: 'pdf', description: 'PDF tools', modelInvocable: true },
          { name: 'plan-only', description: 'Manual', modelInvocable: false },
        ],
      },
    },
  }

  it('maps official agentPresets.list and skills.list into the expertCatalog section', async () => {
    const { ctx, presetCalls, skillCalls } = catalogCtx({ current: 'session-1' })
    const stores = createWorkbenchStores()
    const dispose = startController(ctx, stores)

    // Both official calls start synchronously during the session sync.
    expect(presetCalls).toHaveLength(1)
    expect(skillCalls).toHaveLength(1)
    expect(presetCalls[0].payload).toEqual({})
    expect(skillCalls[0].payload).toEqual({ sessionId: 'session-1' })
    expect(stores.overview.getSnapshot().expertCatalog).toEqual({ kind: 'unavailable', reason: 'noData' })

    presetCalls[0].resolve(presetResponse)
    skillCalls[0].resolve(skillResponse)
    await flush()

    const catalog = stores.overview.getSnapshot().expertCatalog
    expect(catalog.kind).toBe('ready')
    if (catalog.kind !== 'ready') throw new Error('expected ready catalog')
    expect(catalog.value.presets).toEqual([
      { id: 'code-mode', name: 'code-mode', description: undefined, trust: 'system', isDefault: true, broken: false },
      { id: 'writer', name: 'Writer', description: 'Writes docs', trust: 'user', isDefault: false, broken: false },
      { id: 'broken-one', name: 'Broken One', description: undefined, trust: 'user', isDefault: false, broken: true },
    ])
    expect(catalog.value.skills).toEqual([
      { name: 'pdf', description: 'PDF tools', modelInvocable: true },
      { name: 'plan-only', description: 'Manual', modelInvocable: false },
    ])
    dispose()
  })

  it('aborts the in-flight catalog request and drops its result on session switch', async () => {
    const { ctx, presetCalls, skillCalls, setCurrent } = catalogCtx({ current: 'session-1' })
    const stores = createWorkbenchStores()
    const dispose = startController(ctx, stores)
    expect(presetCalls).toHaveLength(1)

    setCurrent('session-2')
    await flush()

    // The old request is aborted and a new pair is issued for session-2.
    expect(presetCalls[0].signal?.aborted).toBe(true)
    expect(skillCalls[0].signal?.aborted).toBe(true)
    expect(presetCalls).toHaveLength(2)
    expect(skillCalls[1].payload).toEqual({ sessionId: 'session-2' })

    // A late resolution from the stale request must not overwrite the state.
    presetCalls[0].resolve(presetResponse)
    skillCalls[0].resolve(skillResponse)
    await flush()
    expect(stores.overview.getSnapshot().expertCatalog).toEqual({ kind: 'unavailable', reason: 'noData' })

    // The new session's own response still lands.
    presetCalls[1].resolve(presetResponse)
    skillCalls[1].resolve(skillResponse)
    await flush()
    expect(stores.overview.getSnapshot().expertCatalog.kind).toBe('ready')
    dispose()
  })

  it('aborts the pending catalog request on cleanup and never applies it', async () => {
    const { ctx, presetCalls, skillCalls } = catalogCtx({ current: 'session-1' })
    const stores = createWorkbenchStores()
    const dispose = startController(ctx, stores)
    expect(presetCalls).toHaveLength(1)

    dispose()
    expect(presetCalls[0].signal?.aborted).toBe(true)
    expect(skillCalls[0].signal?.aborted).toBe(true)

    const before = stores.overview.getSnapshot()
    presetCalls[0].resolve(presetResponse)
    skillCalls[0].resolve(skillResponse)
    await flush()
    expect(stores.overview.getSnapshot()).toBe(before)
    expect(stores.overview.getSnapshot().expertCatalog.kind).not.toBe('ready')
  })

  it('polls git immediately for the new root when the session changes while Overview is active', async () => {
    let listListener: (() => void) | undefined
    let current = 'session-1'
    const rows = {
      'session-1': { cwd: 'E:\\project-a', title: 'A' },
      'session-2': { cwd: 'E:\\project-b', title: 'B' },
    }
    const requests: Array<{ root: string; signal: AbortSignal }> = []
    vi.stubGlobal('fetch', vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { root: string }
      requests.push({ root: body.root, signal: init?.signal as AbortSignal })
      return Promise.resolve(new Response(JSON.stringify({
        ok: true,
        value: { branch: 'main', staged: 0, unstaged: 0, untracked: 0 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    }))
    const ctx: any = {
      sessions: {
        list: {
          getSnapshot: () => ({ current, byId: rows, jobsBySession: {}, subagentsByParent: {} }),
          subscribe(listener: () => void) { listListener = listener; return () => { listListener = undefined } },
        },
        binding: () => undefined,
      },
      workspaces: { list: { getSnapshot: () => ({ items: [] }), subscribe: () => () => {} } },
      get: () => undefined,
    }
    const stores = createWorkbenchStores()
    const dispose = startController(ctx, stores)
    try {
      expect(stores.overview.getSnapshot().root).toBe('E:\\project-a')
      stores.setOverviewActive(true)
      await flush()

      expect(requests.map((request) => request.root)).toEqual(['E:\\project-a'])
      current = 'session-2'
      listListener?.()
      await flush()

      expect(requests.map((request) => request.root)).toEqual(['E:\\project-a', 'E:\\project-b'])
      expect(requests[0].signal.aborted).toBe(true)
      expect(stores.overview.getSnapshot().root).toBe('E:\\project-b')
    } finally {
      dispose()
      vi.unstubAllGlobals()
    }
  })
})
