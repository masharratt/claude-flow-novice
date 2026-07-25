# Agent Production Feedback Patterns

**Question**: When agents use the TDD Coordinator in production and encounter failures, can they adapt based on feedback, or are they fully dependent on the coordinator's code?

## TL;DR

**Agents CAN and SHOULD adapt based on feedback.** The coordinator is a tool, not a black box. Agents can:
1. See error outputs and adjust their approach
2. Retry with modified parameters
3. Read conversation logs to understand failures
4. Switch strategies if the coordinator repeatedly fails

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Agent (backend-developer, fullstack, etc.)              │
│                                                          │
│ 1. Decides to use TDD approach                          │
│ 2. Calls TDD Coordinator with parameters                │
│ 3. Receives result (success/failure + details)          │
│ 4. ANALYZES result and decides next action              │
│    ├─ Success: Continue with generated code             │
│    ├─ Partial: Adjust parameters and retry              │
│    └─ Failure: Try different approach or manual coding  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ TDD Coordinator (Skill)                                 │
│                                                          │
│ - Receives: feature, filePath, testCommand, context     │
│ - Executes: RED → GREEN → FIX loop                      │
│ - Returns: JSON with success, files, errors, etc.       │
│ - Saves: Conversation log for debugging                 │
└─────────────────────────────────────────────────────────┘
```

## Return Value Structure

The coordinator returns detailed feedback that agents can use for adaptation:

```typescript
interface TDDResult {
  success: boolean;                    // Did tests pass?
  implementationFile: string;          // Path to generated impl
  testFile: string;                    // Path to generated tests
  iterations: number;                  // How many fix attempts
  conversationId: string;              // For debugging
  error?: string;                      // Error message if failed
}
```

## Agent Adaptation Patterns

### Pattern 1: Parameter Adjustment (Most Common)

**Scenario**: Coordinator fails with timezone issue

**Agent Response**:
```typescript
// First attempt
let result = await callTDDCoordinator({
  feature: "Date formatter that formats dates as YYYY-MM-DD",
  // ... other params
});

// Agent sees failure in result.error
if (!result.success && result.error.includes('timezone')) {
  console.log('🔄 Retrying with UTC hint...');

  // Second attempt with adjusted feature description
  result = await callTDDCoordinator({
    feature: "Date formatter that formats dates as YYYY-MM-DD using UTC methods",
    // ... same other params
  });
}
```

### Pattern 2: Test Command Adjustment

**Scenario**: Test framework has path issues

**Agent Response**:
```typescript
// First attempt with absolute path
let result = await callTDDCoordinator({
  testCommand: `npx vitest run ${absolutePath}/test.ts`
});

// Agent detects "No test files found"
if (!result.success && result.error.includes('No test files found')) {
  console.log('🔄 Adjusting test command to use relative path...');

  // Retry with relative path
  result = await callTDDCoordinator({
    testCommand: `npx vitest run ${basename(testFile)}`
  });
}
```

### Pattern 3: Context File Addition

**Scenario**: Generated code missing necessary types

**Agent Response**:
```typescript
// First attempt without context
let result = await callTDDCoordinator({
  feature: "User authentication",
  contextFiles: []
});

// Agent sees import errors in result.error
if (!result.success && result.error.includes('Cannot find type')) {
  console.log('🔄 Adding type definition context...');

  // Retry with context files
  result = await callTDDCoordinator({
    feature: "User authentication",
    contextFiles: ['./src/types/User.ts', './src/types/Auth.ts']
  });
}
```

### Pattern 4: Strategy Switch

**Scenario**: Coordinator fails repeatedly (3+ times)

**Agent Response**:
```typescript
const MAX_RETRIES = 3;
let attempts = 0;
let result;

while (attempts < MAX_RETRIES) {
  result = await callTDDCoordinator({ /* params */ });

  if (result.success) break;

  attempts++;
  console.log(`⚠️  Attempt ${attempts}/${MAX_RETRIES} failed`);

  // Try adjusting parameters based on error
  // (parameter adjustment logic here)
}

if (!result.success) {
  console.log('❌ TDD Coordinator failed after 3 attempts');
  console.log('🔄 Switching to manual code generation...');

  // Agent falls back to direct code generation
  return await generateCodeManually({ /* params */ });
}
```

### Pattern 5: Conversation Log Analysis

**Scenario**: Agent needs to understand WHY coordinator failed

**Agent Response**:
```typescript
const result = await callTDDCoordinator({ /* params */ });

if (!result.success) {
  // Read the conversation log
  const conversationPath = `./conversations/${result.conversationId}.json`;
  const conversation = JSON.parse(readFileSync(conversationPath, 'utf-8'));

  // Analyze the conversation to find patterns
  const messages = conversation.conversation;
  const lastError = messages[messages.length - 1].content;

  console.log('🔍 Analyzing conversation log...');
  console.log('Last error:', lastError);

  // Agent uses this to make intelligent retry decisions
  if (lastError.includes('module resolution')) {
    // Adjust test command or add tsconfig
  } else if (lastError.includes('type mismatch')) {
    // Add type context files
  }
}
```

## Production Integration Examples

### Example 1: Backend Developer Agent

```typescript
async function implementFeature(featureDescription: string) {
  // Agent decides to use TDD approach
  console.log('📝 Using TDD approach for feature implementation...');

  const result = await callTDDCoordinator({
    agentId: this.agentId,
    feature: featureDescription,
    filePath: './src/features/newFeature.ts',
    testCommand: 'npm test newFeature',
    contextFiles: await this.gatherRelevantContext(),
    maxIterations: 3
  });

  if (result.success) {
    console.log('✅ TDD generation successful!');
    console.log(`Generated: ${result.implementationFile}`);
    console.log(`Tests: ${result.testFile}`);
    console.log(`Iterations: ${result.iterations}`);
    return result;
  }

  // ADAPTIVE BEHAVIOR: Agent analyzes failure and decides what to do
  console.log('⚠️  TDD generation failed:', result.error);

  // Check if it's a recoverable error
  if (result.iterations < 3) {
    // Coordinator gave up early, might be a parameter issue
    console.log('🔄 Coordinator gave up early, trying with more context...');

    return await callTDDCoordinator({
      ...previousParams,
      contextFiles: await this.gatherMoreContext(),
      feature: `${featureDescription} (use TypeScript strict mode)`
    });
  }

  // If coordinator tried hard but failed, fall back to manual approach
  console.log('🔄 Falling back to manual implementation...');
  return await this.manualImplementation(featureDescription);
}
```

### Example 2: CFN Loop Integration

```typescript
// In CFN Loop orchestration
async function executeTaskWithTDD(task: Task) {
  const tddResult = await spawnAgent('tdd-coordinator', {
    feature: task.description,
    filePath: task.targetFile,
    testCommand: task.testCommand
  });

  // CFN Loop reads the result and decides next steps
  if (tddResult.success) {
    // Continue to validation phase
    await spawnAgent('code-reviewer', {
      files: [tddResult.implementationFile, tddResult.testFile]
    });
  } else {
    // ADAPTIVE: CFN Loop can spawn different agents based on error type
    if (tddResult.error.includes('test framework')) {
      // Spawn a specialist to set up test framework first
      await spawnAgent('test-framework-setup', {
        framework: 'vitest',
        directory: dirname(task.targetFile)
      });

      // Then retry TDD coordinator
      tddResult = await spawnAgent('tdd-coordinator', { /* same params */ });
    } else {
      // Different recovery strategy based on error type
    }
  }
}
```

## Error Categories and Agent Responses

| Error Type | Agent Detection | Recommended Response |
|------------|----------------|----------------------|
| **Timezone/Date Issues** | `error.includes('expected') && error.includes('date')` | Add "using UTC" to feature description |
| **Import Errors** | `error.includes('Cannot find') \|\| error.includes('is not defined')` | Add context files with type definitions |
| **Test Framework Issues** | `error.includes('No test files')` | Check test command format or install framework |
| **Syntax Errors** | `error.includes('SyntaxError')` | Review generated code, might need linting setup |
| **Type Errors** | `error.includes('Type') && error.includes('expected')` | Add tsconfig or type declaration files |
| **Logic Errors** | `iterations === maxIterations && !success` | Coordinator tried hard, consider manual implementation |

## Design Philosophy: Tools, Not Oracles

The TDD Coordinator is designed as a **tool** that agents use, not an **oracle** they blindly trust.

### What Agents SHOULD Do ✅
- Read and interpret coordinator results
- Adjust parameters based on errors
- Retry with different approaches
- Fall back to alternative strategies if needed
- Learn from conversation logs
- Provide better context on retry

### What Agents SHOULD NOT Do ❌
- Blindly accept coordinator failures
- Ignore error messages
- Retry indefinitely with same parameters
- Skip reading the result structure
- Assume coordinator is always right

## Feedback Loop Architecture

```
Agent Request → Coordinator Execution → Result Analysis → Decision
     ↑                                                        │
     │                                                        │
     └──────────────── Adaptive Retry ───────────────────────┘
```

**Key Point**: The loop includes an **Adaptive Retry** path where agents can modify their approach based on what they learned.

## Real-World Scenario: vitest Path Issue

### Without Adaptation (BAD)
```typescript
// Agent blindly accepts failure
const result = await callTDDCoordinator({
  testCommand: 'npx vitest run /abs/path/test.ts'
});

if (!result.success) {
  console.log('❌ TDD failed, giving up');
  return null; // 😢 Agent gives up
}
```

### With Adaptation (GOOD)
```typescript
// Agent analyzes and adapts
let result = await callTDDCoordinator({
  testCommand: 'npx vitest run /abs/path/test.ts'
});

if (!result.success && result.error.includes('No test files found')) {
  console.log('🔍 Detected test path issue, trying relative path...');

  result = await callTDDCoordinator({
    testCommand: 'npx vitest run test.ts' // Relative path
  });
}

if (result.success) {
  console.log('✅ Recovered from path issue!');
}
```

### With Code Fix (BEST)
```typescript
// Now that we fixed the coordinator code to use `cwd`,
// agents don't need to worry about this specific issue anymore!

const result = await callTDDCoordinator({
  testCommand: 'npx vitest run /abs/path/test.ts'
});

// Works because coordinator runs from correct directory ✅
```

## Current State After 5 Rounds

### Fixed in Code (No Agent Adaptation Needed)
- ✅ ESM `__dirname` issue
- ✅ Import statement generation
- ✅ Vitest syntax usage
- ✅ FIX phase file targeting
- ✅ Test command working directory

### Requires Agent Adaptation (Can't Fix in Code)
- Feature description hints (e.g., "using UTC")
- Context file selection (agent knows codebase better)
- Test command format per project
- Framework-specific configurations
- Domain-specific edge cases

## Conclusion

**Answer to Original Question**:

Agents are **NOT fully dependent on the code** - they **CAN and SHOULD adapt** based on feedback.

The TDD Coordinator provides rich feedback (success status, error messages, iteration count, conversation logs) that agents can use to:
1. Diagnose issues
2. Adjust parameters
3. Retry with better context
4. Switch strategies if needed

**Design Goal**: Create a **collaborative relationship** where:
- Coordinator handles TDD mechanics (RED-GREEN-REFACTOR loop)
- Agents handle high-level strategy and adaptation
- Together they solve complex problems that neither could solve alone

**Production Readiness**: The coordinator is now robust enough that most common issues are handled automatically, but agents still have full visibility and control to adapt when needed.
