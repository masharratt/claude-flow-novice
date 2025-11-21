# Fix Plan: WORKSPACE Injection for Agent Deliverables

**Priority:** CRITICAL
**Impact:** Agents spawn successfully but don't create deliverables
**Root Cause:** WORKSPACE path not injected into agent prompts
**Fix Complexity:** Low (3-4 functions, backward compatible)

---

## Quick Summary

After v3.1.0 TypeScript migration, agents spawn successfully but fail to create deliverables because:
1. Test passes `WORKSPACE='/tmp/test-cfn-loop-1763684282'` in shell variable format
2. Agent prompt builder only parses JSON format
3. WORKSPACE variable never extracted from context
4. Agents don't know WHERE to create files

**Fix:** Parse shell variable context format and extract WORKSPACE into agent prompts.

---

## Implementation Plan

### Step 1: Add Shell Variable Parser (CRITICAL)

**File:** `src/cli/agent-prompt-builder.ts`

**Add function:**
```typescript
/**
 * Parse shell variable format into JSON object
 * Example: "VAR1='value1' VAR2='value2'" → {VAR1: 'value1', VAR2: 'value2'}
 */
function parseShellVariables(shellContext: string): any {
  const jsonObj: any = {};

  // Match pattern: VAR_NAME='value' or VAR_NAME="value"
  const singleQuoteRegex = /([A-Z_]+)='([^']*)'/g;
  const doubleQuoteRegex = /([A-Z_]+)="([^"]*)"/g;

  let match;

  // Parse single-quoted variables
  while ((match = singleQuoteRegex.exec(shellContext)) !== null) {
    const [_, key, value] = match;
    jsonObj[key] = value;
  }

  // Parse double-quoted variables
  shellContext = shellContext.replace(singleQuoteRegex, ''); // Remove already parsed
  while ((match = doubleQuoteRegex.exec(shellContext)) !== null) {
    const [_, key, value] = match;
    jsonObj[key] = value;
  }

  return jsonObj;
}
```

**Unit Test:**
```typescript
// Test shell variable parsing
const shellContext = "TASK_DESCRIPTION='Create file' WORKSPACE='/tmp/test' MODE='standard'";
const parsed = parseShellVariables(shellContext);

assert.equal(parsed.TASK_DESCRIPTION, 'Create file');
assert.equal(parsed.WORKSPACE, '/tmp/test');
assert.equal(parsed.MODE, 'standard');
```

### Step 2: Update buildTaskDescription (CRITICAL)

**File:** `src/cli/agent-prompt-builder.ts`

**Current:**
```typescript
function buildTaskDescription(agentType: string, context: TaskContext): string {
  let desc = '';

  if (context.context) {
    let contextStr = context.context.trim();

    // Check if context looks like JSON
    if ((contextStr.startsWith('{') && contextStr.endsWith('}')) ||
        (contextStr.startsWith('[') && contextStr.endsWith(']'))) {
      const jsonObj = JSON.parse(contextStr);
      desc = enrichJSONContext(jsonObj);
    } else {
      // Plain text context
      desc = context.context;
    }
  }

  return desc;
}
```

**Updated:**
```typescript
function buildTaskDescription(agentType: string, context: TaskContext): string {
  let desc = '';

  if (context.context) {
    let contextStr = context.context.trim();

    // NEW: Check if context is shell variable format (VAR='value' VAR2='value2')
    if (contextStr.includes('=') && !contextStr.startsWith('{')) {
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
```

### Step 3: Update enrichJSONContext (CRITICAL)

**File:** `src/cli/agent-prompt-builder.ts`

**Current:**
```typescript
function enrichJSONContext(jsonObj: any): string {
  const sections: string[] = [];

  // Extract task description
  if (jsonObj.task) {
    sections.push(`**Task:** ${jsonObj.task}`);
  }

  // Add directory context
  if (jsonObj.directory) {
    sections.push(`\n**Working Directory:** ${jsonObj.directory}`);
  }

  // ... rest
}
```

**Updated:**
```typescript
function enrichJSONContext(jsonObj: any): string {
  const sections: string[] = [];

  // Extract task description (support both formats)
  if (jsonObj.task || jsonObj.TASK_DESCRIPTION) {
    sections.push(`**Task:** ${jsonObj.task || jsonObj.TASK_DESCRIPTION}`);
  }

  // Add directory context (support both directory and WORKSPACE)
  if (jsonObj.directory) {
    sections.push(`\n**Working Directory:** ${jsonObj.directory}`);
  } else if (jsonObj.WORKSPACE) {
    sections.push(`\n**Working Directory:** ${jsonObj.WORKSPACE}`);
  }

  // Add mode if present
  if (jsonObj.MODE || jsonObj.mode) {
    sections.push(`\n**Execution Mode:** ${jsonObj.MODE || jsonObj.mode}`);
  }

  // Add expected files if present
  if (jsonObj.EXPECTED_FILES) {
    const fileList = typeof jsonObj.EXPECTED_FILES === 'string'
      ? jsonObj.EXPECTED_FILES.split(',').map(f => f.trim()).filter(f => f)
      : Array.isArray(jsonObj.EXPECTED_FILES) ? jsonObj.EXPECTED_FILES : [];

    if (fileList.length > 0) {
      sections.push('\n**Expected Deliverables:**');
      fileList.forEach(file => sections.push(`- ${file}`));
    }
  }

  // ... rest of existing enrichment
}
```

### Step 4: Add Environment Variable Injection (HIGH PRIORITY)

**File:** `src/cli/agent-prompt-builder.ts`

**Add helper function:**
```typescript
/**
 * Extract WORKSPACE from context (any format)
 */
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

**Update formatEnvironmentContext:**
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
```

### Step 5: Update Agent Documentation (REQUIRED)

**File:** `.claude/agents/cfn-dev-team/developers/backend-developer.md`

**Add section after "Core Responsibilities":**
```markdown
## File Creation Guidelines

### Working Directory
All deliverable files MUST be created in the **Working Directory** specified in the task context.

**Pattern:**
```bash
# Extract working directory from task context (provided as environment variable)
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

**Critical Notes:**
- ✅ Always use `$WORKSPACE` for deliverables
- ✅ Verify files created before reporting completion
- ❌ Never create deliverables in current working directory
- ❌ Never create deliverables in /tmp/ (ephemeral)
- ❌ Never create deliverables in project root
```

**Apply to all agent profiles:**
- backend-developer.md
- devops-engineer.md
- frontend-engineer.md
- tester.md
- security-specialist.md
- (all agents in `.claude/agents/cfn-dev-team/`)

---

## Testing Strategy

### Unit Tests

**File:** `tests/unit/agent-prompt-builder.test.ts` (create if needed)

```typescript
import { parseShellVariables, extractWorkspaceFromContext } from '../../src/cli/agent-prompt-builder';

describe('parseShellVariables', () => {
  it('should parse shell variable format', () => {
    const input = "TASK_DESCRIPTION='Create file' WORKSPACE='/tmp/test' MODE='standard'";
    const result = parseShellVariables(input);

    expect(result.TASK_DESCRIPTION).toBe('Create file');
    expect(result.WORKSPACE).toBe('/tmp/test');
    expect(result.MODE).toBe('standard');
  });

  it('should handle double quotes', () => {
    const input = 'WORKSPACE="/tmp/test" MODE="standard"';
    const result = parseShellVariables(input);

    expect(result.WORKSPACE).toBe('/tmp/test');
    expect(result.MODE).toBe('standard');
  });

  it('should handle mixed quotes', () => {
    const input = "WORKSPACE='/tmp/test' MODE=\"standard\"";
    const result = parseShellVariables(input);

    expect(result.WORKSPACE).toBe('/tmp/test');
    expect(result.MODE).toBe('standard');
  });
});

describe('extractWorkspaceFromContext', () => {
  it('should extract WORKSPACE from shell format', () => {
    const input = "TASK='test' WORKSPACE='/tmp/workspace' MODE='standard'";
    const result = extractWorkspaceFromContext(input);

    expect(result).toBe('/tmp/workspace');
  });

  it('should extract WORKSPACE from JSON format', () => {
    const input = '{"WORKSPACE": "/tmp/workspace", "MODE": "standard"}';
    const result = extractWorkspaceFromContext(input);

    expect(result).toBe('/tmp/workspace');
  });

  it('should return null if no WORKSPACE', () => {
    const input = "TASK='test' MODE='standard'";
    const result = extractWorkspaceFromContext(input);

    expect(result).toBeNull();
  });
});
```

### Integration Tests

**Test 1: Shell Variable Context Format**
```bash
#!/bin/bash
# tests/cli-mode/core/integration/test-workspace-injection-shell-format.sh

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

test_workspace_injection_shell_format() {
  log_step "GIVEN shell variable context with WORKSPACE"

  WORKSPACE=$(mktemp -d)
  TASK_ID="test-workspace-shell-$(date +%s)"

  CONTEXT="TASK_DESCRIPTION='Create hello-world.txt' WORKSPACE='$WORKSPACE'"

  # WHEN agent is spawned with shell variable context
  npx claude-flow-novice agent backend-developer \
    --task-id "$TASK_ID" \
    --context "$CONTEXT" \
    --timeout 30

  # THEN agent prompt should contain Working Directory
  # (Check agent logs or output)

  # AND file should be created in WORKSPACE
  assert_file_exists "$WORKSPACE/hello-world.txt" "Deliverable created in WORKSPACE"

  rm -rf "$WORKSPACE"
}

test_workspace_injection_shell_format
```

**Test 2: JSON Context Format**
```bash
#!/bin/bash
# tests/cli-mode/core/integration/test-workspace-injection-json-format.sh

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

test_workspace_injection_json_format() {
  log_step "GIVEN JSON context with WORKSPACE"

  WORKSPACE=$(mktemp -d)
  TASK_ID="test-workspace-json-$(date +%s)"

  CONTEXT='{"task": "Create hello-world.txt", "WORKSPACE": "'$WORKSPACE'"}'

  # WHEN agent is spawned with JSON context
  npx claude-flow-novice agent backend-developer \
    --task-id "$TASK_ID" \
    --context "$CONTEXT" \
    --timeout 30

  # THEN file should be created in WORKSPACE
  assert_file_exists "$WORKSPACE/hello-world.txt" "Deliverable created in WORKSPACE"

  rm -rf "$WORKSPACE"
}

test_workspace_injection_json_format
```

### E2E Test (Final Validation)

**Existing test should pass after fix:**
```bash
./tests/cli-mode/core/e2e/test-cfn-loop-5-iteration-real-execution.sh

# Expected result:
✅ Loop 3 agents spawned (count: 2)
✅ Deliverable created within 30s
✅ Workspace contents: hello-world.txt
✅ File content matches expected
```

---

## Rollout Plan

### Phase 1: Core Implementation (2-3 hours)
1. Add `parseShellVariables()` function
2. Add `extractWorkspaceFromContext()` function
3. Update `buildTaskDescription()` to parse shell variables
4. Update `enrichJSONContext()` to handle WORKSPACE
5. Write unit tests

### Phase 2: Environment Injection (1-2 hours)
1. Update `formatEnvironmentContext()` to inject WORKSPACE
2. Write integration tests
3. Validate environment variable appears in agent prompt

### Phase 3: Documentation (1-2 hours)
1. Update backend-developer.md with file creation guidelines
2. Update all other agent profiles
3. Add examples and validation patterns

### Phase 4: Testing & Validation (2-3 hours)
1. Run unit tests
2. Run integration tests
3. Run E2E test (test-cfn-loop-5-iteration-real-execution.sh)
4. Verify deliverables created successfully

### Phase 5: Deployment (30 minutes)
1. Rebuild TypeScript: `npm run build`
2. Run full test suite
3. Commit changes
4. Update documentation

---

## Success Metrics

- [ ] Unit tests pass (shell variable parsing)
- [ ] Integration tests pass (WORKSPACE injection)
- [ ] E2E test passes (real agent execution with deliverables)
- [ ] Agents create files in correct WORKSPACE directory
- [ ] Test completes within 60s (not 120s timeout)
- [ ] Zero regression in existing tests

---

## Risk Assessment

**Risk Level:** LOW

**Why:**
- Changes are additive (no breaking changes)
- Backward compatible with JSON context format
- Unit tests validate parsing logic
- Integration tests validate end-to-end behavior
- Existing tests continue to work

**Rollback Plan:**
- Git revert to previous commit
- Shell script fallbacks already archived (not reintroduced)
- TypeScript dist/ can be rebuilt from previous version

---

## Dependencies

**Build Requirements:**
```bash
cd src/cli
npm run build
```

**Test Requirements:**
```bash
# Redis running (for coordination)
redis-server --daemonize yes

# NPX available
npm install -g npm

# Project dependencies installed
npm install
```

**Documentation Updates:**
- All agent profiles in `.claude/agents/cfn-dev-team/`
- Agent creation guide (CLAUDE.md)

---

## Next Steps

1. **Implement parseShellVariables()** (30 min)
2. **Update buildTaskDescription()** (15 min)
3. **Update enrichJSONContext()** (15 min)
4. **Write unit tests** (30 min)
5. **Run E2E test** (5 min)
6. **Update agent documentation** (1 hour)
7. **Final validation** (30 min)

**Total Time Estimate:** 3-4 hours

---

## Related Documentation

- **Root Cause Analysis:** `docs/BUG_ANALYSIS_V3_1_0_AGENT_DELIVERABLE_FAILURE.md`
- **Test Suite:** `tests/cli-mode/core/CLAUDE.md`
- **Agent Standards:** `.claude/agents/cfn-dev-team/CLAUDE.md`
- **v3.1.0 Migration:** `planning/docker-migration/TYPESCRIPT_MIGRATION_HANDOFF.md`

---

**Status:** Ready for implementation
**Priority:** CRITICAL (blocks E2E testing)
**Complexity:** Low (3-4 functions, well-scoped)
**Risk:** Low (additive, backward compatible)
