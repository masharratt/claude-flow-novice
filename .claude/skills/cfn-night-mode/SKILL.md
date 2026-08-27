---
name: cfn-night-mode
description: "Global autonomy flag with decision log and morning report. While on, sessions never stop on AskUserQuestion or plan approval stalls: they decide with a conservative reversible default, log every choice to decision-log under night-<date> slugs, commit finished work without pushing, and surface the whole batch in a morning report the next day."
version: 1.0.0
tags: [autonomy, hooks, guard, decisions, morning-report]
status: production
---

# Night Mode

## Contract

While the flag is on, the main chat has full autonomy: it does not stop on AskUserQuestion, EnterPlanMode, or plan approval stalls. This is the same contract as `cfn-megaplan --unattended`, applied globally: take the recorded conservative default instead of stopping; never widen scope, never loosen a boundary, never skip a bar. Night mode only removes the wait. In exchange, every autonomous decision MUST be recorded in the decision log under slug `night-<date>` so the morning report can surface the batch for review and overturn. A session without logging is a violation, not an optimization: the report prints a red flag when denies outnumber records.

## Safety floor

Autonomy NEVER covers these. They are never executed and never "decided" to execute. Each one becomes a deferred blocking decision (`--blocking --status proposed --chosen "DEFERRED: <what>"`) and work continues on a different path:

- Database destruction: DB DELETE, DROP, TRUNCATE (any unscoped destructive SQL)
- Deploys of any kind (Fly, Vercel, Supabase push, production migrations)
- `git push` in any form, `git force/reset/clean`
- Credential or secret changes, key rotation
- New Anthropic provider API calls added to project code

## Git policy

Commit finished work as you go (`git commit`). NEVER push. Push is a morning action for a human.

## Decision logging

```bash
# Normal autonomous decision (status accepted is the record.sh default):
bash $HOME/.claude/skills/decision-log/record.sh --slug night-$(date +%F) \
  --id <D-n> --title "<the question, short>" \
  --chosen "<option you picked>" --rationale "<why, one line>"

# Safety-floor deferral (then continue on a different path):
bash $HOME/.claude/skills/decision-log/record.sh --slug night-$(date +%F) \
  --id <D-n> --title "<the question, short>" \
  --chosen "DEFERRED: <what you wanted>" --rationale "<why>" \
  --blocking --status proposed
```

The guard hook emits ready-to-run versions of these when it blocks a question. Decision ids use the form `D$(date +%H%M%S)-$$` so same-second concurrent denies cannot overwrite each other via upsert.

## Morning report

`report` prints the whole overnight window: NEEDS ACTION (proposed + blocking, full cards), AUTO-DECIDED FYI (accepted, one line each), Accountability (deny count vs decision count, with a printed red flag when there are denies and zero logged decisions), and best-effort `git log --since` as commit evidence. Turning the flag off (`off`) renders the report automatically and writes `.night-mode-pending-review`; a fresh session then reminds about the report until `report --ack` clears the marker and truncates the events log.

## CLI reference

```bash
bash $HOME/.claude/skills/cfn-night-mode/night-mode.sh on        # activate + doctor check
bash $HOME/.claude/skills/cfn-night-mode/night-mode.sh off       # unlink flag, print report, mark pending
bash $HOME/.claude/skills/cfn-night-mode/night-mode.sh status    # flag, pending, registrations, today count
bash $HOME/.claude/skills/cfn-night-mode/night-mode.sh report [--ack] [--since YYYY-MM-DD] [--project P]
bash $HOME/.claude/skills/cfn-night-mode/night-mode.sh doctor [--install]
```

Window precedence for `report`: `--since` > pending marker > flag start timestamp > today. State lives in `$HOME/.claude/` (dotfiles: `.night-mode-active`, `.night-mode-pending-review`, `.night-mode-events.log`) unless overridden. Test/sandbox overrides: `CFN_NIGHT_MODE_DIR`, `CFN_NIGHT_SETTINGS`, `DB_PATH`.

## Hooks

- `.claude/hooks/cfn-night-mode-guard.sh`: PreToolUse, matcher `AskUserQuestion|EnterPlanMode|ExitPlanMode`. Blocks questions and new plan modes with self-contained instructions (a subagent hitting the guard needs nothing else); answers ExitPlanMode with a JSON allow so a session already mid-plan when the flag flips on is not trapped. Fails open (silent exit 0) when the flag is off or jq is missing.
- `.claude/hooks/cfn-night-mode-inject.sh`: registered under SessionStart AND UserPromptSubmit. On, it injects this contract at session start (read live from this file, so no duplicated copy drifts) and a short per-turn reminder. Off with a pending marker, it emits the review reminder in the event-correct shape.

Registrations live in `~/.claude/settings.local.json` (machine-local, never committed). Install or repair with `doctor --install`; verify with plain `doctor`. Exit 1 means something is missing and is named in the output.

## Dependencies

- `bash`, GNU `date` (WSL2/GNU platform assumption)
- `jq` (hooks and settings transforms; guards fail open without it)
- `sqlite3` (decision store, same DB as decision-log)
- `$HOME/.claude/skills/decision-log/record.sh` (single writer for decisions)
