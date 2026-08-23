import type { JSX } from 'react'
import { DetailsIcon } from './icons.tsx'
import type { WorkbenchStores } from '../core/store.ts'
import { useStore } from './hooks/useStore.ts'
import { t } from './locales.ts'
import css from './styles/workbench.module.css'

/** Additive Session Header utility; the official owner mounts and disposes it. */
export function StatusBar({ stores, openRightSidebar }: { stores: WorkbenchStores; openRightSidebar?: () => void }): JSX.Element {
  const overview = useStore(stores.overview)
  const dotClass = overview.status === 'running' ? css.dotRunning : overview.status === 'attention' ? css.dotAttention : undefined
  return <div className={css.statusBar} data-dsh-workbench-statusbar>
    <span className={css.statusLeft}><span className={css.statusProject}>{overview.projectName || t('statusbar.noSession')}</span>{overview.sessionTitle !== '' && <><span className={css.statusSep}>/</span><span className={css.statusSession}>{overview.sessionTitle}</span></>}</span>
    <span className={css.statusRight}>{overview.agentPreset && <span className={css.statusPreset}>{overview.agentPreset}</span>}<span className={css.statusBadge}><span className={`${css.statusDot} ${dotClass ?? ''}`} />{t(`status.${overview.status}`)}</span>{openRightSidebar && <button className={css.statusAction} type="button" onClick={openRightSidebar} title={t('rightPanel.open')} aria-label={t('rightPanel.open')}><DetailsIcon size={15} /></button>}</span>
  </div>
}
