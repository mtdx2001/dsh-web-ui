# @mtdx2001/dsh-workbench-suite

[English](README.md) | 中文

一个DSH工作台发行聚合包，安装项目自有Workbench和Provider驱动的Balance Rows，并按原包身份安装AionUI、任务看板和SSH集成。

## 能力

- 安装`@mtdx2001/dsh-client-ui-workbench`作为中央工作台owner。
- 安装`@mtdx2001/dsh-client-ui-balance-rows`，只为用户已配置的受支持Provider创建余额行。
- 以原有上游包身份安装`@linxin666/dsh-client-ui-aionui-panel`、`@linxin666/dsh-client-ui-task-board`和`@linxin666/dsh-ssh`。
- 只聚合Cordis插件行和包依赖；套装不新增Host行为、client root、布局owner、凭据或用户数据。

## 安装

```sh
dsh plugin --profile web add @mtdx2001/dsh-workbench-suite
```

仓库开发安装：

```sh
dsh plugin --profile web add link:<repo>/packages/dsh-workbench-suite
```

## 配置

工作台布局偏好和各集成的业务配置仍由对应包拥有。套装不保存配置，也不读取SSH凭据或任务数据。

Dream Skin是独立外观插件，不随套装安装。已停用的项目自有Wallpaper Engine包不进入套装。

## 已知限制

- 安装套装要求每个依赖已有满足生成manifest的发布版本。
- 任务执行和SSH操作保持原有确认、资源、凭据与调度语义。
- 卸载套装不会删除已安装子插件拥有的状态。
