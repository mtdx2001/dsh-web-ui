# DSH Workbench product completion handoff

## Authority and objective

- Product authority: `E:\deepseek\创造区\DSH执行工作台改造方案.md` and `E:\deepseek\创造区\dsh-workbench-prototype\`.
- Active goal: `goal-e72781cb-f971-4b25-a2ee-98a99f213d9e`, revision 3.
- Objective: turn the current Phase 2B navigation skeleton into the complete four-region DSH execution workbench, then deploy and verify it on the existing `http://127.0.0.1:8026` GUI.
- Do not call an intermediate phase or green package gates a finished product.

## Cost and collaboration rules

- Kimi Desktop membership is free and does not count against model-balance control. Use it normally for mechanical tests, documentation, review, gap matrices, and low-risk implementation.
- Harness owns architecture, critical implementation, integration, deployment, and final acceptance.
- OpenCode stays idle for normal development. Its role is cost supervision and DSH crash/startup recovery.
- Paid vision or paid search requires explicit user confirmation. Local browser, OCR, commands, and free GLM are allowed.

## Current production state

- Current GUI: `http://127.0.0.1:8026`.
- Installed Workbench package: `C:\Users\Administrator\AppData\Roaming\deepseek-harness-desktop\harness-home\profiles\web\node_modules\@linxin666\dsh-client-ui-workbench`.
- Installed client bundle: 72,846 bytes, MD5 `CD89EF3D50081525F3D8908FB828BB7B`, SHA-256 `B4B48CC5D3CD228966227BF1D0081047AC930A3F317C33B69751C88450AE8296`.
- Production profile `package.json`, `pnpm-lock.yaml`, and `cordis.patch.yml` were not changed during the Phase 2B bundle deployment.
- Rollback backup: `E:\deepseek\backups\workbench-phase2b-20260818-000226\`; old bundle MD5 `B395889C77C0421A2D82ECDDD45C75DE`.
- Environment backup: `E:\dsh-backup\20260818-003317\`.
- Recovery manual: `E:\deepseek\DSH-桌面端-改动总结.md`.

## What Phase 2B actually provides

- Official `conversation.session.header.utilities` status contribution.
- Official `shell.overlay` navigation rail and on-demand context summary.
- Agent, Task Board, SSH, and Settings adapters.
- AppFrame breakpoints, keyboard navigation, mobile modal focus handling, and bounded late-entry discovery.
- Task Board and SSH remain legacy panel owners; Settings remains the official shell modal.
- Latest gates: typecheck passed, build passed, 13 spec files and 67 tests passed, aggregate check passed, aggregate generator tests 2/2 passed.

## Product gaps

The product target is the four-region layout: feature rail, current-module context, official Agent execution area, and workspace Dock with on-demand Preview.

Still required:

1. AionUI-owned Explorer Dock extension contract and live Overview tab.
2. Real context content instead of summary copy: Agent workspace/session search and history; Task filters/schedules/recent runs; SSH host groups/environments/tags.
3. Seven top-level modules: Agent, Tasks, Knowledge, Experts, News, SSH, Settings. Monitoring must be integrated into Overview or a dedicated module.
4. Unified module content and lifecycle protocol, not only `activate/deactivate` legacy clicks.
5. Knowledge MVP using existing `dsh-memory`; Experts MVP using Agent Presets and Skills; News MVP with explicit source/storage boundary; monitoring for model/token/jobs/trajectory.
6. Preview/context/Dock layout coordination, including the 480px Agent-area floor and responsive collapse rules.
7. Complete loading, empty, unavailable, error, active, and persistence states.
8. Product-level visual polish and full-path desktop/mobile browser evidence.

## Next architecture step

Add an AionUI-owned Explorer Dock tab registry/service in `packages/dsh-aionui-panel`:

- AionUI owns registration, active-tab state, rendering, and cleanup in its existing Explorer React root.
- Workbench registers Overview through the service. It must not inject DOM into AionUI or create another React root.
- Files and Changes stay built-in tabs. Extension tabs are ordered, localized, keyboard accessible, and fail-soft.
- The active tab is persisted per project and exposed to Workbench so Git polling and overview work are active only while visible.
- Add unit/component tests in AionUI plus Workbench integration tests before production deployment.

Then extend the Workbench module registration contract with context rendering/data rather than adding per-module DOM hacks.

## Kimi state

- Kimi Desktop is open, accessible, idle, and free to use.
- Last attempted task `T-WB-PRODUCT-GAP-01` was not prepared or sent. Bridge error: `Kimi control not found: K3`.
- Current Kimi UI exposes the model trigger but no visible `K3` option under the old selector. The Desktop UI changed; repair `E:\deepseek\创造区\dsh-kimi-desktop-bridge\python\kimi_desktop_bridge.py` model selection compatibly, run the non-sending verifier, then retry `prepare -> confirm -> collect`.
- Do not claim a Kimi task was sent unless the audit records both `prepared` and `submitted` for the exact task id.

## Repository scope and hygiene

- Main repo: `E:\deepseek\创造区\reference\dsh-web-ui`.
- Current Workbench package is untracked as a directory in this dirty worktree; do not remove unrelated user changes.
- `packages/dsh-web-ui-all/aggregate.yml`, generated patch/package files, and `pnpm-lock.yaml` contain Workbench aggregation changes.
- Avoid concurrent pnpm commands that trigger workspace `prepare`; direct package `.bin` commands prevented `dsh-skins/skins.staging` races.
- `pnpm docs:check` has a pre-existing unrelated failure: `docs/plugins.md` is 2304 words against a 2300-word ceiling.

## Evidence already captured

- `C:\Users\Administrator\.dsh-trio\screenshots\workbench-phase2b-deployed-final-1280.png`
- `C:\Users\Administrator\.dsh-trio\screenshots\workbench-phase2b-taskboard-final.png`
- `C:\Users\Administrator\.dsh-trio\screenshots\workbench-phase2b-mobile-dialog-final.png`

These screenshots prove the Phase 2B skeleton works; they do not prove the complete product exists.
