---
description: "Execute CFN Loop in Task mode (debugging, full visibility, Main Chat coordination)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--max-iterations=n] [--ace-reflect]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# 🚨 TASK MODE INSTRUCTIONS FOR MAIN CHAT

**YOU are executing this CFN Loop. These are YOUR instructions.**

**Task to execute**: $ARGUMENTS

## MODE: Task Mode (Full Visibility, Direct Coordination)

**CRITICAL RULES:**
1. ❌ **DO NOT spawn cfn-v3-coordinator** - that's for CLI mode
2. ❌ **DO NOT ask user "which mode?"** - they already chose Task mode
3. ❌ **DO NOT offer options** - execute these instructions directly
4. ✅ **YOU spawn all agents** using Task() tool
5. ✅ **YOU coordinate the entire workflow** step by step
6. ✅ **Follow the 9-step workflow below** exactly

## What is Task Mode?

**Task Mode Architecture:**
- Main Chat coordinates **entire workflow directly**
- **NO coordinator agent** spawned
- Main Chat spawns **all agents via Task()**
- All agents use **Anthropic provider** (Main Chat provider)
- **Full visibility** in Main Chat (every agent output visible)
- **Simplified workflow** for debugging and learning

**Cost Breakdown:**
```
┌─────────────────────┬──────────────┬────────────┐
│ Component           │ Provider     │ Cost/Call  │
├─────────────────────┼──────────────┼────────────┤
│ Main Chat           │ Anthropic    │ $0.015     │
│ Loop 3 Agents       │ Anthropic    │ $0.015 ea  │
│ Loop 2 Agents       │ Anthropic    │ $0.015 ea  │
│ Product Owner       │ Anthropic    │ $0.015     │
└─────────────────────┴──────────────┴────────────┘

Total per iteration: ~$0.150 (vs $0.054 CLI mode)
Cost: 3x CLI mode, but full visibility for debugging
```

## When to Use Task Mode

**Use Task Mode for:**
- ✅ Debugging CFN Loop issues
- ✅ Learning CFN Loop workflow
- ✅ Understanding agent interactions
- ✅ Prototyping new agent configurations
- ✅ Short tasks (<5 min)

**Use CLI Mode for:**
- Production features
- Long-running tasks (>10 min)
- Multi-iteration workflows
- Cost-sensitive projects

## Command Options

```bash
# Standard mode (recommended)
/cfn-loop-task "Implement JWT authentication"

# MVP mode (fast, lower quality gates)
/cfn-loop-task "Build prototype feature" --mode=mvp

# Enterprise mode with ACE reflection
/cfn-loop-task "Production security feature" --mode=enterprise --ace-reflect

# Custom iteration limits
/cfn-loop-task "Refactor API" --mode=standard --max-iterations=15
```

**Options:**
- `--mode=<mvp|standard|enterprise>`: Quality mode (default: standard)
- `--max-iterations=<n>`: Max iterations per loop (default: 10)
- `--ace-reflect`: Enable ACE reflection after sprint (captures lessons learned)

## Mode Comparison

| Mode | Gate | Consensus | Iterations | Validators | Use Case |
|------|------|-----------|------------|------------|----------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 | Prototypes, proof-of-concept |
| Standard | ≥0.75 | ≥0.90 | 10 | 3-4 | Production features |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 | Security, compliance, critical systems |

## 🚨 CRITICAL EXECUTION INSTRUCTIONS

**YOU ARE MAIN CHAT. YOU COORDINATE THIS ENTIRE WORKFLOW.**

**DO NOT spawn cfn-v3-coordinator or any coordinator agent.**
**DO NOT ask user which mode to use.**
**DO NOT offer options.**

You must execute this CFN Loop directly using the Task() tool to spawn agents.

---

### Step 1: Read Task Mode Guide

Read the complete Task Mode guide for detailed workflow:

```
Read('.claude/commands/CFN_LOOP_TASK_MODE.md')
```

**Expected output:** Complete guide with agent selection, workflow steps, helper scripts

### Step 2: Analyze Task Complexity

```javascript
// Estimate complexity to scale validators
const complexity = {
  files: estimateFileCount(),  // From task description
  loc: estimateLOC(),          // Estimated lines of code
  keywords: extractKeywords()   // Security, performance, frontend, etc.
};

// Complexity scoring (from guide)
let score = 0;
score += (complexity.files <= 2) ? 10 : (complexity.files <= 5) ? 30 : 60;
score += (complexity.loc <= 200) ? 10 : (complexity.loc <= 500) ? 30 : 60;
if (complexity.keywords.match(/auth|payment|token/i)) score += 40; // Security
if (complexity.keywords.match(/performance|cache/i)) score += 30;  // Performance
if (complexity.keywords.match(/frontend|ui|react/i)) score += 20;  // Accessibility

// Category: simple (≤50), standard (≤100), complex (>100)
const category = score <= 50 ? 'simple' : score <= 100 ? 'standard' : 'complex';
```

### Step 3: Select Agents (Adaptive Scaling)

```javascript
// Loop 3 Agents (Implementation) - Based on task type
const loop3Agents = selectImplementers({
  taskType: extractTaskType(), // backend, fullstack, mobile, infra
  keywords: complexity.keywords
});

// Examples:
// Backend API: ['backend-dev', 'researcher', 'devops']
// Full-Stack: ['backend-dev', 'react-frontend-engineer', 'devops']
// Mobile: ['mobile-dev', 'backend-dev', 'researcher']
// Infrastructure: ['devops', 'rust-developer', 'researcher']

// Loop 2 Agents (Validation) - Adaptive scaling by complexity
let loop2Agents = ['reviewer', 'tester']; // Base (simple)

if (category === 'standard') {
  loop2Agents.push('architect', 'security-specialist');
}

if (category === 'complex') {
  loop2Agents.push('code-analyzer');
  if (complexity.keywords.match(/performance|cache/i)) {
    loop2Agents.push('performance-benchmarker');
  }
  if (complexity.keywords.match(/frontend|ui|react/i)) {
    loop2Agents.push('accessibility-advocate-persona');
  }
}

// Max 6 validators
loop2Agents = loop2Agents.slice(0, 6);
```

### Step 4: Loop 3 - Implementation

```javascript
let iteration = 1;
let loop3Confidence = 0;
const maxIterations = extractFlag('--max-iterations') || 10;
const mode = extractFlag('--mode') || 'standard';
const gateThreshold = mode === 'enterprise' ? 0.85 : mode === 'standard' ? 0.75 : 0.70;

do {
  console.log(`\n━━━ Loop 3 Iteration ${iteration}/${maxIterations} ━━━`);

  // Spawn Loop 3 agents in parallel
  const loop3Results = await Promise.all(
    loop3Agents.map(agent =>
      Task(agent, `
        Implement: $ARGUMENTS (iteration ${iteration})

        ${iteration > 1 ? `Previous iteration feedback:\n${previousFeedback}` : ''}

        Requirements:
        - Core functionality implemented
        - Tests written (>80% coverage)
        - Security considerations addressed
        - Documentation included

        Report confidence score (0.0-1.0) when complete.
      `)
    )
  );

  // Calculate average confidence
  loop3Confidence = average(loop3Results.map(r => parseConfidence(r.output)));

  console.log(`Loop 3 confidence: ${loop3Confidence} (threshold: ${gateThreshold})`);

  if (loop3Confidence >= gateThreshold) {
    console.log('✅ Loop 3 gate PASSED, proceeding to Loop 2');
    break;
  } else {
    console.log(`⚠️  Loop 3 gate FAILED, iteration ${iteration + 1}`);
    previousFeedback = generateFeedback(loop3Results);
    iteration++;
  }
} while (iteration <= maxIterations);
```

### Step 5: Loop 2 - Validation

```javascript
console.log(`\n━━━ Loop 2 Validation ━━━`);

const consensusThreshold = mode === 'enterprise' ? 0.95 : mode === 'standard' ? 0.90 : 0.80;

// Spawn Loop 2 validators in parallel
const loop2Results = await Promise.all(
  loop2Agents.map(validator =>
    Task(validator, `
      Review implementation from Loop 3.

      Files modified: $(git diff --name-only HEAD)

      Validation focus:
      - Code quality and best practices
      - Test coverage and quality
      - Security vulnerabilities
      - Architecture consistency
      ${validator === 'accessibility-advocate-persona' ? '- WCAG AA compliance' : ''}
      ${validator === 'performance-benchmarker' ? '- Performance optimization' : ''}

      Report consensus score (0.0-1.0) when complete.
    `)
  )
);

const consensus = average(loop2Results.map(r => parseConfidence(r.output)));

console.log(`Loop 2 consensus: ${consensus} (threshold: ${consensusThreshold})`);
```

### Step 6: Product Owner Decision

```javascript
// Build context for Product Owner
const poContext = `
  CFN Loop Task Mode - Iteration ${iteration} Complete

  Task: $ARGUMENTS
  Mode: ${mode.toUpperCase()}

  Results:
  - Loop 3 confidence: ${loop3Confidence} (gate: ${gateThreshold})
  - Loop 2 consensus: ${consensus} (threshold: ${consensusThreshold})
  - Iterations completed: ${iteration}/${maxIterations}

  Deliverables:
  $(git diff --name-status HEAD)

  Decision Framework:
  - PROCEED: Consensus >= ${consensusThreshold} AND deliverables verified
  - ITERATE: Consensus < ${consensusThreshold} AND iteration < ${maxIterations}
  - ABORT: Max iterations reached OR critical blocker

  Output format (REQUIRED):
  DECISION: PROCEED|ITERATE|ABORT
  REASONING: [why]
`;

// Spawn Product Owner via Task()
const poOutput = await Task('product-owner', poContext);

// Parse decision using helper script
const decision = Bash(`./.claude/skills/cfn-product-owner-decision/parse-decision.sh --output "${poOutput}"`);

console.log(`Product Owner decision: ${decision}`);
```

### Step 7: Validate Deliverables

```javascript
// Prevent "consensus on vapor" (high consensus, zero deliverables)
const deliverableStatus = Bash(`./.claude/skills/cfn-product-owner-decision/validate-deliverables.sh --task-id "task-mode-${Date.now()}"`);

if (deliverableStatus === 'FAILED' && taskRequiresImplementation($ARGUMENTS)) {
  console.log('⚠️  No deliverables created - overriding PROCEED to ITERATE');
  decision = 'ITERATE';
}
```

### Step 8: Execute Decision

```javascript
if (decision === 'PROCEED') {
  console.log('✅ Product Owner approved - committing changes');

  // Git commit and push
  Bash(`git add . && git commit -m "$(cat <<'EOF'
feat: $ARGUMENTS

Deliverables:
$(git diff --name-only HEAD | sed 's/^/- /')

Validation:
- Loop 3 confidence: ${loop3Confidence}
- Loop 2 consensus: ${consensus}
- Iterations: ${iteration}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)" && git push origin main`);

  // Generate sprint summary
  Write(`docs/SPRINT_${iteration}_COMPLETE.md`, `
# Sprint ${iteration} Complete

**Date:** $(date +%Y-%m-%d) | **Consensus:** ${consensus}

## Deliverables
$(git diff HEAD~1 --name-status | awk '{print "- "$2}')

## Validation
- Loop 3 iterations: ${iteration}
- Loop 2 consensus: ${consensus}
- Decision: PROCEED
  `);

  console.log('✅ Sprint complete - changes committed and pushed');

} else if (decision === 'ITERATE') {
  console.log('🔄 Iterating with feedback...');
  // Repeat from Step 4 with validator feedback

} else {
  console.log('❌ Max iterations reached or critical blocker - aborting');
}
```

### Step 9: ACE Reflection (Optional)

```javascript
// Only if --ace-reflect flag enabled
const aceReflectEnabled = extractFlag('--ace-reflect') === true;

if (aceReflectEnabled && decision === 'PROCEED') {
  console.log('📊 Capturing ACE reflection...');

  Bash(`./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \\
    --task-id "task-mode-${Date.now()}" \\
    --sprint-id "${iteration}" \\
    --consensus "${consensus}" \\
    --iterations-loop3 "${iteration}" \\
    --iterations-loop2 "1" \\
    --deliverables "$(git diff HEAD~1 --name-only | tr '\n' ',')"`);

  console.log('✅ ACE reflection captured');
}
```

## Task Mode Benefits

**Full Visibility:**
- Every agent output visible in Main Chat
- Easy to debug agent behavior
- Clear understanding of iteration flow
- Immediate feedback on issues

**Simplified Workflow:**
- No coordinator abstraction layer
- Direct Task() spawning
- Easier to modify and experiment
- Better for learning CFN Loop

**Debugging Features:**
- See exact confidence scores
- View validator feedback in real-time
- Understand Product Owner reasoning
- Trace decision-making logic

## Task Mode Limitations

**Cost:**
- 3x more expensive than CLI mode
- All agents use Anthropic provider
- No Z.ai cost savings

**Performance:**
- Sequential iteration cycles (no background processing)
- Main Chat must stay active (no crash recovery)
- No Redis state persistence

**Scalability:**
- Limited to 10-15 agents (visibility bottleneck)
- Long tasks may timeout (10-min Bash limit)

## Autonomous Execution Rules

**YOU ARE FORBIDDEN FROM:**
- ❌ Asking "Should I retry?" (ALWAYS retry if iterations < max)
- ❌ Asking "Proceed to next step?" (AUTO-PROCEED based on thresholds)
- ❌ Waiting for approval during CFN Loop cycles
- ❌ Spawning a coordinator agent (Main Chat coordinates directly)

**YOU MUST:**
- ✅ IMMEDIATELY retry Loop 3 on gate failure (iteration < max)
- ✅ IMMEDIATELY retry Loop 2 on consensus failure (iteration < max)
- ✅ AUTOMATICALLY execute Product Owner decision
- ✅ ONLY escalate when truly blocked (max iterations or critical error)

## Helper Scripts (Task Mode)

**DO NOT use execute-decision.sh (it spawns PO via CLI):**
```bash
# ❌ WRONG - spawns duplicate Product Owner
./.claude/skills/cfn-product-owner-decision/execute-decision.sh

# ✅ CORRECT - Main Chat spawns PO via Task(), then parses output
Task('product-owner', context)
parse-decision.sh --output "$PO_OUTPUT"
```

**DO use these helper scripts:**
```bash
# Parse Product Owner decision
./.claude/skills/cfn-product-owner-decision/parse-decision.sh --output "$OUTPUT"

# Validate deliverables exist
./.claude/skills/cfn-product-owner-decision/validate-deliverables.sh --task-id "$TASK_ID"

# Multi-pattern confidence parsing
./.claude/skills/cfn-loop3-output-processing/parse-confidence.sh --output "$AGENT_OUTPUT"
```

## Related Commands

- **CLI Mode**: `/cfn-loop-cli` (production, cost-optimized)
- **Frontend**: `/cfn-loop-frontend` (visual iteration workflow)
- **Documentation**: `/cfn-loop-document` (generate docs)

## Related Documentation

- **Task Mode Guide**: `.claude/commands/CFN_LOOP_TASK_MODE.md` (complete reference)
- Coordinator Parameters: `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`
- Agent Output Standards: `docs/AGENT_OUTPUT_STANDARDS.md`
- ACE System: `.claude/skills/cfn-ace-system/SKILL.md`

---

**Version:** 1.0.0 (2025-10-31) - Task mode: debugging, full visibility, Main Chat coordination
