import { describe, expect, it } from 'vitest'
import { parseGridTracks, renderFiveTracks, trackPx } from '../src/core/grid.ts'

describe('parseGridTracks', () => {
  it('splits top-level spaces only (minmax stays whole)', () => {
    expect(parseGridTracks('280px minmax(0, 1fr) 0px')).toEqual(['280px', 'minmax(0, 1fr)', '0px'])
    expect(parseGridTracks('280px minmax(0, 1fr) 0px 480px 260px')).toHaveLength(5)
    expect(parseGridTracks('')).toEqual([])
  })
})

describe('trackPx', () => {
  it('reads px tracks and zeroes fr/minmax tracks', () => {
    expect(trackPx('480px')).toBe(480)
    expect(trackPx('0px')).toBe(0)
    expect(trackPx('minmax(0, 1fr)')).toBe(0)
    expect(trackPx('1fr')).toBe(0)
  })
})

describe('renderFiveTracks', () => {
  it('renders the panel system five-track shape with rounded px', () => {
    expect(renderFiveTracks('280px', '0px', 480.4, 260.6))
      .toBe('280px minmax(0, 1fr) 0px 480px 261px')
  })
})
