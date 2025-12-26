/**
 * TDD Conversation Coordinator (TypeScript)
 *
 * Iterative TDD with Cerebras SDK + conversation memory for self-correction.
 * Reads context file contents and embeds them in prompts.
 *
 * Uses GLM 4.6 best practices:
 * - disable_reasoning: true (skip verbose reasoning for code generation)
 * - temperature: 0.6 (instruction following)
 * - top_p: 0.95
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, basename, extname, join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Cerebras from '@cerebras/cerebras_cloud_sdk';

// ESM compatibility: Create __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'zai-glm-4.6';

// Initialize Cerebras client (uses CEREBRAS_API_KEY env var by default)
const client = new Cerebras({
  warmTCPConnection: true, // Reduces TTFT
});

// Types
export interface TDDCoordinatorOptions {
  agentId: string;
  feature: string;
  filePath: string;
  contextFiles?: string[];
  testCommand: string;
  maxIterations?: number;
  verbose?: boolean;
}

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface TDDResult {
  success: boolean;
  implementationFile: string;
  testFile: string;
  iterations: number;
  conversationId: string;
  error?: string;
}


export class TDDConversationCoordinator {
  private options: Required<Omit<TDDCoordinatorOptions, 'contextFiles'>> & { contextFiles: string[] };
  private conversation: ConversationMessage[] = [];
  private conversationId: string;

  constructor(options: TDDCoordinatorOptions) {
    this.options = {
      maxIterations: 5,
      verbose: false,
      contextFiles: [],
      ...options
    };
    this.conversationId = `${options.agentId}-${Date.now()}`;
    this.initConversation();
  }

  private initConversation(): void {
    this.conversation = [{
      role: 'system',
      content: `You are a TDD expert. Follow Red-Green-Refactor strictly. Use Given/When/Then test structure. Generate ONLY code - no markdown code blocks, no explanations, just raw code.`
    }];
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.error(`[${new Date().toISOString()}] ${message}`);
    }
  }

  private logError(message: string): void {
    console.error(`[ERROR] ${message}`);
  }

  /**
   * Call Cerebras API with full conversation history
   */
  private async callCerebras(prompt: string): Promise<string> {
    // Add user message to conversation
    this.conversation.push({
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    });

    this.log(`Calling Cerebras (${CEREBRAS_MODEL}) with ${this.conversation.length} messages...`);

    const completion = await client.chat.completions.create({
      model: CEREBRAS_MODEL,
      messages: this.conversation.map(m => ({ role: m.role, content: m.content })),
      max_completion_tokens: 20000,
      temperature: 0.6,  // Recommended for instruction following
      top_p: 0.95,       // Recommended default
      // @ts-expect-error disable_reasoning is undocumented but supported
      disable_reasoning: true,  // Skip verbose reasoning for code generation
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Cerebras API');
    }

    // Add assistant response to conversation
    this.conversation.push({
      role: 'assistant',
      content,
      timestamp: new Date().toISOString()
    });

    this.log(`Received response (${content.length} chars)`);
    return content;
  }

  /**
   * Read context files and return their contents formatted for prompts
   */
  private readContextFiles(): string {
    if (!this.options.contextFiles.length) {
      return '';
    }

    const sections: string[] = [];

    for (const filePath of this.options.contextFiles) {
      const trimmedPath = filePath.trim();
      if (!trimmedPath) continue;

      if (!existsSync(trimmedPath)) {
        this.logError(`Context file not found: ${trimmedPath}`);
        continue;
      }

      try {
        const content = readFileSync(trimmedPath, 'utf-8');
        this.log(`Loaded context: ${trimmedPath} (${content.length} chars)`);
        sections.push(`## ${trimmedPath}\n\`\`\`\n${content}\n\`\`\``);
      } catch (err) {
        this.logError(`Failed to read ${trimmedPath}: ${err}`);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Determine test file path based on implementation file
   */
  private getTestFilePath(): string {
    const ext = extname(this.options.filePath);
    const base = basename(this.options.filePath, ext);
    const dir = dirname(this.options.filePath);

    switch (ext) {
      case '.ts':
      case '.tsx':
        return join(dir, `${base}.test.ts`);
      case '.js':
      case '.jsx':
        return join(dir, `${base}.test.js`);
      case '.py':
        return join(dir, `test_${base}.py`);
      case '.go':
        return join(dir, `${base}_test.go`);
      case '.rs':
        return join(dir, `${base}_test.rs`);
      default:
        return join(dir, `${base}.test${ext}`);
    }
  }

  /**
   * Extract code from response (removes markdown blocks if present)
   */
  private extractCode(content: string): string {
    // Try to extract from markdown code block
    const codeBlockMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    // Return as-is if no code block
    return content.trim();
  }

  /**
   * Run test command and capture output
   */
  private runTests(): { success: boolean; output: string } {
    this.log(`Running: ${this.options.testCommand}`);

    try {
      // Change to implementation file's directory for test execution
      // This fixes vitest/jest issues with absolute paths
      const workDir = dirname(this.options.filePath);
      this.log(`Working directory: ${workDir}`);

      const output = execSync(this.options.testCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000, // 60 second timeout
        cwd: workDir // Run from the directory containing the files
      });
      return { success: true, output };
    } catch (err: unknown) {
      const error = err as { stderr?: string; stdout?: string; message?: string };
      const output = error.stderr || error.stdout || error.message || 'Unknown error';
      return { success: false, output };
    }
  }

  /**
   * Save conversation to file for learning
   */
  private saveConversation(): void {
    try {
      const dir = join(__dirname, '..', 'conversations');
      mkdirSync(dir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const file = join(dir, `${date}-${this.options.agentId}.json`);

      const data = {
        conversationId: this.conversationId,
        metadata: {
          agentId: this.options.agentId,
          feature: this.options.feature,
          filePath: this.options.filePath,
          contextFiles: this.options.contextFiles,
          completedAt: new Date().toISOString()
        },
        conversation: this.conversation
      };

      writeFileSync(file, JSON.stringify(data, null, 2));
      this.log(`Conversation saved: ${file}`);
    } catch (err) {
      this.logError(`Failed to save conversation: ${err}`);
    }
  }

  /**
   * Run the full TDD workflow
   */
  async run(): Promise<TDDResult> {
    console.log('🧪 TDD Conversation Coordinator (TypeScript)');
    console.log('='.repeat(50));
    console.log(`Feature:        ${this.options.feature}`);
    console.log(`Target File:    ${this.options.filePath}`);
    console.log(`Agent ID:       ${this.options.agentId}`);
    console.log(`Max Iterations: ${this.options.maxIterations}`);
    console.log(`Test Command:   ${this.options.testCommand}`);
    console.log('='.repeat(50));
    console.log();

    const testFile = this.getTestFilePath();
    const contextContent = this.readContextFiles();

    // === PHASE 2: Generate tests (RED) ===
    console.log('🔴 Phase 2 (RED): Generating failing tests...');

    const testPrompt = `# TDD Red Phase: Write Failing Tests

## Feature
${this.options.feature}

## Target Implementation File
${this.options.filePath}

## Context Files
${contextContent || '(none provided)'}

## Requirements
1. Write comprehensive tests using STANDARD test framework syntax (do NOT create custom helper functions):
   - **TypeScript/JavaScript**: Use describe/it/expect blocks from vitest or jest
     - Import framework: \`import { describe, it, expect } from 'vitest';\`
     - Import functions: \`import { functionName } from './filename';\`
     - Structure: \`describe('feature', () => { it('should...', () => { expect(...).toBe(...) }) })\`
   - **Python**: Use pytest with def test_* functions
     - Import: \`from filename import ClassName\` or \`import pytest\`
     - Structure: \`def test_feature(): assert value == expected\`
   - **Rust**: Use #[test] attribute or #[cfg(test)] module
     - Import: \`use super::*;\` or \`use crate::module::*;\`
     - Structure: \`#[test] fn test_name() { assert_eq!(result, expected) }\`
2. Tests MUST fail initially (no implementation exists yet)
3. Cover happy path AND edge cases
4. Include setup/teardown if needed
5. **CRITICAL: Include ALL necessary import statements at the top of the test file**
6. **Do NOT create custom test helper functions (Given/When/Then helpers, etc.)**

IMPORTANT: Generate ONLY the test file content. No markdown code blocks, no explanations, just raw code.`;

    let testCode: string;
    try {
      testCode = this.extractCode(await this.callCerebras(testPrompt));
    } catch (err) {
      return {
        success: false,
        implementationFile: this.options.filePath,
        testFile,
        iterations: 0,
        conversationId: this.conversationId,
        error: `Test generation failed: ${err}`
      };
    }

    // Write test file
    mkdirSync(dirname(testFile), { recursive: true });
    writeFileSync(testFile, testCode);
    console.log(`📝 Tests written to: ${testFile}`);

    // === PHASE 4: Generate implementation (GREEN) ===
    console.log('🟢 Phase 4 (GREEN): Generating implementation...');

    const implPrompt = `# TDD Green Phase: Write Implementation

The tests you just wrote are now failing. Write the MINIMUM implementation to make them pass.

## Test File Content
\`\`\`
${testCode}
\`\`\`

## Target Implementation File
${this.options.filePath}

## Requirements
1. Implement ONLY what the tests require
2. Don't add extra features (YAGNI)
3. Make all tests pass
4. Follow existing code patterns from context
5. **CRITICAL: Export all functions/classes that the tests import**
6. **For TypeScript/JavaScript: use \`export function name()\` or \`export { name }\`**
7. **For Python: functions are exported by default**
8. **For Rust: use \`pub fn name()\` for public functions**

IMPORTANT: Generate ONLY the implementation file content. No markdown code blocks, no explanations, just raw code.`;

    let implCode: string;
    try {
      implCode = this.extractCode(await this.callCerebras(implPrompt));
    } catch (err) {
      return {
        success: false,
        implementationFile: this.options.filePath,
        testFile,
        iterations: 0,
        conversationId: this.conversationId,
        error: `Implementation generation failed: ${err}`
      };
    }

    // Write implementation file
    mkdirSync(dirname(this.options.filePath), { recursive: true });
    writeFileSync(this.options.filePath, implCode);
    console.log(`📝 Implementation written to: ${this.options.filePath}`);

    // === PHASE 5-6: Test + Fix Loop ===
    for (let iteration = 1; iteration <= this.options.maxIterations; iteration++) {
      console.log();
      console.log(`--- Iteration ${iteration}/${this.options.maxIterations} ---`);

      const { success, output } = this.runTests();

      if (success) {
        console.log('🎉 SUCCESS! All tests pass.');
        this.saveConversation();

        return {
          success: true,
          implementationFile: this.options.filePath,
          testFile,
          iterations: iteration,
          conversationId: this.conversationId
        };
      }

      console.log('❌ Tests failed, sending error to Cerebras for fix...');

      // Detect if error is test-related or implementation-related
      const errorLower = output.toLowerCase();

      // Implementation issues (assertion failures, logic errors) - check FIRST
      const isImplementationIssue =
        errorLower.includes('expected') ||          // Assertion: expected X but got Y
        errorLower.includes('assertion') ||         // Assertion failure
        errorLower.includes('to be') ||             // expect(x).toBe(y) failures
        errorLower.includes('to equal') ||          // expect(x).toEqual(y) failures
        errorLower.includes('received') ||          // Jest: Expected X, Received Y
        errorLower.includes('assert') ||            // assert failures
        /\d+ (passing|failed)/.test(errorLower);    // Test results with failures = impl issue

      // Test file issues (syntax, imports, missing files) - only if NOT impl issue
      const isTestFileIssue = !isImplementationIssue && (
        errorLower.includes('no test') ||
        errorLower.includes('cannot find test') ||
        errorLower.includes('test file') ||
        errorLower.includes('error: no tests') ||
        errorLower.includes('cannot find module') ||     // Import errors
        errorLower.includes('is not defined') ||         // Missing imports
        errorLower.includes('syntaxerror') ||            // Syntax errors in test
        (errorLower.includes('cannot find') && testFile && errorLower.includes(basename(testFile)))
      );

      const targetFile = isTestFileIssue ? testFile : this.options.filePath;
      const fileType = isTestFileIssue ? 'TEST' : 'IMPLEMENTATION';

      console.log(`🔍 Detected ${fileType} file issue, will fix: ${targetFile}`);

      const fixPrompt = `# Fix Required - Tests Still Failing (Iteration ${iteration})

## Error Output
\`\`\`
${output.slice(0, 2000)}
\`\`\`

## Target File to Fix
${fileType} file: ${targetFile}

## Instructions
1. Carefully analyze the error output above
2. Review your previous ${fileType.toLowerCase()} in the conversation
3. Identify what's wrong (logic error, **missing imports**, missing edge case, incorrect behavior)
4. **CRITICAL: If error says "X is not defined" or "cannot find name X":**
   - Check if X exists in the implementation file
   - If YES: Add import statement to the TEST file (not implementation)
   - Example: \`import { X } from './filename';\`
5. Fix ONLY the specific issue in the ${fileType} file
6. Preserve all working functionality

IMPORTANT: Generate the COMPLETE fixed ${fileType} file content for ${basename(targetFile)}. No markdown code blocks, no explanations, just raw code.`;

      try {
        const fixedCode = this.extractCode(await this.callCerebras(fixPrompt));
        writeFileSync(targetFile, fixedCode);
        console.log(`📝 Fixed ${fileType} written to: ${targetFile}`);
      } catch (err) {
        this.logError(`Fix generation failed: ${err}`);
      }
    }

    console.log();
    console.log(`❌ Failed after ${this.options.maxIterations} iterations`);
    this.saveConversation();

    return {
      success: false,
      implementationFile: this.options.filePath,
      testFile,
      iterations: this.options.maxIterations,
      conversationId: this.conversationId,
      error: `Failed after ${this.options.maxIterations} iterations`
    };
  }
}

// === CLI Entry Point ===
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
TDD Conversation Coordinator (TypeScript)

Usage:
  npx ts-node tdd-conversation-coordinator.ts [options]

Required Options:
  --agent-id ID           Agent identifier
  --feature DESCRIPTION   Feature to implement
  --file-path PATH        Target implementation file
  --test-command CMD      Command to run tests

Optional:
  --context-files FILES   Comma-separated context file paths
  --max-iterations N      Max fix iterations (default: 5)
  --verbose               Enable verbose logging

Environment Variables:
  CEREBRAS_API_KEY       Cerebras API key (required, auto-loaded by SDK)
  CEREBRAS_MODEL         Model name (default: zai-glm-4.6)

Example:
  npx ts-node tdd-conversation-coordinator.ts \\
    --agent-id tdd-001 \\
    --feature "Email validator" \\
    --file-path ./src/email.ts \\
    --test-command "npm test email.test.ts" \\
    --context-files "./src/types.ts,./src/utils.ts" \\
    --max-iterations 3 \\
    --verbose
`);
    process.exit(0);
  }

  // Parse arguments
  const options: Partial<TDDCoordinatorOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }

    if (arg.startsWith('--') && i + 1 < args.length) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = args[++i];

      switch (key) {
        case 'agentId':
          options.agentId = value;
          break;
        case 'feature':
          options.feature = value;
          break;
        case 'filePath':
          options.filePath = value;
          break;
        case 'testCommand':
          options.testCommand = value;
          break;
        case 'contextFiles':
          options.contextFiles = value.split(',').map(f => f.trim());
          break;
        case 'maxIterations':
          options.maxIterations = parseInt(value, 10);
          break;
      }
    }
  }

  // Validate required options
  if (!options.agentId || !options.feature || !options.filePath || !options.testCommand) {
    console.error('Error: Missing required arguments');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Run coordinator
  const coordinator = new TDDConversationCoordinator(options as TDDCoordinatorOptions);
  const result = await coordinator.run();

  console.log();
  console.log('Result:');
  console.log(JSON.stringify(result, null, 2));

  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
