---
name: cfn-goap-plan
description: "GOAP planning bookend. Run BEFORE plan mode to model goal state, derive optimal action sequence. Run DURING implementation when 3-strike rule fires to replan from current world state."
version: 1.0.0
tags: [planning, goap, goal-modeling, replanning, pre-plan]
status: production
---

# CFN GOAP Plan

**Purpose:** Two jobs:
1. **Pre-plan:** Model goal state before entering plan mode. Forces backward reasoning from end state → actions, not forward reasoning from task description → steps.
2. **Replan:** Mid-implementation recovery when assumptions fail (3-strike trigger). Re-evaluate world state, find new action sequence to goal.

## CLI

```bash
echo '<json>' | node dist/src/planning/goap/cli.js
```

Input schema:
```json
{
  "state": { "<key>": "<bool|number|string>" },
  "goal": { "conditions": { "<key>": "<value>" } },
  "actions": [
    {
      "name": "<string>",
      "preconditions": { "<key>": "<value>" },
      "effects": { "<key>": "<value>" },
      "cost": 1
    }
  ],
  "options": { "maxIterations": 10000, "excludedActions": [] }
}
```

Output: `{ plan: { actions, totalCost, reachable }, success, error? }`

---

## Mode 1: Pre-Plan (run before /write-plan or plan mode)

### Step 0: Scope Challenge

Before modeling, verify minimum viable scope:
- Does a solution already exist in the codebase?
- Is this ≥8 files? If yes, stop and ask user to narrow scope first.
- Can the goal be split into independent sub-goals?

### Step 1: Elicit Goal State

Ask: "What must be true when this is done?" — not "what steps will you take."

Extract world state keys as boolean/string/number facts. Examples:
- `schema_migrated: true`
- `api_endpoint_exists: true`
- `tests_passing: true`
- `feature_flag_enabled: false`
- `old_code_removed: true`

Distinguish between:
- **Must-have:** goal conditions (required for success)
- **Nice-to-have:** out of scope for this plan
- **Already true:** part of initial state, not a goal

### Step 2: Model Initial State

Survey current world state. Keys that are already true belong in `state`, not `goal.conditions`.

Check:
- What code/schema/config currently exists?
- What tests currently pass?
- What dependencies are in place?
- What is explicitly absent or broken?

### Step 3: Define Actions

For each step needed, define:
- `name`: verb-noun, e.g. `write_migration`, `update_api_types`, `add_rls_policy`
- `preconditions`: what must be true before this action runs
- `effects`: what becomes true after this action runs
- `cost`: relative effort (1=trivial, 2=moderate, 5=complex, 10=risky/unknown)

Cost heuristics:
| Cost | Meaning |
|------|---------|
| 1 | Config change, rename, constant update |
| 2 | New function, type change, test update |
| 5 | New API endpoint, schema migration, multi-file refactor |
| 10 | Cross-project change, data migration, auth/security change |

### Step 4: Run GOAP Planner

```bash
echo '{
  "state": { ... },
  "goal": { "conditions": { ... } },
  "actions": [ ... ]
}' | node dist/src/planning/goap/cli.js
```

If `reachable: false`: missing actions. Find what preconditions are unmet and add bridging actions.

If plan has redundant actions (cost higher than expected): check for circular preconditions or actions that block each other.

### Step 5: Output Structured Plan

Present to user:

```
## GOAP Plan

### Goal State
- schema_migrated: true
- tests_passing: true
- old_code_removed: true

### Initial State
- schema_migrated: false
- tests_passing: true  (existing tests)
- old_code_removed: false

### Action Sequence (A* optimal, totalCost: N)
1. write_migration  [cost: 5]  preconditions: none  effects: schema_migrated=true
2. update_types     [cost: 2]  preconditions: schema_migrated=true  effects: types_updated=true
3. remove_old_code  [cost: 1]  preconditions: types_updated=true  effects: old_code_removed=true

### Assumptions (requires cfn-plan-review verification)
- [UNTESTED] No downstream consumers of old schema columns
- [UNTESTED] Migration is reversible (has down() function)
```

Then: hand off to `/write-plan` or plan mode with this structure as input.
Then: run `cfn-plan-review` on the resulting plan.

---

## Mode 2: Replan (3-strike rule trigger)

Fire when: 3 hypotheses have failed during implementation.

### Step 1: Capture Current World State

What actions from the original GOAP plan completed successfully? Update `state` to reflect what is now true.

What failed? Record the failed action and the actual error/blocker.

### Step 2: Identify Broken Preconditions

Which precondition of the failed action turned out to be false? Example:
- Plan assumed `old_api_removed: false` but old API is still referenced by 3 services.
- Plan assumed `migration_reversible: true` but production has constraints blocking rollback.

### Step 3: Revise World State and Actions

Options:
- Add new actions to satisfy unmet preconditions
- Add the blocking fact to initial state and exclude problematic actions
- Change goal conditions if original goal is no longer achievable as stated

Rerun GOAP with revised inputs.

### Step 4: Escalate if Still Unreachable

If revised plan is also `reachable: false`, stop. Present to user:
- What goal conditions are still unmet
- What preconditions cannot be satisfied with known actions
- Recommend scope change or external intervention

Do not attempt a 4th hypothesis.

---

## Integration

| When | What |
|------|------|
| Before plan mode | Run Mode 1, output feeds `/write-plan` |
| After `/write-plan` | Run `cfn-plan-review` as normal |
| 3-strike fires | Run Mode 2, revise plan, re-enter implementation |
| Replan also fails | Escalate to user — do not guess further |

## What This Skill Does NOT Do

- Does not replace `cfn-plan-review` — GOAP gives sequence, plan-review gives blast radius/dependencies
- Does not make scope decisions — surfaces tradeoffs, user decides
- Does not guarantee plan completeness — assumptions still require verification
