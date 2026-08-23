import { describe, expect, it } from 'vitest'
import { agentSessionRowsOf, CHAT_FLOOR_PX, correctPanelWidths, extractRecentTools, gitSummaryOf, jobRowsOf, projectNameOf, sessionStatusOf, subagentRowsOf, summarizeGoal, tokenUsageSummaryOf, todoSummaryOf } from '../src/core/derive.ts'

describe('workbench derivations', () => {
  it('derives project and session status', () => {
    expect(projectNameOf('E:\\deepseek\\project\\')).toBe('project')
    expect(sessionStatusOf({ running: true })).toBe('running')
    expect(sessionStatusOf({ running: false, pendingInteraction: {} })).toBe('attention')
  })

  it('derives recent project sessions with the current session first', () => {
    expect(agentSessionRowsOf([
      { id: 'old', cwd: 'E:/project', title: 'Old', running: false },
      { id: 'current', cwd: 'E:/project', displayTitle: 'Current', running: true, pendingInteraction: {} },
      { id: 'other', cwd: 'E:/other', title: 'Other', running: true },
    ], 'current', 'E:/project')).toEqual([
      { id: 'current', title: 'Current', cwd: 'E:/project', running: true, attention: true },
      { id: 'old', title: 'Old', cwd: 'E:/project', running: false, attention: false },
    ])
  })

  it('validates live token usage projections', () => {
    expect(tokenUsageSummaryOf({ uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 0, estimated: true, tokensPerSecond: 12.5 })).toEqual({
      uncachedInputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 80,
      cacheWriteTokens: 0,
      estimated: true,
      tokensPerSecond: 12.5,
    })
    expect(tokenUsageSummaryOf({ uncachedInputTokens: -1, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeUndefined()
  })

  it('summarizes official goal and todo projections', () => {
    expect(todoSummaryOf([{ content: 'done', status: 'completed' }, { content: 'next', status: 'in_progress' }])).toEqual({ done: 1, total: 2, next: ['next'] })
    expect(summarizeGoal({ goal: { objective: 'ship', phase: 'active', maxGoalRounds: 8 }, roundsStarted: 3 })).toEqual({ objective: 'ship', phase: 'active', maxGoalRounds: 8, roundsStarted: 3 })
    expect(summarizeGoal(null)).toBeNull()
  })

  it('uses direct durable subagent catalogs including diagnostics', () => {
    expect(subagentRowsOf([{ kind: 'child', id: 'a', label: 'review', activity: 'running' }, { kind: 'diagnostic', id: 'b', reason: 'corrupt' }])).toEqual([
      { id: 'a', title: 'review', running: true },
      { id: 'b', title: 'b (corrupt)', running: false },
    ])
  })

  it('sorts live jobs and recent tools', () => {
    expect(jobRowsOf([{ id: '1', kind: 'bash', label: 'done', status: 'completed' }, { id: '2', kind: 'bash', label: 'live', status: 'running' }])[0].id).toBe('2')
    const rows = extractRecentTools([{ kind: 'tool-result', time: 10, callId: 'a', call: { name: 'Bash', argsRaw: '{}' }, isError: false }], [{ name: 'Read', time: 20 }], 8)
    expect(rows.map((row) => row.name)).toEqual(['Read', 'Bash'])
    const window = Array.from({ length: 10_000 }, (_, index) => ({ kind: 'tool-result', time: index, callId: String(index), call: { name: String(index), argsRaw: '{}' } }))
    expect(extractRecentTools(window, [], 3).map((row) => row.name)).toEqual(['9999', '9998', '9997'])
  })

  it('summarizes git and keeps the 480px width policy pure', () => {
    expect(gitSummaryOf({ branch: 'main', staged: [{}], unstaged: [], untracked: [{}] })).toEqual({ branch: 'main', staged: 1, unstaged: 0, untracked: 1 })
    expect(CHAT_FLOOR_PX).toBe(480)
    expect(correctPanelWidths({ frameWidth: 1600, sidebarPx: 280, detailsPx: 0, previewPx: 580, explorerPx: 300, minPreviewPx: 340, minExplorerPx: 220 })).toEqual({ previewPx: 540, explorerPx: 300 })
    expect(correctPanelWidths({ frameWidth: 900, sidebarPx: 280, detailsPx: 0, previewPx: 340, explorerPx: 220, minPreviewPx: 340, minExplorerPx: 220 })).toBeNull()
  })
})
