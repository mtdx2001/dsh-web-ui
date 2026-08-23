export type NavigationLayoutMode = 'wide' | 'compact' | 'drawer' | 'mobile'

export interface NavigationLayout {
  readonly mode: NavigationLayoutMode
  readonly railSize: number
  readonly contextWidth: number
  readonly contextOverlay: boolean
}

/** Stable breakpoint policy for the shell-overlay navigation surface. */
export function navigationLayoutFor(viewportWidth: number): NavigationLayout {
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0
  if (width >= 1600) return { mode: 'wide', railSize: 52, contextWidth: 300, contextOverlay: true }
  if (width >= 1200) return { mode: 'compact', railSize: 52, contextWidth: 272, contextOverlay: true }
  if (width >= 900) return { mode: 'drawer', railSize: 50, contextWidth: 264, contextOverlay: true }
  return { mode: 'mobile', railSize: 48, contextWidth: Math.max(220, Math.min(320, width - 76)), contextOverlay: true }
}
