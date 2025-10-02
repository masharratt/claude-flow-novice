# Prompt Engineering Best Practices

**Version:** 2.0.0
**Last Updated:** 2025-09-30

## Core Principles

Effective agent prompts require careful attention to structure, clarity, and appropriate detail level based on task complexity.

---

## 1. Clear Role Definition

```yaml
GOOD:
  "You are a senior Rust developer specializing in concurrent programming"

BAD:
  "You write code"

WHY:
  - Clear expertise domain
  - Sets expectations for quality
  - Activates relevant knowledge
```

---

## 2. Specific Responsibilities

```yaml
GOOD:
  - Implement lock-free data structures using atomics
  - Ensure memory safety with proper synchronization
  - Write linearizability tests using loom

BAD:
  - Write concurrent code
  - Make it safe

WHY:
  - Concrete and actionable
  - Measurable outcomes
  - Clear scope
```

---

## 3. Appropriate Tool Selection

```yaml
Essential Tools:
  - Read: Required for all agents (must read before editing)
  - Write: For creating new files
  - Edit: For modifying existing files
  - Bash: For running commands
  - Grep: For searching code
  - Glob: For finding files
  - TodoWrite: For task tracking

Optional Tools:
  - WebSearch: For research agents
  - Task: For coordinator agents (spawning sub-agents)

AVOID:
  - Giving unnecessary tools
  - Restricting essential tools
```

---

## 4. Integration Points

```yaml
GOOD:
  Collaboration:
    - Architect: Provides design constraints
    - Reviewer: Validates implementation
    - Tester: Ensures correctness

BAD:
  "Works with other agents"

WHY:
  - Specific integration contracts
  - Clear handoff points
  - Defined outputs/inputs
```

---

## 5. Validation and Hooks

### Mandatory Post-Edit Validation

**CRITICAL**: After **EVERY** file edit operation:

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "agent/step" --structured
```

**Benefits:**
- TDD compliance checking
- Security analysis (XSS, eval, credentials)
- Formatting validation
- Coverage analysis
- Actionable recommendations

**Rationale:**
- Ensures quality gates
- Provides immediate feedback
- Coordinates with other agents via memory
- Maintains system-wide standards

---

## 6. Anti-Patterns to Avoid

### ❌ Over-Specification (Tunnel Vision)

```markdown
BAD (for complex tasks):

## Strict Algorithm

1. ALWAYS use bubble sort for sorting
2. NEVER use built-in sort functions
3. MUST iterate exactly 10 times
4. Check each element precisely in this order: [detailed steps]

WHY BAD:
- Prevents optimal solutions
- Ignores context-specific needs
- Reduces AI reasoning ability
- May enforce suboptimal patterns
```

### ❌ Under-Specification (Too Vague)

```markdown
BAD (for basic tasks):

## Implementation

Write some code that works.

WHY BAD:
- No guidance on patterns
- Unclear success criteria
- High iteration count
- Inconsistent quality
```

### ❌ Example Overload

```markdown
BAD (for complex tasks):

[50 code examples of every possible pattern]

WHY BAD:
- Cognitive overload
- Priming bias
- Reduces creative problem-solving
- Makes prompt harder to maintain
```

### ❌ Rigid Checklists

```markdown
BAD (for architecture):

You MUST:
[ ] Use exactly these 5 patterns
[ ] Never deviate from this structure
[ ] Follow these steps in exact order
[ ] Use only these technologies

WHY BAD:
- Context-insensitive
- Prevents trade-off analysis
- Enforces solutions before understanding problems
```

---

## Agent Profile Structure

### Required Frontmatter (YAML)

```yaml
---
name: agent-name                    # REQUIRED: Lowercase with hyphens
description: |                      # REQUIRED: Clear, keyword-rich description
  MUST BE USED when [primary use case].
  Use PROACTIVELY for [specific scenarios].
  ALWAYS delegate when user asks [trigger phrases].
  Keywords - [comma-separated keywords for search]
tools: [Read, Write, Edit, Bash, TodoWrite]  # REQUIRED: Comma-separated list
model: sonnet                       # REQUIRED: sonnet | opus | haiku
color: seagreen                     # REQUIRED: Visual identifier
type: specialist                    # OPTIONAL: specialist | coordinator | swarm
capabilities:                       # OPTIONAL: Array of capability tags
  - rust
  - error-handling
  - concurrent-programming
lifecycle:                          # OPTIONAL: Hooks for agent lifecycle
  pre_task: "npx claude-flow@alpha hooks pre-task"
  post_task: "npx claude-flow@alpha hooks post-task"
hooks:                             # OPTIONAL: Integration points
  memory_key: "agent-name/context"
  validation: "post-edit"
triggers:                          # OPTIONAL: Automatic activation patterns
  - "build rust"
  - "implement concurrent"
constraints:                       # OPTIONAL: Limitations and boundaries
  - "Do not modify production database"
  - "Require approval for breaking changes"
---
```

### Body Structure

```markdown
# Agent Name

[Opening paragraph: WHO you are, WHAT you do]

## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run:

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "agent/step" --structured
```

[Why this matters and what it provides]

## Core Responsibilities

[Primary duties in clear, actionable bullet points]

## Approach & Methodology

[HOW the agent accomplishes tasks - frameworks, patterns, decision-making]

## Integration & Collaboration

[How this agent works with other agents and the broader system]

## Examples & Best Practices

[Concrete examples showing the agent in action]

## Success Metrics

[How to measure agent effectiveness]
```

---

## Integration with Claude Flow

### Hook System Integration

Every agent should integrate with the Claude Flow hook system for coordination:

#### 1. Pre-Task Hook

```bash
npx claude-flow@alpha hooks pre-task --description "Implementing authentication system"
```

**Purpose:**
- Initialize task context
- Set up memory namespace
- Log task start
- Coordinate with other agents

#### 2. Post-Edit Hook (MANDATORY)

```bash
npx claude-flow@alpha hooks post-edit src/auth/login.rs \
  --memory-key "coder/auth/login" \
  --structured
```

**Purpose:**
- Validate TDD compliance
- Run security analysis
- Check code formatting
- Analyze test coverage
- Store results in shared memory
- Provide actionable recommendations

**Output Includes:**
- ✅/❌ Compliance status
- 🔒 Security findings
- 🎨 Formatting issues
- 📊 Coverage metrics
- 🤖 Improvement suggestions

#### 3. Post-Task Hook

```bash
npx claude-flow@alpha hooks post-task --task-id "auth-implementation"
```

**Purpose:**
- Finalize task
- Export metrics
- Update coordination state
- Trigger downstream agents

#### 4. Session Management

```bash
# Restore session context
npx claude-flow@alpha hooks session-restore --session-id "swarm-auth-2025-09-30"

# End session and export metrics
npx claude-flow@alpha hooks session-end --export-metrics true
```

---

## Memory Coordination

Agents share context through the memory system:

```javascript
// Store context for other agents
npx claude-flow@alpha memory store \
  --key "architect/design/decision" \
  --value '{"pattern": "microservices", "rationale": "..."}'

// Retrieve context from other agents
npx claude-flow@alpha memory retrieve \
  --key "architect/design/decision"
```

**Memory Key Patterns:**
```
{agent-type}/{domain}/{aspect}

Examples:
- architect/auth/design
- coder/auth/implementation
- reviewer/auth/feedback
- tester/auth/coverage
```

---

## Swarm Coordination

When spawning multiple agents concurrently:

```javascript
// Coordinator spawns specialist agents
Task("Rust Coder", "Implement auth with proper error handling", "coder")
Task("Unit Tester", "Write comprehensive tests for auth", "tester")
Task("Code Reviewer", "Review auth implementation", "reviewer")

// Each agent MUST:
// 1. Run pre-task hook
// 2. Execute work
// 3. Run post-edit hook for each file
// 4. Store results in memory
// 5. Run post-task hook
```
