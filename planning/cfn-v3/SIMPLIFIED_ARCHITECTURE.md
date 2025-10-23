# CFN v3 - Simplified Task Tool Architecture

**Status:** APPROVED
**Date:** 2025-10-22
**Pattern:** All agents via Task tool, Main Chat orchestrates loops

---

## Core Pattern: Main Chat Orchestration

**All agents spawned via Task() tool. Main Chat keeps the loop going.**

```javascript
// Main Chat orchestrates entire CFN Loop

// 1. Spawn coordinator to analyze task
Task("cfn-v3-coordinator", `
  Analyze task: ${TASK_DESCRIPTION}

  Return:
  - task_type (software/content/research/design/data/infrastructure)
  - recommended_agents (Loop 3, Loop 2, Loop 4)
  - validation_criteria
  - estimated_iterations
`)

// Coordinator returns analysis
const analysis = await coordinatorResult

// 2. Main Chat spawns Loop 3 agents (parallel)
Task("backend-dev", `Iteration 1: ${TASK_DESCRIPTION}...`)
Task("security-specialist", `Iteration 1: ${TASK_DESCRIPTION}...`)

// Wait for all Loop 3 agents to complete
const loop3Results = await allAgentsComplete

// 3. Main Chat checks gate
if (loop3_confidence < 0.75) {
  // Relaunch Loop 3 with feedback
  Task("backend-dev", `Iteration 2: Address feedback...`)
  // Repeat...
}

// 4. Main Chat spawns Loop 2 validators (parallel)
Task("reviewer", `Review Loop 3 output...`)
Task("tester", `Test Loop 3 output...`)

const loop2Results = await allValidatorsComplete

// 5. Main Chat spawns Product Owner
Task("product-owner", `
  Loop 2 consensus: ${consensus}
  Threshold: 0.90
  Iteration: ${iteration}
  Decision: PROCEED / ITERATE / ABORT
`)

const decision = await productOwnerResult

// 6. Main Chat handles decision
if (decision === "ITERATE") {
  // Relaunch Loop 3 with Loop 2 feedback
  Task("backend-dev", `Iteration ${iteration+1}: ${feedback}...`)
  // Repeat from step 2
} else if (decision === "PROCEED") {
  // Spawn Loop 5 retrospective
  Task("retrospective-analyst", `Analyze sprint...`)
}
```

---

## Architecture Comparison

### ❌ REJECTED: CLI Spawning Pattern
```
Main Chat → Task(coordinator)
Coordinator → CLI spawn orchestrator (background)
Orchestrator → CLI spawn Loop 3/2/4 agents
Coordinator → BLPOP wait for events
```

**Problems:**
- Overly complex
- Coordinator waiting via BLPOP
- Background processes
- Event publishing overhead

### ✅ APPROVED: Task Tool Pattern
```
Main Chat → Task(coordinator) for analysis
Main Chat → Task(loop3-agents) in parallel
Main Chat → checks gate
Main Chat → Task(loop2-validators) in parallel
Main Chat → Task(product-owner)
Main Chat → decides next iteration or complete
```

**Benefits:**
- Simple, clear flow
- Main Chat has full visibility
- No background processes
- No Redis BLPOP waiting
- Familiar pattern (existing CFN v2)

---

## Main Chat Loop Logic

```javascript
// Main Chat function
async function executeCFNLoop(taskDescription) {
  // Step 1: Analyze task
  const coordinator = await Task("cfn-v3-coordinator", `
    Analyze: ${taskDescription}
    Return JSON: {
      task_type,
      loop3_agents: ["agent1", "agent2"],
      loop2_agents: ["validator1", "validator2"],
      validation_criteria,
      max_iterations: 10
    }
  `)

  const config = parseCoordinatorOutput(coordinator)

  let iteration = 1
  let loop3Feedback = ""

  // Step 2: Iteration loop
  while (iteration <= config.max_iterations) {
    console.log(`\n=== Iteration ${iteration} ===`)

    // Step 3: Spawn Loop 3 agents (parallel)
    const loop3Tasks = config.loop3_agents.map(agent =>
      Task(agent, `
        Task: ${taskDescription}
        Iteration: ${iteration}
        Feedback: ${loop3Feedback}
        Deliverables: ${config.deliverables}
        Criteria: ${config.validation_criteria}
      `)
    )

    const loop3Results = await Promise.all(loop3Tasks)
    const loop3Confidence = calculateConfidence(loop3Results)

    console.log(`Loop 3 Confidence: ${loop3Confidence}`)

    // Step 4: Gate check
    if (loop3Confidence < config.gate_threshold) {
      console.log("Gate FAILED - relaunching Loop 3")
      loop3Feedback = extractGateFeedback(loop3Results)
      iteration++
      continue
    }

    // Step 5: Check deliverables
    const filesCreated = checkGitStatus()
    if (filesCreated === 0 && taskRequiresImplementation(taskDescription)) {
      console.log("No deliverables created - relaunching Loop 3")
      loop3Feedback = "CRITICAL: Create actual files, not just plans"
      iteration++
      continue
    }

    // Step 6: Spawn Loop 2 validators (parallel)
    const loop2Tasks = config.loop2_agents.map(validator =>
      Task(validator, `
        Review: ${taskDescription}
        Loop 3 Output: ${loop3Results}
        Criteria: ${config.validation_criteria}
        Provide: feedback + confidence score
      `)
    )

    const loop2Results = await Promise.all(loop2Tasks)
    const loop2Consensus = calculateConsensus(loop2Results)

    console.log(`Loop 2 Consensus: ${loop2Consensus}`)

    // Step 7: Spawn Product Owner
    const productOwner = await Task("product-owner", `
      Consensus: ${loop2Consensus}
      Threshold: ${config.consensus_threshold}
      Iteration: ${iteration}
      Max Iterations: ${config.max_iterations}

      Decision: PROCEED / ITERATE / ABORT
      Reasoning: Why?
    `)

    const decision = parseDecision(productOwner)

    console.log(`Decision: ${decision.type}`)

    // Step 8: Handle decision
    if (decision.type === "PROCEED") {
      console.log("✅ Sprint complete!")

      // Step 9: Spawn Loop 5 retrospective
      const retrospective = await Task("retrospective-analyst", `
        Analyze sprint:
        - Total iterations: ${iteration}
        - Final confidence: ${loop3Confidence}
        - Final consensus: ${loop2Consensus}
        - Agent performance: ${analyzeAgentPerformance()}

        Extract learnings and update playbook
      `)

      return {
        success: true,
        iterations: iteration,
        confidence: loop3Confidence,
        consensus: loop2Consensus,
        learnings: retrospective
      }

    } else if (decision.type === "ITERATE") {
      loop3Feedback = extractLoop2Feedback(loop2Results)
      iteration++
      continue

    } else { // ABORT
      console.log("❌ Aborting - max iterations or unrecoverable failure")
      return {
        success: false,
        reason: decision.reasoning
      }
    }
  }

  // Max iterations reached
  return {
    success: false,
    reason: "Max iterations exceeded"
  }
}
```

---

## Coordinator Role (Simplified)

**Old (Complex):** Spawn orchestrator, BLPOP wait, intervene, manage entire flow

**New (Simple):** Analyze task once, return configuration

```markdown
# CFN v3 Coordinator Agent

You analyze tasks and return optimal configuration for CFN Loop execution.

## Your Task

Analyze the task description and return a JSON configuration:

```json
{
  "task_type": "software-development",
  "loop3_agents": ["backend-dev", "security-specialist"],
  "loop2_agents": ["reviewer", "tester", "security-auditor"],
  "loop4_agent": "product-owner",
  "validation_criteria": {
    "critical": ["Tests pass", "Security scan clean"],
    "important": ["Coverage ≥ 80%", "Documentation updated"]
  },
  "deliverables": [
    "src/auth/oauth2.ts",
    "tests/auth/oauth2.test.ts"
  ],
  "gate_threshold": 0.75,
  "consensus_threshold": 0.90,
  "max_iterations": 10,
  "estimated_iterations": 3
}
```

## Analysis Framework

1. **Task Type Detection**
   - Keywords: "implement", "build" → software-development
   - Keywords: "write", "content", "article" → content-creation
   - Keywords: "research", "analyze", "study" → research
   - etc.

2. **Agent Selection**
   - Software + authentication → backend-dev, security-specialist
   - Software + infrastructure → devops-engineer, terraform-engineer
   - Content + SEO → copywriter, seo-specialist
   - etc.

3. **Validation Criteria**
   - Load template based on task_type
   - Customize for specific task requirements

4. **Deliverable Prediction**
   - Analyze task description for file creation requirements
   - List expected file paths

**Output:** Return ONLY the JSON configuration, nothing else.
```

---

## Phase 1 Implementation (Simplified)

### P1-T01: Create Coordinator Agent ✅
**File:** `.claude/agents/cfn-v3-coordinator.md`
**Purpose:** Analyze task and return configuration
**Output:** JSON config (task_type, agents, criteria, deliverables)

### P1-T02: Task Type Classifier Skill ✅
**File:** `.claude/skills/task-classifier/classify-task.sh`
**Purpose:** Helper for coordinator to detect task type
**Input:** Task description
**Output:** task_type (software/content/research/design/data/infrastructure)

### P1-T03: Validation Templates ✅
**Files:** `.claude/skills/validation-templates/*.json`
**Purpose:** Predefined validation criteria per domain
**Domains:** software, content, research, design, data, infrastructure

### P1-T04: Agent Selection Skill ✅
**File:** `.claude/skills/agent-selector/select-agents.sh`
**Purpose:** Recommend optimal agents based on task type + keywords
**Input:** Task type, task description
**Output:** loop3_agents[], loop2_agents[], loop4_agent

### P1-T05: Context Pruning Skill ✅
**File:** `.claude/skills/context-pruner/prune-context.sh`
**Purpose:** Reduce context size between iterations
**Input:** Full iteration history
**Output:** Pruned context (summaries + current iteration detail)

---

## No CLI Spawning, No BLPOP, No Events

**What's Removed:**
- ❌ CLI spawning of orchestrator
- ❌ Background processes
- ❌ Redis BLPOP waiting
- ❌ Event publishing (iteration_complete, confidence_plateau, etc.)
- ❌ Orchestrator script
- ❌ Coordinator waiting mode

**What Remains:**
- ✅ Task tool for ALL agent spawning
- ✅ Main Chat orchestrates loops
- ✅ Coordinator analyzes task once
- ✅ Loop 3/2/4 agents spawned in parallel per iteration
- ✅ Main Chat handles gate checks, consensus, decisions
- ✅ Loop 5 retrospective after PROCEED

---

## Benefits of Simplified Architecture

1. **Familiar Pattern**
   - Matches existing CFN v2 pattern
   - Main Chat orchestration is well-understood
   - No new coordination primitives

2. **Visibility**
   - Main Chat sees all agent outputs
   - Clear iteration tracking
   - Easy debugging

3. **Simplicity**
   - No background processes to manage
   - No Redis event coordination
   - No BLPOP blocking

4. **Flexibility**
   - Main Chat can adapt logic easily
   - Intervention logic in Main Chat (not coordinator)
   - Easy to pause/resume

5. **Cost Efficiency**
   - No coordinator waiting (coordinator runs once)
   - No orchestrator overhead
   - Direct agent spawning

---

## Phase 1 Deliverables (Updated)

```
.claude/agents/
└── cfn-v3-coordinator.md              # Task analyzer

.claude/skills/
├── task-classifier/
│   ├── SKILL.md
│   └── classify-task.sh               # Task type detection
├── validation-templates/
│   ├── software.json
│   ├── content.json
│   ├── research.json
│   ├── design.json
│   ├── data.json
│   └── infrastructure.json
├── agent-selector/
│   ├── SKILL.md
│   └── select-agents.sh               # Agent recommendation
└── context-pruner/
    ├── SKILL.md
    └── prune-context.sh               # Context reduction
```

---

## Main Chat Slash Command

```bash
# User invokes
/cfn-loop "Implement OAuth2 authentication" --mode=standard

# Slash command expansion:
Execute CFN Loop v3 with Task tool pattern:

1. Spawn coordinator → get configuration
2. Loop (max 10 iterations):
   a. Spawn Loop 3 agents (parallel)
   b. Check gate
   c. Check deliverables
   d. Spawn Loop 2 validators (parallel)
   e. Spawn Product Owner
   f. If ITERATE: continue with feedback
   g. If PROCEED: spawn Loop 5 + exit
   h. If ABORT: exit with error
3. Return final result
```

---

## Next Steps

**Phase 1 Implementation:**
1. ✅ Create coordinator agent template
2. ✅ Create task classifier skill
3. ✅ Create validation templates (6 domains)
4. ✅ Create agent selector skill
5. ✅ Create context pruner skill

**Ready to proceed with Phase 1 implementation!**
