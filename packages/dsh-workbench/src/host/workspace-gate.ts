import { realpath } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'

interface WorkspaceRegistryFace {
  resolveByPath(path: string): Promise<{ path: string } | undefined>
}

export type WorkspaceGateResult =
  | { ok: true; canonical: string }
  | { ok: false; error: 'workspace-unknown' }

export type WorkspaceGate = (root: string) => Promise<WorkspaceGateResult>

/** Admit only canonical roots owned by the official workspace registry. */
export function createWorkspaceGate(ctx: Context): WorkspaceGate {
  return async (root) => {
    if (typeof root !== 'string' || root.trim() === '') return { ok: false, error: 'workspace-unknown' }
    let canonical: string
    try {
      canonical = await realpath(root)
    } catch {
      return { ok: false, error: 'workspace-unknown' }
    }
    const getService = (ctx as unknown as { get?: (name: string, strict?: boolean) => unknown }).get
    const registry = typeof getService === 'function'
      ? getService.call(ctx, 'workspaceRegistry', false) as WorkspaceRegistryFace | undefined
      : (ctx as unknown as { workspaceRegistry?: WorkspaceRegistryFace }).workspaceRegistry
    if (registry === undefined || typeof registry.resolveByPath !== 'function') return { ok: false, error: 'workspace-unknown' }
    const workspace = await registry.resolveByPath(canonical)
    return workspace?.path === canonical
      ? { ok: true, canonical }
      : { ok: false, error: 'workspace-unknown' }
  }
}
