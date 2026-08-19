# @linxin666/dsh-gateway-retry

English | [中文](README.zh.md)

A host-only DSH plugin that continuously retries model requests after explicit HTTP 502 or 524 gateway failures. It keeps the selected provider and model unchanged and uses the official durable `llm/retry` and `llm/retry-started` session events, so the Web conversation can show each scheduled and started attempt after refresh.

## Behavior

- Matches only normalized HTTP status `502` and `524`; other failures delegate to the official retry policy.
- Starts at 5 seconds, doubles with 10% jitter, and caps each delay at 120 seconds.
- Has no retry-count limit for matching gateway failures; cancellation and plugin disposal stop the wait.
- Writes a durable retry record before waiting and a started record immediately before the next request.
- Does not switch providers or models, modify the DSH runtime, or retry direct `ctx.llm.stream()` calls.

The first two attempts may still be handled by the official normal retry policy when it is mounted before this plugin. The gateway plugin takes over after that policy delegates, preserving the official retry behavior for all other failure classes.

## Installation

```sh
dsh plugin --profile web add @linxin666/dsh-gateway-retry
```

For a local development checkout, add the package link to the web profile or include it through `dsh-web-ui-all`.

## Limitations

Each retry is a new provider request and may consume input tokens. A 524 response means the client did not receive a response; it does not prove that the upstream request was never processed. The plugin therefore does not retry tool calls directly and relies on the agent loop's durable step boundary.

## License

Apache-2.0.
