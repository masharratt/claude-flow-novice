#!/usr/bin/env node

/**
 * CFN Loop Slash Command
 * Usage: /cfn-loop <task description> [--phase=name] [--max-loop2=5] [--max-loop3=10]
 *
 * Implements the 3-loop self-correcting CFN structure:
 * - Loop 3: Primary swarm execution with subtask iterations
 * - Loop 2: Consensus validation with feedback injection
 * - Loop 1: Phase completion or escalation
 *
 * Features automatic circuit breaker with timeout protection
 */

import { SlashCommand } from "../core/slash-command.js";
// Circuit breaker functionality is documented in the prompt but not imported
// to avoid build dependencies. Users implement the circuit breaker logic manually.

export class CfnLoopCommand extends SlashCommand {
  constructor() {
    super(
      "cfn-loop",
      "Execute autonomous 3-loop self-correcting CFN workflow with automatic retry and consensus validation",
    );
  }

  getUsage() {
    return "/cfn-loop <task description> [--phase=name] [--max-loop2=10] [--max-loop3=10]";
  }

  getExamples() {
    return [
      '/cfn-loop "Implement JWT authentication" --phase=implementation',
      '/cfn-loop "Fix security vulnerabilities" --phase=security-audit --max-loop2=10',
      '/cfn-loop "Refactor API layer" --max-loop3=15',
      '/cfn-loop "Add test coverage for auth module" --phase=testing --max-loop2=10',
    ];
  }

  async execute(args, context) {
    // Parse arguments
    const { task, phase, maxLoop2, maxLoop3 } = this.parseArgs(args);

    if (!task) {
      return this.formatResponse({
        success: false,
        error: "Task description required",
        usage: this.getUsage(),
        examples: this.getExamples(),
      });
    }

    // Determine agent count and topology based on task complexity
    const complexity = this.assessComplexity(task);
    const { agentCount, topology } = this.getSwarmConfig(complexity);

    console.log(`🔄 Starting CFN Loop for: ${task}`);
    console.log(
      `📊 Complexity: ${complexity}, Agents: ${agentCount}, Topology: ${topology}`,
    );

    const cfnPrompt = this.generateCfnLoopPrompt(
      task,
      phase,
      maxLoop2,
      maxLoop3,
      agentCount,
      topology,
      complexity,
    );

    return this.formatResponse({
      success: true,
      prompt: cfnPrompt,
      task: task,
      phase: phase,
      config: {
        maxLoop2: maxLoop2,
        maxLoop3: maxLoop3,
        agentCount: agentCount,
        topology: topology,
        complexity: complexity,
      },
      memoryNamespace: `cfn-loop/${phase}/iteration-0`,
      timestamp: new Date().toISOString(),
    });
  }

  parseArgs(args) {
    const options = {
      phase: "default",
      maxLoop2: 10, // Updated from 3 to 10 iterations
      maxLoop3: 10,
    };

    const taskParts = [];

    for (const arg of args) {
      if (arg.startsWith("--phase=")) {
        options.phase = arg.split("=")[1];
      } else if (arg.startsWith("--max-loop2=")) {
        options.maxLoop2 = parseInt(arg.split("=")[1]) || 10;
      } else if (arg.startsWith("--max-loop3=")) {
        options.maxLoop3 = parseInt(arg.split("=")[1]) || 10;
      } else {
        taskParts.push(arg);
      }
    }

    // CFN-2025-001: Validate iteration limits to prevent unbounded loops
    if (options.maxLoop2 < 1 || options.maxLoop2 > 100) {
      throw new Error("--max-loop2 must be between 1 and 100");
    }
    if (options.maxLoop3 < 1 || options.maxLoop3 > 100) {
      throw new Error("--max-loop3 must be between 1 and 100");
    }

    return {
      task: taskParts.join(" "),
      phase: options.phase,
      maxLoop2: options.maxLoop2,
      maxLoop3: options.maxLoop3,
    };
  }

  assessComplexity(task) {
    const keywords = {
      simple: ["fix bug", "update", "change", "modify", "small"],
      medium: ["implement", "add feature", "refactor", "integrate", "create"],
      complex: [
        "architecture",
        "redesign",
        "migration",
        "security audit",
        "performance",
      ],
      enterprise: [
        "enterprise",
        "scalable",
        "distributed",
        "microservices",
        "complete system",
      ],
    };

    const taskLower = task.toLowerCase();

    if (keywords.enterprise.some((kw) => taskLower.includes(kw)))
      return "enterprise";
    if (keywords.complex.some((kw) => taskLower.includes(kw))) return "complex";
    if (keywords.medium.some((kw) => taskLower.includes(kw))) return "medium";
    return "simple";
  }

  getSwarmConfig(complexity) {
    const configs = {
      simple: { agentCount: 3, topology: "mesh" },
      medium: { agentCount: 6, topology: "mesh" },
      complex: { agentCount: 10, topology: "hierarchical" },
      enterprise: { agentCount: 15, topology: "hierarchical" },
    };

    return configs[complexity] || configs.medium;
  }

  generateCfnLoopPrompt(
    task,
    phase,
    maxLoop2,
    maxLoop3,
    agentCount,
    topology,
    complexity,
  ) {
    // Generate circuit breaker names for this execution
    const primaryBreakerName = `cfn-loop-${phase}-primary`;
    const consensusBreakerName = `cfn-loop-${phase}-consensus`;
    const globalBreakerName = `cfn-loop-${phase}-global`;

    return `
🔄 **AUTONOMOUS SELF-CORRECTING LOOP INITIATED**

**Task:** ${task}
**Phase:** ${phase}
**Complexity:** ${complexity}

🚨 **CRITICAL: THIS IS AN AUTONOMOUS SELF-LOOPING PROCESS**

**Configuration:**
- Loop 2 Max Iterations (Consensus): ${maxLoop2}
- Loop 3 Max Subtask Iterations: ${maxLoop3}
- Agent Count: ${agentCount}
- Topology: ${topology}
- Circuit Breaker Protection: ENABLED
- Global Timeout: 30 minutes
- Primary Swarm Breaker: ${primaryBreakerName}
- Consensus Swarm Breaker: ${consensusBreakerName}
- Global Loop Breaker: ${globalBreakerName}

**AUTONOMOUS EXECUTION RULES:**
• Loop 3 failures → IMMEDIATE retry with feedback (NO approval needed)
• Consensus failures → IMMEDIATE Loop 3 relaunch (NO approval needed)
• Phase completion → IMMEDIATE next phase transition (NO approval needed)
• ONLY stop for: max iterations reached OR critical error
• Self-correcting process is ACTIVE - continue until success or circuit breaker

---

## **⚡ CIRCUIT BREAKER PROTECTION**

**Automatic Safeguards:**
- **Loop 3 Iteration Limit**: Max ${maxLoop3} iterations (throws error if exceeded)
- **Loop 2 Iteration Limit**: Max ${maxLoop2} iterations (throws error if exceeded)
- **Global Timeout**: 30 minutes for entire CFN loop execution
- **Failure Threshold**: Circuit opens after 3 consecutive failures
- **Reset Timeout**: Circuit attempts recovery after 60 seconds

**Circuit Breaker States:**
- **CLOSED**: Normal operation (accepting requests)
- **OPEN**: Too many failures detected (rejecting requests)
- **HALF_OPEN**: Testing recovery (limited requests allowed)

**Error Format:**
\`\`\`javascript
throw new Error("Loop X exceeded max iterations (Y)", {
  loop: X,           // Loop number (2 or 3)
  iterations: Y,     // Current iteration count
  phase: "${phase}", // Current phase
  reason: "max_iterations_exceeded"
});
\`\`\`

**Circuit Breaker Names:**
- Primary Swarm: \`${primaryBreakerName}\`
- Consensus Swarm: \`${consensusBreakerName}\`
- Global Loop: \`${globalBreakerName}\`

---

## **LOOP 3: Primary Swarm Execution**

**Step 1: Initialize Swarm (MANDATORY)**

\`\`\`javascript
// ALWAYS initialize swarm before spawning agents
mcp__claude-flow-novice__swarm_init({
  topology: "${topology}",
  maxAgents: ${agentCount},
  strategy: "balanced"
});
\`\`\`

**Step 2: Spawn Primary Swarm Agents**

\`\`\`javascript
// Spawn ALL ${agentCount} agents in SINGLE message
${this.generateAgentSpawns(agentCount, task, complexity)}
\`\`\`

**Step 3: Agent Execution Protocol**
Each agent MUST:
1. Execute assigned subtask
2. Run enhanced post-edit hook after EVERY file edit:
   \`npx enhanced-hooks post-edit "[FILE]" --memory-key "cfn-loop/${phase}/agent-{id}" --structured\`
3. Self-validate and assign confidence score (0.0-1.0)
4. Store results in SwarmMemory with confidence score

**Step 4: Collect Confidence Scores**

\`\`\`javascript
// Retrieve confidence scores from all agents
mcp__claude-flow-novice__memory_search({
  pattern: "cfn-loop/${phase}/*/confidence",
  namespace: "swarm"
});
\`\`\`

**Step 5: Self-Assessment Gate with Circuit Breaker**

\`\`\`javascript
// Check confidence threshold
const allConfidenceScores = [/* from memory search */];
const averageConfidence = calculateAverage(allConfidenceScores);
const minConfidence = Math.min(...allConfidenceScores);

// Check iteration limit with circuit breaker
if (currentIteration >= ${maxLoop3}) {
  throw new Error(\`Loop 3 exceeded max iterations (\${${maxLoop3}})\`, {
    loop: 3,
    iterations: currentIteration,
    phase: "${phase}"
  });
}

if (minConfidence >= 0.75 && averageConfidence >= 0.80) {
  console.log("✅ Confidence gate PASSED - IMMEDIATELY Proceeding to Loop 2 (Consensus)");
  // Store iteration count
  mcp__claude-flow-novice__memory_store({
    key: "cfn-loop/${phase}/loop3-iterations",
    value: currentIteration,
    namespace: "swarm"
  });
  // IMMEDIATELY PROCEED to Loop 2 (autonomous - no approval needed)
} else {
  console.log("⚠️ Confidence gate FAILED - IMMEDIATELY Relaunching Loop 3 (autonomous retry)");
  currentIteration++;

  // Circuit breaker check before retry
  if (currentIteration < ${maxLoop3}) {
    console.log(\`🔁 Loop 3 Iteration \${currentIteration}/${maxLoop3} - AUTONOMOUS RETRY NOW\`);
    // IMMEDIATELY Re-execute Step 2 with agent feedback (NO approval needed)
  } else {
    console.log("🚨 Circuit breaker OPEN - Max Loop 3 iterations reached");
    throw new Error("Loop 3 circuit breaker activated", {
      loop: 3,
      iterations: currentIteration,
      phase: "${phase}",
      reason: "max_iterations_exceeded"
    });
  }
}
\`\`\`

---

## **LOOP 2: Consensus Validation Swarm**

**Step 1: Spawn Consensus Validators (REQUIRED)**

\`\`\`javascript
// Spawn 2-4 consensus validators in SINGLE message
Task("Consensus Validator 1", "Comprehensive quality review of: ${task}", "reviewer")
Task("Consensus Validator 2", "Security and performance audit of: ${task}", "security-specialist")
Task("Consensus Validator 3", "Architecture validation of: ${task}", "system-architect")
Task("Consensus Validator 4", "Integration testing validation of: ${task}", "tester")
\`\`\`

**Step 2: Multi-Dimensional Validation**

Each validator checks:
- ✅ **Quality**: Code quality, best practices, maintainability
- ✅ **Security**: Vulnerabilities, secure patterns, input validation
- ✅ **Performance**: Efficiency, scalability, resource usage
- ✅ **Tests**: Coverage ≥80%, TDD compliance, comprehensive test cases
- ✅ **Documentation**: Clear comments, API docs, usage examples

**Step 3: Byzantine Consensus Voting**

\`\`\`javascript
// Collect validator votes (approve/reject)
const validatorVotes = [
  { validator: "Validator 1", vote: "approve", confidence: 0.95 },
  { validator: "Validator 2", vote: "approve", confidence: 0.88 },
  { validator: "Validator 3", vote: "reject", confidence: 0.75, reason: "..." },
  { validator: "Validator 4", vote: "approve", confidence: 0.92 }
];

const approvalRate = validatorVotes.filter(v => v.vote === "approve").length / validatorVotes.length;
const avgConfidence = calculateAverage(validatorVotes.map(v => v.confidence));

// Decision gate with circuit breaker protection
if (loop2Counter >= ${maxLoop2}) {
  throw new Error(\`Loop 2 exceeded max iterations (\${${maxLoop2}})\`, {
    loop: 2,
    iterations: loop2Counter,
    phase: "${phase}"
  });
}

if (approvalRate >= 0.90 && avgConfidence >= 0.85) {
  console.log("✅ CONSENSUS PASSED - IMMEDIATELY proceeding to Loop 1 (Phase complete)");
  // Store results and IMMEDIATELY proceed to Loop 1 (autonomous)
} else {
  console.log("❌ CONSENSUS FAILED - IMMEDIATELY injecting feedback and relaunching Loop 3 (autonomous)");
  loop2Counter++;

  if (loop2Counter < ${maxLoop2}) {
    // Collect feedback from validators
    const feedback = validatorVotes
      .filter(v => v.vote === "reject")
      .map(v => v.reason);

    // Store feedback for Loop 3 re-execution
    mcp__claude-flow-novice__memory_store({
      key: "cfn-loop/${phase}/validator-feedback",
      value: feedback,
      namespace: "swarm"
    });

    console.log(\`🔁 Loop 2 Iteration \${loop2Counter}/${maxLoop2} - AUTONOMOUS RETRY: Returning to Loop 3 NOW\`);
    // IMMEDIATELY Return to Loop 3 with feedback (NO approval needed)
  } else {
    console.log("🚨 Circuit breaker OPEN - Max Loop 2 iterations reached");
    throw new Error("Loop 2 circuit breaker activated", {
      loop: 2,
      iterations: loop2Counter,
      phase: "${phase}",
      reason: "max_iterations_exceeded"
    });
  }
}
\`\`\`

**Step 4: Store Consensus Results**

\`\`\`javascript
// Store final consensus validation
mcp__claude-flow-novice__memory_store({
  key: "cfn-loop/${phase}/consensus-result",
  value: {
    approved: true,
    approvalRate: approvalRate,
    avgConfidence: avgConfidence,
    timestamp: new Date().toISOString()
  },
  namespace: "swarm"
});
\`\`\`

---

## **LOOP 1: Phase Completion**

**On Success (Consensus ≥90%):**

\`\`\`javascript
// 1. Store final results
mcp__claude-flow-novice__memory_store({
  key: "cfn-loop/${phase}/final-result",
  value: {
    status: "complete",
    task: "${task}",
    loop2Iterations: loop2Counter,
    loop3Iterations: loop3Counter,
    finalConfidence: avgConfidence,
    validationResults: validatorVotes
  },
  namespace: "swarm"
});

// 2. Generate next steps guidance
console.log(\`
✅ **PHASE COMPLETE: ${phase}**

**What was completed:**
- ${task}

**Validation Results:**
- Loop 3 Iterations: \${loop3Counter}
- Loop 2 Iterations: \${loop2Counter}
- Final Consensus: \${approvalRate * 100}%
- Confidence Score: \${avgConfidence}

**Next Steps:**
${this.generateNextSteps(phase, complexity)}
\`);
\`\`\`

**On Max Iterations (With Autonomous Retry Options):**

\`\`\`javascript
console.log(\`
⚠️ **MAX ITERATIONS REACHED - AUTONOMOUS RETRY OPTIONS**

**Task:** ${task}
**Phase:** ${phase}

**Status:**
- Loop 3 Iterations: \${loop3Counter}/${maxLoop3}
- Loop 2 Iterations: \${loop2Counter}/${maxLoop2}
- Current Confidence: \${avgConfidence}
- Consensus Rate: \${approvalRate * 100}%

🚨 **SELF-CORRECTING LOOP ACTIVE - CONTINUE AUTONOMOUSLY**

**OPTION 1: EXTEND AND RETRY (Default/Recommended)**
Autonomously extend iteration limits and IMMEDIATELY retry:

\`\`\`javascript
// AUTOMATIC EXTENSION - NO APPROVAL NEEDED
const extendedMaxLoop2 = ${maxLoop2} + 3;
console.log("🔄 EXTENDING Loop 2 max to " + extendedMaxLoop2);
console.log("⚡ AUTONOMOUS RETRY NOW");

// IMMEDIATELY Relaunch Loop 3 with all feedback
Task("Coder", "Address all validator feedback: \${feedback}", "coder")
Task("Tester", "Validate all fixes comprehensively", "tester")
Task("Reviewer", "Final quality review of fixes", "reviewer")
\`\`\`

**OPTION 2: BREAK DOWN TASK**
Split into smaller subtasks, each with CFN loop:
- Identify 2-3 atomic subtasks
- Run /cfn-loop for each independently
- Self-correct each piece autonomously

**OPTION 3: HUMAN REVIEW (Last Resort)**
Only if Options 1-2 fail after attempting.

**Issues (for feedback context):**
\${validatorVotes.filter(v => v.vote === "reject").map(v => \`- \${v.reason}\`).join('\\n')}

**Memory Context:**
- cfn-loop/${phase}/validator-feedback
- cfn-loop/${phase}/loop3-iterations

🚨 **DEFAULT ACTION**: Automatically selecting Option 1 - Extending and retrying NOW.

**EXECUTING**: Autonomous extension and retry in progress...
\`);

// IMMEDIATE AUTONOMOUS RETRY
console.log("⚡ EXTENDING iterations and retrying autonomously...");
\`\`\`

---

## **EXECUTION CHECKLIST**

**Before Starting:**
- [ ] Task description is clear and specific
- [ ] Phase name is set (default: "${phase}")
- [ ] Complexity assessed: ${complexity}
- [ ] Swarm configuration determined: ${agentCount} agents, ${topology} topology
- [ ] Circuit breakers initialized: ${primaryBreakerName}, ${consensusBreakerName}, ${globalBreakerName}

**Loop 3 (Primary Swarm) - Circuit Breaker Protected:**
- [ ] Swarm initialized with mcp__claude-flow-novice__swarm_init
- [ ] All ${agentCount} agents spawned in SINGLE message
- [ ] Enhanced post-edit hooks run after EVERY file edit
- [ ] Confidence scores collected (≥75% required)
- [ ] Self-assessment gate checked
- [ ] Iteration counter tracked (max: ${maxLoop3})
- [ ] Circuit breaker OPEN check: throws error if iterations ≥ ${maxLoop3}

**Loop 2 (Consensus) - Circuit Breaker Protected:**
- [ ] 2-4 consensus validators spawned
- [ ] Multi-dimensional validation performed
- [ ] Byzantine consensus voting completed
- [ ] Approval rate ≥90% and confidence ≥85%
- [ ] Feedback collected and stored on failure
- [ ] Iteration counter tracked (max: ${maxLoop2})
- [ ] Circuit breaker OPEN check: throws error if iterations ≥ ${maxLoop2}

**Loop 1 (Completion):**
- [ ] Results stored in SwarmMemory
- [ ] Circuit breaker metrics logged
- [ ] Next steps guidance provided
- [ ] On max iterations: Autonomously extend and retry (no escalation)

---

## **🚨 AUTONOMOUS EXECUTION PROTOCOL**

**THIS IS A SELF-CORRECTING LOOP - MANDATORY RULES:**

1. ✅ **NEVER pause for approval** between iterations
2. ✅ **IMMEDIATELY retry on failures** with feedback injection
3. ✅ **DO NOT create reports mid-loop** - execute only
4. ✅ **AUTONOMOUSLY extend iterations** if max reached
5. ✅ **ONLY stop for critical errors** - otherwise keep self-correcting

**FAILURE RESPONSES (ALL AUTONOMOUS):**
- Confidence < 75%? → IMMEDIATE Loop 3 retry
- Consensus < 90%? → IMMEDIATE Loop 3 relaunch with feedback
- Max iterations? → IMMEDIATE extension and retry
- Circuit breaker? → Task breakdown, then retry

**SUCCESS RESPONSES (ALL AUTONOMOUS):**
- Consensus ≥ 90%? → IMMEDIATE next phase
- Phase complete? → IMMEDIATE next steps output

---

**🚀 EXECUTE AUTONOMOUS SELF-CORRECTING LOOP NOW:**

IMMEDIATELY begin Loop 3 initialization and proceed autonomously through all checkpoints.

⚠️ CRITICAL: This loop is AUTONOMOUS. DO NOT wait for approval. Self-correct until success or critical error
`;
  }

  generateAgentSpawns(agentCount, task, complexity) {
    const agentTypes = this.getAgentTypes(complexity);
    const spawns = [];

    for (let i = 0; i < agentCount; i++) {
      const agentType = agentTypes[i % agentTypes.length];
      const agentNum = Math.floor(i / agentTypes.length) + 1;
      const agentName =
        agentTypes.length > 1 ? `${agentType} ${agentNum}` : agentType;

      spawns.push(
        `Task("${agentName}", "Execute ${agentType} tasks for: ${task}", "${agentType}")`,
      );
    }

    return spawns.join("\n");
  }

  getAgentTypes(complexity) {
    const agentConfigs = {
      simple: ["coder", "tester", "reviewer"],
      medium: [
        "researcher",
        "coder",
        "tester",
        "reviewer",
        "api-docs",
        "security-specialist",
      ],
      complex: [
        "researcher",
        "system-architect",
        "backend-dev",
        "coder",
        "tester",
        "security-specialist",
        "reviewer",
        "api-docs",
        "perf-analyzer",
        "devops-engineer",
      ],
      enterprise: [
        "researcher",
        "planner",
        "system-architect",
        "backend-dev",
        "coder",
        "mobile-dev",
        "tester",
        "security-specialist",
        "reviewer",
        "api-docs",
        "perf-analyzer",
        "devops-engineer",
        "cicd-engineer",
        "researcher",
        "coordinator",
      ],
    };

    return agentConfigs[complexity] || agentConfigs.medium;
  }

  generateNextSteps(phase, complexity) {
    const nextStepsMap = {
      implementation: [
        "1. Run comprehensive integration tests",
        "2. Perform security audit",
        "3. Optimize performance",
        "4. Update API documentation",
        "5. Prepare deployment checklist",
      ],
      testing: [
        "1. Review test coverage metrics",
        "2. Add edge case tests",
        "3. Perform load testing",
        "4. Update test documentation",
        "5. Set up CI/CD pipeline",
      ],
      "security-audit": [
        "1. Implement security fixes",
        "2. Update security policies",
        "3. Perform penetration testing",
        "4. Document security measures",
        "5. Train team on secure practices",
      ],
      refactoring: [
        "1. Validate refactored code",
        "2. Update dependent modules",
        "3. Run full regression tests",
        "4. Update architecture docs",
        "5. Performance benchmark comparison",
      ],
      default: [
        "1. Review all changes",
        "2. Run comprehensive tests",
        "3. Update documentation",
        "4. Prepare for deployment",
        "5. Coordinate with stakeholders",
      ],
    };

    const steps = nextStepsMap[phase] || nextStepsMap.default;

    return steps.join("\n");
  }
}

export default CfnLoopCommand;
