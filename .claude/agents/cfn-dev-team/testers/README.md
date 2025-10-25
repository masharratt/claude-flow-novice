# Testers

Testing and validation specialists ensuring code quality and correctness.

## Active Agents (6)

**Core Testing:**
- `tester.md` - General testing and validation
- `production-validator.md` - Production readiness validation

**Specialized Testing:**
- `interaction-tester.md` - Interactive component and user flow testing
- `playwright-tester.md` - End-to-end testing with Playwright
- `playwright-agent.md` - Playwright automation agent

**Test-Driven Development:**
- `tdd-london-swarm.md` - London School TDD methodology

## Purpose

Testers participate in CFN Loop 2 (validation layer):
- Verify implementation correctness
- Validate test coverage
- Execute test suites
- Report quality metrics
- Ensure production readiness

## Testing Responsibilities

**Test Execution:**
- Run unit tests
- Execute integration tests
- Perform E2E testing
- Validate edge cases
- Check error handling

**Quality Metrics:**
- Test coverage (target: 80%+)
- Passing test percentage
- Performance benchmarks
- Security validation
- Accessibility checks

## Usage Pattern

**In CFN Loop:**
Automatically spawned by orchestrator in Loop 2:
```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --loop2-agents "reviewer,tester"
```

**Standalone Testing:**
```bash
npx claude-flow-novice agent-spawn tester --task-id "$TASK_ID"
```

## Test Execution Protocol

**IMPORTANT:** Agents do NOT run tests themselves. Instead:

1. Coordinator runs tests ONCE in background:
   ```bash
   (npm test > /tmp/test-results.txt 2>&1) &
   TEST_PID=$!
   ```

2. All tester agents READ the same test results:
   ```bash
   # Wait for test completion
   wait $TEST_PID

   # Agents read results
   cat /tmp/test-results.txt
   ```

3. Testers analyze and report on test results

## Confidence Scoring

Testers provide:
- Test pass rate
- Coverage metrics
- Quality assessment
- Consensus score (0.90+ for approval)

## Output Format

Structured report with:
- Overall confidence score
- Test execution summary
- Coverage analysis
- Failed test details
- Recommendations for improvement
