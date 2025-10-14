---
description: "Execute autonomous 3-loop self-correcting CFN workflow with automatic retry and consensus validation"
argument-hint: "<task description> [--phase=name] [--mode=mvp|standard|enterprise] [--max-loop2=10] [--max-loop3=10]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# CFN Loop - Autonomous 3-Loop Self-Correcting Workflow

Execute task through autonomous 3-loop CFN structure with automatic retry and consensus validation.

🚨 **AUTONOMOUS SELF-LOOPING PROCESS**

**Task**: $ARGUMENTS

## CFN Loop Structure (3 Loops)

```
LOOP 1: Phase Completion or Escalation
   ↓
LOOP 2: Consensus Validation (≥90% Byzantine consensus)
   ↓
LOOP 3: Primary Swarm Execution with subtask iterations
```

## Command Options

```bash
/cfn-loop "Implement JWT authentication" --phase=implementation --mode=standard
/cfn-loop "Fix security vulnerabilities" --phase=security-audit --mode=enterprise --max-loop2=10
/cfn-loop "Build MVP feature" --phase=mvp-dev --mode=mvp --max-loop3=5
/cfn-loop "Refactor API layer" --mode=standard --max-loop3=15
/cfn-loop "Add test coverage for auth module" --phase=testing --max-loop2=10
```

**Options:**
- `--phase=<name>`: Optional phase name for tracking
- `--mode=<mvp|standard|enterprise>`: Coordinator mode (default: standard)
- `--max-loop2=<n>`: Max consensus iterations (default: 10)
- `--max-loop3=<n>`: Max primary swarm iterations (default: 10)

## Coordinator Modes

### MVP Mode (Rapid Development)
- **Coordinator**: `cfn-coordinator-mvp`
- **Gate Threshold**: 70% confidence
- **Consensus Threshold**: 80% agreement
- **Validators**: 2 (minimal validation)
- **Max Iterations**: 5 (fast retry)
- **Timeout**: 15 minutes per phase
- **Cost Target**: <$1.00 per phase
- **Instructions**: `config/cfn-loop/instructions/mvp-instructions.md`

### Standard Mode (Balanced)
- **Coordinator**: `cfn-coordinator-standard`
- **Gate Threshold**: 75% confidence
- **Consensus Threshold**: 90% agreement
- **Validators**: 3 (standard validation)
- **Max Iterations**: 10 (balanced retry)
- **Timeout**: 30 minutes per phase
- **Instructions**: `config/cfn-loop/instructions/standard-instructions.md`

### Enterprise Mode (High Quality)
- **Coordinator**: `cfn-coordinator-enterprise`
- **Gate Threshold**: 85% confidence
- **Consensus Threshold**: 95% agreement
- **Validators**: 5 (comprehensive validation)
- **Max Iterations**: 15 (thorough retry)
- **Timeout**: 60 minutes per phase
- **Instructions**: `config/cfn-loop/instructions/enterprise-instructions.md`

## Execution Pattern

### Step 1: Determine Coordinator Mode (MANDATORY)
```javascript
// Determine coordinator based on mode flag
const mode = args.includes('--mode=mvp') ? 'mvp' : 
             args.includes('--mode=enterprise') ? 'enterprise' : 'standard';

const coordinatorConfig = {
  mvp: {
    name: 'cfn-coordinator-mvp',
    instructions: 'config/cfn-loop/instructions/mvp-instructions.md',
    gateThreshold: 0.70,
    consensusThreshold: 0.80,
    validators: 2,
    maxIterations: 5
  },
  standard: {
    name: 'cfn-coordinator-standard',
    instructions: 'config/cfn-loop/instructions/standard-instructions.md',
    gateThreshold: 0.75,
    consensusThreshold: 0.90,
    validators: 3,
    maxIterations: 10
  },
  enterprise: {
    name: 'cfn-coordinator-enterprise',
    instructions: 'config/cfn-loop/instructions/enterprise-instructions.md',
    gateThreshold: 0.85,
    consensusThreshold: 0.95,
    validators: 5,
    maxIterations: 15
  }
};

const config = coordinatorConfig[mode];
```

### Step 2: Spawn Mode-Based Coordinator (MANDATORY)
```javascript
// Spawn appropriate coordinator with detailed instructions
Task(`${config.name}`, `
  COORDINATOR MODE: ${mode.toUpperCase()}
  
  INSTRUCTIONS PATH: ${config.instructions}
  
  CONFIGURATION:
  - Gate Threshold: ${config.gateThreshold}
  - Consensus Threshold: ${config.consensusThreshold}
  - Validators: ${config.validators}
  - Max Iterations: ${config.maxIterations}
  
  TASK: ${taskDescription}
  PHASE: ${phaseName || 'default'}
  
  EXECUTE 3-LOOP COORDINATION:
  1. Read detailed instructions from ${config.instructions}
  2. Spawn appropriate workers for Loop 3
  3. Execute validation in Loop 2
  4. Make autonomous decisions in Loop 4
  
  RETURN-TO-CHAT TRIGGERS:
  - Human decisions required (architectural changes, budget adjustments)
  - Sprint completion (all phases finished)
  - Critical technical blockers requiring expert intervention
  
  CONTINUE AUTONOMOUSLY for all other scenarios.
`, "coordinator")
```

### Step 3: Coordinator Executes Autonomous Loops
The coordinator handles all loop execution internally:

**Loop 3: Implementation**
```javascript
// Coordinator spawns workers based on mode
const workers = mode === 'mvp' ? 2 : mode === 'enterprise' ? 5 : 3;
```

**Loop 2: Validation**
```javascript
// Coordinator spawns validators based on mode
const validators = config.validators;
```

**Loop 4: Product Owner Decision**
```javascript
// Coordinator makes autonomous decisions
// Returns to chat only for specific triggers
```

## Return-to-Chat Triggers

Coordinators return to chat ONLY for:

### 1. Human Decision Required
- **Architectural Changes**: Major design decisions needing human input
- **Budget/Timeline Adjustments**: Resource allocation changes
- **Stakeholder Approval**: Business-level decisions required
- **Critical Technical Blockers**: Issues requiring expert intervention

### 2. Sprint Completion
- **All Phases Complete**: Entire task finished successfully
- **Final Deliverables Ready**: Package results for review
- **Next Sprint Planning**: Handoff for future work

### 3. Escalation Scenarios
- **Max Iterations Reached**: Unable to complete within limits
- **Critical Failures**: System-level issues blocking progress
- **Resource Exhaustion**: Time/budget limits exceeded

**All other scenarios** continue autonomously without human intervention.

## Autonomous Execution Rules

**FORBIDDEN:**
- ❌ "Should I retry?" (COORDINATOR handles automatically)
- ❌ "Proceed to consensus?" (COORDINATOR decides based on mode)
- ❌ Waiting for approval during CFN Loop cycles
- ❌ Direct worker spawning (use coordinator instead)

**REQUIRED:**
- ✅ ALWAYS spawn coordinator first based on mode
- ✅ PASS detailed instructions path to coordinator
- ✅ COORDINATOR handles all loop execution internally
- ✅ ONLY return to chat for defined triggers
- ✅ MAINTAIN autonomous execution for all other scenarios

## Mode-Specific Behaviors

### MVP Mode Characteristics
- **Rapid Iteration**: Fast development cycles
- **Cost Optimization**: Minimal resource usage
- **Core Functionality**: Essential features only
- **Quick Validation**: Simplified review process

### Standard Mode Characteristics
- **Balanced Approach**: Quality vs speed trade-off
- **Comprehensive Validation**: Standard review process
- **Iterative Development**: Thorough refinement cycles
- **Autonomous Decisions**: Most scenarios handled automatically

### Enterprise Mode Characteristics
- **High Quality**: Comprehensive validation and testing
- **Thorough Review**: Multiple stakeholder validation
- **Risk Mitigation**: Extensive error handling and recovery
- **Documentation**: Detailed process documentation

## Integration with Other CFN Commands

- **Single task**: Use `/cfn-loop` (this command)
- **Multiple sprints**: Use `/cfn-loop-sprints`
- **Multi-phase epic**: Use `/cfn-loop-epic`
- **Direct single task**: Use `/cfn-loop-single`

## Example Execution

```
[Turn 1] /cfn-loop "Implement JWT auth" --phase=auth --mode=mvp
         → Spawn cfn-coordinator-mvp
         → Load mvp-instructions.md
         → Execute 3-loop process autonomously
         → MVP workers: 2, validators: 2, thresholds: 70%/80%
         → Continue until return-to-chat triggers

[Turn 2] /cfn-loop "Enterprise security audit" --mode=enterprise
         → Spawn cfn-coordinator-enterprise
         → Load enterprise-instructions.md
         → Execute comprehensive validation
         → Enterprise workers: 5, validators: 5, thresholds: 85%/95%
         → Return only for critical decisions
```