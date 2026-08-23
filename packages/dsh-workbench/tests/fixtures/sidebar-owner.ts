export type SidebarRowSlot = 'sidebar.rows.top' | 'sidebar.rows.bottom'

export interface SidebarRowContribution {
  readonly id: string
  readonly render: (owner: { readonly wide: boolean }) => string
}

const ROW_SLOTS: readonly SidebarRowSlot[] = ['sidebar.rows.top', 'sidebar.rows.bottom']

/** Small in-memory model of the upstream Sidebar owner contract. */
export class SidebarOwnerFixture {
  private ownerId: string | undefined
  private readonly declared = new Set<SidebarRowSlot>()
  private readonly contributions = new Map<SidebarRowSlot, Map<string, SidebarRowContribution>>()

  mountOwner(id: string, slots: readonly SidebarRowSlot[] = ROW_SLOTS): () => void {
    if (this.ownerId !== undefined) return () => {}
    this.ownerId = id
    this.declared.clear()
    for (const slot of slots) this.declared.add(slot)
    for (const slot of ROW_SLOTS) this.contributions.set(slot, new Map())
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.ownerId !== id) return
      this.ownerId = undefined
      this.declared.clear()
      for (const rows of this.contributions.values()) rows.clear()
    }
  }

  registerRow(slot: SidebarRowSlot, contribution: SidebarRowContribution): () => void {
    if (this.ownerId === undefined || !this.declared.has(slot)) return () => {}
    const rows = this.contributions.get(slot)!
    if (rows.has(contribution.id)) throw new Error(`Sidebar row already registered: ${contribution.id}`)
    rows.set(contribution.id, contribution)
    let active = true
    return () => {
      if (!active) return
      active = false
      if (rows.get(contribution.id) === contribution) rows.delete(contribution.id)
    }
  }

  render(slot: SidebarRowSlot, wide = true): readonly string[] {
    return [...(this.contributions.get(slot) ?? new Map()).values()].map((row) => row.render({ wide }))
  }

  hasOwner(): boolean {
    return this.ownerId !== undefined
  }

  declaredSlots(): readonly SidebarRowSlot[] {
    return [...this.declared]
  }
}

export function registerWorkbenchRows(
  owner: SidebarOwnerFixture,
  rows: readonly SidebarRowContribution[],
): () => void {
  const disposers: Array<() => void> = []
  for (const slot of ROW_SLOTS) {
    for (const row of rows.filter((candidate) => candidate.id.startsWith(slot.endsWith('top') ? 'top-' : 'bottom-'))) {
      disposers.push(owner.registerRow(slot, row))
    }
  }
  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
  }
}
