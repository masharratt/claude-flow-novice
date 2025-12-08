# CFN Loop TypeScript Migration Action Plan
**Version:** 1.0.0
**Date:** 2025-11-19
**Target Duration:** 4 weeks
**Success Threshold:** All critical items complete, backward compatibility maintained

---

## EXECUTIVE SUMMARY

This document provides a detailed action plan to resolve the architectural inefficiencies identified in the CFN Loop orchestration system. The main goal is to eliminate 612 lines of redundant bash wrappers and consolidate TypeScript skills.

**Key Metrics:**
- Reduce bash layer complexity: 612 lines → 0 (via CLI entry)
- Simplify coordinator profile: 283 lines → 100 lines
- Eliminate wrapper redundancy: 3 scripts → 1 CLI
- Convert critical skills: 5 bash skills → TypeScript
- Target test coverage: 90%+ orchestration coverage

---

## QUICK START: CRITICAL PATH (2 Weeks)

If you only have 2 weeks, focus on these high-impact items:

1. **Week 1:**
   - Create `orchestrator-cli.ts` (CLI entry point)
   - Update coordinator to use new CLI
   - Mark old wrappers as deprecated

2. **Week 2:**
   - Convert cfn-product-owner-decision to TypeScript
   - Expand orchestration test coverage
   - Update documentation

---

## DETAILED ACTION PLAN

### PHASE 1: Orchestration CLI Consolidation (Week 1)

#### 1.1: Create Orchestrator CLI Entry Point

**File:** `.claude/skills/cfn-loop-orchestration/src/cli/orchestrator-cli.ts`

**What to build:**
```typescript
// Main CLI entry point for orchestrator
// Replaces: orchestrate.sh, orchestrate-wrapper.sh, helpers/orchestrate-ts.sh

import { parseArgs } from 'util';
import { Orchestrator, OrchestrationConfig, ExecutionMode } from '../orchestrate';
import { logger } from '../utils/logger';

interface CLIOptions {
  taskId: string;
  mode: ExecutionMode;
  maxIterations?: number;
  loop3Agents?: string;
  loop2Agents?: string;
  productOwner?: string;
  successCriteria?: boolean;
}

function parseArguments(): CLIOptions {
  const args = parseArgs({
    options: {
      'task-id': { type: 'string' },
      'mode': { type: 'string' },
      'max-iterations': { type: 'string' },
      'loop3-agents': { type: 'string' },
      'loop2-agents': { type: 'string' },
      'product-owner': { type: 'string' },
      'success-criteria': { type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  });

  // Validation
  if (!args.values['task-id']) {
    throw new Error('--task-id is required');
  }
  
  if (!['mvp', 'standard', 'enterprise'].includes(args.values['mode'] as string)) {
    throw new Error('--mode must be mvp, standard, or enterprise');
  }

  // Return parsed options
  return {
    taskId: args.values['task-id'] as string,
    mode: args.values['mode'] as ExecutionMode,
    maxIterations: args.values['max-iterations'] ? parseInt(args.values['max-iterations'] as string, 10) : 10,
    loop3Agents: args.values['loop3-agents'] as string,
    loop2Agents: args.values['loop2-agents'] as string,
    productOwner: args.values['product-owner'] as string,
    successCriteria: args.values['success-criteria'] as boolean,
  };
}

async function main() {
  try {
    const options = parseArguments();
    
    const orchestrator = new Orchestrator({
      taskId: options.taskId,
      mode: options.mode,
      maxIterations: options.maxIterations || 10,
      loop3Agents: options.loop3Agents?.split(','),
      loop2Agents: options.loop2Agents?.split(','),
      productOwner: options.productOwner,
      successCriteriaEnabled: options.successCriteria !== false,
    });

    const result = await orchestrator.execute();
    
    logger.info('Orchestration complete', { 
      taskId: options.taskId,
      result: result.decision,
      iterations: result.iterations,
    });
    
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    logger.error('Orchestration failed', error);
    process.exit(1);
  }
}

main();
```

**Acceptance Criteria:**
- [ ] CLI parses all required arguments
- [ ] Invalid arguments rejected with clear error messages
- [ ] Passes all orchestration tests
- [ ] Faster than orchestrate-wrapper.sh (measure startup time)
- [ ] Backward compatible with existing orchestrator output

**Estimated Effort:** 2-3 hours

---

#### 1.2: Update Coordinator Profile

**File:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`

**Current (283 lines):**
```bash
# 1. Read environment (20 lines)
# 2. Store context in Redis (30 lines)
# 3. Store success criteria (45 lines)
# 4. Select agents (10 lines)
# 5. Invoke orchestrator (15 lines)
# 6. Documentation (163 lines)
```

**Proposed (150 lines):**
```bash
# 1. Read environment (10 lines)
# 2. Invoke orchestrator CLI (5 lines)
# 3. Documentation (135 lines)

# All Redis storage, agent selection moved to orchestrator
```

**Key Changes:**
- Remove lines 48-92 (Redis context storage - move to orchestrator)
- Remove lines 111-115 (hardcoded agent selection)
- Simplify ORCHESTRATOR_PATH reference
- Update to use: `npx claude-flow-novice orchestrate --task-id ...`

**Acceptance Criteria:**
- [ ] Reduced to ~150 lines
- [ ] All Redis logic moved to orchestrator
- [ ] Dynamic agent selection via orchestrator
- [ ] CLI invocation simplified
- [ ] All existing tests still pass

**Estimated Effort:** 2 hours

---

#### 1.3: Mark Old Wrappers as Deprecated

**Files to deprecate:**
1. `.claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh`
2. `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
3. `.claude/skills/cfn-loop-orchestration/helpers/orchestrate-ts.sh` (optional)

**For each file:**
```bash
#!/bin/bash
# DEPRECATED - Use npx claude-flow-novice orchestrate instead
# This script is maintained for backward compatibility only
# New code should use: npx claude-flow-novice orchestrate --task-id ... --mode ...

echo "⚠️  WARNING: This script is deprecated"
echo "Please use: npx claude-flow-novice orchestrate [options]"
echo ""
echo "This wrapper will be removed in v4.0.0"
exit 1
```

**Add deprecation notice to README:**
```markdown
### Deprecated Scripts
- `orchestrate-wrapper.sh` - Use `npx orchestrate` CLI instead (v3.1+)
- `orchestrate.sh` - Use `npx orchestrate` CLI instead (v3.1+)

All orchestration should use the unified CLI entry point.
```

**Estimated Effort:** 1 hour

---

#### 1.4: Test CLI Entry Point

**File:** `.claude/skills/cfn-loop-orchestration/tests/orchestrator-cli.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import { execSync } from 'child_process';

describe('Orchestrator CLI', () => {
  it('should display help with --help', () => {
    const output = execSync('npx orchestrate --help').toString();
    expect(output).toContain('task-id');
    expect(output).toContain('mode');
  });

  it('should reject missing task-id', () => {
    expect(() => {
      execSync('npx orchestrate --mode standard');
    }).toThrow();
  });

  it('should reject invalid mode', () => {
    expect(() => {
      execSync('npx orchestrate --task-id test --mode invalid');
    }).toThrow();
  });

  it('should accept valid arguments', () => {
    // Mock orchestrator to avoid full execution
    const output = execSync('npx orchestrate --task-id test-123 --mode standard');
    expect(output).toBeDefined();
  });
});
```

**Acceptance Criteria:**
- [ ] All CLI tests pass
- [ ] Error messages are clear
- [ ] Help text is complete
- [ ] Backward compatibility maintained

**Estimated Effort:** 3 hours

---

### PHASE 2: Critical TypeScript Conversions (Week 2)

#### 2.1: Convert cfn-product-owner-decision to TypeScript

**Current:** `.claude/skills/cfn-product-owner-decision/` (4 bash files)
- `execute-decision.sh` - Invoke product owner agent
- `parse-decision.sh` - Parse agent output
- `validate-deliverables.sh` - Verify deliverables

**Proposed:** Create TypeScript skill

**File:** `.claude/skills/cfn-product-owner-decision/src/decision-parser.ts`

```typescript
export type ProductOwnerDecision = 'PROCEED' | 'ITERATE' | 'ABORT';

export interface DecisionResult {
  decision: ProductOwnerDecision;
  reasoning: string;
  actionItems?: string[];
  confidence: number;
}

export function parseDecisionOutput(output: string): DecisionResult {
  // Extract decision from agent output
  // Look for patterns: PROCEED, ITERATE, ABORT
  // Extract confidence score
  // Extract reasoning
  
  const decisionMatch = output.match(/\b(PROCEED|ITERATE|ABORT)\b/);
  const confidenceMatch = output.match(/confidence[:\s]+([0-9.]+)/i);
  
  if (!decisionMatch) {
    throw new Error('Could not parse decision from output');
  }

  return {
    decision: decisionMatch[1] as ProductOwnerDecision,
    reasoning: extractReasoning(output),
    actionItems: extractActionItems(output),
    confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.85,
  };
}

export function validateDecision(decision: DecisionResult): boolean {
  // Validate decision structure
  return ['PROCEED', 'ITERATE', 'ABORT'].includes(decision.decision) &&
         decision.confidence >= 0.0 &&
         decision.confidence <= 1.0;
}
```

**Also create:**
- `src/product-owner-executor.ts` - Execute product owner agent
- `src/deliverable-validator.ts` - Verify deliverable completeness
- `tests/decision-parser.test.ts` - Comprehensive tests

**Acceptance Criteria:**
- [ ] Parse PROCEED/ITERATE/ABORT from output
- [ ] Extract confidence scores
- [ ] Validate deliverable list
- [ ] 90%+ test coverage
- [ ] Used by orchestrator

**Estimated Effort:** 2 days

---

#### 2.2: Expand Orchestration Test Coverage

**Current:** 8 test files, missing integration tests

**Add:**
```typescript
// tests/integration/full-orchestration.test.ts
describe('Full Orchestration Flow', () => {
  it('should complete full CFN Loop (mvp mode)', async () => {
    // Spawn mock Loop 3 agent
    // Spawn mock Loop 2 agent
    // Spawn mock Product Owner
    // Verify decision propagation
  });

  it('should iterate when consensus is low', async () => {
    // Mock consensus < 0.80
    // Verify loop2 iteration triggered
  });

  it('should handle agent timeouts', async () => {
    // Mock agent timeout
    // Verify recovery mechanism
  });
});
```

**Acceptance Criteria:**
- [ ] 3+ integration test suites
- [ ] 90%+ line coverage
- [ ] Mock dependencies working
- [ ] All tests < 5s runtime

**Estimated Effort:** 3 days

---

#### 2.3: Add CLI to Main Package

**File:** `src/cli/commands/orchestrate.ts`

```typescript
// Add orchestrator command to main CLI
// Enables: npx claude-flow-novice orchestrate --task-id ... --mode ...

export async function orchestrateCommand(args: any): Promise<void> {
  // Forward to cfn-loop-orchestration CLI
  // Maintain compatibility with main package
}
```

**Acceptance Criteria:**
- [ ] `npx claude-flow-novice orchestrate` works
- [ ] Help text displays
- [ ] All parameters supported
- [ ] Backward compatible

**Estimated Effort:** 1 day

---

### PHASE 3: Output Processing Consolidation (Week 2-3)

#### 3.1: Consolidate Loop 2 Output Processing

**Current:** `.claude/skills/cfn-loop2-output-processing/` (5 bash files)

**Proposed:** Create unified TypeScript skill at `.claude/skills/cfn-loop-output-processing/`

**File:** `.claude/skills/cfn-loop-output-processing/src/loop2-processor.ts`

```typescript
export interface Loop2Output {
  validatorId: string;
  consensusScore: number;
  feedback: string;
  deliverables: string[];
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: 'critical' | 'warning' | 'info';
  description: string;
  location?: string;
}

export function parseValidatorOutput(output: string): Loop2Output {
  // Extract consensus score
  // Extract feedback
  // Extract validation results
  // Parse deliverables
  
  return {
    validatorId: extractValidatorId(output),
    consensusScore: extractConsensusScore(output),
    feedback: extractFeedback(output),
    deliverables: extractDeliverables(output),
    issues: extractIssues(output),
  };
}

export function aggregateValidatorResults(outputs: Loop2Output[]): {
  averageConsensus: number;
  criticalIssues: ValidationIssue[];
  warningIssues: ValidationIssue[];
} {
  const averageConsensus = outputs.reduce((sum, o) => sum + o.consensusScore, 0) / outputs.length;
  const allIssues = outputs.flatMap(o => o.issues);
  
  return {
    averageConsensus,
    criticalIssues: allIssues.filter(i => i.severity === 'critical'),
    warningIssues: allIssues.filter(i => i.severity === 'warning'),
  };
}
```

**Acceptance Criteria:**
- [ ] Parse all validator output formats
- [ ] Extract consensus scores correctly
- [ ] Aggregate results from multiple validators
- [ ] 90%+ test coverage

**Estimated Effort:** 2 days

---

#### 3.2: Consolidate Loop 3 Output Processing

**Current:** `.claude/skills/cfn-loop3-output-processing/` (6 bash files)

**Proposed:** Extend `.claude/skills/cfn-loop-output-processing/` with Loop 3 processor

**File:** `.claude/skills/cfn-loop-output-processing/src/loop3-processor.ts`

```typescript
export interface Loop3Output {
  agentId: string;
  confidence: number;
  deliverables: Deliverable[];
  status: 'success' | 'partial' | 'failed';
  metadata: Record<string, unknown>;
}

export interface Deliverable {
  name: string;
  type: 'file' | 'test' | 'documentation' | 'other';
  path?: string;
  status: 'created' | 'modified' | 'verified';
}

export function parseWorkerOutput(output: string): Loop3Output {
  // Extract confidence score
  // Extract deliverable list
  // Extract status
  // Parse metadata
  
  return {
    agentId: extractAgentId(output),
    confidence: extractConfidenceScore(output),
    deliverables: extractDeliverables(output),
    status: evaluateStatus(output),
    metadata: extractMetadata(output),
  };
}

export function verifyDeliverables(
  deliverables: Deliverable[],
  expectedFiles: string[]
): { verified: boolean; missing: string[]; extra: string[] } {
  const createdFiles = deliverables
    .filter(d => d.type === 'file' && d.status === 'created')
    .map(d => d.name);
  
  const missing = expectedFiles.filter(f => !createdFiles.includes(f));
  const extra = createdFiles.filter(f => !expectedFiles.includes(f));
  
  return {
    verified: missing.length === 0,
    missing,
    extra,
  };
}
```

**Acceptance Criteria:**
- [ ] Parse worker output correctly
- [ ] Verify deliverable completeness
- [ ] Extract confidence scores
- [ ] 90%+ test coverage

**Estimated Effort:** 2 days

---

### PHASE 4: Coordinator Simplification (Week 3)

#### 4.1: Update Coordinator to Use TypeScript Skills

**File:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`

**New simplified version:**

```markdown
# CFN v3 Coordinator

You are the entry point for CFN Loop execution.

## Responsibilities

1. Read task environment variables
2. Invoke orchestrator CLI with parameters
3. Report results to main chat

## Execution

The orchestrator handles all remaining work:
- Context storage in Redis
- Agent selection
- Loop 3 execution (implementation)
- Gate checking
- Loop 2 execution (validation)
- Consensus collection
- Product Owner decision
- Iteration management

## Success Criteria

Task completion indicated by orchestrator return code.
```

**Implementation:**
```bash
#!/bin/bash
set -euo pipefail

# Read environment
TASK_ID="${TASK_ID:?TASK_ID required}"
TASK_DESCRIPTION="${TASK_DESCRIPTION:?TASK_DESCRIPTION required}"
MODE="${MODE:-standard}"
MAX_ITERATIONS="${MAX_ITERATIONS:-10}"

# Invoke orchestrator CLI
npx claude-flow-novice orchestrate \
  --task-id "$TASK_ID" \
  --mode "$MODE" \
  --max-iterations "$MAX_ITERATIONS"

exit $?
```

**Acceptance Criteria:**
- [ ] Reduced from 283 → 100 lines
- [ ] All logic delegated to orchestrator
- [ ] CLI-based invocation
- [ ] Backward compatible

**Estimated Effort:** 2 hours

---

#### 4.2: Update Orchestrator Initialization

**File:** `.claude/skills/cfn-loop-orchestration/src/orchestrate.ts`

**Changes:**
- Move all parameter fallback logic from bash wrapper into orchestrator
- Accept raw parameters from coordinator
- Initialize Redis context internally
- Select agents using cfn-agent-selection-with-fallback
- Perform all setup work

**Before:**
```typescript
// orchestrate.ts expects pre-configured parameters from bash wrapper
// Redis context already stored by coordinator
```

**After:**
```typescript
// orchestrate.ts accepts raw task description
// Initializes Redis context internally
// Selects agents based on task type
// Handles all orchestration

export class Orchestrator {
  async execute() {
    // 1. Initialize context
    await this.initializeContext();
    
    // 2. Select agents
    await this.selectAgents();
    
    // 3. Spawn Loop 3
    // 4. Execute tests, check gates
    // ... rest of orchestration
  }
}
```

**Acceptance Criteria:**
- [ ] Orchestrator accepts minimal parameters
- [ ] All setup delegated to orchestrator
- [ ] No bash parameter logic needed
- [ ] Tests still pass

**Estimated Effort:** 2 days

---

### PHASE 5: Cleanup & Documentation (Week 4)

#### 5.1: Remove Deprecated Skills

**Skills to remove:**
1. `.claude/skills/cfn-agent-selector/` - Duplicate of cfn-agent-selection-with-fallback
2. `.claude/skills/cfn-agent-execution/` - Duplicate of cfn-agent-spawning (if confirmed)

**Process for each skill:**
1. Verify no references in active code
2. Archive to `.claude/deprecated/cfn-*` directory
3. Add migration guide to docs
4. Update README with deprecation notice

**Acceptance Criteria:**
- [ ] No broken references
- [ ] Deprecation documented
- [ ] Migration path clear
- [ ] Tests updated

**Estimated Effort:** 1 day

---

#### 5.2: Document Migration

**Create:** `docs/TYPESCRIPT_MIGRATION_GUIDE.md`

Contents:
- Overview of what changed
- CLI migration guide
- Backward compatibility notes
- Deprecation timeline

**Update:** `docs/CFN_LOOP_ARCHITECTURE.md`

Contents:
- New orchestration architecture
- CLI entry point documentation
- TypeScript skill integration
- Performance improvements

**Estimated Effort:** 1 day

---

#### 5.3: Final Testing & Validation

**Test Coverage:**
- [ ] CLI functionality (10+ tests)
- [ ] Orchestrator integration (15+ tests)
- [ ] Output processing (20+ tests)
- [ ] Backward compatibility (5+ tests)

**Performance Benchmarks:**
- [ ] CLI startup time < 1s
- [ ] Orchestrator initialization < 2s
- [ ] Full CFN Loop < 5 min (mvp)

**Acceptance Criteria:**
- [ ] 90%+ test coverage
- [ ] All tests < 5s each
- [ ] No performance regression
- [ ] Zero backward compatibility issues

**Estimated Effort:** 2 days

---

## DEPENDENCY GRAPH

```
Phase 1: CLI Consolidation
├── 1.1: Create orchestrator-cli.ts
├── 1.2: Update coordinator profile
├── 1.3: Mark wrappers deprecated
└── 1.4: Test CLI entry point

Phase 2: Critical Conversions (depends on Phase 1)
├── 2.1: Convert product-owner-decision
├── 2.2: Expand orchestration tests
└── 2.3: Add CLI to main package

Phase 3: Output Processing (depends on Phase 1-2)
├── 3.1: Consolidate Loop 2 output processing
└── 3.2: Consolidate Loop 3 output processing

Phase 4: Coordinator Simplification (depends on Phase 1-3)
├── 4.1: Update coordinator to use CLI
└── 4.2: Update orchestrator initialization

Phase 5: Cleanup (depends on all previous phases)
├── 5.1: Remove deprecated skills
├── 5.2: Document migration
└── 5.3: Final testing & validation
```

---

## RISK MITIGATION

### Risk 1: Backward Compatibility
**Issue:** Old bash scripts still in use
**Mitigation:** Keep bash wrappers as deprecated stubs, CLI handles all new invocations

### Risk 2: Test Coverage Gaps
**Issue:** Might break existing workflows
**Mitigation:** Comprehensive integration tests before removal

### Risk 3: Performance Regression
**Issue:** Additional CLI layer might slow down orchestration
**Mitigation:** Benchmark against current implementation

---

## SUCCESS METRICS

### Before Migration
- Bash wrappers: 612 lines (3 files)
- Coordinator: 283 lines
- Test coverage: 60%
- Startup time: ~3s

### After Migration
- Bash wrappers: 0 lines (deprecated stubs only)
- Coordinator: 100 lines
- Test coverage: 90%+
- Startup time: <1s

---

## ROLLBACK PLAN

If migration fails:
1. Keep deprecated bash wrappers active
2. Revert CLI changes
3. Maintain TypeScript conversions (no-op in production)
4. Plan re-migration with additional resources

---

## TIMELINE

**Week 1 (Orchestration CLI)**
- Mon-Tue: Create orchestrator-cli.ts
- Wed: Update coordinator profile
- Thu: Deprecate old wrappers
- Fri: Test CLI entry point

**Week 2 (Critical Conversions)**
- Mon-Tue: Convert product-owner-decision
- Wed-Thu: Expand test coverage
- Fri: Add CLI to main package

**Week 3 (Output Processing)**
- Mon-Tue: Consolidate Loop 2 output
- Wed-Thu: Consolidate Loop 3 output
- Fri: Coordinator simplification

**Week 4 (Cleanup & Documentation)**
- Mon: Remove deprecated skills
- Tue-Wed: Document migration
- Thu-Fri: Final testing & validation

---

## RESPONSIBLE PARTIES

- **CLI Development:** Backend developer (1 week)
- **TypeScript Conversions:** Backend developer (1.5 weeks)
- **Testing:** QA engineer (1.5 weeks)
- **Documentation:** Tech writer (0.5 weeks)
- **Review & Oversight:** Architect (ongoing)

