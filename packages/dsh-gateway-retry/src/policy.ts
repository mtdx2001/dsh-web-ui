import type { LlmFailure } from '@deepseek-ai/dsh-llm/types'

export const GATEWAY_STATUSES = new Set([502, 524])

export function policyKey(policy: BackoffPolicy): string {
  return JSON.stringify([
    'gateway-status',
    [...GATEWAY_STATUSES],
    policy.initialDelayMs,
    policy.maxDelayMs,
    policy.jitterRatio,
  ])
}

export interface BackoffPolicy {
  initialDelayMs: number
  maxDelayMs: number
  jitterRatio: number
}

export const DEFAULT_BACKOFF: Readonly<BackoffPolicy> = {
  initialDelayMs: 5000,
  maxDelayMs: 120000,
  jitterRatio: 0.1,
}

/** Match an explicit gateway status, with a narrow fallback for no-body diagnostics. */
export function isGatewayTimeout(failure: LlmFailure): boolean {
  if (failure.status !== undefined) return GATEWAY_STATUSES.has(failure.status)
  return /(?:\b(?:502|524)\b.*status code.*no body|status code.*\b(?:502|524)\b.*no body)/i.test(failure.message)
}

/** Compute bounded exponential backoff with symmetric jitter. */
export function retryDelay(policy: BackoffPolicy, retry: number, random: () => number): number {
  const exponent = Math.min(Math.max(retry - 1, 0), 1024)
  const exponential = Math.min(policy.initialDelayMs * 2 ** exponent, policy.maxDelayMs)
  const jitter = 1 - policy.jitterRatio + 2 * policy.jitterRatio * random()
  return Math.min(exponential * jitter, policy.maxDelayMs)
}
