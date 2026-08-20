# Reviewers

Code review and validation agents focused on quality assurance.

## Active Agents (2)

**Core Reviewers:**
- `reviewer.md` - General code review and quality validation
- `code-quality-validator.md` - Comprehensive code quality analysis

## Purpose

Reviewers participate in CFN Loop 2 (validation layer):
- Review implementation quality
- Validate against requirements
- Check security and performance
- Ensure best practices
- Provide actionable feedback

## Review Criteria

Reviewers assess:
- Code quality and maintainability
- Security vulnerabilities
- Performance implications
- Test coverage
- Documentation completeness
- Adherence to standards

## Usage Pattern

**In CFN Loop:**
Automatically spawned by orchestrator in Loop 2:
```bash
$HOME/.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh \
  --loop2-agents "reviewer,tester"
```

**Standalone Review:**
```bash
npx claude-flow-novice agent-spawn reviewer --task-id "$TASK_ID"
```

## Confidence Scoring

Reviewers provide consensus scores:
- 0.90+ = High confidence, approve implementation
- 0.75-0.89 = Medium confidence, iterate for improvements
- <0.75 = Low confidence, significant issues found

## Output Format

Structured feedback with:
- Overall confidence score
- Critical issues (blocking)
- Warnings (should fix)
- Suggestions (improvements)
- Specific file/line references
