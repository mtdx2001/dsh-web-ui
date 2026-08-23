import { useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  Button,
  IconChecklistOutline14,
  IconCordisPluginOutline14,
  IconPanelLeftOutline16,
  IconPlusOutline16,
  IconRefreshOutline16,
  Input,
  Modal,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComponentPreferencesService, ComponentRegion } from '../core/component-preferences.ts'
import type { MainSurfaceStateService } from '../core/main-surface-state.ts'
import type { CreateCustomComponentInput, CustomComponentKind, CustomComponentService } from '../core/custom-components.ts'
import { DetailsIcon } from './icons.tsx'
import type { WorkbenchKey } from './locales.ts'
import styles from './component-settings-layout.module.css'

type Props = PropsRuntime<'settings.section'> & PropsLocale<'workbench'> & {
  service: ComponentPreferencesService
  mainSurface: MainSurfaceStateService
  custom: CustomComponentService
}
const regions: readonly ComponentRegion[] = ['main-surface', 'left-top', 'left-bottom', 'right-sidebar']
const regionKeys: Record<ComponentRegion, WorkbenchKey> = {
  'main-surface': 'settings.components.region.mainSurface',
  'left-top': 'settings.components.region.leftTop',
  'left-bottom': 'settings.components.region.leftBottom',
  'right-sidebar': 'settings.components.region.rightSidebar',
}
const CUSTOM_SOURCE = 'workbench-custom'

function RegionIcon({ region }: { region: ComponentRegion }): ReactNode {
  if (region === 'right-sidebar' || region === 'main-surface') return <IconPanelLeftOutline16 size={16} />
  return <IconChecklistOutline14 size={16} />
}

function initialDraft(): CreateCustomComponentInput {
  return { kind: 'information', label: '', region: 'left-top', summary: '', content: '' }
}

export function ComponentSettingsSection({ t, service, mainSurface, custom }: Props): ReactNode {
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot)
  const surfaceState = useSyncExternalStore(mainSurface.subscribe, mainSurface.getSnapshot, mainSurface.getSnapshot)
  useSyncExternalStore(custom.subscribe, custom.getSnapshot, custom.getSnapshot)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<CreateCustomComponentInput>(initialDraft)
  const [createError, setCreateError] = useState('')
  const available = snapshot.components.filter((item) => !item.removed)
  const removed = snapshot.components.filter((item) => item.removed)
  const grouped = regions.map((region) => ({ region, items: available.filter((item) => item.region === region) })).filter((item) => item.items.length > 0 || item.region === 'main-surface' || item.region === 'right-sidebar')
  const closeAdd = (): void => { setAddOpen(false); setDraft(initialDraft()); setCreateError('') }
  const chooseKind = (kind: CustomComponentKind): void => {
    setDraft((current) => ({ ...current, kind, region: kind === 'text-panel' && (current.region === 'left-top' || current.region === 'left-bottom') ? 'right-sidebar' : current.region }))
    setCreateError('')
  }
  const create = (): void => {
    try {
      custom.create(draft)
      closeAdd()
    } catch {
      setCreateError(t('settings.components.createInvalid' as WorkbenchKey))
    }
  }
  const validDraft = draft.label.trim().length > 0 && draft.label.trim().length <= 60 && draft.content.trim().length > 0 && draft.content.trim().length <= 8_000 && (draft.summary?.trim().length ?? 0) <= 160

  return (
    <section className={styles.section} data-dsh-workbench-component-settings>
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <h2 className={styles.heading}>{t('settings.components.title' as WorkbenchKey)}</h2>
          <p className={styles.description}>{t('settings.components.description' as WorkbenchKey)}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" size="sm" icon={<IconPlusOutline16 size={14} />} onClick={() => setAddOpen(true)}>{t('settings.components.add' as WorkbenchKey)}</Button>
          <Button variant="outline" size="sm" icon={<IconRefreshOutline16 size={14} />} onClick={() => { service.reset(); mainSurface.reset() }}>{t('settings.components.reset' as WorkbenchKey)}</Button>
        </div>
      </header>
      {grouped.length === 0 ? <p className={styles.empty} role="status">{t('settings.components.empty' as WorkbenchKey)}</p> : (
        <div className={styles.groups}>
          {grouped.map(({ region, items }) => (
            <fieldset className={styles.group} key={region} data-component-region={region}>
              <legend className={styles.legend}>{t(regionKeys[region])}</legend>
              <div className={styles.list}>
                {region === 'main-surface' ? <div className={styles.row} data-component-id="agent" data-reserved="true">
                  <div className={styles.identity}>
                    <span className={styles.icon} aria-hidden="true"><span className={styles.customIcon}>A</span></span>
                    <div className={styles.text}>
                      <div className={styles.nameLine}><span className={styles.name}>{t('navigation.agent' as WorkbenchKey)}</span><Pill>{t('settings.components.reserved' as WorkbenchKey)}</Pill></div>
                      <span className={styles.source}>conversation</span>
                    </div>
                  </div>
                  <Pill active>{t('settings.components.enabled' as WorkbenchKey)}</Pill>
                  <div className={styles.actions}>{surfaceState.defaultId === 'agent' ? <Pill>{t('settings.components.default' as WorkbenchKey)}</Pill> : <Button variant="toolbar" size="sm" onClick={() => mainSurface.setDefault('agent')}>{t('settings.components.setDefault' as WorkbenchKey)}</Button>}</div>
                </div> : null}
                {items.map((item, index) => {
                  const customItem = item.source === CUSTOM_SOURCE
                  const typeLabel = customItem ? t('settings.components.custom' as WorkbenchKey) : item.builtin ? t('settings.components.builtin' as WorkbenchKey) : t('settings.components.plugin' as WorkbenchKey)
                  return (
                    <div className={styles.row} key={item.id} data-component-id={item.id}>
                      <div className={styles.identity}>
                        <span className={styles.icon} aria-hidden="true">{customItem ? <span className={styles.customIcon}>C</span> : item.builtin ? <RegionIcon region={region} /> : <IconCordisPluginOutline14 size={16} />}</span>
                        <div className={styles.text}>
                          <div className={styles.nameLine}><span className={styles.name}>{item.label}</span><Pill>{typeLabel}</Pill></div>
                          <span className={styles.source}>{item.source}</span>
                        </div>
                      </div>
                      <Pill active={item.enabled} aria-pressed={item.enabled} onClick={() => service.setEnabled(item.id, !item.enabled)}>{t((item.enabled ? 'settings.components.enabled' : 'settings.components.disabled') as WorkbenchKey)}</Pill>
                      <div className={styles.actions}>
                        {region === 'main-surface' ? surfaceState.defaultId === item.id ? <Pill>{t('settings.components.default' as WorkbenchKey)}</Pill> : <Button variant="toolbar" size="sm" onClick={() => mainSurface.setDefault(item.id)}>{t('settings.components.setDefault' as WorkbenchKey)}</Button> : null}
                        <Button variant="toolbar" size="sm" disabled={index === 0} onClick={() => service.move(item.id, -1)}>{t('settings.components.moveUp' as WorkbenchKey)}</Button>
                        <Button variant="toolbar" size="sm" disabled={index === items.length - 1} onClick={() => service.move(item.id, 1)}>{t('settings.components.moveDown' as WorkbenchKey)}</Button>
                        {customItem
                          ? <Button variant="toolbar" size="sm" onClick={() => { custom.remove(item.id.slice(`${CUSTOM_SOURCE}:`.length)); service.reset(item.id) }}>{t('settings.components.delete' as WorkbenchKey)}</Button>
                          : item.removable ? <Button variant="toolbar" size="sm" onClick={() => service.setRemoved(item.id, true)}>{t('settings.components.remove' as WorkbenchKey)}</Button> : null}
                      </div>
                    </div>
                  )
                })}
                {region === 'main-surface' ? <label className={styles.surfaceOption}><input type="checkbox" checked={surfaceState.restoreLast} onChange={(event) => mainSurface.setRestoreLast(event.currentTarget.checked)} />{t('settings.components.restoreLast' as WorkbenchKey)}</label> : null}
                {region === 'right-sidebar' ? (
                  <div className={styles.row} data-component-id="details" data-reserved="true">
                    <div className={styles.identity}>
                      <span className={styles.icon} aria-hidden="true"><DetailsIcon size={16} /></span>
                      <div className={styles.text}>
                        <div className={styles.nameLine}><span className={styles.name}>{t('rightPanel.details' as WorkbenchKey)}</span><Pill>{t('settings.components.reserved' as WorkbenchKey)}</Pill></div>
                        <span className={styles.source}>desktop</span>
                      </div>
                    </div>
                    <Pill active>{t('settings.components.enabled' as WorkbenchKey)}</Pill>
                    <div className={styles.actions}><Pill>{t('settings.components.fixed' as WorkbenchKey)}</Pill></div>
                  </div>
                ) : null}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <Modal
        open={addOpen}
        onClose={closeAdd}
        title={t('settings.components.addTitle' as WorkbenchKey)}
        closeLabel={t('settings.components.cancel' as WorkbenchKey)}
        description={t('settings.components.addDescription' as WorkbenchKey)}
        className={styles.addDialog}
        footer={<><Button variant="outline" onClick={closeAdd}>{t('settings.components.cancel' as WorkbenchKey)}</Button><Button disabled={!validDraft} onClick={create}>{t('settings.components.create' as WorkbenchKey)}</Button></>}
      >
        <div className={styles.addBody}>
          <div className={styles.kindControl} role="group" aria-label={t('settings.components.type' as WorkbenchKey)}>
            <Button variant={draft.kind === 'information' ? 'primary' : 'outline'} size="sm" onClick={() => chooseKind('information')}>{t('settings.components.type.information' as WorkbenchKey)}</Button>
            <Button variant={draft.kind === 'text-panel' ? 'primary' : 'outline'} size="sm" onClick={() => chooseKind('text-panel')}>{t('settings.components.type.textPanel' as WorkbenchKey)}</Button>
          </div>
          <label className={styles.field}>{t('settings.components.location' as WorkbenchKey)}<select value={draft.region} onChange={(event) => { const value = event.currentTarget.value as ComponentRegion; setDraft((current) => ({ ...current, region: value })) }}>
            {draft.kind === 'information' ? <option value="left-top">{t(regionKeys['left-top'])}</option> : null}
            {draft.kind === 'information' ? <option value="left-bottom">{t(regionKeys['left-bottom'])}</option> : null}
            <option value="main-surface">{t(regionKeys['main-surface'])}</option>
            <option value="right-sidebar">{t(regionKeys['right-sidebar'])}</option>
          </select></label>
          <label className={styles.field}>{t('settings.components.name' as WorkbenchKey)}<Input value={draft.label} maxLength={60} onChange={(event) => { const value = event.currentTarget.value; setDraft((current) => ({ ...current, label: value })) }} /></label>
          {draft.kind === 'information' ? <label className={styles.field}>{t('settings.components.summary' as WorkbenchKey)}<Input value={draft.summary ?? ''} maxLength={160} onChange={(event) => { const value = event.currentTarget.value; setDraft((current) => ({ ...current, summary: value })) }} /></label> : null}
          <label className={styles.field}>{t('settings.components.content' as WorkbenchKey)}<textarea rows={draft.kind === 'text-panel' ? 10 : 6} value={draft.content} maxLength={8_000} onChange={(event) => { const value = event.currentTarget.value; setDraft((current) => ({ ...current, content: value })) }} /></label>
          {createError !== '' ? <p className={styles.formError} role="alert">{createError}</p> : null}
          <p className={styles.pluginsHint}>{t('settings.components.pluginsHint' as WorkbenchKey)}</p>
          {removed.length > 0 ? <section className={styles.restoreSection}><h3>{t('settings.components.removed' as WorkbenchKey)}</h3><div className={styles.restoreList}>{removed.map((item) => <Button key={item.id} variant="outline" size="sm" onClick={() => service.setRemoved(item.id, false)}>{item.label} · {t(regionKeys[item.region])}</Button>)}</div></section> : null}
        </div>
      </Modal>
    </section>
  )
}
