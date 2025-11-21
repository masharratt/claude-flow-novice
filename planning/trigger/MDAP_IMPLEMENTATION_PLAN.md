# MDAP Integration Implementation Plan

**Version:** 1.0.0
**Status:** Planning
**Dependencies:** Trigger.dev, CFN Loop v3, Playbook System

---

## Executive Summary

Integrate Massively Decomposed Agentic Processes (MDAP) into CFN Loop using Trigger.dev as the execution layer. Key features:
- 5-tier model escalation on failure
- Full metrics/eval tracking
- Speed vs cost weighting system
- Red-flagging and test-as-voter validation

---

## 1. Model Escalation Tiers

### Tier Configuration

| Tier | Model | Cost/1M tokens | Latency | Use Case |
|------|-------|----------------|---------|----------|
| T1 | `haiku` | $0.25 | ~500ms | Trivial: renames, single-line edits |
| T2 | `gpt-4.1-mini` | $0.40 | ~800ms | Simple: function edits, add params |
| T3 | `gpt-4.1` | $2.00 | ~1.2s | Medium: multi-function, refactors |
| T4 | `sonnet` | $3.00 | ~1.5s | Complex: architecture, security |
| T5 | `opus` | $15.00 | ~3s | Critical: core logic, escalation ceiling |

### Escalation Rules

```typescript
interface EscalationConfig {
  maxAttemptsPerTier: number;  // Default: 2
  escalationTriggers: string[];  // ["test_fail", "red_flag", "timeout"]
  skipTiers: boolean;  // Jump T1→T4 for known complex patterns
  cooldown: number;  // ms between retries at same tier
}

const defaultEscalation: EscalationConfig = {
  maxAttemptsPerTier: 2,
  escalationTriggers: ["test_fail", "red_flag", "syntax_error"],
  skipTiers: false,
  cooldown: 100
};
```

### Escalation Flow

```
T1 (haiku) → fail → retry T1 → fail →
T2 (mini)  → fail → retry T2 → fail →
T3 (gpt4)  → fail → retry T3 → fail →
T4 (sonnet)→ fail → retry T4 → fail →
T5 (opus)  → fail → ABORT with diagnostics
```

---

## 2. Speed vs Cost Weighting System

### Weight Profiles

```typescript
interface TaskProfile {
  name: string;
  speedWeight: number;     // 0.0 - 1.0
  costWeight: number;      // 0.0 - 1.0 (speedWeight + costWeight = 1.0)
  maxLatencyMs: number;    // Hard ceiling
  maxCostUsd: number;      // Hard ceiling
  parallelism: number;     // Max concurrent micro-tasks
  startTier: 1 | 2 | 3 | 4 | 5;  // Skip cheap tiers for speed
}

const profiles: Record<string, TaskProfile> = {
  "realtime": {
    name: "Real-time (speed priority)",
    speedWeight: 0.9,
    costWeight: 0.1,
    maxLatencyMs: 5000,
    maxCostUsd: 1.00,
    parallelism: 10,
    startTier: 3  // Skip haiku/mini, start at gpt-4.1
  },
  "balanced": {
    name: "Balanced",
    speedWeight: 0.5,
    costWeight: 0.5,
    maxLatencyMs: 30000,
    maxCostUsd: 0.25,
    parallelism: 5,
    startTier: 1
  },
  "budget": {
    name: "Budget (cost priority)",
    speedWeight: 0.1,
    costWeight: 0.9,
    maxLatencyMs: 120000,
    maxCostUsd: 0.05,
    parallelism: 2,
    startTier: 1
  },
  "critical": {
    name: "Critical (accuracy priority)",
    speedWeight: 0.3,
    costWeight: 0.2,
    // Implicit: accuracy weight = 0.5
    maxLatencyMs: 60000,
    maxCostUsd: 2.00,
    parallelism: 3,
    startTier: 4  // Start at sonnet for critical
  }
};
```

### Dynamic Tier Selection

```typescript
function selectStartTier(
  profile: TaskProfile,
  complexity: "trivial" | "simple" | "medium" | "complex" | "critical",
  playbook: PlaybookEntry | null
): number {
  // 1. Playbook recommendation (historical success)
  if (playbook?.recommended_tier) {
    return playbook.recommended_tier;
  }

  // 2. Complexity-based default
  const complexityTier = {
    trivial: 1,
    simple: 1,
    medium: 2,
    complex: 3,
    critical: 4
  }[complexity];

  // 3. Apply profile constraint
  const profileTier = profile.startTier;

  // 4. Speed pressure: if maxLatency tight, skip cheap tiers
  const speedPressure = profile.maxLatencyMs < 10000 ? 2 : 0;

  return Math.max(complexityTier, profileTier) + speedPressure;
}
```

---

## 3. Metrics & Eval Tracking

### Database Schema

```sql
-- Micro-task execution records
CREATE TABLE mdap_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,           -- Parent CFN task
  micro_task_id TEXT NOT NULL,     -- Individual micro-task

  -- Execution context
  profile TEXT NOT NULL,           -- realtime, balanced, budget, critical
  complexity TEXT NOT NULL,        -- trivial, simple, medium, complex, critical

  -- Model progression
  attempts JSONB NOT NULL,         -- [{tier: 1, model: "haiku", result: "fail", ...}]
  final_tier INT NOT NULL,
  final_model TEXT NOT NULL,

  -- Outcomes
  success BOOLEAN NOT NULL,
  red_flagged BOOLEAN DEFAULT FALSE,
  escalation_count INT DEFAULT 0,

  -- Timing
  total_latency_ms INT NOT NULL,
  per_tier_latency JSONB,          -- {1: 450, 2: 820, ...}

  -- Cost
  total_cost_usd DECIMAL(10,6) NOT NULL,
  per_tier_cost JSONB,             -- {1: 0.0001, 2: 0.0003, ...}
  tokens_input INT,
  tokens_output INT,

  -- Quality signals
  test_pass_rate DECIMAL(3,2),
  diff_size_lines INT,
  complexity_score DECIMAL(3,2),

  -- Metadata
  prompt_hash TEXT,                -- For prompt A/B testing
  context_size_tokens INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mdap_task ON mdap_executions(task_id);
CREATE INDEX idx_mdap_profile ON mdap_executions(profile);
CREATE INDEX idx_mdap_model ON mdap_executions(final_model);
CREATE INDEX idx_mdap_success ON mdap_executions(success);

-- Aggregated model performance
CREATE TABLE mdap_model_stats (
  model TEXT NOT NULL,
  complexity TEXT NOT NULL,
  profile TEXT NOT NULL,

  total_attempts INT DEFAULT 0,
  success_count INT DEFAULT 0,
  success_rate DECIMAL(5,4),

  avg_latency_ms INT,
  p50_latency_ms INT,
  p95_latency_ms INT,

  avg_cost_usd DECIMAL(10,6),
  total_cost_usd DECIMAL(12,4),

  avg_escalations DECIMAL(3,2),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (model, complexity, profile)
);

-- Prompt effectiveness tracking
CREATE TABLE mdap_prompt_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash TEXT UNIQUE NOT NULL,
  prompt_template TEXT NOT NULL,

  -- A/B test results
  total_uses INT DEFAULT 0,
  success_rate DECIMAL(5,4),
  avg_tier_required DECIMAL(3,2),
  avg_cost_usd DECIMAL(10,6),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  retired_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- Goal pattern effectiveness
CREATE TABLE mdap_goal_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_pattern TEXT NOT NULL,      -- Regex or embedding
  goal_keywords TEXT[],

  -- Learned optimal config
  recommended_profile TEXT,
  recommended_start_tier INT,
  recommended_parallelism INT,

  -- Performance data
  sample_count INT DEFAULT 0,
  avg_success_rate DECIMAL(5,4),
  avg_latency_ms INT,
  avg_cost_usd DECIMAL(10,6),

  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Metrics Collection

```typescript
interface ExecutionMetrics {
  // Collected per micro-task
  taskId: string;
  microTaskId: string;
  profile: string;
  complexity: string;

  attempts: {
    tier: number;
    model: string;
    result: "success" | "fail" | "red_flag" | "timeout";
    latencyMs: number;
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    errorType?: string;
  }[];

  finalOutcome: {
    success: boolean;
    finalTier: number;
    totalLatencyMs: number;
    totalCostUsd: number;
    testPassRate: number;
    diffSizeLines: number;
  };

  promptHash: string;
  contextSizeTokens: number;
}

// Collection hook in Trigger.dev task
async function recordMetrics(metrics: ExecutionMetrics): Promise<void> {
  await db.mdapExecutions.insert(metrics);
  await updateModelStats(metrics);
  await updateGoalPatterns(metrics);
}
```

---

## 4. Eval System

### Eval Dimensions

```typescript
interface EvalConfig {
  dimensions: {
    speed: {
      weight: number;
      metric: "total_latency_ms";
      target: number;  // ms
      scoring: "lower_is_better";
    };
    cost: {
      weight: number;
      metric: "total_cost_usd";
      target: number;  // USD
      scoring: "lower_is_better";
    };
    accuracy: {
      weight: number;
      metric: "test_pass_rate";
      target: number;  // 0-1
      scoring: "higher_is_better";
    };
    efficiency: {
      weight: number;
      metric: "escalation_count";
      target: number;  // 0
      scoring: "lower_is_better";
    };
  };
}

function computeEvalScore(
  metrics: ExecutionMetrics,
  config: EvalConfig
): number {
  let score = 0;

  for (const [dim, cfg] of Object.entries(config.dimensions)) {
    const value = metrics.finalOutcome[cfg.metric];
    const normalized = cfg.scoring === "lower_is_better"
      ? Math.max(0, 1 - (value / cfg.target))
      : Math.min(1, value / cfg.target);
    score += normalized * cfg.weight;
  }

  return score;  // 0-1, higher is better
}
```

### Eval Reports

```typescript
interface EvalReport {
  period: { start: Date; end: Date };

  // Overall performance
  totalTasks: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;

  // By profile
  byProfile: Record<string, {
    tasks: number;
    successRate: number;
    avgLatency: number;
    avgCost: number;
    hitLatencyTarget: number;  // % within maxLatencyMs
    hitCostTarget: number;     // % within maxCostUsd
  }>;

  // By model
  byModel: Record<string, {
    attempts: number;
    successRate: number;
    avgLatency: number;
    avgCost: number;
    escalationSource: number;  // Times this model triggered escalation
    escalationTarget: number;  // Times escalated TO this model
  }>;

  // By complexity
  byComplexity: Record<string, {
    tasks: number;
    optimalTier: number;       // Most successful starting tier
    avgEscalations: number;
  }>;

  // Prompt effectiveness
  promptRankings: {
    promptHash: string;
    uses: number;
    successRate: number;
    avgTier: number;
  }[];

  // Recommendations
  recommendations: {
    type: "tier_adjustment" | "prompt_change" | "profile_update";
    description: string;
    expectedImprovement: number;
  }[];
}
```

### A/B Testing Framework

```typescript
interface ABTest {
  id: string;
  name: string;
  status: "running" | "concluded";

  variants: {
    control: { config: Partial<EscalationConfig> };
    treatment: { config: Partial<EscalationConfig> };
  };

  allocation: number;  // % to treatment (0-100)

  metrics: {
    control: { n: number; successRate: number; avgCost: number; avgLatency: number };
    treatment: { n: number; successRate: number; avgCost: number; avgLatency: number };
  };

  significance: {
    pValue: number;
    confident: boolean;  // p < 0.05
    winner: "control" | "treatment" | "inconclusive";
  };
}
```

---

## 5. Trigger.dev Task Implementation

### Core Micro-Task

```typescript
// trigger/tasks/mdap-micro.ts
import { task } from "@trigger.dev/sdk/v3";

const MODEL_TIERS = ["haiku", "gpt-4.1-mini", "gpt-4.1", "sonnet", "opus"];

export const mdapMicroTask = task({
  id: "mdap-micro-task",
  retry: { maxAttempts: 0 },  // We handle retries internally for metrics

  run: async (payload: {
    microTaskId: string;
    taskId: string;
    subtask: SubtaskDefinition;
    context: CodeContext;
    profile: TaskProfile;
    escalationConfig: EscalationConfig;
  }) => {
    const metrics: ExecutionMetrics = {
      taskId: payload.taskId,
      microTaskId: payload.microTaskId,
      profile: payload.profile.name,
      complexity: payload.subtask.complexity,
      attempts: [],
      finalOutcome: null,
      promptHash: hashPrompt(payload.subtask.prompt),
      contextSizeTokens: countTokens(payload.context)
    };

    let currentTier = selectStartTier(
      payload.profile,
      payload.subtask.complexity,
      await queryPlaybook(payload.subtask.description)
    );

    while (currentTier <= 5) {
      const model = MODEL_TIERS[currentTier - 1];
      let attemptsAtTier = 0;

      while (attemptsAtTier < payload.escalationConfig.maxAttemptsPerTier) {
        const startTime = Date.now();

        try {
          // 1. Generate patch
          const { patch, tokensIn, tokensOut, costUsd } = await generatePatch(
            payload.subtask,
            payload.context,
            model
          );

          const latencyMs = Date.now() - startTime;

          // 2. Red-flag check
          const redFlagResult = redFlagCheck(patch);
          if (redFlagResult.flagged) {
            metrics.attempts.push({
              tier: currentTier,
              model,
              result: "red_flag",
              latencyMs,
              costUsd,
              tokensIn,
              tokensOut,
              errorType: redFlagResult.reason
            });
            attemptsAtTier++;
            continue;
          }

          // 3. Test as voter
          const testResult = await runImpactedTests(patch);

          if (testResult.pass) {
            // Success!
            metrics.attempts.push({
              tier: currentTier,
              model,
              result: "success",
              latencyMs,
              costUsd,
              tokensIn,
              tokensOut
            });

            metrics.finalOutcome = {
              success: true,
              finalTier: currentTier,
              totalLatencyMs: sumLatency(metrics.attempts),
              totalCostUsd: sumCost(metrics.attempts),
              testPassRate: testResult.passRate,
              diffSizeLines: patch.linesChanged
            };

            await recordMetrics(metrics);
            return { success: true, patch, metrics };
          }

          // Test failed
          metrics.attempts.push({
            tier: currentTier,
            model,
            result: "fail",
            latencyMs,
            costUsd,
            tokensIn,
            tokensOut,
            errorType: "test_failure"
          });
          attemptsAtTier++;

        } catch (error) {
          metrics.attempts.push({
            tier: currentTier,
            model,
            result: "fail",
            latencyMs: Date.now() - startTime,
            costUsd: 0,
            tokensIn: 0,
            tokensOut: 0,
            errorType: error.message
          });
          attemptsAtTier++;
        }

        // Check budget/time constraints
        if (sumCost(metrics.attempts) >= payload.profile.maxCostUsd) {
          throw new BudgetExceededError(metrics);
        }
        if (sumLatency(metrics.attempts) >= payload.profile.maxLatencyMs) {
          throw new LatencyExceededError(metrics);
        }
      }

      // Escalate to next tier
      currentTier++;
    }

    // All tiers exhausted
    metrics.finalOutcome = {
      success: false,
      finalTier: 5,
      totalLatencyMs: sumLatency(metrics.attempts),
      totalCostUsd: sumCost(metrics.attempts),
      testPassRate: 0,
      diffSizeLines: 0
    };

    await recordMetrics(metrics);
    throw new AllTiersExhaustedError(metrics);
  }
});
```

### MDAP Orchestrator

```typescript
// trigger/tasks/mdap-orchestrator.ts
export const mdapOrchestrator = task({
  id: "mdap-orchestrator",

  run: async (payload: {
    taskId: string;
    description: string;
    profile: string;
    codebase: CodebaseContext;
  }) => {
    const profile = profiles[payload.profile];

    // 1. Decompose with strong model (one call)
    const subtasks = await decomposeTask(payload.description, payload.codebase);

    // 2. Build dependency DAG
    const dag = buildDependencyGraph(subtasks);

    // 3. Execute in topological batches
    const results: PatchResult[] = [];

    for (const batch of dag.batches) {
      // Parallel execution within batch
      const batchResults = await Promise.all(
        batch.map(subtask =>
          mdapMicroTask.triggerAndWait({
            microTaskId: `${payload.taskId}-${subtask.id}`,
            taskId: payload.taskId,
            subtask,
            context: extractContext(payload.codebase, subtask),
            profile,
            escalationConfig: defaultEscalation
          })
        )
      );

      // Apply successful patches before next batch
      for (const result of batchResults) {
        if (result.success) {
          await applyPatch(result.patch);
          results.push(result);
        }
      }
    }

    // 4. Return aggregated results
    return {
      taskId: payload.taskId,
      success: results.every(r => r.success),
      patches: results.map(r => r.patch),
      totalCost: results.reduce((sum, r) => sum + r.metrics.finalOutcome.totalCostUsd, 0),
      totalLatency: results.reduce((max, r) => Math.max(max, r.metrics.finalOutcome.totalLatencyMs), 0)
    };
  }
});
```

---

## 6. Integration with CFN Loop

### Modified Loop 3 Agent

```typescript
// Loop 3 now uses MDAP internally
export const cfnLoop3Agent = task({
  id: "cfn-loop3-mdap",

  run: async (payload: { task: string; profile: string }) => {
    // Use MDAP orchestrator instead of single-shot generation
    const result = await mdapOrchestrator.triggerAndWait({
      taskId: generateTaskId(),
      description: payload.task,
      profile: payload.profile,
      codebase: await loadCodebaseContext()
    });

    // Run full test suite for Loop 3 gate
    const testResults = await runFullTestSuite();

    return {
      success: result.success && testResults.passRate >= 0.95,
      passRate: testResults.passRate,
      cost: result.totalCost,
      latency: result.totalLatency,
      patches: result.patches
    };
  }
});
```

### Playbook Integration

```typescript
// After successful CFN Loop completion, update playbook with MDAP learnings
async function updatePlaybookWithMdapLearnings(
  taskId: string,
  taskDescription: string
): Promise<void> {
  // Get all micro-task metrics for this task
  const metrics = await db.mdapExecutions.findMany({ where: { taskId } });

  // Compute optimal configurations
  const optimalStartTier = mode(metrics.map(m => m.final_tier - m.escalation_count));
  const optimalProfile = mostSuccessful(metrics, "profile");
  const avgCost = mean(metrics.map(m => m.total_cost_usd));

  // Update playbook
  await updatePlaybook({
    taskPattern: taskDescription,
    mdapConfig: {
      recommendedStartTier: optimalStartTier,
      recommendedProfile: optimalProfile,
      expectedCost: avgCost,
      sampleCount: metrics.length
    }
  });
}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Trigger.dev self-hosted or cloud
- [ ] Create database schema for metrics
- [ ] Implement basic 5-tier model selection
- [ ] Build red-flag detection system

### Phase 2: Core MDAP (Week 3-4)
- [ ] Implement micro-task decomposition
- [ ] Build DAG scheduler for parallel execution
- [ ] Implement test-as-voter validation
- [ ] Create escalation state machine

### Phase 3: Profiles & Weighting (Week 5)
- [ ] Implement 4 task profiles (realtime, balanced, budget, critical)
- [ ] Build dynamic tier selection based on constraints
- [ ] Add budget/latency circuit breakers

### Phase 4: Metrics & Eval (Week 6-7)
- [ ] Complete metrics collection pipeline
- [ ] Build eval scoring system
- [ ] Create dashboard for performance analysis
- [ ] Implement A/B testing framework

### Phase 5: CFN Integration (Week 8)
- [ ] Integrate MDAP into Loop 3 agents
- [ ] Update playbook system with MDAP learnings
- [ ] Add department-level queue isolation
- [ ] Production rollout

---

## 8. Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Success rate (budget profile) | ≥95% | % tasks completing successfully |
| Avg cost (budget profile) | ≤$0.05 | Per micro-task average |
| Avg latency (realtime profile) | ≤5s | 95th percentile |
| Escalation rate | ≤20% | % tasks requiring tier upgrade |
| T1 resolution rate | ≥60% | % tasks solved at haiku tier |

---

## 9. Open Questions

1. **Decomposition quality**: How to ensure task decomposition is optimal? May need meta-learning.
2. **Context window management**: Large codebases may exceed cheap model context limits.
3. **Correlated errors**: Same bug pattern may fail across all tiers - need diverse prompting?
4. **Cold start**: No playbook data initially - how aggressive should default escalation be?
5. **Cost attribution**: How to allocate shared infrastructure costs to department budgets?

---

## 10. References

- [MDAP Paper](https://arxiv.org/pdf/2511.09030) - Solving a Million-Step LLM Task with Zero Errors
- [Trigger.dev Docs](https://trigger.dev/docs)
- CFN Loop Architecture: `docs/CFN_LOOP_ARCHITECTURE.md`
- Playbook System: `.claude/skills/cfn-playbook/SKILL.md`
