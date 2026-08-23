# @mtdx2001/dsh-workbench-suite

English | [中文](README.zh.md)

A DSH Workbench distribution bundle that installs the project-owned Workbench and Provider-driven Balance Rows together with the source-preserving AionUI, Task Board, and SSH integrations.

## What it does

- Installs `@mtdx2001/dsh-client-ui-workbench` as the central Workbench owner.
- Installs `@mtdx2001/dsh-client-ui-balance-rows`, which creates rows only for supported Providers configured by the user.
- Installs `@linxin666/dsh-client-ui-aionui-panel`, `@linxin666/dsh-client-ui-task-board`, and `@linxin666/dsh-ssh` under their upstream package identities.
- Aggregates only Cordis plugin rows and package dependencies; the suite adds no Host behavior, client root, layout owner, credentials, or user data.

## Install

```sh
dsh plugin --profile web add @mtdx2001/dsh-workbench-suite
```

For repository development:

```sh
dsh plugin --profile web add link:<repo>/packages/dsh-workbench-suite
```

## Config

Workbench layout preferences and each integration's business configuration remain owned by their respective packages. The suite stores no configuration and never reads SSH credentials or task data.

Dream Skin is an independent appearance plugin and is not bundled. The retired project-owned Wallpaper Engine package is not included.

## Known limitations

- Installing the suite requires published versions of every dependency that satisfy the generated package manifest.
- Task execution and SSH operations keep their original confirmation, resource, credential, and scheduling semantics.
- Removing the suite does not delete state owned by the installed child plugins.
