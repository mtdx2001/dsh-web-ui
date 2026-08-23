import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { createWorkspaceGate } from '../src/host/workspace-gate.ts'

describe('Workbench workspace gate', () => {
  let registered = ''
  let unknown = ''

  beforeAll(async () => {
    registered = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-workbench-registered-'))
    unknown = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-workbench-unknown-'))
  })

  afterAll(async () => {
    await fs.rm(registered, { recursive: true, force: true })
    await fs.rm(unknown, { recursive: true, force: true })
  })

  it('admits only roots resolved by the official workspace registry service', async () => {
    const ctx = {
      get(name: string) {
        if (name !== 'workspaceRegistry') return undefined
        return { resolveByPath: async (candidate: string) => candidate === registered ? { path: registered } : undefined }
      },
    } as unknown as Context
    const gate = createWorkspaceGate(ctx)
    expect(await gate(registered)).toEqual({ ok: true, canonical: registered })
    expect(await gate(unknown)).toEqual({ ok: false, error: 'workspace-unknown' })
  })

  it('fails closed when the workspace registry capability is absent', async () => {
    const gate = createWorkspaceGate({} as Context)
    expect(await gate(registered)).toEqual({ ok: false, error: 'workspace-unknown' })
  })
})
