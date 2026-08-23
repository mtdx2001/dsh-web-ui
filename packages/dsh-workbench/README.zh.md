# @mtdx2001/dsh-client-ui-workbench

[English](README.md) | 中文

DSH Web GUI执行工作台，通过公开中央模式顶栏、官方会话标题栏状态信息、官方侧栏组件栈和Workbench自有右侧栏提供工作界面。

## 能力

- 占用可选的官方`conversation.mainSurface` single slot，并接收完整官方Agent树作为owner currency。中央顶栏保持该树原样挂载，把Agent作为系统保留模式，并渲染已安装贡献者的source-qualified完整视图。Workbench统一拥有模式显示、顺序、选择、默认/上次持久化、错误隔离和Agent回退；不重建官方Session Header、view ring或composer。
- 在 `conversation.session.header.utilities` 注册 `workbench-status`，由官方会话 React 树负责挂载和清理。
- 提供可卸载的侧栏行注册表，以及官方 `sidebar.rows.top` / `sidebar.rows.bottom` list slot 的声明感知贡献。任何当前或未来的贡献者都通过同一套与具体插件无关的声明协议准入：注册表应用确定性默认值，校验元数据和必需回调，以结构化诊断拒绝不安全或含义不明的声明，再把已准入行自动接入官方 Sidebar 座位与组件设置。未声明这些 slot 的旧版 Sidebar 保持原状。
- host 统一负责 `action`、`disclosure` 与 `toggle` 交互语义。带详情的旧行安全规范化为 disclosure，不带详情的旧行规范化为直接 action；规范化不会改写插件源码。贡献者的渲染、生命周期、状态和交互异常只影响本行。
- 通过可选的官方`settings.section` slot注册“工作台布局”页面。已注册的中央模式、左侧组件栈和右侧栏扩展组件都可隐藏、排序、移除、恢复和重置，且不改写注册顺序。Agent固定保留；中央贡献者可设为默认，启动时可选择恢复上次中央模式。“添加”始终可用：用户可以在两个官方 Sidebar 座位创建持久化的结构化信息组件，或在 Desktop 持有的右侧栏创建结构化文本页签；已移除的已安装贡献者则单独恢复。自定义定义只保存有长度上限的纯文本；表单不接受任意组件 ID、JavaScript、React 代码、凭据、URL 或网页嵌入。可见控件直接使用运行时官方 `@deepseek-ai/dsh-client-ui-primitives` 的 Button、Pill、Input、Modal 与图标导出，官方主题及 primitive 升级可直接生效，不复制设置页私有 class；Workbench 只拥有动态布局。保留的官方详情页签以及官方“新会话”、会话列表、工作区和设置保持固定。
- Agent使用官方会话列表和对话区。任务看板与SSH通过Workbench service注册可选的完整中央模式视图；调度、cron、凭据、连接、执行、传输和隧道行为仍由原插件管理。
- `dsh-workbench-component-preferences:v1:global`只保存版本化组件ID、启用标记、位置和移除标记。中央活动/默认/恢复上次状态隔离保存于Host拥有的`$DSH_HOME/dsh-workbench-main-surface.json`，因此Desktop随机端口重启后仍能恢复；同名localStorage键只保留为兼容缓存。固定v1记录只含这三个非秘密字段；标签、路由、业务配置、凭据引用、Token和秘密绝不写入该记录。
- 经过两帧动画后才启动运行时读取、模块 adapter 和语言监听。同步 `apply()` 只注册 service 与官方 slot 贡献。
- 最近工具调用采用有上限的逆序扫描，启动阶段不排序完整会话窗口。

## 集成边界

| 界面 | 契约 | 工作台行为 |
| --- | --- | --- |
| 中央模式 | 可选`conversation.mainSurface` single slot | 用模式顶栏包裹完整上游Agent节点；回退原样返回Agent |
| 会话状态 | `conversation.session.header.utilities` | additive 官方 slot 贡献 |
| 侧栏行 | 可选 `sidebar.rows.top` / `sidebar.rows.bottom` | 声明感知的 list 贡献，由兼容 Sidebar React 树所有并渲染 |
| 组件设置 | 可选 `settings.section` | 管理非敏感界面偏好；挂载和关闭状态由官方设置 shell 管理 |
| Agent | 官方会话与对话 | 采用官方界面，Workbench 不替换任一界面 |
| 任务看板 / SSH | 可选结构化`workbench` service | source-qualified完整中央视图；业务行为仍归原插件所有 |
| 右侧栏 | 可选 `desktop.rightSidebar` single slot | Workbench 拥有图标加文字页签和一个完整内容区；Desktop 拥有现有第三列 |

右侧扩展只有一种形态：一个顶部页签对应一个完整内容区。贡献者只提供 `source`、`id`、`label`、`icon`、`order` 和 `render`；Workbench 统一管理页签状态、滚动、持久化、回退和错误隔离，Desktop 统一管理几何。概览是内置组件，官方详情是保留兼容页签。独立的 `workbench-files:files` 贡献者通过包自有只读 `/dsh-workbench/files` 路由浏览当前会话工作区。每个请求必须先通过官方 `workspaceRegistry` 成员门禁，再由结构化路径解析拒绝目录穿越、绝对路径、符号链接逃逸与仓库内部 `.git` 路径；目录项和文本预览均有上限，`.git` 会隐藏而普通点文件仍可见，搜索范围是目录树中已经加载的文件。它不做任何编辑、暂存或写操作。独立的 `workbench-changes:changes` 贡献者通过只读 `/dsh-workbench/git-status` 路由把已暂存、未暂存、未跟踪文件分组，并通过 `/dsh-workbench/git-changes` 路由提供单文件暂存、取消暂存、放弃更改和删除。服务端自行重新推导每个文件的 porcelain 状态并在服务端强制写策略：已暂存行只能取消暂存，未暂存行可暂存或放弃更改，未跟踪行可暂存或删除，冲突（unmerged）行拒绝所有写操作。放弃更改和删除需要显式确认，不提供批量放弃，未跟踪删除只移除符号链接本身而不触碰其目标，diff 输出有上限并带截断标记，每次写操作成功后重新读取 host 状态而不是乐观更新列表。可选预览贡献者通过同一公开注册表接入并局部失败。Workbench 缺失时，Desktop 直接渲染原官方详情。AionUI 不是安装、运行、代码、服务或 DOM 依赖。

## 响应式行为

宽度、拖拽、折叠、抽屉和窄窗口行为继续由官方 Sidebar 与 Desktop 布局控制器管理。Workbench 只贡献行与右侧栏内容，不创建第二条轨道、永久布局列、frame-grid owner 或响应式断点系统。

## 安装

本包是由 `cordis.patch.yml` 声明的独立 Cordis bundle，不依赖 `dsh-web-ui-all` 或 AionUI。提供 `desktop.rightSidebar` 的 Desktop 版本会启用自有右侧栏；旧宿主继续使用状态与左侧能力，右侧栏平稳降级。安装会保留 profile 中已有插件及其业务数据，任务看板、SSH、AionUI 与其他贡献者继续独立运行。已注册组件会自动进入“工作台布局”设置，用户可启用、排序、移除或恢复；用户还可以创建有界纯文本信息组件与右侧文本页签，但任意组件 ID 和可执行内容始终被禁止。source-qualified ID 防止本地 ID 相同的无关贡献者冲突；暂时缺失的贡献者会保留版本化偏好，重新安装后可恢复；`desktop.rightSidebar` single slot 注册被拒绝时只禁用 Workbench 右栏宿主，不中断客户端启动。独立包与全家桶双源由既有 `mountOnce` 和客户端模块去重规则处理，不复制其他 profile 的 `node_modules`，也不覆盖其 manifest。

## 配置

任务看板、SSH、设置、会话与工作区继续管理各自的配置和状态。`newsSources` 可选配置可信 HTTPS RSS/Atom 地址的明确白名单；空列表显示正常空态。知识模块使用官方 `sessionQuery` service；需要消息内容搜索的部署必须把现有 `session-query-sqlite` provider 配置为 `openAt: first-search` 或 `startup`，并使用独立的派生索引路径。

## 验证

```sh
pnpm --filter @mtdx2001/dsh-client-ui-workbench typecheck
pnpm --filter @mtdx2001/dsh-client-ui-workbench test
pnpm --filter @mtdx2001/dsh-client-ui-workbench build
```

测试覆盖模块注册与回滚、在途transition失效、中央模式注册与Agent回退、启动隔离、通过container query跟随owner框体连续变化的行为、中英文、长文本、不可用状态、键盘导航、移动端焦点约束和焦点恢复。变更模块的覆盖还包括服务端 porcelain 状态推导、按状态的写策略（含冲突拒绝）、符号链接安全的未跟踪删除、模拟路由准入与拒绝，以及基于真实临时 git 仓库的分组、diff 与确认行为。

## 已知限制

- `shell.overlay` 不预留布局轨道，因此轨道和上下文栏有意浮在 frame 上，并保持紧凑或按需显示。
- 侧栏行贡献要求宿主声明并渲染 `sidebar.rows.top` / `sidebar.rows.bottom`。当前 Workbench 使用的隔离 rc.1 组合已提供这两个公共座位；旧版 Sidebar owner 会让这些贡献保持 dormant，不触发私有 DOM 回退。
- 中央模式要求兼容Conversation owner声明`conversation.mainSurface`。缺失时Workbench注册局部失败，官方Agent界面保持不变；任务看板与SSH绝不回退到私有中央列DOM接管。
- 设置是官方 modal，返回底层 shell 内容前需通过其自有控件关闭。
- 当前 Desktop 适配契约需要上游合并或由兼容 Desktop 版本交付；Workbench 会探测 slot，缺失时仍保持可用。
- 知识消息搜索依赖部署提供的官方 `sessionQuery` provider；DSH base profile 默认使用 `openAt: never` 禁用全文搜索。
- 新闻不内置远程来源；Host 配置可信 `newsSources` 前保持空态。
- 变更贡献者要求宿主 PATH 上存在 `git`；缺失时只有该页签的操作降级为结构化不可用错误。
