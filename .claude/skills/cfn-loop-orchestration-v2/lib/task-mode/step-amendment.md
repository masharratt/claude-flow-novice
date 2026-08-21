<!-- Extracted from .claude/commands/cfn-loop-task.md so the command body stays
     small. Read on demand from the phase that needs it. -->
# Bounded step amendment (sanctioned adaptation)

### Bounded step amendment (sanctioned adaptation, no re-gate)

The plan pins WHAT (files, AC binding, done predicate). It does not have to pin HOW. A lane MAY amend a step's implementation approach without stopping, without `out_of_scope_needs`, and without re-opening Bar B, when ALL THREE hold:

1. **Same files.** The amended step touches only the File cell(s) of that step (all inside the lane's owned list).
2. **Same AC binding.** The step still satisfies the same `Failing test` / VERIFY AC id(s). No AC is added, dropped, or re-mapped.
3. **Same done predicate.** The Done predicate and Verify command are unchanged and still exit 0/1 as written.

Amendments inside that box are `kind: "how"`: a different signature than the Change cell spelled, a different internal algorithm, an extra private helper in the same file, a library call the plan did not name. The lane records each one in `step_amendments` in its final JSON (below) and continues. The coordinator persists them to `run-plan-<run-id>.json` (Step 3.01a) for audit; nothing else reads them as a gate.

Anything outside the box is NOT an amendment and uses the existing channels: another file → `out_of_scope_needs`; a different AC, predicate, or verify command → `blocked_on: "plan drift: <one sentence>"` (the coordinator routes it to a VERIFY/PLAN edit + `bless-verify.sh` and does what its `regate` scope owes; see megaplan Step 7 re-gating). A lane never edits `PLAN_` or `VERIFY_` itself.

Why this exists: before it, "how" learning mid-run had two bad exits: silently deviate (invisible drift) or stop and re-bless the whole manifest (the 1-hour tax). This gives the coordinator an audited middle path and keeps re-bless for changes to what is verified.
