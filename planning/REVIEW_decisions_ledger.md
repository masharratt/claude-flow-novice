# Plan Review: decisions-ledger writer for cfn-workbench

**Date:** 2026-07-28
**Tier:** beta (Phase 5.5 Plan Judge SKIPPED, enterprise only)
**Plan:** `planning/PLAN_decisions_ledger.md` (2 lanes A->B, 41 red-first TDD rows, exit taxonomy 0..8, SM-1..SM-9, hostile-input ECs mapped)
**Bar A manifest:** `planning/VERIFY_decisions_ledger.md` (64 ACs, blessed sha256=607f1ae37370, plan-stage evidence_pending)
**Reviewer:** cfn-plan-review v1.1.0 protocol, beta-light
**Center of gravity:** 2 reverse-symlinked coordinator files (`cfn-loop-task.md` lines 414/429/535; `cfn-megaplan/SKILL.md` line 215) consumed by every CFN project.

**Resolved decisions carried (user-approved 2026-07-28; not re-opened):** D-1 (new cfn-decisions skill), D-7 (JSON-first/SQLite-best-effort/never roll back), D-8 (isolate hook failures at all 4 sites), D-9 (writer replaces cfn-decide at megaplan:215).

---

## 1. Assumptions Verified

| # | Assumption | Verify command (executed) | Evidence (pasted actual output) | Verdict |
|---|---|---|---|---|
| A1 | The renderer (`section-decisions.sh:38-51`) projects exactly 9 fields (id, actor, title, chosen, rationale, alternatives, iteration, timestamp, status) and the writer's ENTRY shape covers all 9. | `sed -n '41,51p' .claude/skills/cfn-workbench/lib/section-decisions.sh` then count `.(id\|actor\|...)` projections | 9 distinct `.field` projections in the jq TSV; ARCH §2.3 ENTRY interface lists `id, actor, title, chosen, rationale, alternatives, iteration, blocking, timestamp, status` (10 fields; `blocking` is JSON-only, not rendered). Renderer contract holds. | VERIFIED |
| A2 | The LOCKED sink (`decision-log/record.sh`) is callable as a subprocess with documented argv and uses bare-flag `--blocking` form. | `sed -n '17,37p' .claude/skills/decision-log/record.sh` | Line 19: `STATUS="accepted"` default. Line 30: `--blocking)  BLOCKING=1; shift;;` (bare-flag form). Line 35: `*) echo "[decision-log] unknown arg: $1" >&2; exit 2;;`. Plan's argv translation in OP-W4/W2.4 matches verbatim. | VERIFIED |
| A3 | The SQLite `decisions` table has UNIQUE(project,slug,decision_id) constraint matching the writer's upsert-by-key on (slug,id). | `sed -n '57,64p' .claude/skills/decision-log/schema.sql` | Line 57-58: `status TEXT ... CHECK(status IN ('proposed','accepted','superseded'))`. Line 63: `UNIQUE(project, slug, decision_id)`. Matches writer's FR-2 upsert contract. 3-state enum traced through writer + SQLite + renderer (all 3 consumers handle all 3 values). | VERIFIED |
| A4 | `bless-verify.sh`'s append-only event ledger is a DIFFERENT cardinality from the writer's upsert-by-key (decisions are evolving entities; blessings are events). Plan does not copy bless-verify's append semantics. | `sed -n '143,149p' .claude/skills/cfn-megaplan/bars/bless-verify.sh` | bless-verify line 145: `jq --argjson e "$ENTRY" '.blessings += [$e]' "$LEDGER"` (append-only). Plan's OP-W3 step 5c: `jq --argjson new "$ENTRY" '... if $idx != null then .decisions \|= map(if .id == $new.id then $new else . end) else .decisions += [$new] end'` (upsert-by-key replace). Different semantics; SPEC FR-2 justification cited. | VERIFIED |
| A5 | `record.sh`'s default `STATUS="accepted"` (line 19) diverges from the writer's default `status=proposed`; the writer MUST always forward `--status` explicitly to avoid silent upgrade in SQLite. | `grep -n '^STATUS=' .claude/skills/decision-log/record.sh` | `19:STATUS="accepted"`. ARCH §2.4 line 181 documents this defensively: "Always forward `--status` explicitly: the sink defaults `STATUS="accepted"` ... Forgetting to forward would silently upgrade a proposed decision to accepted in the SQLite register." Plan's OP-W4 step 3a enforces it. | VERIFIED |
| A6 | Reverse symlinks: `~/.claude/{commands,skills}` resolve to project paths (same inode). Editing coordinator files in the project IS editing them for all CFN projects. | `readlink /home/masha/.claude/skills /home/masha/.claude/commands; stat -c '%i %n' /home/masha/.claude/skills/cfn-megaplan/SKILL.md /home/masha/projects/claude-flow-novice/.claude/skills/cfn-megaplan/SKILL.md` | `commands -> /home/masha/projects/claude-flow-novice/.claude/commands`; `skills -> .../.claude/skills`. megaplan/SKILL.md inode 669365 via both paths (identical). cfn-loop-task.md inode 1637714 via both paths. Plan's headline blast radius is real: 4 hook-site edits propagate to every project. | VERIFIED |
| A7 | The 3 hook-site anchors in `cfn-loop-task.md` (lines 414, 429, 535) match the plan's claimed positions and surrounding prose. | `sed -n '414p;429p;535p' .claude/commands/cfn-loop-task.md` | Line 414: "3/3 items are implemented in-line... 2/3 items consult product-owner one at a time..." (SITE 1 anchor). Line 429: "...surface 1/3 items via `AskUserQuestion`, **batched 4 questions per call**..." (SITE 2 anchor). Line 535: "...-> `AskUserQuestion` (one decision): **Quarantine** / **Keep iterating** / **Abort**." (SITE 3 anchor). All 3 anchors match PLAN Lane B step descriptions. | VERIFIED |
| A8 | The 4th hook site at `cfn-megaplan/SKILL.md:215` exists and the surrounding sentence is the one D-9 rewrites. | `sed -n '215p' .claude/skills/cfn-megaplan/SKILL.md` | Line 215: "If any phase returns **BLOCKING** `[OPEN]` items, batch them and surface via `AskUserQuestion` before advancing past the level. Record every resolved decision to the decision log (closes gap G35/decision-log loop). `cfn-decide` owns the register; the orchestrator forwards mid-level decisions to it." Anchor text matches ARCH §3 SITE 4 description. | VERIFIED-with-caveat (see Finding F1: the substituted string is `cfn-decide`, not `decision-log/record.sh` as PLAN B.4 / AC-12 claim) |
| A9 | The renderer's path `planning/.VERIFY_<slug>.decisions.json` is computed as `$root/planning/.VERIFY_${slug}.decisions.json` (line 14); the writer's default TARGET `$(pwd)/planning/.VERIFY_${slug}.decisions.json` matches when the coordinator runs from the project root. | `sed -n '11,15p' .claude/skills/cfn-workbench/lib/section-decisions.sh` | Line 14: `local ledger="$root/planning/.VERIFY_${slug}.decisions.json"`. Plan's writer TARGET (ARCH §2.1 `--root` default `$(pwd)/planning`): `$(pwd)/planning/.VERIFY_${slug}.decisions.json`. Paths align when `WORKBENCH_ROOT == $(pwd)` (the typical coordinator cwd). | VERIFIED |
| A10 | The FR-9 leak floor's teardown `DELETE FROM decisions WHERE slug LIKE 'test-dec-%'` has a WHERE clause targeting only test-created rows (no unscoped DELETE). | `grep -n 'DELETE FROM decisions' planning/TEST_decisions_ledger.md planning/PLAN_decisions_ledger.md` | TEST §1 line 44: "`DELETE FROM decisions WHERE slug LIKE 'test-dec-%'` (scoped, marker-targeted; no `TRUNCATE`, no FK-check disable)". PLAN "Synthetic Fixtures" section: marker `test-dec-<6hex>`. WHERE clause present and marker-targeted. Floor `no_unscoped_delete` met. | VERIFIED |
| A11 | The writer introduces ZERO Anthropic API calls and ZERO new third-party dependencies (bash + jq only, both pre-existing in the renderer baseline). | `grep -rE 'anthropic:\*\|claude -p\|@anthropic-ai' planning/PLAN_decisions_ledger.md .claude/skills/decision-log/record.sh .claude/skills/cfn-workbench/lib/section-decisions.sh` | Zero matches. NFR-1 (bash+jq only) and NFR-2 (zero Anthropic API) documented in SPEC §2. Deliverable "writer is bash+jq only (NFR-1)" + "no Anthropic API calls (NFR-2)" pass conditions are greps. | VERIFIED |
| A12 | Status enum (proposed, accepted, superseded) traced through all 3 consumers: writer default/validate, SQLite CHECK constraint, renderer state_label. | `grep -n "proposed\|accepted\|superseded" .claude/skills/decision-log/schema.sql .claude/skills/cfn-workbench/lib/section-decisions.sh` | schema.sql:57-58 `CHECK(status IN ('proposed','accepted','superseded'))`. section-decisions.sh:54-56 `state_label "$status"` (handles proposed/accepted/superseded per workbench state-label system). Writer enum validation in OP-W1 step 8. All 3 consumers handle the same 3 values. | VERIFIED |

**Assumption registry verdict:** 12/12 VERIFIED. Zero UNTESTED. Pastable evidence per row.

---

## 2. Dependency Graph (with grep hit-count evidence)

CodeSearch was indexed for this repo; grep used as a precise cross-check (every row below cites the command and the hit count).

### Entities touched

| Entity | Path | Owner (after plan) | LOCKED? |
|---|---|---|---|
| writer CLI (NEW) | `.claude/skills/cfn-decisions/record.sh` + `lib/*.sh` | this plan (Lane A) | no (new) |
| per-run JSON artifact (NEW) | `planning/.VERIFY_<slug>.decisions.json` | writer | no (new) |
| renderer (LOCKED consumer) | `.claude/skills/cfn-workbench/lib/section-decisions.sh` | cfn-workbench | yes (read-only contract) |
| SQLite sink (LOCKED consumer) | `.claude/skills/decision-log/{record.sh,schema.sql}` | decision-log | yes (subprocess call only) |
| coordinator sites (MODIFIED) | `.claude/commands/cfn-loop-task.md` (3 sites) + `.claude/skills/cfn-megaplan/SKILL.md` (1 site) | this plan (Lane B) | no (prose+snippet edits) |
| append-only bless ledger (NOT TOUCHED) | `.claude/skills/cfn-megaplan/bars/bless-verify.sh` + `.verify.json` sidecar | cfn-megaplan | yes (separate lifecycle) |

### Inbound dependencies (what the writer/skill needs to exist)

| Symbol / Path | Evidence (command + count) | Consumers of THIS plan |
|---|---|---|
| `decision-log/record.sh` (LOCKED sink subprocess) | `grep -rln 'decision-log/record.sh' --include='*.md' --include='*.sh' 2>/dev/null \| grep -v '^planning/'` -> 4 files: `.claude/skills/cfn-decide/SKILL.md`, `.claude/skills/decision-log/{SKILL.md,record.sh}`, `tests/test-decision-record.sh`. | Lane A step A.6 calls it; pre-existing callers unaffected. |
| `section-decisions.sh` jq projection (9-field contract) | `grep -rln 'section-decisions\|section_decisions' --include='*.md' --include='*.sh' 2>/dev/null \| grep -v '^planning/'` -> 2 files: `section-decisions.sh` (self), `render.sh`. | Renderer is the ONLY reader of the JSON the writer produces. Plan does not touch renderer (WIRE-4 LOCKED). |
| `bless-verify.sh` patterns (refuse-gate, jq-escape, mktemp+mv atomic write) | `grep -rln 'bless-verify' --include='*.md' --include='*.sh' 2>/dev/null \| grep -v '^planning/' \| wc -l` -> 14 files reference it. | Lane A reuses 3 patterns (DRY dispositions in ARCH §0); no new coupling. |
| `mktemp` + POSIX `rename(2)` (stdlib; Linux/WSL2 portable) | n/a (bash builtin / kernel) | OP-W3 step 5; same-filesystem atomicity guaranteed by `mktemp "$DIR/.dec.XXXXXX"` (path INSIDE target dir). |

### Outbound dependencies (what depends on the entities THIS plan touches)

| Symbol / Path | Evidence (command + count) | Impact |
|---|---|---|
| `cfn-decide` (skill name; SITE 4 D-9 substitution target) | `grep -rln 'cfn-decide' --include='*.md' --include='*.sh' --include='*.json' 2>/dev/null \| grep -v '^planning/' \| wc -l` -> **15 files**. Of these: `.claude/skills/cfn-megaplan/SKILL.md` has 6 references (lines 66, 215, 300, 341, 372, 471); only **line 215 is substituted** by D-9. The other 14 files are unaffected (they reference `cfn-decide` as the L3 phase skill, which still runs to produce `DECISIONS_<slug>.md`). | The D-9 substitution is narrowly scoped; cfn-decide the phase skill is NOT deleted or orphaned. PLAN's headline D-9 framing ("writer replaces cfn-decide as canonical recording entry") is looser than the actual edit (one sentence at one site). See Finding F2. |
| `cfn-decisions` (NEW skill name) | `grep -rln 'cfn-decisions' --include='*.md' --include='*.sh' --include='*.json' 2>/dev/null \| grep -v '^planning/' \| wc -l` -> **0 files**. | Zero orphans today; after Lane B lands, 2 files will reference it (loop-task.md + megaplan/SKILL.md). WIRE-2 AC-62 enforces >=3 + >=1 matches post-edit. |
| `.VERIFY_*.decisions.json` (file path) | `grep -rln '\.VERIFY_.*\.decisions\.json' --include='*.md' --include='*.sh' --include='*.json' 2>/dev/null \| grep -v '^planning/' \| wc -l` -> **2 files**: `section-decisions.sh` + `readme/feature-status.md`. | Renderer reads it; feature-status.md mentions it in the cfn-workbench row. Plan adds the writer (the missing producer). No new consumers. |
| `cfn-loop-task.md` (reverse-symlinked coordinator) | reverse symlink verified; inode 1637714 via `~/.claude/commands/` AND project paths. | Lane B step B.1/B.2/B.3 insert hooks at 3 sites. Every CFN project running loop-task picks up the edits. **Plan correctly identifies this as the headline blast radius.** |
| `cfn-megaplan/SKILL.md` (reverse-symlinked coordinator) | reverse symlink verified; inode 669365 via both paths. | Lane B step B.4 rewrites line 215 (D-9). Every CFN project running megaplan picks up the edit. **Same headline blast radius.** |

### Produce-Consume sanity gate

```
$ bash .claude/skills/cfn-megaplan/bars/check-produce-consume.sh planning/PLAN_decisions_ledger.md
[{"file":"planning/PLAN_decisions_ledger.md","ac_id":"A.6","field":"consumes","issue":"identifier '.claude/skills/decision-log/record.sh (LOCKED subprocess; called' is not a <path>[:<symbol>] token","severity":"error"},
 {"file":"planning/PLAN_decisions_ledger.md","ac_id":"A.6","field":"consumes","issue":"identifier 'never modified)' is not a <path>[:<symbol>] token","severity":"error"},
 {"file":"planning/PLAN_decisions_ledger.md","ac_id":"A.8","field":"consumes","issue":"identifier '.claude/skills/cfn-workbench/lib/section-decisions.sh (all read-only asserts)' is not a <path>[:<symbol>] token","severity":"error"},
 {"file":"planning/PLAN_decisions_ledger.md","ac_id":"A.8","field":"consumes","issue":"dangling consume: '.claude/skills/decision-log/record.sh' matches no Produces in this plan (pre-existing symbol, or a typo — verify string matches byte-for-byte)","severity":"warn"}]
exit=0
```

**Verdict:** gate exit 0 (no duplicate producer, no blocking weasel). The 3 errors + 1 warn are token-shape quality issues in the plan's "Consumes" column prose (parenthetical asides confuse the parser); they do not block. See Finding F5 (advisory).

### Static weasel scan

```
$ bash .claude/skills/cfn-megaplan/bars/check-haiku-static.sh planning/PLAN_decisions_ledger.md
[{"file":"planning/PLAN_decisions_ledger.md","line":53,"phrase":"etc.","severity":"error"}]
exit=0
```

**Verdict:** exit 0. One weasel ("etc." on line 53) flagged but not blocking. The plan's TEST/OPS section names a concrete test framework (plain bash + jq) elsewhere; the "etc." is in the assembly-rule prose and is non-load-bearing.

### Signal-flow trace (Phase 2 cfn-plan-review rule)

For the FR-7 [core] external input "resolved AskUserQuestion decision at one of 4 named coordinator sites":

- **Parse step:** OP-H1 wrapper (inline bash function at each coordinator site) parses the coordinator-context decision (verdict / answer / classification) into writer argv. PLAN Lane B step B.1-B.5 + ARCH §3 + PSEUDO OP-H1 own it. Named FR: FR-7. Named AC: AC-9..AC-13 (assembled-path).
- **Thread step:** wrapper invokes `.claude/skills/cfn-decisions/record.sh "${ARGV[@]}"` with the mapped argv. PLAN Lane B step B.1-B.4 + ARCH §3 each-site mapping. Named AC: AC-9..AC-12 (one per site).
- **Observable output:** writer stdout `<id> <status>\n` on success; hook emits `decisions.ledger id=<id> status=<status>` (OBS-1) to the coordinator run-log; JSON entry persisted; SQLite row upserted (D-9 dual persistence for SITE 4; D-7 best-effort for failures). AC-35 + OBS-6 parity assert the run-log surfaces.

All three lanes have named FR + AC + owner. No `integration_lane_gap`.

---

## 3. Blast Radius

### Covered by plan (explicit)

- writer CLI construction (Lane A steps A.1-A.8: SKILL.md, record.sh, lib/arg-parse.sh, lib/jq-build.sh, lib/upsert.sh, lib/sink-delegate.sh, lib/help.sh, lib/state-machine-doc.md + tests/run-all.sh)
- JSON file shape (ARCH §2.3 interface; matches `section-decisions.sh:38-51` 9-field jq projection; `blocking` is JSON-only)
- SQLite sink composition (ARCH §2.4; calls LOCKED `record.sh` with shared-field argv only; never opens `decisions.db`)
- 3 loop-task.md hook sites (Lane B steps B.1/B.2/B.3 at lines 414/429/535; verified anchors)
- 1 megaplan/SKILL.md hook site (Lane B step B.4 at line 215; D-9 substitution; behavior-preserving for SQLite per [OPEN-A]/D-9)
- D-8 isolation at all 4 sites (Lane B step B.5; wrapper failure branch returns 0 unconditionally on writer non-zero)
- commit-time docs (D.1 feature-status.md, D.2 state-machines.md)
- rollback rehearsal (OPS §6 4 steps: git revert Lane B; rm skill dir; JSON INERT; SQLite persists)

### Safe (no action needed)

- `section-decisions.sh` renderer (LOCKED; plan does not modify; WIRE-4 asserts via grep + optional diff-baseline; AC-64)
- `decision-log/record.sh` + `schema.sql` (LOCKED; plan calls, never modifies; WIRE-3 asserts via grep)
- `bless-verify.sh` append-only ledger (separate lifecycle; not touched; ARCH §0 explicitly excludes)
- 14 of 15 `cfn-decide` callers outside line 215 (the L3 phase still runs; only SITE 4 sentence is rewritten)
- Existing tests/test-decision-record.sh (decision-log's own regression test; unaffected)
- 5 of 6 `cfn-decide` references inside megaplan/SKILL.md (lines 66, 300, 341, 372, 471; the L3 phase mapping, Step 7 deferred-batch routing, register template placeholder, format ownership, phase list)

### GAPS (will break or weaken assurance if not addressed)

None blocking. Two advisory gaps documented in Findings F2 (megaplan:300 routing inconsistency) and F4 (lost-update semantics for distinct-id concurrent writes).

---

## 4. Edge Cases

| Scenario | Plan coverage | Verdict |
|---|---|---|
| In-flight decisions during a run (decision resolves while a prior write is still in flight on the same id) | EC-6 / AC-49: two writers race for same id; POSIX `rename(2)` atomic mv guarantees last-writer-wins; per-writer mktemp + per-writer EXIT trap remove temp files. | Covered for same-id races. See F4 for distinct-id lost-update. |
| Two writer invocations racing on the same (slug, id) | OP-W3 step 5c + ARCH §10.5 + R2: same-id last-writer-wins. AC-49 (`tests/41-concurrency-race.sh`) asserts exactly one entry survives. | Covered. |
| Two writer invocations racing on DIFFERENT ids under real coordinator parallelism | Plan does NOT explicitly address. ARCH §10.5 says "the LOSING writer's field values are silently overwritten" but assumes same-id; for distinct ids, the second writer's READ may precede the first writer's MV, losing the first writer's insert entirely. | EDGE CASE GAP (advisory). See F4. Mitigated by the fact that coordinator decisions resolve at human/agent decision speed (not a hot loop); real parallelism is unlikely. |
| `record.sh` missing entirely (D-7 path) | EC-10 / AC-7 / `tests/52-dual-write-sink-missing.sh`: writer exits 7, JSON KEPT, stderr "record.sh missing; JSON persisted at <target>; SQLite sync skipped". | Covered. |
| `record.sh` hanging (indefinite sqlite lock) | OPS §5 + §8 runbook + ARCH §7 row "cfn-decisions-hook": writer does NOT time out the sink. PARKED `[PARKED: hook-site timeout mitigation]` defers the `timeout 30s` wrapper to a reactive hook-site mitigation if sink latency spikes. D-8 isolation does NOT cover indefinite hangs. | Acceptable for beta. The runbook documents the symptom ("Coordinator hook site hangs indefinitely") and first action (kill the stalled writer; OBS-4 fires with the kill signal's exit code; loop continues). No history of sink hangs; proactive wrapper would add 4 magic-number sites. |
| Rollback of a half-applied coordinator edit (Lane B step B.1 lands, B.2 does not) | Not explicitly addressed, but recoverable: `git revert <commit>` for the partial commit. D-8 isolation means a missing writer (or partial wiring) does not break the run (writer failure -> OBS-4 -> loop continues). OPS §6 rollback step 1 covers it. | Covered by D-8 + git revert. |
| Malformed caller `--timestamp "2026-13-45T99:99:99Z"` | EC-19 / AC-58 / `tests/31-exit-2-cli-parse.sh`: writer exits 2, stderr "timestamp must be ISO 8601 UTC like 2026-07-28T14:00:00Z". | Covered. |
| 1000-entry JSON file (renderer OOM/perf at scale) | EC-23 / AC-60 / `tests/82-volume-1000.sh`: pre-seed 999 + 1 invocation; p95 < 500ms; renderer TSV projection completes. | Covered. |
| Existing `.VERIFY_<slug>.decisions.json` not valid JSON | EC-9 / AC-23 / `tests/34-exit-5-target-corrupt.sh`: writer exits 5, PRESERVES bad file for inspection. | Covered. |
| Caller attempts `--delete`/`--purge`/`--supersede` | EC-17 / AC-14 / AC-56: writer exits 2 "unknown arg: --delete". Writer exposes no delete surface. | Covered. |
| JSON breakout / XSS / SQL injection in rationale | EC-13 / EC-14 / AC-8 / AC-43 / AC-44 / AC-45 / `tests/60-jq-construction.sh` + `tests/61-sql-injection.sh`: jq `--arg` escapes; sink parameterizes; renderer html-escapes downstream. | Covered. |
| Unicode / emoji / RTL / surrogate pairs in rationale | EC-21 / AC-46 / `tests/62-unicode-roundtrip.sh`: UTF-8 preserved byte-equal. | Covered. |
| Em dash U+2014 in caller rationale | EC-22 / AC-48 / `tests/64-em-dash-caller.sh`: persisted verbatim (NFR-5 carve-out bans em dashes in writer's OWN code only, not caller data). | Covered. |
| TZ=America/New_York, no `--timestamp` | EC-18 / AC-57 / `tests/95-defaults.sh`: writer defaults to `date -u +%Y-%m-%dT%H:%M:%SZ` (UTC). | Covered. |
| DST boundary parallel runs | EC-20 / AC-59 / `tests/43-dst-boundary.sh`: both timestamps well-formed UTC. | Covered. |

---

## 5. Alpha Readiness Check

| Area | Status | Notes (evidence-cited; no empty cells) |
|---|---|---|
| **test** | PASS | Every implementation step binds to a failing test written first (PLAN TDD Sequence rows 1-41, each with `Red command` and `Green command`). 64 ACs in `VERIFY_decisions_ledger.md` map 1:1 to test files. Bug-fix-style regression coverage: AC-2 (CARDINALITY stays 3, not 4) and AC-4 (no partial observable after `kill -9`) are the load-bearing red-first assertions. EC-1..EC-24 each map to a named test (PLAN "Hostile-Input EC Mapping" table). |
| **security** | PASS | db=no (SPEC §8); writer owns no schema, no new table, no RLS needed (confirmed: ARCH §5 SKIPPED, OPS §6 "no cfn-migration-rehearsal invocation"). Test teardown `DELETE FROM decisions WHERE slug LIKE 'test-dec-%'` has WHERE clause (A10). No secrets in code (FR-9 leak floor, OBS-5 negation signal). No Anthropic API in bash (NFR-2; A11 verified zero matches). HTTP headers floor: n/a (no HTTP surface; OPS §1 discharges with reason). No hand-rolled crypto/auth (ARCH §6). |
| **backend** | PASS | External API calls: writer->sink subprocess has explicit error paths (exit 7 missing, exit 8 non-zero; OBS-3). DB queries: delegated to LOCKED sink (no writer-side SQL). User input: FR-3 refuse-on-missing/empty/whitespace; FR-10 enum validation; EC-13/14/21/22 hostile-input tests. No unscoped DELETE/TRUNCATE (FR-8 + AC-14 + AC-56 static grep asserts zero matches). |
| **frontend** | N/A | frontend=no (SPEC §8). No UI surface. Renderer is LOCKED (read-only consumer). |
| **architect** | PASS | OPS §6 rollback documents 4 reversible steps (git revert Lane B; rm skill dir; JSON INERT; SQLite persists). D-8 isolation means a partial rollback does not break runs. |
| **supabase** | N/A | db=no. No migration. OPS §6 line 275 confirms no cfn-migration-rehearsal invocation. Schema sync step n/a (writer owns no schema; SQLite schema lives in LOCKED decision-log sink). |
| **contract** | PASS | Writer's JSON shape (ARCH §2.3) is the contract with the LOCKED renderer (single source of truth, no fallback schema; WIRE-4 AC-64 asserts renderer still reads the path). Writer'sink argv (ARCH §2.4) is the contract with the LOCKED sink. Enum completeness: status proposed/accepted/superseded traced through writer (default + validate) + SQLite (CHECK) + renderer (state_label) per A12. |
| **consistency** | PASS | Canonical constants named: `WRITER_LATENCY_P95_MS=500` (NFR-3 / OPS §7), `MAX_DECISIONS_PER_RUN=1000` (advisory). Exit codes 0..8 documented in ARCH §10.1 with `E_OK`/`E_VALIDATION`/.../`E_SINK_NONZERO` constants. PLAN's "Canonical Constants" floor met. |
| **consistency (docs)** | PASS | Doc steps D.1 (feature-status.md cfn-decisions row + cross-ref note on cfn-decide/decision-log rows) and D.2 (state-machines.md one-sentence JSON-relaxation note appended to existing Decision Record entity section, NO entity-name change). Commit-time documentation floor met per NFR-6. |
| **observ** | PASS | OBS-1..OBS-5 verify:required signals (OPS §2); OBS-6..OBS-7 derived. On-call query in OPS §2.4 (JSON_COUNT == LOG_COUNT; FAIL_COUNT explains divergence). Decision points (allow/deny on validation; pass/fail on sink) all log with id + status + rc + site (rationale never echoed; FR-9). Dashboard: `decisions.sh list --slug <slug>` + run-log greps. |
| **deployment** | N/A | Not a deployed service. No Fly.io, no env vars, no Docker. OPS §3 3-stage rollout (writer+tests -> hook edits -> end-to-end run) replaces canary. |
| **branch coverage (Bar B)** | FINDINGS | See Phase 5.6 below. Static scan clean (1 weasel "etc." line 53, advisory F5). Produce-consume scan exit 0 with 3 token-shape errors + 1 warn (advisory F5). Haiku-executable probe on representative step A.5 (load-bearing upsert): could-proceed YES after 1 critical fix (F6 step 5c jq expression syntactically invalid as written; F7 trap timing under set -u). Both are PLAN-side prose patches, no phase 1-5 re-run. |

**Alpha-ready: YES, conditional** on 2 PLAN-side patches (F1 AC-12 grep target; F6 step 5c jq expression). Both are prose patches to PLAN with no phase 1-5 re-run required. After patches land, re-bless the manifest at Bar A exit (bless-verify sidecar moves; OPS §3 Stage 1 promote gate catches this). 5 advisory findings (F2, F3, F4, F5, F7) documented in Phase 6 do not gate alpha.

---

## 5.6 Bar B: Haiku-Executable Gate

### Static + structural + branch-coverage scan

```
$ bash .claude/skills/cfn-megaplan/bars/check-haiku-static.sh planning/PLAN_decisions_ledger.md
[{"file":"planning/PLAN_decisions_ledger.md","line":53,"phrase":"etc.","severity":"error"}]
exit=0
```

Single weasel finding ("etc." in assembly-rule prose, non-load-bearing). No structural errors (every implementation step row has File + Change + Produces + Consumes + Failing test + Verify command + Done predicate). Branch coverage: OP-W3 (5a bootstrap, 5b corrupt-target, 5c valid-upsert), OP-W4 (sink missing, sink nonzero, sink happy), OP-W1 (per-flag reject paths), OP-W1b (first-missing-field iteration) all have named tests.

### Produce-consume scan

```
$ bash .claude/skills/cfn-megaplan/bars/check-produce-consume.sh planning/PLAN_decisions_ledger.md
exit=0 (3 token-shape errors + 1 dangling-consume warn; advisory only; see Finding F5)
```

### Live haiku probe (representative step: A.5 upsert_by_key_atomic)

Probe target: Lane A step A.5 (`.claude/skills/cfn-decisions/lib/upsert.sh`), the load-bearing atomic-write + upsert-by-key module. Selected because: (a) 3 branches (5a/5b/5c) with distinct exit codes (0/5/0); (b) trap installation under signal; (c) concurrency guarantee (AC-49 last-writer-wins); (d) renderer contract dependency (5a must bootstrap `{slug, decisions:[$new]}` wrapper to satisfy `section-decisions.sh:23` gate).

**Probe result:** could-proceed = YES (after 1 critical fix). Haiku agent (subagent_id `a457cc3d04269f9b7`, model=haiku, ~184s wall, 30 tool uses) produced scratch `/tmp/haiku-probe-upsert.sh` and self-tested all 3 branches.

What worked without ambiguity:
- Signature `upsert_by_key_atomic(ParsedArgs, ENTRY) -> TARGET|Exit(4|5)` (PLAN:83) unambiguous.
- Exit codes 4 (filesystem) and 5 (corrupt/jq-fail) per ARCH §2.2 mapped cleanly.
- Error messages from PLAN:83 reproduced verbatim match.
- 5a bootstrap wrapper `{slug:$slug, decisions:[$new]}` satisfies renderer gate at `section-decisions.sh:23` (verified by self-test).
- Concurrency claim accurate: POSIX `rename(2)` atomic; same-id last-writer-wins; different-id lost-update acknowledged per EC-6/F4.
- bless-verify.sh:62-66,137-149 pattern reference sufficient (DIR/BASE derivation, mktemp, jq-construct).

What did NOT work (see Findings F6 BLOCKING + F7 advisory):
- Step 5c jq expression as written in PLAN:83 is syntactically invalid. Pipeline `(.decisions // []) | map(.id) | index($new.id) as $idx | if ...` strips the object context, so `.decisions` is undefined in the conditional branches. Haiku had to rewrite to `if (.decisions // [] | map(.id) | index($new.id)) != null then ... else .decisions += [$new] end` to make AC-2 (renderer cardinality) test pass.
- Trap installation `trap 'rm -f "$TMP"' EXIT INT TERM` fails under `set -u` when 5b corrupt-target path exits before TMP is set ("unbound variable" from trap firing on exit). Haiku added `[ -n "$TMP" ] &&` guard.

### Bar B verdict

Static scan: PASS (1 advisory weasel F5). Structural scan: PASS. Branch-coverage scan: PASS. Live probe: **FINDINGS** (1 BLOCKING F6, 1 advisory F7). Per `bars/haiku-executable.md` a "could-proceed=YES after fix" outcome routes the fix back to PLAN (not full re-run of phases 1-5). Once PLAN:83 is patched, the probe does not need to re-run; the static + structural + branch-coverage scans all passed clean.

---

## 6. Findings Summary

### BLOCKING

**F1.** **AC-12 greps the wrong string and cannot detect the D-9 substitution it claims to verify** [Phase 1: assumption A8; Phase 5: alpha readiness contract]
The plan's AC-12 says: "static grep `grep -c 'decision-log/record.sh' .claude/skills/cfn-megaplan/SKILL.md` direct-call at line 215 has been REPLACED by cfn-decisions/record.sh". Evidence from `sed -n '215p' .claude/skills/cfn-megaplan/SKILL.md` piped to `grep -c 'decision-log/record.sh'` returns **0** today, BEFORE any edit. The string `decision-log/record.sh` does not appear at line 215. The actual replaced token is `cfn-decide` (the skill name; verified: `sed -n '215p' ... | grep -c 'cfn-decide'` returns **1** today). The AC as written provides false assurance: it returns 0 before AND after the substitution, so it cannot detect whether D-9 landed. PLAN B.4 step "the prior direct `decision-log/record.sh` call at line 215 is GONE" repeats the same mischaracterization.
**Why it matters:** the D-9 substitution is the highest-risk edit in the plan (the only site that mutates existing coordinator prose, per ARCH [OPEN-A]). A test that cannot detect the substitution defeats the safety bar. An implementer following AC-12 literally will think they have verified the substitution when they have not.
**Recommendation:** PATCH AC-12 (and PLAN B.4 done-predicate prose) to grep for the actual replaced string. Replace the AC-12 static-grep clause with: "`grep -c 'cfn-decide' .claude/skills/cfn-megaplan/SKILL.md` returns a count strictly less than its pre-edit value (the line-215 occurrence is gone; lines 66, 300, 341, 372, 471 still reference the L3 phase skill and remain) AND `grep -c 'cfn-decisions/record.sh' .claude/skills/cfn-megaplan/SKILL.md` >= 1 (the new canonical recorder is named)." PATCH the PLAN B.4 done-predicate to match. Re-bless the manifest at Bar A exit (the bless-verify sidecar will move; OPS §3 Stage 1 promote gate catches this).

### advisory (GAP)

**F2.** **D-9 leaves megaplan/SKILL.md internally inconsistent on recording routing** [Phase 2: dependency trace]
Line 215 (substituted by D-9): "Record every resolved decision via `.claude/skills/cfn-decisions/record.sh`" (BLOCKING [OPEN] mid-level resolutions). Line 300 (untouched): "Record it to the decision log via `cfn-decide` like any other resolved fork" (Step 7 deferred-decision batch accepted-defaults). After Lane B lands, megaplan/SKILL.md will document TWO recording paths in the same file without explaining why two are needed. The plan does not address line 300.
**Why it matters:** an implementer reading the post-edit SKILL.md will not know which path applies to which class of decision. Over time, well-meaning edits may collapse them inconsistently.
**Recommendation:** PATCH OPS §3 or PLAN Lane B step B.4 to add a one-sentence note at line 300 (or in the new line-215 sentence) clarifying scope: "Mid-level BLOCKING [OPEN] resolutions route through `cfn-decisions/record.sh` (per-run JSON + SQLite dual-write); Step 7 accepted-default resolutions continue to route through `cfn-decide` (planning/DECISIONS_<slug>.md register + SQLite via cfn-decide Phase 5)." This is a doc-consistency patch, not a behavior change.

**F3.** **PLAN D.1 doc step overstates D-9 scope** [Phase 2: dependency trace]
The feature-status.md row proposed in step D.1 says: "`cfn-decisions/record.sh` is the canonical recorder for run-scoped decisions; decision-log remains the SQLite expert." The phrase "canonical recorder for run-scoped decisions" is broader than the actual D-9 substitution (which is one sentence at one site, substituting `cfn-decide` for `cfn-decisions/record.sh` at line 215). cfn-decide still owns the `DECISIONS_<slug>.md` register and is referenced at megaplan/SKILL.md lines 66, 300, 341, 372, 471.
**Why it matters:** future readers of feature-status.md will believe cfn-decide has been demoted globally when in fact it still owns the planning-scope register.
**Recommendation:** PATCH step D.1 proposed text to: "`cfn-decisions/record.sh` is the canonical recorder for per-run JSON artifacts at coordinator decision points (D-9: replaces cfn-decide routing at megaplan L3 BLOCKING [OPEN] resolution); `cfn-decide` remains canonical for the planning-scope DECISIONS_<slug>.md register."

### advisory (EDGE CASE)

**F4.** **EC-6 lost-update semantics for distinct-id concurrent writes are not covered** [Phase 4: edge case]
AC-49 / `tests/41-concurrency-race.sh` asserts last-writer-wins for two writers targeting the SAME id. ARCH §10.5 paragraph 2 claims "the LOSING writer's field values are silently overwritten" but assumes same-id. For two writers targeting DIFFERENT ids under real parallelism (e.g. two Phase 5 batches resolving concurrently), the second writer's READ may precede the first writer's MV, causing the first writer's INSERT to be lost entirely. This is lost-update, not last-writer-wins.
**Why it matters:** the actual concurrency guarantee is weaker than the plan claims. Under real coordinator parallelism (which the plan acknowledges is itself a bug per R2), distinct-id decisions could silently drop.
**Recommendation:** Add ONE row to the TEST plan (advisory; does not need to gate the build): assert that under two concurrent writers for distinct ids, the final file contains BOTH entries. If the test fails, document the lost-update semantics in ARCH §10.5 explicitly. Realistically the coordinator serializes decisions (one at a time per resolved item per Phase 4.2/5/5E.4 dispatch), so this is a documentation gap not a correctness gate. Mitigation if it ever matters: a coordinator-level lock per slug (one writer invocation at a time per slug), as ARCH §10.5 already notes.

### advisory (BAR B quality)

**F5.** **Produce-consume gate token-shape errors and weasel "etc." in plan prose** [Phase 5.6: Bar B]
The produce-consume scan emits 3 errors + 1 warn on PLAN steps A.6 and A.8 because the "Consumes" column has parenthetical asides like "(LOCKED subprocess; called, never modified)" that confuse the parser into extracting tokens like "never modified)". The haiku static scan flags "etc." on line 53. Neither blocks (gate exit 0 both).
**Why it matters:** token-shape errors make the produce-consume graph unreliable for downstream tooling; the weasel is a documentation-standards miss.
**Recommendation:** PATCH PLAN steps A.6 and A.8 to strip the parenthetical asides from the Consumes column (move them to a footnote or the Done-predicate prose). Replace "etc." on line 53 with a concrete list ("TEST, OPS, ARCH, PSEUDO artifacts in planning/"). Re-run the gates to confirm zero findings.

### BLOCKING (Bar B)

**F6.** **Step 5c jq expression is syntactically invalid; haiku could NOT execute the plan as written** [Phase 5.6: Bar B live probe]
PLAN:83 step 5c specifies the upsert jq expression as: `'(.decisions // []) | map(.id) | index($new.id) as $idx | if $idx != null then .decisions |= map(if .id == $new.id then $new else . end) else .decisions += [$new] end'`. The leading pipeline `(.decisions // []) | map(.id) | index($new.id) as $idx` passes forward an ARRAY OF IDS, not the original object. By the time the `if` branch executes, `.decisions` is out of scope (the input is a number/null, not the wrapper object). The haiku probe implementing this verbatim hit `jq: error (at <stdin>:0): Cannot index number with "decisions"`. Haiku had to rewrite to: `if (.decisions // [] | map(.id) | index($new.id)) != null then .decisions |= map(if .id == $new.id then $new else . end) else .decisions += [$new] end` (move the index calc INTO the condition, preserving object context).
**Why it matters:** a haiku-model implementer copy-pasting PLAN:83 will produce broken code. The Bar B gate ("could a haiku execute this without ambiguity") fails on step 5c as written. This is the load-bearing branch (every subsequent decision that updates an existing id hits 5c; only the first decision per slug hits 5a bootstrap). AC-2 (renderer cardinality stays at 3, not 4) silently breaks if 5c errors and the writer exits 5 leaving the prior file untouched: the renderer then renders the OLD file (cardinality 3 stays 3, but for the WRONG reason: the new decision was never recorded, not because upsert replaced it).
**Recommendation:** PATCH PLAN:83 step 5c jq expression to: `if (.decisions // [] | map(.id) | index($new.id)) != null then .decisions |= map(if .id == $new.id then $new else . end) else .decisions += [$new] end`. Add an OPTIONAL defensive step "after every `jq ... > "$TMP"`, run `jq empty "$TMP"` to validate output before mv" (the probe did this; ARCH §10.5 already implies it but does not state it as a step). No phase re-run needed; this is a verbatim PLAN patch.

### advisory (Bar B)

**F7.** **EXIT trap fires before TMP is set in the 5b corrupt-target branch** [Phase 5.6: Bar B live probe]
PLAN:83 specifies `trap 'rm -f "$TMP"' EXIT INT TERM` installed unconditionally. Under `set -u` (which the writer sets per NFR-1), the 5b branch (existing target corrupt, exit 5) fires the EXIT trap before `$TMP` is assigned, triggering "unbound variable" from the trap itself. Haiku had to use `trap '[ -n "$TMP" ] && rm -f "$TMP"' EXIT INT TERM` to make 5b pass.
**Why it matters:** a subtle bug under `set -u`; the trap fails noisily instead of cleaning up silently. Not strictly blocking because the exit code propagation still works (the writer exits 5 either way), but the noise violates OBS-1's clean-signal contract.
**Recommendation:** PATCH PLAN:83 trap line to `trap '[ -n "$TMP" ] && rm -f "$TMP"' EXIT INT TERM`. One-line change; no phase re-run.

---

## Open Items (return to orchestrator)

- Artifact path: `planning/REVIEW_decisions_ledger.md`
- Finding count by severity: **2 BLOCKING (F1, F6)** / **5 advisory (F2, F3, F4, F5, F7)**
- Alpha-ready: **YES** conditional on F1 + F6 patches (both are PLAN-side prose patches, no phase re-run; F1 is the AC-12 grep-target correction, F6 is the step-5c jq expression). After patches, re-bless the manifest at Bar A exit (the bless-verify sidecar will move; OPS §3 Stage 1 promote gate catches this).
- Bar B verdict: **FINDINGS** (1 BLOCKING F6, 1 advisory F7) per `bars/haiku-executable.md`. Route: PLAN-side patch of step 5c jq + trap line, no phase 1-5 re-run.
- UNTESTED-assumption findings needing user input: **none** (12/12 assumptions verified with pasted evidence)
- Live haiku probe result: **complete** (could-proceed = YES after F6 fix; all other aspects of step A.5 unambiguous)

---

## Haiku probe report (appended)

**Probe agent:** a457cc3d04269f9b7 (model=haiku, ~184s wall, 30 tool uses)
**Scratch artifacts (NOT for production):**
- `/tmp/haiku-probe-upsert.sh` (98 lines, implements `upsert_by_key_atomic` with all 3 branches + smoke self-test)
- `/tmp/haiku-probe-test-*` (probe test fixtures, auto-cleaned by trap)

**Result summary (full agent report):**

(i) **could-proceed:** YES, conditional on F6 fix.

(ii) **ambiguities found:** 2
- CRITICAL (F6): step 5c jq expression syntactically invalid as written. Pipeline strips object context; `.decisions` undefined in conditional. Fix: move index calculation into `if` condition.
- MINOR (F7): trap fires before $TMP set under `set -u` in 5b path. Fix: `[ -n "$TMP" ] &&` guard.

(iii) **verified correct (no ambiguities):**
- Signature, exit codes, error messages, branch coverage
- Bootstrap (5a) creates wrapper satisfying renderer's `section-decisions.sh:23` array-type gate
- Concurrency: POSIX `rename(2)` atomic; same-id last-writer-wins; different-id lost-update (EC-6, acceptable)
- bless-verify.sh:62-66,137-149 pattern reference sufficient

(iv) **recommendations:**
1. Fix step 5c jq expression immediately (F6)
2. Add `jq empty` validation after each `jq ... > "$TMP"` (defensive; ARCH §10.5 implies)
3. Clarify trap installation timing in plan (F7)

**Bar B disposition:** findings route to PLAN patch (F6 + F7). No phase 1-5 re-run. Static + structural + branch-coverage scans all PASS clean.
