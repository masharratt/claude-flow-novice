# Full Agent Context - What the Agent Actually Sees

This document reconstructs the **complete context** that the typescript-specialist agent receives when invoked via CLI.

## API Call Structure

When the CLI executes:
```bash
node /app/dist/cli/index.js agent typescript-specialist "$FIX_PROMPT"
```

The agent receives an API call with two main parts:

## 1. System Prompt

The system prompt combines:
- CLAUDE.md project rules
- Agent template instructions (`.claude/agents/typescript-specialist.md`)
- Tool definitions

**Estimated size**: ~4,355 characters (from log output)

### Key Agent Template Instructions (from typescript-specialist.md)

```
You are a TypeScript expert specializing in type-safe development, advanced
type system patterns, and compile-time error prevention.

Core Responsibilities:
1. Type System Architecture
   - Design scalable type hierarchies and interfaces
   - Implement advanced generics with proper constraints

2. Type Safety Implementation
   - Eliminate `any` types and ensure strict type checking
   - Configure tsconfig.json for optimal type checking  <-- CONFLICT!

3. Advanced TypeScript Patterns
   - Conditional types for dynamic type transformations
   - Mapped types for object property manipulation
```

**⚠️ CONFLICT IDENTIFIED**: Agent template says "Configure tsconfig.json" but user prompt says "DO NOT: Read tsconfig.json"

## 2. User Message

The user message is the FIX_PROMPT string:

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

## The Problem: Conflicting Instructions

### System Prompt (Agent Template) Says:
✅ "Configure tsconfig.json for optimal type checking"
✅ "Ensure type coverage across the entire codebase"
✅ "Set up proper type declarations for third-party libraries"
✅ "Design scalable type hierarchies" (implies exploring structure)

### User Prompt Says:
❌ "DO NOT: Read tsconfig.json"
❌ "DO NOT: Explore project structure"
❌ "DO NOT: Check other files"
❌ "ONLY: Read and Edit the target file"

## Agent Behavior Result

**What agent does**: Follows system prompt (agent template) over user prompt

**Iteration breakdown**:
1. Iteration 1-4: Bash exploration (find TypeScript files, explore structure)
2. Iteration 5: Read tsconfig.json (from system prompt instructions)
3. Iteration 6-10: More exploration (npm scripts, type checking commands)

**Why**: System prompt (agent template) has stronger weight than user message in LLM reasoning. The agent is "doing its job" as defined in the system prompt, which includes comprehensive analysis and understanding project structure.

## Why User Prompt Lost

### Hierarchy of Instructions
1. **System Prompt** (highest authority): Defines what the agent IS
2. **User Message** (secondary): Specific task request

When these conflict, system prompt wins because it defines the agent's core identity and responsibilities.

### Agent's Internal Reasoning (hypothesized)
```
System says: I'm a TypeScript expert who ensures type coverage and configures tsconfig
User says: Don't read tsconfig

Agent thinks: To fix TypeScript errors properly, I need to understand the
type checking configuration. That's part of my core responsibility.
I should read tsconfig.json to understand the strictness settings.

Result: Agent reads tsconfig.json despite user instruction
```

## Solution Options

### Option 1: Override Agent Template
Temporarily override the agent template by providing complete system prompt in CLI call.
**Complexity**: High (requires CLI modification)

### Option 2: Create Minimal Agent
Create new `file-fixer` agent with minimal instructions:
```yaml
name: file-fixer
description: Minimal file editor with no exploration
tools: [Read, Edit]
model: haiku
---
You edit files. That's it. Read file, edit file, done.
```
**Complexity**: Medium (new agent definition)

### Option 3: Embed File Content (RECOMMENDED)
Provide file content directly in user prompt:
```bash
FILE_CONTENT=$(cat "$FULL_PATH")

FIX_PROMPT="Fix TypeScript errors using Edit().

File: /workspace/$FILE

Content:
$FILE_CONTENT

Use Edit() to fix each error at /workspace/$FILE"
```

**Why this works**:
- Agent can't explore if content already provided
- No need to read file (content in prompt)
- Forces immediate action
- Bypasses agent's exploration instincts

**Complexity**: Low (modify worker script only)

### Option 4: Increase Max Iterations
Allow agent to complete exploration phase (20-30 iterations instead of 10).

**Why this might work**:
- Agent may eventually finish exploration and start fixing
- Not guaranteed - agent might explore indefinitely

**Complexity**: Trivial (change max_iterations parameter)
**Recommended**: NO (exploration may never end, costs more API tokens)

## Recommended Implementation

**Use Option 3**: Embed file content in prompt

**Implementation** (in `agent-worker.sh`):
```bash
# Read file content
FILE_CONTENT=$(cat "$FULL_PATH" 2>/dev/null || echo "ERROR: Could not read file")

# Create prompt with embedded content
FIX_PROMPT="Fix all TypeScript errors in this file using Edit().

File path: /workspace/$FILE
Expected errors: approximately $EXPECTED_ERRORS

=== FILE CONTENT START ===
$FILE_CONTENT
=== FILE CONTENT END ===

Instructions:
1. Review the TypeScript errors in the content above
2. Use Edit(file_path='/workspace/$FILE', old_string='...', new_string='...') to fix each error
3. Do NOT use Read() - the content is already provided above
4. Do NOT explore or check other files
5. Fix all errors then respond COMPLETE

Begin fixing now."
```

**Advantages**:
- ✅ Content provided = no need to Read
- ✅ No exploration possible (content already given)
- ✅ Clear, single-purpose instruction
- ✅ File path repeated multiple times
- ✅ Fast to implement

**Test with single agent first**, then scale to 32 parallel agents if successful.
