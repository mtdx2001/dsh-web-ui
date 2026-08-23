/**
 * Workbench Changes tab: staged / unstaged / untracked groups over the
 * package-owned git-status route, with per-row write actions through the
 * policy-enforcing git-changes route. Clicking a file shows a bounded unified
 * diff inside the same content area with a back button. Every successful
 * write re-reads the host status; there are no optimistic list updates.
 * Discard and untracked delete require explicit confirmation. Conflict rows
 * render without write buttons. No bulk discard anywhere.
 * @module dsh-workbench/client/ChangesPanel
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { WorkbenchStores } from '../core/store.ts'
import { useStore } from './hooks/useStore.ts'
import { createChangesApi, type ChangeRow, type ChangesApi, type ChangesStatusPayload } from './changes-api.ts'
import { t } from './locales.ts'
import { BackIcon, BranchIcon, FileIcon, RefreshIcon } from './icons.tsx'
import styles from './changes-panel.module.css'

export interface ChangesPanelProps {
  readonly stores: WorkbenchStores
  /** Injectable for tests; defaults to the fetch-backed client. */
  readonly api?: ChangesApi
}

type GroupKind = 'staged' | 'unstaged' | 'untracked'

interface GroupsState {
  readonly kind: 'loading' | 'error' | 'unavailable' | 'ready'
  readonly branch: string
  readonly staged: readonly ChangeRow[]
  readonly unstaged: readonly ChangeRow[]
  readonly untracked: readonly ChangeRow[]
}

type DiffView =
  | { path: string; kind: 'loading' }
  | { path: string; kind: 'error'; error: string }
  | { path: string; kind: 'ready'; content: string; truncated: boolean }

const EMPTY: GroupsState = { kind: 'loading', branch: '', staged: [], unstaged: [], untracked: [] }

function noticeKey(error: string): 'changes.notice.conflict' | 'changes.notice.forbidden' | 'changes.notice.timeout' | 'changes.notice.unavailable' | 'changes.notice.failed' {
  if (error === 'conflict-forbidden') return 'changes.notice.conflict'
  if (error === 'staged-discard-forbidden' || error === 'not-staged' || error === 'not-unstaged' || error === 'no-changes') return 'changes.notice.forbidden'
  if (error === 'timeout') return 'changes.notice.timeout'
  if (error === 'git-unavailable') return 'changes.notice.unavailable'
  return 'changes.notice.failed'
}

export function ChangesPanel({ stores, api }: ChangesPanelProps): JSX.Element {
  const client = useMemo(() => api ?? createChangesApi(), [api])
  const root = useStore(stores.overview).root
  const [groups, setGroups] = useState<GroupsState>(EMPTY)
  const [diffView, setDiffView] = useState<DiffView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const generation = useRef(0)
  const diffGeneration = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => () => {
    mounted.current = false
    abortRef.current?.abort()
  }, [])

  const refresh = async (): Promise<void> => {
    const current = generation.current + 1
    generation.current = current
    diffGeneration.current += 1
    setDiffView(null)
    setNotice(null)
    setBusy(null)
    if (root === '') { setGroups({ ...EMPTY, kind: 'error' }); return }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setGroups((prev) => ({ ...EMPTY, kind: prev.kind === 'ready' ? prev.kind : 'loading' }))
    const status: ChangesStatusPayload | null | undefined = await client.status(root, controller.signal).catch(() => undefined)
    if (!mounted.current || generation.current !== current) return
    setGroups(status === undefined
      ? { ...EMPTY, kind: 'error' }
      : status === null
        ? { ...EMPTY, kind: 'unavailable' }
        : { kind: 'ready', branch: status.branch, staged: status.staged, unstaged: status.unstaged, untracked: status.untracked })
  }

  useEffect(() => { void refresh() }, [root])

  const openDiff = async (path: string): Promise<void> => {
    const current = diffGeneration.current + 1
    diffGeneration.current = current
    setDiffView({ path, kind: 'loading' })
    const outcome = await client.diff(root, path).catch(() => ({ ok: false as const, error: 'read-failed' }))
    if (!mounted.current || diffGeneration.current !== current) return
    setDiffView(outcome.ok
      ? { path, kind: 'ready', content: outcome.value.content, truncated: outcome.value.truncated }
      : { path, kind: 'error', error: outcome.error })
  }

  const runWrite = async (op: 'stage' | 'unstage' | 'discard', group: GroupKind, path: string): Promise<void> => {
    if (busy !== null) return
    const current = generation.current
    const writeRoot = root
    if (op === 'discard') {
      const key = group === 'untracked' ? 'changes.confirm.delete' : 'changes.confirm.discard'
      if (!window.confirm(t(key, { path }))) return
    }
    setBusy(`${op}:${path}`)
    setNotice(null)
    const outcome = await (op === 'stage' ? client.stage(writeRoot, path) : op === 'unstage' ? client.unstage(writeRoot, path) : client.discard(writeRoot, path))
      .catch(() => ({ ok: false as const, error: 'read-failed' }))
    if (!mounted.current || generation.current !== current) return
    setBusy(null)
    if (!outcome.ok) { setNotice(outcome.error); return }
    await refresh()
  }

  const closeDiff = (): void => {
    diffGeneration.current += 1
    setDiffView(null)
  }

  if (diffView !== null) {
    return (
      <div className={styles.panel} data-dsh-workbench-changes>
        <div className={styles.toolbar}>
          <button type="button" className={styles.tool} onClick={closeDiff} title={t('changes.diff.back')} aria-label={t('changes.diff.back')}>
            <BackIcon />
          </button>
          <span className={styles.diffPath} title={diffView.path}>{diffView.path}</span>
        </div>
        {diffView.kind === 'loading' && <div className={styles.state}>{t('changes.loading')}</div>}
        {diffView.kind === 'error' && <div className={styles.state}>{t(noticeKey(diffView.error))}</div>}
        {diffView.kind === 'ready' && (
          <>
            {diffView.truncated && <div className={styles.notice}>{t('changes.diff.truncated')}</div>}
            {diffView.content === '' && <div className={styles.state}>{t('changes.diff.empty')}</div>}
            {diffView.content !== '' && <pre className={styles.diff}>{diffView.content}</pre>}
          </>
        )}
      </div>
    )
  }

  const renderRow = (group: GroupKind, row: ChangeRow): JSX.Element => {
    const conflicted = row.state === 'conflicted'
    return (
      <div key={`${group}:${row.path}`} className={styles.rowWrap}>
        <button
          type="button"
          className={styles.row}
          title={row.path}
          onClick={() => { void openDiff(row.path) }}
        >
          <FileIcon />
          <span className={styles.rowName}>{row.path}</span>
          {conflicted && <span className={styles.badge}>{t('changes.state.conflicted')}</span>}
        </button>
        {!conflicted && (
          <span className={styles.actions}>
            {(group === 'unstaged' || group === 'untracked') && (
              <button type="button" className={styles.action} disabled={busy !== null}
                onClick={() => { void runWrite('stage', group, row.path) }}>{t('changes.action.stage')}</button>
            )}
            {group === 'staged' && (
              <button type="button" className={styles.action} disabled={busy !== null}
                onClick={() => { void runWrite('unstage', group, row.path) }}>{t('changes.action.unstage')}</button>
            )}
            {((group === 'unstaged' && row.state !== 'partially-staged') || group === 'untracked') && (
              <button type="button" className={styles.actionDanger} disabled={busy !== null}
                onClick={() => { void runWrite('discard', group, row.path) }}>
                {group === 'untracked' ? t('changes.action.delete') : t('changes.action.discard')}
              </button>
            )}
          </span>
        )}
      </div>
    )
  }

  const renderGroup = (group: GroupKind, rows: readonly ChangeRow[]): JSX.Element | null => {
    if (rows.length === 0) return null
    return (
      <section key={group} className={styles.group} data-group={group}>
        <h3 className={styles.groupTitle}>{t(`changes.group.${group}`)}<span className={styles.count}>{rows.length}</span></h3>
        {rows.map((row) => renderRow(group, row))}
      </section>
    )
  }

  const total = groups.staged.length + groups.unstaged.length + groups.untracked.length

  return (
    <div className={styles.panel} data-dsh-workbench-changes>
      <div className={styles.toolbar}>
        <span className={styles.branch} title={groups.branch}><BranchIcon />{groups.branch}</span>
        <button type="button" className={styles.tool} onClick={() => void refresh()} title={t('changes.refresh')} aria-label={t('changes.refresh')}>
          <RefreshIcon />
        </button>
      </div>
      {notice !== null && <div className={styles.notice}>{t(noticeKey(notice))}</div>}
      {root === '' && <div className={styles.state}>{t('changes.noSession')}</div>}
      {root !== '' && groups.kind === 'loading' && <div className={styles.state}>{t('changes.loading')}</div>}
      {root !== '' && groups.kind === 'error' && <div className={styles.state}>{t('changes.error')}</div>}
      {root !== '' && groups.kind === 'unavailable' && <div className={styles.state}>{t('changes.notRepository')}</div>}
      {root !== '' && groups.kind === 'ready' && total === 0 && <div className={styles.state}>{t('changes.empty')}</div>}
      {root !== '' && groups.kind === 'ready' && total > 0 && (
        <div className={styles.list}>
          {renderGroup('staged', groups.staged)}
          {renderGroup('unstaged', groups.unstaged)}
          {renderGroup('untracked', groups.untracked)}
        </div>
      )}
    </div>
  )
}
