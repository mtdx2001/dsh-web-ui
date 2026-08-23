/**
 * Workbench Files tab: a single-column directory tree over the current
 * session workspace, backed by the package-owned read-only files route. The
 * toolbar holds only search, refresh, and collapse-all; clicking a file opens
 * a read-only preview inside the same content region with back + breadcrumb.
 * No editing, staging, or layout ownership.
 * @module dsh-workbench/client/FilesPanel
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { WorkbenchStores } from '../core/store.ts'
import {
  FILE_STATUS_BADGE, fileStatusMapOf, filterFileTree,
  type FileStatusState, type FileTreeNode,
} from '../core/files-tree.ts'
import { useStore } from './hooks/useStore.ts'
import { createFilesApi, type FilesApi } from './files-api.ts'
import { t } from './locales.ts'
import { BackIcon, ChevronIcon, CollapseAllIcon, FileIcon, FolderIcon, RefreshIcon } from './icons.tsx'
import styles from './files-panel.module.css'

export interface FilesPanelProps {
  readonly stores: WorkbenchStores
  /** Injectable for tests; defaults to the fetch-backed client. */
  readonly api?: FilesApi
}

interface TreeState {
  readonly kind: 'loading' | 'error' | 'ready'
  readonly nodes: readonly FileTreeNode[]
}

const ROOT_PATH = ''

export function FilesPanel({ stores, api }: FilesPanelProps): JSX.Element {
  const client = useMemo(() => api ?? createFilesApi(), [api])
  const root = useStore(stores.overview).root
  const [tree, setTree] = useState<TreeState>({ kind: 'loading', nodes: [] })
  const [children, setChildren] = useState<ReadonlyMap<string, readonly FileTreeNode[]>>(new Map())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const [statuses, setStatuses] = useState<ReadonlyMap<string, FileStatusState>>(new Map())
  const [truncatedDirs, setTruncatedDirs] = useState<ReadonlySet<string>>(new Set())
  const [preview, setPreview] = useState<{ path: string; kind: 'loading' | 'error'; error?: string } | { path: string; kind: 'ready'; content: string } | null>(null)
  const generation = useRef(0)
  const previewGeneration = useRef(0)

  const loadDir = async (rel: string): Promise<readonly FileTreeNode[] | undefined> => {
    const outcome = await client.list(root, rel)
    if (!outcome.ok) return undefined
    setTruncatedDirs((prev) => {
      const next = new Set(prev)
      if (outcome.value.truncated) next.add(rel)
      else next.delete(rel)
      return next
    })
    return outcome.value.entries.map((entry) => ({
      name: entry.name,
      path: rel === '' ? entry.name : `${rel}/${entry.name}`,
      kind: entry.kind,
    }))
  }

  const refresh = async (): Promise<void> => {
    if (root === '') { setTree({ kind: 'error', nodes: [] }); return }
    const current = generation.current + 1
    generation.current = current
    setTree({ kind: 'loading', nodes: [] })
    setChildren(new Map())
    setExpanded(new Set())
    setTruncatedDirs(new Set())
    previewGeneration.current += 1
    setPreview(null)
    const [nodes, status] = await Promise.all([loadDir(ROOT_PATH), client.gitStatus(root).catch(() => null)])
    if (generation.current !== current) return
    setStatuses(fileStatusMapOf(status))
    setTree(nodes === undefined ? { kind: 'error', nodes: [] } : { kind: 'ready', nodes })
  }

  useEffect(() => { void refresh() }, [root])

  const toggleDir = async (node: FileTreeNode): Promise<void> => {
    const current = generation.current
    if (expanded.has(node.path)) {
      setExpanded((prev) => { const next = new Set(prev); next.delete(node.path); return next })
      return
    }
    if (!children.has(node.path)) {
      const loaded = await loadDir(node.path)
      if (loaded === undefined || generation.current !== current) return
      setChildren((prev) => new Map(prev).set(node.path, loaded))
    }
    setExpanded((prev) => new Set(prev).add(node.path))
  }

  const openFile = async (node: FileTreeNode): Promise<void> => {
    const current = previewGeneration.current + 1
    previewGeneration.current = current
    setPreview({ path: node.path, kind: 'loading' })
    const outcome = await client.read(root, node.path)
    if (previewGeneration.current !== current) return
    setPreview(outcome.ok
      ? { path: node.path, kind: 'ready', content: outcome.value.content }
      : { path: node.path, kind: 'error', error: outcome.error })
  }

  const renderNodes = (nodes: readonly FileTreeNode[], depth: number, forceOpen: boolean): JSX.Element[] =>
    nodes.map((node) => {
      const open = forceOpen || expanded.has(node.path)
      const status = statuses.get(node.path)
      const rowChildren = node.kind === 'directory'
        ? (forceOpen ? node.children : children.get(node.path))
        : undefined
      return (
        <div key={node.path}>
          <button
            type="button"
            className={styles.row}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            title={node.path}
            onClick={() => { if (node.kind === 'directory') void toggleDir(node); else void openFile(node) }}
          >
            {node.kind === 'directory'
              ? <><ChevronIcon open={open} /><FolderIcon /></>
              : <><span className={styles.chevronSpacer} /><FileIcon /></>}
            <span className={styles.rowName}>{node.name}</span>
            {node.kind === 'file' && status !== undefined && (
              <span className={styles.status} title={t(`files.status.${status}`)}>{FILE_STATUS_BADGE[status]}</span>
            )}
          </button>
          {node.kind === 'directory' && open && rowChildren !== undefined && rowChildren.length > 0 && (
            <div>{renderNodes(rowChildren, depth + 1, forceOpen)}</div>
          )}
        </div>
      )
    })

  if (preview !== null) {
    const segments = preview.path.split('/')
    return (
      <div className={styles.panel} data-dsh-workbench-files>
        <div className={styles.toolbar}>
          <button type="button" className={styles.tool} onClick={() => { previewGeneration.current += 1; setPreview(null) }} title={t('files.preview.back')} aria-label={t('files.preview.back')}>
            <BackIcon />
          </button>
          <nav className={styles.breadcrumb} aria-label={preview.path}>
            {segments.map((segment, index) => (
              <span key={index} className={styles.crumb} title={segment}>{index > 0 ? `/${segment}` : segment}</span>
            ))}
          </nav>
        </div>
        {preview.kind === 'loading' && <div className={styles.state}>{t('files.loading')}</div>}
        {preview.kind === 'error' && (
          <div className={styles.state}>
            {preview.error === 'binary' ? t('files.preview.binary')
              : preview.error === 'too-large' ? t('files.preview.tooLarge')
                : t('files.preview.error')}
          </div>
        )}
        {preview.kind === 'ready' && <pre className={styles.preview}>{preview.content}</pre>}
      </div>
    )
  }

  const searching = query.trim() !== ''
  const visible = searching && tree.kind === 'ready' ? filterFileTree(withLoadedChildren(tree.nodes, children), query) : tree.nodes

  return (
    <div className={styles.panel} data-dsh-workbench-files>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          value={query}
          placeholder={t('files.toolbar.search')}
          aria-label={t('files.toolbar.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className={styles.tool} onClick={() => void refresh()} title={t('files.toolbar.refresh')} aria-label={t('files.toolbar.refresh')}>
          <RefreshIcon />
        </button>
        <button type="button" className={styles.tool} onClick={() => setExpanded(new Set())} title={t('files.toolbar.collapseAll')} aria-label={t('files.toolbar.collapseAll')}>
          <CollapseAllIcon />
        </button>
      </div>
      {root === '' && <div className={styles.state}>{t('files.noSession')}</div>}
      {root !== '' && tree.kind === 'loading' && <div className={styles.state}>{t('files.loading')}</div>}
      {root !== '' && tree.kind === 'error' && <div className={styles.state}>{t('files.error')}</div>}
      {root !== '' && tree.kind === 'ready' && tree.nodes.length === 0 && <div className={styles.state}>{t('files.empty')}</div>}
      {root !== '' && tree.kind === 'ready' && truncatedDirs.size > 0 && <div className={styles.notice}>{t('files.truncated')}</div>}
      {root !== '' && tree.kind === 'ready' && tree.nodes.length > 0 && visible.length === 0 && (
        <div className={styles.state}>{t('files.searchEmpty')}</div>
      )}
      {root !== '' && tree.kind === 'ready' && visible.length > 0 && (
        <div className={styles.tree} role="tree">{renderNodes(visible, 0, searching)}</div>
      )}
    </div>
  )
}

/** Attach lazily loaded children into a tree snapshot for search filtering. */
function withLoadedChildren(
  nodes: readonly FileTreeNode[],
  loaded: ReadonlyMap<string, readonly FileTreeNode[]>,
): FileTreeNode[] {
  return nodes.map((node) => {
    const children = node.kind === 'directory' ? loaded.get(node.path) : undefined
    return children === undefined ? node : { ...node, children: withLoadedChildren(children, loaded) }
  })
}
