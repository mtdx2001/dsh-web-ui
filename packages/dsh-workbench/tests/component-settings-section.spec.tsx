// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ComponentSettingsSection } from '../src/client/ComponentSettingsSection.tsx'
import { dictionaries } from '../src/client/locales.ts'
import { ComponentPreferencesService, type ComponentDescriptor } from '../src/core/component-preferences.ts'
import { CustomComponentService } from '../src/core/custom-components.ts'
import { registerCustomComponents } from '../src/client/custom-component-runtime.tsx'
import { WorkbenchService } from '../src/client/workbench-service.ts'

const descriptors: ComponentDescriptor[] = [
  { id: 'dsh-task-board:tasks', region: 'main-surface', label: '任务看板', source: 'dsh-task-board', order: 20, defaultEnabled: true, removable: true, builtin: false },
  { id: 'dsh-ssh:ssh', region: 'main-surface', label: 'SSH', source: 'dsh-ssh', order: 30, defaultEnabled: true, removable: true, builtin: false },
  { id: 'workbench:knowledge', region: 'left-top', label: '知识', source: 'workbench', order: 10, defaultEnabled: true, removable: true, builtin: true },
  { id: 'workbench:status-check', region: 'left-bottom', label: '状态检查', source: 'workbench', order: 10, defaultEnabled: true, removable: true, builtin: true },
  { id: 'workbench:overview', region: 'right-sidebar', label: '概览', source: 'workbench', order: 10, defaultEnabled: true, removable: true, builtin: true },
  { id: 'workbench-files:files', region: 'right-sidebar', label: '文件', source: 'workbench-files', order: 20, defaultEnabled: true, removable: true, builtin: false },
  { id: 'workbench-changes:changes', region: 'right-sidebar', label: '变更', source: 'workbench-changes', order: 30, defaultEnabled: true, removable: true, builtin: false },
]

let root: Root | undefined
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}
function click(button: HTMLButtonElement): void { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) }
function button(label: string): HTMLButtonElement { return [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label) as HTMLButtonElement }
function setControl(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const prototype = control.tagName === 'INPUT' ? HTMLInputElement.prototype : control.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value)
  control.dispatchEvent(new Event('change', { bubbles: true }))
  control.dispatchEvent(new Event('input', { bubbles: true }))
}
function renderSection(): { service: ComponentPreferencesService; custom: CustomComponentService; workbench: WorkbenchService } {
  document.body.innerHTML = '<div id="owner"></div>'
  const service = new ComponentPreferencesService(undefined)
  service.reconcile(descriptors)
  const custom = new CustomComponentService({ getItem: () => null, setItem: () => {} })
  const workbench = new WorkbenchService(service)
  registerCustomComponents(workbench, custom)
  const t = (key: keyof typeof dictionaries.zh): string => dictionaries.zh[key]
  root = createRoot(document.querySelector('#owner')!)
  root.render(createElement(ComponentSettingsSection, { service, mainSurface: workbench.getMainSurfaceState(), custom, t } as never))
  return { service, custom, workbench }
}

afterEach(() => { root?.unmount(); root = undefined; document.body.innerHTML = '' })

describe('Workbench component settings section', () => {
  it('uses localized layout names and keeps Add available with no removed components', async () => {
    renderSection()
    await settle()

    expect(document.querySelector('h2')?.textContent).toBe('工作台布局')
    expect([...document.querySelectorAll('legend')].map((legend) => legend.textContent)).toEqual(['中央主内容区', '左侧顶部', '左侧底部', '右侧栏'])
    const main = document.querySelector('[data-component-region="main-surface"]')!
    expect(main.textContent).toContain('会话')
    expect(main.textContent).toContain('任务看板')
    expect(main.textContent).toContain('SSH')
    expect(main.textContent).toContain('启动时恢复上次中央模式')
    expect(document.querySelector('[data-component-id="agent"] button')).toBeNull()
    const right = document.querySelector('[data-component-region="right-sidebar"]')!
    expect(right.textContent).toContain('概览')
    expect(right.textContent).toContain('文件')
    expect(right.textContent).toContain('变更')
    expect(right.textContent).toContain('详情')
    expect(right.textContent).toContain('系统保留')
    expect(right.textContent).toContain('固定')
    expect(document.querySelector('[data-component-id="details"] button')).toBeNull()
    expect(button('添加').disabled).toBe(false)
  })

  it('resets central mode defaults together with component layout', async () => {
    const { workbench } = renderSection()
    await settle()
    const state = workbench.getMainSurfaceState()
    state.setDefault('dsh-ssh:ssh')
    state.setRestoreLast(false)
    click(button('恢复默认'))
    await settle()
    expect(state.getSnapshot()).toMatchObject({ activeId: 'agent', defaultId: 'agent', restoreLast: true })
  })

  it('creates a structured information component and permanently deletes it', async () => {
    const { custom } = renderSection()
    await settle()
    click(button('添加'))
    await settle()

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('添加组件')
    const inputs = [...document.querySelectorAll('[role="dialog"] input')] as HTMLInputElement[]
    const textarea = document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement
    setControl(inputs[0]!, '发布提示')
    setControl(inputs[1]!, '今日事项')
    setControl(textarea, '发布前运行完整测试。')
    await settle()
    expect(button('创建').disabled).toBe(false)
    click(button('创建'))
    await settle()

    const definition = custom.getSnapshot().components[0]!
    expect(definition).toMatchObject({ kind: 'information', label: '发布提示', region: 'left-top', summary: '今日事项', content: '发布前运行完整测试。' })
    const row = document.querySelector(`[data-component-id="workbench-custom:${definition.id}"]`)!
    expect(row.textContent).toContain('发布提示')
    expect(row.textContent).toContain('自定义')
    click([...row.querySelectorAll('button')].find((item) => item.textContent?.trim() === '删除') as HTMLButtonElement)
    await settle()
    expect(custom.getSnapshot().components).toHaveLength(0)
  })

  it('creates a right-sidebar text tab and restores a removed installed component', async () => {
    const { service, custom } = renderSection()
    await settle()
    const filesRow = document.querySelector('[data-component-id="workbench-files:files"]')!
    click([...filesRow.querySelectorAll('button')].find((item) => item.textContent?.trim() === '移除') as HTMLButtonElement)
    await settle()

    click(button('添加'))
    await settle()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('恢复已移除组件')
    click(button('文本页签'))
    await settle()
    const inputs = [...document.querySelectorAll('[role="dialog"] input')] as HTMLInputElement[]
    setControl(inputs[0]!, '团队说明')
    setControl(document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement, '这是团队共享说明。')
    await settle()
    click(button('创建'))
    await settle()

    expect(custom.getSnapshot().components[0]).toMatchObject({ kind: 'text-panel', region: 'right-sidebar', label: '团队说明' })
    expect(service.getSnapshot().components.some((item) => item.id === 'workbench-files:files' && item.removed)).toBe(true)
    click(button('添加'))
    await settle()
    click([...document.querySelectorAll('[role="dialog"] button')].find((item) => item.textContent?.includes('文件 · 右侧栏')) as HTMLButtonElement)
    await settle()
    expect(service.getSnapshot().components.some((item) => item.id === 'workbench-files:files' && !item.removed)).toBe(true)
  })
})
