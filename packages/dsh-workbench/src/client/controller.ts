/** Runtime controller for the Phase 1 overview snapshot. */
import type { ClientContext, SessionFace, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  agentSessionRowsOf,
  extractRecentTools,
  gitSummaryOf,
  jobRowsOf,
  projectNameOf,
  sessionStatusOf,
  subagentRowsOf,
  summarizeGoal,
  tokenUsageSummaryOf,
  todoSummaryOf,
  type GitStatusLike,
} from '../core/derive.ts'
import { uiSetRoot, type WorkbenchStores } from '../core/store.ts'
import { EMPTY_OVERVIEW, type ExpertCatalog, type OverviewSnapshot, type SectionState } from '../core/types.ts'

const RECENT_TOOLS_LIMIT = 8
const GIT_POLL_MS = 15_000

interface GitEnvelope {
  ok: boolean
  value?: GitStatusLike | null
}

interface CatalogApi {
  agentPresets: {
    list(payload: Record<string, never>, signal?: AbortSignal): Promise<{ result: { ok: true; value: { presets: ReadonlyArray<{ id: string; name?: string; description?: string; trust: 'system' | 'user'; isDefault: boolean; broken?: string }> } } | { ok: false } }>
  }
  skills: {
    list(payload: { sessionId: SessionId }, signal?: AbortSignal): Promise<{ result: { ok: true; value: { skills: ReadonlyArray<{ name: string; description: string; modelInvocable: boolean }> } } | { ok: false } }>
  }
}

function catalogApiOf(ctx: ClientContext): CatalogApi | undefined {
  const getService = (ctx as unknown as { get?: (name: string, strict?: boolean) => unknown }).get
  if (typeof getService !== 'function') return undefined
  const connection = getService.call(ctx, 'connection', false) as { api?: CatalogApi } | undefined
  return connection?.api
}

async function fetchExpertCatalog(api: CatalogApi, sessionId: SessionId, signal: AbortSignal): Promise<SectionState<ExpertCatalog>> {
  try {
    const [presetResponse, skillResponse] = await Promise.all([
      api.agentPresets.list({}, signal),
      api.skills.list({ sessionId }, signal),
    ])
    if (!presetResponse.result.ok || !skillResponse.result.ok) return { kind: 'unavailable', reason: 'error' }
    return {
      kind: 'ready',
      value: {
        presets: presetResponse.result.value.presets.map((entry) => ({
          id: entry.id,
          name: entry.name ?? entry.id,
          description: entry.description,
          trust: entry.trust,
          isDefault: entry.isDefault,
          broken: entry.broken !== undefined,
        })),
        skills: skillResponse.result.value.skills.map((entry) => ({
          name: entry.name,
          description: entry.description,
          modelInvocable: entry.modelInvocable,
        })),
      },
    }
  } catch (error) {
    if (signal.aborted) return { kind: 'unavailable', reason: 'noData' }
    console.error('[dsh-workbench] expert catalog read failed:', error)
    return { kind: 'unavailable', reason: 'error' }
  }
}

async function fetchGitStatus(root: string, signal: AbortSignal): Promise<GitStatusLike | null | undefined> {
  try {
    const response = await fetch('/aionui-panel/git-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root }),
      signal,
    })
    if (!response.ok) return undefined
    const envelope = (await response.json()) as GitEnvelope
    return envelope.ok === true ? (envelope.value ?? null) : undefined
  } catch {
    return undefined
  }
}

/** Bind framework-free stores to official runtime snapshots and projections. */
export function startController(ctx: ClientContext, stores: WorkbenchStores): () => void {
  const disposers: Array<() => void> = []
  let sessionDisposers: Array<() => void> = []
  let currentSessionId: SessionId | undefined
  let boundSession: SessionFace | undefined
  let goalValue: unknown
  let todosValue: unknown
  let tokenUsageValue: unknown
  let expertState: OverviewSnapshot['expertCatalog'] = { kind: 'unavailable', reason: 'noSession' }
  let gitState: OverviewSnapshot['git'] = { kind: 'unavailable', reason: 'noSession' }
  let gitTimer: ReturnType<typeof setInterval> | undefined
  let gitAbort: AbortController | undefined
  let catalogAbort: AbortController | undefined
  let generation = 0
  let disposed = false

  const rebuild = (): void => {
    if (disposed) return
    const list = ctx.sessions.list.getSnapshot()
    const sessionId = list.current
    const row = sessionId === undefined ? undefined : list.byId[sessionId]
    if (sessionId === undefined || row === undefined) {
      stores.overview.update(() => EMPTY_OVERVIEW)
      return
    }
    const root = typeof row.cwd === 'string' ? row.cwd : ''
    const conversation = ctx.sessions.binding(sessionId)?.session.getSnapshot()
    const goal = summarizeGoal(goalValue)
    const todos = todoSummaryOf(todosValue)
    const tokenUsage = tokenUsageSummaryOf(tokenUsageValue)
    const workspace = ctx.workspaces.list.getSnapshot().items.find((item) => item.sessionIds.includes(sessionId))
    const catalog = list.subagentsByParent[sessionId]

    const next: OverviewSnapshot = {
      root,
      projectName: workspace?.title ?? projectNameOf(root),
      sessionTitle: row.displayTitle ?? row.title ?? '',
      status: sessionStatusOf(row),
      agentPreset: row.agentPreset,
      agentSessions: {
        kind: 'ready',
        value: agentSessionRowsOf(Object.values(list.byId), sessionId, root),
      },
      expertCatalog: expertState,
      tokenUsage: tokenUsage === undefined ? { kind: 'unavailable', reason: 'noData' } : { kind: 'ready', value: tokenUsage },
      goal: goal === undefined ? { kind: 'unavailable', reason: 'noData' } : goal === null ? { kind: 'empty' } : { kind: 'ready', value: goal },
      todos: todos === undefined ? { kind: 'unavailable', reason: 'noData' } : todos.total === 0 ? { kind: 'empty' } : { kind: 'ready', value: todos },
      jobs: { kind: 'ready', value: jobRowsOf(list.jobsBySession[sessionId]) },
      subagents: catalog?.state === 'error'
        ? { kind: 'unavailable', reason: 'error' }
        : { kind: 'ready', value: subagentRowsOf(catalog?.entries) },
      recentTools: conversation === undefined
        ? { kind: 'unavailable', reason: 'noService' }
        : { kind: 'ready', value: extractRecentTools(conversation.nodes, conversation.runningCalls, RECENT_TOOLS_LIMIT) },
      git: gitState,
    }
    stores.overview.update((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
  }

  const bindSession = (session: SessionFace | undefined): void => {
    for (const dispose of sessionDisposers) dispose()
    sessionDisposers = []
    goalValue = undefined
    todosValue = undefined
    tokenUsageValue = undefined
    boundSession = session
    if (session === undefined) return
    sessionDisposers.push(session.subscribe(rebuild))
    for (const key of ['goal', 'todos', 'liveTokenUsage'] as const) {
      try {
        const face = session.projections.faceOf(key)
        const read = (): void => {
          const value = face.getSnapshot()
          if (key === 'goal') goalValue = value
          else if (key === 'todos') todosValue = value
          else tokenUsageValue = value
        }
        read()
        const update = (): void => {
          read()
          rebuild()
        }
        sessionDisposers.push(face.subscribe(update))
      } catch {
        // Optional projection capability: the unavailable state remains visible.
      }
    }
  }

  const pollGit = async (): Promise<void> => {
    const root = stores.overview.getSnapshot().root
    if (root === '' || disposed) return
    const requestGeneration = generation
    gitAbort?.abort()
    gitAbort = new AbortController()
    const status = await fetchGitStatus(root, gitAbort.signal)
    if (disposed || requestGeneration !== generation || stores.overview.getSnapshot().root !== root) return
    gitState = status === undefined
      ? { kind: 'unavailable', reason: 'noService' }
      : status === null
        ? { kind: 'empty' }
        : { kind: 'ready', value: gitSummaryOf(status) }
    rebuild()
  }

  const loadExpertCatalog = async (sessionId: SessionId): Promise<void> => {
    const api = catalogApiOf(ctx)
    if (api === undefined) {
      expertState = { kind: 'unavailable', reason: 'noService' }
      rebuild()
      return
    }
    const requestGeneration = generation
    catalogAbort?.abort()
    catalogAbort = new AbortController()
    expertState = { kind: 'unavailable', reason: 'noData' }
    rebuild()
    const result = await fetchExpertCatalog(api, sessionId, catalogAbort.signal)
    if (disposed || requestGeneration !== generation || currentSessionId !== sessionId) return
    expertState = result
    rebuild()
  }

  const syncGitPolling = (): void => {
    const active = stores.ui.getSnapshot().overviewActive && stores.overview.getSnapshot().root !== ''
    if (active && gitTimer === undefined) {
      void pollGit()
      gitTimer = setInterval(() => {
        if (document.visibilityState === 'visible') void pollGit()
      }, GIT_POLL_MS)
    } else if (!active && gitTimer !== undefined) {
      clearInterval(gitTimer)
      gitTimer = undefined
      gitAbort?.abort()
    }
  }

  const syncSession = (): void => {
    const list = ctx.sessions.list.getSnapshot()
    const sessionId = list.current
    const row = sessionId === undefined ? undefined : list.byId[sessionId]
    const root = row !== undefined && typeof row.cwd === 'string' ? row.cwd : ''
    const face = sessionId === undefined ? undefined : ctx.sessions.binding(sessionId)?.session
    const sessionChanged = sessionId !== currentSessionId
    const wasPolling = gitTimer !== undefined
    if (sessionChanged) {
      currentSessionId = sessionId
      generation += 1
      gitAbort?.abort()
      catalogAbort?.abort()
      gitState = sessionId === undefined ? { kind: 'unavailable', reason: 'noSession' } : { kind: 'unavailable', reason: 'noData' }
      expertState = sessionId === undefined ? { kind: 'unavailable', reason: 'noSession' } : { kind: 'unavailable', reason: 'noData' }
      uiSetRoot(stores, root)
      if (sessionId !== undefined) void loadExpertCatalog(sessionId)
    }
    if (face !== boundSession) bindSession(face)
    rebuild()
    syncGitPolling()
    if (sessionChanged && wasPolling && root !== '') void pollGit()
  }

  disposers.push(ctx.sessions.list.subscribe(syncSession))
  disposers.push(ctx.workspaces.list.subscribe(rebuild))
  disposers.push(stores.ui.subscribe(syncGitPolling))
  syncSession()

  return () => {
    disposed = true
    generation += 1
    gitAbort?.abort()
    catalogAbort?.abort()
    if (gitTimer !== undefined) clearInterval(gitTimer)
    for (const dispose of disposers) dispose()
    for (const dispose of sessionDisposers) dispose()
  }
}
