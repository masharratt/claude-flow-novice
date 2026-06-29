---
name: cfn-vote-implement
description: "MUST BE USED after cfn-dry-review or cfn-alpha-launch:manifest produces a manifest. Also verification phase of /cfn-loop-task. Never manually implement code review suggestions - route through this skill. 3-agent voting: 3/3 auto-implemented with TDD, 2/3 to product-owner agent, 1/3 surfaced to user via AskUserQuestion (batched 4 per call, at end)."
version: 2.0.0
tags: [voting, consensus, TDD, implementation, code-review]
status: production
---

# CFN Vote & Implement

**Purpose:** Three specialized agents independently review a manifest of code suggestions, vote on each, then auto-implement unanimous items with TDD and surface split decisions to the user.

## Inputs

- `$1`: Path to a review manifest JSON, or `latest` to use the most recent manifest in `<project-root>/.cfn-cache/manifests/`
- `--dry-run`: Show what would happen without implementing anything

### Accepted Manifest Sources

Any skill emitting the shared manifest schema works. Manifests live under
`<project-root>/.cfn-cache/manifests/` (auto-gitignored). Discovery glob for `latest`:
```
.cfn-cache/manifests/cfn-dry-review-*.json           # cfn-dry-review
.cfn-cache/manifests/cfn-security-review-*.json      # cfn-security-review
.cfn-cache/manifests/cfn-dep-audit-*.json            # cfn-dep-audit
.cfn-cache/manifests/cfn-review-alpha-*.json         # cfn-alpha-launch (v1)
.cfn-cache/manifests/cfn-review-alpha-v2-*.json      # cfn-alpha-launch-v2
```
Pick the most recent by mtime. Manifest's `source` field (if present) records the producing skill.

Filenames include nanosecond-precision timestamps to prevent collisions on rapid-fire runs.
Legacy `/tmp/cfn-*.json` paths are checked only as a fallback during transition.

## Outputs

- Implementations (with TDD) for unanimously approved suggestions
- User decisions requested for 1-2 vote items (one question per item)
- Summary report to stdout

## Voting Agents (Specialized Lenses)

| Agent | Lens | Evaluates |
|-------|------|-----------|
| **Correctness Agent** (code-reviewer) | Risk and correctness | Will this change break anything? Is the suggested approach technically sound? Are there edge cases or regressions? |
| **Consistency Agent** (code-standards-reviewer) | Codebase alignment | Does this follow existing patterns? Would it create a second way of doing something? Does the abstraction match the project's style? |
| **Feasibility Agent** (system-architect) | Implementation feasibility | Can this be done cleanly? Are there hidden dependencies? Does it fit the existing architecture? What's the real effort? |

## Voting Protocol

1. All 3 agents receive the full manifest simultaneously (parallel)
2. Each agent independently votes YES/NO per suggestion with 1-2 sentence reasoning
3. Votes are collected and tallied per suggestion:

| Votes (YES) | Action | Timing |
|-------------|--------|--------|
| **3/3** | Auto-implement via subagent with full TDD | Inline during vote pass |
| **2/3** | Spawn `product-owner` agent (GOAP) to decide IMPLEMENT / DEFER / REJECT | Inline during vote pass |
| **1/3** | Queue for batched user decision | Surfaced at end (after all 3/3 and 2/3 resolved) |
| **0/3** | Skip silently | n/a |

## Implementation Protocol (3/3 items)

Implemented sequentially (not parallel) since earlier changes affect later ones:

1. Write failing test that captures the improvement
2. Implement the change (minimal diff)
3. Verify test passes
4. Run existing test suite to catch regressions
5. Move to next item

## 2/3 Routing: Product Owner Agent

Spawn the `product-owner` agent (GOAP planner) one item at a time. Pass:

- The suggestion text + location
- The two YES votes (lens + reasoning)
- The one NO vote (lens + reasoning)
- Current project scope and any active epic context

Product Owner returns one of:

| Decision | Action |
|----------|--------|
| `IMPLEMENT` | Apply now via TDD protocol (same as 3/3) |
| `DEFER` | Log to backlog (`docs/BACKLOG.md`), do not implement |
| `REJECT` | Skip; mark manifest item `status: rejected` with PO reasoning |

The Product Owner is the ONLY decision maker for 2/3 items. Do not surface 2/3 items to the user.

## 1/3 Routing: Batched User Prompts

1/3 items accumulate during the vote pass. After every 3/3 and 2/3 item is resolved, surface them to the user.

**Batch protocol:**
- 4 questions per `AskUserQuestion` call (the tool's maximum)
- One decision per question
- Options per question: `Apply`, `Skip`, `Defer to backlog`
- Question body lists all three vote reasonings so the user understands the split

**Example question (one of 4 in a batch):**

```
Suggestion S007: Extract shared validation logic from auth.ts and billing.ts

Votes: 1/3 (Correctness: YES, Consistency: NO, Feasibility: NO)

Reasoning:
- Correctness (YES): "Both files duplicate the same email regex and null checks. Extracting prevents future drift."
- Consistency (NO): "Project convention prefers in-file validation; a shared module would be the only one of its kind."
- Feasibility (NO): "The two validators have subtly different error return types. Unifying requires a breaking change to billing's error contract."

Apply / Skip / Defer to backlog?
```

After each batch returns:
- `Apply` items: implement via TDD protocol immediately
- `Skip` items: mark `status: skipped`
- `Defer to backlog` items: append to `docs/BACKLOG.md`

Continue batching until 1/3 queue is empty.

## Manifest Resumability

The manifest tracks processing state. If interrupted:
- Already-implemented items are marked `"status": "implemented"`
- Already-skipped items are marked `"status": "skipped"`
- Re-running picks up from where it left off

## Usage

```bash
# Vote on the latest review
/cfn-vote-implement latest

# Vote on a specific manifest
/cfn-vote-implement .cfn-cache/manifests/cfn-dry-review-1712345678000000000.json

# Preview without implementing
/cfn-vote-implement latest --dry-run
```

## Related

- `/cfn-dry-review` - generates the DRY/modularity review manifest
- `/cfn-alpha-launch:manifest` - emits alpha-readiness fix-list as manifest
- `/cfn-alpha-launch-v2:manifest` - emits priority-group fix-list as manifest
