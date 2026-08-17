---
description: "Publish a plan, spec, or any project markdown doc as a private shareable web page so a non-terminal colleague can read it. Re-sharing the same doc updates the same link."
argument-hint: "[path/to/doc.md]"
allowed-tools: ["Read", "Bash", "Skill", "Artifact", "AskUserQuestion"]
---

# CFN Share

Turn a markdown planning artifact into a private hosted page with a stable URL.

**Target:** $ARGUMENTS (empty resolves to the newest `PLAN_*.md` across `planning/<slug>/` and legacy flat `planning/`)

## Execute

Follow `.claude/skills/cfn-share/SKILL.md` protocol exactly.

```
Skill: cfn-share
Args:  $ARGUMENTS
```

Short form of the protocol:

1. `.claude/skills/cfn-share/resolve.sh $ARGUMENTS` -> JSON with `abs`, `title`, `url`, `stale`.
2. Read the resolved file end to end. Refuse to publish if it contains credentials, tokens, or customer data.
3. Load `artifact-design`, then `Artifact` with `file_path` = the `.md` itself. Pass `url:` when the sidecar has one, so the existing link updates in place.
4. `.claude/skills/cfn-share/record-url.sh "<abs>" "<url>"` on every publish.

## Mandatory output checks

- File was read in full before publishing.
- Re-shares passed `url:` (a missing `url:` orphans the link the reader already has).
- `record-url.sh` ran, so the sidecar sha matches the published bytes.

## Next steps

- Send the link, and point the reader at the plan's Assumptions section first.
- Feedback comes back as findings routed through the owning phase skill, then `/cfn-share` again to refresh the same URL.
- Plan approved: `/cfn-loop-task "<task>"`.
