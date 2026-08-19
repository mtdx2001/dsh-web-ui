# AGENTS.md - dsh-workbench

DSH Web GUI execution workbench. This file contains package-specific
rules only; repository and package-wide rules remain authoritative.

## Package contracts

- The status surface contributes only through
  `conversation.session.header.utilities`. Never insert nodes or create a
  second React root inside the conversation or AionUI-owned React trees.
- Browser `apply()` must stay boot-light. Runtime session reads and observers
  start through `afterFirstPaint()` and every optional failure stays local.
- Data comes only from official client runtime sessions/workspaces/projections.
  Overview registers through AionUI's owned Dock service and renders inside its
  existing Explorer React root; Workbench never mounts into AionUI DOM.
- The width correction in `src/core/derive.ts` is pure design logic only. Do
  not start a second frame-grid owner beside AionUI's layout controller.
- Recent-tool derivation must stay bounded by the display cap; never sort the
  complete conversation window during browser startup.
- Module navigation contributes only through the official `shell.overlay` list
  slot. The visible rail/context surface may receive input; uncovered overlay
  space stays pointer-transparent.
- Task Board and SSH integration uses only optional retained-entry adapters.
  Never change their scheduling, credential, connection, execution, transfer,
  or tunnel ownership from this package.
- The AionUI-owned Dock service is the only Overview path. Workbench does not
  own a second frame grid or React root anywhere; the legacy Overview DOM
  mount, width guard, and body portal host were removed, so never reintroduce
  DOM injection into shell, conversation, or AionUI-owned trees.

## Required checks

```sh
pnpm --filter @linxin666/dsh-client-ui-workbench typecheck
pnpm --filter @linxin666/dsh-client-ui-workbench test
pnpm --filter @linxin666/dsh-client-ui-workbench build
```
