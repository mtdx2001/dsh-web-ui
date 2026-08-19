/**
 * React binding for the framework-free stores: useSyncExternalStore with a
 * stable snapshot (the stores return immutable snapshots, so selector-free
 * subscription is safe).
 * @module dsh-workbench/client/hooks/useStore
 */

import { useSyncExternalStore } from 'react'
import type { StateHandle } from '../../core/store.ts'

/** Subscribe a component to one store (full snapshot). */
export function useStore<S>(store: StateHandle<S>): S {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
