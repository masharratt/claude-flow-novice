# Implementation Plan: cfn-megaplan-lite skill

Task string (loop-task slug match): `cfn-megaplan-lite skill`
Source of truth for design: `~/.claude/plans/merry-finding-frog.md` (approved, plan-reviewed). All deltas B1/G1/G2/G3/G4/N1/N2/N3 are merged there.

## Task Analysis
- **Complexity**: Standard (prose-skill authoring + 4 additive doc edits; no code, no DB, no API, no frontend, no build, no new deps)
- **Estimated Files**: 6 (2 NEW, 4 MODIFY)
- **Estimated LOC**: ~340 (SKILL.md ~280, test-smoke.sh ~60, plus ~20 lines of additive doc edits)
- **Mode**: mvp

## Agent Configuration

### Loop 3 (Implementation): 2 general-purpose sonnet agents in 2 lanes
- **Lane A agent** (coupled NEW files, TDD order): authors `test-smoke.sh` FIRST, then `SKILL.md` until smoke is green. One agent owns both because the test validates the SKILL.md byte-for-byte.
- **Lane B agent** (4 independent MODIFY edits): `~/.claude/CLAUDE.md`, `.claude/skills/cfn-megaplan/SKILL.md`, `readme/feature-status.md`, `readme/state-machines.md`. All additive, no cross-dependencies.

### Loop 2 (Validation)
- reviewer (prose + DRY review: confirms lite cites megaplan sections by path, not copy)
- tester (runs the smoke test + every grep verify command)

### Product Owner
- product-owner (PROCEED/ITERATE/ABORT)

Note: this is prose-skill work. No build/compile/db. Verify commands are bash greps and the committed smoke test, not test runners.

## Assembly Rule

This plan is a direct assembly document. The 6 rows in the Phase 2 table replace freehand phases. Two lanes run in parallel: Lane A (NEW skill + its test) and Lane B (4 additive doc edits). The only intra-lane ordering constraint is TDD within Lane A: `test-smoke.sh` is written before `SKILL.md`. Lane B's 4 edits are mutually independent.

## Phase 2: Green (Implementation Steps)

Every row fills every column. Produces/Consumes use `<path>` or `<path>:<symbol>`, or `-`.

| # | File (full path) | Change (exact) | Produces | Consumes | Failing test | Verify command | Done predicate |
|---|---|---|---|---|---|---|---|
| 1 | `/home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan-lite/SKILL.md` | NEW, ~280 lines. Frontmatter: `name: cfn-megaplan-lite`, `version: 1.0.0`, `status: production`, description naming it the balanced-cut alternative to megaplan for medium features. Sections (model structure on `cfn-spa-plan/SKILL.md`): (a) Purpose/When-to-Use with the hard exclusion list G3 (NOT for compliance/PII-heavy, multi-tenant, external-API integration, schema migrations, scale/capacity-sensitive, unknowns-heavy; those need full `/cfn-megaplan --tier=beta\|enterprise`) and the upgrade-is-fresh-run note G2 (a lite-planned feature that later needs ops/compliance is re-run as full megaplan from scratch; megaplan does not resume from lite artifacts); (b) Invocation `/cfn-megaplan-lite "<task>"` (no `--tier`); (c) the 7-level lite DAG (L1 spec opus HARD BARRIER; L2 decide sonnet; L3 data sonnet IF db=yes; L4 arch opus ALSO emits `PSEUDO_<slug>.md` (pseudo folded) parallel ux sonnet IF frontend=yes + 1-cycle WIREFRAME GATE; L5 design sonnet parallel test_plan sonnet; L6 write_plan + Bar A 1-round; L7 plan_review + Bar B-static 1-round; Step 8 batched handoff); (d) Reuse map listing `cfn-megaplan/bars/{check-verifiable-static.sh,bless-verify.sh,check-haiku-static.sh,weasel-phrases.txt}` + phase skills `cfn-spec,cfn-decide,cfn-data,cfn-arch,cfn-ux,cfn-design,cfn-test-plan` by relative path; (e) Interface contract N1: each reused bar script + expected exit codes 0 clean / 1 error / 2 parse; (f) Protocol Steps 0-8 (Step 0 = trimmed scope check: `/codebase-search`, 8+ file negotiate, tech-debt ledger read, decision-log prior-fork query; drop knowledge-base + retro); (g) Open-item triage + patch-mode loop-back: CITE `cfn-megaplan/SKILL.md` §Open-item triage, §Loop-back protocol: patch mode, §Step 7 synthesis template, §Failure modes, §Anti-patterns BY PATH and state only the lite delta (1-round cap, no-probe) per DRY fix B1, do NOT restate them; (h) Model policy (spec+arch opus, all others sonnet; ux escalates to opus after 2 Bar B control-type failures); (i) Bar B-lite definition: static + structural + coverage only, with the literal line `DO NOT spawn the live haiku probe` and rationale (opus-coordinator execution model replaces the probe); (j) Round caps with mechanical/semantic split G1: 1 round each bar, MECHANICAL findings (taxonomy mismatch, missing AC field, non-decidable predicate, weasel phrase, unmapped branch) auto-patch via patch-mode within budget, only SEMANTIC failures (unmapped FR/EC, missing assembled-path AC, floor gap) surface via AskUserQuestion; (k) No-tiers/no-profile rationale N2: single mode, directives hardcoded, with the reason a maintainer must not re-add tiers (re-introduces the 6-8h cost lite exists to avoid); (l) Failure modes + anti-patterns (lite-specific deltas only, cite megaplan list by path); (m) Synthesis template `MEGAPLANLITE_<slug>.md` (8 sections mirroring megaplan, cite megaplan template by path, state lite provenance delta); (n) Related points back to `cfn-megaplan`. | `.claude/skills/cfn-megaplan-lite/SKILL.md` | - | `tests/test-smoke.sh::frontmatter_and_paths` (the step-2 smoke test) | `bash /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` | smoke exits 0 |
| 2 | `/home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` | NEW. Bash script, `set -euo pipefail`. Three assertion groups: (a) frontmatter: grep `^name:`, `^version:`, `^status:` in `../SKILL.md` all present; (b) every referenced path resolves via `[ -f "$p" ]`: `.claude/skills/cfn-megaplan/bars/check-verifiable-static.sh`, `.../bless-verify.sh`, `.../check-haiku-static.sh`, `.../weasel-phrases.txt`, and phase skills `cfn-spec,cfn-decide,cfn-data,cfn-arch,cfn-ux,cfn-design,cfn-test-plan` SKILL.md files; (c) no-probe invariant: `grep -q 'DO NOT spawn the live haiku probe' ../SKILL.md`. Print `OK <name>` per check, `FAIL <name>` on miss, exit 0 only on all-pass. Written FIRST per TDD (Red anchor for step 1). | `.claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` | `.claude/skills/cfn-megaplan-lite/SKILL.md` | itself (it IS the test) | `bash /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` | exit 0 |
| 3 | `/home/masha/.claude/CLAUDE.md` | MODIFY, additive only (N3, global blast radius). Three edits, no existing rule weakened: (a) Planning Pipeline diagram (lines 131-139): insert a medium-feature branch `/cfn-megaplan-lite` off `/cfn-megaplan` (balanced cut: both bars 1-round, no live probe, pseudo folded into arch, sonnet non-core; for 3-7 file medium features); (b) Sub-pipelines bullet list (lines 141-144): add one bullet naming `/cfn-megaplan-lite`; (c) Megaplan-required rule (line 123): append to the "Skip only for" sentence a clause routing medium features to `/cfn-megaplan-lite` instead of skipping planning. Keep the existing skip-only-for-trivial clause verbatim. | `-` | `-` | `grep -c 'cfn-megaplan-lite' /home/masha/.claude/CLAUDE.md` returns 0 before edit | `grep -c 'cfn-megaplan-lite' /home/masha/.claude/CLAUDE.md` | grep count >= 3 (3 additive sites), and a re-read confirms the skip-only-for-trivial clause is intact |
| 4 | `/home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan/SKILL.md` | MODIFY, additive cross-ref only (N3). Two edits, NO protocol section text changed: (a) "When to Use" (line 17): add one line pointing medium features (3-7 files, single shared-state surface) to `/cfn-megaplan-lite`; (b) "Related" (lines 469-476): add a `cfn-megaplan-lite` entry (balanced-cut alternative for medium features). | `-` | `-` | `grep -c 'cfn-megaplan-lite' /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan/SKILL.md` returns 0 before edit | `grep -c 'cfn-megaplan-lite' /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan/SKILL.md` | grep count >= 2, and a re-read confirms no protocol section (Steps, Pipeline shape, Open-item triage, Loop-back, Failure modes, Anti-patterns) altered |
| 5 | `/home/masha/projects/claude-flow-novice/readme/feature-status.md` | MODIFY. Under "Skills System" section (category 2, line 18+), add one table row: `cfn-megaplan-lite \| Beta \| n/a \| .claude/skills/cfn-megaplan-lite/ \| Balanced-cut planning mode for medium features`. Bump "Last Updated" date (line 3) from `2026-07-25` to `2026-07-29`. | `-` | `-` | `grep -c 'cfn-megaplan-lite' /home/masha/projects/claude-flow-novice/readme/feature-status.md` returns 0 before edit | `grep -c 'cfn-megaplan-lite' /home/masha/projects/claude-flow-novice/readme/feature-status.md` | grep count >= 1, and `grep -q 'Last Updated:\*\2026-07-29' readme/feature-status.md` matches |
| 6 | `/home/masha/projects/claude-flow-novice/readme/state-machines.md` | MODIFY. Add a new `## CFN MegaPlan-Lite: Planning DAG` entity section. Mirror the existing "CFN Loop Task: Phase 5 Exit Gate" table format (columns `From \| To \| Trigger`). 7-level state table with transition rows: L1 spec -> L2 decide (trigger: spec barrier passes, §1a actors + §1b intent + Build Flags gates cleared), L2 -> L3 (decide resolves BLOCKING forks only), L3 -> L4 (data emits schema + field-bindings, floor RLS/auth/secrets authored), L4 -> L5 (arch emits ARCH + PSEUDO folded; ux wireframe 1-cycle gate passed if frontend=yes), L5 -> L6 (design + test_plan return), L6 -> L7 (write_plan persists PLAN_ + Bar A static pass clean + bless-verify hash pinned, 1-round), L7 -> Step 8 (plan_review + Bar B-static clean, 1-round, no probe), Step 8 -> handoff (batched [PARKED] items resolved, MEGAPLANLITE_ synthesis written, PLAN_ + VERIFY_ + .VERIFY_.sha256 on disk). | `-` | `-` | `grep -c 'MegaPlan-Lite' /home/masha/projects/claude-flow-novice/readme/state-machines.md` returns 0 before edit | `grep -c 'MegaPlan-Lite' /home/masha/projects/claude-flow-novice/readme/state-machines.md` | grep count >= 1, and the section has >= 7 transition rows |

## TDD Sequence (per step, mechanical)

Step 2 is written FIRST and is the Red anchor for step 1. Coordinator runs all test/verify commands; agents write and read results.

| Step # | Failing test written FIRST (file::case) | Red command (must exit non-zero) | Green command (must exit 0 after step) | Runnable-at |
|---|---|---|---|---|
| 2 | `.claude/skills/cfn-megaplan-lite/tests/test-smoke.sh::all_assertions` | `bash .claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` (SKILL.md absent, exits non-zero) | `bash .claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` (after step 1 lands, exits 0) | unit |
| 1 | `.claude/skills/cfn-megaplan-lite/tests/test-smoke.sh::frontmatter_and_paths` | `bash .claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` (before SKILL.md authored, non-zero) | `bash .claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` (after this step, exit 0) | unit |
| 3 | `~/.claude/CLAUDE.md::contains_lite_reference` | `! grep -q 'cfn-megaplan-lite' /home/masha/.claude/CLAUDE.md` (finds nothing before edit, exit 1) | `bash -c '[ "$(grep -c cfn-megaplan-lite /home/masha/.claude/CLAUDE.md)" -ge 3 ]'` (exit 0) | unit |
| 4 | `.claude/skills/cfn-megaplan/SKILL.md::contains_lite_cross_ref` | `! grep -q 'cfn-megaplan-lite' /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan/SKILL.md` (exit 1) | `bash -c '[ "$(grep -c cfn-megaplan-lite /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan/SKILL.md)" -ge 2 ]'` (exit 0) | unit |
| 5 | `readme/feature-status.md::contains_lite_row` | `! grep -q 'cfn-megaplan-lite' /home/masha/projects/claude-flow-novice/readme/feature-status.md` (exit 1) | `bash -c '[ "$(grep -c cfn-megaplan-lite /home/masha/projects/claude-flow-novice/readme/feature-status.md)" -ge 1 ]'` (exit 0) | unit |
| 6 | `readme/state-machines.md::contains_lite_state_machine` | `! grep -q 'MegaPlan-Lite' /home/masha/projects/claude-flow-novice/readme/state-machines.md` (exit 1) | `bash -c '[ "$(grep -c MegaPlan-Lite /home/masha/projects/claude-flow-novice/readme/state-machines.md)" -ge 1 ]'` (exit 0) | unit |

Execution rule per step: (1) write test/grep assertion, (2) coordinator runs Red command, confirm non-zero, (3) implement the one change in the step row, (4) coordinator runs Green command, confirm 0. For doc-edit steps (3-6) the "test" is the grep assertion. A step whose Red command passes before implementation is a defect: stop, fix the assertion or confirm the edit is genuinely additive.

## Success Criteria / Deliverables (Bar A format, every row executable)

| Deliverable | Check command | Pass condition |
|---|---|---|
| smoke test green | `bash /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` | exit 0 |
| bar scripts resolve from lite references | `bash /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan-lite/tests/test-smoke.sh` | smoke assertion group (b) passes (all `OK` lines, zero `FAIL`) |
| no-probe invariant documented | `grep -q 'DO NOT spawn the live haiku probe' /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan-lite/SKILL.md` | exit 0 |
| DRY: megaplan sections cited by path, not copied | `grep -E 'cfn-megaplan/SKILL.md .(Open-item triage\|Loop-back protocol\|Step 7 synthesis\|Failure modes\|Anti-patterns)' /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan-lite/SKILL.md` | >= 5 distinct section citations match |
| CLAUDE.md routing added (additive) | `grep -c 'cfn-megaplan-lite' /home/masha/.claude/CLAUDE.md` | count >= 3 |
| CLAUDE.md skip-only-for-trivial rule intact (N3) | `grep -q 'Skip only for single-line fixes' /home/masha/.claude/CLAUDE.md` | exit 0 (rule verbatim) |
| megaplan cross-ref added (additive, no protocol change) | `grep -c 'cfn-megaplan-lite' /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan/SKILL.md` | count >= 2 |
| megaplan SKILL.md diff is additive-only (regression) | re-read `.claude/skills/cfn-megaplan/SKILL.md` Steps/Pipeline/Open-item triage/Loop-back/Failure modes/Anti-patterns sections | no protocol section altered byte-for-byte outside the two cross-ref sites |
| feature-status row added | `grep -c 'cfn-megaplan-lite' /home/masha/projects/claude-flow-novice/readme/feature-status.md` | count >= 1 |
| feature-status date bumped | `grep -q 'Last Updated:.*2026-07-29' /home/masha/projects/claude-flow-novice/readme/feature-status.md` | exit 0 |
| state-machines section added | `grep -c 'MegaPlan-Lite' /home/masha/projects/claude-flow-novice/readme/state-machines.md` | count >= 1, section has >= 7 transition rows |

Prose criteria ("reviewed", "complete", "documented") are invalid; Bar A rejects them. Every row above is a command plus a numeric/exit pass condition.

## Iteration Strategy
- Max iterations: 5 (mvp)
- Confidence threshold: mvp `confidence_gate` from `.claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md`
- Adaptive agent spawning: YES (but capped at 2 Loop-3 lanes; this is prose work)
- Likely iterate vector: smoke test misses a path citation (Lane A), or a megaplan section anchor name drifts (Lane A grep (DRY) row fails). Both are single-file patches.

## Next Steps
1. Review this plan.
2. Execute CFN Loop (subscription-backed):
   ```bash
   /cfn-loop-task "cfn-megaplan-lite skill" --mode=mvp
   ```
3. Post-done optional (not in scope): run `/cfn-megaplan-lite "add a settings page with a user-preferences table"` end-to-end against a scratch target to exercise the 7-level DAG live (verification step 3 in `merry-finding-frog.md`).
