# 🛡️ NPX-Protected CLAUDE.md Content

## 📋 Merge Instructions

This file was generated because you have an existing CLAUDE.md file.
To protect your customizations from being overwritten by NPX installs,
the new content is provided here for manual review and merging.

### 🔄 How to Merge:
1. Review the content below
2. Copy sections you want to your main CLAUDE.md
3. Delete this file when done
4. Your customizations remain safe!

---

# Generated CLAUDE.md Content

# Claude Flow Novice - AI Agent Orchestration

## Core Orchestration Patterns

## 🚨 CRITICAL: MANDATORY AGENT-BASED EXECUTION

**YOU MUST USE AGENTS FOR ALL NON-TRIVIAL WORK - NO EXCEPTIONS**

**ABSOLUTE RULES**:
1. **ALWAYS USE AGENTS** - Tasks requiring >3 steps MUST use agent coordination
2. **ALWAYS INITIALIZE SWARM** - ANY multi-agent task requires swarm_init FIRST
3. **ALWAYS RUN POST-EDIT HOOKS** - After EVERY file edit without exception
4. **ALWAYS BATCH OPERATIONS** - 1 MESSAGE = ALL RELATED OPERATIONS
4.1 **VALIDATION, REVIEW, AND CONSENSUS AGENTS SHOULD BE LAUNCHED AFTER IMPLEMENTATION IS DONE** - in a separate message. We can't validate work as its being built. 
5. **NEVER WORK SOLO** - Spawn multiple agents in parallel for ALL significant tasks
6. **NEVER SAVE TO ROOT** - Organize files in appropriate subdirectories
7. **USE CLAUDE CODE'S TASK TOOL** - For spawning agents concurrently, not just MCP
8. **USE THE CFN LOOP** - For a self correcting dev loop that saves time and resources
9. **DO NOT CREATE GUIDES, SUMMARIES, OR REPORT FILES** - unless specifically asked. 
10. **USE SPARTAN LANGUAGE** - no fluff encouraged

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

## 🚨 CRITICAL: Safe Test Execution

**NEVER run tests inside agents** - causes memory leaks from orphaned processes.

### Correct Pattern:
```bash
# 1. Run tests ONCE, save results
npm test -- --run --reporter=json > test-results.json 2>&1

# 2. Agents READ results file (no execution)
cat test-results.json

# 3. Kill orphaned processes after swarm
pkill -f vitest; pkill -f "npm test"
```

### Forbidden:
- ❌ `Task("agent", "run npm test", "type")` - spawns orphaned process
- ❌ Multiple agents running tests concurrently - 3x memory usage
- ❌ Long-running test commands without timeout cleanup

### Memory Impact:
- Each test run: 65MB+ heap
- Concurrent runs: 65MB × agent_count
- Orphaned processes persist after swarm completion
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
- ❌ Creating reports documents, summary documents, or guides unless explicity asked

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

#### Post-Edit Hook (MANDATORY After Every File Edit)
```bash
# Unified pipeline: standard validation + TDD + Rust quality
node config/hooks/post-edit-pipeline.js "[FILE]" --memory-key "swarm/[agent]/[step]"

# Enable TDD mode (single-file testing, coverage, phase detection)
node config/hooks/post-edit-pipeline.js "[FILE]" --tdd-mode --minimum-coverage 80

# Enable Rust strict mode (unwrap/expect/panic detection)
node config/hooks/post-edit-pipeline.js "[FILE]" --rust-strict

# Full mode: TDD + Rust + coverage threshold
node config/hooks/post-edit-pipeline.js "[FILE]" --tdd-mode --rust-strict --minimum-coverage 90
```

**Features (all languages):**
- Formatting, linting, type checking, security, dependencies
- Single-file testing (1-5s vs 10-60s full suite)
- Real-time coverage (Jest, pytest, cargo-tarpaulin)
- TDD compliance (Red-Green-Refactor detection)
- Rust quality (unwrap/expect/panic with line numbers)
- Comment-aware validation, structured JSON output
- Logs to `post-edit-pipeline.log` (500 entries max)

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

## 📋 AGENT COORDINATION RULES

### Universal Agent Spawning Pattern

**EVERY multi-agent task follows this structure:**

```javascript
[Single Message]:
  // Step 1: ALWAYS initialize swarm first
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",          // or "hierarchical" for 8+ agents
    maxAgents: X,              // match your actual agent count
    strategy: "balanced"       // or "adaptive" for complex tasks
  })

  // Step 2: Spawn ALL agents concurrently
  Task("Agent Name", "Specific task instructions", "agent-type")
  Task("Agent Name", "Specific task instructions", "agent-type")
  Task("Agent Name", "Specific task instructions", "agent-type")
  // ... continue for all agents
```

### Coordination Checklist

**Before spawning agents, ensure:**
- ✅ Task analyzed and complexity assessed (Simple/Medium/Complex/Enterprise)
- ✅ Agent count determined from requirements table
- ✅ Agent types selected for specific needs (not generic roles)
- ✅ Topology chosen: mesh (2-7) or hierarchical (8+)
- ✅ All agents will spawn in SINGLE message
- ✅ Each agent has specific, non-overlapping instructions

**During execution:**
- ✅ Agents coordinate through SwarmMemory
- ✅ Self-validation runs before consensus
- ✅ Each agent runs Post-edit hooks execute after file changes

**After completion:**
- ✅ Consensus validation achieved (≥90% agreement)
- ✅ Results stored in memory
- ✅ Next steps determined

### Agent Selection Guide

**Core Development**: coder, tester, reviewer
**Backend**: backend-dev, api-docs, system-architect
**Frontend**: coder (specialized), mobile-dev
**Quality**: tester, reviewer, security-specialist, perf-analyzer
**Planning**: researcher, planner, architect
**Operations**: devops-engineer, cicd-engineer
**Documentation**: api-docs, researcher

**Select agents based on actual task needs, not predefined patterns.**

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

## 🔄 MANDATORY CFN LOOP (4-LOOP STRUCTURE)

**YOU MUST FOLLOW THIS 4-LOOP STRUCTURE FOR ALL NON-TRIVIAL WORK:**

```
┌─────────────────────────────────────────────────────────────────┐
│ LOOP 0: Epic/Sprint Orchestration (Multi-Phase Projects)       │
│ ├─ Epic → Phase 1 → Phase 2 → ... → Phase N                   │
│ └─ Each Phase contains Sprints with dependencies               │
│    ↓                                                            │
│ LOOP 1: Phase Execution (Implementation Plan)                  │
│ ├─ Phases execute sequentially until project completion        │
│ └─ Max: Unbounded (continues until all phases complete)        │
│    ↓                                                            │
│ LOOP 2: Consensus Validation (Swarm → Gate → Validators)       │
│ ├─ Execute Loop 3 → Self-Assessment Gate → Consensus Swarm     │
│ ├─ Max iterations: 10 per phase                                │
│ └─ Exit: ≥90% consensus OR max iterations                      │
│    ↓                                                            │
│ LOOP 3: Primary Swarm Execution (Implementation)               │
│ ├─ Agents implement, self-validate, report confidence          │
│ ├─ Max iterations: 10 per subtask                              │
│ └─ Exit: ALL agents ≥75% confidence OR max iterations          │
└─────────────────────────────────────────────────────────────────┘
```

### Loop 0: Epic/Sprint Orchestration (Multi-Phase Projects)
**Highest level** - Manages large implementations broken into phases/sprints
- Use `/cfn-loop-epic` for multi-phase projects (e.g., complete auth system)
- Use `/cfn-loop-sprints` for single phase with multiple sprints
- Coordinates cross-phase dependencies
- **No iteration limit** - continues until all phases/sprints complete

### Loop 1: Phase Execution (Implementation Plan)
**Outer loop** - Iterates through implementation plan phases
- Each phase = major deliverable or milestone
- Phases execute sequentially: Phase 1 → Phase 2 → Phase 3
- Auto-transitions to next phase when current phase achieves ≥90% consensus
- **No iteration limit** - continues until all phases complete

### Loop 2: Consensus Validation (Gate → Validators)
**Middle loop** - Validates phase completion before progression
- **Max iterations**: 10 per phase
- **Exit condition**: ≥90% consensus OR max iterations

**Loop 2 Flow:**
```
1. Execute Loop 3 (Primary Swarm)
2. Self-Assessment Gate
   - ALL agents ≥75%? → Spawn Consensus Swarm
   - ANY agent <75%? → Relaunch Loop 3 with targeted agents
3. Consensus Validation
   - ≥90% approval? → Exit Loop 2, proceed to next phase
   - <90% approval? → Relaunch Loop 3 with validator feedback
```

### Loop 3: Primary Swarm Execution (Implementation)
**Inner loop** - Agents implement and self-validate
- **Max iterations**: 10 per subtask
- **Exit condition**: ALL agents ≥75% confidence OR max iterations

---

## CFN LOOP DETAILED STEPS

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
  Task("Agent 1", "Specific instructions + MUST report confidence score", "type")
  Task("Agent 2", "Specific instructions + MUST report confidence score", "type")
  Task("Agent 3", "Specific instructions + MUST report confidence score", "type")
```

**CRITICAL**: Without swarm_init, agents work independently and produce inconsistent results!

### Step 2: Execute - Primary Swarm (Loop 3 execution)
- **Primary swarm** (3-8 agents minimum) produces deliverables with confidence scores
- **Self-validation**: Each agent validates own work and reports confidence
- **Cross-agent coordination**: Agents share findings via SwarmMemory
- **Confidence reporting**: ALL agents MUST report scores in this format:

```json
{
  "agent": "coder-1",
  "confidence": 0.85,
  "reasoning": "All tests passing, security checks clean, no blocking issues",
  "blockers": []
}
```

**Confidence Score Interpretation:**
- **0.90-1.00**: Excellent - production ready
- **0.75-0.89**: Good - minor improvements possible
- **0.60-0.74**: Fair - significant issues remain
- **0.00-0.59**: Poor - major rework needed

### Step 3: Self-Assessment Gate (MANDATORY CHECK)
**GATE LOGIC:**
- **Collect**: Gather confidence scores from ALL primary swarm agents
- **Evaluate**: Check if ALL agents meet ≥75% confidence threshold
- **Decision**:
  - ✅ **PASS** (all agents ≥75%) → IMMEDIATELY proceed to Step 4 (Consensus Verification)
  - ❌ **FAIL** (any agent <75%) → IMMEDIATELY relaunch Loop 3 swarm with targeted agents

**Loop 3 Iteration Limits:**
- Iteration < 10: IMMEDIATELY relaunch Loop 3 swarm with different/additional agents based on issues
- Iteration ≥ 10: Escalate to human with diagnostic report
- **NO APPROVAL NEEDED**: Self-correction happens automatically

**Agent Selection for Retry:**
- Analyze which agents failed and WHY
- Spawn DIFFERENT agents if needed (backend-dev instead of coder, security-specialist for auth issues)
- Add ADDITIONAL agents to address gaps (missing tester, missing security review)
- Inject specific feedback for each agent type

**Feedback Injection Format:**
```json
{
  "iteration": 3,
  "failed_agents": ["coder-2", "tester-1"],
  "confidence_scores": {
    "coder-1": 0.85,
    "coder-2": 0.68,
    "tester-1": 0.72
  },
  "focus_areas": [
    "coder-2: Improve error handling in auth module",
    "tester-1: Add integration tests for API endpoints"
  ],
  "recommended_agents": {
    "replace": ["coder-2 → backend-dev (auth expertise needed)"],
    "add": ["security-specialist (auth validation)"]
  }
}
```

### Step 4: Verify - Consensus Swarm (2-4 validators REQUIRED)

**⚠️ CRITICAL: Sequential Spawning to Prevent Premature Validation**

Validators MUST spawn in **separate message** AFTER implementation completes AND gate passes:

```javascript
// MESSAGE 1: Implementation swarm only (NO REVIEWERS/VALIDATORS)
[Implementation Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  Task("Coder 1", "Implement feature X + report confidence", "coder")
  Task("Coder 2", "Implement feature Y + report confidence", "backend-dev")
  Task("Coder 3", "Implement feature Z + report confidence", "rust-expert")

// [WAIT FOR COMPLETION + GATE PASS (ALL ≥75%)]

// MESSAGE 2: Validation swarm AFTER implementation complete
[Validation Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 4,
    strategy: "balanced"
  })

  Task("Validator 1", "Review completed work at [specific files]", "reviewer")
  Task("Validator 2", "Security audit of completed implementation", "security-specialist")
  Task("Validator 3", "Architecture validation of completed system", "system-architect")
  Task("Validator 4", "Integration testing of completed features", "tester")
```

**WHY SEQUENTIAL SPAWNING:**
- ✅ Prevents validators from reviewing incomplete work-in-progress
- ✅ Ensures all implementation is finished AND confident before validation
- ✅ Avoids wasted validation cycles on low-confidence code
- ✅ Produces accurate consensus scores on completed deliverables

- **Byzantine consensus voting** across all validators
- **Multi-dimensional checks**: quality, security, performance, tests, docs

### Step 5: Product Owner Decision Gate (GOAP Decision Authority)

**🎯 CRITICAL: Product Owner uses GOAP algorithm for autonomous decisions**

After consensus validation, Product Owner agent makes autonomous PROCEED/DEFER/ESCALATE decision:

```javascript
// Spawn Product Owner AFTER consensus results available
Task("Product Owner", `
  GOAP DECISION EXECUTION - Loop 2 Iteration ${iteration}/10

  CURRENT STATE:
  - Consensus: ${consensusScore} (target: ≥0.90)
  - Validator concerns: ${JSON.stringify(concerns)}
  - Loop 2 iteration: ${loop2Iteration}/10
  - Scope boundaries: ${scope}

  GOAL STATE:
  - Consensus: ≥0.90
  - All in-scope criteria met: true
  - Scope intact: true

  RETRIEVE SCOPE FROM MEMORY:
  mcp__claude-flow-novice__memory_usage({
    action: "retrieve",
    namespace: "scope-control",
    key: "project-boundaries"
  })

  EXECUTE GOAP A* SEARCH:
  1. Classify validator concerns: in-scope vs out-of-scope
  2. Generate action space with cost functions
  3. Run A* pathfinding from current → goal state
  4. Make autonomous decision (NO PERMISSION)

  OUTPUT: {decision: "PROCEED|DEFER|ESCALATE", ...}
`, "product-owner")
```

**Decision Outcomes:**

- **PROCEED** (in-scope blockers found) →
  - Product Owner selects targeted Loop 3 agents
  - IMMEDIATELY relaunch Loop 3 with specific fixes
  - NO PERMISSION NEEDED (iteration < 10)

- **DEFER** (out-of-scope concerns) →
  - Save concerns to backlog
  - Approve phase at current state
  - AUTO-TRANSITION to next phase

- **ESCALATE** (critical ambiguity, rare) →
  - Generate options with recommendations
  - Only when truly blocked or high-risk

### Step 6: Action Based on Decision
- **PROCEED Decision** →
  1. Product Owner output specifies Loop 3 agents and focus areas
  2. IMMEDIATELY spawn Loop 3 swarm with targeted agents
  3. NO APPROVAL NEEDED (autonomous execution)

- **DEFER Decision** →
  1. Store deferred items in backlog memory
  2. Update phase status to complete
  3. IMMEDIATELY transition to next phase

- **ESCALATE Decision** →
  1. Generate diagnostic report with alternatives
  2. Suggest agent strategy adjustments
  3. Only STOP if explicit human halt request

**Consensus Failure - Relaunch Loop 3 with Targeted Agents:**
```json
{
  "consensus_score": 0.82,
  "failed_criteria": ["security", "test_coverage"],
  "validator_feedback": {
    "security-specialist": "SQL injection vulnerability in user input handler",
    "tester": "Integration test coverage at 45%, need 80%+"
  },
  "required_actions": [
    "Fix SQL injection in src/handlers/user.js:45",
    "Add integration tests for /api/users endpoints"
  ],
  "loop3_relaunch_plan": {
    "agents": [
      "backend-dev: Fix SQL injection in src/handlers/user.js:45",
      "tester: Add integration tests for /api/users (target 80%+ coverage)",
      "security-specialist: Validate SQL injection fix and scan for similar issues"
    ],
    "action": "IMMEDIATELY spawn Loop 3 swarm with these agents (NO approval needed)"
  }
}
```

### 🚨 ENFORCEMENT CHECKPOINTS

**MANDATORY before proceeding:**
1. ✅ Swarm initialized with topology and strategy
2. ✅ Primary agents spawned with confidence reporting instructions
3. ✅ Each file edit followed by enhanced post-edit hook
4. ✅ Self-assessment gate evaluated (ALL agents ≥75%)
5. ✅ Consensus swarm spawned ONLY after gate passes
6. ✅ Byzantine voting completed (≥90% for approval)
7. ✅ Results stored in SwarmMemory
8. ✅ Loop iteration counters tracked (Loop 2 ≤10, Loop 3 ≤10)

---

## 🔄 AUTONOMOUS CFN LOOP EXECUTION

**CRITICAL INSTRUCTION**: The CFN Loop is a SELF-CORRECTING, SELF-LOOPING process. You MUST continue iterations autonomously without waiting for human approval but automatically relaunching a loops' swarms or proceeding to the next phase

### Autonomous Behavior Rules:

1. **Consensus Fails (Loop 2 iteration 1-9/10)**
   - IMMEDIATELY analyze validator feedback to identify issues
   - IMMEDIATELY relaunch Loop 3 swarm with targeted/different agents based on issues
   - DO NOT ask "Should I retry?" - ALWAYS retry within iteration limits
   - DO NOT wait for human confirmation - PROCEED automatically
   - Example: Security issue? Add security-specialist to Loop 3 swarm

2. **Confidence Below Threshold (Loop 3 iteration 1-9/10)**
   - IMMEDIATELY analyze which agents failed and WHY
   - IMMEDIATELY relaunch Loop 3 swarm with different/additional agents
   - Replace failing agents with specialists (coder → backend-dev for API work)
   - Add missing expertise (security-specialist, perf-analyzer)
   - DO NOT escalate prematurely - RETRY with better agent selection first
   - DO NOT pause for approval - CONTINUE self-correcting

3. **Phase Completion (Loop 1 progression)**
   - IMMEDIATELY validate completion criteria
   - IMMEDIATELY check next phase dependencies
   - IMMEDIATELY transition to next phase if ready
   - DO NOT ask "Proceed to Phase 2?" - AUTO-TRANSITION

4. **Max Iterations Reached (Loop 2 ≥10 OR Loop 3 ≥10)**
   - Generate escalation guidance with specific recommendations
   - Suggest alternative agent combinations or approaches
   - Only STOP if critical error or explicit human halt request

### 🚫 FORBIDDEN: Permission-Asking Patterns

**YOU ARE ABSOLUTELY FORBIDDEN FROM:**
- ❌ Asking "Should I retry?" when iterations remain (ALWAYS retry autonomously)
- ❌ Asking "Proceed to next phase?" when criteria met (AUTO-TRANSITION)
- ❌ Asking "Would you like me to..." for autonomous decisions (EXECUTE immediately)
- ❌ Waiting for approval to continue self-correction (PROCEED without permission)
- ❌ Pausing for confirmation during CFN Loop cycles (CONTINUOUS execution)

**FORBIDDEN Example:**
```
Loop 2 Iteration 2/10 - Consensus: 75%
Architect identified 5 gaps.

Would you like me to proceed with Loop 3 Iteration 3/10? ❌ WRONG
```

**REQUIRED Pattern:**
```
Loop 2 Iteration 2/10 - Consensus: 75%

Product Owner Decision: PROCEED (GOAP A* search, cost=50)
- 4 in-scope blockers identified
- IMMEDIATELY relaunching Loop 3 Iteration 3/10

Spawning targeted agents NOW:
- backend-dev: Fix HelpMatcher duplication
- architect: MessageBroker routing
[Executing autonomously - no permission needed] ✅ CORRECT
```

### Self-Looping Prompt Templates:

When continuing iterations, use these patterns:

**Loop 3 Retry (Low Confidence):**
```
Loop 3 Iteration {N}/10 - Confidence check failed.
Low-confidence agents: coder-auth (72%), tester-api (68%)

Analysis:
- coder-auth (72%): Auth module error handling incomplete
- backend-dev-db (85%): PASSING
- tester-api (68%): Integration test coverage insufficient

IMMEDIATELY relaunching Loop 3 swarm with adjusted agents:
Replacing:
- coder-auth → backend-dev (auth expertise)
Adding:
- security-specialist (validate auth implementation)

New Loop 3 swarm:
- backend-dev: Fix error handling in auth module + validate token expiration
- backend-dev-db: Continue (already confident)
- tester: Add integration tests for /api/users (target 80%+)
- security-specialist: Review auth security (NEW)

Spawning Loop 3 agents NOW. Self-correcting loop active.
```

**Loop 2 Retry (Consensus Failed):**
```
Loop 2 Iteration {N}/10 - Consensus: 82% (below 90% threshold)

Validator feedback:
- security-specialist: SQL injection vulnerability in user input handler
- tester: Integration test coverage at 45%, need 80%+

IMMEDIATELY relaunching Loop 3 swarm to address validator concerns:
Targeted agents for issues:
- backend-dev: Fix SQL injection in src/handlers/user.js:45
- tester: Add integration tests for /api/users (target 80%+)
- security-specialist: Validate fix and scan for similar vulnerabilities

Spawning Loop 3 swarm NOW. NO approval needed. Self-looping process continues.
```

**Loop 1 Phase Transition:**
```
Phase {N} complete. Consensus: 94% ✅

Completion criteria met:
✅ All deliverables implemented
✅ Test coverage: 87%
✅ Security audit passed
✅ Documentation updated

Dependencies satisfied for Phase {N+1}.

IMMEDIATELY transitioning to next phase:
{Phase description}

Auto-transitioning NOW. No approval needed.
```

### When to STOP Self-Looping:

ONLY stop autonomous execution when:
- ✅ All phases complete successfully (Loop 1 finished)
- ⚠️ Critical compilation/security error
- 🛑 Explicit user command: "STOP" or "PAUSE"
- ⚠️ Loop 2 iteration ≥10 AND Loop 3 iteration ≥10 (dual limits reached)

### Continuation Decision Logic:

```javascript
// Loop 3 (Primary Swarm Confidence Check)
if (anyAgentConfidence < 0.75 && loop3Iteration < 10) {
  // Analyze failures and select better agents
  const failedAgents = agents.filter(a => a.confidence < 0.75);
  const replacements = selectBetterAgents(failedAgents);
  return "IMMEDIATELY relaunch Loop 3 with " + replacements.join(", ");
}

// Loop 2 (Consensus Validation)
if (consensusScore < 0.90 && loop2Iteration < 10) {
  // Extract validator concerns and spawn targeted Loop 3 agents
  const issues = extractValidatorIssues(consensusResult);
  const targetedAgents = selectAgentsForIssues(issues);
  return "IMMEDIATELY relaunch Loop 3 with " + targetedAgents.join(", ");
}

// Loop 1 (Phase Progression)
if (phaseComplete && nextPhaseReady) {
  return "IMMEDIATELY transition to next phase";
}

// Escalation conditions
if (loop2Iteration >= 10 || loop3Iteration >= 10) {
  return "Generate alternative agent strategy and retry OR escalate";
}

if (criticalError || userHalt) {
  return "STOP and escalate";
}
```

### Example Self-Looping Session:

```
[Turn 1] Initialize Phase 1
         → Loop 3 Iteration 1/10
         → Primary Swarm spawned
         → Confidence: Agent A: 68%, Agent B: 85%, Agent C: 72%
         → Gate FAILS (agents A & C below 75%)
         → IMMEDIATELY retry Loop 3 with feedback (no approval needed)

[Turn 2] Loop 3 Iteration 2/10
         → Primary Swarm relaunched with feedback
         → Confidence: Agent A: 82%, Agent B: 88%, Agent C: 79%
         → Gate PASSES (all ≥75%)
         → Proceed to Loop 2 (Consensus Validation)

[Turn 3] Loop 2 Iteration 1/10
         → Consensus Swarm spawned
         → Consensus: 85% (below 90%)
         → Validator feedback: security concerns, test coverage
         → IMMEDIATELY retry Loop 2 with feedback

[Turn 4] Loop 2 Iteration 2/10
         → Loop 3 executed (primary swarm with validator feedback)
         → Confidence: 91% average
         → Consensus Swarm re-validated
         → Consensus: 94% ✅
         → Phase 1 COMPLETE
         → IMMEDIATELY transition to Phase 2

[Turn 5] Phase 2 execution begins...
```

**NOTICE**: No human approval requested. System self-loops continuously.

### Critical Autonomous Execution Reminders:

**YOU ARE FORBIDDEN FROM:**
- ❌ Asking "Should I retry?" when iterations remain
- ❌ Asking "Proceed to next phase?" when criteria met
- ❌ Waiting for approval to continue self-correction
- ❌ Stopping prematurely before iteration limits
- ❌ Escalating without attempting alternatives first
- ❌ Pausing for confirmation during autonomous cycles

**YOU ARE REQUIRED TO:**
- ✅ IMMEDIATELY relaunch Loop 3 on consensus failure with targeted agents (if Loop 2 iteration < 10)
- ✅ IMMEDIATELY relaunch Loop 3 on low confidence with different/additional agents (if Loop 3 iteration < 10)
- ✅ IMMEDIATELY transition phases when criteria met
- ✅ AUTOMATICALLY select better agents based on failure analysis
- ✅ CONTINUOUSLY self-loop until success or limits reached
- ✅ ONLY escalate when truly blocked (critical error or iteration limits reached)

### Autonomous Execution Metrics:

Track these internally (no user prompts):
- Loop 0: Current epic/sprint (e.g., Epic: auth-system, Phase 2/4, Sprint 1.3/1.5)
- Loop 1: Current phase number (e.g., Phase 2/4)
- Loop 2: Iteration counter (e.g., 3/10)
- Loop 3: Iteration counter (e.g., 7/10)
- Confidence scores by agent (e.g., backend-dev: 82%, tester: 68%)
- Consensus percentage (e.g., 87%)
- Agent adjustments (e.g., Replaced coder → backend-dev, Added security-specialist)
- Critical blockers (if any)

**Output Format** (concise, action-oriented):
```
Loop 3 Iteration 2/10 - Confidence: 82% avg (target: 75%) ✅
All agents passing gate. Proceeding to Loop 2 (Consensus)...

Loop 2 Iteration 1/10 - Consensus: 87% (target: 90%) ❌
Validator feedback: [SQL injection, test coverage 45%]
IMMEDIATELY relaunching Loop 3 with targeted agents:
- backend-dev (fix SQL injection)
- tester (increase coverage to 80%+)
- security-specialist (validate fix)

[Loop 3 execution in progress - autonomous retry with new agents]
```

---

## NEXT STEPS GUIDANCE

1. **✅ What was completed**: Brief summary of delivered work
2. **📊 Validation results**: Confidence scores, test coverage, consensus approval
3. **🔍 Identified issues**: Any technical debt, warnings, or concerns discovered
4. **💡 Recommended next steps**: Prioritized suggestions for logical continuation


---

## 🗑️ Cleanup
Delete this file after merging: `rm claude-copy-to-main.md`
