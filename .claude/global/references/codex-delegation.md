# Codex Delegation

Load this before any Codex call. Codex is available ONLY in projects whose own CLAUDE.md
contains a literal `codex=true` line. In every other project, never call the codex tools.

Subscription-billed: keep `OPENAI_API_KEY` unset, or calls silently bill the API instead.

## What to delegate

- Read-heavy sweeps: grep forests, log dumps, schema dumps.
- Mechanical implementation of a plan part that is already fully specified.
- Second-opinion review of a diff.

Never delegate: planning, decisions, anything touching credentials.

## Call shape

- Always pass `cwd` = absolute repo path, `approval-policy` = `never`, and `sandbox` =
  `read-only` for research and review or `workspace-write` for implementation.
- Bound every prompt's reply ("under N words", "path:line list only"). Unbounded replies
  flood the caller's context. Max reasoning effort makes the answer better, not shorter,
  so the bound stays regardless of effort.
- Follow-ups go through `codex-reply` on the same `threadId`, so the accumulated context
  stays on the Codex side.
- Parallel fan-out: one MCP server is serial. Use N `codex exec` background processes
  instead of N MCP calls.
- Verify it actually ran: `/codex-hud:usage-today` deltas, or `pstree -p <claude-pid>`
  showing a codex child.

## Which model, and at what effort

Two models, split by task shape (user, 2026-09-03: "when using codex, use luna max for
most requests, sol high for problem solving").

- **Most requests: `gpt-5.6-luna` at `model_reasoning_effort: "max"`.** Read-heavy sweeps,
  mechanical implementation of a specified plan, second-opinion review.
- **Problem solving: `gpt-5.6-sol` at `model_reasoning_effort: "high"`.** Root-cause hunts,
  a failure nobody has explained yet, a design fork with no obvious answer.

Set both fields on every call. Luna's own default is `medium` and sol's is `low`, the
lowest default of any model in `~/.codex/models_cache.json`, so leaving effort unset
silently downgrades a delegation meant for hard work. `max` is a real level (low, medium,
high, xhigh, max per that cache file), not a synonym the CLI ignores.

MCP form (`mcp__codex__codex`): `model: "gpt-5.6-luna"`, `config: { model_reasoning_effort:
"max" }`, plus the usual `cwd`, `approval-policy: never`, `sandbox`.

CLI form:

```bash
codex exec -m gpt-5.6-luna -c model_reasoning_effort="max" \
  --sandbox read-only -C <abs repo path> "<prompt>"
```

Verified 2026-09-02 with `--strict-config`, which accepted `model_reasoning_effort` and
reported `reasoning effort: max` in the session header.

## Two model-id traps

Measured 2026-09-04.

**The raw platform API does not take `max`.** `/v1/chat/completions` rejects
`reasoning_effort: "max"` on `gpt-5.6-luna` with `unsupported_value` ("Supported values are:
'none', 'low', 'medium', 'high', and 'xhigh'"). Codex's `max` maps to `xhigh` on the raw
API.

**A short model name gives a misleading refusal.** Always use the full slug. `luna` alone
404s on the platform API, and through the Codex CLI the same short name answers HTTP 400
`The 'luna' model is not supported when using Codex with a ChatGPT account`. That reads as
a subscription-tier refusal and is not one: it is the generic unknown-or-unentitled-slug
message, and the retired `gpt-5.2-codex` draws the identical line. Never conclude from it
that a model is unavailable to the account. Misread that way on 2026-09-04, and two audits
ran on the default model as a result. Check `~/.codex/models_cache.json` for the live slug
list before substituting anything.
