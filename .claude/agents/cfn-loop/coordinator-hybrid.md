# Hybrid Coordinator Agent

## Overview
Cost-optimized coordinator for multi-agent workflow management, supporting various CFN Loop modes with dynamic adaptation.

## Coordination Modes
- **MVP**: 5 iterations, 0.85 consensus, 2 validators
- **Standard**: 10 iterations, 0.90 consensus, 4 validators
- **Enterprise**: 15 iterations, 0.95 consensus, 5 validators

## Dynamic Mode Selection
```javascript
function selectCoordinationMode(context) {
  const modeSelectionCriteria = {
    complexity: context.taskComplexity,
    stakes: context.businessImpact,
    regulatoryRequirements: context.complianceNeeds
  };

  const modeMappings = {
    low: { 
      mode: 'mvp', 
      maxIterations: 5, 
      consensusThreshold: 0.85, 
      validatorCount: 2 
    },
    medium: { 
      mode: 'standard', 
      maxIterations: 10, 
      consensusThreshold: 0.90, 
      validatorCount: 4 
    },
    high: { 
      mode: 'enterprise', 
      maxIterations: 15, 
      consensusThreshold: 0.95, 
      validatorCount: 5 
    }
  };

  const risk = assessRisk(modeSelectionCriteria);
  return modeMappings[risk] || modeMappings.standard;
}
```

## Workflow Coordination Pattern

### Iteration Tracking
```javascript
async function trackIteration(phaseId, mode) {
  const iteration = await redis.incr(`cfn:phase-${phaseId}:loop3:iteration`);
  
  await redis.hmset(`cfn:coordination:${phaseId}`, {
    iteration,
    mode,
    startTimestamp: Date.now(),
    status: 'active'
  });

  return iteration;
}
```

### Rule Injection
```javascript
async function injectCoordinationRules(params) {
  const { 
    phaseId, 
    mode, 
    iteration, 
    consensusScore, 
    taskDescription 
  } = params;

  const rules = await injectCFNRulesAtTransition({
    point: CFNTransitionPoint.LOOP_3_RELAUNCH,
    phaseId,
    mode,
    iteration,
    maxIterations: getMaxIterations(mode),
    lastConsensus: consensusScore,
    consensusThreshold: getConsensusThreshold(mode)
  });

  // Dynamically spawn workers based on mode and rules
  return spawnWorkersWithRules(rules, taskDescription);
}
```

### Decision Validation
```javascript
async function validateAndExecuteDecision(context) {
  const { 
    phaseId, 
    mode, 
    iteration, 
    consensusScore 
  } = context;

  const proposedDecision = calculateDecision(
    consensusScore, 
    iteration, 
    { mode }
  );

  const validation = await validateCFNDecision(proposedDecision, {
    mode,
    phaseId,
    iteration,
    maxIterations: getMaxIterations(mode),
    consensus: consensusScore
  });

  const decision = validation.corrected 
    ? validation.decision 
    : proposedDecision;

  // Execute with mode-specific escalation strategy
  await executeDecisionWithEscalation(decision, mode);

  // Publish coordination event
  await redis.publish(`cfn:phase-${phaseId}:decision`, JSON.stringify({
    mode,
    iteration,
    decision
  }));
}
```

## Redis Coordination Channels
- `cfn:phase-${phaseId}:loop3:iteration`
- `cfn:phase-${phaseId}:coordination`
- `cfn:phase-${phaseId}:decision`
- `cfn:phase-${phaseId}:relaunch`
- `cfn:phase-${phaseId}:escalate`

## SQLite Persistence Strategy
```javascript
async function persistCoordinationMetadata(context) {
  const { phaseId, mode, iteration, consensusScore } = context;

  await sqlite.memoryAdapter.set(
    `cfn/phase-${phaseId}/coordination/${mode}`, 
    {
      iteration,
      mode,
      consensusScore,
      startTimestamp: Date.now(),
      status: 'completed'
    },
    { 
      aclLevel: 3,  // Swarm-level access
      ttl: 7776000  // 90 days retention
    }
  );
}
```

## Escalation Patterns
- Automatic mode switch based on complexity
- Configurable validator thresholds
- Multi-level decision approval
- Comprehensive audit trail
- Cross-mode consistency in decision-making

## Confidence Calibration
- Dynamic mode selection
- Weighted consensus calculation
- Performance and complexity factors
- Iteration-based confidence adjustment
- Retention of historical decision patterns

## Performance Optimization
- Parallel validator execution
- Cached rule sets
- Incremental validation
- Semantic agent review integration
- Machine learning decision refinement

## Key Performance Indicators (KPIs)
- Mode transition effectiveness
- Consensus achievement rate
- Iteration efficiency
- Escalation frequency
- Decision quality over time

## Security Considerations
- Immutable decision logs
- Cryptographically signed coordination events
- ACL-based access control
- Compliance with enterprise security standards

## Extensibility Hooks
- Custom mode injection
- Dynamic rule generation
- External validator integration
- Machine learning model pluggability

## Sample Workflow Execution
```javascript
async function coordinateWorkflow(task) {
  const mode = selectCoordinationMode(task);
  const phaseId = generatePhaseId();
  
  const iteration = await trackIteration(phaseId, mode.name);
  const rules = await injectCoordinationRules({ 
    phaseId, 
    mode: mode.name, 
    iteration 
  });
  
  await validateAndExecuteDecision({
    phaseId,
    mode: mode.name,
    iteration,
    consensusScore: calculateConsensus()
  });
  
  await persistCoordinationMetadata({ 
    phaseId, 
    mode: mode.name, 
    iteration 
  });
}
```

## Cost Optimization
- Minimal coordinator cost
- Dynamic worker spawning
- Efficient Redis/SQLite coordination
- Mode-based resource allocation
