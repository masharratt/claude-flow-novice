# Prompts Passed to Claude Code CLI

This document shows the exact prompts being passed to the CLI agents and what context/instructions they receive.

## Current Prompt Structure

### 1. Worker Script Prompt (agent-worker.sh)

**Location**: `tests/docker/b10-typescript-fix/agent-worker.sh` (lines 46-67)

**Prompt Template**:
```bash
FIX_PROMPT="YOUR ONLY JOB: Fix TypeScript errors in ONE FILE.

FILE TO FIX: /workspace/$FILE
EXPECTED ERRORS: Approximately $EXPECTED_ERRORS

STEP 1: Read(/workspace/$FILE)
STEP 2: For each TypeScript error you find, use Edit() to fix it immediately
STEP 3: After fixing all errors, respond with 'COMPLETE'

DO NOT:
- Read tsconfig.json
- Explore project structure
- Check other files
- Use Bash to find files
- Read any file except /workspace/$FILE

ONLY:
- Read /workspace/$FILE
- Edit /workspace/$FILE to fix TypeScript errors
- Nothing else

Start NOW by reading /workspace/$FILE"
```

**Example for B10 Batch (Task #1)**:
```
YOUR ONLY JOB: Fix TypeScript errors in ONE FILE.

FILE TO FIX: /workspace/src/services/notifications/permissionNotifications.ts
EXPECTED ERRORS: Approximately 13

STEP 1: Read(/workspace/src/services/notifications/permissionNotifications.ts)
STEP 2: For each TypeScript error you find, use Edit() to fix it immediately
STEP 3: After fixing all errors, respond with 'COMPLETE'

DO NOT:
- Read tsconfig.json
- Explore project structure
- Check other files
- Use Bash to find files
- Read any file except /workspace/src/services/notifications/permissionNotifications.ts

ONLY:
- Read /workspace/src/services/notifications/permissionNotifications.ts
- Edit /workspace/src/services/notifications/permissionNotifications.ts to fix TypeScript errors
- Nothing else

Start NOW by reading /workspace/src/services/notifications/permissionNotifications.ts
```

### 2. CLI Invocation

**Command**:
```bash
node /app/dist/cli/index.js agent typescript-specialist "$FIX_PROMPT"
```

**Arguments**:
- Agent type: `typescript-specialist`
- User prompt: The FIX_PROMPT string above

### 3. What CLI Assembles

The CLI agent command (`src/cli/commands/agent.ts`) does the following:

1. **Parses agent definition**: Loads `.claude/agents/cfn-dev-team/developers/frontend/typescript-specialist.md`
2. **Builds system prompt**: Combines:
   - CLAUDE.md project rules
   - Agent template instructions
   - Tool definitions
3. **Sends to API**:
   - System prompt (CLAUDE.md + agent template)
   - User message (FIX_PROMPT)

### 4. Agent Template Context

**Location**: `.claude/agents/typescript-specialist.md`

**Key Sections Agent Sees**:
- Description: "MUST BE USED for TypeScript development, type system design, and type safety implementation"
- Tools: Read, Write, Edit, Bash, Grep, Glob, TodoWrite
- Model: haiku
- Instructions include comprehensive analysis workflow

**Problem**: Agent template includes extensive guidance like:
```
Usage notes:
- Always prefer editing existing files in the codebase
- NEVER write new files unless explicitly required
- Analyze project structure before making changes
- Understand type definitions and interfaces
```

This "analyze project structure" instruction conflicts with our "DO NOT: Explore project structure" constraint.

## Issues Identified

### Issue 1: Agent Template Overrides User Prompt
- **User prompt says**: "DO NOT: Read tsconfig.json"
- **Agent does**: Reads tsconfig.json in iteration 5
- **User prompt says**: "DO NOT: Explore project structure"
- **Agent does**: Explores structure for 9/10 iterations

### Issue 2: Specialist Agents Have Exploration Instincts
The `typescript-specialist` agent is designed for comprehensive analysis:
- Understanding project context
- Exploring type definitions
- Running type checking tools
- Comprehensive analysis before action

These instincts override explicit user instructions.

### Issue 3: Prompt May Be Too Complex
Current prompt has:
- Main directive (YOUR ONLY JOB)
- 3 numbered steps
- DO NOT list (5 items)
- ONLY list (3 items)
- Final imperative (Start NOW)

This might be confusing or give agent multiple conflicting signals.

## Proposed Solutions

### Solution A: Simplify Prompt to Single Command
```bash
FIX_PROMPT="Read the file /workspace/$FILE and use Edit() to fix all TypeScript errors. Do nothing else."
```

**Pros**: Dead simple, single clear instruction
**Cons**: Removes context about expected errors

### Solution B: Embed File Content in Prompt
```bash
# Read file first
FILE_CONTENT=$(cat "/workspace/$FILE")

FIX_PROMPT="Fix all TypeScript errors in the following file using Edit().

File path: /workspace/$FILE

File content:
\`\`\`typescript
$FILE_CONTENT
\`\`\`

Use Edit() to fix each TypeScript error. The file is at /workspace/$FILE"
```

**Pros**:
- Eliminates need for agent to Read (can't explore if content provided)
- Forces immediate action
- Agent sees actual code with errors

**Cons**:
- Won't work for very large files (token limits)
- File might change between read and edit

### Solution C: Create Minimal File-Fixer Agent
Create new agent type with minimal instructions:
```yaml
name: file-fixer
tools: [Read, Edit]
model: haiku
description: Minimal agent that ONLY reads and edits files. No exploration.
```

**Pros**:
- Purpose-built for focused file fixing
- No conflicting exploration instincts

**Cons**:
- Need to create new agent definition
- May lack TypeScript expertise

### Solution D: Direct API Call (Bypass Agent Templates)
Call Anthropic API directly without agent template system:
```bash
curl -X POST https://api.z.ai/api/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ZAI_API_KEY" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "max_tokens": 8192,
    "system": "You are a TypeScript error fixer. Read files with Read() and fix errors with Edit().",
    "messages": [{"role": "user", "content": "Fix /workspace/file.ts"}],
    "tools": [...]
  }'
```

**Pros**:
- Complete control over system prompt
- No conflicting agent template instructions

**Cons**:
- More complex implementation
- Lose agent framework benefits

## File Size Analysis (B10 Batch)

Target file: `src/services/notifications/permissionNotifications.ts`
- **Lines**: 68
- **Estimated tokens**: ~800-1000 (well within limits)

This file is small enough for Solution B (embed content in prompt).

## Recommendation

**Try Solution B** (Embed file content) because:
1. ✅ File is small (68 lines)
2. ✅ Eliminates agent's ability to explore
3. ✅ Forces immediate action on provided content
4. ✅ Fast to implement (modify worker script only)
5. ✅ Maintains audit trail through agent framework

**Implementation**:
```bash
# In agent-worker.sh, replace FIX_PROMPT with:
FILE_CONTENT=$(cat "$FULL_PATH")

FIX_PROMPT="Fix all TypeScript errors in this file using Edit().

File: /workspace/$FILE
Expected errors: $EXPECTED_ERRORS

=== FILE CONTENT ===
$FILE_CONTENT
=== END FILE ===

Use Edit() to fix each error. Path: /workspace/$FILE"
```

## Test Next Steps

1. Modify `agent-worker.sh` to embed file content
2. Test single agent with embedded content
3. Compare behavior: does agent immediately edit instead of exploring?
4. If successful: run full B10 test with 32 agents
