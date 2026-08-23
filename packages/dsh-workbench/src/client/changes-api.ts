/**
 * Browser-side client for the package-owned git-status and git-changes
 * routes. Injectable so the panel and tests never touch fetch directly.
 * Responses are structurally validated and bounded before use.
 * @module dsh-workbench/client/changes-api
 */

export interface ChangeRow {
  readonly path: string
  readonly state: string
}

export interface ChangesStatusPayload {
  readonly root: string
  readonly branch: string
  readonly staged: readonly ChangeRow[]
  readonly unstaged: readonly ChangeRow[]
  readonly untracked: readonly ChangeRow[]
}

export interface ChangesDiffResult {
  readonly content: string
  readonly truncated: boolean
}

export type ChangesApiOutcome<T> = { ok: true; value: T } | { ok: false; error: string }

export interface ChangesApi {
  /** null means the admitted workspace is not a Git repository; undefined means the request failed. */
  status(root: string, signal?: AbortSignal): Promise<ChangesStatusPayload | null | undefined>
  diff(root: string, path: string, signal?: AbortSignal): Promise<ChangesApiOutcome<ChangesDiffResult>>
  stage(root: string, path: string, signal?: AbortSignal): Promise<ChangesApiOutcome<Record<string, never>>>
  unstage(root: string, path: string, signal?: AbortSignal): Promise<ChangesApiOutcome<Record<string, never>>>
  discard(root: string, path: string, signal?: AbortSignal): Promise<ChangesApiOutcome<Record<string, never>>>
}

type FetchLike = (input: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

const MAX_ROWS = 5_000
const MAX_PATH_CHARS = 4096
const MAX_DIFF_CHARS = 1024 * 1024

function isRow(value: unknown): value is ChangeRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as { path?: unknown; state?: unknown }
  return typeof row.path === 'string' && row.path.length <= MAX_PATH_CHARS && typeof row.state === 'string'
}

function rowsOf(value: unknown): ChangeRow[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rows = value.slice(0, MAX_ROWS)
  return rows.every(isRow) ? rows.map((row) => ({ path: row.path, state: row.state })) : undefined
}

/** Validate and bound one status payload; returns null on any shape violation. */
export function sanitizeStatus(value: unknown): ChangesStatusPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const status = value as Partial<ChangesStatusPayload>
  const staged = rowsOf(status.staged)
  const unstaged = rowsOf(status.unstaged)
  const untracked = rowsOf(status.untracked)
  if (staged === undefined || unstaged === undefined || untracked === undefined) return null
  return {
    root: typeof status.root === 'string' ? status.root : '',
    branch: typeof status.branch === 'string' ? status.branch : 'HEAD',
    staged, unstaged, untracked,
  }
}

/** Create the default fetch-backed API client. */
export function createChangesApi(fetchImpl: FetchLike = fetch.bind(globalThis) as FetchLike): ChangesApi {
  const post = async <T>(url: string, body: unknown, signal?: AbortSignal): Promise<ChangesApiOutcome<T>> => {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      })
      const payload = await response.json() as unknown
      if (typeof payload !== 'object' || payload === null || typeof (payload as { ok?: unknown }).ok !== 'boolean') {
        return { ok: false, error: 'read-failed' }
      }
      if ((payload as { ok: boolean }).ok === false) {
        const error = (payload as { error?: unknown }).error
        return { ok: false, error: typeof error === 'string' ? error : 'read-failed' }
      }
      return response.ok ? payload as ChangesApiOutcome<T> : { ok: false, error: 'read-failed' }
    } catch {
      return { ok: false, error: 'read-failed' }
    }
  }
  const write = (op: 'stage' | 'unstage' | 'discard') =>
    (root: string, path: string, signal?: AbortSignal): Promise<ChangesApiOutcome<Record<string, never>>> =>
      post('/dsh-workbench/git-changes', { op, root, path }, signal)
  return {
    status: async (root, signal) => {
      const outcome = await post<ChangesStatusPayload | null>('/dsh-workbench/git-status', { root }, signal)
      if (!outcome.ok) return undefined
      if (outcome.value === null) return null
      return sanitizeStatus(outcome.value) ?? undefined
    },
    diff: async (root, path, signal) => {
      const outcome = await post<{ content?: unknown; truncated?: unknown }>('/dsh-workbench/git-changes', { op: 'diff', root, path }, signal)
      if (!outcome.ok) return outcome
      const content = typeof outcome.value.content === 'string' ? outcome.value.content.slice(0, MAX_DIFF_CHARS) : ''
      return { ok: true, value: { content, truncated: outcome.value.truncated === true } }
    },
    stage: write('stage'),
    unstage: write('unstage'),
    discard: write('discard'),
  }
}
