# AGENTS.md — dsh-balance-rows

DSH web GUI plugin dsh-balance-rows. 包级规则：只写本包特有约定，不重复根 AGENTS.md 与
packages/AGENTS.md 的全局/包级规则。

## 本包要点

- 每个账户通过 Workbench `bottom` registry 注册为独立一行；禁止创建合并余额卡、独立 footer 或额外侧栏宿主。
- Host 负责配置、凭据解析和余额请求，浏览器只能接收余额结果与凭据引用状态，绝不接收密钥值。
- 账户可独立启停、排序和注销；Workbench 不存在时本插件保持无 UI，不形成对全家桶的运行依赖。
- `src/index.ts` 只含 Host 配置与路由，`src/client/` 只含 Workbench row adapter，共享协议放 `src/core/`。

## 提交前检查

```sh
pnpm --filter @mtdx2001/dsh-client-ui-balance-rows typecheck
pnpm --filter @mtdx2001/dsh-client-ui-balance-rows test
pnpm --filter @mtdx2001/dsh-client-ui-balance-rows build
```
