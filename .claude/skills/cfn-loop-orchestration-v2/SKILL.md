---
name: cfn-loop-orchestration-v2
description: "CFN Loop orchestration: gate checks, validation, consensus, Product Owner decisions. Use when orchestrating multi-agent workflows, managing iteration cycles, or coordinating Loop 2/Loop 3 dependencies."
version: 1.1.0
tags: [mega-skill, cfn-loop, orchestration, validation]
status: production
---

# Loop Orchestration Skill (Mega-Skill)

**Version:** 1.1.0
**Purpose:** CFN Loop orchestration: gate check, validation, consensus, decision
**Status:** Production
**Consolidates:** cfn-loop-orchestration, cfn-loop-output-processing, cfn-loop-validation, cfn-loop-decision

> Coordination patterns (chain/broadcast/mesh/consensus) live in the standalone `cfn-coordination` skill. This mega-skill calls those patterns; it does not own them.

---

## Overview

- **Orchestrator** - Main loop execution and gate checks
- **Output** - Agent output parsing and consensus calculation
- **Validation** - Multi-layer validation framework
- **Decision** - Product Owner PROCEED/ITERATE/ABORT logic

---

## Directory Structure

```
cfn-loop-orchestration-v2/
├── SKILL.md
├── cli/
│   ├── orchestrate.sh
│   ├── cfn-orchestrator.cjs
│   └── resolve-provider-model.cjs
└── lib/
    ├── orchestrator/   # Loop execution + gate checks
    ├── output/         # Agent output parsing, consensus
    ├── validation/     # Multi-layer validation
    └── decision/       # Product Owner decision logic
```

---

## Migration Paths

| Old Skill | New Location |
|----------|----------|
| cfn-loop-orchestration/ | cfn-loop-orchestration-v2/lib/orchestrator/ |
| cfn-loop-output-processing/ | cfn-loop-orchestration-v2/lib/output/ |
| cfn-loop-validation/ | cfn-loop-orchestration-v2/lib/validation/ |
| cfn-loop-decision/ | cfn-loop-orchestration-v2/lib/decision/ |

For coordination patterns (chain/broadcast/mesh/consensus), see `.claude/skills/cfn-coordination/SKILL.md`.

---

## Entry Point

```bash
$HOME/.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh
```

Use the `$HOME/.claude/...` form — it resolves via the global skills symlink in every project. The project-relative `.claude/...` form only works in claude-flow-novice.

---

## Version History

### 1.1.0 (2026-05-13)
- Corrected aspirational claim: cfn-coordination is a standalone skill, not consolidated here
- Added decision/ to structure (was missing)
- Updated entry point path

### 1.0.0 (2025-12-02)
- Consolidated 4 loop orchestration skills into mega-skill

## Running a VERIFY manifest: what grades wrong and why

`verify-run.sh` and its siblings (`resolve`, `summary`, `backfill-evidence`, `deferrals`,
`run-ledger`) live in this skill's `cli/`, not under `cfn-megaplan/bars/`, which carries only
`bless-verify.sh`. `deferrals.sh gate` takes `--slug` only; `summary` takes no `--threshold`
(the full threshold is its only mode).

Every trap below produces a NON-red outcome. None of them says "your feature is broken", and
all of them get misread as one.

### `zero_tests_ran` is a manifest defect, not a missing feature

A `check` cell of the form `vitest run <file> -t "<title>"` grades
`zero_tests_ran (name filter matched 0 of N)` whenever the title matches nothing. Three
distinct causes, one symptom, all three seen in a single run:

1. **Wrong file.** The two tests the AC describes live in the `.unit.test.ts` sibling, not the
   `.int.test.ts` the check names. Unit versus integration is the most common split.
2. **Unescaped parens.** `-t` is a raw RegExp, not a literal. `-t "boundary max(10,10) not
   exceeded"` matches nothing even against that exact substring, because the group backtracks
   against a sibling describe title. Escaping fixes it exactly:
   `-t "boundary max\(10,10\) not exceeded"`.
3. **Right file, wrong literal.** A snake_case string that appears nowhere in any title, or a
   binding that lives in the `describe` title rather than the `it`.

When you see it, run `grep -n "it(\|describe(" <the actual test file>` and compare titles by
eye before concluding anything is unbuilt. The fix is an edit to the blessed manifest plus a
re-bless (`bless-verify.sh --note "..."`), never a hand `resolve --pass true`: the check
genuinely never ran.

Related: **`-t` is a substring match against the FULL name, including the describe title.** A
filter on a word that also appears in the describe name runs every case in the file. Filter on
a unique tail phrase.

### A mid-line annotation comments out the rest of the check

Generated manifests place `  # static grep/AST scan performed by <path>.ts` in the MIDDLE of a
check command, and bash comments out everything after it: the `&&`-chained commands, the
`2>&1 | tee`, all of it. Measured on one manifest: 21 such annotations across 15 of 149
checks; the worst ran 1 of its 4 guards and 0 of its 8 test suites, and exited 0 on that one
guard. A fabricated green on three separate SQL guards.

The annotation cannot just be deleted. `bars/check-verifiable-static.sh:457` requires a check
of kind `static`, `lint` or `wiring-guard` to match `(grep|rg |ast|eslint|shellcheck|node -e|
...)`, and a guard invocation contains none of those tokens, so the annotation is what
satisfies the taxonomy. Stripping it makes `bless-verify.sh` refuse with "check form does not
match taxonomy". **Move the annotation to the END of the check string.** It still satisfies
the taxonomy grep and swallows nothing; re-blessing grades `predicate_changed: false`,
`regate: bar_a=none`, so no scoped re-gate is owed.

Audit every new manifest for ` # ` inside a `check` cell before trusting a green.

**Second bite: an end-of-line annotation is safe in the manifest but poisons any wrapper you
put the check inside.** Driving a manifest by hand with `( <check> ) >/tmp/out 2>&1; echo
"$i EXIT=$?"` puts the redirect, the `)` and the `echo` after the trailing `#`. Bash then sees
an unterminated subshell, consumes every later line as its body, and dies at EOF with
`syntax error: unexpected end of file`. Seven checks had already run and reported, so it reads
as "the batch finished, 7 of 23 rows" rather than "the script never parsed". Write each check
to its own file and `bash <file>` it. Never interpolate a check into a compound one-liner.

### Compound checks are not executed at all

`verify-run.sh run` only executes simple commands. Anything with `&&`, `;`, `for` or process
substitution grades `needs_agent`. Resolve each one with:

```bash
verify-run.sh resolve --results R --ac ID --pass true|false --evidence-file F
```

The evidence file needs at least 3 non-empty lines or it refuses. **`run` regenerates the
results file and wipes prior resolves**, so resolve only after the last full run, then
`summary --results R` for the verdict. `backfill-evidence` copies results excerpts into the
manifest before the exit-stage bless but skips resolve-stamped rows: fill those evidence
fields by hand.

### A db-backed manifest is stateful, so row order is a precondition

Rows encode an order. A round-trip row must start from the migration's bare state or its
before/after diff fails; a baseline row refuses if the migration is already applied; the row
that applies the up leg leaves it applied, and every later row asserts the applied state.
Before any full gate run, restore the expected starting state by hand (apply the down leg), or
later rows grade red on leftover state rather than on defects.

### Two environment traps that look like runner bugs

- **Export the gate's env vars in the SAME Bash call that runs `verify-run.sh`.** Each Bash
  call is a fresh shell, so a blocked row reporting `precondition_unmet` is usually this and
  not a runner defect.
- **rtk compresses vitest output to `PASS (0) FAIL (0)`.** A 0 there usually means zero tests
  were COLLECTED (a glob that swept the wrong tree, or a path containing a bracketed dynamic
  segment), not a pass. Read the raw rtk tee log under `~/.local/share/rtk/tee/`, or rerun with
  output to a file.

### `run-ledger.sh record --report` exits 1 on a prose-lane PLAN

Non-gating, but it looks like a failed ledger write. `record` exits 1 silently when given
`--report` files against a PLAN written as prose lanes rather than step tables. The row
records fine without `--report`. Store lane reports in the plan directory instead.
