import { createElement, type ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

interface AccountView {
  id: string
  label: string
  currency: string
  state: 'ready' | 'not_configured' | 'request_failed' | 'invalid_response'
  value?: number
  at?: number
  detailsMode?: 'balance' | 'token-usage'
  usage?: { total: number; input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }
}
interface TokenUsage {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
}
interface TokenTotals extends TokenUsage {
  totalInput: number
  total: number
  cost: number
  sessions: number
}
interface WorkbenchRow {
  id: string
  slot: 'top' | 'bottom'
  order: number
  label: string
  source: string
  builtin?: boolean
  removable?: boolean
  kind: 'disclosure'
  icon?: () => ReactNode
  summary?: () => ReactNode
  details: () => ReactNode
  expanded: () => boolean
  onToggle: () => void
}
interface WorkbenchService {
  registerSidebarRow(row: WorkbenchRow): () => void | Promise<void>
  refreshSidebarRow(id?: string): void
}

const ROUTE = '/api/dsh-balance-rows/accounts'
function icon(): ReactNode {
  return createElement('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }, [
    createElement('rect', { x: 2, y: 3, width: 12, height: 10, rx: 2, key: 'wallet' }),
    createElement('path', { d: 'M10 7h4v3h-4a1.5 1.5 0 0 1 0-3Z', key: 'pocket' }),
  ])
}
function value(account: AccountView): string {
  if (account.state === 'ready' && account.value !== undefined) return `${account.currency}${account.value.toFixed(2)}`
  if (account.state === 'not_configured') return '未配置'
  if (account.state === 'request_failed') return '请求失败'
  return '数据异常'
}
function formatTokens(count: number): string {
  if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(2).replace(/\.00$/, '')}亿 tokens`
  if (count >= 10_000) return `${(count / 10_000).toFixed(count >= 1_000_000 ? 0 : 1).replace(/\.0$/, '')}万 tokens`
  return `${Math.round(count)} tokens`
}
function usageFor(account: AccountView, totals: TokenTotals): TokenTotals | undefined {
  if (account.usage !== undefined) return {
    uncachedInputTokens: account.usage.input,
    cacheReadTokens: account.usage.cacheRead,
    cacheWriteTokens: account.usage.cacheWrite,
    outputTokens: account.usage.output,
    totalInput: account.usage.input + account.usage.cacheRead + account.usage.cacheWrite,
    total: account.usage.total,
    cost: account.usage.cost,
    sessions: 0,
  }
  const detailsMode = account.detailsMode ?? (account.id === 'deepseek' ? 'token-usage' : 'balance')
  return detailsMode === 'token-usage' && account.id === 'deepseek' ? totals : undefined
}
function summary(account: AccountView, totals: TokenTotals): ReactNode {
  const usage = usageFor(account, totals)
  return createElement('span', { style: { display: 'flex', width: '100%', minWidth: 0, alignItems: 'center', gap: 8 } }, [
    createElement('span', { style: { display: 'block', width: 90, minWidth: 90, flex: '0 0 90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: usage ? 600 : 400 }, key: 'info' }, usage ? formatTokens(usage.total) : '\u00a0'),
    createElement('span', { style: { display: 'inline-flex', marginLeft: 'auto', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap', fontSize: 12, fontVariantNumeric: 'tabular-nums' }, key: 'balance' }, [
      createElement('span', { style: { opacity: 0.7 }, key: 'balance-label' }, account.label),
      createElement('b', { style: { fontWeight: 600 }, key: 'value' }, value(account)),
    ]),
  ])
}
function detailRow(label: string, content: string, key: string): ReactNode {
  return createElement('div', { key, style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } }, [
    createElement('span', { key: 'label', style: { opacity: 0.72 } }, label),
    createElement('b', { key: 'value', style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 } }, content),
  ])
}
function details(account: AccountView, totals: TokenTotals): ReactNode {
  const usage = usageFor(account, totals)
  const rows = usage ? [
    detailRow('总Token', formatTokens(usage.total), 'total'),
    detailRow('输入 / 输出', `${formatTokens(usage.totalInput)} / ${formatTokens(usage.outputTokens)}`, 'io'),
    detailRow('缓存读 / 写', `${formatTokens(usage.cacheReadTokens)} / ${formatTokens(usage.cacheWriteTokens)}`, 'cache'),
    detailRow(account.usage ? '实际费用' : '估算费用', `¥${usage.cost.toFixed(2)}`, 'cost'),
    ...(usage.sessions > 0 ? [detailRow('统计会话', String(usage.sessions), 'sessions')] : []),
  ] : [detailRow(account.label, value(account), 'value')]
  rows.push(createElement('div', { key: 'time', style: { opacity: 0.58, marginTop: 3 } }, account.at ? `余额更新于 ${new Date(account.at).toLocaleTimeString()}` : '尚无更新时间'))
  return createElement('div', { style: { display: 'grid', gap: 3, fontSize: 12, lineHeight: '20px' } }, rows)
}

function aggregateTokens(ctx: ClientContext): TokenTotals {
  const snapshot = ctx.sessions.list.getSnapshot() as { ids?: string[]; byId?: Record<string, { projectionValues?: { tokenUsage?: Partial<TokenUsage> } }> }
  const totals: TokenTotals = { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, totalInput: 0, total: 0, cost: 0, sessions: 0 }
  for (const id of snapshot.ids ?? []) {
    const usage = snapshot.byId?.[id]?.projectionValues?.tokenUsage
    if (usage === undefined) continue
    const uncached = Number(usage.uncachedInputTokens) || 0
    const read = Number(usage.cacheReadTokens) || 0
    const write = Number(usage.cacheWriteTokens) || 0
    const output = Number(usage.outputTokens) || 0
    const input = uncached + read + write
    if (input === 0 && output === 0) continue
    totals.uncachedInputTokens += uncached
    totals.cacheReadTokens += read
    totals.cacheWriteTokens += write
    totals.outputTokens += output
    totals.totalInput += input
    totals.total += input + output
    totals.cost += (uncached + write) / 1_000_000 + read * 0.02 / 1_000_000 + output * 2 / 1_000_000
    totals.sessions += 1
  }
  return totals
}

export const inject = ['slots', 'sessions']
export function apply(ctx: ClientContext): void {
  let service: WorkbenchService | undefined
  let accounts: AccountView[] = []
  let totals = aggregateTokens(ctx)
  let disposers: Array<() => void | Promise<void>> = []
  const expanded = new Set<string>()
  // Bottom-stack rule: status-check is the top sentinel (order 10).
  // Balance instances occupy the contiguous region below it and therefore
  // remain closest to Settings as the account count changes.
  const BOTTOM_BALANCE_BASE_ORDER = 20
  const clearRows = (): void => { for (const dispose of disposers.splice(0).reverse()) void dispose() }
  const renderRows = (): void => {
    clearRows()
    if (service === undefined) return
    disposers = accounts.map((account, index) => service!.registerSidebarRow({
      id: `balance-${account.id}`,
      slot: 'bottom',
      order: BOTTOM_BALANCE_BASE_ORDER + accounts.length - 1 - index,
      label: account.label,
      source: 'dsh-balance-rows',
      builtin: false,
      removable: true,
      kind: 'disclosure',
      icon,
      summary: () => summary(account, totals),
      details: () => details(account, totals),
      expanded: () => expanded.has(account.id),
      onToggle: () => {
        if (expanded.has(account.id)) expanded.delete(account.id)
        else expanded.add(account.id)
        service?.refreshSidebarRow(`balance-${account.id}`)
      },
    }))
  }
  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch(ROUTE, { headers: { accept: 'application/json' } })
      if (!response.ok) return
      const payload = await response.json() as { accounts?: AccountView[] }
      accounts = Array.isArray(payload.accounts) ? payload.accounts : []
      renderRows()
    } catch { /* balance rows degrade independently */ }
  }
  ctx.inject(['workbench'], (scope) => {
    service = scope.get('workbench') as WorkbenchService
    renderRows()
    void refresh()
    return () => { service = undefined; clearRows() }
  })
  const tokenDisposer = ctx.sessions.list.subscribe(() => {
    totals = aggregateTokens(ctx)
    if (service !== undefined) renderRows()
  })
  const timer = setInterval(() => { void refresh() }, 60_000)
  ctx.effect(() => () => { tokenDisposer(); clearInterval(timer); clearRows() }, 'dsh-balance-rows: lifecycle')
}
