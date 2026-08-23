import type { WorkbenchModuleIcon, WorkbenchModuleRegistration } from '../core/module-registry.ts'
import type { WorkbenchServiceFace } from './workbench-service.ts'
import { t } from './locales.ts'

const SETTINGS_TRIGGER = '[data-pane="sidebar"] button:has(> [data-slot="settings.trigger"]), [class*="sidebarCol"] button:has(> [data-slot="settings.trigger"])'
const internalClicks = new WeakSet<EventTarget>()
const ENTRY_WAIT_MS = 5_000

function button(doc: Document, selector: string): HTMLButtonElement | undefined {
  const found = doc.querySelector<HTMLButtonElement>(selector)
  return found?.isConnected === true && !found.disabled ? found : undefined
}

function settingsAvailability(doc: Document) {
  return () => button(doc, SETTINGS_TRIGGER) === undefined
    ? { kind: 'unavailable' as const, reason: t('navigation.unavailable') }
    : { kind: 'available' as const }
}

export function builtinModuleRegistrations(doc: Document = document): WorkbenchModuleRegistration[] {
  const passive = (id: 'agent' | 'knowledge' | 'experts' | 'news' | 'monitoring', order: number, label: string, icon: WorkbenchModuleIcon): WorkbenchModuleRegistration => ({ id, order, label, icon, activate: () => {} })
  return [
    passive('agent', 10, t('navigation.agent'), 'agent'),
    passive('knowledge', 30, t('navigation.knowledge'), 'knowledge'),
    passive('experts', 40, t('navigation.experts'), 'experts'),
    passive('news', 50, t('navigation.news'), 'news'),
    passive('monitoring', 55, t('navigation.monitoring'), 'monitoring'),
    {
      id: 'settings', order: 90, label: t('navigation.settings'), icon: 'settings',
      availability: settingsAvailability(doc),
      activate: () => {
        const trigger = button(doc, SETTINGS_TRIGGER)
        if (trigger === undefined) throw new Error(t('navigation.unavailable'))
        internalClicks.add(trigger)
        trigger.click()
      },
    },
  ]
}

/** Register built-ins and mirror the retained Settings entry into navigation state. */
export function registerBuiltinModules(service: WorkbenchServiceFace, doc: Document = document): () => Promise<void> {
  const disposers = builtinModuleRegistrations(doc).map((module) => service.register(module))
  void service.adopt('agent')

  let entryObserver: MutationObserver | undefined
  let entryTimeout: ReturnType<typeof setTimeout> | undefined
  if (button(doc, SETTINGS_TRIGGER) === undefined && doc.body !== null) {
    entryObserver = new MutationObserver(() => {
      if (button(doc, SETTINGS_TRIGGER) === undefined) return
      service.refresh('settings')
      entryObserver?.disconnect()
      if (entryTimeout !== undefined) clearTimeout(entryTimeout)
    })
    entryObserver.observe(doc.body, { childList: true, subtree: true })
    entryTimeout = setTimeout(() => entryObserver?.disconnect(), ENTRY_WAIT_MS)
  }

  const syncSettingsClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (target === null) return
    const clicked = target.closest<HTMLElement>(SETTINGS_TRIGGER)
    if (clicked === null) return
    if (internalClicks.delete(clicked)) return
    void service.adopt('settings')
  }
  doc.addEventListener('click', syncSettingsClick)
  return async () => {
    doc.removeEventListener('click', syncSettingsClick)
    entryObserver?.disconnect()
    if (entryTimeout !== undefined) clearTimeout(entryTimeout)
    await service.adopt(undefined)
    for (const dispose of disposers.reverse()) await dispose()
  }
}
