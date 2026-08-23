/**
 * Pure directory-tree helpers for the Workbench Files tab: shared between the
 * browser panel and tests, free of DOM, fetch, and fs.
 * @module dsh-workbench/core/files-tree
 */

export interface FileTreeNode {
  readonly name: string
  /** Workspace-relative path using `/` separators. */
  readonly path: string
  readonly kind: 'file' | 'directory'
  readonly children?: readonly FileTreeNode[]
}

/** Git status letters shown on file rows. */
export type FileStatusState = 'modified' | 'created' | 'deleted' | 'untracked'

export const FILE_STATUS_BADGE: Record<FileStatusState, string> = {
  modified: 'M',
  created: 'A',
  deleted: 'D',
  untracked: '?',
}

/**
 * Keep only nodes whose own name matches `query` (case-insensitive) or that
 * have a matching descendant. Directories keep their filtered children so the
 * path to each match stays visible.
 */
export function filterFileTree(nodes: readonly FileTreeNode[], query: string): FileTreeNode[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...nodes]
  const walk = (list: readonly FileTreeNode[]): FileTreeNode[] => {
    const kept: FileTreeNode[] = []
    for (const node of list) {
      const children = node.children === undefined ? undefined : walk(node.children)
      if (node.name.toLowerCase().includes(needle) || (children !== undefined && children.length > 0)) {
        kept.push(children === undefined ? node : { ...node, children })
      }
    }
    return kept
  }
  return walk(nodes)
}

/** Convert a git-status route payload into a workspace-relative path → state map. */
export function fileStatusMapOf(value: {
  staged?: readonly { path: string; state: string }[]
  unstaged?: readonly { path: string; state: string }[]
  untracked?: readonly { path: string; state: string }[]
} | null | undefined): Map<string, FileStatusState> {
  const map = new Map<string, FileStatusState>()
  if (value === null || value === undefined) return map
  const put = (rows: readonly { path: string; state: string }[] | undefined): void => {
    for (const row of rows ?? []) {
      const state = row.state
      if (state === 'modified' || state === 'created' || state === 'deleted' || state === 'untracked') {
        map.set(row.path.split('\\').join('/'), state)
      }
    }
  }
  put(value.staged)
  put(value.unstaged)
  put(value.untracked)
  return map
}
