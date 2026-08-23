/**
 * Browser-side client for the package-owned read-only files and git-status
 * routes. Injectable so the panel and tests never touch fetch directly.
 * @module dsh-workbench/client/files-api
 */

export interface FilesApiListResult {
  readonly entries: readonly { name: string; kind: 'file' | 'directory' }[]
  readonly truncated: boolean
}

export interface FilesApiReadResult {
  readonly kind: 'text'
  readonly content: string
}

export interface GitStatusPayload {
  readonly staged: readonly { path: string; state: string }[]
  readonly unstaged: readonly { path: string; state: string }[]
  readonly untracked: readonly { path: string; state: string }[]
}

export type FilesApiOutcome<T> = { ok: true; value: T } | { ok: false; error: string }

export interface FilesApi {
  list(root: string, rel: string, signal?: AbortSignal): Promise<FilesApiOutcome<FilesApiListResult>>
  read(root: string, rel: string, signal?: AbortSignal): Promise<FilesApiOutcome<FilesApiReadResult>>
  gitStatus(root: string, signal?: AbortSignal): Promise<GitStatusPayload | null>
}

type FetchLike = (input: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

/** Create the default fetch-backed API client. */
export function createFilesApi(fetchImpl: FetchLike = fetch.bind(globalThis) as FetchLike): FilesApi {
  const post = async <T>(url: string, body: unknown, signal?: AbortSignal): Promise<FilesApiOutcome<T>> => {
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
      return response.ok ? payload as FilesApiOutcome<T> : { ok: false, error: 'read-failed' }
    } catch {
      return { ok: false, error: 'read-failed' }
    }
  }
  return {
    list: (root, rel, signal) => post('/dsh-workbench/files', { op: 'list', root, path: rel }, signal),
    read: async (root, rel, signal) => {
      const outcome = await post<{ kind: 'text'; content: string; truncated: boolean }>(
        '/dsh-workbench/files', { op: 'read', root, path: rel }, signal,
      )
      if (!outcome.ok) return outcome
      return { ok: true, value: { kind: 'text', content: outcome.value.content } }
    },
    gitStatus: async (root, signal) => {
      const outcome = await post<GitStatusPayload | null>('/dsh-workbench/git-status', { root }, signal)
      return outcome.ok ? outcome.value : null
    },
  }
}
