import { createElement, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { ISessions, SessionSearchResultItem } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkbenchStores } from '../core/store.ts'
import { ExpertsIcon, KnowledgeIcon, MonitoringIcon, NewsIcon } from './icons.tsx'
import { t } from './locales.ts'
import { NewsRow } from './NewsRow.tsx'
import type { WorkbenchServiceFace } from './workbench-service.ts'
import styles from './sidebar-rows.module.css'

type BuiltinRowId = 'knowledge' | 'experts' | 'news' | 'monitoring'

function summary(label: string): ReactNode {
  return createElement('span', { className: styles.label }, label)
}

function lines(values: string[]): ReactNode {
  return createElement('div', { className: styles.details }, values.map((value, index) =>
    createElement('div', { className: styles.detailRow, key: `${index}-${value}`, title: value }, value)))
}

function expertLines(stores: WorkbenchStores): string[] {
  const catalog = stores.overview.getSnapshot().expertCatalog
  if (catalog.kind === 'unavailable') return [t(`overview.unavailable.${catalog.reason}` as const)]
  if (catalog.kind === 'empty') return [t('overview.unavailable.noData')]
  const presetNames = catalog.value.presets.slice(0, 3).map((item) => item.name).join(', ')
  const skillNames = catalog.value.skills.slice(0, 3).map((item) => item.name).join(', ')
  return [
    `${t('navigation.experts.presets', { count: catalog.value.presets.length })}: ${presetNames || t('overview.unavailable.noData')}`,
    `${t('navigation.experts.skills', { count: catalog.value.skills.length })}: ${skillNames || t('overview.unavailable.noData')}`,
  ]
}

function monitoringLines(stores: WorkbenchStores): string[] {
  const overview = stores.overview.getSnapshot()
  const jobs = overview.jobs.kind === 'ready' ? overview.jobs.value : []
  const subagents = overview.subagents.kind === 'ready' ? overview.subagents.value : []
  const result = [
    t('navigation.monitoring.status', { status: overview.status === 'running' ? t('status.running') : overview.status === 'attention' ? t('status.attention') : t('status.idle') }),
  ]
  if (overview.tokenUsage.kind === 'ready') {
    const usage = overview.tokenUsage.value
    result.push(t('navigation.monitoring.tokens', { input: usage.uncachedInputTokens + usage.cacheReadTokens, output: usage.outputTokens, cache: usage.cacheReadTokens }))
    if (usage.tokensPerSecond !== undefined) result.push(t('navigation.monitoring.tps', { value: Math.round(usage.tokensPerSecond * 10) / 10 }))
  } else result.push(t('navigation.monitoring.tokensUnavailable'))
  result.push(t('navigation.monitoring.activity', { jobs: jobs.filter((job) => job.status === 'running').length, subagents: subagents.filter((agent) => agent.running).length }))
  if (overview.recentTools.kind === 'ready' && overview.recentTools.value.length > 0) {
    for (const tool of overview.recentTools.value.slice(0, 3)) result.push(t('navigation.monitoring.tool', { name: tool.name, state: tool.state }))
  } else result.push(t('navigation.monitoring.toolsEmpty'))
  return result
}

function KnowledgeRow({ sessions, close }: { sessions: ISessions; close: () => void }): ReactNode {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SessionSearchResultItem[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle')
  const abortRef = useRef<AbortController>()
  useEffect(() => () => abortRef.current?.abort(), [])
  const search = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const value = query.trim()
    if (value === '') return
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setStatus('loading')
    try {
      const response = await sessions.search(value, abort.signal)
      if (abort.signal.aborted) return
      if (!response.ok) { setResults([]); setStatus('error'); return }
      setResults(response.value.items.slice(0, sessions.searchResultLimit))
      setStatus(response.value.items.length === 0 ? 'empty' : 'ready')
    } catch {
      if (!abort.signal.aborted) { setResults([]); setStatus('error') }
    }
  }
  return createElement('div', { className: styles.knowledge }, [
    createElement('form', { className: styles.searchForm, onSubmit: (event: FormEvent<HTMLFormElement>) => { void search(event) }, key: 'form' }, [
      createElement('input', { className: styles.searchInput, value: query, maxLength: 200, onChange: (event: FormEvent<HTMLInputElement>) => setQuery(event.currentTarget.value), placeholder: t('navigation.knowledge.searchPlaceholder'), 'aria-label': t('navigation.knowledge.searchLabel'), key: 'input' }),
      createElement('button', { className: styles.searchButton, type: 'submit', disabled: query.trim() === '' || status === 'loading', key: 'submit' }, status === 'loading' ? t('navigation.knowledge.searching') : t('navigation.knowledge.search')),
    ]),
    status === 'idle' ? createElement('div', { className: styles.detailRow, key: 'idle' }, t('navigation.knowledge.context')) : null,
    status === 'empty' ? createElement('div', { className: styles.detailRow, role: 'status', key: 'empty' }, t('navigation.knowledge.empty')) : null,
    status === 'error' ? createElement('div', { className: styles.detailRow, role: 'status', key: 'error' }, t('navigation.knowledge.error')) : null,
    results.length > 0 ? createElement('div', { className: styles.searchResults, key: 'results' }, results.map((item) => {
      const row = sessions.list.getSnapshot().byId[item.sessionId]
      const title = row?.displayTitle ?? row?.title ?? item.sessionId
      return createElement('button', { className: styles.searchResult, type: 'button', key: item.sessionId, onClick: () => { sessions.open(item.sessionId); close() } }, [
        createElement('strong', { key: 'title' }, title),
        createElement('span', { key: 'snippet' }, item.snippet),
      ])
    })) : null,
  ])
}

/** Register independently disposable built-in rows into the shared top stack. */
export function registerBuiltinSidebarRows(service: WorkbenchServiceFace, stores: WorkbenchStores, sessions: ISessions): () => void {
  let openId: BuiltinRowId | undefined
  const toggle = (id: BuiltinRowId): void => {
    const previous = openId
    openId = openId === id ? undefined : id
    if (previous !== undefined) service.refreshSidebarRow(previous)
    service.refreshSidebarRow(id)
  }
  let checkExpanded = false
  const registrations = [
    service.registerSidebarRow({
      id: 'knowledge', source: 'workbench', slot: 'top', order: 30, label: () => t('navigation.knowledge'),
      builtin: true, removable: true, kind: 'disclosure',
      icon: () => createElement(KnowledgeIcon),
      summary: () => summary(t('navigation.knowledge')),
      details: () => createElement(KnowledgeRow, { sessions, close: () => toggle('knowledge') }),
      expanded: () => openId === 'knowledge', onToggle: () => toggle('knowledge'),
    }),
    service.registerSidebarRow({
      id: 'experts', source: 'workbench', slot: 'top', order: 40, label: () => t('navigation.experts'),
      builtin: true, removable: true, kind: 'disclosure',
      icon: () => createElement(ExpertsIcon),
      summary: () => summary(t('navigation.experts')),
      details: () => lines(expertLines(stores)),
      expanded: () => openId === 'experts', onToggle: () => toggle('experts'),
    }),
    service.registerSidebarRow({
      id: 'news', source: 'workbench', slot: 'top', order: 50, label: () => t('navigation.news'),
      builtin: true, removable: true, kind: 'disclosure',
      icon: () => createElement(NewsIcon),
      summary: () => summary(t('navigation.news')),
      details: () => createElement(NewsRow),
      expanded: () => openId === 'news', onToggle: () => toggle('news'),
    }),
    service.registerSidebarRow({
      id: 'monitoring', source: 'workbench', slot: 'top', order: 60, label: () => t('navigation.monitoring'),
      builtin: true, removable: true, kind: 'disclosure',
      icon: () => createElement(MonitoringIcon),
      summary: () => summary(t('navigation.monitoring')),
      details: () => lines(monitoringLines(stores)),
      expanded: () => openId === 'monitoring', onToggle: () => toggle('monitoring'),
    }),
    service.registerSidebarRow({
      id: 'status-check', source: 'workbench', slot: 'bottom', order: 10, label: () => t('navigation.statusCheck'),
      builtin: true, removable: true, kind: 'disclosure',
      icon: () => createElement('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }, [
        createElement('circle', { cx: 8, cy: 8, r: 5.5, key: 'ring' }),
        createElement('path', { d: 'm5.3 8 1.7 1.7L10.8 6', key: 'check' }),
      ]),
      summary: () => summary(t('navigation.statusCheck')),
      details: () => lines([t('navigation.statusCheck.ok'), t('navigation.statusCheck.hint')]),
      expanded: () => checkExpanded,
      onToggle: () => { checkExpanded = !checkExpanded; service.refreshSidebarRow('status-check') },
    }),
  ]
  const unsubscribe = stores.overview.subscribe(() => service.refreshSidebarRow())
  return () => {
    unsubscribe()
    for (const dispose of registrations.reverse()) void dispose()
  }
}
