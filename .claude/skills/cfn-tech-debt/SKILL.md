---
name: cfn-tech-debt
description: "Harvest deliberate code shortcuts marked with `cfn:` comments into a tracked ledger. Use after implementation to inventory deferred shortcuts, or to flag trigger-less shortcuts that silently rot. Marks ceiling + upgrade trigger for every intentional simplification."
version: 1.0.0
tags: [tech-debt, code-quality, ledger, shortcuts, DRY]
status: production
---

# CFN Tech Debt

**Purpose:** Close the "later means never" gap. Every deliberate shortcut gets an inline `cfn:` comment naming its ceiling AND the trigger to revisit it. This skill greps those markers into a ledger and flags any marker with no trigger as a rot risk.

Pairs with `cfn-arch` (the build ladder decides *when* a shortcut is justified) and `cfn-dry-review` (finds *accidental* over-engineering; this tracks *deliberate* under-engineering).

## The `cfn:` Marker Convention

Mark a deliberate simplification inline. The comment names what is limited and what should trigger an upgrade:

```
cfn: <ceiling>, <upgrade trigger>
```

- **Valid** (names ceiling AND trigger):
  - `# cfn: global lock, per-account locks if throughput matters`
  - `// cfn: O(n^2) scan, switch to index when list > 1k rows`
- **Invalid — `no-trigger`** (states a limit but no trigger to revisit; these silently rot):
  - `// cfn: this is the naive version`
  - `# cfn: hardcoded for now`

Rule: if you write a `cfn:` marker, name the trigger. A shortcut with no trigger is a leak, not a decision.

## Inputs

- `$1`: `--persist` (optional) — write the ledger to `docs/TECH_DEBT.md`. Default: report to stdout only, change nothing.

## Outputs

- stdout: one row per marker, grouped — `<file>:<line>: ceiling: <ceiling>. upgrade: <trigger|NONE>.`
- Summary line: `<N> markers, <M> with no trigger.` (or `No cfn: debt. Clean ledger.`)
- With `--persist`: `docs/TECH_DEBT.md`
- exit code: 0 = success

## Usage

```bash
# Report only (default)
./.claude/skills/cfn-tech-debt/harvest.sh

# Write/refresh the ledger file
./.claude/skills/cfn-tech-debt/harvest.sh --persist
```

## How Harvest Works

`grep -rnE '(#|//|--|/\*) ?cfn:'` across the repo, excluding `node_modules`, `.git`, build output, `.artifacts`, and `worktrees` (per CodeSearch indexer convention). Splits each marker body on the first comma → ceiling + trigger. Missing comma → `upgrade: NONE` (the `no-trigger` rot flag).

The harvest reads and reports only by default; `--persist` is the only thing that writes a file.

## Anti-Patterns

- Writing a `cfn:` marker with no trigger (creates rot the ledger will flag)
- Using `cfn:` to excuse skipped validation, error handling, security, or accessibility — those are never legitimate shortcuts (see `code-quality.md` Definition of Done)
- Treating the ledger as a backlog substitute: high-impact `no-trigger` rows should graduate to `cfn-project-management` backlog items

## Related

- `cfn-arch` — the build ladder that decides when a shortcut is justified
- `cfn-dry-review` — finds accidental over-engineering (opposite axis)
- `cfn-project-management` — promote rot-risk markers to backlog
