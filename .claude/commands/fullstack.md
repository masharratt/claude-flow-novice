---
description: "Launch full-stack development team with coordinated consensus validation"
argument-hint: "<goal description>"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# Full-Stack Development Team

Launch a coordinated full-stack development team to accomplish complex features with built-in consensus validation.

**Goal**: $ARGUMENTS

## Team Composition

The fullstack team includes:
- **Researcher**: Requirements analysis, pattern detection, architectural planning
- **Coder**: Implementation of backend and frontend features
- **Tester**: Comprehensive testing including unit, integration, and E2E tests
- **Reviewer**: Code quality analysis, security review, performance optimization
- **Architect** (for complex tasks): System design and architectural decisions

## Execution Pattern

### Phase 1: Execute
1. **Launch Primary Swarm** (3-5 agents in parallel using Claude Code's Task tool)
   - All agents execute concurrently in a single message
   - Each agent receives full context and specific responsibilities
   - Agents produce deliverables with confidence scores

2. **Progress Tracking**
   - Use TodoWrite to track all tasks (5-10+ items minimum)
   - Mark tasks as in_progress before starting
   - Complete tasks immediately after finishing (no batching)

### Phase 2: Verify (Only when Primary Swarm believes it's done)
1. **Self-Assessment**: Primary swarm evaluates completion (confidence ≥75% required)
2. **Launch Consensus Swarm** (2-4 validators in parallel)
   - Independent verification with Byzantine fault tolerance
   - Comprehensive validation: tests, security, performance, architecture
   - Voting mechanism with critical criteria checks

### Phase 3: Decision
**PASS Criteria** (≥90% agreement + all critical checks):
- All tests passing (100% for critical paths, ≥80% coverage overall)
- No security vulnerabilities
- Performance within acceptable thresholds
- Architecture review approved

**FAIL Criteria**:
- <90% validator agreement OR critical criteria failed
- Round counter increments
- Feedback injected into context

### Phase 4: Action
- **PASS**: Store results → Move to next task → Report completion
- **FAIL**:
  - If Round < 10: Inject feedback → Relaunch primary swarm with improvements
  - If Round ≥ 10: Escalate to human with full history + recommendations

### Phase 5: Repeat
Iterative improvement with accumulated context from all previous rounds until:
- Success achieved (PASS)
- Maximum rounds reached (10)
- Human intervention requested

## Consensus Validation Requirements

**Validator Team** (4 agents for Byzantine fault tolerance):
1. **Validator 1** - Test Coverage & Quality
2. **Validator 2** - Security & Compliance
3. **Validator 3** - Performance & Optimization
4. **Validator 4** - Architecture & Design

**Scoring System**:
- Overall Score: 0-100 (weighted average)
- Pass Threshold: ≥90/100 with unanimous approval
- Tier 2: 85-94 (production-ready with minor issues)
- Tier 3: 75-84 (needs improvements)
- Fail: <75 (significant issues)

**Critical Criteria** (all must pass):
- Tests executing and passing
- No critical security vulnerabilities
- Code compiles/builds successfully
- Core functionality working

## Usage Examples

```bash
# Simple feature
/fullstack Add user authentication with JWT tokens and password hashing

# Complex feature with multiple components
/fullstack Build a real-time chat system with user presence, typing indicators, message history, and file sharing

# Backend API
/fullstack Create REST API for product catalog with CRUD operations, search, filtering, and pagination

# Frontend feature
/fullstack Implement responsive dashboard with data visualization, real-time updates, and mobile support

# Full-stack integration
/fullstack Develop e-commerce checkout flow with payment processing, order management, and email notifications
```

## Execution Instructions

When this command is invoked:

1. **Parse the goal** from $ARGUMENTS
2. **Create comprehensive task list** using TodoWrite (5-10+ items)
3. **Launch primary swarm** using Claude Code's Task tool in a SINGLE message:
   ```
   Task("Research and analyze requirements", "Analyze goal: [goal]. Research patterns, identify requirements, create detailed specifications...", "researcher")
   Task("Implement core features", "Implement goal: [goal]. Write production code following best practices...", "coder")
   Task("Create comprehensive tests", "Test goal: [goal]. Write unit, integration, and E2E tests...", "tester")
   Task("Review and optimize", "Review implementation of goal: [goal]. Check security, performance, architecture...", "reviewer")
   ```
4. **Monitor progress** and update TodoWrite in real-time
5. **Self-assess** when primary work complete
6. **Launch consensus swarm** if confidence ≥75%
7. **Process results** according to validation outcome
8. **Iterate or complete** based on consensus decision

## Important Notes

- **Always use Task tool in parallel** - spawn all agents in ONE message
- **Update TodoWrite immediately** - never batch completions
- **Run post-edit hooks** after EVERY file modification
- **Store results in appropriate directories** - never save to root
- **Follow file organization** - use /src, /tests, /docs structure
- **Enable consensus validation** - for production-ready code quality

Execute the fullstack development workflow for the specified goal with comprehensive validation.