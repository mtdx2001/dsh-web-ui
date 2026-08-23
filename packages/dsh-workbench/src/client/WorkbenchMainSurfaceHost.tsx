import { Component, useEffect, useMemo, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import type { WorkbenchServiceFace } from './workbench-service.ts'
import { t } from './locales.ts'
import styles from './main-surface-host.module.css'

export interface WorkbenchMainSurfaceOwnerProps {
  readonly agent: ReactNode
}

class SurfaceErrorBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }
  componentDidCatch(error: unknown): void {
    console.error('[dsh-workbench] main-surface component failed:', error)
    this.props.onFail()
  }
  render(): ReactNode {
    return this.state.failed ? <div className={styles.unavailable} role="alert">{t('mainSurface.unavailable')}</div> : this.props.children
  }
}

function SurfaceSlot({ service, id, close }: { service: WorkbenchServiceFace; id: string; close: () => void }): JSX.Element | null {
  const mode = service.getMainSurface(id)
  return mode === undefined ? null : <>{mode.render({ close })}</>
}

export function WorkbenchMainSurfaceHost({ agent, service }: WorkbenchMainSurfaceOwnerProps & { service: WorkbenchServiceFace }): JSX.Element {
  const subscribeModes = useMemo(() => service.subscribeMainSurfaces.bind(service), [service])
  const getModes = useMemo(() => service.getMainSurfaces.bind(service), [service])
  const registry = useSyncExternalStore(subscribeModes, getModes, getModes)
  const state = service.getMainSurfaceState()
  const selection = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot)
  const preferences = service.getComponentPreferences()
  const preferenceSnapshot = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot, preferences.getSnapshot)
  const effective = new Map(preferenceSnapshot.components.filter((item) => item.region === 'main-surface').map((item) => [item.id, item]))
  const available = registry.modes.filter((mode) => {
    const preference = effective.get(mode.id)
    return mode.availability.kind === 'available' && preference?.enabled !== false && preference?.removed !== true
  }).sort((left, right) => (effective.get(left.id)?.effectivePosition ?? left.order) - (effective.get(right.id)?.effectivePosition ?? right.order) || left.order - right.order || left.id.localeCompare(right.id))
  const activeId = selection.activeId === 'agent' || available.some((mode) => mode.id === selection.activeId) ? selection.activeId : 'agent'
  const activate = (id: string): void => { state.activate(id) }

  useEffect(() => {
    if (selection.activeId !== activeId) state.activate('agent')
  }, [activeId, selection.activeId, state])

  return <section className={styles.host} data-dsh-workbench-main-surface data-active-surface={activeId}>
    <header className={styles.header}>
      <nav className={styles.tabs} role="tablist" aria-label={t('mainSurface.tabs')}>
        <button className={styles.tab} type="button" role="tab" aria-selected={activeId === 'agent'} data-active={activeId === 'agent' || undefined} onClick={() => activate('agent')} title={t('navigation.agent')}>
          <span className={styles.agentIcon} aria-hidden="true">A</span><span>{t('navigation.agent')}</span>
        </button>
        {available.map((mode) => <button key={mode.id} className={styles.tab} type="button" role="tab" aria-selected={activeId === mode.id} data-active={activeId === mode.id || undefined} onClick={() => activate(mode.id)} title={mode.label}>
          {mode.icon ?? <span className={styles.extensionIcon} aria-hidden="true">+</span>}<span>{mode.label}</span>
        </button>)}
      </nav>
    </header>
    <div className={styles.content}>
      <div className={styles.agent} data-active={activeId === 'agent' || undefined} aria-hidden={activeId === 'agent' ? undefined : true}>{agent}</div>
      {activeId !== 'agent' ? <div className={styles.extension} role="tabpanel" aria-label={available.find((mode) => mode.id === activeId)?.label}>
        <SurfaceErrorBoundary key={activeId} onFail={() => activate('agent')}><SurfaceSlot service={service} id={activeId} close={() => activate('agent')} /></SurfaceErrorBoundary>
      </div> : null}
    </div>
  </section>
}
