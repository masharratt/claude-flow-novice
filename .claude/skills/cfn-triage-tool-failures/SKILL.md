---
name: cfn-triage-tool-failures
description: "Pull the global CFN tool-initiation failure log and investigate why tools failed to start. Use when log-tool-init-failure.sh has recorded failures (missing scripts, not-executable, agent spawn no-output, skill not found, MAX_ITERATIONS exhausted) and you need to diagnose root cause. Summarizes by tool/category/project, then walks each cluster to a fix."
version: 1.0.0
tags: [troubleshooting, failures, cfn-loop, diagnostics, tool-initiation]
status: production
keywords: [failure-log, triage, initiation-failure, missing-tool, debug, investigate]
triggers: [tool-initiation-failure, missing-cfn-tool, loop-stalled, investigate-failures]
---

# CFN Triage Tool-Initiation Failures

**Purpose:** Pull the global failure log written by `log-tool-init-failure.sh` and turn records into diagnoses + fixes. The log captures only **initiation** failures (a tool that could not even start: exit 126/127, agent `Task` no-output, slash skill not found, MAX_ITERATIONS exhausted) — NOT tools that started and failed their check (gate-check 1/2/3, verify-run red ACs). Those are normal control flow.

**Log path (global, every project via reverse symlink):** `~/.claude/cfn-data/tool-init-failures.jsonl` (one JSON object per line).

Each record carries: `ts host cwd project git_branch git_commit git_dirty session provider tool category exit_code task_id run_id slug iteration phase agent_id command stderr note`.

## Step 1 — Pull and summarize (programmatic)

Heavy aggregation needs `jq`. If `jq` is absent, fall back to the logger's own viewer (`bash ~/.claude/cfn-scripts/log-tool-init-failure.sh show --last 50`) and `grep`.

```bash
LOG=~/.claude/cfn-data/tool-init-failures.jsonl
[ -f "$LOG" ] || { echo "(no failure log yet)"; exit 0; }

echo "=== total records ===";     jq -s 'length' "$LOG"
echo "=== by tool (top offenders) ==="
jq -s 'group_by(.tool) | map({tool:.[0].tool, n:length}) | sort_by(-.n)' "$LOG"
echo "=== by category ==="
jq -s 'group_by(.category) | map({category:.[0].category, n:length}) | sort_by(-.n)' "$LOG"
echo "=== by project (the log is global; scope here) ==="
jq -s 'group_by(.project) | map({project:.[0].project, n:length}) | sort_by(-.n)' "$LOG"
echo "=== recurring: same tool+category across distinct commits (real bug, not one-off) ==="
jq -s 'group_by("\(.tool)|\(.category)") | map({key:(.[0].tool+" / "+.[0].category), commits:(map(.git_commit)|unique|length), sessions:(map(.session)|unique|length), n:length}) | sort_by(-.commits)' "$LOG"
echo "=== most recent 10 ===";    jq -r 'range(.)' "$LOG" 2>/dev/null | tail -10 || tail -10 "$LOG"
```

Scope to one project: pipe through `jq -c 'select(.project=="<path>")'` first.

## Step 2 — Investigate each cluster

For the top tool+category cluster, pull the fullest record (longest `stderr`/`command`) and read the captured context. The `command` field is the exact invocation that failed; `stderr` is the verbatim error; `git_commit` lets you reproduce at that revision.

```bash
# fullest record for a given tool
jq -c 'select(.tool=="<tool>")' "$LOG" | jq -s 'max_by((.stderr//""|length))'
# reproduce at the failing revision (read-only)
git -C <project> switch --detach <git_commit>   # then run the captured .command
```

### Diagnosis by category

| category | likely cause | first check |
|----------|-------------|-------------|
| `MISSING_TOOL` (127) | path wrong, script deleted, or build artifact never produced | `ls -la` the path in `.command`; `git log --diff-filter=D -- <path>` for deletion; if orchestrator/TS, the `dist/` build is missing — rebuild |
| `NOT_EXECUTABLE` (126) | lost +x bit (bad checkout/restore) | `ls -l <path>`; `chmod +x` |
| `BAD_ARGS` | CLI interface drift — flags renamed/removed | diff `.command` vs the tool's current `--help` or arg parser; check recent commits to that script |
| `SPAWN_FAILED` / `NO_OUTPUT` / `INVALID_OUTPUT` | agent `Task` returned nothing or malformed trailing JSON | `.agent_id` + `.phase` identify the lane; check the agent type exists, prompt wasn't truncated, agent didn't crash (OOM/timeout) |
| `SKILL_NOT_FOUND` | slash skill name wrong or unregistered | confirm the skill dir exists under `.claude/skills/` and `name:` matches |
| `DEPENDENCY_MISSING` | tool needs a build/dep absent at runtime | orchestrator `dist/`, `node_modules`, a provider config — check the tool's deps |
| `TIMEOUT` | 300s orchestrator default or hung agent | `.phase` + `.command`; check for a deadlock/infinite loop in that step |
| `MAX_ITERATIONS` | loop exhausted a gate without done (NOT an initiation bug) | `.tool` names the last-failing gate; read its exit-code branch table in `cfn-loop-task.md` |

## Step 3 — Propose fixes

Per cluster, state: root cause, the one-line fix, and whether it is a **one-off** (single bad record, ignore) or a **systemic** bug (recurring across commits/sessions — fix the tool or the call site in `cfn-loop-task.md`). Surface systemic fixes via `AskUserQuestion` before editing shared tooling.

## Notes

- The log is **global** and append-only; records from other projects appear too. Always confirm `.project`/`.cwd` match the project under investigation before drawing conclusions.
- Failures are written by `log-tool-init-failure.sh` `wrap` (auto, 126/127) and `record` (explicit, LLM-mediated cases). A suspiciously empty log for a known-broken run means the call sites were not wrapped/recorded — check `cfn-loop-task.md` Tool Initiation Failure Capture section.
- To clear the log after triage: back it up first, then truncate (`cp "$LOG" "$LOG.bak.$(date -u +%F)" && : > "$LOG"`). Never edit individual lines — other sessions may be appending.
