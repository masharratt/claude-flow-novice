<!-- Extracted from .claude/commands/cfn-loop-task.md so the command body stays
     small. Read on demand from the phase that needs it. -->
# Exit gate 5E.0 to 5E.6 and the exit report

### Exit gate (mechanical VERIFY gate, ordered 5E.0 -> 5E.5)

The done verdict is mechanical, not honor-system. `verify-run.sh` reads the results file it writes; prose never counts. Steps 5E.0-5E.3 run only when a VERIFY manifest exists (Step 0); a non-megaplanned task skips them and starts at 5E.4. 5E.4a (deferrals gate, S006) always runs, VERIFY manifest or not. This gate MAY iterate back to Phase 2 (bounded by MAX_ITERATIONS): a red AC, a surviving mutation, or an open blocking deferral is iteration fuel.

#### 5E.0 Mutation spot-check (W5, runs FIRST)

At entry, emit the verify phase event:

```bash
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event verify_started || true
```

Runs first so any residue a mutation leaves behind is caught by the later all-green gate (5E.4). Per `[core]` FR in the manifest, capped at 3:

1. Pick the primary impl file for that FR from the PLAN lane mapping. Write a one-line justification of the choice into the report.
2. Back it up and record the hash BEFORE mutating (no git stash: that would sweep uncommitted loop work):
   ```bash
   mkdir -p /tmp/cfn-mutation-${TASK_ID}
   cp "${IMPL_FILE}" "/tmp/cfn-mutation-${TASK_ID}/$(basename "${IMPL_FILE}")"
   BEFORE_SHA=$(sha256sum "${IMPL_FILE}" | cut -d' ' -f1)
   ```
   Install a restore-on-exit trap so a crash between mutate and restore cannot leave the file mutated:
   ```bash
   trap 'cp "/tmp/cfn-mutation-${TASK_ID}/$(basename "${IMPL_FILE}")" "${IMPL_FILE}" 2>/dev/null' EXIT
   ```
3. Spawn a mutation agent that makes exactly ONE semantic mutation (invert a key conditional OR replace a body with a constant), emits a unified diff, and touches nothing else.
4. Run `verify-run.sh run --verify "$VERIFY_FILE" --only <that FR's AC ids>` and EXPECT red. A red result means the AC tests actually exercise the mutated logic.
5. Restore the backup and assert the restored file's hash equals `BEFORE_SHA`:
   ```bash
   cp "/tmp/cfn-mutation-${TASK_ID}/$(basename "${IMPL_FILE}")" "${IMPL_FILE}"
   [ "$(sha256sum "${IMPL_FILE}" | cut -d' ' -f1)" = "${BEFORE_SHA}" ] || echo "STOP FOR: corrupted state"
   ```
   Hash mismatch after restore = Stop For (corrupted state, manual recovery).
6. **GREEN after mutation = the mutation survived** (the AC tests did not catch it). Record it and iterate once with "strengthen AC tests for FR-x" (back to Phase 2, counts against MAX_ITERATIONS). If it survives AGAIN on the next pass -> Stop For.

`cfn: single-mutation probe, upgrade to a real mutation framework if survival rate matters` (deliberate shortcut: one mutation per FR, not exhaustive operators).

#### 5E.1 Run the VERIFY manifest mechanically

```bash
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool verify-run.sh -- \
  $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/verify-run.sh run \
  --verify "$VERIFY_FILE" \
  --out "${PDIR}/VERIFY_RESULTS_${RUN_ID}.json"
```

This executes every executable/db-query AC and writes the results file (the single done authority).

#### 5E.2 Resolve needs_agent / predicate_unverified rows

For each results row with `mode: needs_agent` or `predicate_unverified: true` (`pass: null`, UNRESOLVED), spawn a verification agent. The spawn prompt MUST pin that AC's `check`, `pass`, trigger, seeds, and signal, and MUST require a verbatim evidence excerpt (the agent captures real output, it does not assert). Then stamp the evidence:

```bash
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool verify-run.sh -- \
  $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/verify-run.sh resolve \
  --results "${PDIR}/VERIFY_RESULTS_${RUN_ID}.json" \
  --ac <AC-id> --pass true|false --evidence-file <captured-evidence-file>
```

`resolve` refuses evidence under 3 non-empty lines. An unresolved row can never count as done.

#### 5E.3 Summary = the done verdict

```bash
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool verify-run.sh -- \
  $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/verify-run.sh summary \
  --results "${PDIR}/VERIFY_RESULTS_${RUN_ID}.json"
SUMMARY_EXIT=$?
```

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | all green AND nothing unresolved | This is the done verdict source. Proceed to 5E.4 |
| 1 | red or unresolved AC(s) | The red ACs are iteration fuel: go back to Phase 2 (counts against MAX_ITERATIONS). If ITERATION > MAX_ITERATIONS, report failure and EXIT |
| 4 | VERIFY sha256 mismatch | Stop For (the manifest was edited since Bar A; same as Step 0a) |

#### 5E.3a Backfill evidence and re-bless at the exit stage (S007)

Runs only when 5E.3 exited 0. The manifest was blessed at plan stage with `evidence: "PENDING: <reason>"` on rows whose code did not exist yet; the run above executed every check, so its recorded output is the real evidence.

```bash
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool verify-run.sh -- \
  $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/verify-run.sh backfill-evidence \
  --results "${PDIR}/VERIFY_RESULTS_${RUN_ID}.json" \
  --verify  "$VERIFY_FILE"

bash "$CFN_FAILLOG" wrap --tool bless-verify.sh -- \
  $HOME/.claude/skills/cfn-megaplan/bars/bless-verify.sh "$VERIFY_FILE" \
  --stage exit --note "exit gate: evidence backfilled from VERIFY_RESULTS"
```

Only green rows are backfilled. `bless-verify.sh --stage exit` refuses (exit 1) on any surviving `PENDING`, which means an AC reported green without producing output — treat that as a red row, not a formality, and iterate. The re-bless re-pins the sidecar over the rewritten file; skipping it leaves the sidecar stale and the next `verify-run.sh` exits 4.

#### 5E.4 All-green final gate (W4)

Code changed since Phase 3 (vote-applied 3/3, 2/3, 1/3 items), so a mandatory final FULL-suite re-run is required. This gate is `--threshold 1.0`, not the mode rate gate.

```bash
npm test 2>&1 | tee /tmp/test-final-${TASK_ID}.txt
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool gate-check.sh -- \
  $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh \
  --out /tmp/test-final-${TASK_ID}.txt --threshold 1.0
```

- Red -> run the Step 3.2 W8 flaky re-run FIRST (a green-on-rerun red is flaky-flagged, not real).
- Persistent reds -> at most 2 quick-fix attempts.
- Still red after 2 attempts -> `AskUserQuestion` (one decision): **Quarantine** / **Keep iterating** / **Abort**.

  **FR-7 SITE 3 (Phase 5E.4 quarantine) decisions-ledger capture.** Record the user's quarantine choice AFTER the `AskUserQuestion` returns AND BEFORE the dispatch below. One writer invocation total (one decision by design). Status mapping: `Quarantine -> accepted`, `Keep iterating -> proposed`, `Abort -> superseded`. `actor=human`. `blocking=true` (quarantine is load-bearing for Step 3.05 hygiene). D-8 isolation: the audit row is an audit side-effect, not a gate on the quarantine itself; `test.skip` still happens, backlog entry still lands, the loop continues regardless of writer RC.

  ```bash
  # FR-7 SITE 3: record the quarantine/iterate/abort decision (actor=human, D-8 isolated).
  # Set DEC_ID, DEC_TITLE, DEC_CHOSEN, DEC_RATIONALE, DEC_ALTS, DEC_STATUS per the user's choice.
  # hook.sh owns the D-8 isolation envelope + per-site marker (DRY across sites 1/2/3).
  export RUN_LOG="${RUN_LOG:-/tmp/decisions-ledger-${TASK_ID:-unknown}.log}"
  bash $HOME/.claude/skills/cfn-decisions/hook.sh \
      --site phase-5E.4-quarantine \
      --slug "${SLUG:-$TASK_ID}" \
      --id "$DEC_ID" \
      --title "$DEC_TITLE" \
      --chosen "$DEC_CHOSEN" \
      --actor human \
      --rationale "${DEC_RATIONALE:-}" \
      --alternatives "${DEC_ALTS:-}" \
      --status "${DEC_STATUS:-accepted}" \
      --blocking true
  # Quarantine / Phase 2 return / report+exit proceed regardless of writer RC (hook.sh always exits 0; D-8).
  ```

  - **Quarantine**: recorded in the report + wrap the test in `test.skip` carrying `// cfn-allow-skip: quarantined <date> <reason>` (this is what makes Step 3.05 hygiene accept it) + a backlog entry.
  - **Keep iterating**: back to Phase 2 (counts against MAX_ITERATIONS).
  - **Abort**: stop and report.

**Final done is all-green OR an explicit user-approved quarantine. 0.95 is never a done state.** The mode rate gate (Phase 3) is iteration fuel only; this final gate is the completion bar.

#### 5E.4a Deferral gate (S006, always runs, origin: ROOTCAUSE_mpa_thread_wiring_gap.md)

Runs regardless of whether a VERIFY manifest exists (unlike 5E.0-5E.3, which
are megaplan-only) because `out_of_scope_needs` can be reported by any lane in
any task-mode run. This is the mechanical fix for the exact gap that let MP-A
ship: an implementer correctly flagged an unfinished cross-lane wiring step in
`out_of_scope_needs` (Step 3.01 persisted it), and nothing downstream ever
consumed it — the loop declared 81/81 all-green over a feature unreachable
from `src/index.ts`.

```bash
CFN_FAILLOG="$HOME/.claude/cfn-scripts/log-tool-init-failure.sh"
bash "$CFN_FAILLOG" wrap --tool deferrals.sh -- \
  $HOME/.claude/skills/cfn-loop-orchestration-v2/cli/deferrals.sh gate --slug "${SLUG:-$TASK_ID}"
DEFERRALS_GATE_EXIT=$?
```

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | no open blocking deferrals (or none were ever recorded) | ANDs into the done verdict; proceed to 5E.5 |
| 1 | one or more open blocking deferrals | NOT DONE. The printed offenders (lane + text, stderr) name the file/step still owed: go back to Phase 2 and route that file to the lane that owns it. Counts against MAX_ITERATIONS. If ITERATION > MAX_ITERATIONS, escalate (Stop For) instead of silently declaring done |

A deferral only clears via an explicit `deferrals.sh resolve --slug ${SLUG:-$TASK_ID} --id <n> --reason <text>` once the deferred work actually lands — never by re-running the gate itself. **Done requires 5E.4 (all-green) AND 5E.4a (no open blocking deferrals).**

#### 5E.5 Prod-build smoke (W8a, runs LAST)

If SPEC `frontend: yes` AND `package.json` has a `build` script:

```bash
npm run build 2>&1 | tee /tmp/build-smoke-${TASK_ID}.txt
```

- Non-zero exit = red. At most 2 fix attempts (back to Phase 2 with the build output as context), then Stop For.
- Runs last so the built artifact reflects all vote-applied and quarantine changes.

### Exit report

**Final workbench render.** VERIFY_RESULTS is now on disk, so this render shows the populated AC/verify table and final verdict. Order matters: emit `loop_finished` first, stop the watcher second, render last so the page ends on complete data. One last refresh of the open tab.

```bash
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event loop_finished || true
$HOME/.claude/skills/cfn-workbench/watch.sh --slug "$RUN_ID" --stop \
  || echo "WARN: workbench watcher stop skipped (non-blocking)" >&2
$HOME/.claude/skills/cfn-workbench/render.sh --slug "$RUN_ID" --open --live 10 \
  || echo "WARN: workbench render skipped (non-blocking)" >&2
```

#### 5E.6 Run ledger (signal row, non-blocking, runs on EVERY exit path)

Append one row for this run to the global run ledger and print its summary + FLAG lines. This is the only place the two loosening seams (Bar B `sonnet` tier, bounded HOW amendments) get a signal: a `sonnet`-tier plan whose lane hit a spec-gap `blocked_on` ("underspecified", "which symbol", "plan drift") flags "re-gate with `--bar-b=full`"; an amendment whose `what` names a `Produces` symbol flags "run check-produce-consume". Run it on done, on not-done escalation, and on MAX_ITERATIONS exit alike; `--outcome` says which. Never gates.

```bash
REPORT_ARGS=""; for LANE_ID in ${LANE_IDS}; do REPORT_ARGS="$REPORT_ARGS --report /tmp/lane-report-${RUN_ID}-${LANE_ID}.json"; done
$HOME/.claude/skills/cfn-loop-orchestration-v2/cli/run-ledger.sh record \
  --slug "${SLUG:-$RUN_ID}" --plan-dir "$PDIR" --run-plan "${PDIR}/run-plan-${RUN_ID}.json" \
  $REPORT_ARGS --iterations "${ITERATION}" --outcome "${OUTCOME}" \
  || echo "WARN: run ledger skipped (non-blocking)" >&2
# OUTCOME: done | not_done (5E red and MAX_ITERATIONS hit) | escalated (Stop For)
```

Copy every `FLAG:` line it prints into the summary report verbatim. Trend over runs: `run-ledger.sh stats [--slug <slug>] [--last N]` (JSON, grouped by `bar_b_tier`; `spec_gap_runs` climbing on `sonnet` while flat on `full` is the "tier too loose" answer with numbers).

After 5E.5 (or 5E.4 for non-frontend tasks) reports done and 5E.6 has written its row, mark todo #5 completed, report summary, EXIT.

```
Summary report:
  Implementation iterations: ${ITERATION}
  Vote suggestions reviewed: ${TOTAL_SUGGESTIONS}
  Auto-implemented (3/3):    ${COUNT_3_OF_3}
  Product Owner decided (2/3): ${COUNT_2_OF_3}
  User decided (1/3):        ${COUNT_1_OF_3}
  Skipped (0/3):             ${COUNT_0_OF_3}
  Quarantined:               ${QUARANTINED_TESTS}
  Flaky:                     ${FLAKY_TESTS}
  Run ledger:                <the run-ledger.sh summary line, then any FLAG: lines verbatim>
```

**No vote iteration after Phase 5; the Phase 5 Exit gate (5E.0-5E.5) MAY iterate back to Phase 2, bounded by MAX_ITERATIONS.** If the user wants another round beyond MAX_ITERATIONS, they re-run `/cfn-loop-task`.

---
