---
description: "Execute CFN Loop in Task Mode with direct agent spawning (visible in main chat)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "SlashCommand"]
---

# CFN Loop Task Mode - Direct Agent Spawning

**Version:** 1.2.0  |  **Date:** 2025-12-08  |  **Status:** Production Ready

🚨 **v3.0 ARCHITECTURE:** Spawn agents directly with local MDAP orchestration support

---

## Quick Overview

### What is Task Mode?

**v3.0 Task Mode Architecture:**
- **Direct agent spawning** in main chat using Task() tool
- **Visible execution** - all agent work shown in real-time
- **Local MDAP support** - agents can use orchestrator for complex tasks
- **No external dependencies** - works without Redis or Trigger.dev

### Task Mode vs CLI Mode

| Feature | Task Mode | CLI Mode |
|---------|-----------|----------|
| Visibility | Full (agents in main chat) | Summary only |
| Coordination | Manual (Task() tool) | Automated (local MDAP) |
| External Deps | None | None |
| Speed | Fast (direct spawning) | Fast (local orchestration) |
| Control | High (manual workflow) | Automated (configured workflow) |

### When to Use Task Mode

- **Debugging** - Need to see agent thought process
- **Learning** - Understanding how agents work
- **Complex coordination** - Require custom agent interactions
- **Rapid prototyping** - Quick iteration with direct control

---

## TDD Enforcement

**All agents spawned in CFN Loop must follow Test-Driven Development:**

```bash
# Mandatory TDD Workflow for all agents:
1. Write tests BEFORE implementation (Red Phase)
2. Implement code to make tests pass (Green Phase)
3. Refactor while keeping tests passing (Refactor Phase)
4. Run tests after each implementation step
5. Ensure tests cover all functionality and edge cases
```

**TDD Requirements:**
- Test files must exist for each implementation file
- Tests must be written at or before implementation time
- All tests must pass before task completion
- Minimum coverage thresholds apply (based on mode)

**Post-Edit Pipeline (Required):**
After ANY file modification, agents MUST invoke:
```bash
./.claude/hooks/cfn-invoke-post-edit.sh "$FILE_PATH" --agent-id "$AGENT_ID"
```
This validates compilation and TDD compliance automatically.

---

## RuVector Integration

**RuVector** (Rust-based vector database) provides semantic intelligence for Task Mode agents. Available features:

**Semantic Codebase Search:**
```bash
# Search codebase before implementing
/codebase-search "authentication middleware patterns"
# Returns: Relevant code snippets with semantic similarity scores
```

**Stale Documentation Detection:**
```bash
# Find outdated docs before refactoring
/detect-stale-docs
# Returns: Documents semantically distant from current code
```

**Automatic Indexing:**
```bash
# Reindex after major changes
/codebase-reindex
# Updates: Vector embeddings of all code files
```

**Usage in Task Mode:**
- Agents can call `/codebase-search` via Skill() tool before implementing
- Main Chat can search context before spawning agents
- Post-commit hook auto-reindexes (optional: `.claude/hooks/post-commit-codebase-index`)

**Manual Learning & Error Tracking:**
```bash
# After task failure - store error pattern for future avoidance
./.claude/skills/ruvector-codebase-index/store-error-pattern.sh \
  --task-id "task-123" \
  --error-type "TypeScript compilation" \
  --pattern "Missing type imports in multi-file refactor" \
  --context "Files: auth.ts, types.ts, middleware.ts" \
  --solution "Always add type imports before interface usage"
```

---

## ACE Reflection Flag

```bash
# Enable ACE reflection after each sprint (captures lessons learned)
/cfn-loop "Task description" --spawn-mode=task --ace-reflect

# Without ACE reflection (default for backwards compatibility)
/cfn-loop "Task description" --spawn-mode=task
```

**When to use `--ace-reflect`:**
- Long-running epics (3+ sprints) where learning accumulates
- Complex tasks with multiple iterations
- Teams building organizational knowledge
- Post-mortem analysis and continuous improvement

---

## Execution Instructions (AUTO-EXECUTE)

**Step 1: Parse Arguments**
```bash
# Extract task description (remove flags)
TASK_DESCRIPTION="$ARGUMENTS"
TASK_DESCRIPTION=$(echo "$TASK_DESCRIPTION" | sed 's/--mode[[:space:]]*[a-zA-Z]*//' | xargs)

# Parse optional flags
MODE="standard"

for arg in $ARGUMENTS; do
  case $arg in
    --mode=*)
      MODE="${arg#*=}"
      ;;
    --mode)
      shift
      MODE="$1"
      ;;
  esac
done

# Validate mode
if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
  echo "❌ ERROR: Invalid mode '$MODE'. Must be one of: mvp, standard, enterprise"
  exit 1
fi
```

**Step 2: Generate Task ID**
```bash
# Generate unique task ID
TASK_ID="cfn-task-$(date +%s%N | tail -c 7)-${RANDOM}"

echo "📋 Task ID: $TASK_ID"
echo "🎯 Mode: $MODE"
echo "📝 Task: ${TASK_DESCRIPTION:0:100}..."
echo ""
```

**Step 3: Spawn Task Mode Agents**
```bash
# Define agent workflow based on mode
case $MODE in
  "mvp")
    # MVP: Fast cycle with 2 agents
    echo "🚀 MVP Mode - Spawning 2 agents for rapid prototyping..."
    Task("backend-developer", `
      LIFECYCLE:
      AGENT_ID="backend-dev-${TASK_ID}"

      TASK: Implement MVP solution for: ${TASK_DESCRIPTION}

      TDD Requirements:
      - Write tests BEFORE implementation
      - Create test files for each implementation file
      - Ensure tests pass before completion
      - Run tests after each implementation step
      - Call post-edit pipeline after each file change

      Use local MDAP orchestration for complex tasks:
      - Import from lib/mdap/orchestrator.js
      - Call orchestrate() with appropriate payload
      - Focus on speed over perfection

      Return: Implementation summary and confidence score
    `)

    Task("tester", `
      LIFECYCLE:
      AGENT_ID="tester-${TASK_ID}"

      TASK: Test MVP implementation for: ${TASK_DESCRIPTION}

      Create basic tests to verify core functionality:
      - Unit tests for key functions
      - Integration tests for main flows
      - Keep tests simple and fast

      Return: Test results and coverage summary
    `)
    ;;

  "standard")
    # Standard: Full workflow with 3-4 agents
    echo "🚀 Standard Mode - Spawning 3-4 agents for production quality..."
    Task("backend-developer", `
      LIFECYCLE:
      AGENT_ID="backend-dev-${TASK_ID}"

      TASK: Implement production solution for: ${TASK_DESCRIPTION}

      TDD Requirements:
      - Write tests BEFORE implementation (Red-Green-Refactor)
      - Create comprehensive test files for each implementation
      - Ensure >80% test coverage before completion
      - Run tests after each implementation step
      - Call post-edit pipeline after each file change

      Use local MDAP orchestration for comprehensive development:
      - Import from lib/mdap/orchestrator.js
      - Call orchestrate() with mode: 'standard'
      - Include error handling and validation
      - Follow coding standards and best practices

      Return: Implementation details, files created/modified, confidence score
    `)

    Task("tester", `
      LIFECYCLE:
      AGENT_ID="tester-${TASK_ID}"

      TASK: Create comprehensive test suite for: ${TASK_DESCRIPTION}

      Develop full test coverage:
      - Unit tests (target >80% coverage)
      - Integration tests
      - Edge case testing
      - Performance tests if applicable

      Return: Test report with coverage metrics
    `)

    Task("code-reviewer", `
      LIFECYCLE:
      AGENT_ID="reviewer-${TASK_ID}"

      TASK: Review implementation and tests for: ${TASK_DESCRIPTION}

      Perform thorough code review:
      - Check code quality and standards
      - Verify security considerations
      - Assess performance implications
      - Validate test coverage

      Return: Review findings and recommendations
    `)

    # Optional security agent for sensitive tasks
    if [[ "$TASK_DESCRIPTION" =~ (auth|security|password|token|jwt|encryption| compliance) ]]; then
      Task("security-specialist", `
        LIFECYCLE:
        AGENT_ID="security-${TASK_ID}"

        TASK: Security audit for: ${TASK_DESCRIPTION}

        Conduct security review:
        - Identify vulnerabilities
        - Check OWASP top 10 compliance
        - Verify secure coding practices
        - Recommend security improvements

        Return: Security assessment report
      `)
    fi
    ;;

  "enterprise")
    # Enterprise: Comprehensive workflow with 5+ agents
    echo "🚀 Enterprise Mode - Spawning 5+ agents for compliance-grade solution..."
    Task("backend-developer", `
      LIFECYCLE:
      AGENT_ID="backend-dev-${TASK_ID}"

      TASK: Implement enterprise-grade solution for: ${TASK_DESCRIPTION}

      TDD Requirements:
      - Write tests BEFORE implementation (Strict TDD)
      - Create comprehensive test suites for each implementation
      - Ensure >95% test coverage before completion
      - Include integration, E2E, performance, and security tests
      - Run tests after each implementation step
      - Call post-edit pipeline after each file change

      Use local MDAP orchestration with enterprise settings:
      - Import from lib/mdap/orchestrator.js
      - Call orchestrate() with mode: 'enterprise'
      - Include comprehensive error handling
      - Add extensive logging and monitoring
      - Ensure compliance with standards

      Return: Detailed implementation with compliance notes
    `)

    Task("tester", `
      LIFECYCLE:
      AGENT_ID="tester-${TASK_ID}"

      TASK: Create enterprise test suite for: ${TASK_DESCRIPTION}

      Develop comprehensive testing:
      - Unit tests (>95% coverage required)
      - Integration tests
      - End-to-end tests
      - Performance and load tests
      - Security tests
      - Compliance validation tests

      Return: Full test report with compliance metrics
    `)

    Task("code-reviewer", `
      LIFECYCLE:
      AGENT_ID="reviewer-${TASK_ID}"

      TASK: Enterprise code review for: ${TASK_DESCRIPTION}

      Perform rigorous review:
      - Code quality and maintainability
      - Performance optimization
      - Security best practices
      - Compliance requirements
      - Documentation completeness

      Return: Detailed review with compliance checklist
    `)

    Task("security-specialist", `
      LIFECYCLE:
      AGENT_ID="security-${TASK_ID}"

      TASK: Enterprise security assessment for: ${TASK_DESCRIPTION}

      Comprehensive security review:
      - Threat modeling
      - Vulnerability assessment
      - OWASP top 10 analysis
      - Compliance audit (GDPR, SOC2, etc.)
      - Security architecture review

      Return: Full security assessment with remediation plan
    `)

    Task("performance-specialist", `
      LIFECYCLE:
      AGENT_ID="performance-${TASK_ID}"

      TASK: Performance analysis for: ${TASK_DESCRIPTION}

      Evaluate performance characteristics:
      - Benchmark current performance
      - Identify bottlenecks
      - Optimization recommendations
      - Scalability assessment
      - Resource usage analysis

      Return: Performance report with optimization roadmap
    `)
    ;;
esac
```

**Step 4: Await Agent Completion**
```bash
# Task Mode agents complete synchronously in main chat
# No additional coordination needed - Task() tool handles completion
echo ""
echo "⏳ Waiting for agent completion..."
echo ""
echo "✅ All Task Mode agents spawned successfully"
echo "📊 Results will appear as agents complete"
```

**Step 5: Report Summary**
```bash
# Collect results from completed agents
# Results are visible in main chat as agents complete

echo ""
echo "=== TASK MODE SUMMARY ==="
echo "Task ID: $TASK_ID"
echo "Mode: $MODE"
echo "Task: ${TASK_DESCRIPTION:0:200}..."
echo ""
echo "Review agent outputs above for:"
echo "  • Implementation details"
echo "  • Test results and coverage"
echo "  • Code review findings"
echo "  • Security assessment (if applicable)"
echo "  • Performance analysis (if applicable)"
```

---

## Gate Check Thresholds

Loop 3 gate checks are based on test pass rates:

| Mode | Pass Rate Threshold |
|------|-------------------|
| MVP | 70% |
| Standard | 95% |
| Enterprise | 98% |

---

---

## Security Considerations

- All agent execution visible in main chat
- No background processes or hidden coordination
- Direct control over agent lifecycle
- Local MDAP includes security validation

---

## Performance Characteristics

- **Startup**: Instant (no external service initialization)
- **Execution**: Parallel agent execution
- **Memory**: Managed by main chat session
- **Cleanup**: Automatic (no persistent processes)

---

## Local MDAP Integration

Agents in Task Mode can use local MDAP:

```javascript
// Agent can import and use MDAP orchestrator
import { orchestrate } from "./lib/mdap/orchestrator.js";

const result = await orchestrate({
  taskDescription: "Complex subtask",
  workDir: "./src",
  mode: "standard"
});
```

This allows:
- Decomposition of complex tasks
- Parallel implementation
- Automated testing and validation
- Iterative improvement

---

## Related Documentation

- **CLI Mode Guide**: `.claude/commands/cfn-loop/cfn-loop-cli.md`
- **Frontend CFN Loop**: `.claude/commands/cfn-loop/CFN_LOOP_FRONTEND.md`
- **Agent Lifecycle**: `.claude/agents/SHARED_PROTOCOL.md`
- **Post-Edit Pipeline**: `.claude/hooks/cfn-post-edit.config.json`

---

**Version History:**
- v1.2.0 (2025-12-08) - Added TDD enforcement and merged documentation
- v1.1.0 (2025-12-01) - Added RuVector integration, semantic search
- v1.0.0 (2025-10-28) - Initial Task mode implementation