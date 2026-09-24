---
name: cfn-goap-builder
description: "Scaffold planner/coordinator agents for any runtime from the GOAP pattern (goal-state, preconditions/effects actions, backward chaining, 3-strike replan). Use when building an autonomous planner or coordinator OUTSIDE Claude Code: glm/codex workers, scheduled bots, or code-level state machines that must pick their own next action instead of following a brittle script."
version: 1.0.0
tags: [goap, agent-builder, planner, coordinator, replanning, world-state]
status: dev
---

# CFN GOAP Builder

Scaffolds a planner/coordinator agent from the GOAP (Goal-Oriented Action
Planning) pattern distilled in `cfn-goap-plan`. GOAP is the right model for
autonomous coordinators because the agent self-heals: when reality breaks a
precondition, it re-plans from observed state instead of executing a dead
script. This skill emits an agent SPEC. It does not run agents.

## When to use

- A worker must choose its own next step from world state (deploy coordinator,
  content pipeline, triage loop, fleet worker).
- The runtime is anything that can hold a prompt and read/write state JSON:
  Claude, GLM, Codex, or plain code with no LLM at all.
- NOT for one-shot task lists — a plain checklist is cheaper when order never
  changes and nothing ever fails.

## Inputs

Gather before scaffolding (ask the requester if missing):

1. **Goal** — done-ness described as observable facts, not a narrative.
2. **World facts** — what is true right now, and how the agent observes it
   (API check, file exists, command exit code).
3. **Actions** — what the agent can actually do, and each one's real
   preconditions and effects. Derive these from the domain if not given, and
   mark derived ones as assumptions.
4. **Target runtime** — Claude/GLM/Codex system prompt, or pure code.

## The blueprint (emit all five parts)

### 1. State schema

World state is a flat map of named facts — booleans or scalars — never prose.

```json
{ "tests_green": false, "image_built": false, "deployed": false, "health_ok": false, "attempt": 0 }
```

Rules: every fact has ONE observer (which check sets it); facts the agent
cannot observe directly do not exist in the schema.

### 2. Action contract

One table row per action. Preconditions = facts required before running;
effects = facts the action sets on success.

| Action | Preconditions | Effects | Cost |
|---|---|---|---|
| run_tests | repo_cloned | tests_green | 3 |
| build_image | tests_green | image_built | 2 |
| deploy | image_built | deployed | 1 |
| verify_health | deployed | health_ok | 1 |

An action with no precondition must be either an observer (sets a fact from
the real world) or flagged as a smell.

### 3. Planning loop

Backward-chain from the goal: pick one unsatisfied goal fact, choose the
action whose effects set it, recurse on that action's preconditions. Order the
resulting chain by total cost (A* when costs differ; greedy is fine when they
are equal). Execute ONE action per tick, re-observe, repeat until all goal
facts are true. Hard-cap total ticks (default 25) — hitting the cap is an
escalation, not a pause.

### 4. Replan trigger (3-strike rule)

After 3 consecutive failures (same action, or any 3 in one goal chain):

1. Re-observe every fact in the schema from the real world.
2. Identify which precondition turned out false (e.g. `tests_green: true`
   was assumed, but the test command now fails).
3. Correct the fact, add the blocking fact to state if a new one was
   discovered, exclude actions whose preconditions cannot be satisfied, and
   re-plan from current state.

Never retry a failed action without changing at least one fact or input.

### 5. Escalation

Goal unreachable from observed state + available actions → STOP. Emit: which
goal fact is unreachable, which facts were observed, which action/precondition
pair would close the gap. Hand to a human; do not degrade the goal silently.

## Runtime compilation

| Target | Shape of the deliverable |
|---|---|
| LLM worker (Claude/GLM/Codex) | System prompt carrying the state schema + action contract + loop rules; worker reads state JSON, returns one action + the state mutation it claims; outer runner applies and re-observes. |
| Pure code | Action table as JSON data; planner is ~50 lines of backward chaining over the table; observer functions per fact. |
| Hybrid | LLM proposes; code validates preconditions before executing any action (recommended when actions are destructive). |

For destructive actions, validation belongs in CODE, not in the prompt: the
runner checks preconditions against observed state and refuses violations.

## Worked example (deploy coordinator)

Goal: `{ health_ok: true }`. State: as in the schema above. Actions: as in the
contract. First plan: run_tests → build_image → deploy → verify_health.
`verify_health` fails 3× because `deployed` was observed true but the endpoint
404s. Replan: re-observe — the deploy went to the wrong environment
(`deployed` corrected to false, new fact `env_pinned: false`). New plan adds a
`pin_env` action, re-runs deploy + verify. If `env_pinned` cannot be achieved
with available actions, escalate with the gap named.

## Anti-patterns

- **Script-as-plan**: an ordered list of steps with no preconditions. This is
  a TODO list; it cannot replan. If every action has exactly one possible
  predecessor, GOAP adds nothing — use a checklist.
- **Prose goals**: "make the site fast" is not a goal state. Demand
  observable facts ("lcp_under: 2.5").
- **Silent retries**: retrying without a state change. The replan trigger
  exists to prevent exactly this.
- **Unbounded loops**: no tick cap. Every spec gets a cap and an escalation
  path.

## Output

Emit the spec as a single document: state schema, action table, plan/replan
loop, escalation policy, and the runtime-specific deliverable. Close with the
tick cap and the observer command for every fact, so the requester can
implement the runner without inventing anything.
