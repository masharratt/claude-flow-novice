# Plan Review: Gauntlet-Loop pulls — A/B reference-bar critic + HTML workbench

**Plan reviewed:** `/home/masha/.claude/plans/hidden-spinning-metcalfe.md`
**Tier:** beta (default; no enterprise/judge panel invoked)
**Date:** 2026-07-28

---

## 1. Assumptions verified

| # | Assumption | Verify command (executed) | Evidence (actual output) | Verdict |
|---|------------|---------------------------|--------------------------|---------|
| 1 | AC-row JSON manifest is the only machine contract; markdown table is docs-only | `grep -rln 'AC-id.*criterion\|criterion *\|' .claude/skills/cfn-megaplan/ cfn-loop-orchestration-v2/` (excluding tests/fixtures) | Single hit: `verifiable-done.md` itself (the spec). No parser. | **VERIFIED** |
| 2 | Adding optional `reference` key breaks no parser/test | Read `check-verifiable-static.sh:168,174-285`; `verify-run.sh`; `bless-verify.sh` (blast-radius agent) | All use presence-checks / `has()` / conditional `jq -r '.x // ""'` / union-of-keys diff. Allowlist `:168` = `id check kind pass maps_to evidence` (presence, not exact-set). | **VERIFIED** |
| 3 | `cfn-vote-implement` accepts any producer manifest whose `suggestions[]` match the shared schema | Read `cfn-vote-implement/SKILL.md:18-31` | "Any skill emitting the shared manifest schema works" + discovery by glob. | **VERIFIED** |
| 4 | Producer discovery glob lives in ONE file | `readlink -f` both vote-implement paths + grep producer list in command file | TWO independent files: `skills/cfn-vote-implement/SKILL.md:23-29` (glob) AND `commands/cfn-vote-implement.md:23` (plain-text producer list). Not symlinked (9604B vs 6467B). | **FAILED** — see finding F1 |
| 5 | The suggestion schema has a single source of truth | `find .claude -name '*manifest*schema*' -o -name '*suggestion*schema*'` + grep `one_liner\|suggested_approach` | Zero shared schema file. Schema inlined per-producer: `cfn-dry-review/SKILL.md:38-44`, `cfn-persona-verify/SKILL.md:127+`, etc. "shared schema" is folk-defined, copied N times. | **FAILED** — see finding F2 |
| 6 | Gate ordering list is single-source | `grep -rn 'security-review -> dep-audit\|persona-verify'` across `.claude/ docs/` | Only `cfn-loop-task.md:371` quotes the ordering. Not mirrored. | **VERIFIED** |
| 7 | No prior RESOLVED decision on these entities | `decisions.sh search 'verifiable-done reference ab-critic workbench'` | Empty result. | **VERIFIED** (clean slate) |
| 8 | ab-critic vision LLM is provider-ban compliant | check tool registry | Uses `mcp__zai-mcp-server__analyze_image` / `mcp__4_5v_mcp__analyze_image` (z.ai, non-Anthropic). Precedent: `CFN_LOOP_FRONTEND.md:160`. | **VERIFIED** |
| 9 | Workbench render inputs are all optional / degrade gracefully | (static analysis of plan B3 source list) | Every source except `.cfn-cache/manifests/` is optional in the plan; missing → "Data gaps" footer. | **VERIFIED** (by design; enforced by test) |

---

## 2. Dependency Graph

**Entity: AC manifest object** (`planning/VERIFY_<slug>.md`, JSON in last fenced block)

*Needs (inbound):* nothing new — `reference` is a leaf string.
*Needed by (outbound):*
- `check-verifiable-static.sh:168,174-285` — presence-check allowlist; ignores unknown keys. **Safe.**
- `verify-run.sh:220-229` — reads `.id/.kind/.check/.pass/.cwd/.requires` only. **Safe.**
- `bless-verify.sh:104-134` — union-of-keys diff; `reference` becomes a tracked non-structural field. **Safe (desirable).**
- `cfn-loop-task.md` Step 0 manifest parse (`:431`) — already iterates `.acs[]`; the new trigger query `jq '.acs[]|select(has("reference"))|.id'` is additive. **Safe.**
- **NEW consumer: `cfn-workbench/render.sh`** parses the markdown AC table (B3). Workbench becomes the FIRST consumer of the markdown table. **GAP → finding F3.**

**Entity: vote-producer discovery list**
*Needed by:* `cfn-vote-implement` `latest` resolution.
- `skills/cfn-vote-implement/SKILL.md:23-29` — glob list. Plan edits this.
- `commands/cfn-vote-implement.md:23` — plain-text producer enumeration. **Plan does NOT edit this → drift. GAP → finding F1.**

**Entity: gate-set table / ordering** (`cfn-loop-task.md:350-371`)
*Needed by:* Phase 4 coordinator resolution. Single source. **Safe** (finding F1 is about the vote-producer list, not this table).

---

## 3. Blast Radius

### Covered by plan
- `reference` JSON key addition — parsers ignore it (verified).
- `check-verifiable-static.sh` check 1g + tests/fixtures.
- `cfn-ab-critic` skill + `cfn-vote-implement/SKILL.md` glob (step 7).
- `cfn-loop-task.md` gate table + ordering (step 8).
- `cfn-workbench` skill (steps 9-12).

### Safe (no action)
- `verify-run.sh`, `bless-verify.sh` — ignore unknown key.
- Gate ordering list — single source.

### GAPS (will break / drift)
- **G1:** `commands/cfn-vote-implement.md:23` producer list not edited → `latest` resolution + docs drift.
- **G2:** suggestion schema hand-copied into ab-critic (N+1th copy of a folk schema).
- **G3:** workbench parses markdown AC table but no consumer has before; parser must be column-tolerant (headers vary 3-9 cols across fixtures).
- **G4:** commit-time docs (`readme/feature-status.md`) not in plan — required by CLAUDE.md commit-time rule.

---

## 4. Edge Cases

- **Reference = remote URL that 404s / redirects:** plan covers (2s curl probe, WARN-skip). SSRF note: reference URLs are operator-authored in their own manifest (not external user input), so fetch risk is low; probe follows redirects — acceptable. **NOTE.**
- **Reference = path inside `.gitignore`/build output:** may not exist at plan time, must exist at exit bless. Plan covers (WARN→ERROR ladder).
- **Two ACs share one reference artifact:** independent comparisons, no dedup needed. Covered.
- **ab-critic returns "tie":** not a pass; emits `polish` suggestion. Covered.
- **Workbench invoked mid-run (partial state):** render-from-data is idempotent, handles partial. Covered.
- **HTML size with many screenshots:** `--max-screenshots` cap + placeholder. Covered.
- **Rollback:** revert commits; `reference` absence → ab-critic never resolves into gate set (silent skip). Clean opt-in rollback. Covered.
- **ab-critic blocked (missing/unreadable ref) does NOT flip AC to fail:** the executable `check` still owns pass/fail. Covered (exit 4, report-only).

---

## 5. Alpha Readiness

| Area | Status | Notes |
|------|--------|-------|
| test | PASS | Each step names failing-test-first (verification § + per-step deps). Edge cases → tests (reference empty/glob/missing plan-vs-exit; shuffle determinism; workbench self-containment + escaping). |
| security | NOTE | No DB/secrets. Remote reference URL fetch = operator-authored (low SSRF). HTML-injection from evidence strings handled (escape + self-test). No new crypto/auth hand-rolled. |
| backend | PASS | ab-critic has explicit exit codes (0/1/2/3/4) for every boundary: missing, unreadable, unsupported type, blocked. |
| frontend | NOTE | Workbench emits static HTML (not the project app). `file://` render check in verification covers it; project rule "Frontend changes MUST be verified with Playwright" is borderline for a static report — optional Playwright smoke (open, assert zero console errors) recommended, not blocking. |
| architect | PASS | Rollback = revert + opt-in (no `reference` → no fire). No feature flag needed; the key's absence is the flag. |
| supabase | N/A | No DB. |
| contract | GAP | Suggestion schema has no single source of truth (F2). ab-critic would add copy N+1. |
| consistency | GAP | Commit-time docs (`readme/feature-status.md`) missing from plan (F4). |

**Alpha-ready: NO** (2 GAPs: F1 producer-list drift is the blocker; F2/F4 are quick adds). All NOTEs are non-blocking.

---

## 6. Findings

1. **[BLOCKER] Producer list drifts in `commands/cfn-vote-implement.md:23`.** The plan edits only `skills/cfn-vote-implement/SKILL.md:23-29`. The command file independently enumerates producers (`cfn-dry-review-*`, …, `cfn-review-alpha-v2-*`) for `latest` resolution. Files are NOT symlinked (already drifted). ab-critic manifests would be discoverable by glob `cfn-*.json` (so `latest` still works mechanically), but the documented producer list and the SKILL glob disagree.
   *Recommendation:* Step 7 becomes a 2-line edit — add `cfn-ab-critic-*.json` to BOTH `skills/cfn-vote-implement/SKILL.md:23-29` and `commands/cfn-vote-implement.md:23`.

2. **[GAP] Suggestion schema is folk-defined; plan adds copy N+1 (F2/contract).** No shared schema file exists (`find` = 0). `cfn-vote-implement/SKILL.md:20` calls it "shared" but each producer inlines it (`cfn-dry-review/SKILL.md:38-44`, `cfn-persona-verify/SKILL.md:127+`). CFN's own DRY rule says extract on 2nd occurrence.
   *Recommendation:* For THIS PR, mirror the existing pattern (don't scope-creep a refactor) BUT add a `cfn:` marker in `cfn-ab-critic/SKILL.md` naming the extraction as the upgrade trigger, and reference `cfn-vote-implement/SKILL.md` as the canonical-shape doc rather than redefining fields in prose. Open a tech-debt row (cfn-tech-debt) for extracting `suggestion-schema.md` across all producers in a follow-up.

3. **[NOTE] Workbench is the first consumer of the markdown AC table — parser must be column-tolerant (F3).** Fixtures prove headers vary (3/5/8/9 cols: `no-json.md`=3, `cfn-test-plan`=5, `clean.md`=8, `verifiable-done.md`=17=9). A positional parser breaks.
   *Recommendation:* `render.sh` AC-table parser reads by HEADER NAME, not column index; tolerate missing `reference` column. Add a workbench test rendering against both a 5-col and a 9-col fixture VERIFY.

4. **[GAP] Commit-time docs missing (F4/consistency).** CLAUDE.md mandates `readme/feature-status.md` + `readme/state-machines.md` updates per commit. Neither feature is in the file list. ab-critic adds a gate (stateful: pending→voted→implemented/skipped); workbench is a new feature.
   *Recommendation:* Add step 13 — update `readme/feature-status.md` (2 new features: cfn-ab-critic beta, cfn-workbench draft) and `readme/state-machines.md` (suggestion lifecycle already exists; add the ab-critic `reference-gap` entry point).

5. **[NOTE] Scope: 12 files > 8-file smell test (Phase 0).** Justified — 2 independent features the user selected; 8 are new files (low blast radius), 4 are surgical edits. Two MVP trims available if blast radius per-commit matters:
   - (a) Ship ab-critic **manual-invocation first** (`/cfn-ab-critic --ac …`), defer the `cfn-loop-task` auto-wiring (step 8) to a second commit. Halves the shared-contract blast radius; validate the critic before it auto-fires in every loop.
   - (b) Ship workbench with **4 sections** (header, AC table, gate timeline, vote ledger); defer screenshots/per-iteration-detail/bless/tech-debt to phase 2.
   *Recommendation:* Adopt (a) — decouple the gate-wiring from the skill. Keep workbench at full 8 sections (cheap once the render scaffolding exists).

---

## Return

- **Artifact:** `planning/REVIEW_gauntlet_ab-critic_workbench.md`
- **Finding counts:** BLOCKER 1 (F1) · GAP 2 (F2, F4) · NOTE 2 (F3, F5)
- **Alpha-ready:** NO — blocked on F1 (producer-list 2-line edit). F2/F4 are quick adds during implementation.
- **UNTESTED assumptions needing user input:** none (all 9 resolved; F1/F2 resolved to FAILED with concrete fixes).
