# BUG #13: CLI-Spawned Agents Don't Receive Tools

**Date Discovered:** 2025-10-21
**Severity:** CRITICAL (explains BUG #12 - zero deliverables)
**Status:** 🔍 INVESTIGATING
**Related:** BUG #12 (consensus on vapor), Sprint 4.1 (checkpoint state failure)

---

## Summary

CLI-spawned agents have tools defined in their markdown and referenced in system prompts, but tools are never passed to the Anthropic API, making them unavailable for actual use.

**Impact:** Agents cannot use Write, Read, Edit, or Bash tools → Cannot create files → Zero deliverables

---

## Evidence Trail

### 1. Tools Defined in Agent Markdown ✅

**File:** `.claude/agents/development/backend-dev.md`
**Lines:** 1-5

```yaml
---
name: backend-dev
tools: [Read, Write, Edit, Bash, TodoWrite]
model: haiku
type: specialist
---
```

**Status:** Tools successfully defined

---

### 2. Tools Parsed from YAML ✅

**File:** `src/cli/agent-definition-parser.ts`
**Line:** 196

```typescript
tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : []
```

**Test:**
```bash
npx claude-flow-novice agent backend-dev --list
# Output: ✓ Tools: Read, Write, Edit, Bash, TodoWrite
```

**Status:** Tools successfully parsed

---

### 3. Tools Logged in CLI ✅

**File:** `src/cli/agent-command.ts`
**Line:** 146

```typescript
console.log(`  ✓ Tools: ${definition.tools.join(', ')}`);
```

**Actual Output:**
```
[1/3] Parsing agent definition...
  ✓ Found: backend-dev
  ✓ Type: specialist
  ✓ Model: haiku
  ✓ Tools: Read, Write, Edit, Bash, TodoWrite  ✅
```

**Status:** Tools successfully logged

---

### 4. Tools Included in System Prompt ✅

**File:** `src/cli/cli-agent-context.ts`
**Function:** `buildCLIAgentSystemPrompt()`

System prompt includes agent markdown template which contains:
```yaml
tools: [Read, Write, Edit, Bash, TodoWrite]
```

**Result:** Agent THINKS it has access to these tools

---

### 5. Tools NOT Passed to executeAgentAPI ❌

**File:** `src/cli/agent-executor.ts`
**Lines:** 247-254

```typescript
const result = await executeAgentAPI(
  definition.name,
  agentId,
  definition.model,
  prompt,
  systemPrompt,
  messages.length > 1 ? messages : undefined
);
// NO tools parameter!
```

**Bug:** `definition.tools` is NOT passed to `executeAgentAPI()`

---

### 6. executeAgentAPI Signature Missing Tools Parameter ❌

**File:** `src/cli/anthropic-client.ts`
**Lines:** 292-299

```typescript
export async function executeAgentAPI(
  agentType: string,
  agentId: string,
  model: string,
  prompt: string,
  systemPrompt?: string,
  messages?: Array<{ role: string; content: string }>,
  maxTokens?: number
): Promise<{ success: boolean; output: string; usage: any; error?: string }> {
  // No tools parameter in signature!
```

**Bug:** Function signature doesn't accept tools

---

### 7. Tools NOT Passed to sendMessage ❌

**File:** `src/cli/anthropic-client.ts`
**Lines:** 327-341

```typescript
const response = await sendMessage(
  {
    model,
    prompt,
    systemPrompt,
    stream: true,
    messages,
    maxTokens,
    // NO tools property!
  },
  (chunk) => {
    process.stdout.write(chunk);
    fullOutput += chunk;
  }
);
```

**Bug:** `sendMessage()` options don't include tools

---

### 8. sendMessage SUPPORTS Tools But Never Receives Them ⚠️

**File:** `src/cli/anthropic-client.ts`
**Lines:** 204-206

```typescript
if (options.tools && options.tools.length > 0) {
  requestParams.tools = options.tools;  // This code is never reached!
}
```

**Finding:** The infrastructure exists but is never used

---

## Root Cause Analysis

**Flow Comparison:**

**Working (Task Tool Agents):**
```
Main Chat → Task tool → Claude Code runtime
                    ↓
                  Agent with tools provided by runtime
                    ↓
                  Tools work ✅
```

**Broken (CLI-Spawned Agents):**
```
Coordinator → npx claude-flow-novice agent backend-dev
           ↓
         agent-command.ts parses tools: [Read, Write, Edit, Bash]
           ↓
         agent-executor.ts ❌ DOESN'T pass tools to executeAgentAPI
           ↓
         anthropic-client.ts ❌ DOESN'T pass tools to sendMessage
           ↓
         Anthropic API ❌ DOESN'T receive tools
           ↓
         Agent tries to use Write tool ❌ FAILS
           ↓
         Zero files created ❌ BUG #12
```

---

## Impact Analysis

### Affected Features
- ❌ **CFN Loop file creation tasks** (Loop 3 agents can't use Write tool)
- ❌ **Skill implementation** (Sprint 4.1 checkpoint state - zero deliverables)
- ❌ **Code generation** (agents analyze but don't write files)
- ❌ **Test creation** (agents plan but don't create test files)

### Successful Workarounds
- ✅ **Analysis tasks** (text-only responses work)
- ✅ **Reviews** (reading git diffs works via system prompt context)
- ✅ **Planning** (architectural designs don't need file writes)

### Why This Went Unnoticed
1. **Agent markdown includes tools** → Looks correct in code review
2. **CLI logs tools successfully** → Appears to be working
3. **System prompt mentions tools** → Agents believe they have access
4. **Agents report high confidence** → Believe task is complete
5. **No error messages** → Silent failure (agent just doesn't use tools)

---

## Required Fixes

### Fix 1: Add Tools Parameter to executeAgentAPI ✅ (Draft)

**File:** `src/cli/anthropic-client.ts`
**Line:** 299 (after maxTokens parameter)

```typescript
export async function executeAgentAPI(
  agentType: string,
  agentId: string,
  model: string,
  prompt: string,
  systemPrompt?: string,
  messages?: Array<{ role: string; content: string }>,
  maxTokens?: number,
  tools?: any[]  // ADD THIS
): Promise<{ success: boolean; output: string; usage: any; error?: string }> {
```

---

### Fix 2: Pass Tools to sendMessage ✅ (Draft)

**File:** `src/cli/anthropic-client.ts`
**Lines:** 327-341

```typescript
const response = await sendMessage(
  {
    model,
    prompt,
    systemPrompt,
    stream: true,
    messages,
    maxTokens,
    tools,  // ADD THIS
  },
  (chunk) => {
    process.stdout.write(chunk);
    fullOutput += chunk;
  }
);
```

---

### Fix 3: Pass definition.tools from agent-executor ✅ (Draft)

**File:** `src/cli/agent-executor.ts`
**Lines:** 247-254

```typescript
const result = await executeAgentAPI(
  definition.name,
  agentId,
  definition.model,
  prompt,
  systemPrompt,
  messages.length > 1 ? messages : undefined,
  undefined, // maxTokens (use default)
  definition.tools  // ADD THIS
);
```

---

## Critical Question: What IS definition.tools?

**Current Value:** `['Read', 'Write', 'Edit', 'Bash', 'TodoWrite']`

**Anthropic API Expects:**
```typescript
tools: Array<{
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}>
```

**Problem:** We have tool NAMES, not tool DEFINITIONS.

---

## Architecture Decision Required

### Option 1: Implement Tool Conversion Layer
Convert tool names → Anthropic tool definitions:

```typescript
// src/cli/tool-definitions.ts
export function convertToolNames(toolNames: string[]): any[] {
  const toolRegistry: Record<string, any> = {
    'Read': {
      name: 'Read',
      description: 'Read file contents',
      input_schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to file' }
        },
        required: ['file_path']
      }
    },
    'Write': { /* ... */ },
    'Edit': { /* ... */ },
    'Bash': { /* ... */ },
    'TodoWrite': { /* ... */ }
  };

  return toolNames.map(name => toolRegistry[name]).filter(Boolean);
}
```

**Pros:**
- Tools actually work
- Matches Task tool behavior
- Fixes BUG #12

**Cons:**
- Requires tool definition maintenance
- Tool execution layer needed (how to actually run tools?)
- May duplicate Claude Code runtime logic

---

### Option 2: Remove Tools from CLI Agents
CLI agents are text-only:

```yaml
---
name: backend-dev
tools: []  # No tools for CLI agents
model: haiku
type: specialist
---
```

**Pros:**
- Simple, no new code needed
- Clear separation: Task=tools, CLI=text-only

**Cons:**
- ❌ CLI agents can't create files
- ❌ CFN Loop can't implement features
- ❌ Defeats purpose of autonomous execution

---

### Option 3: Hybrid Approach (RECOMMENDED)

**Strategy:**
1. Keep coordinator agents spawned via Task tool (have full tools)
2. CLI-spawned agents are text-only (analysis, planning, review)
3. Coordinator creates files based on CLI agent output

**Pattern:**
```
Main Chat → Task(coordinator) [HAS TOOLS]
         ↓
       Coordinator spawns analysts via CLI [NO TOOLS]
         ↓
       Analysts return bash command strings
         ↓
       Coordinator executes commands using its Bash tool [HAS TOOLS]
         ↓
       Files created ✅
```

**Pros:**
- Works with current architecture
- No tool definition duplication
- Coordinators control file creation (safer)

**Cons:**
- Agents output bash/code as text (not files directly)
- Coordinator must parse and execute
- Extra coordination layer

---

## Immediate Next Steps

1. ⚠️ **Document pattern**: CLI agents output bash commands as text
2. ⚠️ **Update agent markdown**: Remove tools from CLI agent templates OR clarify text-only
3. ⚠️ **Update orchestrator**: Parse agent output for bash commands, execute via coordinator
4. ⚠️ **Test**: Sprint 4.1 with hybrid pattern

---

## Related Documentation

- **BUG #12:** `docs/BUG_12_CONSENSUS_ON_VAPOR.md` - Zero deliverables despite high confidence
- **Agent Markdown:** `.claude/agents/development/backend-dev.md` - Tool definitions
- **CLI Spawning:** `src/cli/agent-executor.ts` - Execution flow
- **Anthropic Client:** `src/cli/anthropic-client.ts` - API integration

---

**Date Documented:** 2025-10-21
**Session:** Sprint 4.1 Tool Investigation
**Discovery Method:** Code tracing from BUG #12 root cause analysis
**Conclusion:** CLI agents are currently TEXT-ONLY. Tools defined but not passed to API.
