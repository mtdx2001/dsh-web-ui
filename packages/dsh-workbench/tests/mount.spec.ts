import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { createWorkbenchStores } from '../src/core/store.ts'
import { OverviewPanel } from '../src/client/OverviewPanel.tsx'
import { StatusBar } from '../src/client/status-bar.tsx'
import { setLanguage } from '../src/client/locales.ts'

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('slot-owned workbench surfaces', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    document.documentElement.lang = 'en'
    setLanguage('en')
  })

  it('renders live session fields only inside the slot owner container', async () => {
    const owner = document.createElement('div')
    document.body.appendChild(owner)
    const stores = createWorkbenchStores()
    stores.overview.update((previous) => ({
      ...previous,
      root: 'E:\\deepseek\\project',
      projectName: 'project',
      sessionTitle: 'Release review',
      status: 'running',
      agentPreset: 'Code Mode',
       agentSessions: { kind: 'ready', value: [{ id: 's-1', title: 'Release review', cwd: 'E:\\deepseek\\project', running: true, attention: false }] },
    }))
    const root = createRoot(owner)
    root.render(createElement(StatusBar, { stores }))
    await settle()

    const status = owner.querySelector('[data-dsh-workbench-statusbar]')
    expect(status?.textContent).toContain('project')
    expect(status?.textContent).toContain('Release review')
    expect(status?.textContent).toContain('Code Mode')
    expect(status?.textContent).toContain('Running')
    expect(document.querySelector('[class*="centerCol"]')).toBeNull()

    root.unmount()
    expect(owner.childElementCount).toBe(0)
  })

  it('renders every Overview section from runtime-shaped data without owning AionUI DOM', async () => {
    const owner = document.createElement('div')
    document.body.appendChild(owner)
    const stores = createWorkbenchStores()
    stores.overview.update(() => ({
      root: 'E:\\deepseek\\project',
      projectName: 'project',
      sessionTitle: 'Release review',
      status: 'attention',
      agentPreset: 'Code Mode',
      agentSessions: { kind: 'ready', value: [{ id: 's-1', title: 'Release review', cwd: 'E:\\deepseek\\project', running: true, attention: false }] },
      expertCatalog: { kind: 'ready', value: { presets: [], skills: [] } },
      tokenUsage: { kind: 'ready', value: { uncachedInputTokens: 120, outputTokens: 40, cacheReadTokens: 80, cacheWriteTokens: 0, estimated: false, tokensPerSecond: 20 } },
      goal: { kind: 'ready', value: { objective: 'Ship Phase 1', phase: 'active', roundsStarted: 2, maxGoalRounds: 8 } },
      todos: { kind: 'ready', value: { done: 1, total: 2, next: ['Run smoke test'] } },
      jobs: { kind: 'ready', value: [{ id: 'job-1', kind: 'bash', label: 'Build package', status: 'running' }] },
      subagents: { kind: 'ready', value: [{ id: 'agent-1', title: 'Review startup', running: false }] },
      recentTools: { kind: 'ready', value: [{ name: 'read', time: Date.now(), state: 'done' }] },
      git: { kind: 'ready', value: { branch: 'main', staged: 1, unstaged: 2, untracked: 3 } },
    }))
    const root = createRoot(owner)
    root.render(createElement(OverviewPanel, { stores }))
    await settle()

    const text = owner.textContent ?? ''
    for (const value of ['project', 'Release review', 'Ship Phase 1', 'Run smoke test', 'Build package', 'Review startup', 'read', 'main']) {
      expect(text).toContain(value)
    }
    expect(document.querySelector('[data-aionui-explorer-col]')).toBeNull()

    root.unmount()
  })
})
