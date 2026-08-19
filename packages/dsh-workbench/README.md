# @linxin666/dsh-client-ui-workbench

English | [中文](README.zh.md)

DSH Web GUI execution workbench with an official Session Header status utility and an official `shell.overlay` module navigator.

## What it does

- Registers `workbench-status` in `conversation.session.header.utilities`; the official conversation React tree owns mounting and cleanup.
- Registers `workbench-navigation` in `shell.overlay`; the official layout React tree owns a 48-52px icon rail and an on-demand context panel.
- Provides eight stable rail modules through the optional `workbench` Cordis service: Agent, Task Board, Knowledge, Experts, News, Monitoring, SSH, and Settings. Knowledge searches the official visible-session content index, Experts reads the deployment preset and current-project skill catalogs, News reads an explicit Host allowlist, and Monitoring shows token usage, throughput, jobs, subagents, and recent tools from official runtime projections.
- Provides a disposable sidebar-row registry and declaration-aware hosts for optional `sidebar.rows.top` / `sidebar.rows.bottom` list slots. Older Sidebar owners that do not declare these slots remain unchanged; row contributors register without DOM injection and activate when a compatible owner appears.
- Keeps Agent on the official session list and conversation surface. Task Board and SSH use optional adapters to their retained legacy entries; scheduling, cron, credentials, connections, execution, transfer, and tunnel behavior remain owned by those plugins.
- Starts runtime reads, module adapters, language observation, and overlay geometry observation after two animation frames. Synchronous `apply()` only registers services and official slot contributions.
- Supports Arrow Up, Arrow Down, Home, End, Escape, focus restoration, accessible labels, unavailable states, and a keyboard-modal mobile context drawer.
- Extracts recent tools with a bounded newest-first scan and never sorts the complete conversation window during startup.

## Integration boundaries

| Surface | Contract | Workbench behavior |
| --- | --- | --- |
| Session status | `conversation.session.header.utilities` | additive official slot contribution |
| Module navigation | `shell.overlay` | additive click-through overlay; only the visible rail, panel, and mobile scrim receive pointer input |
| Sidebar rows | optional `sidebar.rows.top` / `sidebar.rows.bottom` | declaration-aware list contributions owned and rendered by a compatible Sidebar React tree |
| Agent | official sessions and conversation | adopts the official UI and closes an active legacy external panel |
| Task Board / SSH | stable retained entry buttons and active attributes | one-shot availability checks and clicks; no observer and no business-controller access |
| Settings | official sidebar dialog trigger | one-shot open action; panel state remains official-shell owned |

The AionUI-owned Dock service is the only Overview path: Overview registers as a Dock tab and is rendered by the AionUI Explorer React root, so Workbench owns no second frame grid or React root inside shell, conversation, or AionUI-owned trees. The legacy Overview DOM mount, width guard, and body portal host were removed.

## Responsive behavior

| AppFrame width | Mode | Context behavior |
| --- | --- | --- |
| 1600px and wider | wide | 52px rail, 300px on-demand overlay panel |
| 1200-1599px | compact | 52px rail, 272px on-demand overlay panel |
| 900-1199px | drawer | 50px rail, 264px on-demand overlay panel |
| below 900px | mobile | 48px rail, modal drawer with scrim and focus containment |

Breakpoints use the actual AppFrame width rather than browser viewport width. The rail tracks the official sidebar width without writing layout geometry.

## Install

The package is an independent Cordis bundle declared by `cordis.patch.yml`. Add it through the repository aggregate/profile workflow; it does not require DSH source changes.

## Config

Task Board, SSH, Settings, sessions, and workspaces keep their own configuration and ownership. `newsSources` optionally configures an explicit allowlist of trusted HTTPS RSS/Atom endpoints; an empty list produces a normal empty state. Knowledge uses the official `sessionQuery` service: deployments that want message-content search must enable the existing `session-query-sqlite` provider with `openAt: first-search` or `startup` and a dedicated derived-index path.

## Verification

```sh
pnpm --filter @linxin666/dsh-client-ui-workbench typecheck
pnpm --filter @linxin666/dsh-client-ui-workbench test
pnpm --filter @linxin666/dsh-client-ui-workbench build
```

Tests cover module registration and rollback, pending-transition invalidation, retained-entry adapters, startup isolation, 900/1200/1600px behavior, Chinese and English copy, long text, unavailable states, keyboard navigation, mobile focus containment, and focus restoration.

## Known limitations

- `shell.overlay` reserves no layout track, so the rail and context panel intentionally float over the frame and remain compact or on demand.
- The shipped DSH rc.6 Sidebar does not declare `sidebar.rows.top` / `sidebar.rows.bottom`; row contributions remain dormant until a compatible Sidebar owner supplies them.
- Task Board and SSH availability depends on their retained entry buttons being mounted; absence degrades the module without changing either plugin.
- Settings is an official modal and must be closed through its own controls before returning to underlying shell content.
- The 480px width policy is owned by AionUI; Workbench does not start a second layout controller.
- Knowledge message search depends on the deployment's official `sessionQuery` provider; the DSH base profile disables full-text search by default with `openAt: never`.
- News has no built-in remote source; it remains empty until the Host configures trusted `newsSources` entries.
