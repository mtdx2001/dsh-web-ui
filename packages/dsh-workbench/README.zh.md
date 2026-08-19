# @linxin666/dsh-client-ui-workbench

[English](README.md) | 中文

DSH Web GUI 执行工作台，通过官方会话标题栏状态信息和官方 `shell.overlay` 模块导航提供工作界面。

## 能力

- 在 `conversation.session.header.utilities` 注册 `workbench-status`，由官方会话 React 树负责挂载和清理。
- 在 `shell.overlay` 注册 `workbench-navigation`，由官方布局 React 树管理 48-52px 图标轨道和按需上下文栏。
- 通过可选的 `workbench` Cordis service 提供八个稳定轨道模块：Agent、任务看板、知识、专家、新闻、监控、SSH 和设置。知识搜索官方可见会话内容索引，专家读取部署 Preset 与当前项目 Skill 目录，新闻读取 Host 明确配置的白名单来源，监控通过官方运行时 projection 展示 Token 用量、吞吐、任务、子代理和最近工具调用。
- 提供可卸载的侧栏行注册表，以及可选 `sidebar.rows.top` / `sidebar.rows.bottom` list slot 的声明感知 host。未声明这些 slot 的旧版 Sidebar 保持原状；行贡献者无需 DOM 注入即可注册，并在兼容 owner 出现时自动激活。
- Agent 使用官方会话列表和对话区。任务看板与 SSH 通过可选 adapter 使用保留的旧入口；调度、cron、凭据、连接、执行、传输和隧道行为仍由原插件管理。
- 经过两帧动画后才启动运行时读取、模块 adapter、语言监听和 overlay 几何监听。同步 `apply()` 只注册 service 与官方 slot 贡献。
- 支持上移、下移、Home、End、Escape、焦点恢复、无障碍名称、不可用状态，以及键盘模态的移动端上下文抽屉。
- 最近工具调用采用有上限的逆序扫描，启动阶段不排序完整会话窗口。

## 集成边界

| 界面 | 契约 | 工作台行为 |
| --- | --- | --- |
| 会话状态 | `conversation.session.header.utilities` | additive 官方 slot 贡献 |
| 模块导航 | `shell.overlay` | additive 穿透浮层；只有可见轨道、面板和移动端遮罩接收指针输入 |
| 侧栏行 | 可选 `sidebar.rows.top` / `sidebar.rows.bottom` | 声明感知的 list 贡献，由兼容 Sidebar React 树所有并渲染 |
| Agent | 官方会话与对话 | 采用官方界面，并关闭已激活的旧版外部面板 |
| 任务看板 / SSH | 稳定的保留入口按钮与 active attribute | 一次性可用性检查和点击；不创建 observer，不访问业务 controller |
| 设置 | 官方侧栏 dialog trigger | 一次性打开；面板状态仍由官方 shell 管理 |

AionUI 自有 Dock service 是唯一的概览路径：概览注册为 Dock tab，由 AionUI Explorer React root 渲染，Workbench 不在 shell、会话或 AionUI 管理的树中拥有第二个 frame grid 或 React root。遗留的概览 DOM 挂载、宽度 guard 和 body portal host 已移除。

## 响应式行为

| AppFrame 宽度 | 模式 | 上下文行为 |
| --- | --- | --- |
| 1600px 及以上 | 宽屏 | 52px 轨道，300px 按需 overlay 面板 |
| 1200-1599px | 紧凑 | 52px 轨道，272px 按需 overlay 面板 |
| 900-1199px | 抽屉 | 50px 轨道，264px 按需 overlay 面板 |
| 低于 900px | 移动端 | 48px 轨道，带遮罩和焦点约束的模态抽屉 |

断点基于实际 AppFrame 宽度而非浏览器 viewport。轨道跟随官方侧栏宽度，但不写入布局几何。

## 安装

本包是由 `cordis.patch.yml` 声明的独立 Cordis bundle。通过仓库聚合包或 profile 流程加入，无需修改 DSH 源码。

## 配置

任务看板、SSH、设置、会话与工作区继续管理各自的配置和状态。`newsSources` 可选配置可信 HTTPS RSS/Atom 地址的明确白名单；空列表显示正常空态。知识模块使用官方 `sessionQuery` service；需要消息内容搜索的部署必须把现有 `session-query-sqlite` provider 配置为 `openAt: first-search` 或 `startup`，并使用独立的派生索引路径。

## 验证

```sh
pnpm --filter @linxin666/dsh-client-ui-workbench typecheck
pnpm --filter @linxin666/dsh-client-ui-workbench test
pnpm --filter @linxin666/dsh-client-ui-workbench build
```

测试覆盖模块注册与回滚、在途 transition 失效、保留入口 adapter、启动隔离、900/1200/1600px 行为、中英文、长文本、不可用状态、键盘导航、移动端焦点约束和焦点恢复。

## 已知限制

- `shell.overlay` 不预留布局轨道，因此轨道和上下文栏有意浮在 frame 上，并保持紧凑或按需显示。
- 当前 DSH rc.6 Sidebar 未声明 `sidebar.rows.top` / `sidebar.rows.bottom`；兼容 Sidebar owner 提供这些 slot 前，行贡献保持 dormant。
- 任务看板与 SSH 的可用性依赖其保留入口已经挂载；入口缺失时模块降级，不改变原插件。
- 设置是官方 modal，返回底层 shell 内容前需通过其自有控件关闭。
- 480px 宽度策略由 AionUI 所有；Workbench 不启动第二个布局控制器。
- 知识消息搜索依赖部署提供的官方 `sessionQuery` provider；DSH base profile 默认使用 `openAt: never` 禁用全文搜索。
- 新闻不内置远程来源；Host 配置可信 `newsSources` 前保持空态。
