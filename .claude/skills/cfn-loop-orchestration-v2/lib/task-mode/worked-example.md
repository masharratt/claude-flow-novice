<!-- Extracted from .claude/commands/cfn-loop-task.md so the command body stays
     small. Read on demand from the phase that needs it. -->
# Worked example (abbreviated transcript)

## Worked Example (abbreviated transcript)

```
[Iter 1] Lane derivation: lanes api, ui; edges: api Consumes src/types.ts:Claims
         Produced by a shared 'types' step folded into api -> edge types->ui.
         Waves: wave1=[api], wave2=[ui] (empty-edge plans would be one wave).
[Iter 1] Wave1 spawn lane=api. Barrier. Producer guard: grep Claims in
         src/types.ts -> resolves. Wave2 spawn lane=ui.
[Iter 1] Agents return JSON: api 12/12 scoped, ui 8/9 scoped
[Iter 1] Step 3.0: tsc -> 0 errors. Step 3.1: npm test -> tee output
[Iter 1] gate-check.sh --out ... --threshold 0.95
         -> {"pass":18,"total":21,"rate":0.8571,"passed":false} exit 1
[Iter 1] Gate FAILED. Build retry context: 18/21, threshold 0.95,
         grep -A5 "FAIL" excerpts (3 failing tests in ui lane)
[Iter 2] Respawn ui lane only with retry context:
         "FIX ONLY THESE FAILURES. Do not refactor passing code."
[Iter 2] tsc -> 0 errors. gate-check.sh
         -> {"pass":21,"total":21,"rate":1.0000,"passed":true} exit 0
[Phase 4] Step 4.0 gate set: always dry-review; frontend=no, db=no -> no
          security/migration/a11y; no dep/perf triggers. Only dry-review.
[Phase 4] /cfn-dry-review -> manifest with 3 suggestions
[Phase 4] /cfn-vote-implement <explicit-path>: item A 3/3 -> auto-implemented
          with TDD; item B 2/3 -> product-owner says DEFER (backlogged);
          item C 1/3 -> queued
[Phase 5] AskUserQuestion batch (1 question): user picks Skip.
[Phase 5] 5E.0 mutation probe on core FR-1 impl: invert conditional ->
          verify-run.sh --only AC-1,AC-2 -> red (caught). Restore, hash OK.
[Phase 5] 5E.1 verify-run.sh run -> VERIFY_RESULTS_auth.json
[Phase 5] 5E.2 1 needs_agent row (playwright login) -> agent captures excerpt
          -> verify-run.sh resolve --pass true
[Phase 5] 5E.3 verify-run.sh summary -> exit 0 (all green)
[Phase 5] 5E.3a backfill-evidence -> 22 rows PENDING -> real output;
          bless-verify.sh --stage exit -> blessed #2 (predicate_changed false)
[Phase 5] 5E.4 gate-check.sh --threshold 1.0 -> 22/22 all green
[Phase 5] 5E.4a deferrals.sh gate --slug auth -> exit 0 (no open blocking needs)
[Phase 5] 5E.5 frontend=no -> skip build smoke. EXIT (done).
```

---
