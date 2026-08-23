import { describe, expect, it } from 'vitest'
import { fileStatusMapOf, filterFileTree, type FileTreeNode } from '../src/core/files-tree.ts'

const tree: FileTreeNode[] = [
  {
    name: 'src', path: 'src', kind: 'directory', children: [
      { name: 'app.ts', path: 'src/app.ts', kind: 'file' },
      { name: 'util.ts', path: 'src/util.ts', kind: 'file' },
    ],
  },
  { name: 'README.md', path: 'README.md', kind: 'file' },
]

describe('filterFileTree', () => {
  it('keeps matching files and their ancestor directories', () => {
    const filtered = filterFileTree(tree, 'util')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('src')
    expect(filtered[0].children?.map((node) => node.name)).toEqual(['util.ts'])
  })
  it('returns the full tree for an empty query and matches case-insensitively', () => {
    expect(filterFileTree(tree, '  ')).toHaveLength(2)
    expect(filterFileTree(tree, 'README')[0].name).toBe('README.md')
  })
})

describe('fileStatusMapOf', () => {
  it('maps staged, unstaged, and untracked rows and normalizes separators', () => {
    const map = fileStatusMapOf({
      staged: [{ path: 'src\\app.ts', state: 'modified' }],
      unstaged: [{ path: 'a.ts', state: 'deleted' }],
      untracked: [{ path: 'new.ts', state: 'untracked' }],
    })
    expect(map.get('src/app.ts')).toBe('modified')
    expect(map.get('a.ts')).toBe('deleted')
    expect(map.get('new.ts')).toBe('untracked')
  })
  it('ignores unknown states and missing payloads', () => {
    expect(fileStatusMapOf(null).size).toBe(0)
    expect(fileStatusMapOf({ staged: [{ path: 'x', state: 'conflicted' }] }).size).toBe(0)
  })
})
