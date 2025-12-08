# Root Cause Analysis: Agents Spawn But Don't Create Deliverables (v3.1.0)

**Date:** 2025-11-20
**Version:** v3.1.0
**Status:** CRITICAL - Agents spawn successfully but fail to create deliverables
**Test:** `tests/cli-mode/core/e2e/test-cfn-loop-5-iteration-real-execution.sh`

---

## Executive Summary

After v3.1.0 TypeScript migration (removal of all shell script fallbacks), agents spawn successfully via CLI but fail to create deliverables. Test shows:
- ✅ Agents spawned correctly: `backend-developer-1-1`, `devops-engineer-1-1`
- ✅ Process IDs detected: `31345`, `31352`
- ❌ No deliverable files created in workspace after 120s timeout
- ❌ Workspace remained empty (expected: `hello-world.txt`)

**Root Cause:** WORKSPACE path not injected into agent prompts, preventing agents from knowing WHERE to create files.

---

## Evidence from Test Execution

### Test Task
```bash
Create file 'hello-world.txt' with exact content 'Hello CFN Loop'
```

### Context Passed to Coordinator
```bash
CONTEXT="TASK_DESCRIPTION='Create file hello-world.txt with progressive improvements...' \
MODE='standard' \
MAX_ITERATIONS=5 \
CFN_DOCKER_MODE='false' \
EXPECTED_FILES='hello-world.txt' \
WORKSPACE='/tmp/test-cfn-loop-1763684282'"
```

### Spawn Evidence
```
✅ Loop 3 agents spawned (count: 2)
31345 npm exec claude-flow-novice agent backend-developer --task-id cfn-cli-cfn-cli-real-e2e-1763684282-30082 --agent-id backend-developer-1-1 --iteration 1
31352 npm exec claude-flow-novice agent devops-engineer --task-id cfn-cli-cfn-cli-real-e2e-1763684282-30082 --agent-id devops-engineer-1-1 --iteration 1

❌ Deliverable not created within 120s
Workspace contents: (empty)
```

---

## Root Cause Analysis

### Problem 1: WORKSPACE Not Extracted from Context

**File:** `src/cli/agent-prompt-builder.ts:enrichJSONContext()`

**Current Implementation:**
```typescript
function enrichJSONContext(jsonObj: any): string {
  const sections: string[] = [];

  // Extract task description
  if (jsonObj.task) {
    sections.push(`**Task:** ${jsonObj.task}`);
  }

  // Add directory context
  if (jsonObj.directory) {  // ❌ Looks for 'directory', not 'WORKSPACE'
    sections.push(`\n**Working Directory:** ${jsonObj.directory}`);
  }

  // ... rest of enrichment
}
```

**Issue:**
- Test passes `WORKSPACE='/tmp/test-cfn-loop-1763684282'` in context
- `enrichJSONContext()` only checks for `jsonObj.directory`, not `jsonObj.WORKSPACE`
- WORKSPACE variable never makes it into agent prompt
- Agents don't know WHERE to create files

### Problem 2: Context Format Mismatch

**Test passes context as shell variable string:**
```bash
CONTEXT="TASK_DESCRIPTION='...' MODE='standard' WORKSPACE='/tmp/...'"
```

**Agent prompt builder expects JSON:**
```typescript
// Check if context looks like JSON
if ((contextStr.startsWith('{') && contextStr.endsWith('}')) ||
    (contextStr.startsWith('[') && contextStr.endsWith(']'))) {
  const jsonObj = JSON.parse(contextStr);
  desc = enrichJSONContext(jsonObj);
}
```

**Result:**
- Context is shell variable format (not JSON)
- `enrichJSONContext()` never called
- Context passed as raw string without any enrichment
- WORKSPACE path lost in plain text context

### Problem 3: Agent Profile Instructions Don't Mention Workspace

**File:** `.claude/agents/cfn-dev-team/developers/backend-developer.md`

**Current State:**
- Instructions focus on TDD protocol
- Success criteria validation documented
- Test execution patterns documented
- ❌ NO instructions on WHERE to create files
- ❌ NO mention of WORKSPACE environment variable or parameter
- ❌ NO guidance on file output directory

**Agent Perspective:**
```
Task: "Create file 'hello-world.txt' with exact content 'Hello CFN Loop'"

Agent thinks:
- What content? ✅ "Hello CFN Loop" (clear)
- What filename? ✅ "hello-world.txt" (clear)
- Where to create it? ❌ Unknown (not specified)

Agent likely:
- Creates file in current working directory (unknown to test)
- Creates file in /tmp/agent-workspace/ (not checked by test)
- Doesn't create file at all (waits for clarification)
```

---

## Impact Analysis

### Test Failure Pattern
```
1. Coordinator spawns successfully ✅
2. Coordinator parses context (shell variable format) ✅
3. Coordinator spawns Loop 3 agents via TypeScript orchestrator ✅
4. Agents receive context (but WORKSPACE not extracted) ❌
5. Agents read task description ✅
6. Agents don't know where to create files ❌
7. Agents either:
   - Create files in wrong location ❌
   - Don't create files (wait for clarification) ❌
   - Error out silently ❌
8. Test times out after 120s waiting for deliverables ❌
```

### Regression from v2.x Behavior

**v2.x (Shell Script Orchestration):**
- `orchestrate-wrapper.sh` extracted WORKSPACE from context
- Passed WORKSPACE as environment variable to agents
- Agents accessed via `$WORKSPACE` in bash
- Files created in correct location ✅

**v3.1.0 (TypeScript Orchestration):**
- TypeScript orchestrator spawns agents via CLI
- Context passed as `--context` parameter (string)
- WORKSPACE not extracted or injected
- Agents don't know where to create files ❌

---

## Fix Recommendations

### Fix 1: Extract WORKSPACE from Context (REQUIRED)

**File:** `src/cli/agent-prompt-builder.ts`

**Add WORKSPACE handling to enrichJSONContext:**
```typescript
function enrichJSONContext(jsonObj: any): string {
  const sections: string[] = [];

  // Extract task description
  if (jsonObj.task || jsonObj.TASK_DESCRIPTION) {
    sections.push(`**Task:** ${jsonObj.task || jsonObj.TASK_DESCRIPTION}`);
  }

  // Add directory context (CRITICAL FIX)
  if (jsonObj.directory) {
    sections.push(`\n**Working Directory:** ${jsonObj.directory}`);
  }

  // NEW: Handle WORKSPACE variable from shell context
  if (jsonObj.WORKSPACE) {
    sections.push(`\n**Working Directory:** ${jsonObj.WORKSPACE}`);
  }

  // ... rest of enrichment
}
```

### Fix 2: Support Shell Variable Context Format (REQUIRED)

**Current Issue:** Context is shell variables, not JSON

**Solution:** Parse shell variable format before JSON fallback

```typescript
function buildTaskDescription(agentType: string, context: TaskContext): string {
  let desc = '';

  if (context.context) {
    let contextStr = context.context.trim();

    // NEW: Check if context is shell variable format
    if (contextStr.includes('=') && !contextStr.startsWith('{')) {
      // Parse shell variables into JSON object
      const jsonObj = parseShellVariables(contextStr);
      desc = enrichJSONContext(jsonObj);
    }
    // Check if context looks like JSON
    else if ((contextStr.startsWith('{') && contextStr.endsWith('}')) ||
             (contextStr.startsWith('[') && contextStr.endsWith(']'))) {
      const jsonObj = JSON.parse(contextStr);
      desc = enrichJSONContext(jsonObj);
    }
    else {
      // Plain text context
      desc = context.context;
    }
  }

  return desc;
}

// NEW: Parse shell variable format into JSON
function parseShellVariables(shellContext: string): any {
  const jsonObj: any = {};

  // Match pattern: VAR_NAME='value' or VAR_NAME="value"
  const regex = /([A-Z_]+)='([^']*)'/g;
  let match;

  while ((match = regex.exec(shellContext)) !== null) {
    const [_, key, value] = match;
    jsonObj[key] = value;
  }

  return jsonObj;
}
```

### Fix 3: Document WORKSPACE in Agent Profiles (HIGH PRIORITY)

**File:** `.claude/agents/cfn-dev-team/developers/backend-developer.md`

**Add WORKSPACE section:**
```markdown
## File Creation Guidelines

### Working Directory
All deliverable files MUST be created in the **Working Directory** specified in the task context.

**Pattern:**
```bash
# Extract working directory from task context
WORKSPACE="${WORKSPACE:-/workspace}"  # Default to /workspace if not specified

# Create files in WORKSPACE
cat > "$WORKSPACE/hello-world.txt" <<EOF
Hello CFN Loop
EOF
```

**Validation:**
```bash
# Verify file exists
ls -la "$WORKSPACE/hello-world.txt"

# Verify content
cat "$WORKSPACE/hello-world.txt"
```

**Critical:** Never create deliverables in:
- ❌ Current working directory (unknown to orchestrator)
- ❌ /tmp/ (ephemeral, not checked by tests)
- ❌ Project root (pollutes repository)
```

### Fix 4: Inject WORKSPACE as Environment Variable (RECOMMENDED)

**File:** `src/cli/agent-prompt-builder.ts`

**Current implementation:**
```typescript
const isDockerEnv = process.env.DOCKER_AGENT === 'true' || process.env.WORKSPACE_ROOT;
const workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';

if (isDockerEnv) {
  env.push(`WORKSPACE_ROOT=${workspaceRoot}`);
}
```

**Enhancement needed:**
```typescript
function formatEnvironmentContext(context: TaskContext): string {
  const env: string[] = [];

  // Docker environment detection
  const isDockerEnv = process.env.DOCKER_AGENT === 'true' || process.env.WORKSPACE_ROOT;
  const workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';

  if (isDockerEnv) {
    env.push(`WORKSPACE_ROOT=${workspaceRoot}`);
  }

  // NEW: Extract WORKSPACE from context and inject as environment variable
  if (context.context) {
    const workspace = extractWorkspaceFromContext(context.context);
    if (workspace) {
      env.push(`WORKSPACE=${workspace}`);
    }
  }

  // ... rest of environment setup
}

// NEW: Extract WORKSPACE from any context format
function extractWorkspaceFromContext(contextStr: string): string | null {
  // Try shell variable format first
  const shellMatch = contextStr.match(/WORKSPACE='([^']*)'/);
  if (shellMatch) return shellMatch[1];

  // Try JSON format
  try {
    const jsonObj = JSON.parse(contextStr);
    if (jsonObj.WORKSPACE) return jsonObj.WORKSPACE;
    if (jsonObj.directory) return jsonObj.directory;
  } catch {
    // Not JSON, continue
  }

  return null;
}
```

---

## Validation Strategy

### Test Case 1: Shell Variable Context Format
```bash
CONTEXT="TASK_DESCRIPTION='Create hello-world.txt' WORKSPACE='/tmp/test-workspace'"

# Expected agent prompt:
**Task:** Create hello-world.txt

**Working Directory:** /tmp/test-workspace
```

### Test Case 2: JSON Context Format
```bash
CONTEXT='{"task": "Create hello-world.txt", "WORKSPACE": "/tmp/test-workspace"}'

# Expected agent prompt:
**Task:** Create hello-world.txt

**Working Directory:** /tmp/test-workspace
```

### Test Case 3: Environment Variable Injection
```bash
# Agent receives:
WORKSPACE=/tmp/test-workspace

# Agent creates file:
cat > "$WORKSPACE/hello-world.txt" <<EOF
Hello CFN Loop
EOF

# Test verifies:
ls -la /tmp/test-workspace/hello-world.txt  # ✅ File exists
```

### Test Case 4: End-to-End Real Execution
```bash
./tests/cli-mode/core/e2e/test-cfn-loop-5-iteration-real-execution.sh

# Expected result:
✅ Loop 3 agents spawned (count: 2)
✅ Deliverable created within 30s
✅ Workspace contents: hello-world.txt
✅ File content: "Hello CFN Loop"
```

---

## Migration Impact

### Files Requiring Updates

1. **src/cli/agent-prompt-builder.ts** (CRITICAL)
   - Add `parseShellVariables()` function
   - Add `extractWorkspaceFromContext()` function
   - Update `buildTaskDescription()` to parse shell variables
   - Update `enrichJSONContext()` to handle WORKSPACE key
   - Update `formatEnvironmentContext()` to inject WORKSPACE

2. **.claude/agents/cfn-dev-team/developers/*.md** (HIGH PRIORITY)
   - Add "File Creation Guidelines" section
   - Document WORKSPACE variable usage
   - Provide file creation patterns
   - Add validation examples

3. **tests/cli-mode/core/e2e/*.sh** (VALIDATION)
   - Verify WORKSPACE injection works
   - Test both shell variable and JSON context formats
   - Validate file creation in correct directory

### Backward Compatibility

**v2.x Compatibility:**
- Shell variable context format still supported ✅
- JSON context format still supported ✅
- New WORKSPACE extraction is additive (no breaking changes) ✅

**v3.1.0+ Enhancement:**
- Agents receive WORKSPACE in both prompt and environment ✅
- Coordinator doesn't need to change context format ✅
- Tests work with existing context patterns ✅

---

## Success Criteria

### Phase 1: Core Fix (CRITICAL)
- [ ] `parseShellVariables()` function implemented
- [ ] `extractWorkspaceFromContext()` function implemented
- [ ] `buildTaskDescription()` parses shell variables
- [ ] `enrichJSONContext()` handles WORKSPACE key
- [ ] Unit tests pass for shell variable parsing

### Phase 2: Environment Injection (HIGH PRIORITY)
- [ ] `formatEnvironmentContext()` extracts and injects WORKSPACE
- [ ] Agents receive WORKSPACE as environment variable
- [ ] Environment variable appears in agent prompt
- [ ] Integration tests pass

### Phase 3: Documentation (REQUIRED)
- [ ] Agent profiles document WORKSPACE usage
- [ ] File creation guidelines added
- [ ] Examples provided for file creation patterns
- [ ] Validation patterns documented

### Phase 4: E2E Validation (FINAL GATE)
- [ ] `test-cfn-loop-5-iteration-real-execution.sh` passes
- [ ] Agents create deliverables in correct location
- [ ] Workspace verified non-empty after agent execution
- [ ] File content matches expected output
- [ ] Test completes within 60s (not 120s timeout)

---

## Timeline

**Immediate (Day 1):**
- Implement `parseShellVariables()` and `extractWorkspaceFromContext()`
- Update `buildTaskDescription()` to parse shell variables
- Add WORKSPACE handling to `enrichJSONContext()`

**Short-term (Day 2):**
- Update agent profiles with WORKSPACE documentation
- Implement environment variable injection
- Run integration tests

**Validation (Day 3):**
- Run full E2E test suite
- Verify deliverable creation works
- Validate both shell variable and JSON context formats

**Completion:**
- All E2E tests passing
- Agents create deliverables successfully
- Documentation updated
- Migration guide published

---

## Related Issues

- **BUG #21:** Production testing requirements (tests must use real spawning)
- **v3.1.0 Migration:** Removal of shell script fallbacks
- **v3.0.0 Architecture:** TypeScript orchestrator implementation

---

## Conclusion

The v3.1.0 TypeScript migration successfully removed shell script fallbacks, but introduced a critical gap in WORKSPACE path injection. Agents spawn correctly but don't know WHERE to create files, causing deliverable creation failures.

**Fix Strategy:**
1. Parse shell variable context format (immediate)
2. Extract WORKSPACE from context (immediate)
3. Inject WORKSPACE into agent prompts and environment (short-term)
4. Document WORKSPACE usage in agent profiles (short-term)
5. Validate with E2E tests (validation)

**Expected Impact:**
- Zero test changes required (backward compatible)
- Zero coordinator changes required (additive fix)
- Agents receive clear WORKSPACE path
- Deliverables created in correct location
- E2E tests pass successfully

**Risk:** Low - Fix is additive and backward compatible with v2.x patterns.

---

**Next Steps:**
1. Implement `parseShellVariables()` function
2. Update `buildTaskDescription()` to parse shell variables
3. Add WORKSPACE handling to `enrichJSONContext()`
4. Run E2E test to validate fix
5. Update agent profile documentation

**Status:** Ready for implementation
