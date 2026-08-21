<!-- Extracted from .claude/commands/cfn-loop-task.md so the command body stays
     small. Read on demand from the phase that needs it. -->
# Tool initiation failure capture (global log)

## TOOL INITIATION FAILURE CAPTURE (global log)

When a CFN tool fails to even START — script missing or not executable (bash exit 126/127), an agent `Task` spawn returns nothing or malformed JSON, a slash skill is not found, or `MAX_ITERATIONS` is exhausted with no done verdict — record it to the GLOBAL failure log so it can be troubleshooted later. This is distinct from a tool that STARTS and then fails its check (gate-check exit 1/2/3, verify-run red ACs): those are normal control-flow exits and are NEVER logged here.

One file, shared by every project via the reverse symlink:
`~/.claude/cfn-data/tool-init-failures.jsonl` (gitignored runtime data).

The logger auto-captures timestamp, host, cwd, git branch/commit/dirty, provider, session id, and (from env) `TASK_ID`/`RUN_ID`/`SLUG`/`ITERATION`. Export those four at Phase 1 so records carry them. You only supply tool + category. Two modes:

1. **wrap** (PROGRAMMATIC, preferred for bash-invoked CFN CLI tools). Runs the command, re-emits its real exit code + stdout/stderr unchanged, and logs ONLY on an initiation failure (exit 126/127). Control-flow exits are untouched:
   ```bash
   CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
   bash "$CFN_FAILLOG" wrap --tool gate-check.sh -- \
     $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh --out /tmp/x.txt --threshold 0.95
   GATE_EXIT=$?   # 0/1/2/3 preserved exactly
   ```
   Every `cfn-*/cli/*.sh` invocation in Phase 3 and Phase 5 below is already wrapped this way (including the `tee`-piped ones: `check-test-hygiene.sh`, `harvest.sh`). For a piped call, keep the `2>&1 | tee` outside the wrapper and read the tool's real exit via `${PIPESTATUS[0]}` (a bare `$?` after a pipe captures `tee`'s exit, not the tool's).

2. **record** (EXPLICIT, for LLM-mediated failures the wrapper cannot see). Call when:
   - A `Task` spawn returned no output or a malformed trailing JSON block: `--category NO_OUTPUT` (or `INVALID_OUTPUT`), `--agent-id <id>`.
   - A slash skill / command was not found: `--category SKILL_NOT_FOUND`.
   - `MAX_ITERATIONS` exhausted with no done verdict — emit ONE record at the failure exit (Step 3.1 exit-1, 5E.3 exit-1, or 5E.4a exit-1 branch), before the summary report: `--category MAX_ITERATIONS`, `--tool <last-failing-gate>`, `--exit-code <rc>`, `--phase <phase>`.
   ```bash
   bash "$CFN_FAILLOG" record --tool "Task:backend-developer" \
     --category NO_OUTPUT --stderr "lane returned no JSON block" --phase 2 --agent-id <id>
   ```

Categories: `MISSING_TOOL` `NOT_EXECUTABLE` `BAD_ARGS` `SPAWN_FAILED` `NO_OUTPUT` `INVALID_OUTPUT` `SKILL_NOT_FOUND` `DEPENDENCY_MISSING` `TIMEOUT` `MAX_ITERATIONS` `OTHER`.

Review the log any time to triage: `bash "$CFN_FAILLOG" show [--tool NAME] [--last N]` (pretty-prints with `jq` if present).

---
