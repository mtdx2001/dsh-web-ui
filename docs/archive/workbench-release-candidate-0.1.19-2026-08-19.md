# Workbench 0.1.19 release-candidate audit

## Scope and ownership

- Repository: `E:\deepseek\创造区\reference\dsh-web-ui` on branch `main`.
- Official DSH checkout was inspected only and was not modified.
- Workbench remains within official ownership contracts: session status through `conversation.session.header.utilities`, navigation through `shell.overlay`, and Overview through the AionUI-owned Dock.
- No `git add`, commit, tag, npm publish, or GitHub release was performed.

## Release metadata

- All 28 release roots pass `node scripts/verify-version.mjs v0.1.19`.
- Workbench is `0.1.19` and no longer has `private: true`.
- Matrix and Whale Mom source packages and generated `dsh-skins` carriers are aligned to `0.1.19`.
- The release gate now rejects unreadable manifests, version drift, and `private: true` release roots.

## Package evidence

| Package | SHA-256 | Contract checks |
| --- | --- | --- |
| `@linxin666/dsh-client-ui-workbench@0.1.19` | `EC46BC08492D1727BC49918B25010F8A13DB6F267AE146FF88EB5413FD553767` | no private field; patch, host, client, declarations, source, and bilingual README files present |
| `@linxin666/dsh-web-ui-all@0.1.19` | `092BE357AF39196CC3A6DEA7EBDB39855317E7AD870990A0079A9A7673FB57AD` | Workbench dependency rewritten to `0.1.19`; no `workspace:*`; patch contains `web-ui-workbench` |

Artifacts are under `E:\deepseek\创造区\.dsh-workbench-verify\release-candidate`.

## Gates

- `pnpm typecheck`: passed across the workspace.
- `pnpm test`: passed across all 29 participating workspace projects.
- `pnpm build`: passed across the workspace.
- `pnpm test:scripts`: 96/96 passed.
- `pnpm docs:check`: passed.
- `pnpm aggregate:check`: passed for `dsh-skins` and `dsh-web-ui-all`.
- `pnpm gallery:check`, `pnpm skin-center:check`, `pnpm sync-shared:check`, and `pnpm runtime-deps:check`: passed.
- Workbench: 103/103 passed twice consecutively after geometry-wait stabilization.
- Describe Image: 148/148 passed twice consecutively after mount lifecycle test isolation.
- SSH on Windows: 86 passed and 2 skipped. POSIX `0600` and `/usr/sbin/sshd` integration remain exercised only where the platform exposes those capabilities.

## Gate fixes

- Made Pet, SSH, Skin Center, and shared DSH-home tests use platform-native path and permission expectations.
- Kept Windows functional assertions while restricting POSIX mode assertions to non-Windows systems.
- Kept the real `/usr/sbin/sshd` SFTP integration test out of Windows; embedded SSH server coverage still runs.
- Moved Describe Image thinking-field mapping assertions to the pure request builder and added a Cordis disposal tick between plugin-mount tests.
- Replaced Workbench fixed timer assumptions with a bounded wait for both AppFrame mode and official sidebar geometry.

## Production and rollback

- Production GUI: `http://127.0.0.1:8793/`, HTTP 200 at audit time.
- Desktop PID: `61748`; backend PID: `32720`; both alive at audit time.
- Current production remains the validated Stage 11 deployment. This RC metadata/test closure was not installed into production because it does not change Workbench runtime behavior.
- Stage 11 rollback remains `E:\deepseek\创造区\.dsh-workbench-verify\production-profile-backup-stage11-20260819`, followed by `pnpm install --offline --ignore-scripts` and watchdog reload.

## Commit boundary

The repository contains substantial pre-existing dirty work. The proposed RC commit must include the entire currently untracked `packages/dsh-workbench/` directory plus the release metadata, generated carrier, gate, and test portability files listed by the working-tree audit. It must not use broad `git add .` and must not include `.dsh-kimi`, temporary screenshots, prototype requests, or unrelated generated outputs.

Workbench is still untracked at this checkpoint. A tag made before explicitly staging and committing that directory would omit the product even though local pack and production evidence pass.

## Residual warnings

- The official `@deepseek-ai/dsh-host-apiproxy` package references source maps that are absent from its npm artifact; Vite reports these as warnings during `dsh-remote-web-ui` tests.
- jsdom reports unsupported canvas operations in existing UI tests. Assertions still pass.
- Actual npm publication remains a maintainer-approved paid/external registry operation and was not attempted.
