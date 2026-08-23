# @mtdx2001/dsh-client-ui-workbench

English | [中文](README.zh.md)

DSH Web GUI execution workbench with a public central mode bar, an official Session Header status utility, official Sidebar component stacks, and a Workbench-owned right sidebar.

## What it does

- Occupies the optional official `conversation.mainSurface` single slot and receives the complete official Agent tree as owner currency. The central bar keeps that tree mounted unchanged, adds Agent as a reserved mode, and renders source-qualified complete views from installed contributors. Workbench owns mode visibility, order, selection, default/last persistence, error isolation, and Agent fallback; it never rebuilds the official Session Header, view ring, or composer.
- Registers `workbench-status` in `conversation.session.header.utilities`; the official conversation React tree owns mounting and cleanup.
- Provides a disposable sidebar-row registry and declaration-aware contributions for the official `sidebar.rows.top` / `sidebar.rows.bottom` list slots. Every current or future contributor is admitted through one plugin-agnostic declaration protocol: the registry applies deterministic defaults, validates metadata and required callbacks, rejects unsafe or ambiguous declarations with structured diagnostics, and then automatically exposes admitted rows to the official Sidebar seats and component settings. Older Sidebar owners that do not declare these slots remain unchanged.
- The host owns `action`, `disclosure`, and `toggle` interaction semantics. Legacy rows with details normalize to disclosures, while legacy rows without details normalize to direct actions; normalization never rewrites plugin source. Contributor rendering, lifecycle, state, and interaction failures remain local to that row.
- Registers a `Workbench layout` page through the optional official `settings.section` slot. Registered central modes, left stacks, and right-sidebar extension components can be hidden, reordered, removed, restored, or reset without mutating registration order. Agent is fixed; central contributors may be set as default, and startup may restore the last central mode. Add is always available: users can create a persistent structured information row in either official Sidebar seat or a structured text tab in the Desktop-owned right sidebar, while removed installed contributors remain separately restorable. Custom definitions contain bounded plain text only; the form accepts no arbitrary component ID, JavaScript, React code, credential, URL, or web embed. Visible controls use the runtime-provided official `@deepseek-ai/dsh-client-ui-primitives` Button, Pill, Input, Modal, and icon exports, so official theme and primitive updates flow through without copying private Settings classes; Workbench owns only the dynamic layout. The reserved upstream Details tab and official New Session, session list, workspace, and Settings surfaces remain fixed.
- Keeps Agent on the official session list and conversation surface. Task Board and SSH register optional complete central-mode views through the Workbench service; scheduling, cron, credentials, connections, execution, transfer, and tunnel behavior remain owned by those plugins.
- Stores only versioned component IDs, enabled flags, positions, and removed flags in `dsh-workbench-component-preferences:v1:global`. Central active/default/restore-last state is isolated in the host-owned `$DSH_HOME/dsh-workbench-main-surface.json` file so Desktop random-port restarts retain it; the same localStorage key remains only as a compatibility cache. The fixed v1 record contains those three non-secret fields only. Labels, routes, business configuration, credential references, tokens, and secrets are never persisted there.
- Starts runtime reads, module adapters, and language observation after two animation frames. Synchronous `apply()` only registers services and official slot contributions.
- Extracts recent tools with a bounded newest-first scan and never sorts the complete conversation window during startup.

## Integration boundaries

| Surface | Contract | Workbench behavior |
| --- | --- | --- |
| Central modes | optional `conversation.mainSurface` single slot | wraps the complete upstream Agent node with a mode bar; fallback returns Agent unchanged |
| Session status | `conversation.session.header.utilities` | additive official slot contribution |
| Sidebar rows | optional `sidebar.rows.top` / `sidebar.rows.bottom` | declaration-aware list contributions owned and rendered by a compatible Sidebar React tree |
| Component settings | optional `settings.section` | manages non-secret UI preferences; the official Settings shell owns mounting and close state |
| Agent | official sessions and conversation | adopts the official UI; Workbench does not replace either surface |
| Task Board / SSH | optional structural `workbench` service | source-qualified complete central views; business behavior remains plugin-owned |
| Right sidebar | optional `desktop.rightSidebar` single slot | Workbench owns icon-and-text tabs and one full content region; Desktop owns the existing third column |

Right-side extensions have one shape only: one top tab maps to one complete content region. Contributors provide only `source`, `id`, `label`, `icon`, `order`, and `render`; Workbench owns tab state, scrolling, persistence, fallback, and failure isolation, while Desktop owns geometry. Overview is built in and upstream Details is a reserved compatibility tab. The independent `workbench-files:files` contributor browses the current session workspace through the package-owned read-only `/dsh-workbench/files` route. Every request must pass the official `workspaceRegistry` membership gate before structured path resolution rejects traversal, absolute paths, symlink escapes, and repository-internal `.git` paths; listings and text-only previews are bounded, `.git` is hidden while ordinary dotfiles remain visible, and search covers files already loaded into the tree. It never edits, stages, or mutates anything. The independent `workbench-changes:changes` contributor groups staged, unstaged, and untracked files from the read-only `/dsh-workbench/git-status` route and offers per-file stage, unstage, discard, and single-file delete through the `/dsh-workbench/git-changes` route. The server re-derives each file's porcelain state itself and enforces the write policy server-side: staged rows unstage only, unstaged rows stage or discard, untracked rows stage or delete, and unmerged conflict rows refuse every write. Discard and delete require explicit confirmation, there is no bulk discard, untracked delete removes the link rather than its symlink target, diff output is bounded with a truncation marker, and every successful write re-reads the host status instead of updating the list optimistically. Optional Preview contributors use the same public registry and fail locally. With Workbench absent, Desktop renders upstream Details directly. AionUI is not an install, runtime, code, service, or DOM dependency.

## Responsive behavior

The official Sidebar and Desktop layout controller retain all width, resize, collapse, drawer, and narrow-window behavior. Workbench contributes rows and right-sidebar content only; it does not create another rail, permanent column, frame-grid owner, or responsive breakpoint system.

## Install

The package is an independent Cordis bundle declared by `cordis.patch.yml`; it does not require `dsh-web-ui-all` or AionUI. A Desktop release exposing `desktop.rightSidebar` enables the owned right sidebar. Older hosts keep the status and left-side features while the right sidebar degrades cleanly. Installation preserves the profile's existing plugins and their business data: Task Board, SSH, AionUI, and other contributors remain independent. Registered components automatically appear in Workbench component settings, where users can enable, reorder, remove, or restore them; users can also create bounded plain-text information rows and right-sidebar text tabs, while arbitrary component IDs and executable content remain forbidden. Source-qualified IDs prevent unrelated contributors with the same local ID from colliding, temporarily missing contributors keep their versioned preferences for later restoration, and a rejected `desktop.rightSidebar` single-slot registration disables only the Workbench right host instead of aborting client startup. Existing `mountOnce` and client-module deduplication rules handle independent/all-in-one dual sources without copying another profile's `node_modules` or overwriting its manifest.

## Config

Task Board, SSH, Settings, sessions, and workspaces keep their own configuration and ownership. `newsSources` optionally configures an explicit allowlist of trusted HTTPS RSS/Atom endpoints; an empty list produces a normal empty state. Knowledge uses the official `sessionQuery` service: deployments that want message-content search must enable the existing `session-query-sqlite` provider with `openAt: first-search` or `startup` and a dedicated derived-index path.

## Verification

```sh
pnpm --filter @mtdx2001/dsh-client-ui-workbench typecheck
pnpm --filter @mtdx2001/dsh-client-ui-workbench test
pnpm --filter @mtdx2001/dsh-client-ui-workbench build
```

Tests cover module registration and rollback, pending-transition invalidation, central-mode registration and Agent fallback, startup isolation, continuous owner-frame sizing through container queries, Chinese and English copy, long text, unavailable states, keyboard navigation, mobile focus containment, and focus restoration. Changes coverage adds server-side porcelain state derivation, the per-state write policy including conflict refusal, symlink-safe untracked delete, mocked route admission and rejection, and panel group/diff/confirmation behavior against real temporary git repositories.

## Known limitations

- `shell.overlay` reserves no layout track, so the rail and context panel intentionally float over the frame and remain compact or on demand.
- Sidebar row contributions require an owner that declares and renders `sidebar.rows.top` / `sidebar.rows.bottom`. The isolated rc.1 composition used for this Workbench ships both public seats; older Sidebar owners leave these contributions dormant without triggering a private-DOM fallback.
- Central modes require a compatible Conversation owner that declares `conversation.mainSurface`. Without it, Workbench registration fails locally and the official Agent surface remains unchanged; Task Board and SSH never fall back to private central-column DOM takeover.
- Settings is an official modal and must be closed through its own controls before returning to underlying shell content.
- The current Desktop adapter must be upstreamed or shipped by a compatible Desktop release; Workbench capability-detects the slot and remains usable without it.
- Knowledge message search depends on the deployment's official `sessionQuery` provider; the DSH base profile disables full-text search by default with `openAt: never`.
- News has no built-in remote source; it remains empty until the Host configures trusted `newsSources` entries.
- The Changes contributor requires `git` on the host PATH; its absence degrades only that tab's operations to a structured unavailable error.
