# Claude Flow Novice - AI Agent Orchestration

## Core Orchestration Patterns

## 🚨 CRITICAL: MANDATORY AGENT-BASED EXECUTION

**YOU MUST USE AGENTS FOR ALL NON-TRIVIAL WORK - NO EXCEPTIONS**

**ABSOLUTE RULES**:
1. **ALWAYS USE AGENTS** - Tasks requiring >3 steps MUST use agent coordination
2. **ALWAYS INITIALIZE SWARM** - ANY multi-agent task requires swarm_init FIRST
3. **ALWAYS RUN POST-EDIT HOOKS** - After EVERY file edit without exception
4. **ALWAYS BATCH OPERATIONS** - 1 MESSAGE = ALL RELATED OPERATIONS
5. **NEVER WORK SOLO** - Spawn multiple agents in parallel for ALL significant tasks
6. **NEVER SAVE TO ROOT** - Organize files in appropriate subdirectories
7. **USE CLAUDE CODE'S TASK TOOL** - For spawning agents concurrently, not just MCP

### 🚫 WHEN YOU MUST USE AGENTS (MANDATORY)

**TRIGGER CONDITIONS - If ANY apply, you MUST spawn agents:**
- Task requires >3 distinct steps
- Multiple files need to be created or modified
- Need research + implementation + testing
- Architecture or design decisions required
- Code review or quality validation needed
- Security, performance, or compliance concerns
- Integration across multiple systems/components
- Documentation generation needed
- Refactoring or optimization work
- ANY feature development (even "simple" ones)

### Agent Requirements by Task Complexity

| Task Size | Steps | Agent Count | Example Team Composition |
|-----------|-------|-------------|--------------------------|
| **Simple** | 3-5 | 2-3 agents | coder + tester + reviewer |
| **Medium** | 6-10 | 4-6 agents | + researcher + architect + security-specialist |
| **Complex** | 11-20 | 8-12 agents | Full specialist team with domain experts |
| **Enterprise** | 20+ | 15-20 agents | + devops + api-docs + perf-analyzer + coordinators |

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **Agent Spawning**: ALWAYS spawn ALL required agents in ONE message using Task tool
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message
- **Bash commands**: ALWAYS batch ALL terminal operations in ONE message
- **Memory operations**: ALWAYS batch ALL memory store/retrieve in ONE message

### ⚠️ PROHIBITED SOLO WORK

**YOU ARE FORBIDDEN FROM:**
- ❌ Working alone on multi-step tasks
- ❌ Implementing features without agent coordination
- ❌ Skipping agent spawning because "it's simple"
- ❌ Writing code without a tester agent
- ❌ Making architectural decisions without an architect agent
- ❌ Deploying without security review from security-specialist agent

## 🎯 Claude Code vs MCP Tools

### Claude Code Handles ALL EXECUTION:
- **Task tool**: Spawn and run agents concurrently for actual work
- File operations (Read, Write, Edit, MultiEdit, Glob, Grep)
- Code generation and programming
- Bash commands and system operations
- Implementation work
- Project navigation and analysis
- TodoWrite and task management
- Git operations
- Package management
- Testing and debugging

### MCP Tools ONLY COORDINATE:
- Swarm initialization (topology setup)
- Agent type definitions (coordination patterns)
- Task orchestration (high-level planning)
- Memory management
- Neural features
- Performance tracking
- GitHub integration

**KEY**: MCP coordinates the strategy, Claude Code's Task tool executes with real agents.

### Agent Coordination Framework

#### Pre-Task Hooks (Setup & Validation)
```bash
# Validate safety and prepare resources
npx claude-flow-novice hooks pre-command --command "[command]" --validate-safety true --prepare-resources true

# Auto-assign agents and load context
npx claude-flow-novice hooks pre-edit --file "[file]" --auto-assign-agents true --load-context true
```

#### Post-Task Hooks (Validation & Quality)
```bash
# Track metrics and store results
npx claude-flow-novice hooks post-command --command "[command]" --track-metrics true --store-results true

# Enhanced post-edit pipeline with comprehensive TDD validation
npx enhanced-hooks post-edit "[file]" --memory-key "swarm/[agent]/[step]" --minimum-coverage 80 --structured

# Manual hook execution (guaranteed working)
node src/hooks/enhanced-hooks-cli.js post-edit "[file]" --memory-key "[key]" --structured

# Validates: formatting, linting, type checking, dependencies, security, tests, TDD compliance
# Progressive validation: graceful degradation when dependencies missing (beginner-friendly)
```

## 🎯 **Enhanced Post-Edit Hook System**

### **🚨 MANDATORY: Manual Hook Execution After Every File Edit**

**CRITICAL RULE**: After **EVERY** file edit operation, you **MUST** run the enhanced post-edit hook:

```bash
# After editing any file, IMMEDIATELY run:
npx enhanced-hooks post-edit "[FILE_PATH]" --memory-key "swarm/[AGENT]/[STEP]" --minimum-coverage 80 --structured

# Or via slash command:
/hooks post-edit [FILE_PATH] --memory-key "[CONTEXT]" --structured
```

**⚠️ NO EXCEPTIONS**: This applies to:
- All JavaScript/TypeScript files
- All Rust files
- All Python files
- All configuration files
- ALL file modifications

### **Enhanced Post-Edit Pipeline Features:**
- **🧪 TDD Testing**: Single-file testing without full system compilation
- **📊 Real-time Coverage**: Coverage analysis with configurable thresholds (default: 80%)
- **🌐 Multi-Language Support**:
  - **JavaScript/TypeScript**: Jest, Mocha, Prettier, ESLint integration
  - **Rust**: cargo check, cargo test, cargo-tarpaulin, rustfmt
  - **Python**: pytest, unittest, black, pylint
  - **Go**: go test, go fmt, go vet
  - **Java**: JUnit, TestNG, google-java-format
  - **C/C++**: GTest, Catch2, clang-format
- **🎨 Formatting**: Prettier, Black, RustFmt, GoFmt with diff preview
- **🔒 Security Analysis**: XSS, eval(), hardcoded credentials, SQL injection detection
- **✅ TDD Compliance**: Red-Green-Refactor phase detection and enforcement
- **🔍 Framework Detection**: Automatic test framework identification
- **🤖 Agent Feedback**: Structured JSON with actionable recommendations
- **💾 Memory Coordination**: Cross-agent state sharing and enhanced persistence
- **🚫 Blocking Mechanisms**: Quality gates for critical validation failures

### **Usage Examples:**
```bash
# For JavaScript/TypeScript files
npx enhanced-hooks post-edit "src/components/Button.tsx" --memory-key "frontend/button" --structured

# For Rust files (full cargo integration)
npx enhanced-hooks post-edit "src/lib.rs" --memory-key "backend/rust" --minimum-coverage 90 --structured

# Via slash commands in Claude Code
/hooks post-edit your-file.js --memory-key "agent-memory-key" --structured
```

### **Response Structure:**
```json
{
  "success": true,
  "file": "src/component.js",
  "validation": { "passed": true, "issues": [], "coverage": "advanced" },
  "formatting": { "needed": true, "changes": 12, "formatter": "prettier" },
  "testing": { "executed": true, "framework": "jest", "results": {...} },
  "tddCompliance": { "hasTests": true, "coverage": 85, "recommendations": [...] },
  "recommendations": [
    { "type": "security", "priority": "high", "message": "...", "action": "..." },
    { "type": "formatting", "priority": "medium", "action": "prettier file.js" }
  ],
  "memory": { "stored": true, "enhancedStore": true }
}
```

#### Session Management
```bash
# Generate summaries and persist state
npx claude-flow-novice hooks session-end --generate-summary true --persist-state true --export-metrics true
```
### 🎯 Swarm Initialization (MANDATORY for ALL Multi-Agent Tasks)

**CRITICAL**: You MUST initialize swarm BEFORE spawning ANY multiple agents:

```javascript
[Single Message]:
  // Step 1: ALWAYS initialize swarm first
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",          // mesh (2-7 agents), hierarchical (8+)
    maxAgents: 3,              // Match your actual agent count
    strategy: "balanced"       // ensures agents coordinate and stay consistent
  })

  // Step 2: Spawn working agents via Task tool
  Task("Agent 1", "Specific instructions...", "type")
  Task("Agent 2", "Specific instructions...", "type")
  Task("Agent 3", "Specific instructions...", "type")
```

**WHY THIS MATTERS:**
- ✅ **Prevents inconsistency**: Without swarm, 3 agents fixing JWT secrets will use 3 different methods
- ✅ **Ensures coordination**: Agents share findings and agree on approach
- ✅ **Memory coordination**: Agents access shared context via SwarmMemory
- ✅ **Byzantine consensus**: Final validation ensures all agents agree

**TOPOLOGY SELECTION:**
- **2-7 agents**: Use `topology: "mesh"` (peer-to-peer, equal collaboration)
- **8+ agents**: Use `topology: "hierarchical"` (coordinator-led structure)

**MCP Integration Tools:**
- `mcp__claude-flow-novice__swarm_init` - Initialize swarm topology (REQUIRED for ALL multi-agent tasks)
- `mcp__claude-flow-novice__agent_spawn` - Spawn coordination agents (recommended for consistency)
- `mcp__claude-flow-novice__task_orchestrate` - Orchestrate high-level workflows
- **Monitoring**: `swarm_status`, `agent_metrics`, `task_results`
- **Memory**: `memory_usage`, `memory_search`

---

## 📋 EXAMPLE AGENT SPAWNING PATTERNS

**⚠️ IMPORTANT**: These are **ILLUSTRATIVE EXAMPLES** demonstrating coordination patterns.
**YOU MUST adapt agent types, counts, and roles to YOUR specific task requirements.**

**Key Principles Shown:**
- How to structure swarm initialization before agent spawning
- How to spawn agents concurrently in one message
- How to coordinate multiple agent types effectively
- Topology selection based on team size

**These patterns are starting points - not rigid templates. Analyze your task and customize accordingly.**

---

### Example 1: Simple Task Pattern (2-3 agents)
**Illustrative pattern for basic feature implementation with coordinated validation.**

```javascript
[Single Message]:
  // Initialize swarm coordination
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  // Spawn coordinated agents (customize to your needs)
  Task("Coder", "Implement feature with TDD approach", "coder")
  Task("Tester", "Create comprehensive test suite", "tester")
  Task("Reviewer", "Review code quality and security", "reviewer")
```

### Example 2: Medium Task Pattern (4-6 agents)
**Illustrative pattern for multi-component features requiring research and architecture.**

```javascript
[Single Message]:
  // Initialize swarm coordination
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 6,
    strategy: "balanced"
  })

  // Spawn coordinated specialists (adapt to your task)
  Task("Researcher", "Analyze requirements and existing patterns", "researcher")
  Task("Architect", "Design system architecture", "system-architect")
  Task("Coder", "Implement core functionality with TDD", "coder")
  Task("Tester", "Create unit, integration, and E2E tests", "tester")
  Task("Security Reviewer", "Perform security audit", "security-specialist")
  Task("Reviewer", "Final quality review", "reviewer")
```

### Example 3: Complex Task Pattern (8-12 agents)
**Illustrative pattern for full-scale features requiring hierarchical coordination.**

```javascript
[Single Message]:
  // Initialize hierarchical swarm for larger teams
  mcp__claude-flow-novice__swarm_init({
    topology: "hierarchical",
    maxAgents: 12,
    strategy: "adaptive"
  })

  // Spawn full specialist team (customize roles to your project)
  Task("Product Owner", "Define requirements", "planner")
  Task("System Architect", "Design architecture", "system-architect")
  Task("Backend Developer", "Implement backend services", "backend-dev")
  Task("Frontend Developer", "Create UI components", "coder")
  Task("Tester", "Comprehensive testing", "tester")
  Task("Security Specialist", "Security review", "security-specialist")
  Task("Performance Analyst", "Performance optimization", "perf-analyzer")
  Task("DevOps Engineer", "CI/CD setup", "cicd-engineer")
  Task("API Documenter", "API documentation", "api-docs")
  Task("Reviewer", "Final quality gate", "reviewer")
```

---

### ⚠️ Real-World Example: Why Swarm Coordination Matters

**WITHOUT swarm_init (problematic):**
```javascript
// ❌ BAD: Agents work independently with no coordination
[Single Message]:
  Task("Agent 1", "Fix JWT secret issue", "coder")
  Task("Agent 2", "Fix JWT secret issue", "coder")
  Task("Agent 3", "Fix JWT secret issue", "coder")

// Result: 3 different solutions - environment variable, config file, hardcoded
// Problem: Inconsistent approach, wasted effort, integration conflicts
```

**WITH swarm_init (correct):**
```javascript
// ✅ GOOD: Agents coordinate through swarm
[Single Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  Task("Agent 1", "Fix JWT secret issue", "coder")
  Task("Agent 2", "Fix JWT secret issue", "coder")
  Task("Agent 3", "Fix JWT secret issue", "coder")

// Result: All 3 agents agree on environment variable approach
// Benefit: Consistent solution, shared context, coordinated implementation
```

## File Organization
- **Never save working files to root**

# Add MCP server
claude mcp add claude-flow-novice npx claude-flow-novice mcp start


## Essential Commands
- `npx claude-flow-novice status` - System health
- `npx claude-flow-novice --help` - Available commands
- `/fullstack "goal"` - Launch full-stack development team with consensus validation
- `/swarm`, `/sparc`, `/hooks` - Other slash commands (auto-discovered)

## 🔄 MANDATORY DEVELOPMENT FLOW LOOP

**YOU MUST FOLLOW THIS LOOP FOR ALL NON-TRIVIAL WORK:**

### Step 1: Initialize Swarm (ALWAYS for multi-agent tasks)
```javascript
[Single Message]:
  // ALWAYS initialize swarm when spawning multiple agents
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",          // mesh for 2-7, hierarchical for 8+
    maxAgents: 3,              // match your actual agent count
    strategy: "balanced"       // ensures coordination and consistency
  })

  // Then spawn all agents - they will coordinate via swarm
  Task("Agent 1", "Specific instructions", "type")
  Task("Agent 2", "Specific instructions", "type")
  Task("Agent 3", "Specific instructions", "type")
```

**CRITICAL**: Without swarm_init, agents work independently and produce inconsistent results!

### Step 2: Execute - Primary Swarm (3-20 agents)
- **Primary swarm** (3-8 agents minimum) produces deliverables with confidence scores
- **Self-validation**: Each agent validates own work (confidence threshold: 0.75)
- **Cross-agent coordination**: Agents share findings via SwarmMemory

### Step 3: Self-Assessment Gate
- **If confidence scores ≥75%** → Proceed to Step 4 (Consensus Verification)
- **If confidence scores <75%** → Relaunch agents for Step 2 with feedback
- **Maximum iterations**: 3 attempts before escalation

### Step 4: Verify - Consensus Swarm (2-4 validators REQUIRED)
```javascript
// MANDATORY: Spawn consensus validation swarm
[Single Message]:
  Task("Validator 1", "Comprehensive quality review", "reviewer")
  Task("Validator 2", "Security and performance audit", "security-specialist")
  Task("Validator 3", "Architecture validation", "system-architect")
  Task("Validator 4", "Integration testing", "tester")
```
- **Byzantine consensus voting** across all validators
- **Multi-dimensional checks**: quality, security, performance, tests, docs

### Step 5: Decision Gate
- **PASS**: ≥90% validator agreement + all critical criteria met
- **FAIL**: <90% agreement OR any critical criterion failed

### Step 6: Action Based on Decision
- **PASS** →
  1. Store results in SwarmMemory
  2. Update documentation
  3. Move to next task

- **FAIL** →
  1. Round counter++
  2. If Round < 10: Inject validator feedback → Return to Step 2
  3. If Round ≥ 10: Escalate to human with comprehensive report

### 🚨 ENFORCEMENT CHECKPOINTS

**MANDATORY before proceeding:**
1. ✅ Agents spawned (minimum count met for task complexity)
2. ✅ Each file edit followed by enhanced post-edit hook
3. ✅ Self-validation confidence scores recorded
4. ✅ Consensus swarm spawned for verification
5. ✅ Byzantine voting completed
6. ✅ Results stored in SwarmMemory

---

## 🎯 MANDATORY: NEXT STEPS GUIDANCE

**After completing ANY task, you MUST provide:**

1. **✅ What was completed**: Brief summary of delivered work
2. **📊 Validation results**: Confidence scores, test coverage, consensus approval
3. **🔍 Identified issues**: Any technical debt, warnings, or concerns discovered
4. **💡 Recommended next steps**: Prioritized suggestions for logical continuation

### Next Steps Template

```markdown
## Task Completion Summary

**✅ Completed**: [What was delivered]
**📊 Validation**:
- Confidence: X%
- Coverage: Y%
- Consensus: Z%

**⚠️ Identified Concerns**:
- [Issue 1] - Severity: [High/Medium/Low]
- [Issue 2] - Severity: [High/Medium/Low]

**💡 Recommended Next Steps** (in priority order):

1. **[High Priority]**: [Action item]
   - Why: [Business/technical rationale]
   - Effort: [Estimated time/complexity]

2. **[Medium Priority]**: [Action item]
   - Why: [Value proposition]
   - Effort: [Estimated time/complexity]

3. **[Low Priority]**: [Enhancement opportunity]
   - Why: [Long-term benefit]
   - Effort: [Estimated time/complexity]

**🤔 Questions for User**:
- [Decision point requiring clarification]?
- [Alternative approach consideration]?
```

**Rationale**: Proactive next steps ensure continuous progress, prevent workflow dead-ends, and help users understand logical task progression without requiring them to determine next actions.