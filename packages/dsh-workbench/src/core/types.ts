/**
 * Shared types of the workbench overview: structural (never imported from the
 * SDK at the value level) so the core stays dependency-free and both the
 * browser half and the tests compile it standalone. Every section models its
 * own availability: a missing service or a missing optional panel is an
 * explicit unavailable state, never a silent blank.
 * @module dsh-workbench/core/types
 */

/** Coarse session run status shown in the status bar and the overview. */
export type SessionStatus = 'running' | 'attention' | 'idle'

/** Why a section has no data (rendered through the locale dictionary). */
export type UnavailableReason = 'noSession' | 'noService' | 'noData' | 'error'

/** One overview section: a value, an empty state, or an explicit unavailable state. */
export type SectionState<T> =
  | { kind: 'ready'; value: T }
  | { kind: 'empty' }
  | { kind: 'unavailable'; reason: UnavailableReason }

/** Goal summary (structural subset of the host `goal` projection value). */
export interface GoalSummary {
  objective: string
  phase: string
  roundsStarted: number
  maxGoalRounds: number
}

/** Todo progress reduced from the latest `todo/write` payload. */
export interface TodoSummary {
  done: number
  total: number
  /** Contents of the first unfinished items (display cap applied upstream). */
  next: string[]
}

/** One background job row (structural subset of the wire JobView). */
export interface JobRow {
  id: string
  kind: string
  label: string
  status: string
  detail?: string
}

/** One subagent row derived from the session list. */
export interface SubagentRow {
  id: string
  title: string
  running: boolean
}

/** One Agent Preset row returned by the official catalog API. */
export interface ExpertPresetRow {
  id: string
  name: string
  description?: string
  trust: 'system' | 'user'
  isDefault: boolean
  broken: boolean
}

/** One Skill row returned for the current session's project. */
export interface ExpertSkillRow {
  name: string
  description: string
  modelInvocable: boolean
}

/** Read-only expert catalog for the current deployment and project. */
export interface ExpertCatalog {
  presets: ExpertPresetRow[]
  skills: ExpertSkillRow[]
}

/** One session row shown in the Agent context panel. */
export interface AgentSessionRow {
  id: string
  title: string
  cwd: string
  running: boolean
  attention: boolean
}

/** Live provider-neutral token and throughput snapshot. */
export interface TokenUsageSummary {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimated: boolean
  tokensPerSecond?: number
}

/** One recent tool call row. */
export interface RecentToolRow {
  name: string
  time: number
  state: 'running' | 'done' | 'error'
}

/** Git summary reduced from the Workbench read-only git-status payload. */
export interface GitSummary {
  branch: string
  staged: number
  unstaged: number
  untracked: number
}

/** The full overview snapshot the Overview tab renders. */
export interface OverviewSnapshot {
  /** Project root (the current session's cwd); '' when no session is bound. */
  root: string
  /** Project display name (basename of the root); '' when no root. */
  projectName: string
  /** Current session title; '' when no session is selected. */
  sessionTitle: string
  status: SessionStatus
  /** Agent preset the session runs; undefined when the deployment has none. */
  agentPreset: string | undefined
  agentSessions: SectionState<AgentSessionRow[]>
  expertCatalog: SectionState<ExpertCatalog>
  tokenUsage: SectionState<TokenUsageSummary>
  goal: SectionState<GoalSummary>
  todos: SectionState<TodoSummary>
  jobs: SectionState<JobRow[]>
  subagents: SectionState<SubagentRow[]>
  recentTools: SectionState<RecentToolRow[]>
  git: SectionState<GitSummary | null>
}

/** The empty overview snapshot (no session selected yet). */
export const EMPTY_OVERVIEW: OverviewSnapshot = {
  root: '',
  projectName: '',
  sessionTitle: '',
  status: 'idle',
  agentPreset: undefined,
  agentSessions: { kind: 'unavailable', reason: 'noSession' },
  expertCatalog: { kind: 'unavailable', reason: 'noSession' },
  tokenUsage: { kind: 'unavailable', reason: 'noSession' },
  goal: { kind: 'unavailable', reason: 'noSession' },
  todos: { kind: 'unavailable', reason: 'noSession' },
  jobs: { kind: 'unavailable', reason: 'noSession' },
  subagents: { kind: 'unavailable', reason: 'noSession' },
  recentTools: { kind: 'unavailable', reason: 'noSession' },
  git: { kind: 'unavailable', reason: 'noSession' },
}

/** Per-project persisted workbench UI state (localStorage). */
export interface WorkbenchUiState {
  /** Compatibility marker retained for downgrade to the AionUI-backed release. */
  overviewActive: boolean
  /** Workbench-owned right-sidebar component selected for this project. */
  activeRightPanel: string
}

/** Default per-project UI state. */
export const DEFAULT_UI_STATE: WorkbenchUiState = { overviewActive: false, activeRightPanel: 'workbench:overview' }
