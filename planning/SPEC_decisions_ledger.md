# Specification: decisions-ledger writer for cfn-workbench

**Date:** 2026-07-28
**Author:** spec phase (cfn-spec)
**Status:** draft
**Tier:** beta (directive: full)
**Floors forced on:** secrets_handling, no_unscoped_delete, pii_if_present

Closes the gap where the workbench renderer reads `planning/.VERIFY_<slug>.decisions.json`
(`section-decisions.sh:38-51`) but nothing in the repo writes it. Prior art (renderer
contract, SQLite store, mirror-write pattern, hook firing points) is established in the
megaplan research bundle and treated as ground truth by this spec.

## 1. Functional Requirements

FR-1 [core]: The writer SHALL insert a new decision record into
`planning/.VERIFY_<slug>.decisions.json` WHEN invoked with valid `slug`, `id`, `title`,
`chosen`, `actor` and no existing array element matches `(slug,id)`, producing an object
that survives the `section-decisions.sh:38-51` jq TSV projection
(`id`, `actor`, `title`, `chosen`, `rationale`, `alternatives`, `iteration`, `timestamp`,
`status`).

FR-2 [core] [boundary]: The writer SHALL replace the existing array element matching
`(slug,id)` WHEN invoked for an already-recorded `(slug,id)`, preserving the relative
order of every other element (upsert-by-key, NOT append-only), mirroring the SQLite
`UNIQUE(project,slug,decision_id)` constraint. Decisions are ENTITIES that evolve
`proposed`->`accepted`->`superseded`; the writer's mutation model reflects that, in
contrast to `bless-verify.sh`'s append-only event ledger.

FR-3: The writer SHALL exit non-zero AND SHALL NOT modify the existing
`.VERIFY_<slug>.decisions.json` file WHEN any of `slug`, `id`, `title`, `chosen`,
`actor` is missing, empty, or whitespace-only. The error message SHALL name the first
missing field and SHALL NOT echo any supplied field value.

FR-4 [boundary]: The writer SHALL write `.VERIFY_<slug>.decisions.json` atomically
(mktemp in the same directory, then `mv` onto the target) such that no concurrent reader
(`section-decisions.sh`, `render.sh`, `test-render.sh`) ever observes a partial file
under any outcome (success, validation failure, disk error, signal).

FR-5 [core] [boundary]: The writer SHALL delegate SQLite persistence to
`decision-log/record.sh` for every recorded decision, passing identical field values
(`slug`, `id`, `title`, `chosen`, optional `rationale`, `alternatives`, `status`,
`blocking`, `timestamp`), GIVEN `record.sh` is reachable on PATH and exits 0. The
per-run JSON is the primary artifact; the SQLite register sync is best-effort (D-7:
on sync failure the JSON is kept and the failure is surfaced, never rolled back). A
successful writer invocation produces one JSON entry AND one SQLite row with matching
`(slug,id)` and field values (where the schema admits the field; `actor` and
`iteration` are run-scoped and stay JSON-only).

FR-6: The writer SHALL construct every JSON object via jq (`jq -n --arg ...`,
`--slurpfile`, or `*+=` operators) and SHALL NOT assemble JSON by string concatenation,
`echo`, `printf`, or heredoc, so untrusted `rationale` / `alternatives` text cannot
break out of its string slot, inject keys, close the array early, or produce invalid
JSON.

FR-7 [core]: The `cfn-loop-task.md` coordinator flow SHALL invoke the writer at every
decision-resolution point: Phase 4.2 product-owner 2/3 decisions
(`cfn-loop-task.md:405-414`), Phase 5 1/3 user batches (`cfn-loop-task.md:426-439`),
Phase 5E.4 quarantine (`cfn-loop-task.md:535-538`), AND `cfn-megaplan/SKILL.md:215` L3
decide. Every resolved `AskUserQuestion` decision produces exactly one writer
invocation. A non-zero writer exit code is logged by the calling hook, which then
CONTINUES (D-8: the decision-record is an audit side-effect and must not abort the
task run). The writer itself still exits non-zero on failure.
(Runtime signal: the `.VERIFY_<slug>.decisions.json` file gains an entry whose `id`
matches the resolved decision AND the coordinator emits a `decisions.ledger id=<id>
status=<status>` log line.)

FR-8: The writer SHALL NOT issue `DELETE` against `.VERIFY_<slug>.decisions.json`
(file truncation, `rm`, or removal of unrelated entries) or against the SQLite
`decisions` table. The writer CLI SHALL NOT expose a `--delete` flag. All state
evolution (`proposed` -> `accepted` -> `superseded`) is via upsert-by-key and the
existing `--supersede` delegation in `record.sh`. (Floor: `no_unscoped_delete`.)

FR-9: The writer SHALL treat `rationale` and `alternatives` as untrusted free text,
persisting them ONLY to `.VERIFY_<slug>.decisions.json` and (via `record.sh`) to the
SQLite register, and SHALL NOT log, echo, `tee`, or write them to any other location
(stdout, stderr, `/tmp`, sidecar files, coordinator logs). The coordinator's
`decisions.ledger` log line SHALL carry `id` and `status` only, never the rationale.
(Floors: `secrets_handling`, `pii_if_present`.)

FR-10: The writer SHALL accept caller-supplied `iteration` and `actor` values (the two
run-scoped fields absent from the SQLite schema) and SHALL default `iteration=1` when
the caller omits it, SHALL default `status=proposed` when omitted, SHALL default
`blocking=false` when omitted, SHALL default `timestamp` to UTC ISO 8601 now, and SHALL
reject `actor` values outside `{human, ai}` with non-zero exit and no file modification.

## 1a. Actors

Omitted. `frontend: no` AND `db: no` (this plan introduces no new DB schema or
migration; SQLite persistence is delegated to the existing `decision-log/record.sh`,
which owns `schema.sql`). Single implicit caller: the loop coordinator and megaplan
orchestrator. No user surface, no new trust boundaries.

## 1b. Interaction Intent

Omitted. Backend / skill-only build with no user-facing surface (`frontend: no`).
The renderer is locked; the writer is invoked programmatically by the coordinator.

## 2. Non-Functional Requirements

NFR-1: Implementation language is bash + jq only. No `node`, `python`, `ruby`, or any
runtime outside bash+jq in the writer script or its tests (the renderer is bash+jq; the
skill stays in the same runtime to avoid a language seam).

NFR-2: Zero Anthropic API calls in writer code, coordinator hooks, or tests (provider
ban, `~/.claude/CLAUDE.md` Provider Ban section). No `claude -p`, no `anthropic:*`
model references.

NFR-3: Writer execution p95 latency < 500ms for a single-decision write under normal
WSL2 disk I/O, including the `record.sh` subprocess round-trip.

NFR-4: TDD required. Every FR in section 1 has at least one failing test committed
before its implementation (CLAUDE.md TDD Protocol). Tests are bash (matching NFR-1) and
run via `bash <test>.sh` with output captured per prelude rule 3.

NFR-5: Zero em dashes (U+2014, `---`, `&mdash;`) in writer code, comments, SKILL.md
copy, test names, commit messages, or coordinator-hook prose (CLAUDE.md Content
Standards). Em dashes inside caller-supplied rationale text are persisted verbatim
(escape is the renderer's job, `section-decisions.sh`).

NFR-6: Every commit touching this feature SHALL update `readme/feature-status.md`
(entry for the decisions-ledger writer, status=beta) and `readme/state-machines.md`
(decision entity lifecycle: `proposed` -> `accepted` -> `superseded`, transition
triggers). (CLAUDE.md Commit-Time Documentation.)

## 3. Acceptance Criteria

Scenario: AC-FR-1 insert new decision survives renderer projection
  Given planning/.VERIFY_testrun.decisions.json does not exist
  When writer invoked with slug=testrun id=D-01 title="Pick store" chosen="SQLite" actor=human rationale="mature" alternatives="DuckDB" iteration=1 status=proposed
  Then exit code = 0 AND planning/.VERIFY_testrun.decisions.json exists AND `jq -e '.decisions[]|select(.id=="D-01")' planning/.VERIFY_testrun.decisions.json` succeeds AND the matched object has actor="human" AND title="Pick store" AND chosen="SQLite" AND rationale="mature" AND alternatives="DuckDB" AND iteration=1 AND status="proposed" AND timestamp matches ISO 8601 UTC AND `section-decisions.sh testrun` (or the equivalent jq TSV projection at section-decisions.sh:38-51) emits one row whose columns equal those values.

Scenario: AC-FR-2 upsert preserves order, replaces fields
  Given planning/.VERIFY_testrun.decisions.json contains array [D-01, D-02, D-03] (three objects in that id order)
  When writer invoked with slug=testrun id=D-02 title="v2" chosen="X" actor=ai status=accepted
  Then exit code = 0 AND the persisted array has ids in order [D-01, D-02, D-03] AND the D-02 element has title="v2" AND chosen="X" AND actor="ai" AND status="accepted" AND the D-01 and D-03 elements are byte-identical to their pre-invocation values (compare via `jq -S .decisions[]|select(.id=="D-01")` before vs after) AND no fourth element exists.

Scenario: AC-FR-3 refuse on missing required field, no modification
  Given planning/.VERIFY_testrun.decisions.json contains exactly [D-01]
  When writer invoked with slug=testrun id=D-02 title="" chosen="X" actor=human
  Then exit code != 0 AND stderr contains the substring "title" (names the missing field) AND stderr does NOT contain the value "X" AND planning/.VERIFY_testrun.decisions.json is byte-identical to its pre-invocation state AND `record.sh` was not invoked (no SQLite row for D-02).

Scenario: AC-FR-4 atomic write, no partial file observable
  Given writer is invoked against a fresh slug with valid args AND a concurrent reader polls the target path every 10ms during the write
  When the writer runs to completion
  Then every reader sample is EITHER "file does not exist" OR "file exists and `jq empty` succeeds on it"; no sample is "file exists but `jq empty` fails". On forced failure (simulate by making the target directory read-only after mktemp), no `.VERIFY_<slug>.decisions.json` file exists at the target path AND the mktemp temp file is absent from the directory.

Scenario: AC-FR-5 SQLite sync delegates to record.sh with matching fields
  Given decision-log/record.sh is on PATH AND the SQLite decisions table has no row for (project, slug=testrun, decision_id=D-01)
  When writer invoked with slug=testrun id=D-01 title="T" chosen="C" actor=human rationale="r" alternatives="a" status=proposed blocking=false
  Then exit code = 0 AND `record.sh` was invoked with arguments including `--slug testrun --id D-01 --title T --chosen C --rationale r --alternatives a --status proposed --blocking false` AND a SQLite row exists for (project, slug=testrun, decision_id=D-01) with title="T" AND chosen="C" AND rationale="r" AND alternatives="a" AND status="proposed" AND the JSON file's D-01 entry has matching values for every shared field.

Scenario: AC-FR-6 jq construction survives hostile rationale
  Given rationale = `","evil":true,"gap":"`  (a string designed to break out of a JSON string slot)
  When writer invoked with that rationale
  Then exit code = 0 AND `jq empty planning/.VERIFY_<slug>.decisions.json` succeeds (file is valid JSON) AND `jq -e '.decisions[].evil'` returns null / false (no extra key was injected) AND `jq -r '.decisions[].rationale'` returns the literal input string byte-for-byte.

Scenario: AC-FR-7 loop auto-captures resolved decisions at every firing point
  Given a loop-task run reaches Phase 4.2 product-owner decision AND the user (or product-owner agent) resolves an AskUserQuestion to "Use Option B"
  When the coordinator proceeds past Phase 4.2
  Then planning/.VERIFY_<slug>.decisions.json exists AND contains an entry whose `chosen`="Use Option B" AND whose `id` is unique within the file AND the coordinator log contains a line matching `decisions.ledger id=<that id> status=<accepted|proposed>` AND the writer's exit code was 0 (a non-zero exit would have failed Phase 4.2 before reaching this assertion). The same assertion SHALL pass when the trigger is a Phase 5 user-batch decision, a Phase 5E.4 quarantine decision, or a megaplan L3 decide resolution.

Scenario: AC-FR-8 no delete operations in writer surface
  Given the writer source code and its CLI `--help` output
  When audited via `grep -nE '\bDELETE\b|rm[[:space:]]+-[rf]*f?' writer.sh` and `writer.sh --help`
  Then zero matches for SQL `DELETE` or `rm`/`truncate` against `.VERIFY_*.decisions.json` AND `--help` does not list any `--delete`, `--remove`, or `--purge` flag AND the only mutation operators are insert and replace-by-key.

Scenario: AC-FR-9 rationale never leaks outside the two persistence targets
  Given rationale = "secret-marker-ZZY-12345"
  When writer invoked
  Then stdout does not contain "secret-marker-ZZY-12345" AND stderr does not contain "secret-marker-ZZY-12345" AND no file under /tmp contains "secret-marker-ZZY-12345" (audit via `grep -r secret-marker-ZZY-12345 /tmp`) AND the coordinator's `decisions.ledger` log line contains the id and status only, NOT "secret-marker-ZZY-12345" AND the only files containing "secret-marker-ZZY-12345" are planning/.VERIFY_<slug>.decisions.json and the SQLite register (queried via `decision-log/decisions.sh show`).

Scenario: AC-FR-10 defaults applied and actor validated
  Given writer invoked with slug=testrun id=D-01 title="T" chosen="C" actor=human (no --iteration, no --status, no --blocking, no --timestamp)
  Then exit code = 0 AND the persisted D-01 element has iteration=1 AND status="proposed" AND blocking=false AND timestamp matches ISO 8601 UTC. When writer invoked with slug=testrun id=D-02 title="T" chosen="C" actor=blob, exit code != 0 AND stderr names `actor` as invalid AND no D-02 entry exists.

## 4. Edge Cases

| Category | EC | Stresses | Expected behavior |
| Empty inputs | EC-1: missing `slug` positional | FR-3 | exit != 0; stderr names `slug`; no file created; `record.sh` not invoked |
| Empty inputs | EC-2: `title=""` (empty string) | FR-3 | exit != 0; stderr names `title`; existing `.VERIFY_<slug>.decisions.json` byte-identical; no SQLite write |
| Empty inputs | EC-3: `actor` omitted entirely | FR-3, FR-10 | exit != 0; stderr names `actor`; no file modification |
| Boundary values | EC-4: `rationale` of 10000 chars | FR-1, FR-6, NFR-3 | exit 0; full 10k chars persisted (jq `-r` returns the full string); p95 < 500ms holds |
| Boundary values | EC-5: `iteration` = 0 and = 2147483647 | FR-10 | both accepted (iteration is caller-scoped); persisted as integer; rendered correctly by `section-decisions.sh` |
| Concurrency | EC-6: two writer invocations for the same `(slug,id)` running simultaneously | FR-2, FR-4 | no corrupted JSON (both `jq empty` succeed on the final file); exactly one entry exists for that id at the end (last writer wins); no temp files left in `planning/` |
| Concurrency | EC-7: writer runs while `section-decisions.sh` is reading the same file | FR-4 | reader sees EITHER the pre-invocation file OR the post-invocation file, never a partial; no `jq` parse error in the reader |
| Failure modes | EC-8: `record.sh` exits non-zero (e.g. SQLite busy / disk full at SQLite layer) | FR-5, FR-9 | JSON write is already committed (renderer's primary artifact); stderr logs `record.sh failed exit=<n>`; writer exits non-zero so the coordinator sees the issue; rationale NOT echoed in the error (FR-9) |
| Failure modes | EC-9: `mktemp` or `mv` fails (target dir read-only, disk full) | FR-4 | no `.VERIFY_<slug>.decisions.json` file appears at the target path; original file (if any) unchanged; temp file cleaned up; exit != 0 |
| Failure modes | EC-10: `record.sh` not on PATH | FR-5 | exit != 0; stderr names `record.sh` as missing; JSON already written in the prior step is KEPT; writer exits non-zero so the coordinator can retry the sync (D-7). No JSON is withheld. |
| Auth/permission | EC-11: writer invoked with read-only `planning/` dir | FR-4 | exit != 0; stderr names permission error; no temp file lingers; no partial file at target |
| Auth/permission | EC-12: writer invoked by a caller that is not the coordinator (manual test invocation) | FR-7 | writer still functions (it is a plain CLI); only the loop-auto-capture guarantee (FR-7) is the coordinator's responsibility, not the writer's |
| Data quality | EC-13: `rationale` containing `","evil":true,"gap":"` (JSON breakout) | FR-6 | persisted as a flat string; no extra key `evil` exists; `jq empty` succeeds |
| Data quality | EC-14: `rationale` containing `<script>alert(1)</script>` and `"; DROP TABLE decisions; --` | FR-6, FR-9 | persisted verbatim to JSON (renderer html-escapes downstream); passed to `record.sh` as a single `--rationale` argument (no shell expansion, no SQL injection because `record.sh` parameterizes); no script execution in writer; no table dropped |
| Data quality | EC-15: 100-row volume: writer invoked 100 times for distinct ids in one slug | FR-1, FR-2, NFR-3 | all 100 entries present and ordered by insertion; p95 per-invocation < 500ms; renderer paginates without overflow |
| State transitions | EC-16: writer records D-01 status=accepted when D-01 already status=superseded | FR-2, FR-8 | upsert replaces; new status stored; no DELETE issued; caller-visible field `iteration` increments if caller passes a new value (caller-scoped, not writer-derived) |
| State transitions | EC-17: caller attempts `--delete` or passes a sentinel asking for removal | FR-8 | writer does not expose `--delete`; unknown flag rejected with non-zero exit; no entry removed |
| Time | EC-18: writer invoked with `TZ=America/New_York` and no `--timestamp` | FR-10 | persisted `timestamp` is UTC ISO 8601 (e.g. `2026-07-28T14:00:00Z`), not local; matches `record.sh`'s default |
| Time | EC-19: caller supplies `--timestamp "2026-13-45T99:99:99Z"` (malformed) | FR-10 | exit != 0; stderr names timestamp invalid; no file modification (fail-closed on bad caller data) |
| Time | EC-20: two parallel invocations span a DST boundary | FR-4, FR-10 | both timestamps are well-formed UTC ISO 8601; no parse ambiguity in renderer |
| Locale/i18n | EC-21: `rationale` containing emoji (`🦀`), RTL marks (`‮`), CJK, and a surrogate-pair character | FR-6, FR-9 | persisted verbatim; `jq -r` returns the original string byte-for-byte (UTF-8 preserved); writer does not normalize, transliterate, or strip |
| Locale/i18n | EC-22: em dash (U+2014) appears in caller-supplied `rationale` | FR-6, NFR-5 | persisted verbatim to JSON (NFR-5 bans em dashes in writer's OWN code/copy, NOT in caller data; the renderer escapes downstream); writer does not reject or rewrite caller text |
| Resource limits | EC-23: `.VERIFY_<slug>.decisions.json` grows to 1000 entries | FR-1, FR-2, NFR-3 | single-invocation p95 still < 500ms; `section-decisions.sh` renderer still completes its TSV projection without OOM |
| Resource limits | EC-24: disk full at the moment of `mv` | FR-4 | no partial file at target; temp file removed if possible; exit != 0; coordinator sees failure |

## 5. Pre/Post Conditions and Invariants

Operation: record-decision (single writer invocation)
  Preconditions:
    - Caller supplies `slug`, `id`, `title`, `chosen`, `actor` (all non-empty).
    - `slug` matches the canonical CFN slug pattern (`^[a-z0-9][a-z0-9_-]{0,59}$`).
    - `planning/` directory exists and is writable by the writer.
    - `decision-log/record.sh` is on PATH, executable, and its SQLite store
      (`~/.claude/decision-log/decisions.db`) is reachable.
    - `actor` is one of `{human, ai}`.
  Postconditions (success):
    - `planning/.VERIFY_<slug>.decisions.json` exists, is valid JSON, contains exactly
      one element with the given `(slug,id)`, and that element's fields match the
      caller's inputs (with the FR-10 defaults applied for omitted optionals).
    - SQLite `decisions` table has a row with `UNIQUE(project,slug,decision_id)`
      matching the JSON entry on every shared field.
    - Every other element in `.VERIFY_<slug>.decisions.json` is unchanged and in its
      original relative order.
    - Exit code 0; coordinator log emits `decisions.ledger id=<id> status=<status>`.
  Postconditions (failure):
    - Validation failure (FR-3, FR-10): `.VERIFY_<slug>.decisions.json` byte-identical
      to pre-invocation (or absent if it never existed); no SQLite row written;
      `record.sh` not invoked; exit non-zero; stderr names the offending field; no
      field value echoed.
    - SQLite sync failure (FR-5, EC-8): JSON write already committed (renderer input
      preserved); stderr logs `record.sh` failure code; exit non-zero (coordinator
      sees the issue and can re-run; primary artifact is not lost).
    - Atomic-write failure (FR-4, EC-9, EC-24): no file at target path; original file
      unchanged; temp file removed; exit non-zero.
    - `record.sh` missing (EC-10): JSON already written in the prior step is KEPT;
      stderr names `record.sh` as missing; exit non-zero so the coordinator can
      retry the sync (D-7). No JSON is withheld.
  Invariants:
    - `.VERIFY_<slug>.decisions.json` is valid JSON (`jq empty` succeeds) after every
      writer invocation regardless of outcome (success, validation failure, mid-write
      crash, signal).
    - The writer NEVER issues `DELETE` (file truncate, `rm`, entry removal) or
      `DELETE` SQL.
    - `rationale` and `alternatives` text appears ONLY in `.VERIFY_<slug>.decisions.json`
      and the SQLite register; never in stdout, stderr, `/tmp`, or coordinator logs.
    - No em dashes in the writer's own code, comments, SKILL.md copy, or coordinator
      hook prose (NFR-5). Caller-supplied text is persisted verbatim.

Operation: upsert-by-key (JSON array mutation)
  Preconditions:
    - Target file (if exists) is valid JSON with top-level `.decisions` as an array of
      objects; if absent, writer bootstraps `{"slug":"<slug>","decisions":[]}`.
  Postconditions (success):
    - Exactly one element matches `(slug,id)`; every other element is byte-identical
      to its pre-invocation value and retains its original array index relative to the
      others.
  Postconditions (failure):
    - File unchanged on any error path (validation, mktemp, mv).
  Invariants:
    - The array never contains two elements with the same `id` for a given `slug`.
    - Bootstrap object always carries `slug` matching the invocation argument.

Operation: loop-capture (coordinator hook firing)
  Preconditions:
    - Coordinator is at one of the named firing points: Phase 4.2 product-owner 2/3
      decisions, Phase 5 1/3 user batches, Phase 5E.4 quarantine, or megaplan L3 decide.
    - An `AskUserQuestion` decision has resolved (or an equivalent decision is otherwise
      fixed: a human answer recorded, a product-owner verdict committed, a quarantine
      classification chosen).
    - `slug` for the current run is known to the coordinator.
  Postconditions (success):
    - `.VERIFY_<slug>.decisions.json` gains exactly one entry for the resolved decision.
    - Coordinator log emits `decisions.ledger id=<id> status=<status>` with no rationale.
  Postconditions (failure):
    - Writer exit non-zero is logged by the calling hook, which then CONTINUES (D-8:
      isolate at all sites). The coordinator surfaces the failure as a warning; the
      run proceeds. The writer itself still exits non-zero on failure.
  Invariants:
    - Every resolved `AskUserQuestion` decision at a named firing point produces
      exactly one writer invocation. There is no "skip if quiet" path.

## 6. Out of Scope

- Modifying `section-decisions.sh`, `render.sh`, `test-render.sh`, or any renderer
  code (LOCKED contract per resolved finding #1).
- Modifying `decision-log/record.sh` CLI surface, `decision-log/decisions.sh` reader,
  or `schema.sql` (owned by the decision-log skill per resolved finding #3).
- Introducing any new SQLite table, migration, or column (this plan calls `record.sh`;
  `db: no`).
- Writing `planning/DECISIONS_<slug>.md` (the human-facing register owned by the
  `cfn-decide` doc skill per resolved finding #4).
- Modifying `cfn-megaplan/bars/bless-verify.sh` or its append-only event ledger
  (separate concern, separate lifecycle per resolved finding #5).
- Any UI, frontend, or browser-rendered surface (`frontend: no`).
- Any Anthropic API integration or `claude -p` invocation (provider ban, NFR-2).
- Out-of-band workers (cron, queue consumers, spawned daemons). The writer is invoked
  synchronously by the coordinator and the megaplan orchestrator.
- Reading or migrating historical decisions from any prior system. The writer starts
  fresh per `(slug,id)`; recovery of pre-existing decision state is not in scope.

## 7. Open Questions

- Q-1: [RESOLVED: option (a) new skill `cfn-decisions/` (composition) | user-approved 2026-07-28] WHERE does the writer live?
  - **Resolution (user-approved):** Option (a). New skill `cfn-decisions/` (dir: `record.sh` + `SKILL.md` + `tests/`) OWNS the per-run JSON `planning/.VERIFY_<slug>.decisions.json` and DELEGATES the SQLite sync to `decision-log/record.sh` (composition, not duplication). `decision-log` stays the focused SQLite expert, untouched. The two run-scoped fields (`actor`, `iteration`) live in the JSON only, NOT forced into the SQLite schema. Tests land in `cfn-decisions/tests/`. Chosen over (b) to avoid coupling the global, reverse-symlinked `decision-log` skill to a workbench-specific file path and workbench-only fields.
  - (a) New skill `cfn-decisions/` (new dir: `record.sh` + `SKILL.md` + `tests/`)
    that OWNS the per-run JSON artifact and DELEGATES the SQLite sync to
    `decision-log/record.sh` (composition, not duplication). Separation:
    `cfn-decisions` = per-run JSON owner; `decision-log` = SQLite expert.
  - (b) Extend `decision-log/record.sh` with a `--run-ledger <path>` JSON sink. DRY
    (one writer, one schema source) but couples a global skill to a workbench-specific
    artifact path (`planning/.VERIFY_*.decisions.json`).
  - (c) Extend the `cfn-decide` doc-only skill with the writer. Reuses an existing
    decision-themed namespace but blurs the doc/skill boundary `cfn-decide` currently
    holds.
  - Why BLOCKING: this fork picks the writer's storage location and the JSON shape's
    owning component, which `cfn-arch` consumes directly as a component contract
    (writer -> record.sh -> SQLite, and writer -> `.VERIFY_*.decisions.json`). It is a
    DECISIONS-phase fork that picks storage/shape and is consumed by a downstream
    phase. It also affects `cfn-test-plan` (assembled-path checks for FR-1/FR-2/FR-5)
    and `write-plan` (file layout and TDD sequence). Surface for `cfn-decide` to
    resolve before arch runs.

- Q-2: [PARKED: persist JSON (renderer's primary artifact), log `record.sh` failure
  to stderr with exit code only, exit non-zero so the coordinator sees the issue and
  can re-run; deferred: error-handling detail within FR-5, not downstream-consumed by
  arch/data/ux] SQLite sync failure handling. Does the writer roll back the JSON write,
  or persist JSON and surface the SQLite failure separately?

- Q-3: [PARKED: single decision per invocation, matching `record.sh` semantics;
  deferred: invocation shape is internal to the writer, not downstream-consumed]
  Single decision per invocation vs. batch (multiple `(slug,id)` records in one call).

- Q-4: [PARKED: `iteration` caller-supplied default 1, `status` default `proposed`,
  `blocking` default `false`, `timestamp` default UTC ISO 8601 now, `actor` required
  with no default; deferred: defaults are internal to the writer, encoded as FR-10]
  Default values for optional fields. (Already encoded as FR-10; recorded here so
  downstream phases see the chosen defaults as stated assumptions.)

- Q-5: [PARKED: bash test script under the new skill's `tests/` directory (Option a)
  OR under `decision-log/tests/` (Option b), matching `bless-verify.sh`'s test layout
  pattern; deferred: test location is internal to the writer skill, not
  downstream-consumed; final location re-resolves at `write-plan` based on Q-1 outcome]
  Test framework and location. (Bash per NFR-1; location depends on Q-1.)

- Q-6: [PARKED: project auto-derived from `git rev-parse --show-toplevel` basename,
  matching `record.sh`'s existing derivation (resolved finding #3); deferred: project
  derivation is `record.sh`'s contract, not the writer's] Whether the writer should
  accept a `--project` override or always defer to `record.sh`'s git-derivation.

## 8. Build Flags

- frontend: no
- db: no
- pii: no
- unknowns: no
- tier-hint: beta
