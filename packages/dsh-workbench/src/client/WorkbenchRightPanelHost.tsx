import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import type { WorkbenchStores } from '../core/store.ts'
import type { WorkbenchServiceFace } from './workbench-service.ts'
import { DetailsIcon, OverviewIcon, RightPanelIcon } from './icons.tsx'
import { t } from './locales.ts'
import styles from './right-panel-host.module.css'

export interface WorkbenchRightPanelOwnerProps {
  readonly collapsed: boolean
  readonly width: number
  readonly toggle: () => void
}

export interface WorkbenchRightPanelHostProps {
  readonly service: WorkbenchServiceFace
  readonly stores: WorkbenchStores
  readonly width: number
  readonly details: ReactNode
  readonly detailsRequestRevision: number
  readonly close: () => void
}

class PanelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }
  componentDidCatch(error: unknown): void { console.error('[dsh-workbench] right-sidebar component failed:', error) }
  render(): ReactNode { return this.state.failed ? <div className={styles.empty}>{t('rightPanel.unavailable')}</div> : this.props.children }
}

/** Invoke a panel's render inside the boundary's subtree so throws stay isolated. */
function PanelSlot({ panel }: { panel: NonNullable<ReturnType<WorkbenchServiceFace['getRightPanel']>> }): JSX.Element {
  return <>{panel.render()}</>
}

function iconFor(id: string): JSX.Element {
  if (id === 'workbench:overview') return <OverviewIcon />
  return <span className={styles.extensionIcon} aria-hidden="true">+</span>
}

const TAB_ESTIMATED_WIDTH = 72
const COLLAPSE_RESERVED_WIDTH = 40
const MORE_RESERVED_WIDTH = 68

function visibleTabIds(ids: readonly string[], activeId: string, width: number): { direct: readonly string[]; overflow: readonly string[] } {
  const allCapacity = Math.max(1, Math.floor((width - COLLAPSE_RESERVED_WIDTH) / TAB_ESTIMATED_WIDTH))
  if (ids.length <= allCapacity) return { direct: ids, overflow: [] }
  const directCapacity = Math.max(1, Math.floor((width - COLLAPSE_RESERVED_WIDTH - MORE_RESERVED_WIDTH) / TAB_ESTIMATED_WIDTH))
  const direct = ids.slice(0, directCapacity)
  if (!direct.includes(activeId)) direct[direct.length - 1] = activeId
  const directSet = new Set(direct)
  return { direct, overflow: ids.filter((id) => !directSet.has(id)) }
}

export function WorkbenchRightPanelHost({ service, stores, width, details, detailsRequestRevision, close }: WorkbenchRightPanelHostProps): JSX.Element {
  const subscribe = useMemo(() => service.subscribeRightPanels.bind(service), [service])
  const getSnapshot = useMemo(() => service.getRightPanels.bind(service), [service])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const preferences = service.getComponentPreferences()
  const preferenceSnapshot = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot, preferences.getSnapshot)
  const uiSnapshot = useSyncExternalStore(stores.ui.subscribe, stores.ui.getSnapshot, stores.ui.getSnapshot)
  const effective = new Map(preferenceSnapshot.components.filter((item) => item.region === 'right-sidebar').map((item) => [item.id, item]))
  const available = snapshot.panels.filter((panel) => {
    const preference = effective.get(panel.id)
    return panel.availability.kind === 'available' && preference?.enabled !== false && preference?.removed !== true
  }).sort((left, right) => (effective.get(left.id)?.effectivePosition ?? left.order) - (effective.get(right.id)?.effectivePosition ?? right.order) || left.order - right.order || left.id.localeCompare(right.id))
  const [activeId, setActiveId] = useState(() => {
    const stored = stores.ui.getSnapshot().activeRightPanel
    return stored.includes(':') ? stored : stored === 'overview' ? 'workbench:overview' : (available[0]?.id ?? 'details')
  })
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const activate = (id: string): void => { setActiveId(id); stores.setActiveRightPanel(id); setMoreOpen(false) }
  const lastDetailsRequest = useRef(detailsRequestRevision)

  useEffect(() => {
    const persisted = uiSnapshot.activeRightPanel
    if (persisted !== activeId && (persisted === 'details' || available.some((panel) => panel.id === persisted))) setActiveId(persisted)
  }, [uiSnapshot.activeRightPanel, available])
  useEffect(() => {
    if (activeId !== 'details' && !available.some((panel) => panel.id === activeId)) {
      activate(available.some((panel) => panel.id === 'workbench:overview') ? 'workbench:overview' : (available[0]?.id ?? 'details'))
    }
  }, [activeId, available])
  useEffect(() => {
    if (!moreOpen) return
    const menu = moreMenuRef.current
    const first = menu?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMoreOpen(false)
        moreButtonRef.current?.focus()
      }
    }
    menu?.addEventListener('keydown', onKeyDown)
    return () => menu?.removeEventListener('keydown', onKeyDown)
  }, [moreOpen])
  useEffect(() => {
    if (detailsRequestRevision !== lastDetailsRequest.current) {
      lastDetailsRequest.current = detailsRequestRevision
      activate('details')
    }
  }, [detailsRequestRevision])

  const activePanel = activeId === 'details' ? undefined : service.getRightPanel(activeId)
  const tabIds = [...available.map((panel) => panel.id), 'details']
  const tabLayout = visibleTabIds(tabIds, activeId, width)
  const panelFor = (id: string) => available.find((panel) => panel.id === id)
  const labelFor = (id: string): string => id === 'details' ? t('rightPanel.details') : (panelFor(id)?.label ?? id)
  const iconForId = (id: string): ReactNode => id === 'details' ? <DetailsIcon /> : (panelFor(id)?.icon ?? iconFor(id))
  return <section className={styles.host} data-dsh-workbench-right-panel aria-label={t('rightPanel.label')}>
    <header className={styles.header}>
      <button className={styles.collapse} type="button" onClick={close} title={t('rightPanel.collapse')} aria-label={t('rightPanel.collapse')}><RightPanelIcon size={16} /></button>
      <div className={styles.tabs} role="tablist" aria-label={t('rightPanel.tabs')}>
        {tabLayout.direct.map((id) => <button key={id} className={styles.tab} type="button" role="tab" aria-selected={id === activeId} data-active={id === activeId || undefined} onClick={() => activate(id)}>
          {iconForId(id)}<span title={labelFor(id)}>{labelFor(id)}</span>
        </button>)}
      </div>
      {tabLayout.overflow.length > 0 ? <div className={styles.more}>
        <button ref={moreButtonRef} className={styles.moreButton} type="button" aria-haspopup="menu" aria-expanded={moreOpen} aria-controls="workbench-right-panel-more-menu" onClick={() => setMoreOpen((open) => !open)}>{t('rightPanel.more')}</button>
        {moreOpen ? <div ref={moreMenuRef} id="workbench-right-panel-more-menu" className={styles.moreMenu} role="menu" aria-label={t('rightPanel.more')}>
          {tabLayout.overflow.map((id) => <button key={id} type="button" role="menuitem" onClick={() => activate(id)}>{iconForId(id)}<span>{labelFor(id)}</span></button>)}
        </div> : null}
      </div> : null}
    </header>
    <div className={styles.content} role="tabpanel" aria-label={activeId === 'details' ? t('rightPanel.details') : available.find((panel) => panel.id === activeId)?.label}>
      <PanelErrorBoundary key={activeId}>{activeId === 'details' ? details : activePanel === undefined ? null : <PanelSlot panel={activePanel} />}</PanelErrorBoundary>
    </div>
  </section>
}
