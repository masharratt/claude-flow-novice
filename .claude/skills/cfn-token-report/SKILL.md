---
name: cfn-token-report
description: "Report where Claude Code tokens went, from the local session logs: totals plus breakdowns by project, agent type (main chat vs each subagent type), model and day. Use when asked about token use, which agents or projects burn the most, or whether a workflow got more expensive. Tokens only; subscription limits come from Claude Code's /usage."
version: 1.0.0
tags: [tokens, usage, cost, observability]
status: production
---

# CFN Token Report

**Purpose:** Answer "where did my tokens go?" without guessing. Claude Code records exact
token counts for every reply in `~/.claude/projects/`, on a subscription or not. This skill
reads them.

## Usage

```bash
python3 -I "$HOME/.claude/skills/cfn-token-report/report.py"                 # last 7 days
python3 -I "$HOME/.claude/skills/cfn-token-report/report.py" --days 1
python3 -I "$HOME/.claude/skills/cfn-token-report/report.py" --since 2026-10-01 --project fireside
python3 -I "$HOME/.claude/skills/cfn-token-report/report.py" --json            # for scripts
```

Options: `--days N` or `--since YYYY-MM-DD`, `--project <text>`, `--top N` (rows per
breakdown, default 10), `--json`.

## Reading the numbers

- **output**: what the model wrote. The most expensive kind.
- **new input** and **cache written**: fresh context sent to the model.
- **cache read**: context re-read from cache. Large but cheap; breakdowns sort by the other
  three ("fresh tokens") so cache reads do not dominate.
- **By agent**: `main` is the chat itself; every other row is a subagent type, read from the
  subagent's `.meta.json`.

When relaying results to the user, lead with the biggest consumer and what it suggests
(for example a subagent type doing most of the work), not the full tables.

## Limits

- Counts each reply once. Claude Code writes the same reply on several log lines, so a raw
  line count overstates usage 2-5x.
- Tokens only, no dollars. On a subscription the limit that matters is the 5-hour and weekly
  cap shown by `/usage`, which the logs do not record.
- Sees only work run through Claude Code. Codex and other CLIs keep their own logs.

## Tests

`bash "$HOME/.claude/skills/cfn-token-report/tests/test-token-report.sh"`
