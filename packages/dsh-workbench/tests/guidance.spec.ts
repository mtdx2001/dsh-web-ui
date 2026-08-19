import { describe, expect, it } from 'vitest'
import { WORKBENCH_GUIDANCE } from '../src/index.ts'

const MODULE_LABELS = ['Agent', '任务看板', '知识', '专家', '新闻', '监控', 'SSH', '设置'] as const

describe('model-facing Workbench guidance', () => {
  it('announces every shipped module and its official data boundaries', () => {
    for (const label of MODULE_LABELS) expect(WORKBENCH_GUIDANCE).toContain(label)
    expect(WORKBENCH_GUIDANCE).toContain('官方会话索引')
    expect(WORKBENCH_GUIDANCE).toContain('Agent Preset')
    expect(WORKBENCH_GUIDANCE).toContain('可信新闻来源')
    expect(WORKBENCH_GUIDANCE).toContain('运行时投影')
  })

  it('states the current Overview and draggable-layout ownership contracts', () => {
    expect(WORKBENCH_GUIDANCE).toContain('AionUI Dock')
    expect(WORKBENCH_GUIDANCE).toContain('现有 Explorer React root')
    expect(WORKBENCH_GUIDANCE).toContain('用户拖拽')
    expect(WORKBENCH_GUIDANCE).not.toContain('概览挂载和 width guard 保持停用')
    expect(WORKBENCH_GUIDANCE).toContain('不创建第二个 React root')
  })

  it('keeps retained plugin business ownership explicit', () => {
    expect(WORKBENCH_GUIDANCE).toContain('任务看板与 SSH')
    for (const boundary of ['调度', '凭据', '连接', '执行', '传输', '隧道']) {
      expect(WORKBENCH_GUIDANCE).toContain(boundary)
    }
  })
})
