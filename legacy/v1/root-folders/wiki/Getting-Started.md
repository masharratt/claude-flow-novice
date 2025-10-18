# Getting Started with CFN Loop

This guide walks you through your first CFN Loop execution, from installation to successful completion.

---

## Prerequisites

### System Requirements
- **Node.js:** v20.0.0 or higher
- **npm:** v9.0.0 or higher
- **Operating System:** Linux, macOS, or Windows (WSL2)

### Recommended Tools
- **Git:** For version control
- **Code Editor:** VS Code, Cursor, or similar
- **Terminal:** Bash, Zsh, or PowerShell

---

## Installation

### Option 1: Global Installation (Recommended)
```bash
npm install -g claude-flow-novice
```

### Option 2: Project-Specific Installation
```bash
npm install --save-dev claude-flow-novice
```

### Option 3: npx (No Installation)
```bash
npx claude-flow-novice cfn-loop "task description"
```

### Verify Installation
```bash
npx claude-flow-novice --version
# Expected output: 1.5.22 or higher
```

---

## First CFN Loop Execution

### Simple Example: Add REST API Endpoint

**Goal:** Implement `GET /api/users/:id` endpoint with tests

#### Step 1: Initialize Swarm
```javascript
[Single Message]:
  // MANDATORY: Initialize swarm first
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  // Spawn agents
  Task("Backend Coder", `
    Implement GET /api/users/:id endpoint:
    - Retrieve user profile from database
    - Return JSON response
    - Handle user not found (404)
    - Add input validation
  `, "coder")

  Task("Test Engineer", `
    Write integration tests:
    - Test successful user retrieval
    - Test user not found (404)
    - Test invalid user ID format
    - Achieve 80%+ coverage
  `, "tester")

  Task("Code Reviewer", `
    Review for:
    - Code quality
    - Error handling
    - API design consistency
    - Security best practices
  `, "reviewer")
```

#### Step 2: Agents Execute (Loop 2)

**Backend Coder:**
```bash
# Edits: src/routes/users.js (45 lines)

# MANDATORY: Run post-edit hook
npx enhanced-hooks post-edit "src/routes/users.js" \
  --memory-key "swarm/backend-coder/user-profile" \
  --structured
```

**Output:**
```json
{
  "success": true,
  "validation": { "passed": true },
  "testing": { "passed": 0, "failed": 0, "coverage": 0 },
  "recommendations": [
    { "type": "test", "message": "No tests found for this file" }
  ]
}
```

**Self-Validation:**
```javascript
// Backend Coder confidence: 0.45 ❌ (no tests yet)
// Test Engineer confidence: 1.00 ✅ (tests pass)
// Code Reviewer confidence: 0.88 ✅

// Min confidence: 0.45 < 0.75 → RETRY
```

#### Step 3: Retry with Feedback (Loop 2, Round 2)

**Feedback to Backend Coder:**
```
Previous validation failed:
- No tests found for src/routes/users.js
- Work with Test Engineer to ensure tests cover your implementation
```

**Backend Coder re-runs hook after tests added:**
```bash
npx enhanced-hooks post-edit "src/routes/users.js" \
  --memory-key "swarm/backend-coder/user-profile" \
  --structured
```

**Updated Validation:**
```javascript
// Backend Coder confidence: 1.00 ✅ (tests now passing)
// Min confidence: 1.00 ≥ 0.75 → PROCEED TO CONSENSUS
```

#### Step 4: Consensus Verification (Loop 3)

```javascript
[Single Message]:
  Task("Quality Reviewer", "Comprehensive quality review", "reviewer")
  Task("Security Auditor", "Security and performance audit", "security-specialist")
```

**Validator Assessments:**
```javascript
// Quality Reviewer: approve=true, confidence=0.92
// Security Auditor: approve=true, confidence=0.95

// Agreement: 100% (2/2)
// Avg Confidence: 93.5%
// Decision: PASS ✅
```

#### Step 5: Success!

**Next Steps Guidance:**
```json
{
  "completed": "User profile endpoint (GET /api/users/:id)",
  "validationResults": {
    "confidence": 0.935,
    "coverage": 87,
    "consensusApproval": true
  },
  "identifiedIssues": [],
  "nextSteps": [
    "Consider extracting validation logic to middleware",
    "Add user profile update endpoint (PUT /api/users/:id)",
    "Deploy to staging environment"
  ]
}
```

**Total Time:** ~5-10 minutes
**Total Rounds:** 2 (1 retry in Loop 2, 1 consensus pass)

---

## Common Patterns

### Pattern 1: Using Slash Command

```bash
/cfn-loop "Implement JWT authentication"
```

**Auto-detected Configuration:**
- Agent count: 4 (backend-dev, security-specialist, tester, reviewer)
- Topology: mesh (4 agents)
- Confidence threshold: 0.75
- Consensus threshold: 0.90

### Pattern 2: Custom Configuration

```bash
/cfn-loop "Build real-time chat" \
  --agents 6 \
  --topology mesh \
  --confidence 0.80 \
  --consensus-threshold 0.95 \
  --coverage 85
```

### Pattern 3: Via CLAUDE.md Prompt

**Add to your prompt:**
```markdown
**Task:** Implement user authentication with JWT

**Requirements:**
- Use CFN Loop for quality assurance
- Minimum 80% test coverage
- Security audit required
- Deploy to staging after validation

**Agent Team:** backend-dev, security-specialist, tester, reviewer
```

Claude will automatically:
1. Initialize swarm
2. Spawn agents
3. Run post-edit hooks
4. Execute self-validation
5. Spawn consensus validators
6. Provide Next Steps Guidance

---

## Key Concepts

### 1. Swarm Initialization (MANDATORY)
```javascript
// ALWAYS call swarm_init BEFORE spawning multiple agents
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",          // mesh (2-7) or hierarchical (8+)
  maxAgents: 3,
  strategy: "balanced"
})
```

**Why?** Without swarm_init:
- Agents work independently
- No cross-agent coordination
- Inconsistent solutions (e.g., 3 different auth methods)

### 2. Post-Edit Hooks (MANDATORY)
```bash
# After EVERY file edit
npx enhanced-hooks post-edit "file.js" \
  --memory-key "swarm/agent/task" \
  --minimum-coverage 80 \
  --structured
```

**Why?** Post-edit hooks validate:
- Syntax (prettier, eslint)
- Type checking (TypeScript)
- Security (XSS, secrets)
- Tests (Jest, Mocha)
- Coverage (80% minimum)

### 3. Confidence Thresholds

**Self-Validation (Loop 2):** 0.75 (75%)
- Tests passing
- Coverage ≥ 80%
- No security issues
- Syntax correct

**Consensus (Loop 3):** 0.90 (90%)
- Agreement rate ≥ 90%
- Avg confidence ≥ 90%
- All critical criteria met

### 4. Agent Selection

| Task Size | Agent Count | Typical Agents |
|-----------|-------------|----------------|
| Simple (3-5 steps) | 2-3 | coder, tester, reviewer |
| Medium (6-10 steps) | 4-6 | + researcher, architect, security |
| Complex (11-20 steps) | 8-12 | Full specialist team |
| Enterprise (20+ steps) | 15-20 | + devops, api-docs, compliance |

---

## Troubleshooting First Run

### Issue 1: Swarm Not Coordinating
**Symptom:** Agents produce conflicting solutions

**Cause:** Forgot to call `swarm_init`

**Solution:**
```javascript
// ✅ GOOD: Initialize swarm first
mcp__claude-flow-novice__swarm_init({ topology: "mesh", maxAgents: 3 })
Task("Agent 1", "...", "type")
```

### Issue 2: Post-Edit Hook Fails
**Symptom:** `enhanced-hooks` command errors

**Cause:** Missing dependencies (prettier, eslint, jest)

**Solution:**
```bash
npm install --save-dev prettier eslint jest
npx enhanced-hooks post-edit "file.js" --structured
```

### Issue 3: Low Confidence Scores
**Symptom:** Self-validation always fails

**Cause:** Missing tests or low coverage

**Solution:**
```bash
# Check validation details
npx enhanced-hooks post-edit "file.js" --structured

# Add tests first, then re-run
```

### Issue 4: Consensus Fails
**Symptom:** Validators disagree after 5+ rounds

**Cause:** Contradictory feedback or ambiguous requirements

**Solution:**
1. Review validator feedback for conflicts
2. Clarify requirements
3. Re-initialize swarm with updated context

---

## Next Steps

Now that you've completed your first CFN loop:

1. **[Confidence Scores](Confidence-Scores.md)** - Understand how scoring works
2. **[Agent Coordination](Agent-Coordination.md)** - Learn advanced swarm patterns
3. **[Security](Security.md)** - Implement security best practices
4. **[API Reference](API-Reference.md)** - Deep dive into implementation

---

## Quick Reference

### Essential Commands
```bash
# Initialize swarm (MCP)
mcp__claude-flow-novice__swarm_init({ topology, maxAgents, strategy })

# Spawn agents (Task tool)
Task("Name", "Instructions", "type")

# Post-edit hook (MANDATORY)
npx enhanced-hooks post-edit "file" --memory-key "key" --structured

# Check status
npx claude-flow-novice swarm status

# View memory
npx claude-flow-novice memory search "swarm/*"
```

### Confidence Thresholds
| Phase | Threshold | Description |
|-------|-----------|-------------|
| Self-Validation | 0.75 | Minimum agent confidence |
| Consensus Agreement | 0.90 | Minimum validator approval |
| Consensus Confidence | 0.90 | Minimum average confidence |
| Coverage | 0.80 | Minimum test coverage |

---

**Last Updated:** 2025-10-02
**Version:** 1.5.22
