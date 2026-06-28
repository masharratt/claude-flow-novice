---
description: "MUST BE USED after cfn-dry-review or cfn-alpha-launch:manifest produces a manifest. Also verification phase of /cfn-loop-task. Never manually implement code review suggestions - route through this skill. 3-agent voting: 3/3 auto-implemented with TDD, 2/3 to product-owner agent, 1/3 surfaced to user via AskUserQuestion (batched 4 per call, at end)."
argument-hint: "[manifest-path | latest] [--dry-run]"
allowed-tools: ["Agent", "Read", "Write", "Edit", "Bash", "Grep", "Glob", "AskUserQuestion"]
---

# CFN Vote & Implement

Three specialized agents independently review a manifest of code suggestions, vote on each, then auto-implement unanimous items with TDD and surface split decisions to the user.

**Arguments:** $ARGUMENTS

---

## Step 1: Load Manifest

Manifest discovery directory (project-scoped):

```bash
MANIFEST_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.cfn-cache/manifests"
```

- If argument is `latest` or empty: pick the most recent file matching `${MANIFEST_DIR}/cfn-dry-review-*.json` (fall back to `cfn-review-alpha-*.json` / `cfn-review-alpha-v2-*.json` if no dry-review manifest exists). Use `ls -1t "${MANIFEST_DIR}"/cfn-*.json 2>/dev/null | head -1`.
- Otherwise: read the specified path.

If no manifests exist in `${MANIFEST_DIR}`, also check legacy `/tmp/cfn-*.json` for transition compatibility and warn the user to re-run the producing skill.

Parse the manifest. Report: `"Loaded <N> suggestions from <review_id>"`

If the manifest has suggestions with `"status": "implemented"` or `"status": "skipped"`, those are already processed. Only vote on suggestions where status is absent or `"pending"`.

## Step 2: Spawn 3 Voting Agents (PARALLEL)

Spawn all 3 agents simultaneously. Each receives the FULL manifest (all pending suggestions) and reviews them all.

### Agent 1: Correctness Agent (code-reviewer)

```
You are the CORRECTNESS reviewer. Your job is to evaluate risk and technical soundness.

For each suggestion in the manifest, vote YES or NO based on:
- Will this change break existing functionality?
- Is the suggested approach technically sound?
- Are there edge cases, race conditions, or regression risks?
- Does the change maintain or improve type safety?

If a suggestion is risky or the approach is flawed, vote NO even if the goal is worthwhile.

Review the actual code files referenced in each suggestion before voting.

Output a JSON object mapping suggestion IDs to votes:
{
  "S001": { "vote": "YES", "reasoning": "One sentence why." },
  "S002": { "vote": "NO", "reasoning": "One sentence why." }
}
```

### Agent 2: Consistency Agent (code-standards-reviewer)

```
You are the CONSISTENCY reviewer. Your job is to evaluate whether a suggestion aligns with existing codebase patterns and conventions.

For each suggestion in the manifest, vote YES or NO based on:
- Does this follow the patterns already established in the codebase, or introduce a second way of doing something?
- If the codebase already has a convention for this (error handling, module structure, shared utilities), does the suggestion use it?
- Would this create an inconsistency where some modules do it one way and others do it another?
- Does the suggested abstraction match the granularity and style of existing abstractions in the project?

If a suggestion is technically fine but would create a divergent pattern from what the codebase already does, vote NO and explain what the existing convention is.

Review the actual code files referenced in each suggestion AND neighboring/related files to understand existing conventions before voting.

Output a JSON object mapping suggestion IDs to votes:
{
  "S001": { "vote": "YES", "reasoning": "One sentence why." },
  "S002": { "vote": "NO", "reasoning": "One sentence why." }
}
```

### Agent 3: Feasibility Agent (system-architect)

```
You are the FEASIBILITY reviewer. Your job is to evaluate implementation practicality.

For each suggestion in the manifest, vote YES or NO based on:
- Can this be implemented cleanly without cascading changes?
- Are there hidden dependencies the suggestion doesn't account for?
- Does the change fit the existing architecture or fight against it?
- Is the estimated effort realistic?

If a suggestion would require significant rearchitecting or has unclear boundaries, vote NO.

Review the actual code files referenced in each suggestion before voting.

Output a JSON object mapping suggestion IDs to votes:
{
  "S001": { "vote": "YES", "reasoning": "One sentence why." },
  "S002": { "vote": "NO", "reasoning": "One sentence why." }
}
```

## Step 3: Tally Votes

Collect results from all 3 agents. For each suggestion, count YES votes:

| YES Votes | Action |
|-----------|--------|
| 3 | Queue for auto-implementation |
| 1 or 2 | Queue for user decision |
| 0 | Mark as `"status": "skipped"` |

Report tally:
```
Vote results: <N> unanimous (auto-implement), <N> split (user decision), <N> rejected
```

If `--dry-run` was specified: print the tally with per-suggestion vote details and stop here. Do not implement or ask questions.

## Step 4: Implement Unanimous Items (SEQUENTIAL)

For each 3-vote suggestion, implement sequentially (order by suggestion ID):

1. **Read** the affected files
2. **Write a failing test** that captures the desired improvement
3. **Run the test** to confirm it fails (red phase)
4. **Implement the change** (minimal diff, green phase)
5. **Run the test** to confirm it passes
6. **Run the full test suite** to catch regressions
7. **Update the manifest** to mark this suggestion as `"status": "implemented"`

Use a specialized subagent for each implementation. Select the agent type based on the file types involved:
- TypeScript/JavaScript: `typescript-specialist` or `backend-developer`
- React/Frontend: `react-frontend-engineer`
- Rust: `rust-developer`
- Shell scripts: `general-purpose`
- Mixed: `backend-developer`

If a test suite doesn't exist or isn't runnable, skip steps 3 and 5 but still write the test.

If implementation fails (test suite breaks), revert the change, mark the suggestion as `"status": "failed"`, and continue to the next item.

## Step 5: Surface Split Decisions to User

For each 1-2 vote suggestion, ask the user ONE question per suggestion using AskUserQuestion:

Format:
```
**<title>** (<category>, impact: <impact>, effort: <effort>)

Files: <file list>

<description>

Suggested approach: <suggested_approach>

Votes: <N>/3
- Correctness: <YES/NO> - "<reasoning>"
- Consistency: <YES/NO> - "<reasoning>"
- Feasibility: <YES/NO> - "<reasoning>"

Implement this suggestion?
```

If user says yes: implement using the same TDD protocol as Step 4.
If user says no: mark as `"status": "skipped"`.

## Step 6: Save Updated Manifest and Report

Write the updated manifest back to the same path (with status fields updated).

Print summary:
```
Vote & Implement complete:
  Implemented: <N> (unanimous) + <N> (user-approved)
  Skipped: <N> (rejected) + <N> (user-declined)
  Failed: <N>

Updated manifest: <path>
```

---

## Rules

- Voting agents must READ the actual code, not just the suggestion text.
- Each user question is exactly ONE suggestion. Never batch decisions.
- Implementations are sequential. Earlier changes must be committed before later ones start.
- Full TDD: no implementation without a failing test first.
- If the project has no test framework set up, write tests anyway in the most appropriate format and note the framework gap.
- Never implement a 0-vote suggestion. Never skip a 3-vote suggestion (unless implementation fails).
- The manifest is the source of truth for resumability. Always update it.
