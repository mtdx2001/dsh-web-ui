import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { LlmFailure } from '@deepseek-ai/dsh-llm/types'
import type { RetryId } from '@deepseek-ai/dsh-llm-retry/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import z from 'schemastery'
import { DEFAULT_BACKOFF, isGatewayTimeout, policyKey, retryDelay } from './policy.ts'

export const name = 'gateway-retry'
export const inject = ['agents']

export interface Config {
  initialDelayMs?: number
  maxDelayMs?: number
  jitterRatio?: number
}

export const Config: z<Config> = z.object({
  initialDelayMs: z.number().min(1).default(DEFAULT_BACKOFF.initialDelayMs),
  maxDelayMs: z.number().min(1).default(DEFAULT_BACKOFF.maxDelayMs),
  jitterRatio: z.number().min(0).max(1).default(DEFAULT_BACKOFF.jitterRatio),
})

export interface RetryInternals {
  random?: () => number
  delay?: (delayMs: number, signal: AbortSignal) => Promise<boolean>
  retryId?: () => RetryId
}

function cancellableDelay(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, delayMs)
    function onAbort(): void {
      clearTimeout(timer)
      resolve(false)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

interface RetryEventData {
  retryId: RetryId
  turn: number
  step: number
  provider: string
  mode: 'always'
  policyKey: string
  retry: number
  delayMs: number
  failure: LlmFailure
}

export function apply(ctx: Context, config: Config = {}, internals: RetryInternals = {}): void {
  const policy = {
    initialDelayMs: config.initialDelayMs ?? DEFAULT_BACKOFF.initialDelayMs,
    maxDelayMs: config.maxDelayMs ?? DEFAULT_BACKOFF.maxDelayMs,
    jitterRatio: config.jitterRatio ?? DEFAULT_BACKOFF.jitterRatio,
  }
  if (policy.maxDelayMs < policy.initialDelayMs) {
    throw new Error('gateway-retry: maxDelayMs must be greater than or equal to initialDelayMs')
  }

  const random = internals.random ?? Math.random
  const delay = internals.delay ?? cancellableDelay
  const mintRetryId = internals.retryId ?? (() => randomUUID() as RetryId)
  const lifetime = new AbortController()
  const active = new Set<Promise<unknown>>()

  const disposeListener = ctx.on('agent/request-error', async (payload, next) => {
    if (!isGatewayTimeout(payload.failure)) return next()
    if (payload.signal.aborted || lifetime.signal.aborted) return undefined

    const currentPolicyKey = policyKey(policy)
    const prior = payload.agent.session.events.findLast((event): event is SessionEvent<'llm/retry'> =>
      event.type === 'llm/retry'
      && event.data.turn === payload.turn
      && event.data.step === payload.step
      && event.data.provider === payload.provider
      && event.data.policyKey === currentPolicyKey)
    const retry = (prior?.data.retry ?? 0) + 1
    const retryId = prior?.data.retryId ?? mintRetryId()
    const delayMs = retryDelay(policy, retry, random)
    const fusedSignal = AbortSignal.any([payload.signal, lifetime.signal])

    const operation = (async () => {
      const event: RetryEventData = {
        retryId,
        turn: payload.turn,
        step: payload.step,
        provider: payload.provider,
        mode: 'always',
        policyKey: currentPolicyKey,
        retry,
        delayMs,
        failure: payload.failure,
      }
      payload.agent.session.append('llm/retry', event)
      ctx.logger.info(
        'gateway-retry: session %s provider %s status %s retry %d scheduled in %dms',
        payload.agent.id,
        payload.provider,
        payload.failure.status ?? 'unknown',
        retry,
        Math.round(delayMs),
      )
      if (!await delay(delayMs, fusedSignal)) return undefined
      payload.agent.session.append('llm/retry-started', {
        retryId,
        turn: payload.turn,
        step: payload.step,
        retry,
      })
      ctx.logger.info(
        'gateway-retry: session %s provider %s retry %d started',
        payload.agent.id,
        payload.provider,
        retry,
      )
      return { kind: 'retry' as const }
    })()
    active.add(operation)
    try {
      return await operation
    } finally {
      active.delete(operation)
    }
  })

  ctx.effect(() => async () => {
    disposeListener()
    lifetime.abort(new Error('gateway-retry plugin disposed'))
    await Promise.allSettled([...active])
  }, 'gateway-retry: abort and drain active waits')
}

export { isGatewayTimeout, retryDelay } from './policy.ts'
