import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expandHome, resolveDshHome } from '../host/dsh-home.ts'

describe('expandHome', () => {
  it('expands a leading tilde onto the home directory', () => {
    const home = join('/', 'home', 'u')
    const expanded = expandHome('~/x', home)
    expect(expanded).toBe(join(home, 'x'))
    expect(expanded.startsWith('~')).toBe(false)
  })

  it('leaves non-tilde paths untouched', () => {
    expect(expandHome('/abs/path')).toBe('/abs/path')
    expect(expandHome('rel/path')).toBe('rel/path')
  })
})

describe('resolveDshHome', () => {
  it('prefers the DSH_HOME environment override', () => {
    const home = join('/', 'home', 'u')
    expect(resolveDshHome({ DSH_HOME: '/custom/dsh' }, home)).toBe('/custom/dsh')
    expect(resolveDshHome({ DSH_HOME: '~/custom' }, home)).toBe(join(home, 'custom'))
  })

  it('ignores a blank override and falls back to ~/.dsh', () => {
    const home = join('/', 'home', 'u')
    expect(resolveDshHome({ DSH_HOME: '   ' }, home)).toBe(join(home, '.dsh'))
    expect(resolveDshHome({}, home)).toBe(join(home, '.dsh'))
  })
})
