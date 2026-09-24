# Codex Delegation

Load this before any Codex call. Codex is available ONLY in projects whose own CLAUDE.md
contains a literal `codex=true` line. In every other project, never call codex.

Subscription-billed: keep `OPENAI_API_KEY` unset, or calls silently bill the API instead.

Codex runs through the `codex exec` CLI (driven by the `codex-exec` skill). The
`codex mcp-server` entry point was removed in codex-cli 0.156.1; never reference
`mcp__codex__*` tools.

## What to delegate

- Read-heavy sweeps: grep forests, log dumps, schema dumps.
- Mechanical implementation of a plan part that is already fully specified.
- Second-opinion review of a diff.

Never delegate: planning, decisions, anything touching credentials.

## Call shape

- Always pass `-C <abs repo path>` (working directory) and `-s read-only` for research
  and review or `-s workspace-write` for implementation. `codex exec` is
  non-interactive by design, so there is no approval prompt to suppress.
- Bound what enters your context: `-o <file>` writes only the agent's final message to
  a file. Read that file; do not parse raw stdout (it echoes the whole session). Add
  `--json` when you need the full JSONL event stream, or `--output-schema <file>` when
  the final answer must be structured.
- Bound every prompt's reply too ("under N words", "path:line list only"). Max reasoning
  effort makes the answer better, not shorter, so the bound stays regardless of effort.
- Follow-ups go through `codex exec resume <session-id> "<prompt>"` (or `--last` to
  resume the newest recorded session), so the accumulated context stays on the Codex side.
- Parallel fan-out: exec is just processes. Run N background `codex exec` jobs with one
  `-o` file each; nothing serializes them.
- Verify it actually ran: `/codex-hud:usage-today` deltas, or `pstree -p <claude-pid>`
  showing a codex child.

## Which model, and at what effort

Two models, split by task shape (user, 2026-09-03: "when using codex, use luna max for
most requests, sol high for problem solving"). Live slugs per `~/.codex/models_cache.json`
(checked 2026-09-24): `gpt-6-luna`, `gpt-6-sol`, `gpt-6-astra`.

- **Most requests: `gpt-6-luna` at `model_reasoning_effort: "max"`.** Read-heavy sweeps,
  mechanical implementation of a specified plan, second-opinion review.
- **Problem solving: `gpt-6-sol` at `model_reasoning_effort: "high"`.** Root-cause hunts,
  a failure nobody has explained yet, a design fork with no obvious answer.

Set both fields on every call. Both gpt-6 models default to `medium` and support the full
ladder (low, medium, high, xhigh, max per the cache file), so leaving effort unset
silently downgrades a delegation meant for hard work. `max` is a real level, not a
synonym the CLI ignores.

CLI form:

```bash
codex exec -m gpt-6-luna -c model_reasoning_effort="max" \
  --sandbox read-only -C <abs repo path> -o /tmp/codex-answer.md "<prompt>"
```

Flags verified against codex-cli 0.156.1 `--help` on 2026-09-24. `--strict-config`
accepted `model_reasoning_effort` and reported `reasoning effort: max` in the session
header (measured 2026-09-02).

## Two model-id traps

**gpt-6-* models need codex-cli 0.156+.** On 0.153.4, `-m gpt-6-luna` warns "Model metadata ... not found" then 400s with "not supported when using Codex with a ChatGPT account", the same misleading refusal as a short name. Measured 2026-09-24: `npx -y @openai/codex@0.156.1 exec -m gpt-6-luna` works. Fleet runs can point the per-run engines.env codex bin at a wrapper that execs that npx line instead of upgrading the global install. Global install upgraded to 0.156.1 on 2026-09-24, so the wrapper is no longer needed on this machine.

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
