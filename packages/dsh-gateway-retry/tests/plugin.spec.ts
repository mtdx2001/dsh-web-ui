import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

interface EventRecord { type: string; data: Record<string, unknown> }

type Listener = (payload: any, next: () => Promise<any>) => Promise<any>

function harness() {
  const events: EventRecord[] = []
  const logs: unknown[][] = []
  let listener: Listener | undefined
  let cleanup: (() => Promise<void>) | undefined
  const ctx = {
    on: vi.fn((_name: string, value: Listener) => {
      listener = value
      return vi.fn()
    }),
    effect: vi.fn((factory: () => () => Promise<void>) => {
      cleanup = factory()
    }),
    logger: { info: vi.fn((...args: unknown[]) => logs.push(args)) },
  }
  const session = {
    events,
    append: vi.fn((type: string, data: Record<string, unknown>) => {
      events.push({ type, data })
      return { seq: events.length }
    }),
  }
  const agent = { id: 'session-1', session }
  return {
    ctx,
    agent,
    events,
    logs,
    listener: () => {
      if (listener === undefined) throw new Error('listener not installed')
      return listener
    },
    cleanup: () => cleanup?.(),
  }
}

function payload(agent: unknown, status = 524, signal = new AbortController().signal) {
  return {
    agent,
    turn: 3,
    step: 2,
    provider: 'deepseek-official',
    failure: { code: 'SERVER', message: `${status} status code (no body)`, status },
    retryPolicy: undefined,
    signal,
  }
}

describe('gateway retry plugin', () => {
  it('delegates every non-502/524 failure', async () => {
    const h = harness()
    apply(h.ctx as never, {}, { delay: vi.fn(), retryId: () => 'retry-fixed' as never })
    const next = vi.fn(async () => ({ kind: 'retry' as const }))

    await expect(h.listener()(payload(h.agent, 500), next)).resolves.toEqual({ kind: 'retry' })
    expect(next).toHaveBeenCalledOnce()
    expect(h.events).toEqual([])
  })

  it('persists schedule before waiting and started before retrying', async () => {
    const h = harness()
    const delay = vi.fn(async () => true)
    apply(h.ctx as never, { initialDelayMs: 5000, maxDelayMs: 120000, jitterRatio: 0 }, {
      random: () => 0.5,
      delay,
      retryId: () => 'retry-fixed' as never,
    })
    const next = vi.fn()

    await expect(h.listener()(payload(h.agent), next)).resolves.toEqual({ kind: 'retry' })
    expect(next).not.toHaveBeenCalled()
    expect(delay).toHaveBeenCalledWith(5000, expect.any(AbortSignal))
    expect(h.events.map(event => event.type)).toEqual(['llm/retry', 'llm/retry-started'])
    expect(h.events[0]?.data).toMatchObject({
      retryId: 'retry-fixed',
      retry: 1,
      provider: 'deepseek-official',
      mode: 'always',
      delayMs: 5000,
    })
    expect(h.logs).toHaveLength(2)
  })

  it('continues retry numbering for the same provider and policy', async () => {
    const h = harness()
    const delay = vi.fn(async () => true)
    apply(h.ctx as never, { initialDelayMs: 5000, maxDelayMs: 120000, jitterRatio: 0 }, {
      random: () => 0.5,
      delay,
      retryId: () => 'retry-fixed' as never,
    })

    await h.listener()(payload(h.agent), vi.fn())
    await h.listener()(payload(h.agent), vi.fn())

    const schedules = h.events.filter(event => event.type === 'llm/retry')
    expect(schedules.map(event => event.data.retry)).toEqual([1, 2])
    expect(schedules.map(event => event.data.delayMs)).toEqual([5000, 10000])
    expect(schedules.map(event => event.data.retryId)).toEqual(['retry-fixed', 'retry-fixed'])
  })

  it('does not write started when the wait is cancelled', async () => {
    const h = harness()
    apply(h.ctx as never, {}, {
      delay: async () => false,
      retryId: () => 'retry-fixed' as never,
    })

    await expect(h.listener()(payload(h.agent), vi.fn())).resolves.toBeUndefined()
    expect(h.events.map(event => event.type)).toEqual(['llm/retry'])
  })

  it('rejects an inverted delay range during plugin load', () => {
    const h = harness()
    expect(() => apply(h.ctx as never, { initialDelayMs: 5000, maxDelayMs: 1000 })).toThrow(
      'maxDelayMs must be greater than or equal to initialDelayMs',
    )
  })
})
