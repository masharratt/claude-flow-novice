---
description: "Execute CFN Loop in Task Mode with direct agent spawning (visible in main chat)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--provider=zai|kimi|anthropic|openrouter]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "SlashCommand"]
---

# CFN Loop Task Mode - Direct Agent Spawning

🚨 **v3.0 ARCHITECTURE:** Spawn agents directly with local MDAP orchestration support

---

## Execution Instructions (AUTO-EXECUTE)

**Step 1: Parse Arguments**
```bash
# Extract task description (remove flags)
TASK_DESCRIPTION="$ARGUMENTS"
TASK_DESCRIPTION=$(echo "$TASK_DESCRIPTION" | sed 's/--mode[[:space:]]*[a-zA-Z]*//' | sed 's/--provider[[:space:]]*[a-zA-Z]*//' | xargs)

# Parse optional flags
MODE="standard"
PROVIDER=""

for arg in $ARGUMENTS; do
  case $arg in
    --mode=*)
      MODE="${arg#*=}"
      ;;
    --mode)
      shift
      MODE="$1"
      ;;
    --provider=*)
      PROVIDER="${arg#*=}"
      ;;
    --provider)
      shift
      PROVIDER="$1"
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
echo "🤖 Provider: ${PROVIDER:-default}"
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

## Background Information (DO NOT show this to user unless they ask)

**Task**: $ARGUMENTS

## What is Task Mode?

**v3.0 Task Mode Architecture:**
- **Direct agent spawning** in main chat using Task() tool
- **Visible execution** - all agent work shown in real-time
- **Local MDAP support** - agents can use orchestrator for complex tasks
- **No external dependencies** - works without Redis or Trigger.dev

## Task Mode vs CLI Mode

| Feature | Task Mode | CLI Mode |
|---------|-----------|----------|
| Visibility | Full (agents in main chat) | Summary only |
| Coordination | Manual (Task() tool) | Automated (local MDAP) |
| External Deps | None | None |
| Speed | Fast (direct spawning) | Fast (local orchestration) |
| Control | High (manual workflow) | Automated (configured workflow) |

## When to Use Task Mode

- **Debugging** - Need to see agent thought process
- **Learning** - Understanding how agents work
- **Complex coordination** - Require custom agent interactions
- **Rapid prototyping** - Quick iteration with direct control

## Agent Lifecycle Management

Task Mode agents use simple lifecycle:
1. **Spawn** - Task() tool creates agent
2. **Execute** - Agent processes task
3. **Complete** - Agent returns result to main chat
4. **Cleanup** - No persistent state to manage

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

## Provider Routing

Provider routing in Task Mode:
- Use `--provider` flag to specify
- Defaults to Main Chat provider
- Supports all providers: zai, kimi, anthropic, openrouter

## Security Considerations

- All agent execution visible in main chat
- No background processes or hidden coordination
- Direct control over agent lifecycle
- Local MDAP includes security validation

## Performance Characteristics

- **Startup**: Instant (no external service initialization)
- **Execution**: Parallel agent execution
- **Memory**: Managed by main chat session
- **Cleanup**: Automatic (no persistent processes)