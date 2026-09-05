# PLAN: cfn-megaplan-fast (program-mode, capped, static-bar planning)

**Date:** 2026-08-19  **Status:** done — built + verified (AC1-6 bless#, AC7 deferred to first real-program run)  **Owner:** masha
**Why:** one 7-part megaplan program consumed ~10M output tokens / 1.57B cache-read (42% of weekly budget) and is still in flight. Evidence: `planning/cfn_megaplan_fast/cost/report.md` (session `3c5e9658`, 108 spawns + 48 nested).

## 0. Goal

Same hand-off contract to `/cfn-loop-task` (`PLAN_<slug>.md` + `VERIFY_<slug>.md` + `.sha256` + SPEC build flags) at ≤ 15% of current token cost for multi-part programs, ≤ 35% for single features. Target for the same 7-part program: ≤ 1.5M output tokens (measured 10.06M).

## 1. Cost findings (what the plan attacks)

| # | Driver | Measured | Lever |
|---|---|---|---|
| 1 | Artifact bloat re-read by every downstream phase | 10MB planning md (~2.5M tok); SPEC 110-136KB, PSEUDO 94-219KB, DATA ≤328KB, UX ≤303KB, PLAN ≤356KB, VERIFY ≤545KB; 1.34B cache-read in subagents | hard byte caps + section extracts |
| 2 | Repair / re-gate / back-prop spawns | 34/108 spawns, 2.52M out (29%); top-10 spawns dominated by Bar B repair, plan-review+Bar B, structural PLAN repair | 1 round, static bars only, inline patch, no repair agents |
| 3 | Opus for 90/108 spawns | 7.28M of 8.59M subagent output | opus only for spec + arch |
| 4 | Full pipeline × 7 parts for one shared system | spec 9 spawns, arch 9, ux 11, pseudo 8, data 7, decide 7 | program mode: shared phases once, per-part only test_plan + write_plan + Bar A |
| 5 | Nested subagents | 48 grandchildren + 3 orphan forks | phase prompt forbids spawning |
| 6 | Pseudo as its own phase | 0.88M out (2nd largest), read only by arch, never at execution | fold into arch (lite precedent) |

`/goal` (native): session-scoped prompt Stop hook, Haiku judges transcript, no tools/files/budget. Role here = unattended driver for (a) the fast orchestrator and (b) the per-part loop-task hand-off. It saves human turns, not tokens; it is not a planner.

## 2. Pipeline shape

```
PROGRAM LEVEL (once)
 L1 spec        opus    SPEC_<prog>.md  ≤24KB. Folds in: decide (BLOCKING forks only, one AskUserQuestion),
                        security floor checklist (§floor), Build Flags §8, NEW §9 Part Ownership table
                        (FR/EC/entity/screen → part-id, part deps). Research: inline web/codebase lookups
                        only if flag unknowns=yes; no separate agent.
 L2 data        sonnet  DATA_<prog>.md  ≤32KB, if db=yes. floor forced (RLS/auth/no-unscoped-delete).
 L3 arch ∥ ux   arch=opus (pseudo folded: §module+branch table, no PSEUDO file) ARCH ≤32KB
                ux=sonnet (design folded: tokens/layout as one §) UX ≤32KB + wireframe
                └─ WIREFRAME GATE (frontend only): 1 Approve/Revise, then advance
 L4 plan_review sonnet, once, over program artifacts only (assumptions + blast radius), REVIEW ≤16KB

PER PART (parallel across independent parts; respects §9 part deps)
 P1 test_plan   sonnet  TEST_<part>.md ≤24KB; input = extract-sections <artifact> <part-id> (not whole files)
 P2 write_plan  sonnet  PLAN_<part>.md ≤40KB + VERIFY_<part>.md ≤40KB; Bar A static (check-verifiable-static.sh,
                        check-produce-consume.sh, check-size.sh) 1 round; bless-verify.sh
 P3 Bar B       static only (check-haiku-static.sh + weasel scan), 1 round, inline fix. No probe, no repair spawn.
 synthesis      MEGAPLANFAST_<prog>.md: per-part table (PLAN, VERIFY, sha, bars, deps) + build order

Single-feature mode (no parts): same levels, one "part" = the feature. Replaces lite for this use.
```

Loop policy: a bar finding ≤ 8 lines → orchestrator patches inline (main chat, no spawn). > 8 → ONE sonnet repair spawn receiving only the findings + the one artifact. Never a second round; residual surfaces as one AskUserQuestion (accept / descope / run full megaplan).

Size policy: caps enforced by `check-size.sh` at every level join. Over cap → one sonnet "compress" pass on that artifact (prompt: remove prose, keep ids/tables/contracts). Still over → hard stop, surface.

No nesting: every phase prompt ends with `Do not spawn subagents. Do not use the Agent tool.`

## 3. What survives / folds / drops

| Guarantee | Fast | Note |
|---|---|---|
| Wireframe gate | keep | user-required |
| Bar A verifiable-done + bless + sha | keep (static, 1 round) | loop-task done gate |
| Bar B haiku-executable | static lint only | executors are sonnet; `blocked_on` channel covers residue |
| Security floor | keep as spec §floor checklist + floor grep in check-verifiable-static | near-free |
| Decide BLOCKING forks | keep, inside spec, one batch | PARKED machinery dropped |
| Pseudo | fold into arch | |
| Design | fold into ux | |
| Research | inline in spec when unknowns=yes | |
| Ops | drop | fast is mvp/beta-lite; enterprise → full megaplan |
| plan_review | once, program level, sonnet | |
| Tier profiles | none; single profile `fast.json` | |
| Reverse mode, multi-plan seams, back-prop queue | drop | program mode replaces seams |

## 4. `/goal` integration

- Orchestrator run: `/cfn-megaplan-fast "<program>" --parts=<n|auto>` then optionally
  `/goal "planning/<prog>/MEGAPLANFAST_<prog>.md exists and every part row shows bars=green, or stop after 40 turns"`.
- Hand-off per part, documented in synthesis: `/cfn-loop-task "<part task>" --mode=mvp` wrapped by
  `/goal "verify-run.sh reports all-green for planning/<part>/VERIFY_<part>.md, or stop after 30 turns"`.
- Constraint: `/goal` evaluator reads transcript only, so orchestrator MUST echo bar results and paths to stdout each level.

## 5. Assumptions (testable)

1. Parts of one program share DB/arch/actors; one SPEC with §9 ownership is not vaguer than 7 specs. Test: run fast on the finished curve2026 artifacts (dry, no spawns) and diff FR coverage per part vs existing B0/B1 SPECs.
2. `extract-sections.sh` can cut a program artifact by part-id deterministically → requires phases to tag sections/rows with `[part: <id>]` or a §9 table. Test: fixture artifact, expected extract.
3. Static Bar B + sonnet lanes catch ambiguity no worse than probe (measured by `blocked_on` count in the first 2 fast-planned loop-task runs ≤ 2 per part).
4. Caps do not break check-verifiable-static: VERIFY JSON block at ≤40KB holds ≥ 40 ACs. Test: fixture.
5. Existing bar scripts are reusable unchanged from `cfn-megaplan/bars/` by relative path (lite precedent).
6. `/goal` requires Claude Code ≥ 2.1.234 and hooks enabled in the workspace. Check at Step 0, warn + fall back to manual turns.

## 6. Files

New:
- `.claude/skills/cfn-megaplan-fast/SKILL.md` (≤ 300 lines; protocol, prompts, caps table, loop policy, /goal lines)
- `.claude/skills/cfn-megaplan-fast/profiles/fast.json` (agents, models, caps, folds)
- `.claude/skills/cfn-megaplan/bars/check-size.sh` + `bars/tests/test-check-size.sh` + fixtures (shared, lite/megaplan may adopt)
- `.claude/skills/cfn-megaplan/lib/extract-sections.sh` + `lib/tests/test-extract-sections.sh` + fixtures
- `planning/cfn_megaplan_fast/VERIFY_cfn_megaplan_fast.md` (this plan's own done manifest)

Edit:
- `.claude/skills/cfn-spec/SKILL.md`: additive §9 Part Ownership (program mode only), §floor checklist pointer
- `.claude/skills/cfn-arch/SKILL.md`: document pseudo-folded output section (lite already does this; confirm shared wording)
- `.claude/global/CLAUDE.md` Planning Pipeline: add `/cfn-megaplan-fast` routing line (multi-part programs, default for mvp/beta; full megaplan for enterprise/compliance)
- `.claude/skills/CLAUDE.md`, `readme/feature-status.md`, `readme/state-machines.md` (no new entity; note in feature-status only)

Untouched: `cfn-megaplan`, `cfn-megaplan-lite`, `cfn-loop-task`, existing bar scripts' behavior.

## 7. Phases (TDD, sonnet implementers)

| # | Lane | Produces | Consumes | Test first |
|---|---|---|---|---|
| 1 | check-size.sh | `.claude/skills/cfn-megaplan/bars/check-size.sh` | `.claude/skills/cfn-megaplan-fast/profiles/fast.json` | `test-check-size.sh`: over/under/exact cap, missing file, per-artifact cap lookup |
| 2 | extract-sections.sh | `.claude/skills/cfn-megaplan/lib/extract-sections.sh` | `.claude/skills/cfn-spec/SKILL.md` | fixture program SPEC/ARCH with 3 parts → exact per-part extract; untagged shared § always included |
| 3 | fast.json + SKILL.md | `.claude/skills/cfn-megaplan-fast/profiles/fast.json`, `.claude/skills/cfn-megaplan-fast/SKILL.md` | `.claude/skills/cfn-megaplan/bars/check-size.sh`, `.claude/skills/cfn-megaplan/lib/extract-sections.sh` | `test-profiles.sh` extended: fast.json schema (caps present, no `probe`, models ∈ {opus,sonnet}) |
| 4 | cfn-spec §9 | `.claude/skills/cfn-spec/SKILL.md` | - | grep gate: §9 template present, lite/megaplan unaffected |
| 5 | routing + docs | `.claude/global/CLAUDE.md`, `.claude/skills/CLAUDE.md`, `readme/feature-status.md` | `.claude/skills/cfn-megaplan-fast/SKILL.md` | `/cfn-doc-lint` green |
| 6 | dry-run validation | `planning/cfn_megaplan_fast/dryrun.sh` | `.claude/skills/cfn-megaplan/bars/check-size.sh`, `.claude/skills/cfn-megaplan/lib/extract-sections.sh` | extract per part → check-size + bars pass on existing B0/B1 PLAN/VERIFY after compress; token estimate recorded |

Lanes 1,2 parallel; 3 after 1,2; 4,5 parallel after 3; 6 last. Coordinator runs tests (`OUT=/tmp/test-${PWD##*/}-$(date +%s).txt`).

## 8. Done (VERIFY sketch, formalised in VERIFY_cfn_megaplan_fast.md)

- AC1 `bash bars/tests/test-check-size.sh` exit 0, ≥ 6 cases.
- AC2 `bash lib/tests/test-extract-sections.sh` exit 0, ≥ 5 cases.
- AC3 `bash bars/tests/test-profiles.sh` exit 0 with fast.json included.
- AC4 SKILL.md ≤ 300 lines, contains caps table, loop policy, "Do not spawn subagents", /goal lines (grep).
- AC5 `/cfn-doc-lint` exit 0.
- AC6 Dry-run: compressed B0 PLAN+VERIFY pass check-verifiable-static + check-size; DRYRUN.md records projected tokens for 7 parts ≤ 1.5M (arithmetic from measured per-phase means × model factor).
- AC7 First real fast run (next epic) logged: output tokens ≤ 35% of a lite run of similar size, or ≤ 15% per part in program mode. (Deferred AC, measured at first use.)

## 9. Out of scope

Changing cfn-megaplan/lite behavior; reworking cfn-loop-task; the in-flight curve2026 run (finishes as-is per user).
