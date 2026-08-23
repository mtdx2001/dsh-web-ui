/**
 * Pure derivation helpers of the workbench: every piece of overview/status-bar
 * data is computed here from structural inputs so the behavior is unit-testable
 * without a DOM or a runtime. The client controller only assembles the inputs.
 * @module dsh-workbench/core/derive
 */

import type {
  AgentSessionRow,
  GitSummary,
  GoalSummary,
  JobRow,
  RecentToolRow,
  SessionStatus,
  TokenUsageSummary,
  TodoSummary,
} from './types.ts'

/** Project display name: the last non-empty path segment (both separators). */
export function projectNameOf(cwd: string): string {
  const trimmed = cwd.replace(/[\\/]+$/, '')
  if (trimmed === '') return ''
  const segments = trimmed.split(/[\\/]/).filter((segment) => segment !== '')
  return segments.length === 0 ? '' : segments[segments.length - 1]
}

/** Reduce the official session list to recent Agent context rows. */
export function agentSessionRowsOf(
  rows: readonly { id: string; cwd?: unknown; title?: unknown; displayTitle?: unknown; running: boolean; pendingInteraction?: unknown }[],
  currentId: string | undefined,
  root: string,
  limit = 6,
): AgentSessionRow[] {
  return rows
    .filter((row) => typeof row.id === 'string' && (root === '' || row.cwd === root))
    .sort((left, right) => (left.id === currentId ? -1 : right.id === currentId ? 1 : 0))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      title: typeof row.displayTitle === 'string' && row.displayTitle !== ''
        ? row.displayTitle
        : typeof row.title === 'string' && row.title !== '' ? row.title : 'Untitled session',
      cwd: typeof row.cwd === 'string' ? row.cwd : '',
      running: row.running,
      attention: row.pendingInteraction !== undefined && row.pendingInteraction !== null,
    }))
}

/** Validate and detach the optional liveTokenUsage projection. */
export function tokenUsageSummaryOf(value: unknown): TokenUsageSummary | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const numericKeys = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
  if (numericKeys.some((key) => typeof record[key] !== 'number' || !Number.isFinite(record[key]) || (record[key] as number) < 0)) return undefined
  const tokensPerSecond = record.tokensPerSecond
  return {
    uncachedInputTokens: record.uncachedInputTokens as number,
    outputTokens: record.outputTokens as number,
    cacheReadTokens: record.cacheReadTokens as number,
    cacheWriteTokens: record.cacheWriteTokens as number,
    estimated: record.estimated === true,
    ...(typeof tokensPerSecond === 'number' && Number.isFinite(tokensPerSecond) && tokensPerSecond >= 0 ? { tokensPerSecond } : {}),
  }
}

/** Coarse run status of one session list row. */
export function sessionStatusOf(row: { running: boolean; pendingInteraction?: unknown }): SessionStatus {
  if (row.pendingInteraction !== undefined && row.pendingInteraction !== null) return 'attention'
  return row.running ? 'running' : 'idle'
}

/** Structural shape of one conversation node the tool extraction reads. */
export interface ToolNodeLike {
  kind: string
  time?: number
  callId?: string
  call?: { name: string; argsRaw: string } | null
  isError?: boolean
}

/** Structural shape of one running tool call. */
export interface RunningCallLike {
  name: string
  time: number
}

/**
 * The newest-first recent tool call rows: running calls first (live at the
 * top), then the newest in-window tool results. Unknown names degrade to the
 * callId tail; the list is capped at `limit`.
 */
export function extractRecentTools(
  nodes: readonly ToolNodeLike[],
  runningCalls: readonly RunningCallLike[],
  limit: number,
): RecentToolRow[] {
  const rows: RecentToolRow[] = []
  for (const call of runningCalls) {
    rows.push({ name: call.name, time: call.time, state: 'running' })
  }
  const remaining = Math.max(0, limit - rows.length)
  if (remaining === 0) return rows.slice(0, limit)
  // Conversation windows can be very large during boot. Walk newest-first and
  // stop at the display cap instead of sorting every historical tool result.
  const recent: RecentToolRow[] = []
  for (let index = nodes.length - 1; index >= 0 && recent.length < remaining; index -= 1) {
    const node = nodes[index]
    if (node.kind !== 'tool-result') continue
    const name = node.call?.name ?? node.callId ?? ''
    if (name === '') continue
    recent.push({
      name,
      time: node.time ?? 0,
      state: node.isError === true ? 'error' : 'done',
    })
  }
  rows.push(...recent)
  return rows.slice(0, Math.max(0, limit))
}

/** Reduce the complete `todos` projection to progress. */
export function todoSummaryOf(value: unknown, nextCap = 3): TodoSummary | undefined {
  if (!Array.isArray(value)) return undefined
  let done = 0
  const next: string[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const status = (item as { status?: unknown }).status
    const content = (item as { content?: unknown }).content
    if (status === 'completed') done += 1
    else if (typeof content === 'string' && content !== '' && next.length < nextCap) next.push(content)
  }
  return { done, total: value.length, next }
}

/**
 * Reduce the host `goal` projection value to a summary. undefined = the value
 * is not a goal projection (caller shows unavailable); null = no goal set.
 */
export function summarizeGoal(value: unknown): GoalSummary | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value !== 'object') return undefined
  const goal = (value as { goal?: unknown }).goal
  if (typeof goal !== 'object' || goal === null) return undefined
  const record = goal as Record<string, unknown>
  if (typeof record.objective !== 'string' || typeof record.phase !== 'string') return undefined
  const rounds = (value as { roundsStarted?: unknown }).roundsStarted
  return {
    objective: record.objective,
    phase: record.phase,
    roundsStarted: typeof rounds === 'number' && Number.isFinite(rounds) ? rounds : 0,
    maxGoalRounds: typeof record.maxGoalRounds === 'number' ? record.maxGoalRounds : 0,
  }
}

/** Structural shape of the Workbench read-only git-status payload. */
export interface GitStatusLike {
  branch: string
  staged: readonly unknown[]
  unstaged: readonly unknown[]
  untracked: readonly unknown[]
}

/** Reduce one git-status payload to the compact summary (null = not a repo). */
export function gitSummaryOf(status: GitStatusLike | null | undefined): GitSummary | null {
  if (status === null || status === undefined) return null
  return {
    branch: status.branch,
    staged: status.staged.length,
    unstaged: status.unstaged.length,
    untracked: status.untracked.length,
  }
}

/** Structural subset of one direct-child catalog entry. */
export type SubagentEntryLike =
  | { kind: 'child'; id: string; activity: 'running' | 'inactive'; label?: string }
  | { kind: 'diagnostic'; id: string; reason: string }

/** Direct subagent rows from the durable catalog, including diagnostics. */
export function subagentRowsOf(entries: readonly SubagentEntryLike[] | undefined): { id: string; title: string; running: boolean }[] {
  if (entries === undefined) return []
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.kind === 'child' ? (entry.label ?? entry.id) : `${entry.id} (${entry.reason})`,
    running: entry.kind === 'child' && entry.activity === 'running',
  }))
}

/** Structural shape of one wire job row. */
export interface JobLike {
  id: string
  kind: string
  label: string
  status: string
  detail?: string
}

/** Copy wire jobs into display rows (live jobs first, then newest started). */
export function jobRowsOf(jobs: readonly JobLike[] | undefined): JobRow[] {
  if (jobs === undefined) return []
  const rows = jobs.map((job) => ({
    id: job.id,
    kind: job.kind,
    label: job.label,
    status: job.status,
    detail: job.detail,
  }))
  rows.sort((a, b) => {
    const liveA = a.status === 'running' || a.status === 'stopping' ? 0 : 1
    const liveB = b.status === 'running' || b.status === 'stopping' ? 0 : 1
    return liveA - liveB
  })
  return rows
}

// ─── width policy ───────────────────────────────────────────────────────────

/** The workbench chat floor: phase 1 raises the panel system's 360px floor. */
export const CHAT_FLOOR_PX = 480

/** Input geometry of one width-policy evaluation (all px, non-negative). */
export interface WidthGeometry {
  /** Full width of the frame grid row. */
  frameWidth: number
  /** Shell sidebar track width (0 when not yet mirrored). */
  sidebarPx: number
  /** Shell details track width (0 when collapsed/absent). */
  detailsPx: number
  /** Current preview region track width (0 when closed). */
  previewPx: number
  /** Current explorer column track width (0 when collapsed). */
  explorerPx: number
  /** Smallest width the preview region may keep while open. */
  minPreviewPx: number
  /** Smallest width the explorer column may keep while open. */
  minExplorerPx: number
}

/** The corrected panel widths, or null when no correction is needed/possible. */
export interface WidthCorrection {
  previewPx: number
  explorerPx: number
}

/**
 * Enforce the raised chat floor against the live grid geometry. The preview
 * region yields first (it is on-demand), then the explorer. Returns null when
 * chat already meets the floor, when nothing is open, or when the container
 * is too narrow to satisfy the floor without violating the panels' own
 * minimums ("where feasible" — the guard yields instead of fighting).
 */
export function correctPanelWidths(geometry: WidthGeometry, chatFloor: number = CHAT_FLOOR_PX): WidthCorrection | null {
  const { frameWidth, sidebarPx, detailsPx, minPreviewPx, minExplorerPx } = geometry
  let { previewPx, explorerPx } = geometry
  if (frameWidth <= 0) return null
  if (previewPx <= 0 && explorerPx <= 0) return null
  const chat = frameWidth - sidebarPx - detailsPx - previewPx - explorerPx
  let deficit = chatFloor - chat
  if (deficit <= 0) return null

  if (previewPx > 0 && deficit > 0) {
    const floor = previewPx >= minPreviewPx ? minPreviewPx : previewPx
    const target = Math.max(floor, previewPx - deficit)
    deficit -= previewPx - target
    previewPx = target
  }
  if (explorerPx > 0 && deficit > 0) {
    const floor = explorerPx >= minExplorerPx ? minExplorerPx : explorerPx
    const target = Math.max(floor, explorerPx - deficit)
    deficit -= explorerPx - target
    explorerPx = target
  }
  // Not feasible: the container cannot meet the floor within the panels'
  // minimums — leave the panel system's own layout alone.
  if (deficit > 0) return null
  return { previewPx, explorerPx }
}
