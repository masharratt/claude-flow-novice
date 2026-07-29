# Decisions Register: decisions-ledger writer for cfn-workbench

**Date:** 2026-07-28
**Phase:** DECISIONS (cfn-decide, MegaPlan L3)
**Tier:** beta (directive: full)
**Spec:** `planning/SPEC_decisions_ledger.md`
**Skill:** `cfn-decide` v1 (per `~/.claude/skills/cfn-decide/SKILL.md`)

Closes the loop on the spec's open questions. Q-1 was pre-resolved by the user
(2026-07-28, option a); this phase records Q-1 to the structured register and
audits the five [PARKED] items (Q-2..Q-6) plus scans for any fork the spec's
triage missed. Tier `full` keeps non-blocking rows in the register (no
alternatives panel; that is an enterprise extra).

## Register

| id | decision | options | tradeoff (plain English) | recommendation | status | rationale |
|----|----------|---------|--------------------------|----------------|--------|-----------|
| D-1 | Where the decisions-ledger writer lives (ownership + JSON shape contract) | (a) new skill `cfn-decisions/` owning per-run JSON + delegating SQLite to `decision-log/record.sh`; (b) extend `decision-log/record.sh` with `--run-ledger <path>`; (c) extend the doc-only `cfn-decide` skill with the writer | (a) keeps the global, reverse-symlinked `decision-log` skill focused on SQLite and free of workbench-specific paths/fields. (b) is DRY but couples a shared skill to a workbench file path. (c) reuses a namespace but blurs `cfn-decide`'s doc-only boundary. | Option (a): new skill `cfn-decisions/` (composition) | RESOLVED | User-approved 2026-07-28. Separation of concerns: `cfn-decisions` owns the run-scoped per-run JSON (`planning/.VERIFY_<slug>.decisions.json`); `decision-log` stays the focused SQLite expert. Avoids coupling the global, reverse-symlinked `decision-log` skill (shared across all projects) to a workbench-specific file path and to workbench-only fields (`actor`, `iteration`) that do not belong in the SQLite schema. Picked over (b) and (c) per spec §7 Q-1. |
| D-2 | Behavior when the SQLite sync (`record.sh`) fails after the JSON write committed | (i) persist JSON (renderer's primary artifact), log `record.sh` exit code to stderr only, exit non-zero; (ii) roll back the JSON write so file and SQLite stay in lockstep | (i) preserves the renderer's primary artifact even when the secondary sink is unhealthy; coordinator sees non-zero exit and can re-run; rationale never echoed (FR-9). (ii) loses the primary artifact on a secondary-sink failure, which is worse for the renderer. | (i) persist JSON, surface SQLite failure via exit code only | RESOLVED (parked) | Non-blocking, spec-internal error-handling detail. Reversal is a single-file edit in the writer's error branch; the coordinator's observable contract (non-zero exit on failure, fail-closed per FR-7) is preserved either way. No downstream phase (arch/data/ux) consumes this. Spec §5 Postconditions and EC-8 already commit to (i). |
| D-3 | Invocation shape: one decision per call vs batch | (i) single decision per invocation, matching `record.sh` semantics; (ii) batch (multiple `(slug,id)` records in one call) | (i) mirrors `record.sh` 1:1, simplifies arg parsing, matches FR-7's "exactly one writer invocation per resolved decision". (ii) reduces subprocess overhead under high volume but adds a new CLI surface and aggregation semantics. | (i) single decision per invocation | RESOLVED (parked) | Non-blocking, writer-internal. Reversal is additive (a future `--batch` flag) and confined to one file. FR-7's coordinator contract (one call per resolved decision) is fixed regardless. NFR-3 p95 < 500ms is per-invocation, so batch is not needed for perf. |
| D-4 | Defaults for optional fields | `iteration=1`, `status=proposed`, `blocking=false`, `timestamp=UTC ISO 8601 now`, `actor` required with no default | Mutually exclusive with making every field required or every field defaulted. `actor` cannot be defaulted (the source of a decision is load-bearing for the audit trail); the others have safe conservative values. | `iteration=1`, `status=proposed`, `blocking=false`, `timestamp=UTC-now`, `actor` required (no default) | RESOLVED (parked) | Non-blocking. Already encoded as hard requirement FR-10, not an open fork. Reversal is a single-file default change. Renderer (LOCKED per OOS §6) projects whatever fields are present; defaults are not renderer-consumed. Recorded so downstream phases see the chosen values as stated assumptions. |
| D-5 | Test framework and location | (i) bash test under the new skill's `tests/` dir (option a from D-1); (ii) bash test under `decision-log/tests/` (option b) | Bash is mandated by NFR-1, so framework is not in play. Location is decided by D-1's outcome: option (a) puts tests in `cfn-decisions/tests/`. | (i) bash test under `cfn-decisions/tests/` | RESOLVED (parked) | Non-blocking. Mechanically determined by D-1's resolution (option a). Reversal is a file move; no schema, contract, or downstream-phase impact. NFR-4 (TDD) governs test presence, not location. |
| D-6 | Whether the writer accepts `--project` override or always defers to `record.sh`'s git-derivation | (i) always defer (auto-derive from `git rev-parse --show-toplevel` basename, matching `record.sh`); (ii) accept `--project` and forward to `record.sh` | (i) keeps the writer thin and matches resolved finding #3 (decision-log owns project derivation). (ii) adds a passthrough for callers that need to override, but no such caller is in scope (coordinator/megaplan always run inside the project repo). | (i) auto-derive via `record.sh`, no `--project` flag on the writer | RESOLVED (parked) | Non-blocking. Default matches `record.sh`'s existing derivation. Reversal is purely additive (forward `--project` to `record.sh`, which already accepts it). No coordinator contract changes. |

## Audit summary

- **Forks extracted:** 6 (1 blocking, 5 non-blocking). 6 RESOLVED, 0 OPEN.
- **Blocking fork (D-1):** pre-resolved by the user 2026-07-28 (option a). Recorded
  to SQLite with `--blocking`.
- **Parked items (D-2..D-6):** all five audited against the blocking litmus
  (schema migration / downstream-consumed contract change / 3+ file edits /
  re-doing data-arch-ux work). None meet the bar. All confirmed non-blocking;
  conservative defaults stand; rationale recorded per row.
- **Alternatives panel:** skipped (tier `beta`, not `enterprise`).
- **Missed-fork scan:** walked all eight Phase-1 categories against the spec
  (auth, sync/async, storage, build-vs-buy, data model, UX, vendor, plus
  NFR/floor coverage). No storage/shape/contract fork left unresolved. The
  slug-regex precondition in SPEC §5 is a caller obligation (not a
  writer-enforced fork); EC-6 last-writer-wins is a consequence of mirroring
  `record.sh`'s `ON CONFLICT DO UPDATE` (already decided by D-1). No newly
  found BLOCKING fork.

## Downstream consumers (per spec §6 + directive)

- **cfn-data:** DROPPED for this plan (`db: no`). No consumption.
- **cfn-arch:** receives D-1 directly (component contract: writer ->
  `record.sh` -> SQLite; writer -> `.VERIFY_<slug>.decisions.json`). D-2..D-6
  are terminal for this pipeline (no arch impact); recorded for the durable
  audit trail.
- **write-plan:** consumes D-1 (file layout: `cfn-decisions/{record.sh,
  SKILL.md, tests/}`), D-4 (FR-10 defaults), D-5 (test location).

## Decision-log sync

Every RESOLVED row written to the SQLite register via
`~/.claude/skills/decision-log/record.sh`:

- D-1: `--blocking` (user-resolved blocking fork).
- D-2..D-6: no `--blocking` (self-resolved non-blocking defaults).

Upsert key is `(project, slug, decision_id)`. Re-running cfn-decide is safe
(no duplicates).

## Footer

Log: `planning/DECISIONS_decisions_ledger.md` (repo) + `decision-log` SQLite
via `record.sh` (RESOLVED rows D-1..D-6). Query:
`decisions.sh list --slug decisions_ledger`.
