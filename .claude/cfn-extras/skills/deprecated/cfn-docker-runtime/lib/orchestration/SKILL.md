# CFN Docker Loop Orchestration Skill

**Purpose:** Orchestrate container-based CFN Loop execution with agent spawning, loop management, consensus collection, and product owner decision flow.

## Overview

This skill manages the complete CFN Loop execution lifecycle for docker-based agents, coordinating Loop 3 (implementer) and Loop 2 (validator) phases, collecting confidence scores and consensus, and triggering Product Owner decisions.

## Architecture

```bash
CFN Docker V3 Coordinator
    ↓ (task analysis)
CFN Docker Loop Orchestration
    ↓ (context storage)
Redis (State Management)
    ↓ (agent spawning)
CFN Docker Agent Spawning
    ↓ (container execution)
Docker Containers (Agents)
    ↓ (completion signals)
Consensus Collection
    ↓ (decision flow)
Product Owner Decision
```

## Loop Execution Model

### Loop 3: Primary Implementation (Implementers)
- **Purpose**: Create, build, and implement the solution
- **Agents**: 3 specialized implementers based on task requirements
- **Process**: Parallel execution → Confidence reporting → Gate check

### Loop 2: Consensus Validation (Validators)
- **Purpose**: Review and validate Loop 3 work
- **Agents**: 2-4 validators (reviewers, testers, security specialists)
- **Process**: Sequential validation → Consensus collection → Decision

### Loop 4: Product Owner Decision
- **Purpose**: Strategic decision based on consensus and deliverables
- **Agent**: Single product owner with GOAP methodology
- **Process**: Decision analysis → PROCEED/ITERATE/ABORT

## Core Functions

### 1. Task Analysis and Context Setup
Analyze task requirements and prepare execution context:

```bash
# Initialize loop orchestration
cfn-docker-loop-orchestration init \
  --task-id task-authentication \
  --task-description "Implement user authentication system" \
  --mode standard \
  --max-iterations 5
```

### 2. Loop 3 Agent Spawning
Spawn implementer agents based on task requirements:

```bash
# Spawn Loop 3 implementers
cfn-docker-loop-orchestration spawn-loop3 \
  --task-id task-authentication \
  --agents backend-developer,frontend-engineer,security-specialist \
  --context "${TASK_CONTEXT}"
```

### 3. Loop 3 Completion Monitoring
Monitor implementer progress and collect confidence scores:

```bash
# Monitor Loop 3 completion
cfn-docker-loop-orchestration monitor-loop3 \
  --task-id task-authentication \
  --wait-for-complete \
  --gate-threshold 0.75
```

### 4. Gate Check and Decision
Evaluate Loop 3 results and decide next steps:

```bash
# Check Loop 3 gate
cfn-docker-loop-orchestration gate-check \
  --task-id task-authentication \
  --gate-threshold 0.75 \
  --max-iterations 5
```

### 5. Loop 2 Validator Spawning
Spawn validator agents if gate passed:

```bash
# Spawn Loop 2 validators
cfn-docker-loop-orchestration spawn-loop2 \
  --task-id task-authentication \
  --agents reviewer,tester,security-specialist \
  --loop3-work "${WORK_SUMMARY}"
```

### 6. Consensus Collection
Collect and analyze validator consensus:

```bash
# Collect Loop 2 consensus
cfn-docker-loop-orchestration collect-consensus \
  --task-id task-authentication \
  --required-consensus 0.90 \
  --timeout 300
```

### 7. Product Owner Decision
Trigger final decision process:

```bash
# Trigger Product Owner decision
cfn-docker-loop-orchestration trigger-po-decision \
  --task-id task-authentication \
  --consensus-data "${CONSENSUS_RESULTS}"
```

## Loop Management

### Iteration Control
```bash
# Control loop iterations
cfn-docker-loop-orchestration control-iterations \
  --task-id task-authentication \
  --current-iteration 2 \
  --max-iterations 5 \
  --gate-threshold 0.75 \
  --consensus-threshold 0.90
```

### Adaptive Agent Selection
```bash
# Select agents based on iteration and feedback
cfn-docker-loop-orchestration select-adaptive-agents \
  --task-id task-authentication \
  --iteration 2 \
  --previous-feedback "${FEEDBACK_DATA}"
```

### Error Handling and Recovery
```bash
# Handle execution errors
cfn-docker-loop-orchestration handle-errors \
  --task-id task-authentication \
  --error-type agent-failure \
  --failed-agent-id agent-backend-001 \
  --restart-strategy adaptive
```

## Configuration Modes

### MVP Mode (Quick Execution)
```bash
cfn-docker-loop-orchestration execute \
  --task-id task-authentication \
  --mode mvp \
  --max-iterations 3 \
  --gate-threshold 0.70 \
  --consensus-threshold 0.80 \
  --validators 2
```

### Standard Mode (Balanced)
```bash
cfn-docker-loop-orchestration execute \
  --task-id task-authentication \
  --mode standard \
  --max-iterations 10 \
  --gate-threshold 0.75 \
  --consensus-threshold 0.90 \
  --validators 3
```

### Enterprise Mode (Thorough)
```bash
cfn-docker-loop-orchestration execute \
  --task-id task-authentication \
  --mode enterprise \
  --max-iterations 15 \
  --gate-threshold 0.85 \
  --consensus-threshold 0.95 \
  --validators 5
```

## Agent Selection Strategy

### Task-Based Agent Selection
```bash
# Analyze task and select appropriate agents
cfn-docker-loop-orchestration analyze-and-select \
  --task-description "Implement secure user authentication" \
  --output-agent-types
```

### Skill-Based Selection
```bash
# Select agents based on required skills
cfn-docker-loop-orchestration select-by-skills \
  --required-skills "security,backend-development,frontend-development" \
  --agent-count 3
```

### Experience-Based Selection
```bash
# Select agents based on previous performance
cfn-docker-loop-orchestration select-by-experience \
  --task-domain authentication \
  --success-threshold 0.85
```

## Integration with CFN Docker Skills

### Redis Coordination Integration
```bash
# Store loop state in Redis
cfn-docker-redis-coordination store-loop-state \
  --task-id task-authentication \
  --loop-number 3 \
  --iteration 1 \
  --state "in-progress"

# Retrieve loop state
cfn-docker-redis-coordination get-loop-state \
  --task-id task-authentication \
  --loop-number 3
```

### Agent Spawning Integration
```bash
# Spawn agents with MCP configuration
cfn-docker-agent-spawn batch \
  --agent-types backend-developer,frontend-engineer \
  --task-id task-authentication \
  --mcp-auto-select
```

### Skill Selection Integration
```bash
# Configure MCP access for agents
for agent_type in backend-developer frontend-engineer; do
  cfn-docker-skill-mcp-selector configure \
    --agent-type $agent_type \
    --task-id task-authentication
done
```

## Monitoring and Observability

### Loop Progress Monitoring
```bash
# Monitor overall loop progress
cfn-docker-loop-orchestration monitor-progress \
  --task-id task-authentication \
  --real-time \
  --include-agents

# Monitor specific loop
cfn-docker-loop-orchestration monitor-loop \
  --task-id task-authentication \
  --loop-number 3 \
  --detailed
```

### Performance Metrics
```bash
# Collect performance metrics
cfn-docker-loop-orchestration metrics \
  --task-id task-authentication \
  --include-timing \
  --include-resource-usage \
  --include-confidence-trends
```

### Agent Performance Tracking
```bash
# Track agent performance across loops
cfn-docker-loop-orchestration agent-performance \
  --task-id task-authentication \
  --agent-id agent-backend-001 \
  --all-iterations
```

## Decision Flow Logic

### Gate Check Algorithm
1. **Collect Confidence Scores**: Gather all Loop 3 confidence scores
2. **Calculate Average**: Compute mean confidence score
3. **Check Threshold**: Compare against gate threshold
4. **Decision Logic**:
   - `confidence >= threshold` → Proceed to Loop 2
   - `confidence < threshold` → Iterate Loop 3 (if iterations remaining)

### Consensus Validation Algorithm
1. **Collect Validator Feedback**: Gather all Loop 2 validator responses
2. **Calculate Consensus**: Compute average confidence and agreement level
3. **Check Threshold**: Compare against consensus threshold
4. **Decision Logic**:
   - `consensus >= threshold` → Trigger Product Owner
   - `consensus < threshold` → Iterate (if iterations remaining)

### Product Owner Decision Triggers
1. **High Consensus (≥0.95)**: AUTO-COMPLETE
2. **Good Consensus (≥threshold)**: PROCEED to Product Owner
3. **Low Consensus (<threshold)**: ITERATE with specific feedback

## Error Handling Strategies

### Agent Failure Handling
```bash
# Handle agent container failure
cfn-docker-loop-orchestration handle-agent-failure \
  --task-id task-authentication \
  --failed-agent-id agent-backend-001 \
  --strategy respawn \
  --backup-agent-type backend-developer
```

### Timeout Handling
```bash
# Handle loop timeouts
cfn-docker-loop-orchestration handle-timeout \
  --task-id task-authentication \
  --loop-number 3 \
  --timeout-extension 300
```

### MCP Server Failures
```bash
# Handle MCP server connectivity issues
cfn-docker-loop-orchestration handle-mcp-failure \
  --task-id task-authentication \
  --failed-mcp playwright \
  --fallback direct-tools
```

## Performance Optimization

### Parallel Execution
- **Loop 3**: Spawn all implementers simultaneously
- **Loop 2**: Sequential validator execution to prevent conflicts
- **Resource Management**: Balance concurrent execution with resource limits

### Adaptive Iteration
- **Smart Iteration**: Only iterate when specific issues identified
- **Agent Specialization**: Select different specialists based on feedback
- **Context Preservation**: Maintain context across iterations

### Resource Optimization
- **Container Reuse**: Reuse containers where possible
- **MCP Server Optimization**: Share MCP servers across compatible agents
- **Memory Management**: Optimize memory usage across loop phases

## Quality Assurance

### Deliverable Validation
```bash
# Validate required deliverables created
cfn-docker-loop-orchestration validate-deliverables \
  --task-id task-authentication \
  --required-files "auth-service.js,login.html" \
  --acceptance-criteria "${CRITERIA}"
```

### Code Quality Checks
```bash
# Run automated quality checks
cfn-docker-loop-orchestration quality-check \
  --task-id task-authentication \
  --include-linting \
  --include-security-scan \
  --include-tests
```

### Integration Testing
```bash
# Run integration tests for complete solution
cfn-docker-loop-orchestration integration-test \
  --task-id task-authentication \
  --test-suite authentication-tests
```

## Best Practices

### Loop Design
- **Clear Success Criteria**: Define measurable success criteria for each loop
- **Appropriate Thresholds**: Set realistic confidence and consensus thresholds
- **Iteration Limits**: Establish maximum iteration limits to prevent infinite loops

### Agent Selection
- **Task-Appropriate Skills**: Select agents with relevant domain expertise
- **Diverse Perspectives**: Include different agent types for comprehensive coverage
- **Performance History**: Consider past agent performance when selecting

### Error Recovery
- **Graceful Degradation**: Implement fallback mechanisms for failures
- **State Persistence**: Maintain state for recovery from interruptions
- **Monitoring**: Comprehensive monitoring for early issue detection

## Configuration

### Environment Variables
```bash
# Loop configuration
CFN_DOCKER_MAX_ITERATIONS=10
CFN_DOCKER_GATE_THRESHOLD=0.75
CFN_DOCKER_CONSENSUS_THRESHOLD=0.90
CFN_DOCKER_LOOP_TIMEOUT=600

# Agent configuration
CFN_DOCKER_MAX_CONCURRENT_AGENTS=5
CFN_DOCKER_AGENT_TIMEOUT=300
CFN_DOCKER_CONTAINER_MEMORY_LIMIT=1g

# Decision configuration
CFN_DOCKER_AUTO_COMPLETE_THRESHOLD=0.95
CFN_DOCKER_FORCE_ITERATION_THRESHOLD=0.60
```

### Loop Configuration File
```json
{
  "loopConfig": {
    "maxIterations": 10,
    "gateThreshold": 0.75,
    "consensusThreshold": 0.90,
    "loopTimeouts": {
      "loop3": 600,
      "loop2": 300,
      "productOwner": 180
    }
  },
  "agentConfig": {
    "maxConcurrentAgents": 5,
    "defaultMemoryLimit": "1g",
    "defaultCpuLimit": 1.0,
    "restartPolicy": "on-failure"
  },
  "decisionConfig": {
    "autoCompleteThreshold": 0.95,
    "forceIterationThreshold": 0.60,
    "enableAdaptiveSelection": true
  }
}
```