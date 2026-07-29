# Pseudocode: decisions-ledger writer + loop-hook wiring

> RESOLUTIONS (user-approved 2026-07-28, recorded D-7/D-8): [OPEN-Q-A] -> D-7 persist-and-surface (JSON kept on SQLite failure; winning branch 2a-PERSIST). [OPEN-Q-B] -> D-8 isolate at ALL hook sites (hook logs and continues; writer still exits non-zero). Both override the SPEC section 5 / FR-7 fail-closed literals; SPEC patched to match.

**Date:** 2026-07-28
**Spec:** planning/SPEC_decisions_ledger.md
**Status:** draft
**Tier:** beta (directive: full)

Closes the gap where the workbench renderer reads
`planning/.VERIFY_<slug>.decisions.json` (`section-decisions.sh:14,38-51`) but
nothing in the repo writes it. Per Q-1 RESOLVED, the writer is a NEW skill
`cfn-decisions/record.sh` that OWNS the per-run JSON and DELEGATES the SQLite
sync to `decision-log/record.sh` (composition, not duplication).

## Module boundaries (consumed by cfn-arch)

- **Module 1: WRITER (`cfn-decisions/record.sh`)**. Bash+jq CLI that owns
  `planning/.VERIFY_<slug>.decisions.json`. Operations OP-W1..OP-W4 plus
  OP-W0 entry. Single invoked process per decision.
- **Module 2: LOOP-HOOK WIRING (coordinator edits in `cfn-loop-task.md` and
  `cfn-megaplan/SKILL.md`)**. A thin helper `OP-H1 record_decision` plus four
  insertion sites `OP-H2`. Each site calls the helper once per resolved
  decision.

LOCKED (out of scope per SPEC §6): the renderer `section-decisions.sh`,
`render.sh`, `test-render.sh`; the SQLite sink `decision-log/record.sh` and
`schema.sql`; `cfn-megaplan/bars/bless-verify.sh` and its append-only event
ledger (separate lifecycle). The writer COMPOSES with `decision-log/record.sh`
via subprocess; it never opens `decisions.db` directly and never duplicates
its SQL.

Design pattern: **Composition over duplication** (FR-5). The writer composes
with `decision-log/record.sh` rather than re-implementing SQL. Chosen over
Q-1 option (b) (`record.sh --run-ledger <path>`) which would couple a global,
reverse-symlinked skill to a workbench-specific file path.

## 1. Operation Map

| FR | Operation | Module | Inputs | Outputs |
|----|-----------|--------|--------|---------|
| FR-10 | OP-W1 parse_and_validate_args | writer | argv | ParsedArgs \| Exit(2) |
| FR-3, FR-10 | OP-W1b refuse_on_missing_or_invalid | writer | ParsedArgs | ParsedArgs \| Exit(1) |
| FR-6 | OP-W2 build_decision_object | writer | ParsedArgs | ENTRY \| Exit(3) |
| FR-1, FR-2, FR-4 | OP-W3 upsert_by_key_atomic | writer | ParsedArgs, ENTRY | TARGET \| Exit(4\|5) |
| FR-5 | OP-W4 delegate_to_record_sh | writer | ParsedArgs, TARGET | SQLITE_SYNCED \| Exit(6\|7\|8) |
| (orchestrator) | OP-W0 writer_entry | writer | argv | Exit(0\|1\|2\|3\|4\|5\|6\|7\|8) |
| FR-7 | OP-H1 record_decision | coord | slug, dec_id, chosen, status, actor, ... | exit=0 \| exit!=0 |
| FR-7 | OP-H2 coordinator_insertion_points | coord | resolved decision at site | one OP-H1 call |

## 2. Pseudocode

### OP-W0: writer_entry (top-level, cfn-decisions/record.sh main)

```
FUNCTION writer_entry(argv):
  1. args, rc = OP-W1 parse_and_validate_args(argv)
       IF rc != 0 THEN RETURN rc
  2. args, rc = OP-W1b refuse_on_missing_or_invalid(args)
       IF rc != 0 THEN RETURN rc
  3. ENTRY, rc = OP-W2 build_decision_object(args)
       IF rc != 0 THEN RETURN rc
  4. TARGET, rc = OP-W3 upsert_by_key_atomic(args, ENTRY)
       IF rc != 0 THEN RETURN rc
       -- JSON persisted here (renderer's primary artifact)
  5. rc = OP-W4 delegate_to_record_sh(args, TARGET)
       IF rc != 0 THEN RETURN rc
       -- Q-2 default: JSON already persisted; SQLite failure surfaced, NOT rolled back
  6. EXEC printf '%s %s\n' "$DEC_ID" "$STATUS"   -- stdout: id+status only (FR-9)
  7. RETURN 0
  -- postconditions:
  --   AC-FR-5 (JSON + SQLite lockstep on success)
  --   AC-FR-9 (rationale never on stdout; only id and status)
  --   Invariants: TARGET is valid JSON; no DELETE issued; no temp files linger
```

### OP-W1: parse_and_validate_args

```
FUNCTION parse_and_validate_args(argv):
  1. INITIALIZE defaults (Q-4):
       SLUG=""; DEC_ID=""; TITLE=""; CHOSEN=""; RATIONALE=""; ALTS=""
       ACTOR=""; STATUS="proposed"; ITERATION_RAW=""; BLOCKING_RAW="false"
       TS_INPUT=""; ROOT=""
  2. WHILE args remain:
       2a. CASE arg OF:
             --slug         -> SLUG=next;        consume 2
             --id           -> DEC_ID=next;      consume 2
             --title        -> TITLE=next;       consume 2
             --chosen       -> CHOSEN=next;      consume 2
             --actor        -> ACTOR=next;       consume 2
             --rationale    -> RATIONALE=next;   consume 2
             --alternatives -> ALTS=next;        consume 2
             --status       -> STATUS=next;      consume 2
             --iteration    -> ITERATION_RAW=next; consume 2
             --blocking     -> BLOCKING_RAW=next;  consume 2
             --timestamp    -> TS_INPUT=next;    consume 2
             --root         -> ROOT=next;        consume 2
             --delete | --remove | --purge
                            -> RETURN Exit(2, "unknown arg: <arg>")
                               -- EC-17, FR-8 (no delete surface)
             *              -> RETURN Exit(2, "unknown arg: <arg>")
                               -- malformed CLI
  3. IF ROOT="" THEN ROOT="$(pwd)/planning"      -- Q-4 default
  4. IF TS_INPUT="" THEN TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"   -- EC-18 UTC regardless of TZ
     ELSE TS=TS_INPUT
  5. IF ITERATION_RAW="" THEN ITERATION=1        -- Q-4 default
     ELSE IF ITERATION_RAW matches ^[0-9]+$ THEN ITERATION=int(ITERATION_RAW)
     ELSE RETURN Exit(2, "iteration must be a non-negative integer")
            -- EC-5 (0 and 2147483647 both accepted); FR-10
  6. IF BLOCKING_RAW="false" OR BLOCKING_RAW="" THEN BLOCKING_BOOL=false
     ELSE IF BLOCKING_RAW="true" THEN BLOCKING_BOOL=true
     ELSE RETURN Exit(2, "blocking must be true|false")
  7. IF ACTOR not in {human, ai} THEN
       RETURN Exit(2, "actor must be human|ai")
       -- EC-3, AC-FR-10
  8. IF STATUS not in {proposed, accepted, superseded} THEN
       RETURN Exit(2, "status must be proposed|accepted|superseded")
  9. IF TS does not match ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ THEN
       RETURN Exit(2, "timestamp must be ISO 8601 UTC like 2026-07-28T14:00:00Z")
       -- EC-19 (malformed caller TS); FR-10
  10. RETURN ParsedArgs{SLUG, DEC_ID, TITLE, CHOSEN, RATIONALE, ALTS,
                        ACTOR, STATUS, ITERATION, BLOCKING_BOOL, TS, ROOT}
```

### OP-W1b: refuse_on_missing_or_invalid (FR-3 gate)

Analogue of `bless-verify.sh:80-94` refuse-on-error gate. First-missing-field
rule: name ONE field, never echo a supplied value (FR-3 second clause; FR-9).

```
FUNCTION refuse_on_missing_or_invalid(args):
  1. FOR field IN [SLUG, DEC_ID, TITLE, CHOSEN, ACTOR]:    -- fixed order
       1a. IF field is empty OR whitespace-only THEN
             RETURN Exit(1, "missing required field: <fieldname>")
             -- postcondition: no file modified; record.sh NOT invoked
             -- EC-1 (slug), EC-2 (title empty), EC-3 (actor omitted),
             --   plus ID/CHOSEN analogs of FR-3
             -- stderr must NOT contain any supplied field value (AC-FR-3)
  2. RETURN args
```

### OP-W2: build_decision_object (FR-6 jq construction, hostile-safe)

```
FUNCTION build_decision_object(args):
  -- NEVER string-concatenate JSON (FR-6). Every untrusted string flows via
     jq --arg so EC-13 (JSON breakout), EC-14 (script / SQL injection),
     EC-21 (unicode / emoji), EC-22 (em dash in caller text) stay inside
     their string slots. jq is the single source of escape logic.
  1. ENTRY = EXEC jq -n \
       --arg id           "$DEC_ID" \
       --arg actor        "$ACTOR" \
       --arg title        "$TITLE" \
       --arg chosen       "$CHOSEN" \
       --arg rationale    "$RATIONALE" \
       --arg alternatives "$ALTS" \
       --arg status       "$STATUS" \
       --argjson iteration "$ITERATION" \       -- number literal
       --argjson blocking  "$BLOCKING_BOOL" \   -- boolean literal
       --arg timestamp    "$TS" \
       '{id:$id, actor:$actor, title:$title, chosen:$chosen,
         rationale:$rationale, alternatives:$alternatives, status:$status,
         iteration:$iteration, blocking:$blocking, timestamp:$timestamp}'
  2. IF jq exit != 0 OR ENTRY fails `jq empty` validation THEN
       RETURN Exit(3, "internal: jq failed to build decision object")
       -- defensive: unreachable in normal flow since --arg escapes everything
       -- postcondition: no file modified
  3. RETURN ENTRY
  -- postconditions AC-FR-6 / AC-FR-1 fields:
  --   rationale = `","evil":true,"gap":"`  persists as one flat string
  --   no `evil` key appears in ENTRY
  --   `jq -r '.rationale'` returns the input byte-for-byte
```

### OP-W3: upsert_by_key_atomic (FR-1, FR-2, FR-4)

Mirrors `bless-verify.sh:62-66,137-149` (DIR/BASE derivation, mktemp+mv),
but UPSERT-BY-KEY instead of append-only (decisions are entities that evolve
proposed -> accepted -> superseded; SPEC §1 FR-2).

```
FUNCTION upsert_by_key_atomic(args, ENTRY):
  1. DERIVE paths (mirror bless-verify.sh:62-66):
       1a. DIR   = "$ROOT"
       1b. BASE  = "VERIFY_${SLUG}"
       1c. TARGET = "$DIR/.$BASE.decisions.json"
              -- i.e. planning/.VERIFY_<slug>.decisions.json
       1d. -- The (slug,id) upsert key collapses to id-within-file because
              slug is encoded in the filename (file partition = slug scope).
  2. IF DIR does not exist OR DIR is not writable THEN
       2a. RETURN Exit(4, "planning dir missing or read-only: $DIR")
           -- EC-11 (read-only planning/); postcondition: no file at TARGET
  3. TMP = EXEC mktemp "$DIR/.dec.XXXXXX"
       3a. IF mktemp fails THEN
             RETURN Exit(4, "mktemp failed in $DIR")
             -- EC-9, EC-11, EC-24 (disk full); no file at TARGET
  4. INSTALL cleanup trap: on EXIT / INT / TERM, `rm -f "$TMP"` (FR-4 invariant)
  5. BRANCH on TARGET state:
       5a. IF TARGET does not exist THEN  -- bootstrap (SPEC §5 upsert preconditions)
             EXEC jq -n --arg slug "$SLUG" --argjson new "$ENTRY" \
               '{slug:$slug, decisions:[$new]}' > "$TMP"
       5b. ELSE IF TARGET exists AND `jq empty "$TARGET"` fails THEN
             -- invariant violation (SPEC §5 invariants say this never happens
             -- after a successful write). PRESERVE the bad file for inspection.
             EXEC rm -f "$TMP"
             RETURN Exit(5, "existing $TARGET is not valid JSON; refusing overwrite")
       5c. ELSE (TARGET exists and is valid JSON):
             -- upsert by id; preserve relative order of every other element.
             EXEC jq --argjson new "$ENTRY" '
               ( (.decisions // []) | map(.id) | index($new.id) ) as $idx
               | if $idx != null then
                   .decisions |= map(if .id == $new.id then $new else . end)
                 else
                   .decisions += [$new]
                 end
             ' "$TARGET" > "$TMP"
             -- FR-2: replace by id; append if new; preserves other elements
             -- EC-16: status accepted->superseded etc. legal (no forward-only gate)
  6. IF the jq step (5a or 5c) failed OR `jq empty "$TMP"` fails THEN
       6a. EXEC rm -f "$TMP"
       6b. RETURN Exit(5, "internal: jq upsert produced invalid JSON")
       6c. -- original TARGET unchanged (we wrote to TMP, never to TARGET)
  7. EXEC mv "$TMP" "$TARGET"
       7a. IF mv fails THEN
             EXEC rm -f "$TMP"   -- best-effort
             RETURN Exit(4, "mv failed to commit $TARGET")
             -- EC-9, EC-24; original TARGET unchanged; no temp lingers
  8. RETURN TARGET
  -- postconditions:
  --   AC-FR-1 (insert new): TARGET exists, exactly one element for id, fields match
  --   AC-FR-2 (upsert preserves order): other elements byte-identical, same indices
  --   AC-FR-4 (atomic): no partial observable; no temp file lingers on any path
  --   EC-7 (concurrent reader): sees pre-invocation OR post-invocation file, never partial
```

### OP-W4: delegate_to_record_sh (FR-5, EC-8, EC-10)

Q-2 PARKED default: JSON write (OP-W3) runs FIRST, SQLite sync runs SECOND.
On SQLite failure: JSON stays (renderer's primary artifact preserved); stderr
logs the record.sh exit code; writer exits non-zero so the coordinator sees
the issue and can re-run. NO rollback of the JSON.

```
FUNCTION delegate_to_record_sh(args, TARGET):
  1. PRECONDITION: OP-W3 already committed TARGET successfully.
  2. IF NOT `command -v record.sh >/dev/null 2>&1` THEN
       -- EC-10. RESOLVED via D-7: 2a-PERSIST wins (JSON kept; failure
          surfaced; exit non-zero; no rollback). SPEC §5 postcondition for
          record.sh-missing patched to match. The two candidate branches were:
       2a-FATAL (spec-literal, REJECTED by D-7):
             RETURN Exit(6, "record.sh not on PATH; JSON must not have been written")
             -- would require OP-W4 to run BEFORE OP-W3, reversing Q-2 order
       2a-PERSIST (Q-2 default, D-7 winner):
             EXEC printf 'record.sh missing; JSON persisted at %s; SQLite sync skipped\n' "$TARGET" >&2
             RETURN Exit(7)
             -- non-zero, coordinator re-runs; idempotent upsert is safe
       -- [OPEN-Q-A] RESOLVED via D-7: 2a-PERSIST. Inline marker retained
       --    for branch-split documentation consumed by cfn-arch (writer's
       --    record.sh-missing behavior) and cfn-test-plan (PERSIST branch).
  3. BUILD record.sh argv (SHARED FIELDS ONLY; actor + iteration are JSON-only per FR-5):
       ARGV_SQL = [ --slug, SLUG, --id, DEC_ID, --title, TITLE, --chosen, CHOSEN,
                    --rationale, RATIONALE, --alternatives, ALTS,
                    --status, STATUS, --timestamp, TS ]
       3a. -- ALWAYS pass --status explicitly: record.sh defaults STATUS="accepted"
              (record.sh:19), but the writer's default is "proposed". Forgetting
              to forward would silently upgrade a proposed decision to accepted
              in the SQLite register.
       3b. IF BLOCKING_BOOL=true THEN APPEND "--blocking" (bare flag) to ARGV_SQL
              -- record.sh uses bare-flag form (record.sh:30), not --blocking true
       3c. -- NEVER pass --project (Q-6: record.sh derives from git toplevel basename)
       3d. -- NEVER pass --actor or --iteration (FR-5: JSON-only, run-scoped)
  4. EXEC record.sh "${ARGV_SQL[@]}"    --> RC
  5. IF RC = 0 THEN RETURN SQLITE_SYNCED
       -- postcondition AC-FR-5: SQLite row exists, UNIQUE(project,slug,decision_id),
          shared fields match the JSON entry
  6. ELSE (RC != 0):
       6a. -- EC-8: JSON already committed. Q-2 PARKED: surface failure, do NOT roll back.
       6b. EXEC printf 'record.sh failed exit=%d; JSON persisted at %s; SQLite out of sync\n' "$RC" "$TARGET" >&2
       6c. -- rationale NOT echoed (FR-9): stderr carries id and TARGET only
       6d. RETURN Exit(8, "record.sh failed exit=$RC")
       6e. -- postcondition: JSON intact, SQLite may be missing / stale;
              idempotent upsert makes a coordinator re-run safe
```

### OP-H1: record_decision (coordinator-side helper)

The thin wrapper installed at each insertion site. Encapsulates the
writer call and the FR-7 runtime log line.

```
FUNCTION record_decision(slug, dec_id, title, chosen, rationale, alts,
                          status, actor, iteration, blocking, ts, root,
                          site_id):
  1. EXEC cfn-decisions/record.sh \
       --slug "$slug" --id "$dec_id" --title "$title" --chosen "$chosen" \
       [--rationale "$rationale"] [--alternatives "$alts"] \
       --status "$status" --actor "$actor" \
       --iteration "$iteration" --blocking "$blocking" \
       --timestamp "$ts" --root "$root"     --> RC
  2. IF RC = 0 THEN
       2a. EXEC printf 'decisions.ledger id=%s status=%s\n' "$dec_id" "$status"
              -- FR-7 runtime signal; id and status ONLY (FR-9)
  3. ELSE:
       3a. EXEC printf 'decisions.ledger id=%s record FAILED rc=%d site=%s\n' \
              "$dec_id" "$RC" "$site_id" >&2
       3b. -- [OPEN-Q-B] RESOLVED via D-8: ISOLATE at ALL sites (hook logs
       --       and continues; writer still exits non-zero on its own
       --       contract). The decision-record is an audit side-effect and
       --       must not abort the task run. FR-7 literal "SHALL fail the
       --       calling phase" is overridden; SPEC FR-7 patched to match.
       3c. RETURN 0   -- log written; coordinator loop continues at EVERY site
  4. END
```

### OP-H2: coordinator_insertion_points

For each site: WHEN the helper fires (after decision known, before loop
continues), WHICH fields map, and the failure-mode default. Line refs are
to `cfn-loop-task.md` and `cfn-megaplan/SKILL.md` at the stated phases.

```
FUNCTION on_decision_resolved(site, decision):

  SITE 1: phase-4.2-product-owner
    LOCATION: cfn-loop-task.md ~:410-414 (2/3 product-owner dispatch)
    TRIGGER: product-owner agent returns verdict (IMPLEMENT / DEFER / REJECT)
             on a 2/3-routed suggestion.
    INSERT: between verdict receipt and "implement / defer" dispatch.
    FIELDS:
      actor    = "ai"
      status   = "accepted" if IMPLEMENT
                 "proposed"  if DEFER (backlog)
                 "superseded" if REJECT
      title    = "<suggestion id summary>"
      chosen   = "<verdict>"
      blocking = true if the suggestion was a blocking-severity vote, else false
    ON-RECORD-FAILURE: [OPEN-Q-B] default ISOLATE.
      The decision was made by the product-owner agent; losing the ledger row
      is a coverage gap (the next bless cycle can re-capture), not a wrong
      decision. Log and continue.

  SITE 2: phase-5-user-batch
    LOCATION: cfn-loop-task.md ~:426-439 (AskUserQuestion return on 1/3 queue)
    TRIGGER: each 1/3 item's AskUserQuestion returns (Apply / Skip / Defer).
    INSERT: between AskUserQuestion return and "implement / skip" dispatch.
    FIELDS:
      actor    = "human"
      status   = "accepted"   if Apply
                 "superseded" if Skip
                 "proposed"   if Defer to backlog
      title    = "<suggestion id summary>"
      chosen   = "<user's selected option>"
      blocking = false   -- 1/3 items are by definition non-blocking
    ON-RECORD-FAILURE: [OPEN-Q-B] default ISOLATE.
      The user's choice must be honored regardless of ledger state; record.sh
      failure is logged, not blocking. Re-run reachable by coordinator retry.

  SITE 3: phase-5E.4-quarantine
    LOCATION: cfn-loop-task.md ~:535-538 (persistent red after 2 quick-fix attempts)
    TRIGGER: user picks Quarantine / Keep iterating / Abort on a persistent red.
    INSERT: between user choice and "test.skip wrap" / "back to Phase 2" /
            "report + exit".
    FIELDS:
      actor    = "human"
      status   = "accepted"   if Quarantine
                 "proposed"   if Keep iterating
                 "superseded" if Abort
      title    = "<failing test file>"
      chosen   = "<Quarantine|Keep iterating|Abort>"
      blocking = true   -- quarantine is load-bearing: the test.skip needs
                          the audit row to satisfy Step 3.05 hygiene
    ON-RECORD-FAILURE: [OPEN-Q-B] RESOLVED via D-8: ISOLATE (same as every
      other site). The hook logs the failure and the loop continues; the
      writer itself still exits non-zero. D-8 overrides the prior
      "load-bearing, must propagate" reasoning: the decision-record is an
      audit side-effect and must not abort the task run at any site.

  SITE 4: megaplan-L3-decide
    LOCATION: cfn-megaplan/SKILL.md ~:215 (BLOCKING [OPEN] resolution at any level)
    TRIGGER: BLOCKING [OPEN] item resolved via AskUserQuestion at a megaplan level.
    INSERT: between AskUserQuestion resolution and "advance past the level".
    FIELDS:
      actor    = "human"
      status   = "accepted"
      title    = "<OPEN item short name>"
      chosen   = "<user's choice>"
      blocking = true   -- OPEN items are blocking by definition
    ON-RECORD-FAILURE: [OPEN-Q-B] default ISOLATE.
      The user's decision must advance the level even if the ledger write
      fails. Log and continue; the orchestrator can re-capture on the next
      blocking cycle.

  END
```

## 3. Branch Coverage (forward map)

OP-W1 parse_and_validate_args:
  Branch 2a known-flags     -> AC-FR-10 (CLI accepts all named flags)
  Branch --delete/--remove/--purge -> EC-17, AC-FR-8 (no delete surface)
  Branch * unknown          -> malformed CLI test (parser refuses)
  Branch 3 ROOT default     -> Q-4 default
  Branch 4a TS default UTC  -> EC-18, FR-10
  Branch 5a ITERATION=1     -> AC-FR-10
  Branch 5b ITERATION numeric -> EC-5 (0 and 2147483647)
  Branch 5c ITERATION non-numeric -> defensive parse test
  Branch 6a BLOCKING false  -> AC-FR-10
  Branch 6b BLOCKING true   -> AC-FR-10
  Branch 6c BLOCKING invalid -> defensive parse test
  Branch 7 ACTOR invalid    -> EC-3, AC-FR-10
  Branch 8 STATUS invalid   -> defensive parse test
  Branch 9 TS malformed     -> EC-19

OP-W1b refuse_on_missing_or_invalid (5 sibling branches under FOR):
  Branch 1a SLUG empty      -> EC-1, AC-FR-3
  Branch 1a DEC_ID empty    -> AC-FR-3 analog
  Branch 1a TITLE empty     -> EC-2, AC-FR-3
  Branch 1a CHOSEN empty    -> AC-FR-3 analog
  Branch 1a ACTOR empty     -> EC-3, AC-FR-3

OP-W2 build_decision_object:
  Branch 1 success          -> AC-FR-1, AC-FR-6
  Branch 1 hostile JSON breakout (rationale `,","evil":true,"gap":"`) -> EC-13, AC-FR-6
  Branch 1 hostile script+SQL (`<script>` and `; DROP TABLE`)        -> EC-14
  Branch 1 unicode/emoji (CR, RTL, CJK, surrogate)                   -> EC-21
  Branch 1 em dash in caller text                                    -> EC-22 (NFR-5 carveout)
  Branch 1 rationale 10k chars                                       -> EC-4
  Branch 2 jq internal failure -> defensive (no EC; unreachable in normal flow)

OP-W3 upsert_by_key_atomic:
  Branch 2 DIR missing/RO    -> EC-11
  Branch 3a mktemp fail      -> EC-9, EC-24
  Branch 5a bootstrap (TARGET absent) -> AC-FR-1, SPEC §5 upsert preconditions
  Branch 5b TARGET corrupt   -> invariant-violation defensive
  Branch 5c-replace id-exists -> AC-FR-2, EC-16
  Branch 5c-append id-new    -> AC-FR-2
  Branch 6 jq output invalid -> defensive
  Branch 7 mv fail           -> EC-9, EC-24
  (Cross-cutting) EC-6 concurrent same-id writers -> 5c+7 last-writer-wins, both jq-empty pass
  (Cross-cutting) EC-7 concurrent reader          -> step 7 mv atomic; reader sees old OR new
  (Cross-cutting) EC-15 100 distinct ids          -> 100x 5c-append, order preserved
  (Cross-cutting) EC-23 1000 entries              -> 5c still O(n); perf-verified in §4

OP-W4 delegate_to_record_sh:
  Branch 2a-PERSIST record.sh missing-> EC-10 (D-7 winner) [OPEN-Q-A RESOLVED]
  (2a-FATAL spec-literal branch REJECTED by D-7; superseded)
  Branch 3 argv build                 -> AC-FR-5 (shared fields forwarded)
  Branch 3a --status forwarded        -> defensive: prevents record.sh "accepted" default
  Branch 3b --blocking flag           -> AC-FR-5 (blocking semantics preserved)
  Branch 5 RC=0                       -> AC-FR-5 (SQLite row matches JSON)
  Branch 6 RC!=0                      -> EC-8 (JSON persists, stderr logs code)

OP-W0 writer_entry:
  Step 1-5 happy path -> AC-FR-1, AC-FR-2, AC-FR-5
  Step 6 stdout id+status -> AC-FR-9 (rationale not on stdout)

OP-H1 record_decision:
  Branch 1 RC=0 -> AC-FR-7 (capture happened)
  Branch 2a log line -> FR-7 runtime signal
  Branch 3c ISOLATE -> D-8 (ALL 4 sites; task directive carried, FR-7 literal overridden)
  (3d FAIL-CLOSED branch REJECTED by D-8; superseded)

OP-H2 insertion sites:
  SITE 1 phase-4.2-product-owner -> FR-7 (actor=ai)
  SITE 2 phase-5-user-batch      -> FR-7 (actor=human)
  SITE 3 phase-5E.4-quarantine   -> FR-7 (actor=human, isolate per D-8)
  SITE 4 megaplan-L3-decide      -> FR-7 (actor=human)

## 3b. Spec Coverage (reverse map)

| Spec item | Claimed by branch | Status |
|---|---|---|
| AC-FR-1 | OP-W3 5a/5c-append + OP-W2 step1 | covered |
| AC-FR-2 | OP-W3 5c-replace + EC-16 status-transition branch | covered |
| AC-FR-3 | OP-W1b 1a-* (5 missing-field branches) | covered |
| AC-FR-4 | OP-W3 2/3a/5a/5c/6/7a + cleanup trap | covered |
| AC-FR-5 | OP-W4 3/5 + 3a (--status forward) | covered |
| AC-FR-6 | OP-W2 step1 + hostile branches | covered |
| AC-FR-7 | OP-H1 + OP-H2 (4 sites) | covered |
| AC-FR-8 | OP-W1 --delete branch + grep-audit surface | covered |
| AC-FR-9 | OP-W0 step6 + OP-W4 6c + OP-H1 2a | covered |
| AC-FR-10 | OP-W1 3a-9a defaults + actor/status/blocking validation | covered |
| EC-1 | OP-W1b 1a-SLUG | covered |
| EC-2 | OP-W1b 1a-TITLE | covered |
| EC-3 | OP-W1 7 + OP-W1b 1a-ACTOR | covered |
| EC-4 | OP-W2 step1 (10k rationale) | covered |
| EC-5 | OP-W1 5b (0, 2147483647) | covered |
| EC-6 | OP-W3 5c+7 (atomic mv, last-wins, both valid) | covered |
| EC-7 | OP-W3 step7 (atomic mv; reader sees old or new) | covered |
| EC-8 | OP-W4 6a-6e (JSON persists, failure surfaced) | covered |
| EC-9 | OP-W3 2/3a/7a | covered |
| EC-10 | OP-W4 2a-PERSIST ([OPEN-Q-A] RESOLVED via D-7) | covered (PERSIST branch traced; FATAL rejected) |
| EC-11 | OP-W3 step2 | covered |
| EC-12 | N/A: writer is a plain CLI; FR-7 loop-auto-capture is the coordinator's responsibility, not the writer's. Manual invocation works the same as coordinator invocation. |
| EC-13 | OP-W2 step1 hostile (JSON breakout) | covered |
| EC-14 | OP-W2 step1 hostile (XSS + SQL) | covered |
| EC-15 | OP-W3 5c-append x100 (insertion order preserved) | covered |
| EC-16 | OP-W3 5c-replace (any status -> any status; iteration caller-supplied) | covered |
| EC-17 | OP-W1 --delete branch + AC-FR-8 audit | covered |
| EC-18 | OP-W1 4a (UTC default regardless of TZ) | covered |
| EC-19 | OP-W1 9 (malformed caller TS rejected) | covered |
| EC-20 | OP-W1 4a + 9 (UTC normalization on DST boundary) | covered |
| EC-21 | OP-W2 step1 (UTF-8 verbatim via jq --arg) | covered |
| EC-22 | OP-W2 step1 (em dash in caller text persists; NFR-5 only bans in writer's OWN code/copy) | covered |
| EC-23 | OP-W3 5c (1000 entries; O(n) jq walk; perf note in §4) | covered |
| EC-24 | OP-W3 3a/7a (disk full at mktemp or mv) | covered |

## 4. Complexity

| Operation | Time | Space | I/O calls | Idempotent | Reentrant |
|---|---|---|---|---|---|
| OP-W1 parse_and_validate_args | O(n) in argv length | O(1) | 0 | yes (pure parse) | yes |
| OP-W1b refuse_on_missing_or_invalid | O(1) (5 fixed fields) | O(1) | 0 | yes | yes |
| OP-W2 build_decision_object | O(L) where L = total arg length | O(L) | 0 | yes | yes |
| OP-W3 upsert_by_key_atomic | O(n) in array size (jq walks once for index, once for map = O(2n)) | O(n) (jq loads the file) | 2 fs (read TARGET, mv TMP onto TARGET) | yes (same id+fields -> same file) | NO for same (slug,id); atomic mv gives last-wins (EC-6) |
| OP-W4 delegate_to_record_sh | O(1) | O(1) | 1 subprocess (record.sh) | yes (UNIQUE upsert in SQLite) | yes |
| OP-H1 record_decision | O(1) | O(1) | 1 subprocess (writer) | yes | yes |
| OP-H2 (4 sites) | O(1) per site | O(1) | 1 per resolved decision | yes | yes |

Notes:
- No operation is worse than O(n). No operation makes more than 3 external
  I/O calls (OP-W3 makes 2, OP-W4 makes 1, OP-H1 makes 1).
- EC-23 (1000 entries): OP-W3 does an O(2n) jq walk. p95 target 500ms holds
  because jq is C-speed at this scale; flagged for the test_plan to verify
  rather than assume.
- EC-6 reentrancy: OP-W3 is NOT reentrant for the same (slug,id). Two
  concurrent writers each produce a valid TMP; both `mv` succeed
  (POSIX rename is atomic on the same filesystem); the last mv wins. The
  final file is valid JSON with exactly one entry for that id. No temp
  files linger (each writer's trap cleans its own TMP). The test_plan MUST
  exercise this concurrently.

## 5. Failure Paths

External dep: filesystem (`planning/` dir)
  - DIR missing: OP-W3 step2 -> exit 4, no file at TARGET.
  - DIR read-only (EC-11): OP-W3 step2 -> exit 4 (or step 3a mktemp fails -> exit 4).
  - Disk full at mktemp (EC-24): step 3a -> exit 4, no file at TARGET.
  - Disk full at mv (EC-24): step 7a -> exit 4, original TARGET unchanged, TMP removed best-effort.
  - Signal mid-write (INT/TERM): cleanup trap removes TMP; TARGET unchanged.
  Final state: TARGET either absent or unchanged; no temp files in DIR.

External dep: jq subprocess
  - jq absent at writer startup: defensive check (mirror bless-verify.sh:60).
    Refuse at startup with exit 2 ("jq is required"). NOT a runtime branch.
  - jq build fails (OP-W2 step2): exit 3, no file write attempted.
  - jq upsert output invalid (OP-W3 step6): TMP removed, TARGET unchanged, exit 5.

External dep: `decision-log/record.sh` subprocess
  - Missing on PATH (EC-10): OP-W4 step2a -> [OPEN-Q-A] RESOLVED via D-7.
    Winner (Q-2 2a-PERSIST): exit 7, JSON stays, stderr surfaces. The writer
    exits non-zero so the coordinator can retry the sync; JSON is never
    withheld. (2a-FATAL spec-literal branch rejected by D-7.)
  - Non-zero exit (EC-8: SQLite busy, disk full at SQLite layer):
    OP-W4 step6 -> JSON persists, stderr logs exit code, writer exit 8.
    Coordinator re-run is safe (idempotent upsert).
  - record.sh `--supersede <Dn>` path: NOT used by the writer. Status
    transitions are encoded in `--status` and the writer's own upsert; the
    SQLite supersede-via-removal is the sink's concern and out of scope.

External dep: concurrent writer for same (slug,id) (EC-6)
  - Both compute ENTRY independently.
  - Both allocate own TMP via mktemp (no collision: `mktemp "$DIR/.dec.XXXXXX"`).
  - Both `jq` against the TARGET they read; the slower one overwrites the
    faster one's commit via atomic mv.
  - Final state: one entry for that id; both files were valid JSON; no
    temp files linger.

Invariants after every failure path (SPEC §5 invariants):
  - TARGET is valid JSON (`jq empty` succeeds) OR absent. Never partial.
  - No DELETE issued (file truncate, rm of unrelated entries, or SQL DELETE).
  - rationale / alternatives appear ONLY in TARGET and the SQLite register.
    Never on stdout, stderr, in /tmp, or in the coordinator log line.

## 6. Data Structures

- **ENTRY (jq-built object)**: keys {id, actor, title, chosen, rationale,
  alternatives, status, iteration, blocking, timestamp}. Built via
  `jq -n --arg / --argjson` so all untrusted text is escaped by jq (single
  source of escape logic; the writer never hand-rolls JSON). Justification:
  FR-6 hostile-input requirement; matches `bless-verify.sh:137-141` jq pattern.
- **Ledger file `planning/.VERIFY_<slug>.decisions.json`**: object with keys
  {slug, decisions:[]}. The `decisions` array is an ordered list of ENTRY
  objects; upsert lookup is by `id` within the file (slug scope is encoded
  in the filename, collapsing the (slug,id) key to id-within-file).
  Justification: mirrors the renderer's locked contract at
  `section-decisions.sh:14,38-51` (single array projected via jq @tsv).
  Hash-by-id is approximated by jq's `index($new.id)` (O(n) walk); fine at
  EC-23 scale (1000 entries, jq is C-speed).
- **No new SQLite schema**: the writer never opens `decisions.db` directly.
  All SQL flows through `decision-log/record.sh`, which owns `schema.sql`
  and the `UNIQUE(project,slug,decision_id)` constraint (FR-5 composition).

## 7. State Transitions

Decision entity lifecycle (FR-2, FR-8, EC-16). NFR-6 requires this diagram
be mirrored in `readme/state-machines.md` at commit time.

```
                                             任何 status -> 任何 status 合法
                                              (upsert 替换，无 forward-only gate)

      [first call]         --status=proposed-->
           |                                    |
           v                                    v
       PROPOSED  ----status=accepted---->   ACCEPTED
           |                                    |
           |        --status=superseded-->      |
           v                                    v
       SUPERSEDED  <--status=superseded---- SUPERSEDED
           ^                                    |
           |        --status=accepted (EC-16)---|
           +------------------------------------+

  No DELETE issued at any transition (FR-8 invariant).
  iteration (caller-supplied, default 1) is NOT a state axis.
```

- Trigger: each transition is a writer invocation with a new `--status`.
- Effect: the existing array element matching `(slug,id)` is REPLACED.
- Relative order of every other element preserved (FR-2).
- No transition is gated. `accepted -> proposed -> accepted` is legal; the
  writer does not enforce a forward-only flow (callers can correct mistakes).
- The SQLite sink's `--supersede <Dn>` flag is NOT used by the writer;
  supersession is encoded via `--status superseded` on the new entry.

---

## Open Questions (BLOCKING triage per cfn-decide rule)

**[OPEN-Q-A] (BLOCKING)** EC-10 branch split in OP-W4 step2a (record.sh
missing on PATH). SPEC §5 postcondition for "record.sh missing" says "no
JSON file created; exit non-zero (fail-closed: dual-write contract is
all-or-nothing)". Q-2 PARKED default says "persist JSON, surface SQLite
failure separately". These conflict when record.sh is missing AND OP-W3
has already written TARGET (which is the natural consequence of Q-2's
JSON-first dual-write order).
- Downstream-consumed by: cfn-arch (picks writer's record.sh-missing
  behavior, which determines OP-W3/OP-W4 ordering); cfn-test-plan (one
  test per branch, plus a test that the chosen ordering holds under
  concurrent failure).
- RESOLVED via D-7 (user-approved 2026-07-28): 2a-PERSIST wins. OP-W0 order
  (OP-W3 before OP-W4) is correct as written; no reorder needed. SPEC §5 /
  EC-10 / FR-5 patched to match. (Prior conservative default: 2a-FATAL
  spec-literal, rejected.)
- Recommendation: raise to user as one decision: "When record.sh is
  missing, should the writer (a) refuse to write JSON at all (spec-literal,
  dual-write lockstep, requires reordering OP-W3/OP-W4), or (b) write JSON
  and surface the SQLite failure separately (Q-2 persist-and-surface)?"

**[OPEN-Q-B] (BLOCKING)** OP-H1 step3 fail-closed vs isolate. FR-7 literal
text: "A non-zero writer exit code SHALL fail the calling phase (fail-closed)."
Task directive: "a hook-record failure must NOT break the coordinator flow
(wrap so a failed record.sh logs but the loop continues, except where the
decision itself is load-bearing)." These conflict at three of four hook
sites (Phase 4.2 product-owner, Phase 5 user-batch, megaplan L3 decide).
- Downstream-consumed by: cfn-arch (decides whether the coordinator wraps
  with `|| true` or propagates the exit code); cfn-test-plan (must test
  both behaviors per site, with one site - 5E.4 quarantine - always fatal).
- RESOLVED via D-8 (user-approved 2026-07-28): ISOLATE at ALL four sites
  (Phase 4.2, Phase 5 batch, megaplan L3, AND Phase 5E.4 quarantine).
  FR-7 literal "SHALL fail the calling phase" overridden; SPEC FR-7 patched
  to match. (Prior conservative default: ISOLATE at 3 sites + FAIL-CLOSED
  at quarantine, rejected.)
- Recommendation: raise to user as one decision: "Should a record.sh
  failure at the coordinator hooks (a) fail the calling phase per FR-7
  literal, or (b) log and continue except at the quarantine site (task
  directive)?"

## Parked items (non-blocking, conservative defaults carried forward)

- **[PARKED: Q-2 default applied]** OP-W4 dual-write order is JSON-first,
  SQLite-second. JSON is NOT rolled back on SQLite failure (stderr + non-zero
  exit). Source: SPEC §7 Q-2.
- **[PARKED: Q-4 defaults applied]** OP-W1 defaults: iteration=1,
  status=proposed, blocking=false, timestamp=UTC ISO 8601 now, actor required
  with no default. Source: SPEC §7 Q-4 / FR-10.
- **[PARKED: single decision per invocation]** OP-W0 handles one (slug,id)
  per call. Batch is out of scope. Source: SPEC §7 Q-3.
- **[PARKED: project auto-derived]** OP-W4 does NOT pass `--project`;
  record.sh derives it from `git rev-parse --show-toplevel` basename.
  Source: SPEC §7 Q-6.
- **[PARKED: tests under `cfn-decisions/tests/`]** Q-5 test location deferred
  to write-plan. Source: SPEC §7 Q-5.
- **[PARKED: em dashes in caller text]** NFR-5 bans em dashes in writer's
  OWN code, comments, SKILL.md copy, and coordinator-hook prose. Caller
  rationale text is persisted verbatim (renderer escapes downstream).
  Source: SPEC §7 NFR-5 / EC-22.

---

## Return block

```
artifact: planning/PSEUDO_decisions_ledger.md
operations: 8 (OP-W0 entry, OP-W1 parse, OP-W1b refuse-gate, OP-W2 build,
             OP-W3 upsert-atomic, OP-W4 delegate, OP-H1 helper, OP-H2 4 sites)
unmapped_branches: 0
uncovered_spec_items: 0   (EC-12 marked N/A with reason: writer is a plain CLI,
                          FR-7 capture is the coordinator's responsibility)
gate: PASS
open_questions_blocking: 0  (both RESOLVED via D-7/D-8 user-approved 2026-07-28;
                          inline [OPEN-Q-A]/[OPEN-Q-B] markers retained as
                          branch-split documentation; banner at top governs)
```
