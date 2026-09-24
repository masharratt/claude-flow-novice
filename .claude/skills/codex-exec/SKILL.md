---
name: codex-exec
version: 1.0.0
tags: [codex, delegation, cli, subscription-billing]
status: draft
author: CFN Team
description: >
  Dispatch tasks to Codex via the codex exec CLI (codex-cli 0.156+; the codex MCP server
  was removed in 0.156.1). Use when asking Codex to review Claude's code changes (git
  diff, unstaged changes, regressions), to execute an implementation plan Claude wrote,
  or to run any self-contained task inside a specific repo. Triggers on "get Codex to
  review", "have Codex implement", "send this to Codex", "ask Codex to execute the
  plan", "codex delegate". GATED: only in projects whose CLAUDE.md contains a literal
  codex=true line.
dependencies: [codex-cli >= 0.156]
created: 2026-09-24
updated: 2026-09-24
complexity: Low
keywords: [codex, exec, delegate, review, implement, gpt-6]
---

# Skill: codex-exec

## Purpose

Dispatch work to Codex through `codex exec` with correct flags, model, and output
bounding every time. Replaces the MCP-era `codex-dispatch` plugin skill, which is dead
since `codex mcp-server` was removed in codex-cli 0.156.1.

## Gate (all three, every call)

1. Target project CLAUDE.md contains a literal `codex=true` line. Otherwise never call
   codex.
2. `OPENAI_API_KEY` unset (subscription billing; set = silent API billing).
3. codex-cli 0.156+ (`codex --version`); gpt-6-* slugs 400 on older builds.

## Inputs

- Task description or diff focus, plus the absolute path of the target repo.

## Outputs

- Codex final message in the `-o <file>` file. Exit code 0 = the session ran to
  completion; still read the file to see whether Codex finished the task or stalled.

## Call shape

```bash
codex exec -m gpt-6-luna -c model_reasoning_effort="max" \
  --sandbox read-only -C /abs/target/repo -o /tmp/codex-answer.md "<prompt>"
```

| Flag | Rule |
|------|------|
| `-C` | Absolute path of the TARGET repo, never the plan or workspace location |
| `--sandbox` | `read-only` for review and research, `workspace-write` for implementation; never `danger-full-access` without an explicit user ask |
| `-o <file>` | Always. Only the final message lands there; raw stdout echoes the whole session |
| `--json` | Optional: full JSONL event stream when a transcript must be parsed |
| `-m` | `gpt-6-luna` at `max` effort for sweeps, implementation, review; `gpt-6-sol` at `high` for root-cause hunts and design forks. Full slugs only |

Follow-ups keep context on the Codex side:
`codex exec resume <session-id> "<prompt>"` (or `--last` for the newest session).

## Workflows

### 1. Review a diff

```bash
codex exec -m gpt-6-sol -c model_reasoning_effort="high" --sandbox read-only \
  -C /abs/repo -o /tmp/codex-review.md \
  "Review the git diff of unstaged changes for <FOCUS>. Run: git diff <FILE1> <FILE2>. <SPECIFIC QUESTIONS>. Answer under 400 words as a path:line list."
```

The prompt must name the exact git diff command with explicit file paths, the specific
questions to answer, and what changed and why.

### 2. Execute a written plan

Inline the FULL plan text into the prompt. Never pass a plan path: Codex cannot read
files outside its `-C` directory. Sandbox `workspace-write`.

### 3. General task in a repo

Fully self-contained prompt (paths, context, constraints), `workspace-write`, one `-o`
file. Have Codex end its final message with `DONE: <what changed>` so completion is
verifiable from the file without re-reading the session.

## After dispatching

1. Read the `-o` file; summarize findings or changes for the user.
2. Flag errors, blocked files, or missing context immediately.
3. Report "done" only when Codex's final message confirms completion, not merely that
   the session started.

## Parallel fan-out

N background `codex exec` processes; nothing serializes them. One `-o` file per job.

## Error recovery

- Wrong repo or missing directory: fix `-C`.
- Reply references files outside the repo: the prompt was not self-contained; inline
  the content and rerun.
- HTTP 400 naming the model: full slug required (`gpt-6-luna`, not `luna`). Both
  model-id traps are documented in `~/.claude/references/codex-delegation.md`.
- Stuck or empty output: retry with a tighter prompt or split the task.
