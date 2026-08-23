# AGENTS.md - dsh-workbench

DSH Web GUI execution workbench. This file contains package-specific
rules only; repository and package-wide rules remain authoritative.

## Package contracts

- The status surface contributes only through
  `conversation.session.header.utilities`. The central mode host contributes
  only through `conversation.mainSurface`, receives the complete official
  Agent tree as owner currency, and keeps that tree mounted unchanged. Never
  insert nodes or create a second React root inside the conversation tree.
- Browser `apply()` must stay boot-light. Runtime session reads and observers
  start through `afterFirstPaint()` and every optional failure stays local.
- Data comes from official client runtime sessions/workspaces/projections and
  the package-owned read-only Git summary route. Workbench owns one right-sidebar
  host through `desktop.rightSidebar`; Desktop remains the sole frame/grid,
  width, resize, collapse, and responsive-layout owner.
- The right-sidebar extension contract has one shape only: one top tab maps to
  one complete full-height content region. Workbench owns tab state, scrolling,
  persistence, fallback, and failure isolation; contributors never own width,
  columns, resize, collapse, or responsive geometry. Upstream `details` remains
  a reserved tab and degrades to the original Details surface when Workbench is absent.
- Left-side rows contribute only through the official `sidebar.rows.top` and
  `sidebar.rows.bottom` list slots. The Sidebar owner controls their physical
  placement and geometry; Workbench must not probe selectors, insert DOM nodes,
  create a body portal, or mount an additional React root.
- Recent-tool derivation must stay bounded by the display cap; never sort the
  complete conversation window during browser startup.
- Module navigation uses the single disposable sidebar host. It may render
  expandable rows only inside that host and must not add a permanent rail,
  floating context panel, or another layout column.
- Task Board and SSH integration uses only optional main-surface contributions.
  Workbench owns mode visibility, order, selection, persistence, and Agent
  fallback; never change scheduling, credential, connection, execution,
  transfer, or tunnel ownership from this package.
- AionUI is neither an install nor runtime dependency. Files and Changes ship
  in-package as the `workbench-files:files` and `workbench-changes:changes`
  right-panel contributors; optional Preview and other extension contributors
  use the public Workbench registry and fail locally. Their absence never
  removes Overview, Details, or the shared right column.
- `/dsh-workbench/git-changes` never trusts client-supplied file state. The
  server re-derives porcelain state per request and enforces the write policy:
  staged rows unstage only; unstaged rows stage or discard; untracked rows
  stage or single-file delete; unmerged conflict rows refuse every write.
  Untracked delete realpaths the parent directory and removes the final
  component without following it, so a symlink loses the link, never its
  target. Discard and delete stay per-file behind explicit confirmation;
  never add a bulk discard. Diff output is bounded and carries a truncation
  flag.

## Required checks

```sh
pnpm --filter @mtdx2001/dsh-client-ui-workbench typecheck
pnpm --filter @mtdx2001/dsh-client-ui-workbench test
pnpm --filter @mtdx2001/dsh-client-ui-workbench build
```
