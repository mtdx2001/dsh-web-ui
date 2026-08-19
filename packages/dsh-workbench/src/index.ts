/**
 * Host loader entry for the dsh-workbench plugin.
 *
 * Workbench interaction is browser work (official slot contributions and
 * reads through the client runtime), so the host half's only behavior is a
 * system-prompt section announcing the plugin to every agent. The section
 * registers while
 * the plugin is in the host composition and disappears when it leaves.
 *
 * @module @linxin666/dsh-client-ui-workbench
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { registerNewsRoutes, type NewsSourceConfig } from './host/news.ts'
import { mountOnce } from './mount-once.ts'

export interface Config {
  /** Explicit allowlist; browser requests address these entries by id only. */
  newsSources?: NewsSourceConfig[]
}

/** Required services: the prompt band and route registry. */
export const inject = ['systemPrompt', 'webServer']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 220

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const WORKBENCH_GUIDANCE = '本机已安装 dsh-workbench 插件（DSH Web GUI 执行工作台）：会话标题栏显示项目、会话、模式与运行状态；官方 shell.overlay 提供左侧模块轨道和按需上下文栏，包含 Agent、任务看板、知识、专家、新闻、监控、SSH、设置。知识搜索官方会话索引；专家读取 Agent Preset 与当前项目 Skill；新闻仅读取 Host 配置的可信新闻来源；监控展示官方运行时投影中的 Token、吞吐、任务、子代理和最近工具。Agent 保留官方会话列表和对话区；任务看板与 SSH 通过可选 adapter 调用其保留入口，不改变调度、cron、凭据、连接、执行、传输或隧道语义。概览通过 AionUI Dock 注册并在其现有 Explorer React root 内渲染，不创建第二个 React root；左右面板尺寸继续由现有布局控制器和用户拖拽决定。用户提到「工作台 / 状态条 / 模块导航 / 概览」时即指本插件，请据此协作。'

/**
 * Register the workbench's announcement section.
 * @param ctx - the plugin context (systemPrompt injected).
 */
export const apply = mountOnce('@linxin666/dsh-client-ui-workbench', applyImpl)

function applyImpl(ctx: Context, config?: Config): void {
  ctx.effect(() => registerNewsRoutes(ctx, config?.newsSources ?? []), 'dsh-workbench: trusted news routes')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:workbench',
    order: SECTION_ORDER,
    text: WORKBENCH_GUIDANCE,
  }), 'dsh-workbench: prompt section')
}
