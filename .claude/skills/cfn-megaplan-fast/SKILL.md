---
name: cfn-megaplan-fast
description: "Token-lean planning orchestrator for multi-part programs and single features. Program mode runs spec/data/arch/ux ONCE, then only test_plan + write_plan + Bar A per part, reading section extracts not whole artifacts. Hard byte caps per artifact, static-only bars (1 round, inline patch), opus only for spec+arch, no nested subagents. Same hand-off contract to /cfn-loop-task as megaplan. Use for mvp/beta work; full /cfn-megaplan stays for enterprise/compliance/ops-heavy builds."
version: 1.1.0
tags: [planning, orchestrator, dag, program-mode, token-lean, fast]
status: beta
---

# CFN MegaPlan-Fast

**Purpose.** Reach the same `/cfn-loop-task` hand-off (`PLAN_<slug>.md` + `VERIFY_<slug>.md` + `.sha256` + SPEC build flags) at a fraction of megaplan's cost. Measured baseline it replaces: a 7-part megaplan program cost ~10M output tokens / 1.57B cache-read (2026-08-19, `planning/cfn_megaplan_fast/PLAN_cfn_megaplan_fast.md` §1). Four levers: program mode (shared phases once), hard artifact caps + section extracts, static bars with one inline-patch round, sonnet everywhere except spec + arch.

**Position.** `cfn-megaplan` = enterprise / compliance / ops / multi-tenant / migration-rehearsal. `cfn-megaplan-lite` = unchanged, medium single features. `cfn-megaplan-fast` = default for mvp/beta programs of 2..N parts AND for single features when you want the cheapest safe path. If unsure between fast and full: fast, then upgrade is a fresh full run (fast artifacts are a head start, never auto-consumed).

## Invocation

```
/cfn-megaplan-fast "<program or feature task>" [--parts=auto|<n>|"B0,B1,B2"] [--part-specs=auto|on|off] [--unattended]
```
- `--parts` absent or `auto`: spec decides (§9 Part Ownership). `1` or omitted on a small task = single-feature mode.
- `--part-specs` (default `auto`): failsafe for programs whose parts are distinct domains (curve2026: ci-monitoring, identity, bookings, kiosk). One 24KB program SPEC over 7 domains is ~3KB per part, too thin for a per-part test_plan/write_plan. `on` = one short sonnet `PARTSPEC_<prog>__<part>.md` per part (cap 12288) after L1, before L2. `auto` turns on when parts ≥ `part_specs.auto_min_parts` (4) OR any part's SPEC extract is < `part_specs.auto_min_extract_bytes` (3072). `off` = never. Thresholds in `profiles/fast.json` `.part_specs`.
- Optional unattended driver (saves human turns, not tokens):
  `/goal "planning/<prog>/MEGAPLANFAST_<prog>.md exists and every part row shows bars=green, or stop after 40 turns"`
  `/goal` is a prompt Stop hook; its evaluator reads ONLY the transcript. So every level below MUST echo bar results and artifact paths to stdout (the `log` lines).

## Layout

```
planning/<prog>/                      SPEC_ DATA_ ARCH_ UX_ REVIEW_ MEGAPLANFAST_<prog>.md   (program level)
planning/<prog>__<part>/              [PARTSPEC_] TEST_ PLAN_ VERIFY_ .VERIFY_*.sha256       (one dir per part; slug = <prog>__<part>)
```
Single-feature mode: one dir `planning/<slug>/` holds everything; the feature is its only part. `/cfn-loop-task "<part task>"` resolves `planning/<prog>__<part>/PLAN_<prog>__<part>.md` through `plan-paths.sh` unchanged.

## Pipeline (program once, then per part)

```
L1 spec         opus    SPEC_<prog>.md        folds: decide (BLOCKING forks only, one AskUserQuestion),
                                               security floor checklist, Build Flags §8, §9 Part Ownership
                                               (FR/EC/entity/screen -> [part: id], part deps). Research: inline
                                               lookups only when unknowns=yes; no research agent.
L1b part_spec   sonnet  PARTSPEC_<slug>.md    if part-specs on (auto rule above). One per part, all in ONE message.
                                               Input: SPEC extract for the part + SPEC §1a/§8/§floor/§9 row.
                                               FR/EC/AC for that part only, ids FR-<part>-n; interfaces to other
                                               parts by part id. No §8/§9/floor (inherited from program SPEC).
L2 data         sonnet  DATA_<prog>.md        if db=yes. Floor forced (RLS, auth, no unscoped delete).
                                               Input: SPEC + every PARTSPEC (when present); same for L3/L4.
L3 arch ∥ ux    arch=opus  ARCH_<prog>.md     pseudo folded in (§module + branch table; no PSEUDO_ file)
                ux=sonnet  UX_<prog>.md       if frontend=yes; design folded in (§tokens/layout); emits wireframe
                └─ WIREFRAME GATE (frontend only): one Approve/Revise AskUserQuestion, then advance
L4 plan_review  sonnet  REVIEW_<prog>.md      once, program artifacts only: assumptions + blast radius
---- per part (parallel across parts whose §9 deps are satisfied) ----
P1 test_plan    sonnet  TEST_<slug>.md        input = extract-sections.sh <artifact> <part> for SPEC/DATA/ARCH/UX
                                               + the part's PARTSPEC in full when present
P2 write_plan   sonnet  PLAN_<slug>.md + VERIFY_<slug>.md   then Bar A static + bless
P3 bar_b        static  check-haiku-static.sh + weasel scan, 1 round, inline fix
synthesis       main    MEGAPLANFAST_<prog>.md  per-part table + build order + hand-off lines
```
Node deps: spec → [part_spec ×N] → data → (arch ∥ ux) → plan_review → per part: test_plan → write_plan → bar_b. `data`/`ux` skipped when their flag is `no`: substitute the literal `Input DATA: ABSENT (db=no)` in downstream prompts.

## Caps (bytes; canonical in `profiles/fast.json` `.caps`, read by `check-size.sh`)

| SPEC | PARTSPEC | DATA | ARCH | UX | REVIEW | TEST | PLAN | VERIFY | MEGAPLANFAST |
|---|---|---|---|---|---|---|---|---|---|
| 24576 | 12288 | 32768 | 32768 | 32768 | 16384 | 24576 | 40960 | 40960 | 16384 |

Rationale: the baseline's SPECs were 110-136KB and VERIFYs up to 545KB, each re-read by every downstream phase. Caps go in the phase prompt AND are enforced at the level join: `bars/check-size.sh <artifact>`. OVER → one sonnet compress pass (prompt: "remove prose, keep ids/tables/contracts/checks; target ≤ cap"). Still OVER → stop, one AskUserQuestion (raise cap for this run / descope / run full megaplan). Never a second compress spawn.

## Protocol

**Step 0: scope + preflight.** Reject enterprise signals (compliance, PII-heavy, multi-tenant, external API integration, schema migration rehearsal, capacity) → route to `/cfn-megaplan`. Build slug from task (same rule as megaplan Step 1). `mkdir -p planning/<prog>`. Check `/goal` availability only if `--unattended` requested (needs Claude Code ≥ 2.1.234 + hooks enabled); warn and continue manually if absent. Read open tech debt in scope (`cfn-tech-debt`) as megaplan does.

**Step 1: spec (L1).** Spawn `specification-agent`, model opus, prompt template below with phase skill `.claude/skills/cfn-spec/SKILL.md`. Extra instructions: write §9 Part Ownership when `--parts` ≠ 1 (table: id, name, one-line scope, deps, plus `[part: id]` tags on FR/EC/entity/screen rows); fold decide: list BLOCKING forks only (schema / contract / FR-set / floor), return them as `[OPEN]`; park the rest conservatively with `[PARKED: <default>]` as in megaplan; include the floor checklist as §floor with each item `present | n/a: <why>`. After return: `check-size.sh SPEC_...` (compress rule), then ONE `AskUserQuestion` batch for `[OPEN]` forks; record via `.claude/skills/cfn-decisions/record.sh`. Parse §8 Build Flags (`db`, `frontend`, `unknowns`) and §9 part list. When `--parts` names ≥ 4 parts up front (part-specs will be on), tell the spec agent: "program SPEC carries headline FRs per part (one line each, tagged); detail goes to part specs". Log: `L1 spec ok: <path> <bytes>/<cap> parts=<list>`.

**Step 1b: part specs (L1b, if part-specs on).** Resolve the mode: `--part-specs=on|off` wins; `auto` → on when `parts ≥ 4` or `extract-sections.sh SPEC_<prog>.md <part> | wc -c` < 3072 for any part. Log `part-specs: <on|off> (reason: flag|parts=N|thin=<part>:<bytes>)`. When on: ONE message, one `specification-agent` sonnet spawn per part, `cfn-spec` skill in **part SPEC mode** (cfn-spec Step 9). Inputs (paths): the part's SPEC extract written to `planning/<prog>__<part>/.in/SPEC.md`, plus the program SPEC §1a Actors, §8 flags, §floor, and this part's §9 row. Output `planning/<prog>__<part>/PARTSPEC_<prog>__<part>.md`, cap 12288: FR/EC/AC for this part only (`FR-<part>-n`), entities/screens it owns, interfaces it consumes/produces from other parts by part id, `[OPEN]` BLOCKING forks only. No §8, §9, actors, or floor sections (inherited). Size-check each (compress rule). One `AskUserQuestion` batch for all parts' `[OPEN]` forks. Log per part: `L1b partspec <id>: <path> <bytes>/<cap>`. Every later phase that reads SPEC also reads the PARTSPECs: L2–L4 read all of them (N × ≤12KB), P1/P2 read only their own.

**Step 2: data (L2, if db=yes).** `database-architect`, sonnet, `cfn-data` skill, directive light, floor forced. Input: SPEC in full (it is capped) + all PARTSPECs when present. Size-check. Log.

**Step 3: arch ∥ ux (L3).** One message, two spawns. `system-architect` opus on `cfn-arch` with the pseudo-fold instruction (lite precedent: emit the module/branch table as a section of ARCH, no PSEUDO file). `ui-designer` sonnet on `cfn-ux` with the design-fold instruction (one `§ Visual/tokens/layout` section replaces DESIGN_) when frontend=yes; it emits the wireframe reference. Size-check both. **Wireframe gate:** one `AskUserQuestion` Approve/Revise; Revise → one ux patch spawn (sonnet, findings only), re-surface once; second Revise → accept-as-is / descope / full megaplan. `--unattended`: record `approved_by: auto-unattended` to the decision log and the synthesis, proceed with the wireframe as emitted.

**Step 4: plan_review (L4).** `general-purpose`, sonnet, follow `.claude/skills/cfn-plan-review/SKILL.md` light (assumptions + blast radius only) over SPEC/DATA/ARCH/UX. Output REVIEW_<prog>.md. Findings that change FR set / schema / contract → BLOCKING (AskUserQuestion, patch the owning artifact with ONE sonnet patch spawn, re-size-check). Others → listed in REVIEW for write_plan to honor.

**Step 5: per part.** For each part whose §9 deps are done (run independent parts in one message):
- **P1 test_plan:** `tester`, sonnet, `cfn-test-plan` light. Inputs = `lib/extract-sections.sh planning/<prog>/SPEC_<prog>.md <part>` (and DATA/ARCH/UX likewise), written to `planning/<prog>__<part>/.in/` so the agent reads files, not pasted blobs, plus `PARTSPEC_<slug>.md` in full when present (its FR-<part>-n ids are the ones VERIFY coverage maps). Output TEST_<slug>.md. Size-check.
- **P2 write_plan + Bar A:** `general-purpose`, sonnet, follow `.claude/commands/write-plan.md` `--mode=mvp` with inputs = the same extracts + TEST + REVIEW. Output PLAN_<slug>.md + VERIFY_<slug>.md. Then in main chat: `check-verifiable-static.sh`, `check-produce-consume.sh`, `check-size.sh` (all three). Loop policy below. Then `bless-verify.sh VERIFY_<slug>.md --note "fast plan-stage"`.
- **P3 Bar B static:** `check-haiku-static.sh PLAN_<slug>.md` + weasel scan. Loop policy below. No probe. No repair agent. Rationale: lanes run on sonnet and report `blocked_on` for residual ambiguity; Bar B here is lint, not a guarantee.
- Log per part: `part <id>: PLAN <bytes>/<cap> VERIFY <bytes>/<cap> barA=<green|n findings> barB=<green|n findings> blessed=<sha12>`.

**Loop policy (every bar, every level).** One round. Findings ≤ `loop.inline_patch_max_lines` (8) lines of change → the orchestrator edits the artifact inline in main chat (edit-safety hooks apply), re-runs the check. Larger → exactly one sonnet repair spawn that receives ONLY the findings JSON + that one artifact path, then re-run. Still failing → stop that part, AskUserQuestion (accept with quarantine / descope / full megaplan). Never loop a second time, never re-run an upstream phase. A bless whose `regate` scope names `bar_a` after an inline edit is honored by re-running the static checks, not by re-spawning.

**Step 6: synthesis + hand-off.** Write `planning/<prog>/MEGAPLANFAST_<prog>.md` (≤ cap): program artifact table (path, bytes/cap), per-part table (slug, PLAN, VERIFY, sha12, barA, barB, deps), decisions resolved, parked items, build order (topological over §9 deps), and the hand-off lines:
```
/cfn-loop-task "<part task>" --mode=mvp        # per part, in build order
/goal "verify-run.sh reports all-green for planning/<prog>__<part>/VERIFY_<prog>__<part>.md, or stop after 30 turns"
```
Persistence gate (same as megaplan): every part has PLAN + VERIFY + `.sha256`; nothing loose in `planning/`. Log `MEGAPLANFAST ok: <path>`. Stop.

## Phase prompt template

```
Follow <phase skill path> exactly. Read the skill file first. Directive: light unless stated.
Task: <task>   Program: <prog>   Part: <part|program-level>
Floor (forced on): rls, auth_boundaries, secrets_handling, no_unscoped_delete, pii_if_present
Plan dir: <dir>   Read inputs: <resolved paths, extracts where noted; ABSENT lines for skipped phases>
Write artifact: <path>   HARD CAP: <bytes> bytes. Prefer tables and ids over prose. Over cap = rejected.
Open items: BLOCKING only if schema/contract/FR-set/floor; else pick the conservative default and mark [PARKED: <default>].
Do not spawn subagents. Do not use the Agent tool. Do not run tests. Do not edit any other file.
Return: artifact path, byte count, 3-line summary, [OPEN] list, [PARKED] list.
```

## What is kept / folded / dropped (vs megaplan)

| Guarantee | Fast |
|---|---|
| Wireframe gate | kept (1 revise round) |
| Bar A verifiable-done + bless + sha | kept, static, 1 round |
| Bar B haiku-executable | static lint only (check-haiku-static.sh); no probe, no repair agent |
| Security floor | spec §floor checklist + floor grep in check-verifiable-static |
| decide | folded into spec: BLOCKING forks only, one batch |
| pseudo / design | folded into arch / ux |
| research | inline in spec when unknowns=yes |
| per-part spec detail | `--part-specs` (auto): one 12KB sonnet PARTSPEC per part; shared DATA/ARCH/UX unchanged |
| ops, tiers, reverse mode, multi-plan seams, back-prop queue, probe | dropped (full megaplan) |
| plan_review | once, program level, sonnet, light |

## Failure modes

- Spec §9 missing or untagged in program mode → extracts degrade to whole artifacts → cost climbs. Orchestrator checks `extract-sections.sh --list-parts` returns the §9 ids before L2; mismatch = one spec patch spawn.
- Parts are distinct domains and the program SPEC goes vague per part → per-part test_plan guesses FRs, Bar A coverage fails, repair spawns return. The `--part-specs` auto rule (parts ≥ 4 or any extract < 3072 bytes) is the tripwire; if a part's test_plan still reports it cannot map FRs without guessing, force `--part-specs=on` on the re-run, never re-run arch per part.
- Agent writes over cap and "summarizes" by deleting ids/ACs → check-verifiable-static coverage catches AC loss; compress prompt forbids dropping ids.
- A phase spawns its own subagents → cost multiplier. Prompt forbids it; if a return mentions nested spawns, note in synthesis.
- Orchestrator pastes whole artifacts into prompts instead of paths → main-chat bloat. Always pass paths.
- `/goal` evaluator cannot see results → it loops. Every step's `log` line is mandatory stdout.

## Anti-patterns

- Re-running spec/arch per part. That is the 60% the baseline wasted. (A PARTSPEC is not a re-run: 12KB, sonnet, FR detail only, no actors/flags/floor/schema.)
- Adding a probe, a second bar round, tiers, or an ops phase "just for this one". Route to full megaplan instead.
- Raising a cap in `fast.json` to make one run pass. Raise per-run via AskUserQuestion, leave the constant.
- Deriving lanes from MEGAPLANFAST_ or VERIFY_. Only PLAN_ is a lane source (loop-task rule).

## Related

`cfn-megaplan` (full), `cfn-megaplan-lite` (medium single features), `cfn-megaplan/bars/check-size.sh`, `cfn-megaplan/lib/extract-sections.sh`, `cfn-loop-task`, `/goal` (Claude Code native; https://code.claude.com/docs/en/goal).
