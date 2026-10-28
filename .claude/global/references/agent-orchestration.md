# Agent Orchestration Detail

Load when: spawning or forking agents, writing a spawn brief, picking a helper's model, waiting on a background agent or shell. The always-loaded one-liners live in CLAUDE.md §2 Agent Usage; `cfn-spawn-depth-guard.sh` (PreToolUse on Agent/Task), `cfn-subagent-start.sh` and the `cfn-shell-*` hooks enforce most of this.

## Brief budget (warned by `cfn-spawn-depth-guard.sh`)

A spawn brief is an assignment (task one-liner, input paths, output path + cap), not a context carrier. Keep it ≤ ~2KB; context goes in a file and the brief passes the path. Big briefs make agents write big: over-cap artifacts and compression spawns. The spawn hook warns over 4096 bytes (`CFN_BRIEF_MAX_BYTES`; log `~/.claude/brief-size-warn.log`).

## Model choice (blocked by `cfn-spawn-depth-guard.sh`)

Every spawn of a profile-less type (`general-purpose`, `claude`) names a `model`: sonnet for routine implementation, test fixes and research; opus for architecture, hard debugging, security and plan-critical calls; haiku for mechanical work. Unset, it silently inherits the chat's Opus (2.0M output tokens in one week, measured 2026-10-08). The spawn hook blocks a missing model and announces every helper's model to the user (`CFN_MODEL_CHOICE=warn|off` to relax). Longer model/effort guidance: `model-and-thinking-selection.md`.

## Depth limit (blocked by `cfn-spawn-depth-guard.sh` + `cfn-subagent-start.sh`)

Only the main chat spawns agents. A subagent reading this is a leaf: execute the brief directly, never call Agent/Task. If a brief is too big for one agent, say so in the report and let the main chat split it. Exception: orchestration skills (cfn-loop-task, cfn-megaplan and its phase skills) whose own instructions say to spawn. For read-only fan-out prefer `Explore` (its tool set excludes Agent, so nesting is impossible). Any other spawn brief ends with the line: "You are a leaf agent. Do not spawn subagents; do the work yourself."

## Two things that are not completion signals

Never block on `Monitor` waiting for a subagent notification. Never treat a size-stable output file as "the agent finished" (later agent passes silently overwrite coordinator edits to that file). Wait for the completion notification, nothing else.

## Fork subagents (`subagent_type: "fork"`): token hazard (prose only; the guard exempts forks)

**Default: do NOT fork.** A fork re-sends the entire main-chat context on the parent model (N parallel forks = N x full context); a fresh agent with 5-20 lines of context costs a fraction, and `SendMessage` reaches a live agent that already has it. Fork only when the task depends on conversation-built reasoning a short brief cannot restate without losing fidelity that changes the answer: exactly one fork, late in the session, when context IS the payload. Never for search/read/research, mechanical edits, test runs, or commits; never from inside a fork; past ~50k tokens of conversation, state the reason aloud. Cheapest first: restate in a fresh prompt → point at a file/plan artifact → `SendMessage` → fork last.

## Shell watchdog (enforced by `cfn-shell-watchdog.sh`, `cfn-shell-track.sh`, `cfn-shell-status.sh`)

**Arm a 15-min check when you launch a background task shell:** `CronCreate` a recurring ~15-min prompt that re-reads the shell's output and process state; `CronDelete` when it exits. Hooks do the rest: the Stop guard blocks idle until the check is armed (ack with `touch /tmp/cfn-shell-watch/<session>.<pid>.watched`), and next-prompt status surfaces finished-but-unacknowledged shells. Services (dev servers, watch mode, `tail -f`) are auto-exempt: reported once, then left alone.

## Tests inside agents (user decision 2026-10-28)

Helpers may run the single test file they are working on, to see it go red then green. Only the main session runs full suites. (Replaces the older "never run tests inside agents" rule, which contradicted TDD-by-subagent.)
