---
name: cfn-doc-lint
description: "Enforce the feature-status.md and state-machines.md doc contract: closed status vocabulary, required columns, per-entity state-machine shape, cell-length caps, TOC for large files, plural filename. Use after editing either doc, or run --check-all to audit every project. Catches the three failure modes that rotted the portfolio: changelog-in-status-doc, status-vocab drift, and duplicate state-machine entities."
version: 1.0.0
tags: [docs, feature-status, state-machines, lint, contract, quality]
status: production
---

# CFN Doc Lint

**Purpose:** the two commit-time docs (`readme/feature-status.md`, `readme/state-machines.md`)
rotted across 28 projects for the same three reasons: changelog dumped where
status belongs, status vocabulary drifting so no grep works, and duplicate
state-machine entities contradicting each other. This skill enforces the contract
in `SCHEMA.md` so docs stay machine-parseable and human-scannable.

The contract lives in `SCHEMA.md` (same dir). This skill is the enforcement;
the schema is the spec.

## Usage

```bash
# one doc (auto-detects type by filename)
.claude/skills/cfn-doc-lint/execute.sh <project>/readme/feature-status.md

# a project dir (lints both docs if present)
.claude/skills/cfn-doc-lint/execute.sh <project>

# every project
.claude/skills/cfn-doc-lint/execute.sh --check-all /home/masha/projects
```

Exit 0 = clean (warnings allowed). Exit 1 = one or more ERRORs.

## What it checks

Structural (ERROR, fails the lint):

- **Filename.** Must be exactly `feature-status.md` or `state-machines.md` (plural).
  Flags singular `state-machine.md` and domain-prefixed variants.
- **Last-Updated date stamp** in the first 20 lines (`Last Updated` / `Last Verified`
  / `Last Reviewed` / `verified against` + an ISO date).
- **Status Legend** in feature-status (explicit header, or a table defining the
  five tokens).
- **TOC** in any state-machines file over 300 lines (anchor links in first 60 lines).
- **Duplicate entity** in state-machines (same normalized H2 name twice). Catches
  the date-prepend-instead-of-edit failure mode.
- **Cell walls** over 800 characters.

Quality (WARN, reports only):

- Status tokens outside the enum (`prod | beta | dev | stub | deprecated`).
- Verbose cells (280-800 chars).
- State-machine entities missing States, Transitions, or Source grounding.
- Many dated H2/H3 headers in feature-status (changelog smell).

## Adding it to a workflow

Wire `execute.sh` as a PostToolUse hook scoped to the two filenames so a
non-conforming doc fails at edit time. See the project `.claude/settings.json`
hook section. Run `--check-all` in the commit skill or CI to audit the portfolio.

## When NOT to use

This lints doc structure, not doc truth. It will not tell you a feature marked
`prod` is actually broken, or that a state machine omits a real transition. For
staleness against code, pair with `cfn-detect-stale-docs`.
