# @linxin666/dsh-gateway-retry

[English](README.md) | 中文

这是一个仅运行在 host 侧的 DSH 插件：模型请求明确返回 HTTP 502 或 524 网关错误后持续重试。插件保持原 provider 和 model 不变，并使用官方持久化的 `llm/retry` 与 `llm/retry-started` 会话事件，因此 Web 对话刷新后仍能显示每次计划和已开始的尝试。

## 行为

- 只匹配规范化的 HTTP 状态 `502` 和 `524`；其他错误交回官方重试策略。
- 从 5 秒开始，带 10% jitter 指数递增，每次等待最长 120 秒。
- 对匹配的网关错误不限制重试次数；取消和插件卸载会终止等待。
- 等待前写入持久重试记录，下一次请求开始前立即写入 started 记录。
- 不切换 provider 或 model，不修改 DSH runtime，也不重试直接调用 `ctx.llm.stream()` 的代码。

如果官方重试执行器先于本插件挂载，最初两次尝试仍可能由官方 normal 策略处理；官方策略交回后，本插件才接管。其他错误类型继续使用官方行为。

## 安装

```sh
dsh plugin --profile web add @linxin666/dsh-gateway-retry
```

本地开发时，可把此包链接到 web profile，或通过 `dsh-web-ui-all` 聚合包安装。

## 限制

每次重试都会发起新的 provider 请求，可能消耗输入 token。524 只表示客户端没有收到响应，并不能证明上游没有处理请求。因此插件不直接重试工具调用，而是依赖 agent loop 的持久步骤边界。

## 许可证

Apache-2.0。
