# Provider Routing, Cost Safety, Reasoning-Model APIs

Load when: writing project code that calls an LLM provider, scripting `claude -p`, or wiring a reasoning model. The always-loaded rules are the ban statement (CLAUDE.md §Provider Ban) and the permission requirement; the operational detail lives here.

## Provider Ban — replacement map

Anthropic API calls are BANNED in project code (see CLAUDE.md). When replacing a banned model reference:

- `anthropic:claude-sonnet-*` -> `xai:grok-4-1-fast-non-reasoning`
- `anthropic:claude-opus-*`   -> `xai:grok-4.20-beta-0309-reasoning`
- `anthropic:claude-haiku-*`  -> `xai:grok-4-1-fast-non-reasoning`

Adding any Anthropic provider integration requires explicit user permission per request — no exceptions, no defaults.

## Cost Safety (`claude -p`)

- **`claude -p` bills API, not subscription, when `ANTHROPIC_API_KEY` is set in env.** CLI uses env key transparently at per-token API rates. Verify billing mode before any long-running `claude -p` loop.
- **If a script must use `claude -p`, `unset ANTHROPIC_API_KEY` to force subscription billing.** Confirm via token-usage dashboard, not log labels — `claude-sonnet-4-6-cli` suffix is cosmetic, not proof of subscription billing.
- **Long-running pipelines must cap spend with `--budget=<usd>`** and refuse to start without it.

## Reasoning Model APIs

- Reasoning models reject `temperature` parameters. Use a wrapper that detects and strips it.
- Reasoning tokens consume `max_completion_tokens` budget. Set 4x normal or output will be silently empty.
