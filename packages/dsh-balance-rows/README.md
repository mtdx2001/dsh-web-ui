# @mtdx2001/dsh-client-ui-balance-rows

English | [中文](README.zh.md)

Provider-driven account balance rows for the DSH Workbench bottom component stack.

## What it does

- Discovers supported accounts from the official configurable-provider directory and resolved Settings profiles.
- Introduces a row only when the user has configured a supported Provider; there are no built-in DeepSeek or SevenToken account rows.
- Supports explicit `accounts` configuration as a user-requested override of automatic discovery.
- Registers every discovered account as an independent removable Workbench bottom disclosure row.

## Install

### From npm

```sh
dsh plugin --profile web add @mtdx2001/dsh-client-ui-balance-rows
```

### From the repository

```sh
dsh plugin --profile web add link:<repo>/packages/dsh-balance-rows
```

## Config

Automatic discovery currently supports `deepseek-official` / `deepseek` and `seventoken` Provider routes. It reuses each resolved profile's `apiKeyEnv` credential reference. Unknown Providers do not create rows.

An explicit `accounts` array is optional and replaces automatic discovery. Each account declares an id, label, supported source, credential reference, order, enabled state, currency, and optional details mode.

## Security model

Credential resolution and balance requests run in the Host. The browser receives only display fields, request state, balance or usage results, and timestamps; it never receives credential names, API keys, tokens, or raw Provider profiles.

## Known limitations

- The plugin has no UI when Workbench is absent.
- Only Providers with a supported balance endpoint are eligible for automatic discovery.
- Provider balance endpoint availability and response shape remain external dependencies.

## License

BSD-3-Clause.
