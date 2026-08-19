import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type JSX, type KeyboardEvent } from 'react'
import type { ISessions, SessionSearchResultItem } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkbenchModuleIcon, WorkbenchModuleSummary } from '../core/module-registry.ts'
import { listNewsSources, loadNewsSource, type NewsItem, type NewsSource } from './news-feed.ts'
import { navigationLayoutFor } from '../core/navigation-layout.ts'
import type { WorkbenchStores } from '../core/store.ts'
import { afterFirstPaint } from './after-first-paint.ts'
import type { WorkbenchServiceFace } from './workbench-service.ts'
import { AgentIcon, CloseIcon, ExpertsIcon, KnowledgeIcon, MonitoringIcon, NewsIcon, SettingsIcon, SshIcon, TasksIcon } from './icons.tsx'
import { t } from './locales.ts'
import css from './styles/navigation.module.css'

export interface WorkbenchOverlayProps {
  service: WorkbenchServiceFace
  stores: WorkbenchStores
  sessions: ISessions
}

const CONTEXT_FOCUSABLE = [
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'a[href]:not([tabindex="-1"])',
  '[tabindex="0"]',
].map((selector) => `#dsh-workbench-context ${selector}`).join(', ')

function iconOf(icon: WorkbenchModuleIcon): JSX.Element {
  if (icon === 'agent') return <AgentIcon />
  if (icon === 'tasks') return <TasksIcon />
  if (icon === 'knowledge') return <KnowledgeIcon />
  if (icon === 'experts') return <ExpertsIcon />
  if (icon === 'news') return <NewsIcon />
  if (icon === 'monitoring') return <MonitoringIcon />
  if (icon === 'ssh') return <SshIcon />
  if (icon === 'settings') return <SettingsIcon />
  return <SettingsIcon />
}

function labelOf(module: WorkbenchModuleSummary): string {
  if (module.id === 'agent') return t('navigation.agent')
  if (module.id === 'tasks') return t('navigation.tasks')
  if (module.id === 'knowledge') return t('navigation.knowledge')
  if (module.id === 'experts') return t('navigation.experts')
  if (module.id === 'news') return t('navigation.news')
  if (module.id === 'monitoring') return t('navigation.monitoring')
  if (module.id === 'ssh') return t('navigation.ssh')
  if (module.id === 'settings') return t('navigation.settings')
  return module.label
}

function descriptionOf(id: string): string {
  if (id === 'agent') return t('navigation.agent.description')
  if (id === 'tasks') return t('navigation.tasks.description')
  if (id === 'knowledge') return t('navigation.knowledge.description')
  if (id === 'experts') return t('navigation.experts.description')
  if (id === 'news') return t('navigation.news.description')
  if (id === 'monitoring') return t('navigation.monitoring.description')
  if (id === 'ssh') return t('navigation.ssh.description')
  if (id === 'settings') return t('navigation.settings.description')
  return t('navigation.extension.description')
}

function contextLines(id: string, stores: WorkbenchStores): string[] {
  const overview = stores.overview.getSnapshot()
  if (id === 'agent') {
    const rows = overview.agentSessions.kind === 'ready' ? overview.agentSessions.value : []
    const sessionLines = rows.map((row) => {
      const state = row.attention ? t('navigation.agent.session.attention') : row.running ? t('navigation.agent.session.running') : t('navigation.agent.session.idle')
      return `${row.title} - ${state}`
    })
    return [
      overview.projectName || t('statusbar.noSession'),
      t('navigation.agent.sessions', { count: rows.length }),
      ...sessionLines,
    ]
  }
  if (id === 'tasks') {
    const lines = [t('navigation.tasks.context')]
    if (overview.goal.kind === 'ready') lines.push(t('navigation.tasks.goal', { objective: overview.goal.value.objective }))
    if (overview.todos.kind === 'ready') lines.push(t('navigation.tasks.todos', { done: overview.todos.value.done, total: overview.todos.value.total }))
    const jobs = overview.jobs.kind === 'ready' ? overview.jobs.value : []
    lines.push(t('navigation.tasks.jobs', { count: jobs.length }))
    for (const job of jobs.slice(0, 4)) lines.push(t('navigation.tasks.job', { label: job.label, status: job.status }))
    lines.push(t('navigation.legacyEntry'))
    return lines
  }
  if (id === 'knowledge') return []
  if (id === 'experts') {
    if (overview.expertCatalog.kind === 'unavailable') return [t(`overview.unavailable.${overview.expertCatalog.reason}` as const)]
    if (overview.expertCatalog.kind === 'empty') return [t('overview.unavailable.noData')]
    const { presets, skills } = overview.expertCatalog.value
    return [
      t('navigation.experts.presets', { count: presets.length }),
      ...presets.map((preset) => t('navigation.experts.preset', {
        name: preset.name,
        trust: t(`navigation.experts.trust.${preset.trust}`),
        state: preset.broken ? t('navigation.experts.broken') : preset.isDefault ? t('navigation.experts.default') : t('navigation.experts.ready'),
      })),
      t('navigation.experts.skills', { count: skills.length }),
      ...skills.map((skill) => t('navigation.experts.skill', {
        name: skill.name,
        state: skill.modelInvocable ? t('navigation.experts.modelInvocable') : t('navigation.experts.userOnly'),
      })),
    ]
  }
  if (id === 'news') return [t('navigation.news.context'), t('navigation.unavailable')]
  if (id === 'monitoring') {
    const lines = [t('navigation.monitoring.status', { status: overview.status === 'running' ? t('status.running') : overview.status === 'attention' ? t('status.attention') : t('status.idle') })]
    if (overview.tokenUsage.kind === 'ready') {
      const usage = overview.tokenUsage.value
      lines.push(t('navigation.monitoring.tokens', {
        input: usage.uncachedInputTokens + usage.cacheReadTokens,
        output: usage.outputTokens,
        cache: usage.cacheReadTokens,
      }))
      if (usage.tokensPerSecond !== undefined) lines.push(t('navigation.monitoring.tps', { value: Math.round(usage.tokensPerSecond * 10) / 10 }))
    } else lines.push(t('navigation.monitoring.tokensUnavailable'))
    const jobs = overview.jobs.kind === 'ready' ? overview.jobs.value : []
    const subagents = overview.subagents.kind === 'ready' ? overview.subagents.value : []
    lines.push(t('navigation.monitoring.activity', {
      jobs: jobs.filter((job) => job.status === 'running').length,
      subagents: subagents.filter((agent) => agent.running).length,
    }))
    if (overview.recentTools.kind === 'ready') {
      for (const tool of overview.recentTools.value.slice(0, 5)) lines.push(t('navigation.monitoring.tool', { name: tool.name, state: tool.state }))
    }
    return lines
  }
  if (id === 'ssh') return [t('navigation.ssh.context'), t('navigation.legacyEntry')]
  if (id === 'settings') return [t('navigation.settings.context')]
  return []
}

function KnowledgeSearch({ sessions, onOpen }: { sessions: ISessions; onOpen: () => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SessionSearchResultItem[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle')
  const [hasMore, setHasMore] = useState(false)
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
    const response = await sessions.search(value, abort.signal)
    if (abort.signal.aborted) return
    if (!response.ok) {
      setResults([])
      setStatus('error')
      return
    }
    setResults(response.value.items)
    setHasMore(response.value.hasMore)
    setStatus(response.value.items.length === 0 ? 'empty' : 'ready')
  }

  return <div className={css.searchSurface}>
    <form className={css.searchForm} onSubmit={(event) => { void search(event) }}>
      <label className={css.searchLabel} htmlFor="dsh-workbench-knowledge-query">{t('navigation.knowledge.searchLabel')}</label>
      <div className={css.searchControls}>
        <input
          id="dsh-workbench-knowledge-query"
          className={css.searchInput}
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t('navigation.knowledge.searchPlaceholder')}
        />
        <button className={css.searchButton} type="submit" disabled={query.trim() === '' || status === 'loading'}>{status === 'loading' ? t('navigation.knowledge.searching') : t('navigation.knowledge.search')}</button>
      </div>
    </form>
    {status === 'idle' && <div className={css.contextMeta}>{t('navigation.knowledge.context')}</div>}
    {status === 'empty' && <div className={css.contextMeta} role="status">{t('navigation.knowledge.empty')}</div>}
    {status === 'error' && <div className={css.error} role="status">{t('navigation.knowledge.error')}</div>}
    {results.length > 0 && <div className={css.searchResults} aria-live="polite">
      {results.map((item) => {
        const row = sessions.list.getSnapshot().byId[item.sessionId]
        const title = row?.displayTitle ?? row?.title ?? item.sessionId
        return <button key={item.sessionId} className={css.searchResult} type="button" onClick={() => { sessions.open(item.sessionId); onOpen() }}>
          <strong>{title}</strong>
          <span>{item.snippet}</span>
        </button>
      })}
      {hasMore && <div className={css.contextMeta}>{t('navigation.knowledge.more', { count: sessions.searchResultLimit })}</div>}
    </div>}
  </div>
}

function NewsPanel(): JSX.Element {
  const [sources, setSources] = useState<NewsSource[]>([])
  const [sourceId, setSourceId] = useState('')
  const [items, setItems] = useState<NewsItem[]>([])
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading')
  const abortRef = useRef<AbortController>()

  useEffect(() => {
    const abort = new AbortController()
    abortRef.current = abort
    void listNewsSources(abort.signal).then((nextSources) => {
      if (abort.signal.aborted) return
      setSources(nextSources)
      if (nextSources.length === 0) {
        setStatus('empty')
        return
      }
      const first = nextSources[0].id
      setSourceId(first)
      return loadNewsSource(first, abort.signal).then((nextItems) => {
        if (abort.signal.aborted) return
        setItems(nextItems)
        setStatus('ready')
      })
    }).catch(() => {
      if (!abort.signal.aborted) setStatus('error')
    })
    return () => abort.abort()
  }, [])

  const changeSource = (nextId: string): void => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setSourceId(nextId)
    setStatus('loading')
    setItems([])
    void loadNewsSource(nextId, abort.signal).then((nextItems) => {
      if (abort.signal.aborted) return
      setItems(nextItems)
      setStatus('ready')
    }).catch(() => {
      if (!abort.signal.aborted) setStatus('error')
    })
  }

  if (status === 'empty') return <div className={css.contextMeta} role="status">{t('navigation.news.empty')}</div>
  if (status === 'error' && sources.length === 0) return <div className={css.error} role="alert">{t('navigation.news.error')}</div>
  return <div className={css.searchSurface}>
    {sources.length > 1 && <label className={css.searchLabel}>
      {t('navigation.news.source')}
      <select className={css.searchInput} value={sourceId} onChange={(event) => changeSource(event.currentTarget.value)}>
        {sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
      </select>
    </label>}
    {status === 'loading' && <div className={css.contextMeta}>{t('navigation.news.loading')}</div>}
    {status === 'error' && <div className={css.error} role="alert">{t('navigation.news.error')}</div>}
    {status === 'ready' && items.length === 0 && <div className={css.contextMeta}>{t('navigation.news.noItems')}</div>}
    {items.map((item, index) => item.link === undefined
      ? <div className={css.newsItem} key={`${index}-${item.title}`}><strong>{item.title}</strong>{item.summary && <span>{item.summary}</span>}</div>
      : <a className={css.newsItem} key={`${index}-${item.title}`} href={item.link} target="_blank" rel="noreferrer"><strong>{item.title}</strong>{item.summary && <span>{item.summary}</span>}</a>)}
  </div>
}

export function WorkbenchOverlay({ service, stores, sessions }: WorkbenchOverlayProps): JSX.Element {
  const subscribeModules = useMemo(() => service.subscribeModules.bind(service), [service])
  const getModules = useMemo(() => service.getModules.bind(service), [service])
  const subscribeNavigation = useMemo(() => service.subscribeNavigation.bind(service), [service])
  const getNavigation = useMemo(() => service.getNavigation.bind(service), [service])
  const modules = useSyncExternalStore(subscribeModules, getModules, getModules)
  const navigation = useSyncExternalStore(subscribeNavigation, getNavigation, getNavigation)
  const overview = useSyncExternalStore(stores.overview.subscribe, stores.overview.getSnapshot, stores.overview.getSnapshot)
  const [surfaceWidth, setSurfaceWidth] = useState(0)
  const [sidebarWidth, setSidebarWidth] = useState(56)
  const [contextOpen, setContextOpen] = useState(false)
  const [contextId, setContextId] = useState('agent')
  const [contextError, setContextError] = useState<string>()
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const restoreFocusRef = useRef<string | undefined>(undefined)
  const activeId = navigation.activeId ?? 'agent'
  const contextModule = modules.modules.find((module) => module.id === contextId)
  const layout = useMemo(() => navigationLayoutFor(surfaceWidth), [surfaceWidth])
  const mobileDialogOpen = contextOpen && layout.mode === 'mobile'

  useEffect(() => {
    let disposeGeometry = (): void => {}
    const cancelStart = afterFirstPaint(() => {
      const frame = overlayRef.current?.closest<HTMLElement>('[data-dsh-frame]') ?? null
      const sidebar = frame === null
        ? null
        : [...frame.children].find((child): child is HTMLElement => child instanceof HTMLElement && child.matches('[data-pane="sidebar"]')) ?? null
      const syncGeometry = (): void => {
        setSurfaceWidth(frame?.getBoundingClientRect().width ?? window.innerWidth)
        setSidebarWidth(sidebar?.getBoundingClientRect().width ?? 56)
      }
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncGeometry)
      if (frame !== null) observer?.observe(frame)
      if (sidebar !== null) observer?.observe(sidebar)
      window.addEventListener('resize', syncGeometry, { passive: true })
      syncGeometry()
      disposeGeometry = () => {
        window.removeEventListener('resize', syncGeometry)
        observer?.disconnect()
      }
    })
    return () => {
      cancelStart()
      disposeGeometry()
    }
  }, [])

  useEffect(() => {
    if (navigation.phase === 'active' && navigation.activeId !== undefined) {
      setContextId(navigation.activeId)
      setContextError(undefined)
      if (navigation.activeId !== 'agent') setContextOpen(true)
    }
  }, [navigation.phase, navigation.activeId])

  useEffect(() => {
    if (mobileDialogOpen) closeRef.current?.focus()
  }, [mobileDialogOpen])

  useEffect(() => {
    if (contextOpen) return
    const restoreId = restoreFocusRef.current
    if (restoreId === undefined) return
    restoreFocusRef.current = undefined
    buttonRefs.current.get(restoreId)?.focus()
  }, [contextOpen])

  const closeContext = (): void => {
    restoreFocusRef.current = contextId
    setContextOpen(false)
  }

  const activate = async (module: WorkbenchModuleSummary): Promise<void> => {
    setContextId(module.id)
    service.refresh(module.id)
    const current = service.getModules().modules.find((entry) => entry.id === module.id)
    if (current?.availability.kind === 'unavailable') {
      setContextError(current.availability.reason)
      setContextOpen(true)
      return
    }
    setContextError(undefined)
    const result = await service.activate(module.id)
    if (result.ok) setContextOpen(true)
    else {
      setContextError(result.error)
      setContextOpen(true)
    }
  }

  const onOverlayKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && contextOpen) {
      event.preventDefault()
      closeContext()
      return
    }
    if (event.key !== 'Tab' || !mobileDialogOpen) return
    const focusable = [...(overlayRef.current?.querySelectorAll<HTMLElement>(CONTEXT_FOCUSABLE) ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const onRailKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const ids = modules.modules.map((module) => module.id)
    const current = Math.max(0, ids.indexOf((event.target as HTMLElement).dataset.moduleId ?? activeId))
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % ids.length : (current - 1 + ids.length) % ids.length
    buttonRefs.current.get(ids[next])?.focus()
  }

  return <div
    ref={overlayRef}
    className={css.overlay}
    data-dsh-workbench-navigation
    onKeyDown={onOverlayKeyDown}
    data-layout-mode={layout.mode}
    data-mobile-dialog-open={mobileDialogOpen || undefined}
    style={{ '--workbench-rail': `${layout.railSize}px`, '--workbench-context': `${layout.contextWidth}px`, '--workbench-sidebar': `${sidebarWidth}px` } as CSSProperties}
  >
    {mobileDialogOpen && <button className={css.scrim} tabIndex={-1} aria-label={t('navigation.close')} onClick={closeContext} />}
    <nav className={css.rail} aria-label={t('navigation.label')} aria-hidden={mobileDialogOpen || undefined} onKeyDown={onRailKeyDown} onPointerEnter={() => service.refresh()}>
      <div className={css.railMark} aria-hidden="true">DSH</div>
      <div className={css.railItems}>
        {modules.modules.map((module) => {
          const selected = module.id === activeId
          const unavailable = module.availability.kind === 'unavailable'
          const label = labelOf(module)
          return <button
            key={module.id}
            ref={(element) => { if (element === null) buttonRefs.current.delete(module.id); else buttonRefs.current.set(module.id, element) }}
            type="button"
            className={`${css.railButton} ${selected ? css.railButtonActive : ''}`}
            data-module-id={module.id}
            aria-current={selected ? 'page' : undefined}
            tabIndex={mobileDialogOpen ? -1 : selected ? 0 : -1}
            aria-controls="dsh-workbench-context"
            aria-expanded={contextId === module.id && contextOpen}
            data-module-unavailable={unavailable || undefined}
            aria-label={unavailable ? `${label}: ${module.availability.reason}` : label}
            title={label}
            onClick={() => { void activate(module) }}
          >
            {iconOf(module.icon)}
            <span className={css.railLabel}>{label}</span>
            {unavailable && <span className={css.unavailableDot} aria-hidden="true" />}
          </button>
        })}
      </div>
    </nav>
    {contextOpen && <aside id="dsh-workbench-context" className={css.context} role={layout.mode === 'mobile' ? 'dialog' : undefined} aria-modal={layout.mode === 'mobile' || undefined} aria-label={t('navigation.context')}>
      <header className={css.contextHeader}>
        <div className={css.contextHeading}>
          <span className={css.contextTitle}>{contextModule === undefined ? contextId : labelOf(contextModule)}</span>
          <span className={css.contextStatus}>{navigation.phase === 'activating' && navigation.targetId === contextId ? t('navigation.activating') : navigation.phase === 'active' && activeId === contextId ? t('navigation.active') : t('navigation.unavailableState')}</span>
        </div>
        <button ref={closeRef} type="button" className={css.closeButton} aria-label={t('navigation.close')} onClick={closeContext}><CloseIcon /></button>
      </header>
      <p className={css.contextDescription}>{descriptionOf(contextId)}</p>
      {contextId === 'knowledge'
        ? <KnowledgeSearch sessions={sessions} onOpen={() => { void service.adopt('agent'); closeContext() }} />
        : contextId === 'news'
          ? <NewsPanel />
          : <div className={css.contextRows}>
          {contextLines(contextId, stores).map((line, index) => <div className={css.contextRow} key={`${index}-${line}`} title={line}>{line}</div>)}
        </div>}
      {contextError !== undefined && <div className={css.error} role="status">{contextError}</div>}
      {contextId === 'agent' && <div className={css.contextMeta}>{overview.status === 'running' ? t('status.running') : overview.status === 'attention' ? t('status.attention') : t('status.idle')}</div>}
    </aside>}
  </div>
}
