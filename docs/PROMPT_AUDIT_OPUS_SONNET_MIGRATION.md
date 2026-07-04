# Prompt Audit: Fable → Opus/Sonnet Migration

Date: 2026-07-03. Target model mix: Opus orchestrator (main chat), Sonnet executors (subagents).
Scope: `/cfn-loop-task`, `cfn-loop-orchestration-v2`, `cfn-megaplan` + all sub-phase skills, loop-critical agent profiles.
Method: 6 parallel audit agents, each verifying stale references on disk before flagging.

**Bottom line:** the harness was written for a model that reconciles contradictions, backfills missing contracts, and infers intent. Sonnet does none of that. 23 P0 findings, most falling into 5 repeating failure classes. Fixes are concrete and mostly mechanical.

---

## Cross-cutting failure classes

1. **Broken inter-stage contracts.** Megaplan hands `--mode=beta` to loop-task which only accepts `mvp|standard|enterprise`; loop-task never reads the VERIFY manifest megaplan's Bar A produces (the completion gate has no consumer); cfn-spec's Build Flags block is defined outside the output template Sonnet copies; cfn-data's field-bindings table lacks the columns cfn-ux's derivation rules require; binding-kind vocabularies drift between producer and consumer.
2. **Gates are prose judgment, not mechanics.** Bar A anti-stub heuristics need intent inference; Bar B has no iteration cap or probe-output parsing rule; gate thresholds contradict across 4 files (0.75 vs 95% vs 0.85, decimal vs percent); confidence scores have no derivation rubric; plan-review never forces assumption verification to actually run; judge panels score 1-5 unanchored (Sonnet regresses to 4).
3. **Dead references, verified missing on disk.** orchestration-v2's `lib/*/SKILL.md` files point at `dist/cli/orchestrator-cli.js`, five `helpers/*.sh`, `redis-coordination/`, `execute-decision.sh` — none exist. Agent profiles source `cfn-test-runner`, `json-validation`, `cfn-test-execution`, `cfn-agent-output-processing`, `.claude/templates/` — none exist. `coordinators/README.md` names 5 profiles that don't exist. Sonnet retries, improvises, or writes its own replacements mid-loop.
4. **Internal contradictions Sonnet resolves by recency/randomness.** code-reviewer mandates AND forbids confidence scores in the same file; tester has 3 incompatible completion protocols; agents told to run `npm test` while coordinator also runs it (WSL2 OOM); 14 profiles instruct watch mode against the global no-watch rule; backend-developer hardcodes Jest while tester mandates detect-and-match; two escalation lists disagree; product-owner schema emits `DEFER_AND_PROCEED` which the orchestrator's type guard rejects.
5. **Examples contradict templates; completeness never forced.** Sonnet copies examples over prose: cfn-ux's worked example shows 5 of 9 mandated columns; cfn-data's RLS example shows 2 of 4 operations; cfn-test-plan's e2e example violates its own "commands only" rule. Under-enumeration (Sonnet's signature failure) is unforced: edge-case minimum invites exactly-5 behavior, pseudo branch coverage only checked one direction, no per-breakpoint or per-operation tables.

---

## P0 findings (system-breaking)

| # | Location | Defect | Fix |
|---|----------|--------|-----|
| 1 | `cfn-loop-task.md:139` vs `:157` | Agents AND coordinator run full suite; contradicts global rule; WSL2 OOM | Agents run scoped tests only + JSON output contract; coordinator run is sole authoritative gate |
| 2 | `cfn-loop-task.md:125-127` | "Lanes" undefined; no file-ownership rule; parallel clobber | Mechanical lane derivation: plan phases → lanes, exclusive file lists, cap 4, same-file → same lane |
| 3 | `cfn-loop-orchestration-v2/lib/orchestrator/SKILL.md` | Every entry point named is missing on disk | Replace with single verified entry (`cli/orchestrate.sh`) + task-mode banner; quarantine lib docs |
| 4 | 4 files | Gate thresholds contradict (95% / 0.75 / 0.85 / 98%) | One `THRESHOLDS.md` table with named metrics (test_pass_rate_gate vs confidence_gate); all files reference it |
| 5 | `lib/decision/SKILL.md` | `execute-decision.sh` + audit skill don't exist; PO gate hard-fails at decision moment | Point at existing `parse-decision.sh`; delete aspirational sections |
| 6 | `bars/verifiable-done.md:55-62` | Anti-stub heuristics need intent inference; Opus rubber-stamps | Extend AC row with `trigger/seeds/signal` columns; replace heuristics with string-matching rules |
| 7 | `cfn-megaplan/SKILL.md:141`, `bars/haiku-executable.md` | Bar B unbounded loop, no probe parsing rule | Max 3 rounds then AskUserQuestion; PASS = exact trimmed match; question-line extraction rule |
| 8 | `cfn-megaplan/SKILL.md:53-68` | No rule for deps on skipped conditional phases; DAG stalls or dangling input paths | Skipped-dep rule: dropped = satisfied; inject literal `Input ABSENT (phase skipped)` line |
| 9 | `SKILL.md:165` + `verifiable-done.md:84` + `cfn-loop-task.md` | `--mode=beta` invalid downstream; VERIFY manifest never consumed | Map tier→mode; add loop-task Step 0: parse VERIFY manifest, PROCEED requires all checks pass |
| 10 | `cfn-spec/SKILL.md:112-158` | Build Flags defined after/outside output template | Move into template as `## 8. Build Flags`; reject specs without it |
| 11 | `cfn-pseudo/SKILL.md:63-74` | Coverage checked branches→spec only; misses missing branches | Mandatory reverse table: every AC/EC claimed by a branch or `[UNCOVERED]` blocks handoff |
| 12 | `cfn-spec/SKILL.md:43` | 4 load-bearing `[core]` rules in one prose paragraph; runtime-signal rule is last sentence | Numbered 4-rule checklist + second worked example showing runtime signal |
| 13 | `write-plan.md:176-192` | Step template = placeholder bullets; no file/signature/verify columns; Bar B checklist lives only in gate | Mandatory per-step table: file, exact change, failing test, verify command, done predicate; banned-word list |
| 14 | `write-plan.md:161-192` | Monolithic red/green phases; ignores TEST Phase 6 table; Sonnet rationalizes TDD away | Per-step red/green pairs inherited verbatim from TEST_<slug>.md; coordinator executes commands |
| 15 | `write-plan.md:200-205` | Hardcoded deliverables ("coverage ≥80%") are the exact prose Bar A rejects | Deliverables as executable-check table |
| 16 | `cfn-plan-review/SKILL.md:55-63` | Assumptions labeled UNTESTED, nothing forces verification to run | Mandatory verify-command + pasted-evidence column; any UNTESTED = finding; blocks "Alpha-ready: YES" |
| 17 | `cfn-data/SKILL.md:95-107` vs `cfn-ux/SKILL.md:61-84` | Field-bindings table missing columns ux derivation needs (row counts, required, length) | 8-column contract incl. Required, Options/rows count, Range/length, UI access; COUNT(*) rule |
| 18 | same pair | Binding-kind token sets drift (`multi-FK` vs `multi-select FK`) | One closed 9-token vocabulary, byte-for-byte match, mismatch routes back as producer defect |
| 19 | `cfn-ux/SKILL.md:59-67` | Derivation map has taste forks (input/textarea, stepper/slider, toggle/checkbox, timestamp) | Mechanical tie-breakers: ≤120 chars → input; immediate-effect → toggle; timestamp → datetime picker; etc |
| 20 | `product-owner.md:56` | Emits `DEFER_AND_PROCEED`; orchestrator type guard (`types.ts:66`) rejects it | Delete value; defer = PROCEED + scope_changes backlog items; state exact enum |
| 21 | `code-reviewer.md:108` vs `:270`; `tester.md` (×3) | Profiles mandate AND forbid confidence in same file | Single `## Final Message Contract` JSON per profile; delete contradictory blocks |
| 22 | 14 profiles | `npm test --watch` in headless subagents = hang until timeout | Replace with `vitest run` + tee-to-file capture pattern everywhere |
| 23 | ~10 profiles | Completion protocols source 4 skills + templates dir that don't exist | Delete refs; inline the 6-line bash equivalent |

---

## Work packages (proposed fix order)

### WP1 — Contract repairs (highest leverage, small diffs)
- Tier/mode enum single source of truth; megaplan Step 7 maps or loop-task renames `standard`→`beta` (P0-9).
- loop-task Step 0 consumes VERIFY manifest (P0-9).
- cfn-spec template gains `## 8. Build Flags` (P0-10); megaplan Step 2 parses the block instead of re-deriving from prose.
- Field-bindings 8-column contract + closed binding-kind vocabulary in cfn-data AND cfn-ux (P0-17/18).
- Canonical slug rule pasted into cfn-spec; `SPEC_<slug>.md` naming unified across spec/pseudo/decide/research.
- `[PARKED: <default>]` marker defined in cfn-spec, accepted by cfn-pseudo (currently deadlocks literal readers).
- AuthZ matrix pinned shape (`allow|deny-role|deny-state`) at arch→ux handoff; hide-vs-disable derived from cell token.
- cfn-ux §5 a11y-hooks handoff becomes a table cfn-design consumes verbatim.

### WP2 — Gate mechanization
- `THRESHOLDS.md` canonical table; all four files reference it (P0-4).
- Checked-in `gate-check.sh` owning runner detection + exit codes; doc calls script, never inline grep (P0-1 companion).
- Bar A: `trigger/seeds/signal` AC columns + string-matching stub rules + mandatory per-AC gate report table appended to VERIFY (P0-6); VERIFY file layout pinned (JSON manifest = last fenced block).
- Bar B: 3-round cap, exact-PASS parsing, probe-noise filter (P0-7); ship the static scan as a bash script.
- Skipped-dep rule + profile `directive`/`condition` field split + explicit `agent` keys for decide/test_plan/ops; write_plan + plan_review declared main-chat commands (P0-8).
- Confidence rubric (arithmetic over observables, start 1.0 subtract per defect) replaces free estimation in validation SKILL + profiles.
- Product-owner decision rubric (first-match-wins, evidence requirement) replaces 340 lines of GOAP pseudo-code; schema aligned to `types.ts` (P0-20).
- Plan-review: mandatory verification execution + evidence paste (P0-16), code-entity trace commands, anchored 1-5 judge rubric, minimum-evidence floor, output artifact `planning/REVIEW_<slug>.md` + return contract.
- Bound every loop: Bar A loop-back, Bar B rounds, `[OPEN]` cycles — max 3 then AskUserQuestion.

### WP3 — write-plan rebuild (weakest file, gates everything downstream)
- Per-step table schema with banned-vagueness word list (P0-13).
- Per-step TDD sequence inheriting TEST_<slug> Phase 6 verbatim; coordinator-executes rule stated (P0-14).
- Deliverables as executable checks (P0-15).
- New `## Ops Integration Tasks` section consuming OPS artifact (flag wrapper, log emits, down-migration) — runtime-observed ACs currently untestable without it.
- Embed Bar B 8-item self-check for standalone runs; flatten the JS template-literal planner prompt into two labeled variants.
- Define Loop 3 gate / Loop 2 consensus computation next to the numbers.

### WP4 — Agent profile overhaul
- `_shared/agent-prelude.md`: pre+post edit hook pair, CodeSearch-first, test-capture pattern (no watch/bail), scope fence (only assigned files, no drive-bys, no new deps, no em dashes, scoped test DELETEs), redaction. Deletes ~600 duplicated lines (fixes P0-22/23 in one place).
- Test-ownership split stated once globally: Loop 3 implementers run own scoped tests with capture; Loop 2 validators + PO read captured output only ("no evidence provided" = FAIL); coordinator runs full suites.
- Four-section profile template (Role / Procedure / Constraints / Final Message Contract); advisor + technical-advisor are the in-repo gold standards to clone.
- Purge contradictions: code-reviewer + tester single completion contract (P0-21); delete Jest hardcode, share tester's detection table.
- sparc/specification + pseudocode + accessibility-advocate get output contracts; delete stakeholder-workshop prose.
- `model: opus` on 7 profiles → `sonnet` (or remove) + rubric hardening.
- Bloat cuts: 5 profiles ≥600 lines → <250 (integration-tester's 340-line JWT example anchors Sonnet to wrong shapes).
- test-validation-agent: fake tool syntax inside bash fences → prose steps.
- Delete/regenerate `coordinators/README.md` (names 5 nonexistent profiles).

### WP5 — Dead-doc quarantine
- orchestration-v2 `lib/*/SKILL.md`: banner "CLI-MODE INTERNAL — task-mode must not follow" or move to docs/; top-level SKILL.md is the only loadable one (P0-3/5).
- Redis protocol in `lib/validation/SKILL.md` gets mode banner (contradicts task-mode rule).
- `cfn-loop-cli.md` references missing `lib/mdap/orchestrator.js` — likely non-functional; verify before routing work there.
- Retro signal: persist `cfn-retro` output to `.cfn-cache/retro-latest.md` or mark megaplan Step 0.4 skip-if-absent.

### WP6 — Examples + completeness forcing
- Fix example/template drift: cfn-ux 9-column example, cfn-data RLS example with explicit default-deny rows, cfn-test-plan e2e command-form example.
- Completeness tables: EC per-category table (10 rows, N/A needs reason) in cfn-spec; reverse coverage table in cfn-pseudo (P0-11); RLS per-operation table; per-breakpoint responsive table; cfn-ops beta floors; component-grouping procedure in cfn-arch; task-flow table in cfn-ux.
- Worked examples where missing: full pseudo operation with failure branches; cfn-loop-task 15-line iteration transcript; megaplan DAG-walk trace; Then-clause good/bad rubric in cfn-spec.
- Contrast ratios: computed via provided node one-liner from actual hexes, never stated bare.
- cfn-arch Step -1 mode-resolution table moved to top (deferral currently sits AFTER the steps it nullifies — Sonnet authors a second schema before reading it).
- Iteration retry template: replace undefined `${FEEDBACK}` with verbatim failing-test excerpts from captured output.
- Negative-only reminders rewritten as do-pairs; duplicate escalation lists collapsed to one; 0/0 typecheck check wired into gate as Step 3.0.
- cfn-research probe bounds: read-only, timeboxed, no paid endpoints.
- cfn-decide blocking litmus (schema migration / API contract / 3+ files / downstream redo) + per-category completeness rows.

---

## Notes

- Files already Sonnet-ready (minimal changes): `advisor.md`, `technical-advisor.md`, `cfn-test-plan` (fix e2e example only), `cfn-ops` (add beta floors), `cfn-decide` (litmus + one stale ref), cfn-arch's build ladder, cfn-ux state enumeration.
- Weakest links, in order: `write-plan.md` (vestigial pre-megaplan template contradicting the bars around it), `product-owner.md`, `cfn-plan-review` (most rubber-stampable stage), orchestration-v2 `lib/` docs, the 600+ line specialist profiles.
- Cross-file fixes (slug naming, PARKED marker, binding vocabulary, tier enum, test ownership) must land as single commits per contract — fixing one side alone creates a new contradiction.
