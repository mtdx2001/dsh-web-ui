import { createElement, type ReactNode } from 'react'
import type { CustomComponentDefinition, CustomComponentService } from '../core/custom-components.ts'
import type { WorkbenchServiceFace } from './workbench-service.ts'
import styles from './custom-component-runtime.module.css'

const SOURCE = 'workbench-custom'

type Dispose = () => void | Promise<void>

function CustomIcon(): ReactNode {
  return createElement('span', { className: styles.icon, 'aria-hidden': true }, 'C')
}

function InformationDetails({ component }: { component: CustomComponentDefinition }): ReactNode {
  return createElement('div', { className: styles.information }, component.content)
}

function TextPanel({ component }: { component: CustomComponentDefinition }): ReactNode {
  return createElement('article', { className: styles.panel, 'data-custom-component-id': component.id }, [
    createElement('h2', { className: styles.panelTitle, key: 'title' }, component.label),
    createElement('p', { className: styles.panelContent, key: 'content' }, component.content),
  ])
}

/** Project persisted structured definitions through the existing public registries. */
export function registerCustomComponents(service: WorkbenchServiceFace, custom: CustomComponentService): Dispose {
  let registrations: Dispose[] = []
  const expanded = new Set<string>()

  const clear = (): void => {
    for (const dispose of registrations.splice(0).reverse()) {
      try { void dispose() } catch { /* isolate stale custom registrations */ }
    }
  }
  const rebuild = (): void => {
    clear()
    for (const component of custom.getSnapshot().components) {
      try {
        if (component.region === 'main-surface') {
          registrations.push(service.registerMainSurface({
            id: component.id,
            source: SOURCE,
            order: component.createdAt,
            label: component.label,
            icon: CustomIcon,
            render: () => createElement(TextPanel, { component }),
          }))
        } else if (component.region === 'right-sidebar') {
          registrations.push(service.registerRightPanel({
            id: component.id,
            source: SOURCE,
            order: component.createdAt,
            label: component.label,
            icon: CustomIcon,
            render: () => createElement(TextPanel, { component }),
          }))
        } else {
          const result = service.admitSidebarRow({
            id: component.id,
            source: SOURCE,
            slot: component.region === 'left-bottom' ? 'bottom' : 'top',
            order: component.createdAt,
            label: component.label,
            kind: 'disclosure',
            icon: CustomIcon,
            summary: () => component.summary,
            details: () => createElement(InformationDetails, { component }),
            expanded: () => expanded.has(component.id),
            onToggle: () => {
              if (expanded.has(component.id)) expanded.delete(component.id)
              else expanded.add(component.id)
              service.refreshSidebarRow(component.id)
            },
          })
          if (result.ok) registrations.push(result.dispose)
        }
      } catch (error) {
        console.error(`[dsh-workbench] custom component ${component.id} registration failed:`, error)
      }
    }
  }

  rebuild()
  const unsubscribe = custom.subscribe(rebuild)
  return () => { unsubscribe(); clear() }
}
