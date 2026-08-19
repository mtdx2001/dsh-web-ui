import { describe, expect, it } from 'vitest'
import { navigationLayoutFor } from '../src/core/navigation-layout.ts'

describe('workbench overlay responsive policy', () => {
  it.each([
    [1600, 'wide', 52, 300],
    [1200, 'compact', 52, 272],
    [1199, 'drawer', 50, 264],
    [900, 'drawer', 50, 264],
    [899, 'mobile', 48, 320],
    [320, 'mobile', 48, 244],
  ] as const)('maps %ipx to stable overlay geometry', (width, mode, railSize, contextWidth) => {
    expect(navigationLayoutFor(width)).toEqual({ mode, railSize, contextWidth, contextOverlay: true })
  })

  it('contains invalid viewport values', () => {
    expect(navigationLayoutFor(Number.NaN)).toEqual({ mode: 'mobile', railSize: 48, contextWidth: 220, contextOverlay: true })
  })
})
