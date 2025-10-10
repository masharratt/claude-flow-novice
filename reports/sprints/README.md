# Sprint Reports

Sprint execution reports, phase summaries, and CFN Loop iteration results.

## Purpose

This directory contains detailed reports from each sprint execution within the CFN Loop orchestration system. Sprint reports track implementation progress, agent confidence scores, validation results, and product owner decisions across all loop iterations.

## Report Types

### Sprint Summary Reports
- **Format**: `sprint-{number}-summary-{date}.md`
- **Content**: Overall sprint metrics, phase completion status, confidence scores, agent utilization
- **Generated**: After sprint completion (all phases done)

### Phase Execution Reports
- **Format**: `sprint-{number}-phase-{name}-{date}.md`
- **Content**: Loop 3 implementation details, agent assignments, file changes, confidence metrics
- **Generated**: After each phase completes Loop 3

### Loop 2 Validation Reports
- **Format**: `sprint-{number}-phase-{name}-validation-{date}.md`
- **Content**: Validator consensus scores, issues identified, recommendations, pass/fail status
- **Generated**: After Loop 2 validation completes

### Loop 4 Product Owner Decisions
- **Format**: `sprint-{number}-phase-{name}-decision-{date}.md`
- **Content**: GOAP decision (PROCEED/DEFER/ESCALATE), reasoning, backlog items, next steps
- **Generated**: After Loop 4 product owner decision

## Report Structure

```markdown
# Sprint {number} - {Phase Name}

## Metadata
- Sprint: {number}
- Phase: {name}
- Date: {ISO-8601}
- Loop: {3|2|4}
- Status: {IN_PROGRESS|COMPLETED|BLOCKED}

## Agents
- Agent 1: {role} (confidence: {0.0-1.0})
- Agent 2: {role} (confidence: {0.0-1.0})

## Results
{Implementation results, validation results, or decision}

## Confidence Metrics
- Average: {0.0-1.0}
- Gate Threshold: 0.75 (Loop 3) / 0.90 (Loop 2)
- Status: {PASS|FAIL}

## Files Changed
- file1.js
- file2.test.js

## Blockers
{Any blockers encountered}

## Next Steps
{Actionable next steps}
```

## Usage

Sprint reports are referenced during:
- CFN Loop phase transitions
- Product owner decision gates
- Sprint retrospectives
- Epic completion reviews
- Stakeholder status updates

## Examples

- `sprint-1-phase-auth-2025-10-10.md` - Loop 3 authentication implementation
- `sprint-1-phase-auth-validation-2025-10-10.md` - Loop 2 validation results
- `sprint-1-phase-auth-decision-2025-10-10.md` - Loop 4 product owner decision
- `sprint-1-summary-2025-10-15.md` - Complete sprint summary

## Retention

Keep all sprint reports for project lifetime. Archive to long-term storage after epic completion.
