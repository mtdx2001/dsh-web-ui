# @mtdx2001/dsh-client-ui-balance-rows

[English](README.md) | 中文

为DSH工作台底部组件栈提供Provider驱动的账户余额行。

## 能力

- 从官方可配置Provider目录和已解析Settings profile发现受支持账户。
- 只有用户已配置受支持Provider时才引入对应行；不内置DeepSeek或SevenToken固定账户行。
- 支持显式`accounts`配置，作为用户明确要求时对自动发现的覆盖。
- 每个发现的账户独立注册为可移除的Workbench底部disclosure行。

## 安装

### 从npm安装

```sh
dsh plugin --profile web add @mtdx2001/dsh-client-ui-balance-rows
```

### 从仓库安装

```sh
dsh plugin --profile web add link:<repo>/packages/dsh-balance-rows
```

## 配置

自动发现当前支持`deepseek-official` / `deepseek`和`seventoken` Provider路由，并复用各已解析profile的`apiKeyEnv`凭据引用。未知Provider不会产生余额行。

可选的显式`accounts`数组会替代自动发现。每个账户声明id、标签、受支持source、凭据引用、顺序、启用状态、货币和可选详情模式。

## 安全模型

凭据解析和余额请求只在Host执行。浏览器只接收显示字段、请求状态、余额或用量结果及时间戳；绝不接收凭据名、API Key、Token或原始Provider profile。

## 已知限制

- Workbench缺失时插件不提供UI。
- 只有具备受支持余额接口的Provider才能自动发现。
- Provider余额接口可用性和响应结构属于外部依赖。

## 许可证

BSD-3-Clause。
