<!-- Extracted from .claude/commands/cfn-loop-task.md so the command body stays
     small. Read on demand from the phase that needs it. -->
# Flaky re-run protocol (W8)

### Step 3.2: Flaky re-run protocol (W8)

On gate-check exit 1 (rate below threshold), a failure may be flaky rather than real. Before treating reds as iteration fuel:

1. Dedupe the failing test FILES from `/tmp/test-output-${RUN_ID}.txt` (unique file paths, not individual test cases).
2. Re-run ONLY those files once.
3. **Green on rerun** = flaky-flagged. Record the file in the report's `Flaky:` line (see Phase 5 Exit 5E.4). It is NOT iteration fuel. Recompute the effective pass rate inline by moving those tests from failing to passing, and re-evaluate the gate against that effective rate.
4. **Still red on rerun** = a real failure. It stays iteration fuel; proceed with the exit-1 ITERATE action.
5. **Cap:** a test flaky-flagged in ≥2 separate iterations counts as a REAL failure from then on (persistent flakiness is a defect). Track flaky flags per test across iterations.
