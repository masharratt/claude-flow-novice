# Claude Flow Novice - AI Agent Orchestration

## Core Orchestration Patterns

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT


**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently, not just MCP

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message
- **Bash commands**: ALWAYS batch ALL terminal operations in ONE message
- **Memory operations**: ALWAYS batch ALL memory store/retrieve in ONE message

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
**Claude Code's Task tool is the PRIMARY way to spawn agents:**
```javascript
// ✅ CORRECT: Use Claude Code's Task tool for parallel agent execution
[Single Message]:
  Task("Research agent", "Analyze requirements and patterns...", "researcher")
  Task("Coder agent", "Implement core features...", "coder")
  Task("Tester agent", "Create comprehensive tests...", "tester")
  Task("Reviewer agent", "Review code quality...", "reviewer")
  Task("Architect agent", "Design system architecture...", "system-architect")
```

**MCP tools are ONLY for coordination setup:**
### MCP Integration
**TRIGGER WORDS: SWARM, SPAWN, COORDINATE, TEAM**
- `mcp__claude-flow-novice__swarm_init` - Initialize coordination topology
- `mcp__claude-flow-novice__agent_spawn` - Define agent types for coordination
- `mcp__claude-flow-novice__task_orchestrate` - Orchestrate high-level workflows
- **Monitoring**: `swarm_status`, `agent_metrics`, `task_results`
- **Memory**: `memory_usage`, `memory_search`

## File Organization
- **Never save working files to root**

# Add MCP server
claude mcp add claude-flow-novice npx claude-flow-novice mcp start


## Essential Commands
- `npx claude-flow-novice status` - System health
- `npx claude-flow-novice --help` - Available commands
- `/swarm`, `/sparc`, `/hooks` - Slash commands (auto-discovered)

## DEVELOPMENT FLOW 
  1. Execute - Primary swarm (3-8 agents) produces deliverables with confidence score
  1a. Only when the swarm believes its done move to step 2. 
  1b. If swarm does not believe it's done (confidence scores < 75%, repeat step 1)
  2. Verify - Consensus swarm (2-4 validators) runs comprehensive checks with Byzantine voting
  3. Decision - PASS (≥90% agreement + critical criteria) OR FAIL
  4. Action -
    - PASS → Store results → Move to next task
    - FAIL → Round++ → If <10: inject feedback → Relaunch swarm | If ≥10: Escalate to human
  5. Repeat - Iterative improvement with accumulated context from all previous rounds
  6. Escalate - Full history + feedback + recommendations after 10 rounds