---
name: cfn-loop-orchestration
description: "CFN Loop workflow orchestration - three-loop structure management with gate checks and consensus. Use when coordinating Loop 3 implementers and Loop 2 validators, managing iteration cycles, or enforcing quality gates."
version: 3.2.0
tags: [orchestration, cfn-loop, workflow, consensus]
status: production
---

# CFN Loop Orchestration Skill

## Metadata
- **Skill ID:** cfn-loop-orchestration
- **Version:** 3.2.0
- **Category:** Workflow Orchestration
- **Maturity:** Production
- **Last Updated:** 2026-07-03

## Supported Entry Point (verified on disk)

The ONLY supported entry is:

```bash
$HOME/.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh
```

It routes to `cli/resolve-provider-model.cjs` via Node. Nothing else in this skill directory is a supported entry point.

**In Task Mode (`/cfn-loop-task`) do NOT use Redis, helpers/, or dist/cli; agents return output directly. CLI/Redis sections apply only to `/cfn-loop-cli` mode.**

The following entry points that earlier versions of this document referenced do NOT exist on disk and must not be invoked or cited:
- `dist/cli/orchestrator-cli.js` (missing)
- `helpers/*.sh` (gate-check, consensus, iteration-manager, deliverable-verifier, timeout-calculator: directory missing)
- `.claude/skills/redis-coordination/` (skill missing)
- `.claude/skills/cfn-loop-orchestration/test-cfn-orchestration.sh` (path missing)

For the mechanical test gate, use the verified script:

```bash
$HOME/.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh \
  --out <test-output-file> --threshold <decimal>
# exit 0 = pass, 1 = fail, 2 = no tests detected (0/0 never passes)
```

## Purpose
Orchestrates the Complete Fail Never (CFN) Loop workflow, managing the three-loop structure:
- Loop 3 (Primary Swarm - Implementation)
- Loop 2 (Consensus Validators - Review)
- Product Owner Decision (Strategic Approval)

## Responsibilities
1. Coordinate multi-agent CFN Loop execution
2. Manage gate checks and consensus validation
3. Handle iteration cycles with feedback injection
4. Execute Product Owner decision flow
5. Enforce dependency ordering (Loop 3 -> Loop 2 -> PO)

## CFN Loop Flow

```
1. Spawn Loop 3 Agents
   |
2. Collect Loop 3 results (Task Mode: direct output; CLI mode: provider runtime)
   |
3. Gate Check (cli/gate-check.sh on coordinator's test output)
   |- PASS -> Start Loop 2
   |- FAIL -> Iterate Loop 3 with feedback (goto step 1)
   |
4. Loop 2 Validates Loop 3 Work
   |
5. Collect Loop 2 consensus
   |
6. Product Owner Decision
   |- PROCEED -> Exit success
   |- ITERATE -> Iterate (goto step 1)
   |- ABORT -> Exit failure
```

## Mode-Specific Thresholds

Single source of truth: `.claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md`. Do not restate values here; read that file. Summary of column meanings:

- `test_pass_rate_gate`: passing/total from the coordinator's authoritative test run (decimal). The only gate metric in Task Mode.
- `confidence_gate`: agent self-reported confidence, CLI mode only, computed by the mechanical rubric in `lib/validation/SKILL.md`.
- `consensus`: validators voting PASS / validators spawned.
- `max_iter`: iteration cap per mode.

## Error Handling

### Recoverable Failures
- Gate check failure: iterate Loop 3 with failing-test excerpts as feedback
- Consensus failure: iterate all agents
- Missing deliverables: force iteration with explicit feedback

### Critical Failures
- Max iterations exceeded: report failure and exit
- Agent spawn failure: retry once, then escalate

## Success Criteria

This skill is considered successful when:
1. CFN Loop slash commands (`/cfn-loop-task`, `/cfn-loop-cli`) work without modification
2. Gate decisions are made only by `cli/gate-check.sh` output, never by inline parsing
3. Thresholds are read from THRESHOLDS.md, never hardcoded
