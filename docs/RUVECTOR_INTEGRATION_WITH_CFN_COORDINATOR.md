# RuVector Integration with CFN Coordinator

## Overview

RuVector integrates deeply with the CFN Coordinator to enable learning systems, context passing, and decision optimization across loop iterations. This document explains the integration architecture, data flow, and integration points.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Integration Points](#integration-points)
- [Context Passing Patterns](#context-passing-patterns)
- [Learning System Architecture](#learning-system-architecture)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Implementation Details](#implementation-details)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    CFN Coordinator                              │
├─────────────────────────────────────────────────────────────────┤
│  Responsibilities:                                              │
│  - Orchestrate agent spawning and task routing                 │
│  - Manage loop iterations (Loop 1, 2, 3)                       │
│  - Coordinate test execution and gate checks                   │
│  - Track task context and execution state                      │
└──────┬────────────────────────────────────────────────────────┘
       │
       │ Provides context, stores results
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  RuVector Learning Engine                       │
├─────────────────────────────────────────────────────────────────┤
│  Decompositions    Error Patterns    Security     Performance   │
│  Learnings        (5 collections)                              │
│                                                                 │
│  Responsibilities:                                              │
│  - Store historical context and decisions                      │
│  - Enable similarity-based queries for guidance                │
│  - Track patterns and generate insights                        │
│  - Support cross-iteration learning                            │
└─────────────────────────────────────────────────────────────────┘
```

### Integration Layers

```
Level 1: Task Context Capture
├─ Coordinator records task decomposition
├─ Coordinator records agent execution paths
└─ Coordinator captures error/security findings

Level 2: Pattern Recognition
├─ RuVector analyzes stored data
├─ Identifies similar historical cases
└─ Generates pattern insights

Level 3: Decision Support
├─ Coordinator queries RuVector for guidance
├─ Retrieves similar past approaches
└─ Uses learnings to optimize decisions

Level 4: Continuous Learning
├─ Each iteration produces new knowledge
├─ Insights feed into future iterations
└─ System improves over time
```

---

## Integration Points

### 1. Task Initialization

**When:** Task created by coordinator
**What:** Record initial decomposition and context

```typescript
// In cfn-coordinator.ts
async function initializeTask(taskId: string, taskDefinition: TaskDef) {
  const client = await getRuVectorClient();

  // Store decomposition strategy
  await client.decompositions.insert({
    taskId,
    agentType: 'coordinator',
    status: 'in_progress',
    components: taskDefinition.agents.map(a => a.type),
    estimatedComplexity: estimateComplexity(taskDefinition),
    metadata: {
      timestamp: new Date().toISOString(),
      taskDef: taskDefinition,
      agents: taskDefinition.agents.map(a => ({ type: a.type, count: a.count }))
    }
  });

  // Query for similar historical tasks
  const similar = await client.query.semanticSearch(
    'decompositions',
    taskDefinition.description,
    3
  );

  // Provide similar contexts to coordinator
  return { taskId, similarTasks: similar };
}
```

### 2. Agent Execution Tracking

**When:** Agent completes with result
**What:** Record execution metrics and findings

```typescript
// In agent execution handler
async function trackAgentExecution(
  taskId: string,
  agentId: string,
  agentType: string,
  result: AgentResult,
  executionTime: number
) {
  const client = await getRuVectorClient();

  // Record performance metrics
  await client.performance.insert({
    taskId,
    executionTimeMs: executionTime,
    memoryUsageMb: process.memoryUsage().heapUsed / 1024 / 1024,
    cpuPercentage: getCpuUsage(),
    timestamp: new Date(),
    metadata: {
      agentId,
      agentType,
      status: result.status,
      successRate: result.successRate
    }
  });

  // Record any errors encountered
  if (result.errors && result.errors.length > 0) {
    await client.errors.insertBatch(
      result.errors.map(err => ({
        errorType: err.type,
        message: err.message,
        context: {
          agentId,
          taskId,
          ...err.context
        },
        frequency: 1,
        solutions: err.suggestedFixes || []
      }))
    );
  }

  // Record security findings
  if (result.securityFindings && result.securityFindings.length > 0) {
    await client.security.insertBatch(
      result.securityFindings.map(finding => ({
        title: finding.title,
        severity: finding.severity,
        description: finding.description,
        type: finding.type,
        affectedComponent: finding.component,
        status: 'open'
      }))
    );
  }

  return result;
}
```

### 3. Loop Gate Check

**When:** Loop 3 completes, before Loop 2 validators
**What:** Use learnings to optimize gate check threshold

```typescript
// In gate-check-aggregator.ts
async function getGateCheckGuidance(taskId: string, testResults: TestResult[]) {
  const client = await getRuVectorClient();

  // Query historical performance for similar tasks
  const similar = await client.query.semanticSearch(
    'performance',
    `Task type: ${taskId.split('-')[0]}`,
    20
  );

  // Calculate baseline from history
  const avgHistoricalPassRate = similar.length > 0
    ? similar.reduce((sum, m) => sum + (m.metadata?.passRate || 0), 0) / similar.length
    : 0.95;

  // Get learning about threshold optimization
  const thresholdInsights = await client.query.filterSearch(
    'learnings',
    { category: 'recommendation', tags: ['gate-check'] }
  );

  return {
    baselinePassRate: avgHistoricalPassRate,
    insights: thresholdInsights,
    guidance: {
      recommendedThreshold: Math.max(avgHistoricalPassRate - 0.05, 0.85),
      confidenceLevel: thresholdInsights.length > 0 ? 'high' : 'medium'
    }
  };
}
```

### 4. Validator Loop (Loop 2)

**When:** Validators review Loop 3 output
**What:** Access learnings and similar cases for better assessment

```typescript
// In validator agent
async function validateWithHistoricalContext(
  taskId: string,
  implementationCode: string
) {
  const client = await getRuVectorClient();

  // Get similar security findings from past
  const pastSecurityIssues = await client.query.semanticSearch(
    'security',
    implementationCode,
    10
  );

  // Check for pattern matches
  const commonIssues = pastSecurityIssues.filter(
    issue => issue.status === 'resolved'
  );

  console.log(`Found ${commonIssues.length} similar resolved issues to check against`);

  // Get performance recommendations for this type of task
  const performanceRecs = await client.query.filterSearch(
    'learnings',
    { category: 'optimization', tags: ['performance'] }
  );

  return {
    validationPoints: {
      securityPriorityAreas: commonIssues.map(i => i.affectedComponent),
      performanceOptimizations: performanceRecs.map(r => r.title)
    },
    historicalContext: {
      similarIssuesResolved: commonIssues.length,
      recommendedApproaches: performanceRecs
    }
  };
}
```

### 5. Product Owner Decision

**When:** Product Owner decides on task outcome
**What:** Record decision rationale for learning

```typescript
// In product-owner-agent
async function recordProductOwnerDecision(
  taskId: string,
  decision: 'PROCEED' | 'ITERATE' | 'ABORT',
  rationale: string,
  metrics: TaskMetrics
) {
  const client = await getRuVectorClient();

  // Create learning record from this decision
  const learning = {
    category: 'insight' as const,
    title: `${decision}: ${rationale.substring(0, 50)}...`,
    description: rationale,
    confidence: metrics.validatorConsensus || 0.85,
    evidenceCount: 1,
    tags: [decision.toLowerCase(), 'product-owner-decision'],
    relatedRecords: {
      performance: [metrics.performanceRecordId],
      security: metrics.securityFindingIds
    }
  };

  await client.learnings.insert(learning);

  // Update task decomposition with outcome
  const decompositions = await client.query.filterSearch(
    'decompositions',
    { taskId }
  );

  if (decompositions.length > 0) {
    await client.decompositions.update(decompositions[0].id, {
      status: decision === 'PROCEED' ? 'completed' : decision.toLowerCase()
    });
  }

  return learning.id;
}
```

---

## Context Passing Patterns

### Pattern 1: Query Context from Previous Iterations

**Use Case:** Agent needs context from previous loop iterations

```typescript
// Agent receiving context
async function executeWithContext(taskId: string, currentIteration: number) {
  const client = await getRuVectorClient();

  // Get previous iterations' results
  const previousDecompositions = await client.query.filterSearch(
    'decompositions',
    { taskId }
  );

  const previousErrors = await client.errors.list({
    limit: 50,
    filter: { 'context.taskId': taskId }
  });

  const context = {
    previousAttempts: previousDecompositions.length,
    knownErrors: previousErrors,
    lessons: previousErrors.length > 0
      ? 'Previous iteration encountered validation errors'
      : 'No previous errors'
  };

  // Use context in decision making
  console.log(`Iteration ${currentIteration}: ${context.lessons}`);
  return context;
}
```

### Pattern 2: Pass Learnings to Next Agent

**Use Case:** One agent passes learnings to next agent in pipeline

```typescript
// Agent 1: Implementer
async function implementerPhase(taskId: string) {
  const client = await getRuVectorClient();

  // Implement solution
  const implementation = await implementSolution();

  // Create learning from this implementation
  const learning = await client.learnings.insert({
    category: 'pattern',
    title: 'Implementation approach: decomposition-first strategy',
    description: 'Breaking task into components before implementation improved clarity',
    confidence: 0.88,
    evidenceCount: 1,
    tags: ['implementer', taskId]
  });

  return {
    implementation,
    learningId: learning.id,
    contextForNextAgent: {
      approachUsed: 'decomposition-first',
      learningId: learning.id,
      recommendations: ['Follow same strategy', 'Validate components early']
    }
  };
}

// Agent 2: Validator (receives context)
async function validatorPhase(
  taskId: string,
  implementerOutput: ImplementerOutput,
  context: ContextFromImplementer
) {
  const client = await getRuVectorClient();

  // Retrieve implementer's learning
  if (context.learningId) {
    const learning = await client.learnings.get(context.learningId);
    console.log(`Implementer's approach: ${learning.description}`);
  }

  // Validate following similar successful patterns
  const successfulPatterns = await client.query.semanticSearch(
    'learnings',
    context.approachUsed,
    5
  );

  return {
    validation: validateImplementation(),
    contextForNextAgent: {
      successfulPatterns: successfulPatterns.map(p => p.title),
      validationMethod: 'pattern-aligned'
    }
  };
}
```

### Pattern 3: Coordinator Broadcasts Context to All Loop Agents

**Use Case:** Coordinator needs to provide shared context to all agents

```typescript
// In coordinator
async function broadcastContextToLoop3Agents(
  taskId: string,
  agents: AgentConfig[]
) {
  const client = await getRuVectorClient();

  // Query relevant learnings for this task type
  const relevantLearnings = await client.query.semanticSearch(
    'learnings',
    `Task type: ${agents.map(a => a.type).join(', ')}`,
    10
  );

  // Get performance baseline
  const performanceBaseline = await client.benchmark.profileCollection(
    'performance'
  );

  // Create shared context packet
  const sharedContext = {
    taskId,
    taskType: agents.map(a => a.type).join('-'),
    relevantLearnings: relevantLearnings.map(l => ({
      title: l.title,
      confidence: l.confidence
    })),
    performanceTargets: {
      avgExecutionTime: performanceBaseline.queryLatency.search,
      tolerance: 20  // percent
    },
    successCriteria: [
      'Implementation follows learned patterns',
      'Performance within baseline +20%',
      'No critical security issues'
    ]
  };

  // Pass to all agents
  return agents.map(agent => ({
    agentId: agent.id,
    context: sharedContext
  }));
}
```

---

## Learning System Architecture

### Learning Generation Flow

```
Agent Execution
      │
      ▼
Metrics Collection
├─ Execution time
├─ Error patterns
├─ Security findings
└─ Test results
      │
      ▼
Pattern Analysis
├─ Frequency analysis
├─ Similarity detection
└─ Confidence calculation
      │
      ▼
Learning Record Creation
├─ Pattern: recurring errors/approaches
├─ Insight: aggregated findings
├─ Recommendation: optimization opportunities
└─ Optimization: performance improvements
      │
      ▼
Confidence Scoring
├─ Evidence count
├─ Historical validation rate
└─ Cross-validator agreement
      │
      ▼
Learning Store (RuVector)
└─ Available for future queries
```

### Confidence Scoring Algorithm

```typescript
function calculateLearningConfidence(evidence: EvidenceData): number {
  // Base confidence from sample size
  const sampleConfidence = Math.min(evidence.count / 100, 1.0);  // 100+ samples = full confidence

  // Adjustment for consistency
  const consistency = evidence.successRate > 0.9 ? 1.0 : evidence.successRate;

  // Adjustment for recency (recent data weighted higher)
  const daysSinceNewest = (Date.now() - evidence.newestRecord) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(1.0 - (daysSinceNewest / 30), 0.5);  // Decays over 30 days

  // Cross-validator agreement
  const validatorAgreement = evidence.consensusScore || 0.85;

  // Combined confidence
  const confidence = (
    sampleConfidence * 0.4 +
    consistency * 0.3 +
    recencyScore * 0.2 +
    validatorAgreement * 0.1
  );

  return Math.min(confidence, 0.99);  // Never 100% certain
}
```

### Learning Query Patterns

```typescript
// Pattern 1: Get high-confidence learnings for a task type
async function getHighConfidenceLearnings(taskType: string) {
  const client = await getRuVectorClient();

  const learnings = await client.query.semanticSearch(
    'learnings',
    taskType,
    20
  );

  return learnings.filter(l => l.confidence >= 0.85);
}

// Pattern 2: Get contradicting insights (for review)
async function getConflictingInsights(category: string) {
  const client = await getRuVectorClient();

  const allInsights = await client.query.filterSearch(
    'learnings',
    { category, confidence: {$gte: 0.80} },
    500
  );

  // Group by topic and find conflicts
  const grouped = groupBy(allInsights, 'title');
  const conflicts = Object.values(grouped)
    .filter(group => group.length > 1)
    .map(group => ({
      topic: group[0].title,
      variants: group,
      avgConfidence: group.reduce((s, l) => s + l.confidence, 0) / group.length
    }));

  return conflicts;
}

// Pattern 3: Get learnings that support a decision
async function getDecisionSupport(decision: string) {
  const client = await getRuVectorClient();

  return await client.query.filterSearch(
    'learnings',
    { tags: [decision.toLowerCase()], confidence: {$gte: 0.80} }
  );
}
```

---

## Data Flow Diagrams

### Task Execution with Learning

```
Coordinator
    │
    ├─→ Record task initialization
    │   └─→ RuVector (decompositions)
    │
    ├─→ Query for similar tasks
    │   ├─ RuVector semantic search
    │   └─ Return context to coordinator
    │
    ├─→ Spawn Loop 3 agents
    │   │
    │   ├─→ Agent 1 (implementer)
    │   │   ├─ Execute task
    │   │   └─ Record performance, errors
    │   │       └─→ RuVector (performance, errors)
    │   │
    │   ├─→ Agent 2 (implementer)
    │   │   ├─ Execute task
    │   │   └─ Record metrics
    │   │       └─→ RuVector
    │   │
    │   └─→ Agent 3 (implementer)
    │       ├─ Execute task
    │       └─ Record security findings
    │           └─→ RuVector (security)
    │
    ├─→ Run tests, collect results
    │   └─ Record test metrics
    │       └─→ RuVector (performance)
    │
    ├─→ Gate check
    │   ├─ Query historical performance
    │   │   └─ RuVector comparison
    │   └─ Pass/fail decision
    │
    ├─→ If gate passes, spawn Loop 2 validators
    │   │
    │   ├─→ Validator 1
    │   │   ├─ Query RuVector for similar issues
    │   │   ├─ Review with historical context
    │   │   └─ Provide feedback
    │   │
    │   └─→ Validator 2
    │       └─ (similar)
    │
    ├─→ Aggregate validator feedback
    │   └─ Create learning records
    │       └─→ RuVector (learnings)
    │
    └─→ Product Owner decision
        ├─ Query RuVector for decision support
        └─ Record decision + rationale
            └─→ RuVector (learnings)
```

### Similarity Query Flow

```
Agent needs guidance
    │
    ├─→ Formulate query
    │   └─ "How should I handle validation errors?"
    │
    ├─→ RuVector Query API
    │   │
    │   ├─ Semantic embedding of query
    │   │
    │   ├─ Vector similarity search
    │   │   └─ Find closest matches in error collection
    │   │
    │   ├─ Filter by confidence/recency
    │   │
    │   └─ Return top 5-10 results
    │
    ├─→ Process results
    │   ├─ Sort by relevance score
    │   ├─ Extract solutions from errors
    │   └─ Combine with learnings
    │
    └─→ Use guidance in decision
        └─ "Based on 3 similar cases, try X approach"
```

---

## Implementation Details

### How Decompositions Support Future Tasks

```typescript
// New task coming in
const newTask = {
  description: 'Implement schema validation for user registration form'
};

// Query for similar past tasks
const similar = await client.query.semanticSearch(
  'decompositions',
  newTask.description,
  5
);

// similar[0] might be:
// {
//   taskId: 'task-2024-001',
//   components: [
//     'schema-definition',
//     'validation-rules',
//     'error-handling',
//     'test-coverage'
//   ],
//   estimatedComplexity: 'moderate',
//   metadata: { duration: 'PT2H30M' }
// }

// Use as template for new decomposition
const suggestedDecomposition = {
  stages: similar[0].components,
  estimatedTime: similar[0].metadata.duration,
  note: `Based on similar task ${similar[0].taskId}`
};
```

### How Errors Feed into Solutions

```typescript
// Error occurs during execution
const error = {
  type: 'ValidationError',
  message: 'Required field "userId" is missing'
};

// Coordinator records error
await client.errors.insert({
  errorType: error.type,
  message: error.message,
  context: { field: 'userId' },
  frequency: 1,
  solutions: ['Ensure userId is provided', 'Add default value']
});

// Next agent encounters similar error
const existingError = await client.query.semanticSearch(
  'errors',
  'Required field missing from input',
  1
);

// Immediately retrieves solution
console.log(`Known solution: ${existingError[0].solutions[0]}`);
```

### How Security Findings Prevent Recurrence

```typescript
// Security finding recorded
await client.security.insert({
  title: 'SQL injection in user search',
  severity: 'critical',
  description: 'User input directly concatenated in query',
  type: 'injection',
  affectedComponent: 'src/services/userService.ts:45',
  status: 'open'
});

// Validator reviewing similar code
const pastFindings = await client.query.semanticSearch(
  'security',
  'User input in SQL query',
  5
);

// Identifies same issue in new code
console.log(`WARNING: Same injection pattern found in ${affectedFile}`);
console.log(`Known severity: ${pastFindings[0].severity}`);
console.log(`Previous location: ${pastFindings[0].affectedComponent}`);
```

### RuVector-Coordinator Interface

```typescript
// Coordinator initialization
async function initCoordinator() {
  const ruvectorClient = await initializeRuVector({
    host: process.env.RUVECTOR_HOST,
    port: parseInt(process.env.RUVECTOR_PORT || '8000'),
    retries: 3,
    verbose: process.env.DEBUG === 'true'
  });

  return {
    ruvectorClient,
    // Exposed coordinator methods
    recordTaskStart: (taskId, taskDef) => recordTaskStart(taskId, taskDef, ruvectorClient),
    getContextForTask: (taskId) => getContextForTask(taskId, ruvectorClient),
    recordAgentCompletion: (taskId, agentId, result) => recordAgentCompletion(taskId, agentId, result, ruvectorClient),
    getGateCheckInsights: (taskId) => getGateCheckInsights(taskId, ruvectorClient),
    recordValidatorFeedback: (taskId, feedback) => recordValidatorFeedback(taskId, feedback, ruvectorClient),
    recordProductOwnerDecision: (taskId, decision) => recordProductOwnerDecision(taskId, decision, ruvectorClient)
  };
}

// Usage in coordinator
const coordinator = await initCoordinator();

// During task execution
await coordinator.recordTaskStart('task-xyz', taskDefinition);
const context = await coordinator.getContextForTask('task-xyz');

// Pass context to agents
agents.forEach(agent => {
  agent.context = context;
});

// After agent completes
await coordinator.recordAgentCompletion('task-xyz', agent.id, agent.result);

// At gate check
const insights = await coordinator.getGateCheckInsights('task-xyz');
```

---

## Integration Checklist

- [ ] RuVector service running and healthy
- [ ] Coordinator imports RuVector client
- [ ] Task initialization records decomposition
- [ ] Agent execution tracking records metrics
- [ ] Error handling populates error collection
- [ ] Security scanner adds to security collection
- [ ] Loop 2 validators query for context
- [ ] Product Owner records learnings
- [ ] Health checks before critical operations
- [ ] Graceful degradation if RuVector unavailable
- [ ] Learning records created with proper confidence scores
- [ ] Similar task queries guide decomposition
- [ ] Error solutions provided to future agents
- [ ] Security findings prevent recurrence
- [ ] Performance benchmarks guide optimization

---

## Next Steps

- See [RUVECTOR_API_REFERENCE.md](./RUVECTOR_API_REFERENCE.md) for detailed API documentation
- See [RUVECTOR_DEVELOPER_GUIDE.md](./RUVECTOR_DEVELOPER_GUIDE.md) for implementation examples
- See [RUVECTOR_OPERATIONS.md](./RUVECTOR_OPERATIONS.md) for deployment and operations

