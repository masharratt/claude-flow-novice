---
name: cfn-vote-implement
description: "MUST BE USED after cfn-dry-review or cfn-alpha-launch:manifest produces a manifest. Do not manually implement code review suggestions - always route through this skill for consensus. 3-agent specialized voting on code review suggestions. Unanimous items auto-implemented with TDD. Split votes surfaced to user."
version: 1.1.0
tags: [voting, consensus, TDD, implementation, code-review]
status: production
---

# CFN Vote & Implement

**Purpose:** Three specialized agents independently review a manifest of code suggestions, vote on each, then auto-implement unanimous items with TDD and surface split decisions to the user.

## Inputs

- `$1`: Path to a review manifest JSON, or `latest` to use the most recent manifest in `/tmp/`
- `--dry-run`: Show what would happen without implementing anything

### Accepted Manifest Sources

Any skill emitting the shared manifest schema works. Discovery glob for `latest`:
```
/tmp/cfn-dry-review-*.json          # cfn-dry-review
/tmp/cfn-review-alpha-*.json         # cfn-alpha-launch (v1)
/tmp/cfn-review-alpha-v2-*.json      # cfn-alpha-launch-v2
```
Pick the most recent by mtime. Manifest's `source` field (if present) records the producing skill.

## Outputs

- Implementations (with TDD) for unanimously approved suggestions
- User decisions requested for 1-2 vote items (one question per item)
- Summary report to stdout

## Voting Agents (Specialized Lenses)

| Agent | Lens | Evaluates |
|-------|------|-----------|
| **Correctness Agent** (code-reviewer) | Risk and correctness | Will this change break anything? Is the suggested approach technically sound? Are there edge cases or regressions? |
| **Consistency Agent** (code-standards-reviewer) | Codebase alignment | Does this follow existing patterns? Would it create a second way of doing something? Does the abstraction match the project's style? |
| **Feasibility Agent** (architect) | Implementation feasibility | Can this be done cleanly? Are there hidden dependencies? Does it fit the existing architecture? What's the real effort? |

## Voting Protocol

1. All 3 agents receive the full manifest simultaneously (parallel)
2. Each agent independently votes YES/NO per suggestion with 1-2 sentence reasoning
3. Votes are collected and tallied per suggestion:

| Votes | Action |
|-------|--------|
| 3 YES | Auto-implement via subagent with full TDD |
| 1-2 YES | Surface to user with AskUserQuestion. Present each agent's reasoning. One decision per question. |
| 0 YES | Skip silently |

## Implementation Protocol (3-vote items)

Implemented sequentially (not parallel) since earlier changes affect later ones:

1. Write failing test that captures the improvement
2. Implement the change (minimal diff)
3. Verify test passes
4. Run existing test suite to catch regressions
5. Move to next item

## User Decision Format (1-2 vote items)

Each split-vote item is presented as a single question:

```
Suggestion S003: Extract shared validation logic from auth.ts and billing.ts

Votes: 2/3 (Correctness: YES, Value: YES, Feasibility: NO)

Reasoning:
- Correctness: "Both files duplicate the same email regex and null checks. Extracting prevents future drift."
- Consistency: "The codebase already uses a shared validators/ directory for cross-module validation. This fits that pattern."
- Feasibility: "The two validators have subtly different error return types. Unifying requires a breaking change to billing's error contract."

Implement this suggestion? (yes/no)
```

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
/cfn-vote-implement /tmp/cfn-dry-review-1712345678.json

# Preview without implementing
/cfn-vote-implement latest --dry-run
```

## Related

- `/cfn-dry-review` - generates the DRY/modularity review manifest
- `/cfn-alpha-launch:manifest` - emits alpha-readiness fix-list as manifest
- `/cfn-alpha-launch-v2:manifest` - emits priority-group fix-list as manifest
