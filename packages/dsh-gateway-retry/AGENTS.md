# AGENTS.md — dsh-gateway-retry

DSH host-side recovery plugin for explicit HTTP 502/524 model-request failures.

## Package rules

- Keep recovery on the host side; the official conversation renderer owns retry status UI.
- Match only normalized 502/524 failures and preserve the selected provider and model.
- Durable retry events must be written before the wait and immediately before retry start.

## Checks

```sh
pnpm --filter @linxin666/dsh-gateway-retry typecheck
pnpm --filter @linxin666/dsh-gateway-retry test
pnpm --filter @linxin666/dsh-gateway-retry build
```
