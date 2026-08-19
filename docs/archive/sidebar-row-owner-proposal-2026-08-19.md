# Sidebar Row Owner Proposal

## Decision

The current rc.6 runtime cannot add `sidebar.rows.top` or `sidebar.rows.bottom` from a side-loaded community bundle. Slot declarations are owned by the parent entry that registers the slot. The `sidebar` entry is a single child of `root`, and `ui-sidebar` owns its complete `children` table.

A community bundle must not shadow `sidebar` or `root` to obtain the missing declarations. Shadowing replaces the complete single-slot entry and would also replace the official Sidebar or AppFrame tree, including workspace, session, settings, layout, and accessibility behavior.

The compatible implementation point is the upstream `@deepseek-ai/dsh-client-ui-sidebar` owner.

## Minimal upstream patch

In `packages/client/ui-sidebar`:

1. Extend the existing `sidebar` registration children table with:

```ts
'sidebar.rows.top': {
  kind: 'list',
  scope: 'root',
  owner: { wide: boolean },
},
'sidebar.rows.bottom': {
  kind: 'list',
  scope: 'root',
  owner: { wide: boolean },
},
```

2. Render `sidebar.rows.top` immediately after the New Session control and before the workspace region.

3. Render `sidebar.rows.bottom` immediately after the workspace region and before the footer/settings region.

4. Pass only the stable owner face required by the Workbench row host. The owner must not expose private Sidebar state, DOM nodes, or layout controller internals.

5. Keep the declarations and render calls in the same `SidebarRoot` entry. The slot registry will then automatically remove both declarations and their contributions when the Sidebar entry unloads.

The exact upstream JSX order is:

```tsx
{newSession}
{renderSlot('sidebar.rows.top', { wide })}
{renderSlot('sidebar.workspaces', { wide })}
{renderSlot('sidebar.rows.bottom', { wide })}
{footer}
{renderSlot('sidebar.settings', { wide })}
```

The names and order are the Workbench compatibility contract. The owner may choose the concrete wrapper markup and spacing, but must preserve a bounded row stack and the collapsed-rail `wide` behavior.

## Version and failure behavior

The Workbench bundle probes both row keys through `ctx.slots.inject`. On rc.6, the probe returns no registration because the keys are undeclared. On a compatible Sidebar, the same contribution activates in the official React tree.

The contribution must remain local if registration fails. A duplicate declaration, missing owner, incompatible owner props, or Sidebar unload must not abort Workbench startup or affect the retained Task Board entry.

Task Board keeps its existing retained-entry fallback until a compatible owner is present. Its row adapter reuses `BoardController` state and toggle behavior; execution, scheduling, persistence, and session ownership remain in Task Board.

## Validation matrix

| Runtime | Expected behavior |
| --- | --- |
| rc.6 Sidebar | Workbench probes keys; no row registration; Task Board fallback remains available |
| Compatible Sidebar | Top and bottom hosts render in official Sidebar React tree |
| Workbench unload | Row registrations and host entries dispose; Sidebar remains mounted |
| Sidebar unload | Child declarations collapse; row contributions become empty and stale disposers are no-ops |
| Duplicate upstream owner | Registration fails locally; no second Sidebar tree is created |

## Evidence

- Installed Sidebar owner: `@deepseek-ai/dsh-client-ui-sidebar@0.1.0-rc.6`, `lib/client.js`, `SidebarRoot` registration around the `sidebar` child declaration.
- Installed layout owner: `@deepseek-ai/dsh-client-ui-layout@0.1.0-rc.6`, `lib/client.js`, `AppFrame` registers `sidebar` as a single child of `root`.
- Slot lifecycle: `@deepseek-ai/dsh-client-ui-slots`, child declarations are created from `register(..., { children })` and collapse recursively when the parent entry is disposed.
- Workbench implementation: `packages/dsh-workbench/src/core/row-registry.ts`, `packages/dsh-workbench/src/client/SidebarRows.tsx`.
