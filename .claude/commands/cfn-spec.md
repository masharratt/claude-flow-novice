---
description: "SPARC Specification phase. Generate testable acceptance criteria, edge cases, pre/post conditions for a task BEFORE design."
argument-hint: "<task description>"
allowed-tools: ["Task", "Read", "Write", "Bash", "Skill", "AskUserQuestion"]
---

# CFN Spec (SPARC Phase 1)

Standalone Specification phase. Produces `planning/SPEC_<task>.md` with functional requirements, NFRs, Gherkin acceptance criteria, ≥5 enumerated edge cases, pre/post conditions.

For full SPA chain (Spec + Pseudo + Arch), use `/cfn-spa-plan` instead. Use this command when you only need the spec phase (e.g. drafting requirements for human review before deciding to build).

**Task:** $ARGUMENTS

## Execute

Invoke the spec skill and follow `.claude/skills/cfn-spec/SKILL.md` protocol exactly.

```
Skill: cfn-spec
Args:  $ARGUMENTS
```

Spawn the `specification-agent` (defined in `.claude/agents/cfn-dev-team/sparc/specification.md`) to produce the artifact. Write to `planning/SPEC_<sanitized-task>.md`.

## Mandatory output checks

- ≥5 edge cases enumerated (Section 4)
- Every FR has at least one Gherkin scenario in Section 3
- All `[OPEN]` questions surfaced to user via `AskUserQuestion`

## Next steps

- For full design: `/cfn-pseudo "$ARGUMENTS"` then `/cfn-arch "$ARGUMENTS"`
- Or chain all three: `/cfn-spa-plan "$ARGUMENTS"`
- Then: `/write-plan` → `/cfn-plan-review` → `/cfn-loop-cli`
