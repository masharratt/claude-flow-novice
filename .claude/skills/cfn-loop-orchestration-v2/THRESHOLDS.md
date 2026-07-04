# CFN Loop Thresholds (Single Source of Truth)

Every CFN Loop threshold lives in this table. All other files (`cfn-loop-task.md`, `cfn-loop-cli.md`, `lib/orchestrator/SKILL.md`, `lib/validation/SKILL.md`) reference this file. If any file disagrees with this table, this table wins; fix the other file.

All values are decimals in [0.0, 1.0], never percentages.

| Mode | test_pass_rate_gate | confidence_gate (CLI mode only) | consensus | max_iter |
|------|---------------------|---------------------------------|-----------|----------|
| mvp | 0.70 | 0.70 | 0.80 | 5 |
| standard | 0.95 | 0.75 | 0.90 | 10 |
| enterprise | 0.98 | 0.85 | 0.95 | 15 |

## Definitions

- **test_pass_rate_gate**: passing tests / total tests from the coordinator's authoritative run, as a decimal. Computed mechanically by `cli/gate-check.sh` from the coordinator's test output file. Agent self-reported test numbers are never used for the gate. This is the ONLY gate metric in Task Mode (`/cfn-loop-task`).
- **confidence_gate**: agent self-reported confidence. CLI mode (`/cfn-loop-cli`) only; ignored entirely in Task Mode. Computed by the mechanical rubric in `lib/validation/SKILL.md` (start 1.0, subtract fixed penalties, report the arithmetic).
- **consensus**: validators voting PASS / validators spawned, as a decimal.
- **max_iter**: maximum Loop 3 iterations before the loop reports failure and exits.

## Vocabulary note

Planning tier vocabulary is `mvp|beta|enterprise` (cfn-megaplan); execution mode vocabulary is `mvp|standard|enterprise`. Tier `beta` maps to mode `standard`.

## Gate mechanics (Task Mode)

```bash
./.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh \
  --out <test-output-file> --threshold <test_pass_rate_gate>
# exit 0 = gate passed (rate >= threshold AND total > 0)
# exit 1 = gate failed (rate < threshold)
# exit 2 = no tests detected (0/0 never passes)
```
