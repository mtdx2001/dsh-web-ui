import type { WorkbenchModuleRegistration } from '../core/module-registry.ts'
import type { WorkbenchServiceFace } from './workbench-service.ts'
import { t } from './locales.ts'

const TASK_ENTRY = '[data-dsh-taskboard-entry]'
const SSH_ENTRY = '[data-dsh-ssh-entry]'
const SETTINGS_TRIGGER = '[data-pane="sidebar"] button:has(> [data-slot="settings.trigger"]), [class*="sidebarCol"] button:has(> [data-slot="settings.trigger"])'
const TASK_ACTIVE = 'data-dsh-taskboard-active'
const SSH_ACTIVE = 'data-dsh-ssh-active'
const internalClicks = new WeakSet<EventTarget>()
const LEGACY_ENTRIES = [
  { id: 'tasks', selector: TASK_ENTRY },
  { id: 'ssh', selector: SSH_ENTRY },
  { id: 'settings', selector: SETTINGS_TRIGGER },
] as const
const ENTRY_WAIT_MS = 5_000

function button(doc: Document, selector: string): HTMLButtonElement | undefined {
  const found = doc.querySelector<HTMLButtonElement>(selector)
  return found?.isConnected === true && !found.disabled ? found : undefined
}

function availability(doc: Document, selector: string, reason: string) {
  return () => button(doc, selector) === undefined
    ? { kind: 'unavailable' as const, reason }
    : { kind: 'available' as const }
}

function setLegacyPanel(doc: Document, selector: string, activeAttribute: string, open: boolean): void {
  const isOpen = doc.documentElement.hasAttribute(activeAttribute)
  if (isOpen === open) return
  const entry = button(doc, selector)
  if (entry === undefined) throw new Error(t('navigation.unavailable'))
  internalClicks.add(entry)
  entry.click()
}

function closeLegacyPanels(doc: Document): void {
  setLegacyPanel(doc, TASK_ENTRY, TASK_ACTIVE, false)
  setLegacyPanel(doc, SSH_ENTRY, SSH_ACTIVE, false)
}

export function builtinModuleRegistrations(doc: Document = document): WorkbenchModuleRegistration[] {
  return [
    {
      id: 'agent', order: 10, label: t('navigation.agent'), icon: 'agent',
      activate: () => { closeLegacyPanels(doc) },
    },
    {
      id: 'tasks', order: 20, label: t('navigation.tasks'), icon: 'tasks',
      availability: availability(doc, TASK_ENTRY, t('navigation.unavailable')),
      activate: () => { setLegacyPanel(doc, SSH_ENTRY, SSH_ACTIVE, false); setLegacyPanel(doc, TASK_ENTRY, TASK_ACTIVE, true) },
      deactivate: () => { setLegacyPanel(doc, TASK_ENTRY, TASK_ACTIVE, false) },
    },
    {
      id: 'knowledge', order: 30, label: t('navigation.knowledge'), icon: 'knowledge',
      activate: () => { closeLegacyPanels(doc) },
    },
    {
      id: 'experts', order: 40, label: t('navigation.experts'), icon: 'experts',
      activate: () => { closeLegacyPanels(doc) },
    },
    {
      id: 'news', order: 50, label: t('navigation.news'), icon: 'news',
      activate: () => { closeLegacyPanels(doc) },
    },
    {
      id: 'monitoring', order: 55, label: t('navigation.monitoring'), icon: 'monitoring',
      activate: () => { closeLegacyPanels(doc) },
    },
    {
      id: 'ssh', order: 60, label: t('navigation.ssh'), icon: 'ssh',
      availability: availability(doc, SSH_ENTRY, t('navigation.unavailable')),
      activate: () => { setLegacyPanel(doc, TASK_ENTRY, TASK_ACTIVE, false); setLegacyPanel(doc, SSH_ENTRY, SSH_ACTIVE, true) },
      deactivate: () => { setLegacyPanel(doc, SSH_ENTRY, SSH_ACTIVE, false) },
    },
    {
      id: 'settings', order: 90, label: t('navigation.settings'), icon: 'settings',
      availability: availability(doc, SETTINGS_TRIGGER, t('navigation.unavailable')),
      activate: () => {
        const trigger = button(doc, SETTINGS_TRIGGER)
        if (trigger === undefined) throw new Error(t('navigation.unavailable'))
        internalClicks.add(trigger)
        trigger.click()
      },
    },
  ]
}

/** Register built-ins and mirror legacy entry clicks into the navigation state. */
export function registerBuiltinModules(service: WorkbenchServiceFace, doc: Document = document): () => Promise<void> {
  const disposers = builtinModuleRegistrations(doc).map((module) => service.register(module))
  const initialId = doc.documentElement.hasAttribute(TASK_ACTIVE) ? 'tasks'
    : doc.documentElement.hasAttribute(SSH_ACTIVE) ? 'ssh' : 'agent'
  void service.adopt(initialId)

  const pendingEntries = new Map(LEGACY_ENTRIES
    .filter(({ selector }) => button(doc, selector) === undefined)
    .map(({ id, selector }) => [id, selector]))
  let entryObserver: MutationObserver | undefined
  let entryTimeout: ReturnType<typeof setTimeout> | undefined
  if (pendingEntries.size > 0 && doc.body !== null) {
    entryObserver = new MutationObserver(() => {
      for (const [id, selector] of pendingEntries) {
        if (button(doc, selector) === undefined) continue
        pendingEntries.delete(id)
        service.refresh(id)
      }
      if (pendingEntries.size === 0) {
        entryObserver?.disconnect()
        if (entryTimeout !== undefined) clearTimeout(entryTimeout)
      }
    })
    entryObserver.observe(doc.body, { childList: true, subtree: true })
    entryTimeout = setTimeout(() => entryObserver?.disconnect(), ENTRY_WAIT_MS)
  }

  const syncLegacyClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    if (target === null) return
    const clicked = target.closest<HTMLElement>(`${TASK_ENTRY}, ${SSH_ENTRY}, ${SETTINGS_TRIGGER}`)
    if (clicked !== null && internalClicks.delete(clicked)) return
    const relevant = target.closest(`${TASK_ENTRY}, ${SSH_ENTRY}, ${SETTINGS_TRIGGER}, [class*="sessionRow"], [class*="projectRow"], [class*="newSession"]`)
    if (relevant === null) return
    if (relevant.matches(SETTINGS_TRIGGER)) void service.adopt('settings')
    else if (doc.documentElement.hasAttribute(TASK_ACTIVE)) void service.adopt('tasks')
    else if (doc.documentElement.hasAttribute(SSH_ACTIVE)) void service.adopt('ssh')
    else void service.adopt('agent')
  }
  doc.addEventListener('click', syncLegacyClick)
  return async () => {
    doc.removeEventListener('click', syncLegacyClick)
    entryObserver?.disconnect()
    if (entryTimeout !== undefined) clearTimeout(entryTimeout)
    await service.adopt(undefined)
    for (const dispose of disposers.reverse()) await dispose()
  }
}
