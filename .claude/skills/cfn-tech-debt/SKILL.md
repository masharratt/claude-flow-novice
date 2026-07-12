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
cfn: <ceiling>[,|;] <upgrade trigger>
```

**A comma OR a semicolon separates ceiling from trigger — both are accepted.** (Semicolon is in practice the dominant style.) The harvest splits on whichever comes first.

- **Valid** (names ceiling AND trigger):
  - `# cfn: global lock, per-account locks if throughput matters`
  - `// cfn: O(n^2) scan, switch to index when list > 1k rows`
  - `// cfn: fixed retry/backoff at MVP; make per-error-class if a path needs more.`
  - `// cfn: mirrors app.session_state CHECK; bump only if the migration CHECK moves.`
- **Invalid: `no-trigger`** (states a limit but no trigger to revisit; these silently rot):
  - `// cfn: this is the naive version`
  - `# cfn: hardcoded for now`

A marker may **wrap across following comment lines**; the trigger may live on line 2+:

```js
/** cfn: process-local dedup; swap for a store-returned is_new flag
 *  when intake runs multi-instance. */
```

Rule: if you write a `cfn:` marker, name the trigger. A shortcut with no trigger is a leak, not a decision.

## Inputs

- `$1`: `--persist` (optional): write the ledger to `docs/TECH_DEBT.md`. Default: report to stdout only, change nothing.

## Outputs

- stdout: one row per marker, grouped: `<file>:<line>: ceiling: <ceiling>. upgrade: <trigger|NONE>.`
- Summary line: `<N> markers, <M> with no trigger.` (or `No cfn: debt. Clean ledger.`)
- Machine ledger (always written when `jq` is present): `.cfn-cache/tech-debt-ledger.json`. Gitignored, project-scoped. Shape: `{generated, total, no_trigger, markers:[{file, line, ceiling, upgrade_trigger|null, has_trigger}]}`. This is the feed `cfn-megaplan` reads during scoping (see below).
- With `--persist`: `docs/TECH_DEBT.md` (human-facing markdown)
- exit code: 0 = success

## Feeds cfn-megaplan (the loop)

The JSON ledger closes the "later means never" loop. `cfn-megaplan` reads `.cfn-cache/tech-debt-ledger.json` during its Step 0 scope check and surfaces open debt in the files/area being planned as candidate backlog entries. Deliberate shortcuts become visible at the next planning pass instead of rotting. The harvester writes; megaplan only reads. Run this skill after implementation so the ledger stays current for the next plan.

## Usage

```bash
# Report only (default)
./.claude/skills/cfn-tech-debt/harvest.sh

# Write/refresh the ledger file
./.claude/skills/cfn-tech-debt/harvest.sh --persist
```

## How Harvest Works

**Match:** `grep -rlE '(#|//|--|/[*]|^[[:space:]]*[*]).*cfn:'` picks the candidate **files**; `awk` then re-scans each one. (File-based, not `grep -n` line-based, because the parser must look *ahead* at continuation lines — see Parse.) A marker counts when `cfn:` appears **anywhere inside a comment**, not only immediately after the comment token. All of these are real markers and all are harvested:

```
// cfn: global lock, per-account locks if throughput matters      <- adjacent
// same seam. cfn: log + ignore at MVP; MP4 wires the handler.    <- mid-comment
 * cfn: mirrors deriveCostUsd's token math, unify on a third use  <- JSDoc continuation
/** Backoff (ms) for attempt N. cfn: fixed base 100ms, tune if the pooler flaps. */
```

The earlier pattern (`(#|//|--|/\*) ?cfn:`) required the marker to sit adjacent to the comment token and silently dropped ~45% of real debt — whole files never reached the ledger. The rule is: **prefer over-capturing a real marker to silently dropping one.**

Scanning files (rather than `grep -n` output) also recovers markers in source files that `grep` classifies as **binary** — one stray NUL byte anywhere in a `.ts` file makes line-based `grep -rn` skip the whole file's content silently. `grep -rl` still lists it, and `awk` reads it regardless.

**Parse:** the marker **body** is everything after `cfn:`, **joined across continuation comment lines** — a wrapped marker keeps its trigger:

- Continuations must be *comment* lines in the **same style** as the marker line (`//` → `//`, JSDoc `*` → `*`, `#` → `#`, `--` → `--`).
- The join stops at the first non-comment line, a blank comment line, the closing `*/`, a line that declares its own `cfn:` marker, or after `MAX_CONT` (8) lines.
- Only a **pure comment line** can start a wrapped marker. A trailing `const x = 1; // cfn: ...` is parsed from its own line only, so an unrelated comment underneath it is never absorbed.

The joined body is then split on the **first comma OR semicolon, whichever comes first** → ceiling + upgrade trigger. Neither present → `upgrade: NONE` (the `no-trigger` rot flag). Both fields are truncated at 160 chars (`MAX_FIELD`) — the backstop against a runaway multi-line join swallowing the ledger with a paragraph of prose. **A clipped (`...`-suffixed) trigger may hide the real upgrade condition further down the comment; read the source before judging such a row.**

**Reference exclusion (false-positive guard):** prose that merely *points at* a marker living elsewhere is not itself a marker, and harvesting it manufactures a phantom row (and phantom rot) for a shortcut already counted at its real declaration site. A `cfn:` is treated as a reference, not a declaration, when:

1. it is quoted (`` `cfn:` ``, `"cfn:"`, `'cfn:'`) or directly preceded by `see ` — e.g. `// Intentionally per-process (see cfn: note).`
2. the word right *after* `cfn:` is `marker` or `note` — a real marker's body opens with its **ceiling**, never those words — e.g. `-- (documented cfn: marker in src/config.ts, not this file's concern)`

**Limits, honestly:** this is a lexical rule. A reference phrased another way ("per the cfn: above") is still harvested, and a real marker that opened with a quote or with the literal word "note" would be dropped. Both are rare, and the bias stays *over-capture rather than silently drop* — only this narrow reference class is carved out. Test names like `describe('... cfn: marker fold')` are already excluded by the comment-opener requirement (no comment token on the line).

**Exclusions:**

- Dirs: `node_modules`, `.git`, `dist`, `dist-run`, `build`, `.next`, `coverage`, `worktrees`, `.artifacts`, `.backups` (CFN's own pre-edit backups), and **`.cfn-cache`**. Build output and backups hold stale *copies* of source markers, which double-count the ledger. `.cfn-cache` holds this skill's own JSON ledger plus other skills' cached review diffs (`.cfn-cache/diffs/*.diff`) — harvesting a diff of the codebase re-harvests the codebase with the diff file as the "source", producing pure garbage rows.
- File types: `*.md`, `*.mdx`, `*.markdown`, `*.rst`, `*.txt`. Planning docs, specs, READMEs and this skill's own `docs/TECH_DEBT.md` only *quote* marker text in prose; none is shipped code that can carry debt. Prose is excluded by **extension, not by directory** (`planning/` is *not* excluded as a path) so that real code living under a docs directory still reaches the ledger.

The harvest reads and reports by default. `--persist` is the only thing that writes a tracked file (`docs/TECH_DEBT.md`); the gitignored `.cfn-cache/tech-debt-ledger.json` is always refreshed.

## Anti-Patterns

- Writing a `cfn:` marker with no trigger (creates rot the ledger will flag)
- Using `cfn:` to excuse skipped validation, error handling, security, or accessibility (those are never legitimate shortcuts, see `code-quality.md` Definition of Done)
- Treating the ledger as a backlog substitute: high-impact `no-trigger` rows should graduate to `cfn-project-management` backlog items

## Related

- `cfn-arch`: the build ladder that decides when a shortcut is justified
- `cfn-dry-review`: finds accidental over-engineering (opposite axis)
- `cfn-project-management`: promote rot-risk markers to backlog
- `cfn-megaplan` (reads `.cfn-cache/tech-debt-ledger.json` at scope time so open debt in the planned area surfaces as backlog candidates)
