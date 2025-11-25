# CFN Loop + Trigger.dev v4 Integration Plan

**Date**: 2025-11-24
**Status**: Planning
**Goal**: Run real CFN Loop agents within Trigger.dev that can work on workspace files and use Claude Code

---

## Executive Summary

Integrate CFN Loop agent orchestration into Trigger.dev v4 self-hosted infrastructure, enabling:
- Parallel agent execution via Trigger.dev tasks
- Claude Code CLI invocation from tasks
- Full workspace file access
- Native coordination replacing Redis

---

## Architecture

### Current State (Validated)
- Trigger.dev v4 self-hosted: 9 Docker containers running
- Stress test passed: 100 parallel tasks executed successfully
- Dev mode: Tasks run locally with filesystem access

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Trigger.dev v4 Self-Hosted (http://localhost:8030)              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ cfn-orchestrator (coordinator task)                      │   │
│  │                                                          │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ LOOP 3: Implementers (parallel batch)              │ │   │
│  │  │  ├── cfn-implementer (typescript-specialist)       │ │   │
│  │  │  ├── cfn-implementer (backend-developer)           │ │   │
│  │  │  └── cfn-implementer (tester)                      │ │   │
│  │  │       ↓                                             │ │   │
│  │  │  [Each spawns Claude Code CLI → modifies files]    │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │                         ↓                                │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ GATE CHECK: cfn-test-runner                        │ │   │
│  │  │  └── Runs: npm test / tsc --noEmit / custom cmd    │ │   │
│  │  │  └── Returns: pass rate (0.0 - 1.0)                │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │                         ↓                                │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ LOOP 2: Validators (parallel batch, if gate pass)  │ │   │
│  │  │  ├── cfn-validator (code-reviewer)                 │ │   │
│  │  │  ├── cfn-validator (security-specialist)           │ │   │
│  │  │  └── cfn-validator (cto-agent)                     │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  │                         ↓                                │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │ PRODUCT OWNER: cfn-product-owner                   │ │   │
│  │  │  └── Decision: PROCEED | ITERATE | ABORT           │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Workspace: /path/to/project (mounted via dev mode)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Claude Code CLI POC (1-2 hours)

**Goal**: Prove a Trigger.dev task can spawn Claude Code CLI and modify files

**Tasks**:
1. Check Claude Code CLI flags (`npx claude --help`)
2. Install `execa` dependency for process spawning
3. Create `claude-agent.ts` POC task
4. Test: trigger task to modify a real file
5. Verify file was changed

**POC Task Definition**:
```typescript
// src/trigger/claude-agent.ts
import { task } from "@trigger.dev/sdk/v3";
import { execa } from "execa";

export const claudeAgentTask = task({
  id: "claude-agent",
  retry: { maxAttempts: 1 },
  run: async (payload: {
    prompt: string;
    workDir: string;
    agentType?: string;
    timeout?: number;
  }) => {
    const timeout = payload.timeout || 300000; // 5 min default

    const args = ["claude", "-p", payload.prompt, "--yes"];
    if (payload.agentType) {
      args.push("--allowedTools", "Read,Write,Edit,Bash,Glob,Grep");
    }

    try {
      const result = await execa("npx", args, {
        cwd: payload.workDir,
        timeout,
        env: { ...process.env },
      });

      return {
        success: true,
        output: result.stdout,
        exitCode: result.exitCode,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr,
      };
    }
  },
});
```

**Success Criteria**:
- Task completes without error
- Claude Code modifies target file
- Output captured in task result

---

### Phase 2: CFN Implementer Task (2-3 hours)

**Goal**: Create production-ready implementer task with agent profiles

**Tasks**:
1. Map agent types to .claude/agents/* profiles
2. Handle long-running tasks (extend timeout)
3. Parse Claude Code output for structured results
4. Track files modified

**Task Definition**:
```typescript
// src/trigger/cfn-implementer.ts
import { task } from "@trigger.dev/sdk/v3";
import { execa } from "execa";

export interface ImplementerPayload {
  taskDescription: string;
  agentType: string;  // e.g., "typescript-specialist", "backend-developer"
  workDir: string;
  iteration: number;
  taskId: string;
}

export interface ImplementerResult {
  success: boolean;
  agentType: string;
  filesModified: string[];
  output: string;
  duration: number;
  error?: string;
}

export const cfnImplementerTask = task({
  id: "cfn-implementer",
  retry: { maxAttempts: 2 },
  run: async (payload: ImplementerPayload): Promise<ImplementerResult> => {
    const startTime = Date.now();

    const prompt = `
You are a ${payload.agentType} agent working on iteration ${payload.iteration}.

TASK: ${payload.taskDescription}

INSTRUCTIONS:
1. Analyze the codebase in ${payload.workDir}
2. Implement the required changes
3. List all files you modified at the end

Do not ask questions - make reasonable decisions and proceed.
`;

    try {
      const result = await execa("npx", [
        "claude",
        "-p", prompt,
        "--yes",
        "--dangerously-skip-permissions"
      ], {
        cwd: payload.workDir,
        timeout: 600000, // 10 min
        env: { ...process.env },
      });

      // Parse output for modified files
      const filesModified = parseModifiedFiles(result.stdout);

      return {
        success: true,
        agentType: payload.agentType,
        filesModified,
        output: result.stdout,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        agentType: payload.agentType,
        filesModified: [],
        output: error.stdout || "",
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  },
});

function parseModifiedFiles(output: string): string[] {
  // Parse Claude Code output for file modifications
  const filePattern = /(?:wrote|edited|created|modified)\s+[`"]?([^\s`"]+)[`"]?/gi;
  const matches = output.matchAll(filePattern);
  return [...new Set([...matches].map(m => m[1]))];
}
```

---

### Phase 3: CFN Orchestrator Task (3-4 hours)

**Goal**: Full CFN Loop coordination via Trigger.dev

**Task Definition**:
```typescript
// src/trigger/cfn-orchestrator.ts
import { task, tasks } from "@trigger.dev/sdk/v3";
import { cfnImplementerTask, ImplementerResult } from "./cfn-implementer.js";
import { cfnValidatorTask, ValidatorResult } from "./cfn-validator.js";
import { cfnTestRunnerTask } from "./cfn-test-runner.js";

type Mode = "mvp" | "standard" | "enterprise";

const MODE_CONFIG = {
  mvp: { gateThreshold: 0.70, consensusThreshold: 0.80, maxIterations: 5, validators: 2 },
  standard: { gateThreshold: 0.95, consensusThreshold: 0.90, maxIterations: 10, validators: 3 },
  enterprise: { gateThreshold: 0.98, consensusThreshold: 0.95, maxIterations: 15, validators: 5 },
};

export interface OrchestratorPayload {
  taskDescription: string;
  workDir: string;
  mode: Mode;
  testCommand?: string;
  implementerAgents?: string[];
  validatorAgents?: string[];
}

export const cfnOrchestratorTask = task({
  id: "cfn-orchestrator",
  retry: { maxAttempts: 1 },
  run: async (payload: OrchestratorPayload) => {
    const config = MODE_CONFIG[payload.mode];
    const taskId = `cfn-${Date.now()}`;
    let iteration = 0;
    let decision: "PROCEED" | "ITERATE" | "ABORT" = "ITERATE";

    const implementerAgents = payload.implementerAgents || [
      "typescript-specialist",
      "backend-developer",
      "tester",
    ];

    const validatorAgents = payload.validatorAgents || [
      "code-reviewer",
      "security-specialist",
    ];

    while (decision === "ITERATE" && iteration < config.maxIterations) {
      iteration++;
      console.log(`=== CFN Loop Iteration ${iteration}/${config.maxIterations} ===`);

      // LOOP 3: Spawn implementers in parallel
      const implementerPayloads = implementerAgents.map(agentType => ({
        payload: {
          taskDescription: payload.taskDescription,
          agentType,
          workDir: payload.workDir,
          iteration,
          taskId,
        },
      }));

      console.log(`Spawning ${implementerPayloads.length} implementers...`);
      const implementerBatch = await tasks.batchTrigger<typeof cfnImplementerTask>(
        "cfn-implementer",
        implementerPayloads
      );

      // Wait for all implementers to complete
      const implementerResults: ImplementerResult[] = [];
      for (const run of implementerBatch.runs ?? []) {
        const result = await tasks.poll<typeof cfnImplementerTask>(run, { pollIntervalMs: 5000 });
        if (result.output) {
          implementerResults.push(result.output);
        }
      }

      console.log(`Implementers completed: ${implementerResults.filter(r => r.success).length}/${implementerResults.length} succeeded`);

      // GATE CHECK: Run tests
      const testResult = await tasks.triggerAndWait<typeof cfnTestRunnerTask>(
        "cfn-test-runner",
        { workDir: payload.workDir, command: payload.testCommand || "npm test" }
      );

      const passRate = testResult.output?.passRate ?? 0;
      console.log(`Gate check: ${(passRate * 100).toFixed(1)}% pass rate (threshold: ${config.gateThreshold * 100}%)`);

      if (passRate < config.gateThreshold) {
        console.log("Gate failed - iterating...");
        continue;
      }

      // LOOP 2: Spawn validators in parallel
      const validatorPayloads = validatorAgents.slice(0, config.validators).map(agentType => ({
        payload: {
          agentType,
          workDir: payload.workDir,
          implementerResults,
          testResult: testResult.output,
          iteration,
        },
      }));

      console.log(`Spawning ${validatorPayloads.length} validators...`);
      const validatorBatch = await tasks.batchTrigger<typeof cfnValidatorTask>(
        "cfn-validator",
        validatorPayloads
      );

      // Collect validator results
      const validatorResults: ValidatorResult[] = [];
      for (const run of validatorBatch.runs ?? []) {
        const result = await tasks.poll<typeof cfnValidatorTask>(run, { pollIntervalMs: 5000 });
        if (result.output) {
          validatorResults.push(result.output);
        }
      }

      // Calculate consensus
      const avgConfidence = validatorResults.reduce((sum, r) => sum + r.confidence, 0) / validatorResults.length;
      console.log(`Validator consensus: ${(avgConfidence * 100).toFixed(1)}% (threshold: ${config.consensusThreshold * 100}%)`);

      // Product Owner decision
      if (avgConfidence >= config.consensusThreshold) {
        decision = "PROCEED";
      } else if (iteration >= config.maxIterations) {
        decision = "ABORT";
      } else {
        decision = "ITERATE";
      }
    }

    return {
      decision,
      iterations: iteration,
      mode: payload.mode,
      taskId,
    };
  },
});
```

---

### Phase 4: Integration & Testing (2-3 hours)

**Goal**: Connect to existing CFN infrastructure

**Tasks**:
1. Create `/cfn-loop-trigger` slash command
2. Add monitoring/logging
3. Test full loop with real task
4. Document usage

---

## Prerequisites

### Environment Variables
```bash
# Required in docker/trigger-dev/.env
ANTHROPIC_API_KEY=sk-ant-...

# Optional for custom routing
ZAI_API_KEY=...
KIMI_API_KEY=...
```

### Dependencies
```bash
cd docker/trigger-dev
npm install execa
```

### Claude Code CLI
```bash
# Verify CLI is available
npx claude --help
```

---

## Trigger.dev vs Redis Coordination

| Feature | Redis (CLI Mode) | Trigger.dev |
|---------|-----------------|-------------|
| Task dispatch | LPUSH/BLPOP | `tasks.batchTrigger()` |
| Wait for completion | INCR counters + polling | `tasks.poll()` / `batchTriggerAndWait()` |
| Error handling | Manual | Built-in retry |
| Task status | Custom Redis keys | Native task states |
| Monitoring | Custom logging | Webapp UI dashboard |
| Scaling | Manual worker management | Supervisor auto-scales |

**Conclusion**: Trigger.dev provides cleaner coordination primitives, replacing Redis entirely for CFN Loop.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| CLI spawning unreliable | Fall back to direct Anthropic SDK |
| Timeout issues | Increase maxDuration in trigger.config.ts |
| File permissions | Verify dev mode runs with correct user |
| Output parsing fails | Add structured output markers to prompts |

---

## Success Criteria

1. **POC Success**: Single task spawns Claude Code, modifies file
2. **Integration Success**: Full CFN Loop completes with PROCEED decision
3. **Scale Success**: 10+ parallel implementers execute without issues
4. **Production Ready**: Monitoring, logging, error handling complete

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: POC | 1-2 hours | Claude Code CLI available |
| Phase 2: Implementer | 2-3 hours | Phase 1 complete |
| Phase 3: Orchestrator | 3-4 hours | Phase 2 complete |
| Phase 4: Integration | 2-3 hours | Phase 3 complete |
| **Total** | **8-12 hours** | |

---

## Next Steps

1. Check Claude Code CLI flags: `npx claude --help`
2. Install execa: `npm install execa`
3. Create claude-agent.ts POC
4. Test with simple file modification task

---

**Status**: Ready for implementation
