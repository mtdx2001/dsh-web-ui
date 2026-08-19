import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const artifact = resolve('docs/archive/sidebar-row-owner-patch-2026-08-19.patch')
const patch = await readFile(artifact, 'utf8')

const required = [
  "'sidebar.rows.top': { kind: 'list'; scope: 'root'; owner: SidebarRowOwnerProps }",
  "'sidebar.rows.bottom': { kind: 'list'; scope: 'root'; owner: SidebarRowOwnerProps }",
  "'sidebar.rows.top': {",
  "'sidebar.rows.bottom': {",
  "PropsRenderSlots<'sidebar.workspaces' | 'sidebar.settings' | 'sidebar.footer.action' | 'sidebar.rows.top' | 'sidebar.rows.bottom'>",
  "renderSlot('sidebar.rows.top', { wide })",
  "renderSlot('sidebar.rows.bottom', { wide })",
]
for (const text of required) {
  if (!patch.includes(text)) throw new Error(`missing required patch text: ${text}`)
}

const slotDeclarations = patch.match(/'sidebar\.rows\.(top|bottom)': \{ kind: 'list'; scope: 'root'; owner: SidebarRowOwnerProps \}/g) ?? []
if (slotDeclarations.length !== 2) throw new Error(`expected two SlotMap declarations, got ${slotDeclarations.length}`)

const children = [...patch.matchAll(/\+        'sidebar\.rows\.(top|bottom)': \{/g)].map((match) => match[1])
if (children.join(',') !== 'top,bottom') throw new Error(`children order is ${children.join(',')}`)

const sidebarDiff = patch.slice(patch.indexOf('diff --git a/packages/client/ui-sidebar/src/client/SidebarRoot.tsx'))
const anchors = [
  "+      {renderSlot('sidebar.rows.top', { wide })}",
  'className={css.regionArea}',
  "+      {renderSlot('sidebar.rows.bottom', { wide })}",
  'Footer actions stack above Settings',
].map((anchor) => sidebarDiff.indexOf(anchor))
if (anchors.some((position) => position < 0) || anchors.some((position, index) => index > 0 && position <= anchors[index - 1])) {
  throw new Error(`render order is not New Session -> top -> workspace -> bottom -> footer/settings: ${anchors.join(',')}`)
}

const codeLines = patch.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n')
if (/createRoot|document\.|querySelector|MutationObserver|name:\s*['"](?:root|sidebar)['"]/i.test(codeLines)) {
  throw new Error('patch contains forbidden root/sidebar owner or DOM integration code')
}

console.log('sidebar owner patch static verification: passed')
