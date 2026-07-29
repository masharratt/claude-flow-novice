# Operations Design: decisions-ledger writer for cfn-workbench

**Date:** 2026-07-28
**Tier:** beta (directive: full)
**Spec:** planning/SPEC_decisions_ledger.md
**Arch:** planning/ARCH_decisions_ledger.md
**Data:** N/A (db=no; SPEC build flags `db: no`. The writer owns no schema; SQLite sync delegates to the LOCKED `decision-log/record.sh` sink.)
**Status:** draft

**Scope calibration (load-bearing):** this is a bash CLI skill (`cfn-decisions/record.sh`) plus four coordinator-prose edits. It is NOT a deployed service. There is no HTTP surface, no daemon, no worker, no queue, no database the writer owns. The eight protocol phases below are scaled to that shape: the heavy-ops concerns (full STRIDE per edge, full FMEA, capacity topology, on-call escalation) run at beta-LIGHT per the task drops (`threat_full`, `capacity_full`, `runbook_full` dropped). The phases that matter here are Observability (downstream-consumed by `cfn-test-plan` L7), Rollout (writer-before-hooks sequencing), Metrics (pragmatic, log-line IS the metric), and Rollback Rehearsal (git-revert + rm dir).

**Resolved decisions carried in (authoritative, user-approved 2026-07-28):**
- D-1: new skill `cfn-decisions/` (composition). `record.sh` owns the per-run JSON; SQLite sync delegates to `decision-log/record.sh`.
- D-7: JSON-first, SQLite best-effort. On sink failure the JSON is KEPT and the failure is surfaced (never rolled back).
- D-8: isolate hook failures at ALL 4 coordinator sites. Log + continue. The writer still exits non-zero on its own failures.
- D-9: at SITE 4 (`cfn-megaplan/SKILL.md:215`) the writer REPLACES the direct `decision-log/record.sh` call as the canonical entry. Behavior-preserving for SQLite via composition; additive for JSON.

**Floors forced on (from SPEC):** `secrets_handling`, `no_unscoped_delete`, `pii_if_present`.

---

## 1. Threat Model (STRIDE, beta light)

**Edge inventory.** The writer is a CLI invoked by the trusted coordinator (ARCH §6: single implicit caller, no authN surface, no new trust boundary). The data-flow edges with an external surface are the writer's argv, the filesystem paths it touches, and the `record.sh` subprocess boundary. There is NO HTTP edge, so the security-headers floor (HSTS/CSP/X-Frame-Options via shared middleware) is `n/a: no HTTP surface` (the floor asks, the answer is no surface to protect). No LLM is in the loop (NFR-2 bans Anthropic API calls; the writer makes zero API calls of any kind), so no `--budget=<usd>` cost-safety row is required (Phase 7 records the named-constant perf budget instead).

| Data flow | STRIDE | Threat | Control | Residual |
|---|---|---|---|---|
| Coordinator -> writer argv (`--rationale`, `--alternatives`, all flags) | S | n/a: single trusted caller per ARCH §6 (coordinator + manual invoker EC-12); no authN boundary to spoof | n/a | low |
| Coordinator -> writer argv | T | Caller passes crafted rationale that breaks out of its JSON string slot (EC-13) or injects HTML/SQL (EC-14) | jq `-n --arg/--argjson` escape on every untrusted field (FR-6, OP-W2); renderer html-escapes downstream; sink parameterizes SQL | low |
| Coordinator -> writer argv | I | n/a: no tenant model, no per-tenant data partition (single shared `planning/` dir per project) | n/a | low |
| Writer -> existing `planning/.VERIFY_<slug>.decisions.json` (read for upsert) | T | Attacker-crafted or accidentally-corrupt JSON at the target path could trick the upsert into overwriting unrelated entries or producing a bad merge | `jq empty` validation gate before any mutation (OP-W3 step 4); exit 5 preserves the bad file untouched (E_TARGET_CORRUPT) | low |
| Writer -> new `planning/.VERIFY_<slug>.decisions.json` (atomic write) | T | Partial write observed by a concurrent reader (`section-decisions.sh`, `render.sh`, `test-render.sh`) on crash or disk-full mid-write | mktemp in same dir + POSIX `rename(2)` mv (FR-4, OP-W3 step 5); EXIT/INT/TERM trap removes temp file | low |
| Writer -> `decision-log/record.sh` subprocess (SQLite sync) | T | SQL injection via rationale text passed as one argv token | Sink parameterizes every value (`record.sh` uses sqlite3 bind args, not string concat; EC-14 asserts no table drop) | low |
| Writer -> `decision-log/record.sh` subprocess | R | No audit row written on sink failure (EC-8, EC-10) leaves the JSON/SQLite pair out of sync with no signal | Writer exits 7 or 8 (never 0); hook emits `decisions.ledger id=<id> record FAILED rc=<n> site=<site>` (OBS-4); D-8 logs and continues so the run surfaces the divergence | low |
| Writer -> stdout / stderr / coordinator log | I | Untrusted `rationale` or `alternatives` text leaks to a non-persistence channel (stdout, stderr, `/tmp`, `decisions.ledger` log line) | FR-9 invariant: rationale flows ONLY to JSON + SQLite; stderr carries field NAMES and exit codes, never field VALUES; OBS-5 (FR-9 no-leak) is a floor-grade verify-required signal | low |
| Writer -> `planning/.VERIFY_<slug>.decisions.json` (write) | D | Runaway invocation volume floods the file (EC-15 100 rows, EC-23 1000 rows) | Bounded by coordinator decision rate (human/agent decision speed); NFR-3 p95 < 500ms budget enforced per-row; pagination owned by renderer (LOCKED, out of scope) | low |
| Writer -> `planning/.VERIFY_<slug>.decisions.json` (write) | E | n/a: writer runs as the coordinator's uid; no privilege boundary to elevate | n/a | low |

**Floor check (beta light):** every externally-reachable data-flow edge has at least one STRIDE row above, and S, T, and I are each evaluated per edge (either a control named, or `n/a: <reason>` with the reason stated). The HTTP-headers floor is discharged as `n/a: no HTTP surface` (reason stated; not silently skipped). The `--budget=<usd>` cost-safety floor is discharged as `n/a: no LLM in the loop` (NFR-2). Floor met: yes.

**No hand-rolled crypto/auth/token parsing** (skill rule): the writer does no auth, no token handling, no crypto. The `secrets_handling` floor is enforced structurally (rationale never reaches stdout/stderr/logs) plus the OBS-5 leakage assertion, not by a crypto dep.

---

## 2. Observability

This section is DOWNSTREAM-CONSUMED by `cfn-test-plan` (L7). Every `OBS-n` with `verify: required` becomes an acceptance criterion there. An `[OPEN]` here would be BLOCKING; there are none (all five signals are concrete and assertable in bash).

### 2.1 Log lines (decision points)

Each signal below carries an `OBS-id` (the greppable token `cfn-test-plan` Phase 3 maps to an AC; the Bar A key behind `obs_required_total/obs_required_mapped`), a `criticality` (alert|slo|core-signal|diagnostic), and a `verify` flag (required|exempt: reason). The criticality rule: verify-required iff the signal backs an alert/on-call query, defines a Phase 4 KPI/guardrail, or is the runtime-observed signal of a [core] FR (or, here, backs a floor item per the SPEC floors forced on). Debug logs never owe tests; none of the five signals below is a debug log.

---

**OBS-id:** OBS-1
**event:** `decisions.ledger` (success)
**level:** info
**criticality:** core-signal
**verify:** required
**when:** writer exits 0 after recording a decision at any of the 4 hook sites (Phase 4.2 product-owner, Phase 5 user-batch, Phase 5E.4 quarantine, megaplan L3 decide). Emitted by the `cfn-decisions-hook` wrapper (ARCH §3 happy path, line 232), not by the writer itself.
**fields:** `id=<decision-id> status=<proposed|accepted|superseded>`
**shape:** `decisions.ledger id=<DEC_ID> status=<STATUS>\n`
**PII:** none. The line carries id and status only. Per FR-9 / OBS-5, `rationale` and `alternatives` NEVER appear in this line.
**asserts:** AC-FR-7 (loop auto-captures resolved decisions); AC-FR-9 (no rationale leak).
**bash assertion pattern:** `grep -E "^decisions\.ledger id=[^ ]+ status=(proposed|accepted|superseded)$" <run-log>` matches once per resolved decision.

---

**OBS-id:** OBS-2
**event:** writer validation failure (stderr)
**level:** error
**criticality:** core-signal
**verify:** required
**when:** writer exits 1 (E_VALIDATION: missing/empty/whitespace required field, FR-3) or 2 (E_CLI_PARSE: unknown flag, missing value, invalid enum, malformed timestamp/iteration/blocking). Emitted by the writer.
**fields:** the offending field NAME (e.g. `title`, `actor`); the exit code is implicit in `$?`.
**shape (one of):**
- `missing required field: <fieldname>` (exit 1)
- `unknown arg: <arg>` (exit 2)
- `<fieldname> must be <constraint>` (exit 2, e.g. `actor must be human|ai`)
- `iteration must be a non-negative integer` (exit 2)
- `timestamp must be ISO 8601 UTC like 2026-07-28T14:00:00Z` (exit 2)
**PII:** none. FR-3 / FR-9 invariant: stderr carries field NAMES and constraints, NEVER field VALUES. A validation failure for `--chosen ""` must NOT echo the supplied `--slug` or `--title` values.
**asserts:** AC-FR-3 (refuse on missing field, no modification); AC-FR-10 (defaults applied and actor validated); contributes to AC-FR-9.
**bash assertion pattern:** invoke writer with `title=""`; assert `$? -eq 1`; assert `grep -q "missing required field: title" <stderr>`; assert the supplied `--chosen` value does NOT appear in stderr.

---

**OBS-id:** OBS-3
**event:** SQLite-sync failure (writer stderr)
**level:** error
**criticality:** core-signal
**verify:** required
**when:** writer reaches OP-W4 (SQLite delegation) and either (a) `decision-log/record.sh` is not on PATH (EC-10, exit 7), or (b) `record.sh` exits non-zero (EC-8: SQLite busy, disk full at SQLite layer, sink-internal validation; exit 8). D-7: in both cases the JSON write is ALREADY COMMITTED and is NOT rolled back. Emitted by the writer.
**fields:** the sink exit code (for EC-8); the target path the JSON was persisted to; the site is NOT in the writer's stderr (the site is a hook property, surfaced in OBS-4 instead).
**shape (one of):**
- `record.sh missing; JSON persisted at <target>; SQLite sync skipped` (exit 7)
- `record.sh failed exit=<n>; JSON persisted at <target>; SQLite out of sync` (exit 8)
**PII:** none. FR-9 invariant: the rationale is NEVER echoed in either shape. The sink's own stderr (if it printed the rationale) is suppressed by the writer's `2>/dev/null` redirect on the sink subprocess (OP-W4 implementation choice), because the writer cannot guarantee the sink honors FR-9.
**asserts:** AC-FR-5 (delegate to record.sh) on the happy path; EC-8 / EC-10 behavior; D-7 (JSON kept on sink failure).
**bash assertion pattern (EC-8):** pre-load `record.sh` with a stub that exits 17; invoke writer; assert `$? -eq 8`; assert `grep -qE "^record\.sh failed exit=17; JSON persisted at " <stderr>`; assert `jq -e '.decisions[]|select(.id=="<id>")' <target>` succeeds (JSON kept).

---

**OBS-id:** OBS-4
**event:** hook isolation warning (D-8)
**level:** warn
**criticality:** core-signal
**verify:** required
**when:** writer exits any non-zero code (1, 2, 3, 4, 5, 7, 8) at any of the 4 hook sites. The `cfn-decisions-hook` wrapper (OP-H1) catches the non-zero via `record.sh ... || RC=$?`, emits this line to stderr, and returns 0 so the coordinator continues (D-8). Emitted by the hook wrapper, not the writer.
**fields:** the decision id, the writer's exit code, the site id.
**shape:** `decisions.ledger id=<DEC_ID> record FAILED rc=<N> site=<SITE_ID>\n` where `<SITE_ID>` is one of `phase-4.2-po` | `phase-5-batch` | `phase-5E.4-quarantine` | `megaplan-L3-decide`.
**PII:** none. id only (no rationale, no field values).
**asserts:** D-8 isolation at all 4 sites; AC-FR-7 (a non-zero writer exit does NOT abort the task run); FR-7 "the writer itself still exits non-zero on failure" (the wrapper preserves the code in the log line; it does not swallow it silently).
**bash assertion pattern:** run the writer with a missing field at each site fixture; assert the coordinator log contains `decisions.ledger id=<id> record FAILED rc=1 site=<site_id>`; assert the coordinator proceeds past the site (the post-site phase marker appears in the log).

---

**OBS-id:** OBS-5
**event:** FR-9 no-leak invariant (negation signal)
**level:** n/a (this is a content invariant, not an emitted event)
**criticality:** core-signal
**verify:** required (FLOOR-GRADE; the `secrets_handling` + `pii_if_present` floors are enforced here)
**when:** this signal asserts an ABSENCE across every other channel. It is verified by injecting a unique marker into `--rationale` and confirming the marker appears ONLY in the two persistence targets.
**fields:** the injected marker (test-only; e.g. `secret-marker-ZZY-12345`).
**shape (negation; assert each is empty):**
- stdout of the writer process
- stderr of the writer process
- any file under `/tmp/` (recursive grep)
- the `decisions.ledger` log line (regex `^decisions\.ledger id=[^ ]+ status=[^ ]+$`, no marker)
- the hook isolation warning (OBS-4) line
**asserts the ONLY repositories containing the marker are:**
- `planning/.VERIFY_<slug>.decisions.json` (primary artifact)
- the SQLite `decisions` table (via `decision-log/decisions.sh show`)
**PII:** the test marker IS the synthetic PII surrogate; a real `rationale` may contain PII and the invariant ensures it cannot exfiltrate via logs/stdout/stderr.
**asserts:** AC-FR-9 (rationale never leaks); floors `secrets_handling`, `pii_if_present`.
**bash assertion pattern (encode verbatim from ARCH §10.4):**
```
MARK="secret-marker-ZZY-12345"
writer --slug t --id D1 --title T --chosen C --actor human --rationale "$MARK" 2>wstderr >wstdout
[ $? -eq 0 ] || fail
grep -qF "$MARK" wstdout && fail          # stdout clean
grep -qF "$MARK" wstderr && fail          # stderr clean
[ -z "$(grep -rF "$MARK" /tmp 2>/dev/null)" ] || fail   # /tmp clean
grep -qF "$MARK" planning/.VERIFY_t.decisions.json   # JSON has it
decision-log/decisions.sh show --slug t --id D1 | grep -qF "$MARK"   # SQLite has it
```

---

### 2.2 Metrics

The skill's metric table assumes a Prometheus-style surface. This skill has no metrics endpoint and needs none: the OBS-1 log line IS the metric, and the per-run count is derived from the JSON file the writer produces. One derived metric is named for completeness; the rest are observability signals already covered by OBS-1 through OBS-5.

| OBS-id | Metric | Type | Labels | SLO / use | Criticality | Verify |
|---|---|---|---|---|---|---|
| OBS-6 | `decisions_captured_per_run` | gauge (derived) | slug, site | KPI: every resolved decision at a named firing point produces exactly one JSON entry (Phase 4 KPI-1). Derived: `jq '.decisions \| length' planning/.VERIFY_<slug>.decisions.json`. Cross-check: count of OBS-1 lines in the run log should match. | slo | required |
| OBS-7 | `decisions_sink_sync_divergence_total` | counter (derived) | slug | Guardrail: JSON/SQLite row-count mismatch (D-7 caveat: divergence is itself a signal). Derived: abs(JSON count - SQLite count via `decisions.sh list --slug <slug> \| wc -l`). | alert | required (a non-zero value is the trigger to investigate OBS-3 / OBS-4 in the run log) |

OBS-1 (success) and OBS-3 (sink failure) and OBS-4 (hook isolation) are themselves the raw events from which OBS-6 and OBS-7 are derived. There is no separate counter emission; the test plan asserts the derived values from the JSON file and the run log directly.

**Debug logs owed no tests:** none exist. The writer emits stdout (`<id> <status>\n` on success per ARCH §3 line 228) and stderr (the OBS-2/OBS-3 shapes); both are load-bearing signals, not debug noise.

### 2.3 Traces

Not applicable for a bash CLI invoked synchronously by the coordinator. The "span" is one writer invocation; its boundaries are the argv in and the exit code + stdout out. The OBS-1 log line is the trace endpoint for the coordinator (one line per resolved decision, greppable by `id`). The writer does not emit span metadata and adding a span format would be over-engineering for a CLI whose total runtime is bounded by NFR-3 (p95 < 500ms).

The one place where a "slow stage" attribution matters is OP-W4 (the `record.sh` subprocess round-trip). The writer does not currently time OP-W4 internally. A spike in writer p95 would be attributed to the sink by running `time decision-log/record.sh ...` directly with the same argv; the writer does not need to instrument this proactively (PARKED §3: hook-site `timeout` wrapper is the reactive mitigation if sink latency is observed to spike).

### 2.4 On-call query

Scenario: "did run `<slug>` capture every resolved decision, and did any fail to sync to SQLite?" The literal query, run from the project root after the run:

```bash
# 1. Count decisions captured in the per-run JSON.
JSON_COUNT=$(jq '.decisions | length' planning/.VERIFY_<slug>.decisions.json)

# 2. Count decisions the coordinator logged as captured (OBS-1 success lines).
LOG_COUNT=$(grep -cE "^decisions\.ledger id=[^ ]+ status=(proposed|accepted|superseded)$" <run-log>)

# 3. Count decisions the coordinator logged as FAILED (OBS-4 isolation lines).
FAIL_COUNT=$(grep -cE "^decisions\.ledger id=[^ ]+ record FAILED rc=[0-9]+ site=" <run-log>)

# 4. Count decisions the SQLite register has for this slug (D-7 cross-check).
SQLITE_COUNT=$(decision-log/decisions.sh list --slug <slug> | wc -l)

# Expect: JSON_COUNT == LOG_COUNT (every captured decision logged exactly once).
# Expect: FAIL_COUNT == 0 on a clean run; if non-zero, grep the same log for
#         "record.sh failed exit" (OBS-3 writer-side) to see whether it was a
#         sink-missing (rc=7) or sink-non-zero (rc=8) failure.
# Expect: SQLITE_COUNT == JSON_COUNT. If they diverge, D-7 says JSON is
#         authoritative; the divergence is the signal (OBS-7) that the sink
#         was unavailable for some records and re-running the writer for
#         those (slug, id) pairs will upsert idempotently.
```

This query is the deliverable, not a suggestion. The test plan turns each `Expect:` line into a bash assertion.

---

## 3. Rollout

**Feature flag:** none. Per the task directive and ARCH §8, the hook insertions are unconditional at the 4 sites (FR-7: "There is no 'skip if quiet' path"). The D-8 isolation contract means a hook call to a missing or broken writer is logged and the loop continues, so a feature flag is not required for safety. The kill-switch is `git revert` of the four coordinator-prose commits (Phase 6 step 1).

**Sequencing (load-bearing):** the writer ships FIRST and is tested standalone BEFORE any coordinator hook edit lands. Reason: a hook call to a missing or broken writer is the exact failure mode D-8 isolates. Shipping the writer first means the hooks never fire against an absent or untested writer during the interim between the writer commit and the hook commit. The four hook edits land as a single follow-up commit (or four small commits in the same PR) after the writer is green.

| Stage | What lands | Dwell | Promote when (binary) |
|---|---|---|---|
| 1. Writer + tests | `.claude/skills/cfn-decisions/record.sh`, `.claude/skills/cfn-decisions/SKILL.md`, `.claude/skills/cfn-decisions/tests/*.sh` (AC-FR-1..FR-6, FR-8..FR-10, EC-1..EC-24 scoped) | n/a (standalone) | All writer-scoped tests pass: `bash .claude/skills/cfn-decisions/tests/run-all.sh` exits 0; writer is callable manually with valid args and produces a valid `.VERIFY_<slug>.decisions.json` (OBS-1 source observable); writer invoked with a missing field exits 1 with the OBS-2 stderr shape; writer invoked with a stubbed-failing `record.sh` exits 8 with the OBS-3 stderr shape; FR-9 no-leak pattern (OBS-5) passes. |
| 2. Hook edits | `cfn-loop-task.md` (3 sites: Phase 4.2, Phase 5 batch, Phase 5E.4 quarantine) + `cfn-megaplan/SKILL.md` (1 site: L3 decide). Four surgical prose+snippet insertions per ARCH §3 anchors. | n/a (single commit) | The 4 target files each contain the writer invocation (cfn-test-plan Phase 3 will grep these files for `cfn-decisions/record.sh`); a manual coordinator dry-run at each site produces one OBS-1 line per resolved decision; D-8 isolation verified by forcing a writer failure at each site and confirming OBS-4 fires and the coordinator proceeds. |
| 3. End-to-end verify | A real loop-task run (or a megaplan run for SITE 4) reaches a decision point and resolves it. | one full run | The run's `planning/.VERIFY_<slug>.decisions.json` contains an entry whose `id` and `status` match a resolved decision in the run; the run log contains the matching OBS-1 line; `JSON_COUNT == LOG_COUNT` per the on-call query (§2.4); `SQLITE_COUNT == JSON_COUNT` (or, if divergent, OBS-3/OBS-4 explains every divergence). |

**Security floor (HTTP headers):** `n/a: no HTTP surface`. The writer is a CLI; the rollout adds no route, so there is no new route to bypass the shared security-headers middleware. The floor is discharged by stating the absence (not by silently skipping).

**cfn-canary wired:** `n/a: not a deployed service`. There is no URL to poll; Stage 3's end-to-end run is the closest analogue and is itself the canary (a clean run with matching counts is the binary go/no-go).

---

## 4. Success Metrics / KPIs

Tests-pass is not feature-works. The prod-shape query that proves the writer did its job:

| KPI | Definition (query) | Target | Window | Maps to SPEC criterion |
|---|---|---|---|---|
| KPI-1 | Captured-decisions parity. `jq '.decisions \| length' planning/.VERIFY_<slug>.decisions.json` equals the count of resolved decisions the coordinator made at the 4 named firing points (counted from the run log's AskUserQuestion resolutions + product-owner verdicts + quarantine classifications). | equal (every resolved decision produces exactly one JSON entry) | per run | FR-7 [core] |
| KPI-2 | SQLite parity. `decision-log/decisions.sh list --slug <slug> \| wc -l` equals the JSON count. | equal (or, if divergent, every divergence is explained by an OBS-3/OBS-4 line in the run log) | per run | FR-5 [core] (best-effort per D-7) |
| Guardrail: rationale leakage | `grep -rF "<test-marker>" /tmp` plus stdout/stderr/run-log audit per OBS-5. | zero matches outside the two persistence targets | per test invocation | FR-9 (floors `secrets_handling`, `pii_if_present`) |
| Guardrail: writer p95 latency | `time` over 100 single-row writer invocations (EC-15). | p95 < 500ms | per test run | NFR-3 |
| Guardrail: no DELETE in writer surface | `grep -nE "\bDELETE\b\|rm[[:space:]]+-[rf]*f?" .claude/skills/cfn-decisions/record.sh` plus `record.sh --help` audit. | zero matches | per commit | FR-8 (floor `no_unscoped_delete`) |

Every SPEC success criterion (FR-1 through FR-10) has at least one KPI or guardrail above. No `[OPEN]` for an unmeasurable criterion.

**Specifically NOT a KPI:** "SQLite row count grows monotonically." The writer is upsert-by-key (FR-2), not append-only, so the SQLite row count for a slug can stay flat across a run that captures many decisions (re-resolutions of the same `(slug, id)` replace, not append). Treating row-count growth as a KPI would be a category error and would mask the SM-4..SM-9 transition semantics.

---

## 5. Failure Modes (beta light)

Per ARCH §7 inventory, scoped to the dependencies the writer actually has. Beta-light shape: name the down-behavior, the timeout budget, the fallback.

| Dependency | Down behavior | Timeout budget | Fallback |
|---|---|---|---|
| `planning/` directory (filesystem) | Writer exits 4 (E_FILESYSTEM). No file at target path. Original file (if any) unchanged. Temp file removed via EXIT trap. | none (mv is atomic; if it blocks, retrying masks a fundamental problem) | Coordinator re-invokes the writer (idempotent upsert). If the dir is permanently RO, OBS-4 fires at the hook site and the run continues (D-8); the JSON entry is missing for that decision, surfaced by KPI-1 parity check. |
| `decision-log/record.sh` subprocess (SQLite sync) | (a) Missing from PATH: writer exits 7 (E_SINK_MISSING). JSON already committed. (b) Exits non-zero (SQLite busy / disk full at SQLite layer): writer exits 8 (E_SINK_NONZERO). JSON already committed. | none in the writer (PARKED: hook-site `timeout 30s` wrapper is the reactive mitigation if sink latency spikes; not added proactively). A hung sink would hang the coordinator hook indefinitely; D-8 does not cover indefinite hangs. | D-7: JSON is the primary artifact and is KEPT. Coordinator re-runs the writer for the same `(slug, id)`; idempotent upsert in both JSON and SQLite means the retry is safe. SQLite eventually catches up on a successful retry. |
| Existing `planning/.VERIFY_<slug>.decisions.json` (target file state) | Writer exits 5 (E_TARGET_CORRUPT) if the existing file fails `jq empty`. The bad file is PRESERVED for inspection (not overwritten). | none | Operator investigates the corrupt file manually. The writer refuses to overwrite; the JSON entry for this run is missing until the file is repaired or moved aside. OBS-4 fires at the hook site; run continues. |
| `jq` binary (writer dependency) | Writer startup checks `command -v jq` and refuses with exit 2 if absent (mirrors `bless-verify.sh:60`). No file modified. | none | Operator installs jq. The renderer (`section-decisions.sh`) already requires jq, so any environment running the renderer has jq; this is a defensive check, not an expected failure mode. |
| `record.sh` subprocess hang (sqlite lock contention) | Writer does NOT time out the sink. The coordinator hook site blocks indefinitely. | none in the writer | See PARKED item §3. Reactive mitigation: wrap the writer call with `timeout 30s` at each hook site if sink latency spikes are observed in canary. Not added proactively (no history of sink hangs; adds 4 magic-number sites to maintain). |
| Concurrent writers (EC-6, two writers for same `(slug, id)`) | Both compute their ENTRY independently; both run `jq > $TMP`; both `mv $TMP $TARGET`. POSIX `rename(2)` is atomic on the same filesystem, so one mv lands last and wins. The losing writer's TMP is removed by its own EXIT trap. | none | Last-writer-wins. The writer does NOT detect the race (EC-6 accepts this; two parallel resolutions of the same id is itself a coordinator bug). JSON and SQLite stay consistent under the race (both use the same semantics). |

**Timeout budget sum check (skill rule):** the writer has no cascading timeouts (each external call has `none`). NFR-3 caps the total writer invocation at p95 < 500ms; the only sub-step that can realistically approach that budget is OP-W4 (the `record.sh` subprocess). A hung sink violates NFR-3 in the hung case (no timeout) and is the PARKED mitigation above. There is no cascade to blow.

---

## 6. Rollback Rehearsal

**Trigger:** KPI-1 parity breach (decisions resolved at the 4 sites do not match the JSON count) OR OBS-4 spike across runs (writer failures at hook sites exceed an acceptable rate, e.g. > 5% of decisions over a week) OR a correctness regression in the writer (a test that previously passed now fails).

**Tested undo steps:**

1. **Revert the four coordinator-prose edits.** `git revert <commit>` for the commit(s) touching `.claude/commands/cfn-loop-task.md` (3 sites) and `.claude/skills/cfn-megaplan/SKILL.md` (1 site). If the four hook edits landed in one commit, this is a single revert; if four commits, four reverts.
   - **Verifies clean:** `grep -rn "cfn-decisions/record.sh" .claude/commands/cfn-loop-task.md .claude/skills/cfn-megaplan/SKILL.md` returns zero matches. A subsequent loop-task run reaches a decision point and emits NO `decisions.ledger` line (the hook is gone; the run behaves identically to its pre-feature state).

2. **Remove the `cfn-decisions` skill directory.** `rm -rf .claude/skills/cfn-decisions/`.
   - **Verifies clean:** `ls .claude/skills/cfn-decisions/` fails (directory absent). `command -v` for the writer returns nothing. The writer's tests no longer exist (they lived under the removed dir).

3. **Stale per-run JSON files are INERT, leave them alone.** `planning/.VERIFY_<slug>.decisions.json` files written before the rollback remain valid JSON. The renderer (`section-decisions.sh`) is LOCKED and already shipped; it treats a missing file as the normal empty state (lines 22-27: "No decisions logged for this run.") and treats a present file as a populated list. Leftover JSON files cause no harm: the renderer still renders them (historical record), but no writer exists to mutate them further. Optionally delete them per slug if a clean slate is desired; the writer's no-delete invariant (FR-8) does not apply to manual cleanup outside the writer.
   - **Verifies clean:** `section-decisions.sh <slug>` runs without error on a stale JSON file (the renderer's existing behavior; not a regression). No new writes occur (the writer is gone).

4. **SQLite rows persist (durable register, NOT rolled back).** The `decisions` table rows written by `decision-log/record.sh` (the LOCKED sink, not the writer) remain. They are an audit trail owned by the `decision-log` skill (separate concern, separate lifecycle per SPEC §6 and resolved finding #5). The rollback does NOT touch `~/.claude/decision-log/decisions.db`.
   - **Verifies clean:** `decision-log/decisions.sh list --slug <slug>` still returns the rows written before the rollback. `sqlite3 ~/.claude/decision-log/decisions.db "SELECT count(*) FROM decisions WHERE slug='<slug>'"` is unchanged by steps 1-3.

**Data safety:** the rollback deletes NO data. Step 1 is a code revert (no data). Step 2 removes a skill dir (no user data; the writer's own source). Step 3 explicitly leaves JSON files in place. Step 4 explicitly leaves SQLite rows in place. There is no `DELETE`, no `TRUNCATE`, no `rm` of `.VERIFY_*.decisions.json` files, no `DROP TABLE`. The test-database safety floor (no unscoped DELETE) is met trivially because the rollback issues no DELETE at all.

**Rehearsal evidence (reasoning trace, no staging):** this is a skill, not a deployed service; there is no staging environment to dry-run against. Each step above is reversible and individually verifiable with the literal commands shown. Step 1 is the canonical CFN rollback (per global CLAUDE.md: "Rollback: use backup scripts, NOT `git checkout`" - here `git revert` is the named mechanism because the change IS a set of commits, not a file-level edit with a backup hook). Steps 2-4 are independent and idempotent: doing them out of order is safe (e.g. removing the skill dir before reverting the hook edits just means the hook sites reference a missing writer for the interim, which is the D-8-isolated state the system is designed to survive).

**No `cfn-migration-rehearsal` invocation:** the `db` build flag is `no` (the writer owns no schema; the SQLite schema lives in the LOCKED `decision-log` sink). Phase 6's executable-rehearsal branch does not apply. Reasoning-only evidence is acceptable here because there is no migration to rehearse, not because a scratch DB is unavailable.

---

## 7. Capacity / Cost (beta light)

**No LLM in the loop.** NFR-2 bans Anthropic API calls and the writer makes zero API calls of any kind. The `--budget=<usd>` cost-safety floor is discharged as `n/a: no LLM in the loop` (reason stated, not silently skipped).

**Named-constant budget rows (beta floor: at least one):**

| Resource | Budget / cap | Bottleneck at | Cost / call |
|---|---|---|---|
| Writer execution latency (NFR-3) | p95 < 500ms per single-decision write, including the `record.sh` subprocess round-trip. The named constant is `WRITER_LATENCY_P95_MS=500` (asserted in the writer's perf test, EC-15 100-row volume). | Sink subprocess round-trip (OP-W4); `jq` over a growing file at EC-23 scale (1000 entries). | zero (bash + jq + sqlite3; no per-call cost) |
| Per-run JSON file size (EC-23) | 1000 entries at ~1 KB per entry ~ 1 MB per `.VERIFY_<slug>.decisions.json`. The named constant is `MAX_DECISIONS_PER_RUN=1000` (advisory; the writer does not enforce a hard cap, but the renderer paginates and the perf test asserts p95 holds at this scale). | Renderer pagination (LOCKED, out of scope); writer p95 at large N. | zero |
| SQLite row count | Bounded by the coordinator's decision rate per run. Each row is ~1 KB. No hard cap. | Disk space at `~/.claude/decision-log/decisions.db`. | zero |

**Scaling unit:** one writer invocation per resolved decision. The rate is bounded by the coordinator's decision speed (human/agent decision time, not machine time). There is no RPS to speak of; the writer is not in a hot loop.

**Topology skipped (dropped: `capacity_full`).** The writer runs wherever the coordinator runs (WSL2 bash); there is no separate deployment topology to document.

---

## 8. Runbook (beta light, dropped: `runbook_full`)

Symptom to first action. Each row ties to a Phase 2 signal or a Phase 6 trigger.

| Symptom | First action |
|---|---|
| KPI-1 parity breach: run log shows more resolved decisions than `.VERIFY_<slug>.decisions.json` contains entries. | Run the §2.4 on-call query. If `FAIL_COUNT > 0`, grep the run log for `record FAILED rc=` (OBS-4) and `record.sh failed exit=` (OBS-3) to see which decisions failed. Re-run the writer manually for each missing `(slug, id)` (idempotent upsert): `.claude/skills/cfn-decisions/record.sh --slug <slug> --id <id> ...`. |
| OBS-4 spike across runs (writer failures at hook sites exceed ~5% of decisions over a week). | Triage by exit code. rc=1/2 (validation/parse) spike means a caller bug (the coordinator is passing bad argv at a specific site); grep the run logs for the offending field name in OBS-2 stderr. rc=7 spike means a deployment problem (`record.sh` missing from PATH in some environment). rc=8 spike means a sink-side problem (SQLite busy / disk full); coordinate with the `decision-log` skill owner. |
| KPI-2 divergence: JSON count != SQLite count. | D-7 says JSON is authoritative. The divergence is the signal (OBS-7). Identify which `(slug, id)` pairs are in JSON but not in SQLite (diff the two lists); re-run the writer for those pairs. If the divergence persists, the sink is unhealthy (EC-8); escalate to the `decision-log` skill owner. |
| Writer p95 latency > 500ms (NFR-3 breach, observed in perf test or in real runs). | Attribute the slow step. If OP-W4 (`record.sh` subprocess) dominates, the sink is the bottleneck; consider the PARKED hook-site `timeout 30s` wrapper (§3). If OP-W3 (jq over the existing JSON) dominates at large N, the file has grown past EC-23 scale; archive the old entries (manual; the writer does not delete) or split the slug. |
| Existing `.VERIFY_<slug>.decisions.json` fails `jq empty` (E_TARGET_CORRUPT, exit 5). | The writer preserved the bad file. Move it aside (`mv planning/.VERIFY_<slug>.decisions.json planning/.VERIFY_<slug>.decisions.json.corrupt-<ts>`), investigate the cause (most likely a partial write from a pre-FR-4 codepath or an external editor), and re-run the writer for the missing decisions. |
| Coordinator hook site hangs indefinitely (no OBS-4 line, run stalled at a decision point). | The `record.sh` sink is hung (sqlite lock contention). This is the PARKED timeout-mitigation case. Kill the stalled writer process; the coordinator hook will then emit OBS-4 with the kill signal's exit code and continue (D-8). Add the reactive `timeout 30s` wrapper at the offending hook site if the hang recurs. |
| Need to undo the feature entirely. | Run the Phase 6 rollback rehearsal. Step 1: revert the 4 hook edits. Step 2: remove the skill dir. Steps 3-4 are no-ops (JSON and SQLite rows persist as audit trail; no data loss). |

**Do NOT:**
- Do NOT `rm planning/.VERIFY_<slug>.decisions.json` to "clean up" without first confirming the rollback (step 1) has landed. The JSON is the renderer's primary input; deleting it on a live system removes the audit trail for that run.
- Do NOT manually `DELETE FROM decisions WHERE slug='<slug>'` in SQLite. The `decisions` table is owned by the `decision-log` skill; manual deletes bypass its invariants and violate the test-database safety floor (unscoped DELETE).
- Do NOT replay OBS-4 failures by re-running the writer in a tight loop. The writer is idempotent; one re-run per missing `(slug, id)` is sufficient. A loop risks hammering a sick sink.
- Do NOT add a `timeout` wrapper to the writer itself (would be a writer-side mitigation of a sink-side problem; ARCH §7 and §4.2 explicitly defer this to the hook site).

---

## [OPEN]

None. The five observability signals (OBS-1 through OBS-5) are concrete and assertable in bash; none carries an unresolved fork. The two derived metrics (OBS-6, OBS-7) are derivable from the JSON file and run log without new instrumentation. The rollout has no feature-flag fork (D-8 isolation discharges the safety requirement that a flag would otherwise cover). The KPIs map 1:1 to SPEC success criteria. The rollback steps are individually reversible and require no scratch DB.

---

## [PARKED]

- **[PARKED: hook-site `timeout 30s` wrapper | deferred: not downstream-consumed by test_plan; reactive mitigation, added only if observed]** The writer does NOT time out the `record.sh` subprocess (ARCH §7). A hung sink hangs the coordinator hook indefinitely; D-8 does not cover indefinite hangs. Default carried: do NOT add a proactive `timeout` wrapper at the 4 hook sites. Reasoning: no history of sink hangs; a magic-number timeout at 4 sites adds maintenance surface; the wrapper is a 1-line fix per site if a hang is observed in canary. Trigger to revisit: any reported coordinator stall at a decision point, OR OBS-4 with a sink-related exit code (7 or 8) trending upward week-over-week. Owned by: rollout mitigation (this artifact §3 and §8 runbook row "Coordinator hook site hangs indefinitely").

- **[PARKED: em dashes in caller-supplied rationale | deferred: caller data is not writer code; SPEC NFR-5 / EC-22]** The writer persists caller rationale verbatim, including em dashes. NFR-5 bans em dashes in the writer's OWN code, comments, SKILL.md copy, and hook prose; caller text is out of scope. Carried from ARCH §10.3 EC-22. Not an ops concern; documented here only because the FR-9 no-leak invariant (OBS-5) means em dashes in caller text are confined to the two persistence targets.

- **[PARKED: SQLite FTS index drift on sink row insertion | deferred: owned by the decision-log sink, not the writer; ARCH §7 row "decision-log-sink (FTS trigger)"]** If `decisions_fts` insertion fails after a `decisions` INSERT succeeds, the SQLite table row exists but the FTS index is out of sync. This is a search-quality degradation in the sink, not a data-loss or writer-correctness issue. The writer surfaces only the sink's exit code (OBS-3); it cannot distinguish a partial sink failure from a full one. Default carried: monitor sink-side search quality at the `decision-log` skill; out of ops scope for this feature.

---

## Floors line

- **STRIDE floor met: YES.** Every externally-reachable data-flow edge has at least one row in §1 with S, T, and I each evaluated (control named, or `n/a: <reason>` with the reason stated). The HTTP-headers floor is discharged as `n/a: no HTTP surface`.
- **Budget floor met: YES.** Two named-constant budget rows in §7 (`WRITER_LATENCY_P95_MS=500`, `MAX_DECISIONS_PER_RUN=1000`), both cited by constant name. The `--budget=<usd>` row is `n/a: no LLM in the loop` (reason stated; not silently skipped).
- **Observability floor met: YES.** Five `verify: required` signals (OBS-1 through OBS-5) plus two derived metrics (OBS-6, OBS-7). Every `[core]` FR (FR-1, FR-2, FR-5, FR-7) and every floor item (`secrets_handling`, `no_unscoped_delete`, `pii_if_present`) has at least one `verify: required` signal backing it.
- **Rollout floor met: YES (scaled).** No feature flag (D-8 isolation discharges the safety requirement). Three-stage rollout with binary go/no-go checks at each stage (writer+tests -> hook edits -> end-to-end verify).
- **Rollback rehearsal floor met: YES.** Four tested undo steps in §6, each with a literal verification command. No DELETE/TRUNCATE/rm of data files; data-safety floor met trivially.
- **Runbook floor met: YES (light).** Seven symptom-to-first-action rows plus a "Do NOT" list, each tied to a Phase 2 signal or Phase 6 trigger.

---

## Return block

```
artifact: planning/OPS_decisions_ledger.md
tier: beta (directive: full; extras: observability, rollout, metrics, rollback_rehearsal; drops: threat_full, capacity_full, runbook_full)
stride_edges_covered: 10 rows (every external edge has >=1 row; S/T/I evaluated per edge; HTTP-headers floor n/a: no HTTP surface)
observability_signals: OBS-1..OBS-5 (all verify: required), OBS-6..OBS-7 derived (verify: required)
rollout: 3 stages (writer+tests -> hook edits -> end-to-end verify); no feature flag (D-8 isolation discharges)
rollback: 4 tested undo steps (git revert 4 hook edits; rm skill dir; JSON files INERT; SQLite rows persist); zero data deletion
success_metrics: 2 KPIs (captured-decisions parity, SQLite parity) + 3 guardrails (FR-9 leakage, p95 latency, no-DELETE)
floors_line: STRIDE floor YES; budget floor YES (2 named constants + n/a: no LLM); observability floor YES; rollout floor YES (scaled); rollback floor YES; runbook floor YES (light)
open_questions_blocking: 0
parked: 3 (hook-site timeout wrapper; em dashes in caller text; SQLite FTS drift owned by sink)
gate: PASS
```
