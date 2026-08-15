---
description: "Planning pipeline for deep NON-CODE deliverables (strategy docs, proposals, competitive analysis, board updates, research memos). Plans how it will produce the document before writing a word of it, then gates the draft on traceable claims."
argument-hint: "<deliverable> [--quick]"
allowed-tools: ["Task", "Read", "Write", "Edit", "Bash", "Skill", "AskUserQuestion"]
---

# CFN Knowledge Plan

Non-code branch of the planning pipeline. `cfn-megaplan` plans builds; this plans documents.

**Deliverable:** $ARGUMENTS

## Execute

Follow `.claude/skills/cfn-knowledge-plan/SKILL.md` protocol exactly.

```
Skill: cfn-knowledge-plan
Args:  $ARGUMENTS
```

The rule that matters: **no drafting before `planning/KPLAN_<slug>.md` is approved.**
Levels 1-3 (source intake, deliverable brief, extraction plan + outline) are the plan for
the plan. Levels 4-6 (extract, synthesise, draft) execute it.

## Mandatory output checks

- `planning/KSOURCES_<slug>.md` gives every source an `SRC-n` id, and marks anything it
  could not actually read as `UNREADABLE`.
- `planning/KBRIEF_<slug>.md` names the audience and the decision the doc must support.
- `planning/KPLAN_<slug>.md` existed and was surfaced before any draft text was written.
- `KEVIDENCE_*` files hold verbatim quotes with locators, not paraphrase.
- Bar K clean: `.claude/skills/cfn-knowledge-plan/bars/check-grounding.sh "planning/KDOC_<slug>.md" "planning/KSOURCES_<slug>.md"`
- Bar B clean: `.claude/skills/cfn-megaplan/bars/check-haiku-static.sh "planning/KDOC_<slug>.md"`

## Next steps

- Share with the humans who need to read it: `/cfn-share planning/KDOC_<slug>.md`
- If the doc concludes in a build: feed its conclusions to `/cfn-megaplan "<build task>"`, and
  record resolved forks via `.claude/skills/cfn-decisions/record.sh` so the build plan does not
  re-open them.
