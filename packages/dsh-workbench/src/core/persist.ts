/**
 * Per-project UI persistence: one JSON record per project root in
 * localStorage (`dsh-workbench-ui:<root>`), range-validated on read so a
 * broken or hand-edited value falls back to defaults instead of corrupting
 * the layout. Writes are idempotent (same-value writes are skipped).
 * @module dsh-workbench/core/persist
 */

import { DEFAULT_UI_STATE, type WorkbenchUiState } from './types.ts'

/** Storage key prefix for the per-project UI record. */
export const KEY_UI_PREFIX = 'dsh-workbench-ui:'

/** Parse a stored JSON value; fallback on any failure. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object') return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

/** Serialize a JSON value (quota failures degrade silently). */
export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Read one project's UI state (defaults when absent or invalid). */
export function readUiState(root: string): WorkbenchUiState {
  if (root === '') return { ...DEFAULT_UI_STATE }
  const stored = readJson<Partial<WorkbenchUiState>>(`${KEY_UI_PREFIX}${root}`, {})
  return {
    overviewActive: stored.overviewActive === true,
  }
}

/** Write one project's UI state (no-op for the empty root). */
export function writeUiState(root: string, state: WorkbenchUiState): void {
  if (root === '') return
  writeJson(`${KEY_UI_PREFIX}${root}`, state)
}
