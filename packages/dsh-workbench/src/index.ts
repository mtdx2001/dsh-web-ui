/**
 * Host loader entry for the dsh-workbench plugin.
 *
 * Workbench interaction is browser work (official slot contributions and
 * reads through the client runtime), so the host half's only behavior is a
 * system-prompt section announcing the plugin to every agent. The section
 * registers while
 * the plugin is in the host composition and disappears when it leaves.
 *
 * @module @mtdx2001/dsh-client-ui-workbench
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { registerFilesRoute } from './host/files.ts'
import { registerGitChangesRoute } from './host/git-changes.ts'
import { registerGitStatusRoute } from './host/git-status.ts'
import { registerNewsRoutes, type NewsSourceConfig } from './host/news.ts'
import { registerMainSurfaceStateRoute } from './host/main-surface-state.ts'
import { createWorkspaceGate } from './host/workspace-gate.ts'
import { mountOnce } from './mount-once.ts'

export interface Config {
  /** Explicit allowlist; browser requests address these entries by id only. */
  newsSources?: NewsSourceConfig[]
}

/** Required services: the prompt band and route registry. */
export const inject = ['systemPrompt', 'webServer', 'workspaceRegistry']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 220

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const WORKBENCH_GUIDANCE = '本机已安装 dsh-workbench 插件（DSH Web GUI 执行工作台）：会话标题栏显示项目、会话、模式与运行状态；中央模式顶栏以 Agent 为系统保留模式，并显示已安装的任务看板与 SSH 完整视图；左侧模块导航包含 Agent、知识、专家、新闻、监控和设置。知识搜索官方会话索引；专家读取 Agent Preset 与当前项目 Skill；新闻仅读取 Host 配置的可信新闻来源；监控展示官方运行时投影中的 Token、吞吐、任务、子代理和最近工具。Agent 保留官方会话列表和对话区；Workbench 管理中央模式显示、顺序、默认、恢复上次和 Agent 回退，不改变任务看板调度、cron、执行或 SSH 凭据、连接、传输、隧道语义。Workbench 通过公开 desktop.rightSidebar slot 自有右侧栏，顶部用图标加文字页签，下面显示一个完整内容区；内置概览并保留官方详情页签。Desktop 仍独占右栏宽度、拖拽、收起和响应式布局；文件、预览、变更可由独立插件注册，缺失或失败不影响右栏。AionUI 不是安装、运行、代码、服务或 DOM 依赖。用户提到「工作台 / 状态条 / 模块导航 / 概览 / 右侧栏」时即指本插件，请据此协作。'

/**
 * Register the workbench's announcement section.
 * @param ctx - the plugin context (systemPrompt injected).
 */
export const apply = mountOnce('@mtdx2001/dsh-client-ui-workbench', applyImpl)

function applyImpl(ctx: Context, config?: Config): void {
  const workspaceGate = createWorkspaceGate(ctx)
  ctx.effect(() => registerNewsRoutes(ctx, config?.newsSources ?? []), 'dsh-workbench: trusted news routes')
  ctx.effect(() => registerMainSurfaceStateRoute(ctx), 'dsh-workbench: main-surface state route')
  ctx.effect(() => registerGitStatusRoute(ctx, workspaceGate), 'dsh-workbench: read-only git status route')
  ctx.effect(() => registerFilesRoute(ctx, workspaceGate), 'dsh-workbench: read-only workspace files route')
  ctx.effect(() => registerGitChangesRoute(ctx, workspaceGate), 'dsh-workbench: policy-enforced git changes route')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:workbench',
    order: SECTION_ORDER,
    text: WORKBENCH_GUIDANCE,
  }), 'dsh-workbench: prompt section')
}
