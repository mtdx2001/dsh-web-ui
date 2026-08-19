/**
 * The Overview tab content: compact flat sections (project, session, goal,
 * todos, background jobs, subagents, recent tools, git) with explicit
 * unavailable states. No nested cards, no decoration — grouped rows separated
 * by hairlines, per the workbench phase-1 spec.
 * @module dsh-workbench/client/OverviewPanel
 */

import type { JSX, ReactNode } from 'react'
import type { WorkbenchStores } from '../core/store.ts'
import type { SectionState } from '../core/types.ts'
import { useStore } from './hooks/useStore.ts'
import { t, type WorkbenchKey } from './locales.ts'
import {
  BranchIcon, ClockIcon, FolderIcon, ListChecksIcon, MessageIcon, TargetIcon, WrenchIcon,
} from './icons.tsx'
import css from './styles/workbench.module.css'

/** One section frame: icon header + body. */
function Section({ icon, title, children }: { icon: JSX.Element; title: string; children: ReactNode }): JSX.Element {
  return (
    <div className={css.section}>
      <div className={css.sectionHeader}>{icon}<span>{title}</span></div>
      {children}
    </div>
  )
}

/** Render one section's state: value rows, an empty line, or an unavailable line. */
function SectionBody<T>({
  state,
  emptyKey,
  render,
}: {
  state: SectionState<T>
  emptyKey: WorkbenchKey
  render: (value: T) => ReactNode
}): JSX.Element {
  if (state.kind === 'unavailable') {
    return <div className={css.muted}>{t(`overview.unavailable.${state.reason}`)}</div>
  }
  if (state.kind === 'empty') {
    return <div className={css.muted}>{t(emptyKey)}</div>
  }
  return <>{render(state.value)}</>
}

/** Format an epoch-ms time as HH:MM (best-effort, locale-free). */
function timeOf(epoch: number): string {
  if (epoch <= 0) return ''
  const date = new Date(epoch)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Localized goal phase label (unknown phases render raw). */
function goalPhaseLabel(phase: string): string {
  const key = `overview.goal.phase.${phase}` as WorkbenchKey
  const known: readonly string[] = [
    'overview.goal.phase.active', 'overview.goal.phase.paused',
    'overview.goal.phase.blocked', 'overview.goal.phase.complete',
  ]
  return known.includes(key) ? t(key) : phase
}

/** The overview panel body. */
export function OverviewPanel({ stores }: { stores: WorkbenchStores }): JSX.Element {
  const o = useStore(stores.overview)

  return (
    <>
      <Section icon={<FolderIcon />} title={t('overview.section.project')}>
        <div className={css.row}>
          <span className={css.rowValue}>{o.projectName === '' ? t('overview.unavailable.noSession') : o.projectName}</span>
        </div>
        {o.root !== '' && (
          <div className={css.row}>
            <span className={`${css.rowValue} ${css.mono} ${css.muted}`} title={o.root}>{o.root}</span>
          </div>
        )}
      </Section>

      <Section icon={<MessageIcon />} title={t('overview.section.session')}>
        {o.sessionTitle === '' ? (
          <div className={css.muted}>{t('overview.unavailable.noSession')}</div>
        ) : (
          <>
            <div className={css.row}>
              <span className={css.rowValue}>{o.sessionTitle}</span>
              <span className={css.rowMeta}>{t(`status.${o.status}`)}</span>
            </div>
            {o.agentPreset !== undefined && o.agentPreset !== '' && (
              <div className={css.row}>
                <span className={`${css.rowValue} ${css.muted}`}>{o.agentPreset}</span>
              </div>
            )}
          </>
        )}
      </Section>

      <Section icon={<TargetIcon />} title={t('overview.section.goal')}>
        <SectionBody state={o.goal} emptyKey="overview.empty.goal" render={(goal) => (
          <>
            <div className={css.row}>
              <span className={css.rowValueWrap}>{goal.objective}</span>
            </div>
            <div className={css.row}>
              <span className={css.badge}>{goalPhaseLabel(goal.phase)}</span>
              {goal.maxGoalRounds > 0 && (
                <span className={css.rowMeta}>
                  {t('overview.goal.rounds', { rounds: goal.roundsStarted, max: goal.maxGoalRounds })}
                </span>
              )}
            </div>
          </>
        )} />
      </Section>

      <Section icon={<ListChecksIcon />} title={t('overview.section.todos')}>
        <SectionBody state={o.todos} emptyKey="overview.empty.todos" render={(todos) => (
          <>
            <div className={css.row}>
              <span className={css.rowValue}>{t('overview.todos.progress', { done: todos.done, total: todos.total })}</span>
            </div>
            <div className={css.progressTrack}>
              <div
                className={css.progressFill}
                style={{ width: todos.total === 0 ? '0%' : `${Math.round((todos.done / todos.total) * 100)}%` }}
              />
            </div>
            {todos.next.map((item) => (
              <div className={css.row} key={item}>
                <span className={`${css.rowValue} ${css.muted}`}>{item}</span>
              </div>
            ))}
          </>
        )} />
      </Section>

      <Section icon={<ClockIcon />} title={t('overview.section.jobs')}>
        <SectionBody state={o.jobs} emptyKey="overview.empty.jobs" render={(jobs) => (
          jobs.length === 0 ? <div className={css.muted}>{t('overview.empty.jobs')}</div> : jobs.map((job) => (
            <div className={css.row} key={job.id}>
              <span className={job.status === 'running' || job.status === 'stopping'
                ? css.badgeRunning
                : job.status === 'failed'
                  ? css.badgeError
                  : css.badge}
              >
                {job.kind}
              </span>
              <span className={css.rowValue} title={job.detail ?? job.label}>{job.label}</span>
            </div>
          ))
        )} />
      </Section>

      <Section icon={<BranchIcon />} title={t('overview.section.subagents')}>
        <SectionBody state={o.subagents} emptyKey="overview.empty.subagents" render={(rows) => (
          rows.length === 0 ? <div className={css.muted}>{t('overview.empty.subagents')}</div> : rows.map((row) => (
            <div className={css.row} key={row.id}>
              <span className={css.rowValue}>{row.title}</span>
              {row.running && <span className={css.rowMeta}>{t('status.running')}</span>}
            </div>
          ))
        )} />
      </Section>

      <Section icon={<WrenchIcon />} title={t('overview.section.recentTools')}>
        <SectionBody state={o.recentTools} emptyKey="overview.empty.recentTools" render={(tools) => (
          tools.length === 0 ? <div className={css.muted}>{t('overview.empty.recentTools')}</div> : tools.map((tool, index) => (
            <div className={css.row} key={`${tool.name}-${tool.time}-${index}`}>
              <span className={`${css.rowValue} ${css.mono}`}>{tool.name}</span>
              <span className={css.rowMeta}>
                {tool.state === 'running' ? t('overview.tool.running') : timeOf(tool.time)}
              </span>
            </div>
          ))
        )} />
      </Section>

      <Section icon={<BranchIcon />} title={t('overview.section.git')}>
        <SectionBody state={o.git} emptyKey="overview.git.notRepo" render={(git) => git === null ? (
          <div className={css.muted}>{t('overview.git.notRepo')}</div>
        ) : (
          <div className={css.row}>
            <span className={css.rowValue}>
              {git.staged + git.unstaged + git.untracked === 0
                ? t('overview.git.clean', { branch: git.branch === '' ? t('overview.git.detached') : git.branch })
                : t('overview.git.line', {
                  branch: git.branch === '' ? t('overview.git.detached') : git.branch,
                  staged: git.staged,
                  unstaged: git.unstaged,
                  untracked: git.untracked,
                })}
            </span>
          </div>
        )} />
      </Section>
    </>
  )
}
