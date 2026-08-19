import { describe, expect, it } from 'vitest'
import { isGatewayTimeout, policyKey, retryDelay } from '../src/policy.ts'

const policy = { initialDelayMs: 5000, maxDelayMs: 120000, jitterRatio: 0.1 }

describe('gateway failure policy', () => {
  it.each([502, 524])('matches explicit HTTP %d failures', status => {
    expect(isGatewayTimeout({ code: 'SERVER', message: 'upstream failed', status })).toBe(true)
  })

  it('accepts the narrow no-body fallback when status metadata is absent', () => {
    expect(isGatewayTimeout({ code: 'TRANSPORT', message: '524 status code (no body)' })).toBe(true)
    expect(isGatewayTimeout({ code: 'TRANSPORT', message: 'status code 502 returned with no body' })).toBe(true)
  })

  it.each([
    { code: 'AUTH', message: '524 appears in an account id', status: 401 },
    { code: 'SERVER', message: 'internal server error', status: 500 },
    { code: 'TIMEOUT', message: 'request timed out' },
    { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'context is too long', status: 400 },
  ])('delegates non-gateway failure $code', failure => {
    expect(isGatewayTimeout(failure)).toBe(false)
  })

  it('uses bounded exponential backoff with symmetric jitter', () => {
    expect(retryDelay(policy, 1, () => 0.5)).toBe(5000)
    expect(retryDelay(policy, 2, () => 0.5)).toBe(10000)
    expect(retryDelay(policy, 6, () => 0.5)).toBe(120000)
    expect(retryDelay(policy, 1, () => 0)).toBe(4500)
    expect(retryDelay(policy, 1, () => 1)).toBe(5500)
  })

  it('keys retry history by the complete effective policy', () => {
    expect(policyKey(policy)).not.toBe(policyKey({ ...policy, maxDelayMs: 60000 }))
  })
})
