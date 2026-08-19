# dsh-web-ui 插件包发布准备（内测已结束）

> **检查说明（重要）**：插件清单、版本和发布属性以仓库源码及机械门禁为准。
> 包可能增删、版本可能调整；发布前必须重新执行本文列出的检查，不得依赖历史快照。
>
> **红线（务必遵守）**：发布动作仍须先经仓库维护者明确批准，并按 registry 规范
> 操作（`npm pack --dry-run` 级别的演练可先行）。

## 一、范围

发布根由`scripts/verify-version.mjs`机械扫描`packages/*/package.json`与`packages/skins/*/package.json`，不在本文手抄包清单。当前共28个发布根，均为`0.1.19`且没有`private: true`；脚本会在tag发布前再次强制校验版本和公开发布属性。

## 二、发布前检查结论

### [阻断] 阻断项（不修复无法发布/无法被消费）

1. **版本或公开属性漂移** — `node scripts/verify-version.mjs <tag>`会拒绝版本不匹配、不可读的`package.json`以及任何`private: true`发布根。该门禁在npm publish之前运行；当前28个发布根通过`0.1.19`校验。
2. **聚合包 `workspace:*` 依赖原样进 tarball**（dsh-skins 7 处、dsh-web-ui-all 9 处）—
   [已确认] **已确认修复方式**：实测 `pnpm pack` 会把 `workspace:*` 改写为真实版本号
   （dsh-skins 7 处、dsh-web-ui-all 9 处全部改写为 0.1.1/0.1.0，无残留）。
   发布时必须用 **`pnpm publish`**（不要用 `npm publish`），`npm pack` 不改写。
3. **类型产物缺失（1 包）** — [已确认] **已修复**：
   - dsh-task-board：新增 `tsconfig.build.json`（emitDeclarationOnly → lib/types），
     build 脚本改为 `tsc -p tsconfig.build.json && tsdown`；已产出 18 个 .d.ts；
4. **`@deepseek-ai/dsh-code-kline` 未发布** — 原为 ui-code-kline 与 dsh-web-ui-all
   的依赖方（peerDeps/deps 引用），需在依赖它的包之前发布。
   **（发布动作本身，无法提前修复；发布顺序已排定）**
   [已确认] **已失效**：2026-08-12 调整移除 code-kline / ui-code-kline 包后，
   该发布依赖不再存在，无需处理。

### [建议] 建议项（registry 安装兼容性）— [已确认] 已修复

5. **peerDeps 版本声明不匹配**：git-graph / live-stats / pet / remote-web-ui
   的 `@deepseek-ai/*` peerDeps
   已从旧 `^0.0.1` 系列改为 **`^0.1.0-rc.6`**（与 npm 已发布版本匹配，避免 ERESOLVE）。

### [卫生] 卫生项

6. **LICENSE 文件缺失 11 包** — [已确认] **已补全**（BSD-3-Clause，dsh-external
   contributors），打包验证 LICENSE 已进 tarball。
7. **files 缺 `cordis.patch.yml`**（发布后 bundle patch 缺失会装不上）—
   [已确认] **已补全**：task-board / live-stats
   的 files 均加入 `cordis.patch.yml`（task-board 同时补齐
   `src` 与 `lib/types/**/*.d.ts.map`）。打包验证全部进 tarball。
8. **blue-fantasy 打包警告**：`MODULE_TYPELESS_PACKAGE_JSON`（packages/skins/
   无 package.json，`tsdown.client.ts` 被按 CJS 重解析）与 tsdown
   `external` 弃用提示。构建卫生问题，**不影响产物正确性**（打包产物正常），
   未改动，待官方 tsdown 配置演进后统一处理。

## 三、兼容性现状（npm 版 DSH × 插件）

2026-08-13 用隔离环境（`DSH_HOME` 隔离 + `dsh plugin add link:`）实测
npm 版 `@deepseek-ai/dsh@0.1.0-rc.6`：

- web GUI 启动正常（HTTP 200），`dsh plugin` 安装 task-board / blue-fantasy 成功；
- boot manifest 正确注册插件，`/plugins/@deepseek-ai/<pkg>/client.js` 可访问（200）；
- 日志无 error/warn，插件 `dsh.client` 声明（platform/inject/exports["./client"]）
  与 npm 版 `dsh-client-modules` 消费逻辑逐字段吻合。

npm 侧已发布 @deepseek-ai 核心 SDK 包至 `0.1.0-rc.6`，插件包仍按本仓库版本管理。

## 四、建议的发布流程（批准后执行）

1. 选择与全仓包版本一致的tag，并运行`node scripts/verify-version.mjs <tag>`；
2. 按依赖顺序发布（用 **`pnpm publish`**，自动改写 workspace:*）：
   各功能包 > 皮肤包 > dsh-skins > web-ui-all；
3. 逐包 `pnpm pack --dry-run` 复核tarball内容（注意：dry-run仍会执行prepack/prepare脚本）；
4. 发布动作前**必须**经维护者确认。

## 五、重新核对时机

插件清单或版本发生任何变更后（新增/删除包、升版本、改字段），本节结论即失效，
需重新执行本文档的检查流程（字段扫描 + pack 演练 + peerDeps 核对）。
