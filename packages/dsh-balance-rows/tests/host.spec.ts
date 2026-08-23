import { describe, expect, it, vi } from 'vitest'
import { apply, discoverAccounts } from '../src/index.ts'

describe('provider-driven balance discovery', () => {
  it('introduces only the configured supported provider', () => {
    const accounts = discoverAccounts({
      llm: { listConfigurableProviders: () => [
        { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
        { provider: 'seventoken', displayName: 'Token shop', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'seventoken'] },
      ] },
      settings: { get: namespace => namespace === 'llm-pi-ai' ? { providers: { seventoken: { apiKeyEnv: 'SHOP_KEY' } } } : undefined },
    })

    expect(accounts).toEqual([expect.objectContaining({ id: 'seventoken', source: 'seventoken', credentialName: 'SHOP_KEY' })])
  })

  it('returns no rows when no supported provider is configured', () => {
    expect(discoverAccounts({
      llm: { listConfigurableProviders: () => [
        { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
        { provider: 'openai', displayName: 'OpenAI', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'] },
      ] },
      settings: { get: () => undefined },
    })).toEqual([])
  })

  it('ignores unsupported providers even when configured', () => {
    expect(discoverAccounts({
      llm: { listConfigurableProviders: () => [
        { provider: 'openai', displayName: 'OpenAI', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'] },
      ] },
      settings: { get: () => ({ providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY' } } }) },
    })).toEqual([])
  })

  it('uses explicit accounts instead of automatic discovery', async () => {
    let handler: ((req: { method?: string }, res: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string) => void }) => Promise<void>) | undefined
    let body = ''
    const ctx = {
      llm: { listConfigurableProviders: vi.fn(() => [
        { provider: 'seventoken', displayName: 'Token shop', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'seventoken'] },
      ]) },
      settings: { get: vi.fn(() => ({ providers: { seventoken: { apiKeyEnv: 'SHOP_KEY' } } })) },
      get: vi.fn(() => ({ resolve: vi.fn(async () => undefined) })),
      inject: (_services: string[], callback: (scope: unknown) => void) => callback({
        webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return vi.fn() } },
      }),
      effect: vi.fn(),
    }
    apply(ctx as never, { accounts: [{ id: 'requested', label: 'Requested', source: 'deepseek', credentialName: 'REQUESTED_KEY', order: 1, enabled: true, currency: '¥' }] })
    await handler?.({ method: 'GET' }, { writeHead: vi.fn(), end: value => { body = value ?? '' } })

    expect(JSON.parse(body).accounts).toEqual([expect.objectContaining({ id: 'requested', state: 'not_configured' })])
    expect(ctx.llm.listConfigurableProviders).not.toHaveBeenCalled()
  })
})
