# /fullstack - Full-Stack Development Team Command

## Overview

The `/fullstack` slash command launches a coordinated full-stack development team with built-in consensus validation to accomplish complex features with production-ready code quality.

## Syntax

```bash
/fullstack <goal description>
```

## Features

### 🎯 Coordinated Team Execution
- **Primary Swarm** (3-5 agents): Researcher, Coder, Tester, Reviewer, Architect
- **Consensus Validators** (4 agents): Independent verification with Byzantine fault tolerance
- **Automatic Coordination**: All agents launched in parallel using Claude Code's Task tool

### ✅ Built-in Validation
- **Test Coverage**: Comprehensive unit, integration, and E2E tests (≥80% coverage)
- **Security Analysis**: Vulnerability scanning, code security review
- **Performance Review**: Optimization analysis, bottleneck detection
- **Architecture Validation**: Design review, pattern compliance

### 🔄 Iterative Improvement
- **Self-Assessment**: Primary swarm evaluates completion with confidence scores
- **Consensus Voting**: 4 validators with Byzantine fault tolerance (≥90% agreement required)
- **Automatic Retry**: Up to 10 rounds with feedback injection
- **Human Escalation**: Full history and recommendations after max rounds

## Usage Examples

### Simple Feature
```bash
/fullstack Add user authentication with JWT tokens and password hashing
```

### Complex Feature
```bash
/fullstack Build a real-time chat system with user presence, typing indicators, message history, and file sharing
```

### Backend API
```bash
/fullstack Create REST API for product catalog with CRUD operations, search, filtering, and pagination
```

### Frontend Feature
```bash
/fullstack Implement responsive dashboard with data visualization, real-time updates, and mobile support
```

### Full-Stack Integration
```bash
/fullstack Develop e-commerce checkout flow with payment processing, order management, and email notifications
```

## Execution Flow

### Phase 1: Execute
1. **Parse Goal**: Extract and analyze user requirements
2. **Create Task List**: Generate 5-10+ items using TodoWrite
3. **Launch Primary Swarm**: Spawn all agents in parallel in a SINGLE message
   - Researcher: Requirements analysis, pattern detection
   - Coder: Implementation of features
   - Tester: Comprehensive test suite
   - Reviewer: Code quality analysis
   - Architect (complex tasks): System design
4. **Monitor Progress**: Real-time TodoWrite updates

### Phase 2: Verify
1. **Self-Assessment**: Primary swarm evaluates completion (≥75% confidence required)
2. **Launch Consensus Swarm**: 4 validators in parallel
   - Validator 1: Test Coverage & Quality
   - Validator 2: Security & Compliance
   - Validator 3: Performance & Optimization
   - Validator 4: Architecture & Design
3. **Byzantine Voting**: Independent verification with fault tolerance

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
- **PASS**: Store results → Report completion → Move to next task
- **FAIL**:
  - If Round < 10: Inject feedback → Relaunch primary swarm
  - If Round ≥ 10: Escalate to human with full history

### Phase 5: Repeat
Iterative improvement until success or max rounds reached.

## Scoring System

### Overall Score (0-100)
- **≥90**: PASS - Production ready
- **85-94**: TIER 2 - Production ready with minor issues
- **75-84**: TIER 3 - Needs improvements
- **<75**: FAIL - Significant issues

### Critical Criteria (All Must Pass)
- ✅ Tests executing and passing
- ✅ No critical security vulnerabilities
- ✅ Code compiles/builds successfully
- ✅ Core functionality working

## Best Practices

### 1. Clear Goal Description
❌ Bad: "Add login"
✅ Good: "Add user authentication with JWT tokens, password hashing, email verification, and password reset flow"

### 2. Specify Requirements
Include:
- Functional requirements
- Technical constraints
- Performance expectations
- Security considerations

### 3. File Organization
- Never save to root folder
- Use proper directory structure: `/src`, `/tests`, `/docs`
- Follow project conventions

### 4. Post-Edit Hooks
After every file modification, run:
```bash
/hooks post-edit [FILE_PATH] --memory-key "[CONTEXT]" --structured
```

## Integration with Development Flow

The `/fullstack` command implements the recommended development flow from CLAUDE.md:

```
Execute → Self-Assess → Verify → Decision → Action → Repeat
  ↓           ↓           ↓         ↓         ↓        ↓
Primary    Confidence  Consensus  PASS/FAIL  Store  Iterate
Swarm       ≥75%       Voting      ≥90%      or     or
(3-5)                  (4 agents)  + Critical Retry  Escalate
```

## Aliases

- `/fs` - Short alias
- `/full` - Alternative alias

## See Also

- `/swarm` - General swarm management
- `/sparc` - SPARC methodology execution
- `/hooks` - Hook management
- `Task` tool - Claude Code's agent spawning tool

## Technical Details

### Agent Types Used
- `researcher` - Requirements and pattern analysis
- `coder` - Implementation
- `tester` - Test creation and execution
- `reviewer` - Code review and optimization
- `system-architect` - Architecture design (complex tasks)

### Validation Tools
- Test frameworks (Jest, Mocha, pytest, etc.)
- Security scanners (static analysis, vulnerability detection)
- Performance profilers
- Architecture linters

### Memory Coordination
- Cross-agent state sharing via memory store
- Persistent context across rounds
- Feedback accumulation for iterative improvement

## Round 5 Certification

This command was validated through the Round 5 consensus process:
- **Result**: TIER 2 Certification
- **Score**: 96/100
- **Agreement**: 4/4 unanimous
- **Test Pass Rate**: 88.9%
- **Status**: Production-ready

See: `docs/consensus/fullstack-round-5-final-consensus.md`