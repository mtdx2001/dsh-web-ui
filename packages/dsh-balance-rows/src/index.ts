import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'

export interface BalanceAccount {
  id: string
  label: string
  source?: 'deepseek' | 'seventoken'
  provider?: 'deepseek' | 'seventoken'
  credentialName: string
  order: number
  enabled: boolean
  currency: string
  detailsMode?: 'balance' | 'token-usage'
}

export interface Config { accounts?: BalanceAccount[] }
export const Config: z<Config> = z.object({
  accounts: z.array(z.object({
    id: z.string(),
    label: z.string(),
    source: z.string(),
    provider: z.string(),
    credentialName: z.string(),
    order: z.number().default(10),
    enabled: z.boolean().default(true),
    currency: z.string().default('¥'),
    detailsMode: z.string(),
  })).default([]),
}) as unknown as z<Config>

const ROUTE = '/api/dsh-balance-rows/accounts'
interface UsageSummary {
  total: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
}
interface SourceAdapter {
  url: string
  read(payload: Record<string, unknown>): number
  usage?(payload: Record<string, unknown>): UsageSummary | undefined
}
const sourceAdapters: Record<'deepseek' | 'seventoken', SourceAdapter> = {
  deepseek: {
    url: 'https://api.deepseek.com/user/balance',
    read: payload => Number((payload.balance_infos as Array<{ total_balance?: number }> | undefined)?.[0]?.total_balance),
  },
  seventoken: {
    url: 'https://api.seventoken.shop/v1/usage',
    read: payload => Number(payload.balance),
    usage: payload => {
      const stats = Array.isArray(payload.model_stats) ? payload.model_stats as Array<Record<string, unknown>> : []
      if (stats.length === 0) return undefined
      return stats.reduce<UsageSummary>((sum, item) => ({
        total: sum.total + (Number(item.total_tokens) || 0),
        input: sum.input + (Number(item.input_tokens) || 0),
        output: sum.output + (Number(item.output_tokens) || 0),
        cacheRead: sum.cacheRead + (Number(item.cache_read_tokens) || 0),
        cacheWrite: sum.cacheWrite + (Number(item.cache_creation_tokens) || 0),
        cost: sum.cost + (Number(item.actual_cost) || 0),
      }), { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })
    },
  },
}

interface ProviderDirectoryEntry {
  provider: string
  displayName: string
  settingsNs: string
  settingsPath: readonly string[]
}

interface ProviderServices {
  llm?: { listConfigurableProviders?: () => ProviderDirectoryEntry[] }
  settings?: { get?: (namespace: string) => unknown }
}

const providerSources: Record<string, { source: 'deepseek' | 'seventoken'; label: string; order: number }> = {
  'deepseek-official': { source: 'deepseek', label: '余额', order: 10 },
  deepseek: { source: 'deepseek', label: '余额', order: 10 },
  seventoken: { source: 'seventoken', label: '超市余额', order: 20 },
}

function valueAt(root: unknown, path: readonly string[]): unknown {
  let value = root
  for (const segment of path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    value = (value as Record<string, unknown>)[segment]
  }
  return value
}

export function discoverAccounts(services: ProviderServices): BalanceAccount[] {
  const entries = services.llm?.listConfigurableProviders?.() ?? []
  const accounts: BalanceAccount[] = []
  const seenSources = new Set<string>()
  for (const entry of entries) {
    const supported = providerSources[entry.provider]
    if (supported === undefined || seenSources.has(supported.source)) continue
    const section = services.settings?.get?.(entry.settingsNs)
    const profile = valueAt(section, entry.settingsPath)
    if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) continue
    const credentialName = (profile as Record<string, unknown>).apiKeyEnv
    if (typeof credentialName !== 'string' || credentialName.length === 0) continue
    seenSources.add(supported.source)
    accounts.push({
      id: entry.provider,
      label: supported.label,
      source: supported.source,
      credentialName,
      order: supported.order,
      enabled: true,
      currency: '¥',
      detailsMode: 'token-usage',
    })
  }
  return accounts.sort((a, b) => a.order - b.order)
}

async function key(ctx: Context, name: string): Promise<string | null> {
  try {
    const credentials = ctx.get('credentials') as { resolve?: (name: string) => Promise<{ value?: string } | undefined> } | undefined
    const hit = await credentials?.resolve?.(name)
    if (hit?.value) return hit.value
  } catch { /* credentials are optional */ }
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name] || null
}

async function fetchBalance(ctx: Context, account: BalanceAccount): Promise<Record<string, unknown>> {
  const source = account.source ?? account.provider
  const adapter = source === undefined ? undefined : sourceAdapters[source]
  const base = { id: account.id, label: account.label, currency: account.currency, detailsMode: account.detailsMode ?? 'balance' }
  if (adapter === undefined) return { ...base, state: 'invalid_source' }
  const secret = await key(ctx, account.credentialName)
  if (!secret) return { ...base, state: 'not_configured' }
  try {
    const response = await fetch(adapter.url, { headers: { authorization: `Bearer ${secret}`, 'user-agent': 'DeepSeek-Harness/dsh-balance-rows' } })
    if (!response.ok) return { ...base, state: 'request_failed' }
    const payload = await response.json() as Record<string, unknown>
    const value = adapter.read(payload)
    const usage = adapter.usage?.(payload)
    return { ...base, state: Number.isFinite(value) ? 'ready' : 'invalid_response', value: Number.isFinite(value) ? value : undefined, usage, at: Date.now() }
  } catch {
    return { ...base, state: 'request_failed' }
  }
}

export const inject = ['webServer', 'llm', 'settings']
export function apply(ctx: Context, config: Config = {}): void {
  ctx.inject(inject, (scope) => {
    const webServer = (scope as unknown as { webServer: { register(route: { kind: 'exact'; path: string; handler: (req: { method?: string }, res: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string) => void }) => Promise<void> }): () => void } }).webServer
    const dispose = webServer.register({ kind: 'exact', path: ROUTE, handler: async (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
      const explicit = config.accounts?.length ? config.accounts : undefined
      const services = ctx as unknown as ProviderServices
      const accounts = (explicit ?? discoverAccounts(services)).filter(account => account.enabled).sort((a, b) => a.order - b.order)
      const results = await Promise.all(accounts.map(account => fetchBalance(ctx, account)))
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ accounts: results, at: Date.now() }))
    } })
    ctx.effect(() => dispose, 'dsh-balance-rows: route')
  })
}

export { ROUTE }
