/**
 * CFN Implementer v2 Task
 *
 * Enhanced implementer with Redis completion signaling and database tracking.
 * Executes Claude Code CLI for agent work and signals completion via Redis LPUSH.
 *
 * Key features:
 * - Uses executeClaudeCli() from cli-executor (with forceKillAfterDelay)
 * - Builds TDD-focused prompts
 * - Runs tests after implementation
 * - Signals completion via Redis (LPUSH to cfn:complete:${taskId})
 * - Updates agent status in Postgres via cfn-db
 * - Calculates confidence based on success/tests
 * - MDAP integration for model tier selection and metrics tracking
 *
 * Reference: planning/trigger/architecture/TRIGGER_CFN_IMPLEMENTATION_PLAN.md Phase 3.3
 */

import { task } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db.js";
import * as redis from "../lib/cfn-redis.js";
import { executeClaudeCli, executeCommand } from "../lib/cli-executor.js";
import {
  selectModelTier,
  estimateCost,
  getTierSummary,
  type ModelTier,
} from "../lib/mdap-config.js";
import { getModelForProvider } from "../lib/provider-model-resolver.js";
import { recordMDAPExecution } from "../lib/mdap-db.js";

// =============================================
// Types
// =============================================

/**
 * Payload for the implementer task
 */
export interface ImplementerV2Payload {
  /** CFN Loop task ID */
  taskId: string;
  /** Unique agent identifier */
  agentId: string;
  /** Iteration ID in Postgres */
  iterationId: number;
  /** Agent specialization type */
  agentType: string;
  /** Description of the work to perform */
  taskDescription: string;
  /** Working directory for CLI execution */
  workDir: string;
  /** Files the agent should work on */
  files: string[];
  /** Test files to verify implementation */
  tests: string[];
  /** AI provider: zai (default), anthropic, kimi, etc. */
  provider?: 'zai' | 'kimi' | 'anthropic' | 'openrouter' | 'gemini' | 'xai';
  /** Timeout in milliseconds (default: 600000 = 10 minutes) */
  timeout?: number;
  /** Phase ID in Postgres (optional) */
  phaseId?: number;
  /** Test command pattern (default: npm test) */
  testCommand?: string;
  /** Additional environment variable overrides */
  _env?: Record<string, string>;
  /** Enable MDAP tier selection and metrics (default: true) */
  enableMDAP?: boolean;
  /** Task complexity level for MDAP tier selection (should always be 'simple' for atomic tasks) */
  complexityLevel?: 'simple' | 'moderate' | 'complex' | 'large';
  /** Override model tier (1-5) - only used if enableMDAP is true */
  modelTier?: number;
  /** Number of previous failures (for escalation) - only used if enableMDAP is true */
  failureCount?: number;
}

/**
 * Result from the implementer task
 */
export interface ImplementerV2Result {
  /** Overall success (CLI completed + tests passed) */
  success: boolean;
  /** Whether agent tests passed */
  testsPassed: boolean;
  /** Confidence score (0.1-0.9) */
  confidence: number;
  /** Files that were modified */
  filesModified: string[];
  /** Execution duration in milliseconds */
  durationMs: number;
  /** CLI stdout output */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Whether the CLI timed out */
  timedOut: boolean;
  /** Test results summary */
  testResults?: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    passRate: number;
  };
  /** MDAP metrics */
  mdap?: {
    /** Model tier used (1-5) */
    modelTier: number;
    /** Model tier name */
    tierName: string;
    /** Model name used */
    modelName: string;
    /** Estimated cost */
    estimatedCost: number;
  };
}

// =============================================
// Provider Configuration
// =============================================

const PROVIDER_CONFIG: Record<string, { baseUrl?: string; apiKeyEnv: string }> = {
  zai: { baseUrl: 'https://api.z.ai/api/anthropic', apiKeyEnv: 'ZAI_API_KEY' },
  kimi: { baseUrl: 'https://api.moonshot.cn/v1', apiKeyEnv: 'KIMI_API_KEY' },
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKeyEnv: 'GEMINI_API_KEY' },
  xai: { baseUrl: 'https://api.x.ai/v1', apiKeyEnv: 'XAI_API_KEY' },
};

// =============================================
// Helper Functions
// =============================================

/**
 * Build environment variables for CLI execution with provider routing
 */
function buildCliEnvironment(
  payload: ImplementerV2Payload
): Record<string, string | undefined> {
  const provider = payload.provider || 'zai';
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.zai;

  const env: Record<string, string | undefined> = { ...process.env };

  // Determine API key from various sources
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  // 1. Check payload._env overrides first
  if (payload._env) {
    apiKey = payload._env.ANTHROPIC_API_KEY || payload._env.ZAI_API_KEY;
    baseUrl = payload._env.ANTHROPIC_BASE_URL || payload._env.ZAI_BASE_URL;
  }

  // 2. Try provider-specific environment variable
  if (!apiKey) {
    apiKey = process.env[config.apiKeyEnv];
  }

  // 3. Fallback to ANTHROPIC_API_KEY for non-anthropic providers
  if (!apiKey && provider !== 'anthropic') {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && !anthropicKey.includes('placeholder')) {
      apiKey = anthropicKey;
    }
  }

  // Use provider's base URL if not overridden
  if (!baseUrl && config.baseUrl) {
    baseUrl = config.baseUrl;
  }

  // Set the final environment variables
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }
  if (baseUrl) {
    env.ANTHROPIC_BASE_URL = baseUrl;
  }

  // Apply any additional _env overrides
  if (payload._env) {
    Object.assign(env, payload._env);
  }

  return env;
}

/**
 * Build TDD-focused prompt for the implementer agent
 */
export function buildImplementerPrompt(payload: ImplementerV2Payload): string {
  const parts: string[] = [];

  // Main task description
  parts.push(`## Task: ${payload.taskDescription}`);
  parts.push('');

  // Agent type context
  parts.push(`You are acting as a ${payload.agentType} agent.`);
  parts.push('');

  // Files to work on
  if (payload.files.length > 0) {
    parts.push('## Files to Modify');
    parts.push('Work on these files:');
    payload.files.forEach(file => parts.push(`- ${file}`));
    parts.push('');
  }

  // Tests to pass
  if (payload.tests.length > 0) {
    parts.push('## Tests to Pass');
    parts.push('Ensure these tests pass after your implementation:');
    payload.tests.forEach(test => parts.push(`- ${test}`));
    parts.push('');
  }

  // TDD instructions
  parts.push('## Development Approach');
  parts.push('Follow TDD (Test-Driven Development):');
  parts.push('1. First, understand the existing tests or write new tests');
  parts.push('2. Implement the minimum code to make tests pass');
  parts.push('3. Refactor while keeping tests green');
  parts.push('');

  // Behavioral instructions
  parts.push('## Important Guidelines');
  parts.push('- Do NOT ask questions - make reasonable decisions and proceed');
  parts.push('- Use the Edit and Write tools to modify files');
  parts.push('- Run tests using Bash to verify your changes');
  parts.push('- Keep changes focused and minimal');
  parts.push('- Add comments to explain non-obvious code');

  return parts.join('\n');
}

/**
 * Run tests for specific test files
 */
export async function runAgentTests(
  workDir: string,
  tests: string[],
  testCommand?: string
): Promise<{
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}> {
  const startTime = Date.now();

  // Default to npm test with pattern matching
  const command = testCommand || 'npm';
  let args: string[];

  if (testCommand) {
    // Use custom command as-is (split by spaces)
    args = testCommand.split(' ').slice(1);
  } else {
    // Build npm test command with test pattern
    const testPattern = tests.map(t => t.replace(/\\/g, '/')).join('|');
    args = ['test', '--', '--testPathPattern', testPattern, '--passWithNoTests'];
  }

  console.log(`[implementer-v2] Running tests: ${command} ${args.join(' ')}`);

  try {
    const result = await executeCommand(command, args, {
      cwd: workDir,
      timeout: 120000, // 2 minutes for tests
      forceKillAfterDelay: 5000,
    });

    const durationMs = Date.now() - startTime;

    // Parse test output for counts (basic parsing)
    // Jest output format: "Tests: X passed, Y failed, Z total"
    const testsMatch = result.stdout.match(/Tests:\s*(\d+)\s*passed.*?(\d+)\s*failed.*?(\d+)\s*total/i);
    const jestPassed = result.stdout.match(/(\d+)\s*passed/i);
    const jestFailed = result.stdout.match(/(\d+)\s*failed/i);

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    if (testsMatch) {
      passedTests = parseInt(testsMatch[1]) || 0;
      failedTests = parseInt(testsMatch[2]) || 0;
      totalTests = parseInt(testsMatch[3]) || 0;
    } else {
      // Fallback parsing
      passedTests = jestPassed ? parseInt(jestPassed[1]) : 0;
      failedTests = jestFailed ? parseInt(jestFailed[1]) : 0;
      totalTests = passedTests + failedTests;
    }

    const passRate = totalTests > 0 ? passedTests / totalTests : (result.success ? 1 : 0);

    return {
      passed: result.success && failedTests === 0,
      totalTests,
      passedTests,
      failedTests,
      passRate,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    return {
      passed: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      passRate: 0,
      stdout: '',
      stderr: (error as Error).message,
      durationMs,
    };
  }
}

/**
 * Calculate confidence score based on execution results
 *
 * Scoring:
 * - 0.1: Failed execution
 * - 0.3: Timed out
 * - 0.5: Success but no tests or tests failed
 * - 0.7: Success with tests but some failures
 * - 0.9: Success with all tests passing
 */
export function calculateConfidence(
  success: boolean,
  testsPassed: boolean,
  timedOut: boolean,
  hasTests: boolean
): number {
  if (!success) return 0.1;
  if (timedOut) return 0.3;
  if (!hasTests) return 0.5;
  if (!testsPassed) return 0.5;
  return 0.9;
}

// =============================================
// Task Definition
// =============================================

export const cfnImplementerV2Task = task({
  id: "cfn-implementer-v2",
  retry: { maxAttempts: 2 },

  run: async (payload: ImplementerV2Payload): Promise<ImplementerV2Result> => {
    const startTime = Date.now();
    const enableMDAP = payload.enableMDAP !== false; // Default: true
    const provider = payload.provider || 'zai';

    // MDAP: Select model tier based on failure history
    // CRITICAL: For true MDAP (micro-tasks), complexity is always 'simple' (atomic units)
    // The coordinator should have already broken down work into atomic micro-tasks
    let modelTier: ModelTier;
    let modelName: string;
    let mdapCost = 0; // Declared outside try block for return statement

    if (enableMDAP) {
      // MDAP mode: Force 'simple' complexity (atomic micro-tasks)
      // Escalate tier ONLY on failures via failureCount
      modelTier = selectModelTier(
        'simple',  // Always atomic for MDAP
        payload.modelTier || 1,
        payload.failureCount || 0
      );
      modelName = getModelForProvider(modelTier, provider);
      console.log(`[implementer-v2] MDAP enabled: ${getTierSummary(modelTier)} -> ${modelName}`);
    } else {
      // Non-MDAP mode: Use tier 2 (balanced) as default, respect complexity hints
      modelTier = selectModelTier(
        payload.complexityLevel || 'moderate',
        payload.modelTier || 2,
        payload.failureCount || 0
      );
      modelName = getModelForProvider(modelTier, provider);
      console.log(`[implementer-v2] MDAP disabled: Using ${getTierSummary(modelTier)} -> ${modelName}`);
    }

    console.log(`[implementer-v2] Starting implementation`);
    console.log(`[implementer-v2] Task ID: ${payload.taskId}`);
    console.log(`[implementer-v2] Agent ID: ${payload.agentId}`);
    console.log(`[implementer-v2] Agent Type: ${payload.agentType}`);
    console.log(`[implementer-v2] Work Dir: ${payload.workDir}`);
    console.log(`[implementer-v2] Files: ${payload.files.join(', ')}`);
    console.log(`[implementer-v2] Tests: ${payload.tests.join(', ')}`);
    console.log(`[implementer-v2] Provider: ${provider}`);
    console.log(`[implementer-v2] Complexity: ${payload.complexityLevel || 'moderate'}, Failures: ${payload.failureCount || 0}`);

    // Log to database
    try {
      await db.logger.info('implementer-v2', 'Starting implementation', {
        taskId: payload.taskId,
        agentId: payload.agentId,
        data: {
          agentType: payload.agentType,
          filesCount: payload.files.length,
          testsCount: payload.tests.length,
          provider,
          mdap: {
            tier: modelTier.tier,
            tierName: modelTier.name,
            modelName,
            complexityLevel: payload.complexityLevel || 'moderate',
          },
        },
      });
    } catch (dbError) {
      console.warn(`[implementer-v2] Database logging failed: ${(dbError as Error).message}`);
    }

    // Set agent status in Redis
    try {
      await redis.setAgentStatus(payload.agentId, 'running', {
        taskId: payload.taskId,
        agentType: payload.agentType,
        startedAt: startTime,
      });
    } catch (redisError) {
      console.warn(`[implementer-v2] Redis status update failed: ${(redisError as Error).message}`);
    }

    try {
      // Build CLI environment with provider routing
      const cliEnv = buildCliEnvironment(payload);

      // Build TDD-focused prompt
      const prompt = buildImplementerPrompt(payload);

      console.log(`[implementer-v2] Executing CLI with prompt (${prompt.length} chars)`);

      // Execute Claude Code CLI
      // CRITICAL: --dangerously-skip-permissions is required for non-interactive execution
      // Without it, the CLI waits for user permission prompts and times out
      const cliResult = await executeClaudeCli(
        ['-p', prompt, '--allowedTools', 'Edit,Write,Read,Bash,Glob,Grep', '--dangerously-skip-permissions'],
        {
          cwd: payload.workDir,
          timeout: payload.timeout || 600000,
          forceKillAfterDelay: 5000,
          env: cliEnv,
        }
      );

      console.log(`[implementer-v2] CLI execution completed`);
      console.log(`[implementer-v2] CLI success: ${cliResult.success}`);
      console.log(`[implementer-v2] CLI timed out: ${cliResult.timedOut}`);
      console.log(`[implementer-v2] CLI duration: ${cliResult.durationMs}ms`);

      // Log timeout warning if applicable
      if (cliResult.timedOut) {
        try {
          await db.logger.warn('implementer-v2', 'CLI execution timed out', {
            taskId: payload.taskId,
            agentId: payload.agentId,
            data: { durationMs: cliResult.durationMs },
          });
        } catch (dbError) {
          console.warn(`[implementer-v2] Timeout logging failed: ${(dbError as Error).message}`);
        }
      }

      // Determine initial success
      const cliSuccess = cliResult.success && !cliResult.timedOut;

      // Run tests if specified and CLI succeeded
      let testsPassed = true;
      let testResults: ImplementerV2Result['testResults'] | undefined;

      if (payload.tests.length > 0 && cliSuccess) {
        console.log(`[implementer-v2] Running ${payload.tests.length} tests`);
        const testResult = await runAgentTests(
          payload.workDir,
          payload.tests,
          payload.testCommand
        );

        testsPassed = testResult.passed;
        testResults = {
          totalTests: testResult.totalTests,
          passedTests: testResult.passedTests,
          failedTests: testResult.failedTests,
          passRate: testResult.passRate,
        };

        console.log(`[implementer-v2] Tests passed: ${testsPassed}`);
        console.log(`[implementer-v2] Test results: ${testResult.passedTests}/${testResult.totalTests}`);

        // Record test run in database
        try {
          await db.recordTestRun({
            taskId: payload.taskId,
            iterationId: payload.iterationId,
            agentId: payload.agentId,
            testCommand: payload.testCommand || 'npm test',
            workDir: payload.workDir,
            exitCode: testResult.passed ? 0 : 1,
            durationMs: testResult.durationMs,
            totalTests: testResult.totalTests,
            passedTests: testResult.passedTests,
            failedTests: testResult.failedTests,
            stdout: testResult.stdout.slice(0, 10000),
            stderr: testResult.stderr.slice(0, 5000),
          });
        } catch (dbError) {
          console.warn(`[implementer-v2] Test recording failed: ${(dbError as Error).message}`);
        }
      }

      // Calculate confidence
      const confidence = calculateConfidence(
        cliSuccess,
        testsPassed,
        cliResult.timedOut,
        payload.tests.length > 0
      );

      const durationMs = Date.now() - startTime;
      const overallSuccess = cliSuccess && testsPassed;

      console.log(`[implementer-v2] Overall success: ${overallSuccess}`);
      console.log(`[implementer-v2] Confidence: ${confidence}`);
      console.log(`[implementer-v2] Total duration: ${durationMs}ms`);

      // Signal completion via Redis (critical - orchestrator waits on this)
      try {
        await redis.signalCompletion(payload.taskId, {
          agentId: payload.agentId,
          status: overallSuccess ? 'completed' : 'failed',
          success: overallSuccess,
          testsPassed,
          confidence,
          filesModified: payload.files,
          errorMessage: overallSuccess ? undefined : (cliResult.error || cliResult.stderr),
          durationMs,
          completedAt: Date.now(),
        });
        console.log(`[implementer-v2] Redis completion signal sent`);
      } catch (redisError) {
        console.error(`[implementer-v2] Redis signaling failed: ${(redisError as Error).message}`);
        // Don't throw - the task still completed, just signaling failed
      }

      // Update database
      try {
        await db.updateAgentStatus(payload.agentId, overallSuccess ? 'completed' : 'failed', {
          success: overallSuccess,
          testsPassed,
          confidence,
          filesModified: payload.files,
          errorMessage: overallSuccess ? undefined : (cliResult.error || cliResult.stderr),
          durationMs,
          output: { stdout: cliResult.stdout.slice(0, 10000), testResults },
        });

        await db.logger.info('implementer-v2', 'Implementation complete', {
          taskId: payload.taskId,
          agentId: payload.agentId,
          data: { success: overallSuccess, testsPassed, confidence, durationMs },
        });
      } catch (dbError) {
        console.warn(`[implementer-v2] Database update failed: ${(dbError as Error).message}`);
      }

      // Record MDAP execution metrics (only if MDAP is enabled)
      if (enableMDAP) {
        mdapCost = estimateCost(modelTier, 0, 0); // Token counts not available from CLI
        try {
          await recordMDAPExecution({
            taskId: payload.taskId,
            agentId: payload.agentId,
            modelTier: modelTier.tier,
            modelName,
            provider,
            success: overallSuccess,
            confidence,
            latencyMs: durationMs,
            estimatedCost: mdapCost,
            complexityLevel: 'simple', // Always simple for MDAP micro-tasks
            wasEscalated: (payload.failureCount || 0) > 0,
          });
          console.log(`[implementer-v2] MDAP execution recorded: tier=${modelTier.tier} cost=${mdapCost.toFixed(4)}`);
        } catch (mdapError) {
          console.warn(`[implementer-v2] MDAP recording failed: ${(mdapError as Error).message}`);
        }
      } else {
        console.log(`[implementer-v2] MDAP metrics disabled, skipping recordMDAPExecution`);
      }

      // Return result (also stored by Trigger.dev)
      return {
        success: overallSuccess,
        testsPassed,
        confidence,
        filesModified: payload.files,
        durationMs,
        output: cliResult.stdout,
        timedOut: cliResult.timedOut,
        testResults,
        error: overallSuccess ? undefined : (cliResult.error || cliResult.stderr),
        mdap: {
          modelTier: modelTier.tier,
          tierName: modelTier.name,
          modelName,
          estimatedCost: mdapCost,
        },
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      console.error(`[implementer-v2] Implementation failed: ${errorMessage}`);

      // Log error to database
      try {
        await db.logger.error('implementer-v2', 'Implementation failed', error as Error, {
          taskId: payload.taskId,
          agentId: payload.agentId,
        });
      } catch (dbError) {
        console.warn(`[implementer-v2] Error logging failed: ${(dbError as Error).message}`);
      }

      // Signal failure via Redis (critical - orchestrator needs to know)
      try {
        await redis.signalCompletion(payload.taskId, {
          agentId: payload.agentId,
          status: 'failed',
          success: false,
          testsPassed: false,
          confidence: 0.1,
          errorMessage,
          durationMs,
          completedAt: Date.now(),
        });
        console.log(`[implementer-v2] Redis failure signal sent`);
      } catch (redisError) {
        console.error(`[implementer-v2] Redis failure signaling failed: ${(redisError as Error).message}`);
      }

      // Update agent status in database
      try {
        await db.updateAgentStatus(payload.agentId, 'failed', {
          success: false,
          errorMessage,
          durationMs,
        });
      } catch (dbError) {
        console.warn(`[implementer-v2] Agent status update failed: ${(dbError as Error).message}`);
      }

      // Record MDAP failure metrics
      mdapCost = estimateCost(modelTier, 0, 0);
      try {
        await recordMDAPExecution({
          taskId: payload.taskId,
          agentId: payload.agentId,
          modelTier: modelTier.tier,
          modelName,
          provider,
          success: false,
          confidence: 0.1,
          latencyMs: durationMs,
          estimatedCost: mdapCost,
          complexityLevel: payload.complexityLevel || 'moderate',
          wasEscalated: (payload.failureCount || 0) > 0,
        });
        console.log(`[implementer-v2] MDAP failure recorded: tier=${modelTier.tier}`);
      } catch (mdapError) {
        console.warn(`[implementer-v2] MDAP failure recording failed: ${(mdapError as Error).message}`);
      }

      // Re-throw to let Trigger.dev handle retries
      throw error;
    }
  },
});
