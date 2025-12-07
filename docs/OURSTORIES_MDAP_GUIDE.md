# OurStories MDAP Error Fixing Guide

Use MDAP (Massively Decomposed Agentic Processes) to fix 448+ Rust errors and 500+ TypeScript errors in parallel.

## Quick Start (Simplest Option)

**You don't need to run Trigger.dev yourself.** You can call CFN's hosted MDAP endpoint directly.

### Option A: Use CFN's Hosted MDAP (Recommended)

Just need one secret key from the CFN team:

```bash
# Get this from CFN team
export TRIGGER_SECRET_KEY=""
```

Then create a simple script to trigger error fixes:

```typescript
// ourstories-v2/tools/fix-errors.ts
import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

configure({
  secretKey: process.env.TRIGGER_SECRET_KEY!,
  baseURL: "http://localhost:8030", // CFN's Trigger.dev instance
});

// Example: Fix a single Rust file
async function fixRustFile(filePath: string, errors: Array<{code: string, line: number, message: string}>) {
  const fileContent = await Bun.file(filePath).text();

  const handle = await tasks.trigger("cfn-mdap-implementer", {
    taskId: `rust-fix-${Date.now()}`,
    microTaskId: `fix-${filePath.split('/').pop()}`,
    targetFile: filePath,
    taskDescription: "Fix Rust compiler errors",
    language: "Rust",
    diffMode: true,  // Token-efficient mode
    errors: errors,
    fullFileContent: fileContent,
    workDir: process.cwd(),
  });

  // Wait for result
  const result = await runs.poll(handle.id, { pollIntervalMs: 1000 });

  if (result.output?.success) {
    await Bun.write(filePath, result.output.generatedCode);
    console.log(`✓ Fixed ${filePath} (${result.output.fixesApplied} fixes applied)`);
  }
}
```

### Option B: Run Your Own Trigger.dev

If you want full control, set up your own Trigger.dev instance.

---

## Full Setup Guide (Option B)

### 1. Install Dependencies

```bash
cd ourstories-v2
mkdir -p tools/mdap-fixer
cd tools/mdap-fixer

# Initialize package
npm init -y

# Install dependencies
npm install @trigger.dev/sdk@^4.1.2 typescript tsx
```

### 2. Create Configuration Files

**`trigger.config.ts`**:
```typescript
import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  // Use CFN's project (or create your own at https://trigger.dev)
  project: "proj_uuvpcrkpfruhlpbpzlov",
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 2 },
  },
  dirs: ["./src/trigger"],
};
```

**`tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**`.env`**:
```bash
# Get from CFN team or your own Trigger.dev dashboard
TRIGGER_SECRET_KEY=tr_dev_ffR3mLELFuaaA0txq0lO
TRIGGER_API_URL=http://localhost:8030

# Required for AI inference
CEREBRAS_API_KEY=your-cerebras-key  # Get from cerebras.ai
```

### 3. Create the Error Parser

**`src/parse-rust-errors.ts`**:
```typescript
import { $ } from "bun";

interface RustError {
  code: string;
  line: number;
  column: number;
  message: string;
  filePath: string;
  suggestion?: string;
}

export async function parseRustErrors(projectDir: string): Promise<Map<string, RustError[]>> {
  // Run cargo and capture errors
  const result = await $`cd ${projectDir} && cargo build 2>&1`.text();

  const errorsByFile = new Map<string, RustError[]>();

  // Parse error lines: "error[E0599]: no method named `foo` found"
  const errorRegex = /error\[(\w+)\]: (.+)\n\s+--> (.+):(\d+):(\d+)/g;

  let match;
  while ((match = errorRegex.exec(result)) !== null) {
    const [, code, message, filePath, line, column] = match;

    if (!errorsByFile.has(filePath)) {
      errorsByFile.set(filePath, []);
    }

    errorsByFile.get(filePath)!.push({
      code,
      message,
      filePath,
      line: parseInt(line),
      column: parseInt(column),
    });
  }

  return errorsByFile;
}

// CLI usage
if (import.meta.main) {
  const errors = await parseRustErrors(process.argv[2] || ".");
  console.log(`Found ${errors.size} files with errors`);
  for (const [file, fileErrors] of errors) {
    console.log(`  ${file}: ${fileErrors.length} errors`);
  }
}
```

**`src/parse-typescript-errors.ts`**:
```typescript
import { $ } from "bun";

interface TSError {
  code: string;
  line: number;
  column: number;
  message: string;
  filePath: string;
}

export async function parseTypeScriptErrors(projectDir: string): Promise<Map<string, TSError[]>> {
  const result = await $`cd ${projectDir} && npx tsc --noEmit 2>&1`.text();

  const errorsByFile = new Map<string, TSError[]>();

  // Parse: "src/foo.ts(45,12): error TS2304: Cannot find name 'x'"
  const errorRegex = /(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/g;

  let match;
  while ((match = errorRegex.exec(result)) !== null) {
    const [, filePath, line, column, code, message] = match;

    if (!errorsByFile.has(filePath)) {
      errorsByFile.set(filePath, []);
    }

    errorsByFile.get(filePath)!.push({
      code,
      message,
      filePath,
      line: parseInt(line),
      column: parseInt(column),
    });
  }

  return errorsByFile;
}
```

### 4. Create the Batch Fixer

**`src/fix-all-errors.ts`**:
```typescript
import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import { parseRustErrors } from "./parse-rust-errors.js";
import { parseTypeScriptErrors } from "./parse-typescript-errors.js";

configure({
  secretKey: process.env.TRIGGER_SECRET_KEY!,
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

interface FixTask {
  filePath: string;
  errors: Array<{ code: string; line: number; message: string }>;
  language: "Rust" | "TypeScript";
}

async function fixAllErrors(tasks: FixTask[]) {
  console.log(`🚀 Starting MDAP batch fix for ${tasks.length} files`);

  // Build payloads
  const payloads = await Promise.all(tasks.map(async (task) => {
    const content = await Bun.file(task.filePath).text();
    return {
      payload: {
        taskId: `batch-fix-${Date.now()}`,
        microTaskId: `fix-${task.filePath.replace(/\//g, '-')}`,
        targetFile: task.filePath,
        taskDescription: `Fix ${task.language} compiler errors`,
        language: task.language,
        diffMode: true,
        errors: task.errors,
        fullFileContent: content,
        workDir: process.cwd(),
      }
    };
  }));

  // Trigger batch
  const batchHandle = await tasks.batchTrigger("cfn-mdap-implementer", payloads);
  console.log(`📦 Batch ${batchHandle.batchId} triggered with ${batchHandle.runCount} tasks`);

  // Stream results
  let completed = 0;
  let failed = 0;

  for await (const run of runs.subscribeToBatch(batchHandle.batchId)) {
    if (run.status === "COMPLETED") {
      if (run.output?.success) {
        await Bun.write(run.output.targetFile, run.output.generatedCode);
        console.log(`✓ [${++completed}/${batchHandle.runCount}] Fixed ${run.output.targetFile}`);
      } else {
        console.log(`✗ [${++failed}] Failed: ${run.output?.error}`);
      }
    }
  }

  console.log(`\n✅ Complete: ${completed} fixed, ${failed} failed`);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const language = args[0] || "rust";
  const projectDir = args[1] || ".";

  let errorsByFile: Map<string, any[]>;

  if (language === "rust") {
    errorsByFile = await parseRustErrors(projectDir);
  } else {
    errorsByFile = await parseTypeScriptErrors(projectDir);
  }

  const tasks: FixTask[] = [];
  for (const [filePath, errors] of errorsByFile) {
    tasks.push({
      filePath,
      errors,
      language: language === "rust" ? "Rust" : "TypeScript",
    });
  }

  if (tasks.length === 0) {
    console.log("No errors found!");
    return;
  }

  console.log(`Found ${tasks.length} files with errors`);
  await fixAllErrors(tasks);
}

main().catch(console.error);
```

### 5. Run It

```bash
# Fix Rust errors
TRIGGER_SECRET_KEY=tr_dev_xxx bun run src/fix-all-errors.ts rust /path/to/ourstories-v2/rust

# Fix TypeScript errors
TRIGGER_SECRET_KEY=tr_dev_xxx bun run src/fix-all-errors.ts typescript /path/to/ourstories-v2/frontend
```

---

## How Diff Mode Works

Instead of rewriting entire files (expensive), MDAP uses **diff mode**:

### Phase 1: LLM Analyzes Errors
```
Input: Error at line 45 [E0599]: no method named `new` found
       Error at line 102 [E0560]: struct has no field `id`

       (+ 20 lines of context around each error)

Output: {
  "fixes": [
    {"line": 45, "action": "replace", "content": "Self { ... }"},
    {"line": 102, "action": "insert_after", "content": "id: String,"}
  ]
}
```

### Phase 2: Deterministic Apply
```typescript
// No LLM involved - pure code
function applyFixes(content, fixes) {
  const lines = content.split('\n');
  // Sort reverse to preserve line numbers
  for (const fix of fixes.sort((a,b) => b.line - a.line)) {
    switch (fix.action) {
      case 'replace': lines[fix.line-1] = fix.content; break;
      case 'insert_after': lines.splice(fix.line, 0, fix.content); break;
      case 'delete': lines.splice(fix.line-1, 1); break;
    }
  }
  return lines.join('\n');
}
```

### Token Savings

| File Size | Full Rewrite | Diff Mode | Savings |
|-----------|--------------|-----------|---------|
| 50 lines | ~2K tokens | ~1K | 50% |
| 200 lines | ~8K tokens | ~2K | **75%** |
| 500 lines | ~20K tokens | ~3K | **85%** |
| 1000 lines | ~40K tokens | ~4K | **90%** |

---

## Error Types Supported

### Rust Errors
| Code | Description | MDAP Fix Strategy |
|------|-------------|-------------------|
| E0599 | Method not found | Add impl block or use trait |
| E0560 | Struct field missing | Add field to struct |
| E0308 | Type mismatch | Fix type or add conversion |
| E0277 | Trait not implemented | Add impl or derive |
| E0382 | Moved value | Clone, reference, or restructure |

### TypeScript Errors
| Code | Description | MDAP Fix Strategy |
|------|-------------|-------------------|
| TS2304 | Cannot find name | Add import or declare |
| TS2339 | Property doesn't exist | Add to interface |
| TS2345 | Argument type wrong | Fix type or add conversion |
| TS2322 | Type not assignable | Fix assignment or add guard |

---

## Expected Results for OurStories

Based on your error counts:

| Language | Errors | Est. Files | Est. Time | Est. Cost |
|----------|--------|------------|-----------|-----------|
| Rust | 448 | ~100 | ~3-5 min | ~$0.20 |
| TypeScript | ~500-1000 | ~200 | ~5-8 min | ~$0.30 |

**Total: ~$0.50 and ~10 minutes** (vs 40-80 hours manual)

---

## Iteration Strategy

MDAP may not fix everything in one pass. Recommended workflow:

```bash
# Iteration 1: Fix bulk errors
bun run fix-all-errors.ts rust ./rust
cargo build 2>&1 | grep "error\[" | wc -l  # Check remaining

# Iteration 2: Fix cascading errors (new errors from fixes)
bun run fix-all-errors.ts rust ./rust
cargo build 2>&1 | grep "error\[" | wc -l

# Iteration 3: Handle edge cases
# (Usually 0-10 errors remain for manual review)
```

Expected reduction per iteration:
- Iteration 1: 60-80% of errors fixed
- Iteration 2: 80-95% of remaining fixed
- Iteration 3: Usually clean or <10 manual fixes

---

## Troubleshooting

### Task ID Mismatch (Most Common!)

**CRITICAL**: The registered task ID is `cfn-mdap-implementer`, NOT `rust-error-fixer`.

```typescript
// ❌ WRONG - This task doesn't exist
await tasks.batchTrigger("rust-error-fixer", payloads);

// ✅ CORRECT - Use the actual task ID
await tasks.batchTrigger("cfn-mdap-implementer", payloads);
```

If you're getting "task not found" errors, check your code for the wrong task ID.

### Trigger.dev Dev Server Not Running

The Trigger.dev dev worker process must be running to execute tasks. The web UI (localhost:8030) is separate from the task worker.

```bash
# Start the dev server (in the project with trigger.config.ts)
cd tools/mdap-error-fixer
npx trigger.dev@4.1.2 dev

# Or if using CFN's hosted instance:
# The CFN team runs this - you don't need to start it yourself
```

**Signs dev server isn't running:**
- Tasks trigger successfully but never complete
- No execution logs appearing
- Dashboard shows tasks as "pending" forever

### Cargo Build Lock (Parallel Rust)

When running parallel Rust error fixes, cargo's default target directory gets locked:

```
error: failed to lock target directory
```

**Fix: Use unique target directories per task**

```bash
# In your fix script, set this before cargo commands:
export CARGO_TARGET_DIR="/tmp/cargo-target-$(date +%s)-$$"
```

Or in TypeScript:
```typescript
// Add to your payload
const payload = {
  // ... other fields
  env: {
    CARGO_TARGET_DIR: `/tmp/cargo-target-${Date.now()}-${process.pid}`
  }
};
```

### Payload Structure Mismatch

Ensure your payload matches `MDAPImplementerPayload`:

```typescript
// ✅ CORRECT payload structure
const payload = {
  taskId: `rust-fix-${Date.now()}`,           // Required: unique ID
  microTaskId: `fix-${fileName}`,              // Required: micro-task ID
  targetFile: "/path/to/file.rs",              // Required: file path
  taskDescription: "Fix Rust compiler errors", // Required: description
  language: "Rust",                            // Optional: "Rust" | "TypeScript"
  diffMode: true,                              // Optional: token-efficient mode
  errors: [                                    // Required for diffMode
    { code: "E0599", line: 45, message: "method not found" }
  ],
  fullFileContent: fileContent,                // Required for diffMode
  workDir: process.cwd(),                      // Required: working directory
};

// ❌ WRONG payload (these field names don't exist)
const wrongPayload = {
  filePath: "...",       // Wrong - use targetFile
  contextWindows: [],    // Wrong - use fileContents
  contextFiles: [],      // Wrong - use fileContents
};
```

### "Invalid API Key" (401)
```bash
# Make sure you're using the SECRET key (tr_dev_*), not PAT (tr_pat_*)
echo $TRIGGER_SECRET_KEY  # Should start with tr_dev_
```

### "Model does not exist" (404)
The MDAP implementer uses `zai-glm-4.6` on Cerebras. If you see this error, the CFN team needs to update their API key.

### Fixes Not Applied Correctly
Check the result's `fixesFailed` array:
```typescript
if (result.output?.fixesFailed?.length > 0) {
  console.log("Failed fixes:", result.output.fixesFailed);
}
```

Common reasons:
- Line number changed (file was modified between parse and fix)
- Context mismatch (original line doesn't match)

### Rate Limiting
MDAP has built-in retry with exponential backoff. If you hit limits:
- Reduce batch size (process 50 files at a time instead of 100)
- Add delay between batches: `await Bun.sleep(5000)`

---

## Files You Need

Minimum setup (using CFN's hosted MDAP):

```
ourstories-v2/
└── tools/
    └── mdap-fixer/
        ├── package.json          # Just @trigger.dev/sdk
        ├── src/
        │   ├── parse-rust-errors.ts
        │   ├── parse-typescript-errors.ts
        │   └── fix-all-errors.ts
        └── .env                  # TRIGGER_SECRET_KEY only
```

That's it. No Trigger.dev server needed - you're calling CFN's hosted instance.

---

## Contact

For the secret key or issues:
- CFN Team Slack: #cfn-mdap
- TRIGGER_SECRET_KEY: Ask Mason or the CFN team

