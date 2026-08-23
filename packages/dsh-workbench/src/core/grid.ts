/**
 * Grid-template-columns parsing helpers (pure string math, shared by the
 * width guard and its tests). Mirrors the panel system's parser contract:
 * tracks split on top-level spaces only, so "minmax(0, 1fr)" stays whole.
 * @module dsh-workbench/core/grid
 */

/** Parse an inline grid-template-columns string into its tracks ('' on failure). */
export function parseGridTracks(input: string): string[] {
  const tracks: string[] = []
  let depth = 0
  let current = ''
  for (const char of input) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ' ' && depth === 0) {
      if (current !== '') {
        tracks.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current !== '') tracks.push(current)
  return tracks
}

/** Extract a px width from one track (0 for fr/minmax/non-px tracks). */
export function trackPx(track: string): number {
  const match = /^(-?[\d.]+)px$/.exec(track.trim())
  return match === null ? 0 : Number(match[1])
}

/** Render the five-track grid the panel system owns (sidebar, center, details, preview, explorer). */
export function renderFiveTracks(sidebar: string, details: string, previewPx: number, explorerPx: number): string {
  return `${sidebar} minmax(0, 1fr) ${details} ${Math.round(previewPx)}px ${Math.round(explorerPx)}px`
}
