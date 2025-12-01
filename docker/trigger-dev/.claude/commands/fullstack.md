---
description: "Launch autonomous self-correcting full-stack development team with CFN Loop"
argument-hint: "<goal description>"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# Autonomous Full-Stack Development Team (CFN Loop)

Launch an autonomous self-correcting full-stack development team using the CFN Loop methodology.

🚨 **AUTONOMOUS SELF-LOOPING PROCESS**

**Goal**: $ARGUMENTS

## Team Composition

The fullstack team includes:
- **Researcher**: Requirements analysis, pattern detection, architectural planning
- **Coder**: Implementation of backend and frontend features
- **Tester**: Comprehensive testing including unit, integration, and E2E tests
- **Reviewer**: Code quality analysis, security review, performance optimization
- **Architect** (for complex tasks): System design and architectural decisions

## Autonomous CFN Loop Execution Pattern

🚨 **CRITICAL: This is an AUTONOMOUS self-looping process**
- Loop failures → IMMEDIATE retry with feedback (NO approval needed)
- Consensus failures → IMMEDIATE Loop 3 relaunch (NO approval needed)
- Phase completion → IMMEDIATE next phase transition (NO approval needed)
- ONLY stop for: max iterations reached OR critical error

### Loop 3: Primary Swarm (Execute)
1. **Initialize Swarm** (MANDATORY)
   - Use swarm_init with appropriate topology
   - Configure for 3-8 agents based on complexity

2. **Launch Primary Swarm** (3-8 agents in parallel using Claude Code's Task tool)
   - All agents execute concurrently in a single message
   - Each agent receives full context and specific responsibilities
   - Agents produce deliverables with confidence scores
   - Run post-edit hooks after EVERY file modification

3. **Self-Assessment Gate**
   - Collect confidence scores from all agents
   - If confidence ≥75% → IMMEDIATELY proceed to Loop 2
   - If confidence <75% → IMMEDIATELY relaunch Loop 3 with feedback (autonomous retry)
   - Max iterations: 10

### Loop 2: Consensus Swarm (Verify)
1. **Launch Consensus Validators** (2-4 validators in parallel)
   - Independent verification with Byzantine fault tolerance
   - Comprehensive validation: tests, security, performance, architecture
   - Voting mechanism with critical criteria checks

2. **Byzantine Consensus Voting**
   - Collect validator votes (approve/reject)
   - Calculate approval rate and confidence

3. **Decision Gate**
   - **PASS Criteria** (≥90% agreement + all critical checks):
     - All tests passing (100% for critical paths, ≥80% coverage overall)
     - No security vulnerabilities
     - Performance within acceptable thresholds
     - Architecture review approved
   - **FAIL Criteria**:
     - <90% validator agreement OR critical criteria failed
     - IMMEDIATELY inject feedback and return to Loop 3 (autonomous retry)
   - Max iterations: 5

### Loop 1: Phase Completion (Action)
- **PASS**: Store results → Update documentation → Report completion
- **FAIL (max iterations)**: Escalate to human with full history + recommendations

**AUTONOMOUS RETRY BEHAVIOR:**
- Loop 3 failures → IMMEDIATELY relaunch with feedback
- Loop 2 failures → IMMEDIATELY return to Loop 3
- NO approval needed for retries
- Self-correcting process continues until success or max iterations

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

🚨 **AUTONOMOUS EXECUTION - NO APPROVAL NEEDED FOR RETRIES**

1. **Parse the goal** from $ARGUMENTS

2. **Initialize Swarm** (MANDATORY for multi-agent tasks):
   ```javascript
   mcp__claude-flow-novice__swarm_init({
     topology: "mesh",
     maxAgents: 8,
     strategy: "balanced"
   })
   ```

3. **Launch Loop 3: Primary Swarm** in a SINGLE message:
   ```
   Task("Research and analyze requirements", "Analyze goal: [goal]. Research patterns, identify requirements, create detailed specifications...", "researcher")
   Task("Implement core features", "Implement goal: [goal]. Write production code following best practices...", "coder")
   Task("Create comprehensive tests", "Test goal: [goal]. Write unit, integration, and E2E tests...", "tester")
   Task("Review and optimize", "Review implementation of goal: [goal]. Check security, performance, architecture...", "reviewer")
   ```

4. **Self-assess** and collect confidence scores
   - If ≥75% → IMMEDIATELY proceed to Loop 2 (consensus)
   - If <75% → IMMEDIATELY relaunch Loop 3 with feedback (NO approval needed)

5. **Launch Loop 2: Consensus Swarm** in a SINGLE message:
   ```
   Task("Quality Validator", "Comprehensive quality review", "reviewer")
   Task("Security Validator", "Security and performance audit", "security-specialist")
   Task("Architecture Validator", "Architecture validation", "system-architect")
   Task("Testing Validator", "Integration testing validation", "tester")
   ```

6. **Process Byzantine consensus voting**
   - If ≥90% approval → Complete (Loop 1)
   - If <90% approval → IMMEDIATELY return to Loop 3 with feedback (NO approval needed)

7. **Autonomous iteration** until:
   - Success achieved (consensus passes)
   - Max iterations reached (escalate to human)
   - Critical error encountered

## Important Notes

🚨 **AUTONOMOUS SELF-LOOPING PROCESS**

- **Initialize swarm FIRST** - MANDATORY before spawning agents
- **Always use Task tool in parallel** - spawn all agents in ONE message
- **Run post-edit hooks** after EVERY file modification
- **Store results in appropriate directories** - never save to root
- **Follow file organization** - use /src, /tests, /docs structure
- **NO approval needed for retries** - autonomous self-correction
- **IMMEDIATE retry on failures** - continue until success or max iterations
- **Enable consensus validation** - for production-ready code quality

Execute the autonomous self-correcting fullstack development workflow NOW.