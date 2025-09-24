# Claude Code Configuration - {{PROJECT_TYPE}} Development Environment

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

### 🎯 CRITICAL: Claude Code Task Tool for Agent Execution

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

## Project Overview

**Project Type**: {{PROJECT_TYPE}}
**Primary Language**: {{PRIMARY_LANGUAGE}}
**Primary Framework**: {{PRIMARY_FRAMEWORK}}
**Package Manager**: {{PACKAGE_MANAGER}}
**Build Tools**: {{BUILD_TOOLS}}

**Detected Languages**: {{LANGUAGES_LIST}}
**Detected Frameworks**: {{FRAMEWORKS_LIST}}
**Project Directories**: {{DIRECTORIES}}

*Auto-generated on {{TIMESTAMP}}*

## 📁 File Organization Rules

**NEVER save to root folder. Use these directories:**
- `/src` - Source code files
- `/tests` - Test files
- `/docs` - Documentation and markdown files
- `/config` - Configuration files
- `/scripts` - Utility scripts
- `/examples` - Example code

## 🚀 Available Agent Types

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Backend Development
`backend-dev`, `api-docs`, `system-architect`, `code-analyzer`

### Frontend Development
`mobile-dev` (React Native), specialized frontend agents

### Testing & Validation
`tdd-london-swarm`, `production-validator`

### GitHub & Repository Management
`github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

### Performance & Optimization
`perf-analyzer`, `performance-benchmarker`, `task-orchestrator`

## 🎯 Claude Code vs MCP Tools

### Claude Code Handles ALL EXECUTION:
- **Task tool**: Spawn and run agents concurrently for actual work
- File operations (Read, Write, Edit, MultiEdit, Glob, Grep)
- Code generation and programming
- Bash commands and system operations
- Implementation work

### MCP Tools ONLY COORDINATE:
- Swarm initialization (topology setup)
- Agent type definitions (coordination patterns)
- Task orchestration (high-level planning)
- Memory management
- Performance tracking

**KEY**: MCP coordinates the strategy, Claude Code's Task tool executes with real agents.

## 📋 Agent Coordination Protocol

### Every Agent Spawned via Task Tool MUST:

**1️⃣ BEFORE Work:**
```bash
npx claude-flow@alpha hooks pre-task --description "[task]"
npx claude-flow@alpha hooks session-restore --session-id "swarm-[id]"
```

**2️⃣ DURING Work:**
```bash
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "swarm/[agent]/[step]"
npx claude-flow@alpha hooks notify --message "[what was done]"
```

**3️⃣ AFTER Work:**
```bash
npx claude-flow@alpha hooks post-task --task-id "[task]"
npx claude-flow@alpha hooks session-end --export-metrics true
```

## Build & Development Commands

```bash
# Package management
{{PACKAGE_MANAGER}} install
{{PACKAGE_MANAGER}} run build
{{PACKAGE_MANAGER}} run test
{{PACKAGE_MANAGER}} run lint

# Claude Flow commands
npx claude-flow@alpha init
npx claude-flow@alpha hooks setup
npx claude-flow@alpha memory store
```