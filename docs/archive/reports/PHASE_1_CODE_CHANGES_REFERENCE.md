# Phase 1 Implementation - Code Changes Reference

This document provides detailed before/after code comparisons for each modification.

---

## File 1: `src/cli/spawn-agent-cli.ts`

### Change 1.1: Add `generateTaskId()` Function

**Location:** Lines 136-157
**Type:** New function addition

```typescript
// ADDED: Phase 1 Mode Prefix Function
/**
 * Phase 1: Mode Prefix Function for CLI/Trigger.dev Collision Mitigation
 *
 * Generates task ID with mode prefix to prevent Redis key collisions between
 * CLI mode and Trigger.dev Docker mode. Both modes share identical Redis coordination
 * patterns and must use isolated namespaces.
 *
 * @param rawTaskId - Original task ID without prefix
 * @param mode - Execution mode: 'cli' for CLI mode, 'trigger' for Trigger.dev
 * @returns Prefixed task ID in format "MODE:rawTaskId"
 *
 * Example:
 *   generateTaskId('task-123', 'cli')     => 'cli:task-123'
 *   generateTaskId('task-123', 'trigger') => 'trigger:task-123'
 *
 * Redis Key Isolation (After):
 *   CLI:     cfn:task:cli:task-123:status
 *   Trigger: cfn:task:trigger:task-123:status
 */
function generateTaskId(rawTaskId: string, mode: 'cli' | 'trigger'): string {
  return `${mode}:${rawTaskId}`;
}
```

**Why:** Provides reusable function for mode-aware task ID generation with proper documentation.

---

### Change 1.2: Apply Prefix in `main()` Function

**Location:** Lines 244-256
**Type:** Logic modification

**Before:**
```typescript
  // Create spawner
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const spawner = new AgentSpawner(projectRoot);

  // Build config
  const config = {
    agentType: args.agentType!,
    taskId: taskId!,
    iteration: args.iteration || 1,
    mode: args.mode || 'standard' as const,
    provider: args.provider,
    model: args.model,
    prompt: args.prompt,
    background: args.background !== false,
    env: {
      TASK_ID: taskId!
    }
  };
```

**After:**
```typescript
  // Create spawner
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const spawner = new AgentSpawner(projectRoot);

  // Build config with CLI mode prefix for Redis key isolation (Phase 1)
  const prefixedTaskId = generateTaskId(taskId!, 'cli');
  const config = {
    agentType: args.agentType!,
    taskId: prefixedTaskId,
    iteration: args.iteration || 1,
    mode: args.mode || 'standard' as const,
    provider: args.provider,
    model: args.model,
    prompt: args.prompt,
    background: args.background !== false,
    env: {
      TASK_ID: prefixedTaskId
    }
  };
```

**Key Changes:**
- `const prefixedTaskId = generateTaskId(taskId!, 'cli');` (line 244)
- `taskId: prefixedTaskId` (line 247) instead of `taskId!`
- `TASK_ID: prefixedTaskId` (line 255) instead of `taskId!`

**Why:** Ensures all task IDs passed to agents have CLI mode prefix for Redis isolation.

---

### Change 1.3: Update Export Statement

**Location:** Line 281
**Type:** Export modification

**Before:**
```typescript
export { parseArgs, validateArgs, formatOutput };
```

**After:**
```typescript
export { parseArgs, validateArgs, formatOutput, generateTaskId };
```

**Why:** Makes `generateTaskId()` available for import in agent-spawner.ts.

---

## File 2: `src/cli/agent-spawner.ts`

### Change 2.1: Add Import

**Location:** Line 22
**Type:** Import addition

**Before:**
```typescript
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { execFileSync, spawn as childSpawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
```

**After:**
```typescript
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { execFileSync, spawn as childSpawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { generateTaskId } from './spawn-agent-cli';
```

**Why:** Imports the prefix generation function (available for future use or cross-module validation).

---

### Change 2.2: Update Task ID Validation Pattern

**Location:** Lines 333-358
**Type:** Validation pattern update

**Before:**
```typescript
  /**
   * Validate task ID format (CVSS 8.9 - command injection prevention)
   * Pattern: alphanumeric, underscore, hyphen, dot only, max 64 chars
   */
  private validateTaskId(taskId: string): ValidationResult {
    if (typeof taskId !== 'string' || taskId.length === 0) {
      return { valid: false, error: 'Task ID must be a non-empty string' };
    }

    const taskIdPattern = /^[a-zA-Z0-9_.-]{1,64}$/;
    if (!taskIdPattern.test(taskId)) {
      return {
        valid: false,
        error: 'Invalid task ID format - must contain only alphanumeric characters, dot, underscore, and hyphens (max 64 chars)'
      };
    }

    return { valid: true };
  }
```

**After:**
```typescript
  /**
   * Validate task ID format (CVSS 8.9 - command injection prevention)
   * Supports both raw IDs and Phase 1 prefixed IDs (cli:*, trigger:*)
   * Pattern: alphanumeric, underscore, hyphen, dot, and colon (for mode prefix) only, max 128 chars
   *
   * Accepted formats:
   *   - Raw: task-123 (16 chars)
   *   - Prefixed: cli:task-123 (20 chars)
   *   - Prefixed: trigger:task-123 (24 chars)
   */
  private validateTaskId(taskId: string): ValidationResult {
    if (typeof taskId !== 'string' || taskId.length === 0) {
      return { valid: false, error: 'Task ID must be a non-empty string' };
    }

    // Updated pattern to support mode prefixes (cli:, trigger:)
    const taskIdPattern = /^(?:cli:|trigger:)?[a-zA-Z0-9_.-]{1,64}$/;
    if (!taskIdPattern.test(taskId)) {
      return {
        valid: false,
        error: 'Invalid task ID format - must contain only alphanumeric characters, dot, underscore, hyphens, and optional mode prefix (cli:, trigger:)'
      };
    }

    return { valid: true };
  }
```

**Key Changes:**
- Pattern: `/^(?:cli:|trigger:)?[a-zA-Z0-9_.-]{1,64}$/`
  - Non-capturing group: `(?:cli:|trigger:)?` (optional mode prefix)
  - Rest of pattern unchanged
- Updated JSDoc to explain supported formats
- Updated error message to include mode prefix information

**Why:** Allows validation of both raw task IDs (from Trigger.dev) and prefixed task IDs (from CLI).

---

## File 3: `trigger-dev/src/jobs/cfn-loop3.ts`

### Change 3.1: Add `generateTriggerTaskId()` Function

**Location:** Lines 37-55
**Type:** New function addition

**Before:**
```typescript
const QUALITY_GATES = {
  mvp: 0.70,
  standard: 0.95,
  enterprise: 0.98,
} as const;

/**
 * Payload schema for CFN Loop 3 execution
 * ...
```

**After:**
```typescript
const QUALITY_GATES = {
  mvp: 0.70,
  standard: 0.95,
  enterprise: 0.98,
} as const;

/**
 * Phase 1: Mode Prefix Function for CLI/Trigger.dev Collision Mitigation
 *
 * Generates task ID with "trigger:" prefix to prevent Redis key collisions with CLI mode.
 * Both modes use identical Redis coordination patterns and must use isolated namespaces.
 *
 * @param rawTaskId - Original task ID without prefix
 * @returns Prefixed task ID in format "trigger:rawTaskId"
 *
 * Example:
 *   generateTriggerTaskId('task-123') => 'trigger:task-123'
 *
 * Redis Key Isolation (After):
 *   CLI:     cfn:task:cli:task-123:status
 *   Trigger: cfn:task:trigger:task-123:status
 */
function generateTriggerTaskId(rawTaskId: string): string {
  return `trigger:${rawTaskId}`;
}

/**
 * Payload schema for CFN Loop 3 execution
 * ...
```

**Why:** Provides dedicated function for Trigger.dev mode prefix generation.

---

### Change 3.2: Apply Prefix in `run()` Method

**Location:** Lines 182-196
**Type:** Logic modification

**Before:**
```typescript
    const { taskId, taskDescription, mode, provider, agents, iteration, previousFeedback, timeout } =
      validatedPayload;
    const jobStartTime = Date.now();

    // 2. Security validation
    try {
      validateTaskId(taskId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid task ID';
      await io.logger.error('CFN Loop 3: Task ID validation failed', { taskId, error: errorMessage });
      throw error;
    }
```

**After:**
```typescript
    const { taskId: rawTaskId, taskDescription, mode, provider, agents, iteration, previousFeedback, timeout } =
      validatedPayload;
    const jobStartTime = Date.now();

    // Phase 1: Apply Trigger.dev mode prefix for Redis key isolation
    const taskId = generateTriggerTaskId(rawTaskId);

    // 2. Security validation
    try {
      validateTaskId(rawTaskId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid task ID';
      await io.logger.error('CFN Loop 3: Task ID validation failed', { taskId: rawTaskId, error: errorMessage });
      throw error;
    }
```

**Key Changes:**
- `taskId: rawTaskId` (destructuring rename)
- `const taskId = generateTriggerTaskId(rawTaskId);` (apply prefix)
- `validateTaskId(rawTaskId)` (validate before prefix)
- `{ taskId: rawTaskId, ... }` (log raw ID in error)

**Why:**
- Separates concerns: validate original ID, use prefixed ID for coordination
- Maintains backward compatibility with payload schema
- All subsequent agent spawning uses prefixed `taskId`

---

## Validation Pattern Details

### Before (Original Pattern)
```regex
/^[a-zA-Z0-9_.-]{1,64}$/
```

Matches:
- ✓ `task-123`
- ✓ `my_task.test`
- ✗ `cli:task-123` (colon not allowed)
- ✗ `trigger:task-123` (colon not allowed)

### After (Updated Pattern)
```regex
/^(?:cli:|trigger:)?[a-zA-Z0-9_.-]{1,64}$/
```

Matches:
- ✓ `task-123` (raw)
- ✓ `cli:task-123` (CLI mode)
- ✓ `trigger:task-123` (Trigger.dev mode)
- ✓ `my_task.test` (no prefix)
- ✗ `task@123` (@ not allowed)
- ✗ `cli:trigger:task-123` (multiple prefixes)

**Pattern Breakdown:**
- `^` - Start of string
- `(?:cli:|trigger:)?` - Non-capturing group: optional "cli:" or "trigger:" prefix
- `[a-zA-Z0-9_.-]{1,64}` - 1-64 alphanumeric, underscore, dot, or hyphen characters
- `$` - End of string

---

## Environment Variable Changes

### CLI Mode (spawn-agent-cli.ts)

**Before:**
```typescript
env: {
  TASK_ID: taskId!  // e.g., "task-123"
}
```

**After:**
```typescript
env: {
  TASK_ID: prefixedTaskId  // e.g., "cli:task-123"
}
```

Agents spawned in CLI mode now receive:
```bash
TASK_ID=cli:task-123
```

### Trigger.dev Mode (cfn-loop3.ts)

All subsequent code continues to use `taskId` which is now:
```typescript
// From raw payload
const taskId = generateTriggerTaskId(rawTaskId);
// taskId is now: "trigger:task-123"
```

Agents spawned in Trigger.dev mode receive:
```bash
TASK_ID=trigger:task-123
```

---

## Redis Key Examples

### CLI Mode Agent
```bash
TASK_ID=cli:task-123

# Coordination signals use:
cfn:task:cli:task-123:status
cfn:task:cli:task-123:completed
cfn:task:cli:task-123:result
cfn:task:cli:task-123:confidence
```

### Trigger.dev Mode Agent
```bash
TASK_ID=trigger:task-123

# Coordination signals use:
cfn:task:trigger:task-123:status
cfn:task:trigger:task-123:completed
cfn:task:trigger:task-123:result
cfn:task:trigger:task-123:confidence
```

### No Collision
Both can run with same task ID without interference:
```
CLI:      cfn:task:cli:task-123:*      (isolated namespace)
Trigger:  cfn:task:trigger:task-123:*  (isolated namespace)
```

---

## Type Safety Analysis

### Function Signatures

**CLI Mode:**
```typescript
function generateTaskId(rawTaskId: string, mode: 'cli' | 'trigger'): string
// Explicit union type for mode parameter
// Single responsibility: prefix generation
```

**Trigger.dev Mode:**
```typescript
function generateTriggerTaskId(rawTaskId: string): string
// Simplified interface: mode is implicit
// Single responsibility: Trigger.dev prefix generation
```

### Zero `any` Types
- ✓ All parameters explicitly typed
- ✓ All return types explicitly specified
- ✓ No type assertions (`as`)
- ✓ No implicit `any` parameters

---

## Security Implications

### Command Injection Prevention (CVSS 8.9)

The colon (`:`) character added to the validation pattern:
- ✓ Non-executable in shell contexts
- ✓ Not a shell metacharacter
- ✓ Allowed in shell variable names and values
- ✓ No new injection vectors introduced

Example safe shell usage:
```bash
# Safe - colon is valid in variable values
export TASK_ID="cli:task-123"

# Safe - colon in Redis key
redis-cli SET "cfn:task:cli:task-123:status" "running"

# Safe - colon in Docker environment
docker run -e TASK_ID="trigger:task-123" agent-image
```

---

## Backward Compatibility

### Existing Code (No Changes Required)
- Raw task IDs still work: validation pattern accepts them
- Validation happens before prefix: original ID checked
- Agent spawning continues to work as before

### Scenario: Mixed Mode Execution
```typescript
// Old code: raw task ID
spawn-agent-cli backend-dev --task-id "task-123"
// Becomes: cli:task-123 (prefixed transparently)

// Trigger.dev: raw task ID in payload
{ "taskId": "task-123" }
// Becomes: trigger:task-123 (prefixed transparently)

// Result: No collision, both use same raw ID
```

---

## Testing Checklist

- [ ] Unit test: generateTaskId('task-123', 'cli') === 'cli:task-123'
- [ ] Unit test: generateTaskId('task-123', 'trigger') === 'trigger:task-123'
- [ ] Unit test: generateTriggerTaskId('task-123') === 'trigger:task-123'
- [ ] Unit test: validateTaskId('task-123') passes (raw)
- [ ] Unit test: validateTaskId('cli:task-123') passes (CLI)
- [ ] Unit test: validateTaskId('trigger:task-123') passes (Trigger)
- [ ] Unit test: validateTaskId('cli:trigger:task') fails (multiple)
- [ ] Integration: CLI spawn with raw ID creates cli:* keys
- [ ] Integration: Trigger spawn with raw ID creates trigger:* keys
- [ ] Integration: Concurrent execution (both modes) no collision
- [ ] Regression: Existing agent spawning still works
- [ ] Regression: Task ID validation still rejects invalid characters

