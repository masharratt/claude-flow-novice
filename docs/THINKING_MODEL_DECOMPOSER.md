# Thinking-Model-Driven Task Decomposer

## Overview

The CFN Thinking-Model-Driven Task Decomposer (`cfn-thinking-decomposer`) replaces template-based decomposition with intelligent reasoning-based task breakdown. It uses Cerebras Qwen-3-235B (or other reasoning models) to generate optimal micro-task decompositions with full reasoning about task structure, dependencies, and execution strategy.

**Key Innovation**: Uses the model's reasoning capabilities to think through decomposition before generating structured JSON, resulting in better dependency detection, realistic estimation, and adaptive execution planning.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│ Task Input (DecomposerPayload)                              │
│  - taskDescription: string                                  │
│  - workDir: string                                          │
│  - context: optional analysis context                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Cache Lookup (generateCacheKey)                              │
│  - SHA256 hash of task description                          │
│  - Cache directory: /tmp/cfn-decomposition-cache            │
│  - Return cached result if found                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    [Cache Hit?] → Return
                            ↓
                       [No Hit]
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Thinking Model API Call                                      │
│  - Model: qwen-3-235b-a22b-instruct-2507                   │
│  - Prompt: Structured reasoning prompt (500+ tokens)       │
│  - Response: Full reasoning + JSON output                  │
│  - Rate limit: 2s between calls                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ JSON Parsing & Validation                                    │
│  - Extract JSON from markdown code blocks                  │
│  - Validate required fields on all micro-tasks             │
│  - Validate dependency graph (no cycles)                   │
│  - Validate phase structure                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Risk & Complexity Assessment                                 │
│  - Security implications (keyword + validator detection)    │
│  - Performance implications                                 │
│  - Risk level assessment (low/medium/high)                 │
│  - Complexity from micro-task count                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Cache Storage & Return                                       │
│  - Save result to /tmp/cfn-decomposition-cache/            │
│  - Return DecompositionResult with metadata                │
└─────────────────────────────────────────────────────────────┘
```

### Fallback Strategy

If the thinking model fails (API error, invalid JSON, parsing error):
1. Log error and fallback
2. Use simple rule-based decomposition (split on "and")
3. Generate basic micro-tasks with sequential dependency
4. Return valid result with reduced confidence

## API Reference

### Trigger.dev Task

```typescript
export const cfnThinkingDecomposerTask = task({
  id: "cfn-thinking-decomposer",
  maxDuration: 600, // 10 minutes
  run: async (payload: DecomposerPayload): Promise<DecomposerResult>
});
```

### Input: DecomposerPayload

```typescript
interface DecomposerPayload {
  /** Task description to decompose */
  taskDescription: string;

  /** Working directory */
  workDir: string;

  /** Optional context for better decomposition */
  context?: {
    /** List of relevant files */
    files?: string[];

    /** Test files affected */
    tests?: string[];

    /** Related task descriptions for reference */
    relatedTasks?: string[];

    /** Team expertise hints */
    teamExpertise?: AgentType[];

    /** Time constraints: "immediate" | "4h" | "8h" | "1d" */
    timeConstraint?: string;
  };

  /** Skip cache and force re-decomposition */
  skipCache?: boolean;

  /** Thinking model selection (currently qwen-3-235b) */
  thinkingModel?: "qwen-3-235b" | "claude-opus" | "o1";

  /** Provider: "cerebras" | "anthropic" | "openai" */
  provider?: "cerebras" | "anthropic" | "openai";
}
```

### Output: DecomposerResult

```typescript
interface DecomposerResult {
  /** Whether decomposition succeeded */
  success: boolean;

  /** Decomposition result (if successful) */
  result?: DecompositionResult;

  /** Error message (if failed) */
  error?: string;

  /** Time spent in thinking model (ms) */
  thinkingTimeMs: number;

  /** Total decomposition time (ms) */
  totalTimeMs: number;

  /** Whether result was from cache */
  fromCache: boolean;

  /** Confidence score (0.0-1.0) */
  confidence: number;
}
```

### DecompositionResult Details

```typescript
interface DecompositionResult {
  /** Unique decomposition task ID */
  taskId: string;

  /** Original task description */
  originalTask: string;

  /** Array of atomic micro-tasks */
  microTasks: MicroTask[];

  /** Execution strategy */
  executionPlan: {
    /** Execution phases (parallel and sequential) */
    phases: Phase[];

    /** Total estimated duration in minutes */
    estimatedDuration: number;

    /** Recommended number of agents */
    recommendedTeamSize: number;

    /** Task IDs that can be parallelized */
    parallelizable: string[];
  };

  /** Decomposition metadata */
  metadata: {
    complexity: "simple" | "moderate" | "complex";
    riskLevel: "low" | "medium" | "high";
    requiresSecurityReview: boolean;
    requiresPerformanceReview: boolean;
  };
}
```

### MicroTask Structure

```typescript
interface MicroTask {
  /** Unique ID (task-1, task-2, etc.) */
  id: string;

  /** Atomic action (single sentence, no "and") */
  description: string;

  /** Dependencies on other task IDs */
  dependsOn: string[];

  /** Executor specialization */
  executorType: AgentType;

  /** Complexity: "simple" | "moderate" */
  complexity: "simple" | "moderate";

  /** Expected output size */
  estimatedLines: number;

  /** Context hints for executor */
  contextHints: string[];

  /** Validation requirements */
  validationCriteria: ValidationCriteria;
}
```

### Validation Criteria

```typescript
interface ValidationCriteria {
  /** Type of validation */
  type: "tdd" | "integration" | "security" | "report" | "diagnostic" | "quality";

  /** Success threshold (e.g., 0.95 for 95% pass rate) */
  threshold?: number;

  /** Whether security review needed */
  securityChecks?: boolean;

  /** Whether performance checks needed */
  performanceChecks?: boolean;

  /** Test files that must pass */
  testFiles?: string[];

  /** Custom validation criteria */
  customValidator?: string;
}
```

### Agent Types Available

```typescript
type AgentType =
  | "backend-developer"      // API, database, business logic
  | "frontend-engineer"      // UI, styling, responsiveness
  | "typescript-specialist"  // Type definitions, TS patterns
  | "data-engineer"          // Data pipelines, transformations
  | "security-specialist"    // Auth, encryption, security
  | "analyst"                // Documentation, analysis
  | "devops-engineer"        // Infrastructure, deployment
  | "ml-engineer";           // ML models, training pipelines
```

## Usage Examples

### Basic Decomposition

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

const result = await tasks.trigger("cfn-thinking-decomposer", {
  taskDescription: "Build a REST API endpoint for user authentication with JWT tokens, password hashing, and rate limiting",
  workDir: "/workspace/api",
});

// Monitor with polling
const finalResult = await runs.poll(result.id, { pollIntervalMs: 2000 });
console.log(finalResult.output.result.microTasks);
```

### With Context

```typescript
const result = await tasks.trigger("cfn-thinking-decomposer", {
  taskDescription: "Implement shopping cart feature with payment integration",
  workDir: "/workspace/frontend",
  context: {
    files: [
      "src/components/Cart.tsx",
      "src/services/payment.ts",
      "src/types/order.ts",
    ],
    tests: [
      "tests/Cart.test.tsx",
      "tests/payment.integration.test.ts",
    ],
    relatedTasks: [
      "Implement product listing",
      "Setup payment provider",
    ],
    teamExpertise: [
      "frontend-engineer",
      "backend-developer",
      "typescript-specialist",
    ],
    timeConstraint: "4h",
  },
  skipCache: false,
});
```

### Batch Decomposition

```typescript
// Decompose multiple tasks in parallel
const results = await tasks.batchTrigger("cfn-thinking-decomposer", [
  {
    payload: {
      taskDescription: "Implement authentication system",
      workDir: "/workspace",
    },
  },
  {
    payload: {
      taskDescription: "Setup database migrations",
      workDir: "/workspace",
    },
  },
  {
    payload: {
      taskDescription: "Create API documentation",
      workDir: "/workspace",
    },
  },
]);
```

## Thinking Model Prompt Structure

The decomposer generates a comprehensive prompt that guides the reasoning model:

```
1. TASK ANALYSIS PHASE
   - Original task description
   - Related files/tests/tasks
   - Time constraints
   - Team expertise hints

2. REASONING REQUIREMENTS
   - Complexity analysis
   - Atomicity evaluation
   - Dependency identification
   - Executor type mapping
   - Execution strategy planning
   - Risk assessment

3. MICRO-TASK CONSTRAINTS
   - Atomic requirements (no "and", single action)
   - Output size limits (5-50 lines)
   - Independent or clearly dependent
   - No cross-task coordination needed

4. EXECUTOR TYPES
   - Descriptions of 8 specialized agent types
   - Best use cases for each

5. VALIDATION CRITERIA TYPES
   - TDD, integration, security, report, diagnostic, quality

6. OUTPUT FORMAT
   - Structured JSON with all required fields
   - Analysis metadata
   - Execution plan with phases
   - Confidence score
```

## Complexity Assessment

### Simple Tasks (≤3 micro-tasks)
- Single file modifications
- Straightforward implementations
- Well-defined scope
- Recommended team size: 1-2 agents

### Moderate Tasks (4-8 micro-tasks)
- Multiple interrelated features
- Moderate coordination
- Some cross-module dependencies
- Recommended team size: 2-4 agents

### Complex Tasks (>8 micro-tasks)
- Large feature sets
- Significant coordination
- Multiple cross-cutting concerns
- Recommended team size: 4+ agents

## Risk Assessment

### Security Implications Detected By:
- Keywords: security, auth, password, token, permission, admin, encryption, SSL/TLS, vulnerability
- Validators with `type: "security"` or `securityChecks: true`
- Breaking change keywords: delete, remove, migration

### Performance Implications Detected By:
- Keywords: optimize, performance, cache, benchmark, throughput, latency, memory
- Validators with `performanceChecks: true`

### Risk Levels:
- **Low**: No security/performance implications, simple tasks
- **Medium**: Some security/performance concerns, moderate complexity
- **High**: Multiple breaking changes, security-critical, performance-sensitive

## Caching Strategy

### Cache Key Generation
```
SHA256(taskDescription).substring(0, 16)
```

### Cache Location
```
/tmp/cfn-decomposition-cache/{cacheKey}.json
```

### Cache TTL
- No automatic expiration
- Manually clear with: `rm -rf /tmp/cfn-decomposition-cache/*`
- Skip cache with: `skipCache: true` in payload

### Benefits
- Avoids re-decomposing identical tasks
- Reduces API calls to thinking model
- Fast response for repeated tasks
- Significant cost savings for repeated workflows

## Error Handling

### Thinking Model Failures
1. Log error with task description
2. Validate API key is configured
3. Check rate limiting (2s between calls)
4. Fallback to rule-based decomposition
5. Return valid result with lower confidence

### Parsing Failures
1. Attempt to extract JSON from markdown blocks
2. Validate all required fields
3. Check for circular dependencies
4. If any validation fails, use fallback
5. Log error for debugging

### Validation Failures
1. Ensure micro-tasks are truly atomic
2. Verify dependency graph has no cycles
3. Check phase coverage (all tasks included)
4. Validate parallelizable array

## Monitoring & Logging

### Log Output
```
[cfn-thinking-decomposer] Calling thinking model for task decomposition
[cfn-thinking-decomposer] Task: {first 80 chars}...
[cfn-thinking-decomposer] Model response received ({thinkingTimeMs}ms, confidence: {score})
[cfn-thinking-decomposer] Decomposition successful: {count} micro-tasks
[cfn-thinking-decomposer] Cache hit for task: {cacheKey}
[cfn-thinking-decomposer] Cached decomposition: {cacheKey}
[cfn-thinking-decomposer] Using fallback rule-based decomposition
[cfn-thinking-decomposer] Task failed: {error}
```

### Metrics Tracked
- `thinkingTimeMs`: API response time
- `totalTimeMs`: Total decomposition duration
- `confidence`: Model confidence (0.0-1.0)
- `microTaskCount`: Number of generated tasks
- `complexity`: simple/moderate/complex
- `riskLevel`: low/medium/high
- `fromCache`: Whether result was cached

## Integration with CFN Loop

### Before Implementer (Loop 3)
1. Coordinator receives task description
2. Calls thinking decomposer
3. Gets optimal micro-task breakdown
4. Spawns implementer agents per micro-task
5. Implementers work on atomic, isolated tasks

### Execution Flow
```
Task Input
   ↓
Thinking Decomposer (this task)
   ↓
DecompositionResult (with micro-tasks)
   ↓
Batch Trigger Implementers
   ↓
Loop 3: Parallel execution
   ↓
Test Runner (Gate Check)
   ↓
Product Owner Decision (Iterate or Proceed)
```

## Performance Characteristics

### Timing Estimates
- **Cache hit**: 50-150ms
- **API call (thinking model)**: 2-5 seconds
- **Parsing & validation**: 100-500ms
- **Total (no cache)**: 2-6 seconds
- **Total (with cache)**: 50-200ms

### Cost Estimates (Cerebras Qwen-3-235B)
- **Per decomposition**: $0.003-0.008 (raw tokens)
- **With caching**: 90% reduction for repeated tasks
- **Monthly (100 unique tasks)**: ~$0.50

### Concurrency Limits
- Rate limit: 2 seconds between API calls
- No per-task limit (parallel execution safe)
- Enforced at provider level

## Troubleshooting

### Common Issues

#### "CEREBRAS_API_KEY not configured"
```bash
export CEREBRAS_API_KEY="your-api-key"
npx trigger.dev@latest dev --profile self-hosted-v4
```

#### Invalid JSON Response
- Check model selection (should be qwen-3-235b)
- Verify prompt structure
- Inspect logs for raw response
- Fallback will be used automatically

#### Cache Issues
- Clear cache: `rm -rf /tmp/cfn-decomposition-cache/*`
- Force re-decomposition: `skipCache: true`
- Check directory permissions

#### Task Timeout (>10 minutes)
- Increase maxDuration in task definition
- Check thinking model performance
- Consider splitting task further

## Best Practices

### 1. Clear Task Descriptions
```typescript
// GOOD: Specific, bounded, clear intent
"Add JWT authentication to the REST API with token validation middleware and rate limiting"

// BAD: Vague, too broad, multiple concerns
"Improve the API security and performance"
```

### 2. Provide Context When Available
```typescript
context: {
  files: ["src/auth", "src/middleware"],
  tests: ["tests/auth.test.ts"],
  teamExpertise: ["backend-developer", "security-specialist"],
  timeConstraint: "4h",
}
```

### 3. Cache Effectively
```typescript
// First call: skipCache=false (default)
const firstRun = await tasks.trigger("cfn-thinking-decomposer", {
  taskDescription: "...",
});

// Repeat: Uses cache automatically
const secondRun = await tasks.trigger("cfn-thinking-decomposer", {
  taskDescription: "...", // Same description = cache hit
});
```

### 4. Monitor Complexity
- Simple tasks: Single agent can execute
- Moderate tasks: Parallel agents with minimal coordination
- Complex tasks: Use recommended team size from result

### 5. Security-Critical Tasks
- Always review if `requiresSecurityReview: true`
- Ensure security-specialist in executor types
- Increase validation threshold for security validators

## Examples

### Example 1: Simple API Endpoint

**Input:**
```typescript
{
  taskDescription: "Create a GET /users endpoint that returns all users from database",
  workDir: "/workspace/api",
}
```

**Output (example):**
```json
{
  "microTasks": [
    {
      "id": "task-1",
      "description": "Define User type with TypeScript interface",
      "executorType": "typescript-specialist",
      "complexity": "simple",
      "estimatedLines": 15,
      "dependsOn": []
    },
    {
      "id": "task-2",
      "description": "Add getUsersHandler function to fetch users from database",
      "executorType": "backend-developer",
      "complexity": "simple",
      "estimatedLines": 20,
      "dependsOn": ["task-1"]
    },
    {
      "id": "task-3",
      "description": "Register GET /users route handler in Express app",
      "executorType": "backend-developer",
      "complexity": "simple",
      "estimatedLines": 10,
      "dependsOn": ["task-2"]
    }
  ],
  "executionPlan": {
    "phases": [
      {
        "id": "phase-1",
        "parallel": ["task-1"],
        "estimatedDuration": 5,
        "description": "Type definitions"
      },
      {
        "id": "phase-2",
        "sequential": ["task-2", "task-3"],
        "estimatedDuration": 10,
        "description": "Implementation and routing"
      }
    ],
    "estimatedDuration": 15,
    "recommendedTeamSize": 2,
    "parallelizable": ["task-1"]
  },
  "metadata": {
    "complexity": "simple",
    "riskLevel": "low",
    "requiresSecurityReview": false,
    "requiresPerformanceReview": false
  }
}
```

### Example 2: Security-Critical Authentication

**Input:**
```typescript
{
  taskDescription: "Implement OAuth2 authentication flow with JWT tokens, refresh token rotation, and PKCE support",
  workDir: "/workspace/auth",
  context: {
    teamExpertise: ["backend-developer", "security-specialist"],
    timeConstraint: "8h",
  }
}
```

**Output (complexity/risk detection):**
```json
{
  "microTasks": [
    // 6-8 micro-tasks for each atomic OAuth2 concern
  ],
  "metadata": {
    "complexity": "complex",
    "riskLevel": "high",
    "requiresSecurityReview": true,
    "requiresPerformanceReview": false
  }
}
```

## Future Enhancements

### Planned Features
1. **Multi-model support**: Claude Opus, GPT-4, Gemini reasoning
2. **Adaptive confidence**: Learn from execution outcomes
3. **Incremental decomposition**: Handle task clarification
4. **Cost prediction**: Accurate budget estimation
5. **Team recommendations**: Suggest best team composition
6. **Historical tracking**: Learn from past decompositions

### Experimental
1. **Parallel thinking**: Multiple reasoning paths, consensus
2. **Interactive refinement**: Ask executor for clarification
3. **Continuous optimization**: Improve decompositions over time

## References

- **Cerebras API**: https://docs.cerebras.ai/
- **Thinking Models**: Qwen-3-235B reasoning capabilities
- **CFN Loop**: Task decomposition for Loop 3 (Implementation)
- **MDAP**: Multi-Decision Adaptive Planning framework
- **Atomicity**: Constraints for T1 model execution

---

**Version**: 2.0.0
**Last Updated**: 2025-11-28
**Status**: Production Ready
