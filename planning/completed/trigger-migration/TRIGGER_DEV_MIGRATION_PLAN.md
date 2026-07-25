# Trigger.dev Migration Plan

## Executive Summary

Migrate away from Trigger.dev in CFN and Math Intelligence Platform, consolidate infrastructure to SEO Intelligence Platform where it provides genuine value.

**Total Effort**: ~3-4 days
**Disk Space Recovered**: ~302MB (trigger-dev-v4 infrastructure)
**Code Reduction**: ~3000 lines removed from CFN

---

## Phase 1: Extract Core Logic from Trigger.dev Tasks (Day 1)

### 1.1 Create Local MDAP Library

Extract the valuable AI logic from Trigger.dev task wrappers into standalone modules.

**Source files to extract from:**
```
docker/trigger-dev/src/trigger/cfn-architecture-decomposer.ts (447 lines)
docker/trigger-dev/src/trigger/cfn-testing-decomposer.ts (274 lines)
docker/trigger-dev/src/trigger/cfn-performance-decomposer.ts (263 lines)
docker/trigger-dev/src/trigger/cfn-security-decomposer.ts (250 lines)
docker/trigger-dev/src/trigger/cfn-mdap-implementer.ts (1172 lines)
docker/trigger-dev/src/lib/glm-provider.ts (313 lines) - KEEP AS-IS
docker/trigger-dev/src/lib/validation-schemas.ts - KEEP AS-IS
```

**Target structure:**
```
lib/mdap/
├── index.ts                    # Main exports
├── glm-client.ts               # Copy from glm-provider.ts (already standalone)
├── decomposers/
│   ├── architecture.ts         # Extract from cfn-architecture-decomposer.ts
│   ├── testing.ts              # Extract from cfn-testing-decomposer.ts
│   ├── performance.ts          # Extract from cfn-performance-decomposer.ts
│   └── security.ts             # Extract from cfn-security-decomposer.ts
├── implementer.ts              # Extract from cfn-mdap-implementer.ts
├── validation.ts               # Copy from validation-schemas.ts
└── types.ts                    # Shared interfaces
```

**Extraction pattern:**
```typescript
// BEFORE (Trigger.dev wrapped)
import { task } from "@trigger.dev/sdk/v3";

export const cfnArchitectureDecomposerTask = task({
  id: "cfn-architecture-decomposer",
  retry: { maxAttempts: 1 },
  run: async (payload: ArchitectureDecomposerPayload): Promise<ArchitectureAnalysis> => {
    // ... actual logic
  },
});

// AFTER (standalone function)
export async function decomposeArchitecture(
  payload: ArchitectureDecomposerPayload
): Promise<ArchitectureAnalysis> {
  // ... same logic, no task() wrapper
}
```

### 1.2 Create Local Orchestrator

Replace `cfn-orchestrator-v2.ts` (1017 lines) with simple orchestrator (~200 lines).

**New file: `lib/mdap/orchestrator.ts`**

```typescript
import { decomposeArchitecture, decomposeTesting, decomposeSecurity, decomposePerformance } from './decomposers';
import { implement } from './implementer';
import { execSync } from 'child_process';

interface OrchestratorConfig {
  mode: 'mvp' | 'standard' | 'enterprise';
  maxIterations: number;
  testCommand: string;
  workDir: string;
}

const MODE_THRESHOLDS = {
  mvp: { gate: 0.70, consensus: 0.80, maxIterations: 5 },
  standard: { gate: 0.95, consensus: 0.90, maxIterations: 10 },
  enterprise: { gate: 0.98, consensus: 0.95, maxIterations: 15 },
};

export async function orchestrate(taskDescription: string, config: OrchestratorConfig) {
  const thresholds = MODE_THRESHOLDS[config.mode];

  // Phase 1: Decompose (parallel)
  const [arch, testing, security, perf] = await Promise.all([
    decomposeArchitecture({ taskDescription, workDir: config.workDir }),
    decomposeTesting({ taskDescription, workDir: config.workDir }),
    decomposeSecurity({ taskDescription, workDir: config.workDir }),
    decomposePerformance({ taskDescription, workDir: config.workDir }),
  ]);

  // Merge micro-tasks
  const microTasks = mergeMicroTasks([arch, testing, security, perf]);

  // Phase 2: Iterate until gate passes
  for (let iteration = 0; iteration < thresholds.maxIterations; iteration++) {
    console.log(`[orchestrator] Iteration ${iteration + 1}/${thresholds.maxIterations}`);

    // Execute implementations in parallel
    const results = await Promise.all(
      microTasks.map(task => implement({
        taskId: task.id,
        microTaskId: task.id,
        taskDescription: task.description,
        workDir: config.workDir,
        targetFile: task.targetFile,
        language: 'TypeScript',
      }))
    );

    // Gate check: run tests
    const passRate = runGateCheck(config.testCommand, config.workDir);
    console.log(`[orchestrator] Gate check: ${(passRate * 100).toFixed(1)}%`);

    if (passRate >= thresholds.gate) {
      return { success: true, iterations: iteration + 1, passRate };
    }
  }

  return { success: false, iterations: thresholds.maxIterations, reason: 'Max iterations reached' };
}

function runGateCheck(testCommand: string, workDir: string): number {
  try {
    const output = execSync(testCommand, { cwd: workDir, encoding: 'utf8' });
    // Parse test output for pass rate
    return parsePassRate(output);
  } catch (error) {
    return 0;
  }
}

function parsePassRate(output: string): number {
  // Match patterns like "42 passed, 3 failed" or "Tests: 42 passed, 3 failed"
  const match = output.match(/(\d+)\s+passed.*?(\d+)\s+failed/i);
  if (match) {
    const passed = parseInt(match[1]);
    const failed = parseInt(match[2]);
    return passed / (passed + failed);
  }
  return output.includes('passed') ? 1.0 : 0;
}
```

### 1.3 Create Error Fixer Library

Port the OurStories `cerebras-parallel-fixer.ts` patterns to a reusable library.

**Copy from:** `/mnt/c/Users/masha/Documents/ourstories-v2/tools/mdap-error-fixer/src/cerebras-parallel-fixer.ts`

**New file: `lib/mdap/error-fixer.ts`**

```typescript
import { callGLMFast } from './glm-client';

// P0 fixes from lessons learned
const HARD_ERRORS = ['E0382', 'E0499', 'E0515', 'E0597', 'E0506', 'E0502', 'E0507', 'E0521'];
const EASY_ERRORS = ['E0425', 'E0412', 'E0433', 'E0599', 'E0277'];

interface CompilerError {
  code: string;
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
}

interface FixerConfig {
  skipHard?: boolean;      // Skip borrow checker errors
  validate?: boolean;      // Run compiler after fix
  maxConcurrent?: number;  // Parallel fix limit
}

export async function fixErrors(
  errors: Map<string, CompilerError[]>,
  config: FixerConfig = {}
): Promise<Map<string, { success: boolean; content?: string }>> {
  const results = new Map();
  const { skipHard = true, validate = true, maxConcurrent = 5 } = config;

  // Filter out hard errors if requested
  const filteredErrors = skipHard
    ? filterHardErrors(errors)
    : errors;

  // Process in batches
  const entries = [...filteredErrors.entries()];
  for (let i = 0; i < entries.length; i += maxConcurrent) {
    const batch = entries.slice(i, i + maxConcurrent);

    const batchResults = await Promise.all(
      batch.map(([file, fileErrors]) => fixFile(file, fileErrors, validate))
    );

    batch.forEach(([file], idx) => {
      results.set(file, batchResults[idx]);
    });
  }

  return results;
}

async function fixFile(
  filePath: string,
  errors: CompilerError[],
  validate: boolean
): Promise<{ success: boolean; content?: string; error?: string }> {
  const fs = await import('fs');
  const content = fs.readFileSync(filePath, 'utf8');

  // Dynamic context sizing
  const contextSize = getContextSize(errors[0]?.code);
  const context = extractContext(content, errors, contextSize);

  // Build prompt
  const prompt = buildFixPrompt(errors, context, filePath);

  try {
    // Single error per call (P0 fix)
    const response = await callGLMFast(prompt, { maxTokens: 2048 });
    const fixes = parseFixInstructions(response.content);
    const newContent = applyFixes(content, fixes);

    // Validate if requested
    if (validate) {
      const valid = await validateFix(filePath, content, newContent);
      if (!valid) {
        return { success: false, error: 'Validation failed - fix increased errors' };
      }
    }

    return { success: true, content: newContent };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

function getContextSize(errorCode: string): number {
  if (HARD_ERRORS.includes(errorCode)) return 100;
  if (errorCode === 'E0308' || errorCode === 'TS2322') return 50;
  if (EASY_ERRORS.includes(errorCode)) return 20;
  return 15;
}

function filterHardErrors(errors: Map<string, CompilerError[]>): Map<string, CompilerError[]> {
  const filtered = new Map();
  for (const [file, fileErrors] of errors) {
    const easy = fileErrors.filter(e => !HARD_ERRORS.includes(e.code));
    if (easy.length > 0) {
      filtered.set(file, easy);
    }
  }
  return filtered;
}
```

---

## Phase 2: Remove Trigger.dev from CFN (Day 2)

### 2.1 Delete Trigger.dev Infrastructure

```bash
# Remove v4 infrastructure (302MB)
rm -rf docker/trigger-dev-v4/

# Remove task definitions (keep lib/ for now)
rm docker/trigger-dev/src/trigger/cfn-orchestrator.ts
rm docker/trigger-dev/src/trigger/cfn-orchestrator-v2.ts
rm docker/trigger-dev/src/trigger/cfn-async-validator-orchestrator.ts

# Keep these - will be converted to standalone:
# docker/trigger-dev/src/trigger/cfn-*-decomposer.ts
# docker/trigger-dev/src/trigger/cfn-mdap-implementer.ts
```

### 2.2 Update CLI Commands

**File: `.claude/commands/cfn-loop/cfn-loop-cli.md`**

Change from Trigger.dev SDK calls to local orchestrator:

```typescript
// BEFORE
import { tasks, runs } from "@trigger.dev/sdk/v3";
const handle = await tasks.trigger("cfn-orchestrator-v2", payload);
const result = await runs.poll(handle.id);

// AFTER
import { orchestrate } from '../../lib/mdap/orchestrator';
const result = await orchestrate(taskDescription, {
  mode: 'standard',
  maxIterations: 10,
  testCommand: 'npm test',
  workDir: process.cwd(),
});
```

### 2.3 Update Package Dependencies

**File: `package.json`**

```json
{
  "dependencies": {
    // REMOVE
    // "@trigger.dev/sdk": "^4.1.2",

    // KEEP
    "@cerebras/cerebras_cloud_sdk": "^1.0.0"
  }
}
```

### 2.4 Update Environment Variables

**File: `.env.example`**

```bash
# REMOVE
# TRIGGER_API_URL=http://localhost:8030
# TRIGGER_SECRET_KEY=tr_dev_...

# KEEP
CEREBRAS_API_KEY=your-key
ZAI_API_KEY=your-key
```

---

## Phase 3: Remove Trigger.dev from Math Platform (Day 2)

### 3.1 Delete Trigger.dev Directory

```bash
cd /mnt/c/Users/masha/Documents/math-intelligence-platform

# Remove Trigger.dev integration
rm -rf trigger-dev/
```

### 3.2 Keep MDAP Engine As-Is

The Math platform's `MDAPEngine` already uses `Promise.all()` for parallel execution. No changes needed.

```typescript
// Already standalone - no Trigger.dev dependency
// src/mdap/core/mdap-engine.ts
export class MDAPEngine {
  async solve(problem: MathProblem): Promise<Solution> {
    const tasks = await this.decompose(problem);
    const results = await Promise.all(tasks.map(t => this.execute(t)));
    return this.synthesize(results);
  }
}
```

### 3.3 Update Package Dependencies

**File: `package.json`**

```json
{
  "dependencies": {
    // REMOVE
    // "@trigger.dev/sdk": "^4.1.2",
  }
}
```

---

## Phase 4: Migrate Trigger.dev to SEO Platform (Day 3)

### 4.1 Copy Infrastructure

```bash
# Copy v4 infrastructure to SEO platform
cp -r /mnt/c/Users/masha/Documents/claude-flow-novice/docker/trigger-dev-v4 \
      /mnt/c/Users/masha/Documents/seo-intelligence-platform/docker/trigger-dev

# Copy docker-compose files
mkdir -p /mnt/c/Users/masha/Documents/seo-intelligence-platform/docker/trigger-dev/hosting
```

### 4.2 Create SEO-Specific Tasks

**File: `seo-intelligence-platform/src/trigger/firecrawl-batch.ts`**

```typescript
import { task } from "@trigger.dev/sdk/v3";
import { FirecrawlService } from "../lib/firecrawl/firecrawl-service";

export interface BatchScrapePayload {
  urls: string[];
  options?: {
    includeMarkdown?: boolean;
    waitFor?: number;
  };
}

export const firecrawlBatchTask = task({
  id: "firecrawl-batch-scrape",
  retry: { maxAttempts: 3 },

  run: async (payload: BatchScrapePayload) => {
    const service = new FirecrawlService();

    // Process URLs in controlled batches
    const results = [];
    for (const url of payload.urls) {
      try {
        const result = await service.scrapeUrl(url, payload.options);
        results.push({ url, success: true, content: result });
      } catch (error) {
        results.push({ url, success: false, error: (error as Error).message });
      }
    }

    return {
      total: payload.urls.length,
      successful: results.filter(r => r.success).length,
      results
    };
  },
});
```

**File: `seo-intelligence-platform/src/trigger/content-publish.ts`**

```typescript
import { task } from "@trigger.dev/sdk/v3";
import { ContentScheduler } from "../lib/publishing/scheduler";

export interface PublishPayload {
  postId: string;
  scheduledTime: string;
  platform: 'wordpress' | 'medium' | 'custom';
}

export const contentPublishTask = task({
  id: "content-publish",
  retry: { maxAttempts: 3 },

  run: async (payload: PublishPayload) => {
    const scheduler = new ContentScheduler();

    // Wait until scheduled time
    const now = new Date();
    const scheduled = new Date(payload.scheduledTime);
    if (scheduled > now) {
      const delay = scheduled.getTime() - now.getTime();
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Publish
    const result = await scheduler.publish(payload.postId, payload.platform);
    return result;
  },
});
```

**File: `seo-intelligence-platform/src/trigger/rank-tracker.ts`**

```typescript
import { task, schedules } from "@trigger.dev/sdk/v3";
import { RankTracker } from "../lib/monitoring/rank-tracker";

export const dailyRankTrackTask = task({
  id: "daily-rank-track",

  run: async (payload: { keywords: string[]; domains: string[] }) => {
    const tracker = new RankTracker();

    const results = await Promise.all(
      payload.keywords.map(async (keyword) => {
        const ranks = await tracker.checkRanks(keyword, payload.domains);
        return { keyword, ranks };
      })
    );

    // Store results
    await tracker.saveResults(results);

    return { tracked: results.length, timestamp: new Date().toISOString() };
  },
});

// Scheduled version - runs daily at 6 AM
export const scheduledRankTrack = schedules.task({
  id: "scheduled-rank-track",
  cron: "0 6 * * *", // Daily at 6 AM

  run: async () => {
    const tracker = new RankTracker();
    const config = await tracker.getTrackingConfig();

    return dailyRankTrackTask.trigger({
      keywords: config.keywords,
      domains: config.domains,
    });
  },
});
```

### 4.3 Create Trigger.dev Configuration

**File: `seo-intelligence-platform/trigger.config.ts`**

```typescript
import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  project: "seo-intelligence-platform",
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",
  maxDuration: 600, // 10 minutes for long scraping tasks
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000
    },
  },
  dirs: ["./src/trigger"],
};
```

### 4.4 Update SEO Package.json

**File: `seo-intelligence-platform/package.json`**

```json
{
  "dependencies": {
    "@trigger.dev/sdk": "^4.1.2"
  },
  "scripts": {
    "trigger:dev": "npx trigger.dev@latest dev",
    "trigger:deploy": "npx trigger.dev@latest deploy"
  }
}
```

### 4.5 Replace Custom Queue Systems

**Migrate from:**
- `src/lib/automation/workflow-engine.ts` (1059 lines) → Trigger.dev tasks
- `src/lib/automation/triggers.ts` (750 lines) → Trigger.dev schedules
- `src/lib/publishing/scheduler.ts` (1136 lines) → Trigger.dev tasks

**Deprecation strategy:**
1. Create Trigger.dev tasks alongside existing code
2. Add feature flag to route to either implementation
3. Monitor for 1 week
4. Remove legacy queue code

---

## Phase 5: Cleanup and Verification (Day 4)

### 5.1 Verify CFN Works Without Trigger.dev

```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice

# Test local orchestrator
npm run test:mdap

# Test error fixer
node lib/mdap/error-fixer.ts --test

# Test decomposers
node lib/mdap/decomposers/architecture.ts --test
```

### 5.2 Verify Math Platform Works

```bash
cd /mnt/c/Users/masha/Documents/math-intelligence-platform

# Ensure no Trigger.dev imports remain
grep -r "@trigger.dev" src/

# Run tests
npm test
```

### 5.3 Verify SEO Platform Trigger.dev

```bash
cd /mnt/c/Users/masha/Documents/seo-intelligence-platform

# Start Trigger.dev infrastructure
cd docker/trigger-dev/hosting/docker
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d

# Start dev server
cd ../../../..
npx trigger.dev@latest dev

# Test task triggering
npm run test:trigger
```

### 5.4 Final Cleanup

```bash
# CFN - remove empty directories
rm -rf docker/trigger-dev/src/trigger/  # After extracting to lib/mdap/
rm -rf docker/trigger-dev-v4/           # Already done in Phase 2

# Update .gitignore
echo "docker/trigger-dev-v4/" >> .gitignore

# Update documentation
# - Remove Trigger.dev references from CLAUDE.md
# - Update docker/CLAUDE.md
# - Update docker/trigger-dev/CLAUDE.md (or delete)
```

---

## Migration Checklist

### CFN Loop (claude-flow-novice)
- [ ] Extract decomposers to `lib/mdap/decomposers/`
- [ ] Extract implementer to `lib/mdap/implementer.ts`
- [ ] Create local orchestrator `lib/mdap/orchestrator.ts`
- [ ] Port error-fixer from OurStories
- [ ] Delete `docker/trigger-dev-v4/` (302MB)
- [ ] Remove `@trigger.dev/sdk` from package.json
- [ ] Update CLI commands to use local orchestrator
- [ ] Update CLAUDE.md documentation
- [ ] Run tests to verify

### Math Intelligence Platform
- [ ] Delete `trigger-dev/` directory
- [ ] Remove `@trigger.dev/sdk` from package.json
- [ ] Verify MDAP engine works (already standalone)
- [ ] Run tests to verify

### SEO Intelligence Platform
- [ ] Copy Trigger.dev v4 infrastructure from CFN
- [ ] Create `firecrawl-batch` task
- [ ] Create `content-publish` task
- [ ] Create `rank-tracker` task with schedule
- [ ] Add `@trigger.dev/sdk` to package.json
- [ ] Create `trigger.config.ts`
- [ ] Test all tasks
- [ ] Gradually deprecate custom queue systems

---

## Rollback Plan

If issues arise:

### CFN Rollback
```bash
# Restore from git
git checkout HEAD -- docker/trigger-dev/
git checkout HEAD -- package.json

# Reinstall dependencies
npm install
```

### SEO Rollback
```bash
# Remove Trigger.dev
rm -rf docker/trigger-dev/
rm trigger.config.ts
rm -rf src/trigger/

# Restore package.json
git checkout HEAD -- package.json
npm install
```

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| CFN codebase size | 51K lines | 48K lines | -3K lines |
| Trigger.dev infra (CFN) | 302MB | 0MB | Deleted |
| SEO task throughput | 1x (single process) | 3-5x (workers) | 3x minimum |
| Error fixer reliability | ~70% | ~90% | 85%+ |
| Math platform dependencies | +1 (trigger) | 0 | No Trigger.dev |

---

## Timeline

| Day | Tasks | Owner |
|-----|-------|-------|
| Day 1 | Phase 1: Extract core logic, create lib/mdap/ | Dev |
| Day 2 | Phase 2-3: Remove Trigger.dev from CFN + Math | Dev |
| Day 3 | Phase 4: Migrate Trigger.dev to SEO | Dev |
| Day 4 | Phase 5: Cleanup, verification, documentation | Dev |

**Total: 4 days**

---

*Plan created: 2024-12-07*
*Based on analysis of CFN Loop, SEO Intelligence Platform, and Math Intelligence Platform*
