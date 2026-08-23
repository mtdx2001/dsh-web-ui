import { describe, expect, it } from 'vitest'
import { WORKBENCH_GUIDANCE } from '../src/index.ts'

const MODULE_LABELS = ['Agent', '知识', '专家', '新闻', '监控', '设置'] as const

describe('model-facing Workbench guidance', () => {
  it('announces every shipped module and its official data boundaries', () => {
    for (const label of MODULE_LABELS) expect(WORKBENCH_GUIDANCE).toContain(label)
    expect(WORKBENCH_GUIDANCE).toContain('官方会话索引')
    expect(WORKBENCH_GUIDANCE).toContain('Agent Preset')
    expect(WORKBENCH_GUIDANCE).toContain('可信新闻来源')
    expect(WORKBENCH_GUIDANCE).toContain('运行时投影')
  })

  it('states the Workbench right-sidebar and Desktop layout ownership contracts', () => {
    expect(WORKBENCH_GUIDANCE).toContain('desktop.rightSidebar')
    expect(WORKBENCH_GUIDANCE).toContain('官方详情页签')
    expect(WORKBENCH_GUIDANCE).toContain('宽度、拖拽、收起和响应式布局')
    expect(WORKBENCH_GUIDANCE).toContain('AionUI 不是安装、运行、代码、服务或 DOM 依赖')
  })

  it('announces central modes while keeping plugin business ownership explicit', () => {
    expect(WORKBENCH_GUIDANCE).toContain('中央模式顶栏')
    expect(WORKBENCH_GUIDANCE).toContain('任务看板')
    expect(WORKBENCH_GUIDANCE).toContain('SSH')
    for (const boundary of ['调度', '凭据', '连接', '执行', '传输', '隧道']) {
      expect(WORKBENCH_GUIDANCE).toContain(boundary)
    }
  })
})
