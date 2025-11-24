/**
 * Agent Executor
 *
 * Executes CLI-spawned agents by:
 * 1. Checking custom routing configuration (z.ai vs Anthropic)
 * 2. Invoking the appropriate API
 * 3. Managing agent lifecycle and output
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient, RedisClientType } from 'redis';
import { AgentDefinition } from './agent-definition-parser.js';
import { TaskContext, getAgentId } from './agent-prompt-builder.js';
import { buildCLIAgentSystemPrompt, loadContextFromEnv } from './cli-agent-context.js';
import {
  loadMessages,
  storeMessage,
  getCurrentFork,
  formatMessagesForAPI,
  type Message
} from './conversation-fork.js';
import { convertToolNames } from './tool-definitions.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const execAsync = promisify(exec);

// DEBUG: File-based logging for background agents (stdio: 'ignore' masks errors)
const AGENT_ID = process.env.AGENT_ID || 'unknown';
const LOG_FILE = `/tmp/cfn-agent-${AGENT_ID}.log`;
function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = data
    ? `${timestamp} [${AGENT_ID}] ${message} ${JSON.stringify(data)}\n`
    : `${timestamp} [${AGENT_ID}] ${message}\n`;
  try {
    fsSync.appendFileSync(LOG_FILE, logEntry);
  } catch (err) {
    // Ignore logging errors
  }
}

debugLog('=== Agent Executor Started ===');

/**
 * Detect project root dynamically
 * Uses PROJECT_ROOT env var if set, otherwise tries git, falls back to cwd
 */
function getProjectRoot(): string {
  // 1. Check environment variable
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }

  // 2. Try git rev-parse (most reliable)
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (gitRoot) {
      return gitRoot;
    }
  } catch {
    // Fall through to next method
  }

  // 3. Fall back to current working directory
  return process.cwd();
}

const projectRoot = getProjectRoot();

// Bug #6 Fix: Read Redis connection parameters from process.env
// ENV-001: Standardized environment variable naming (REDIS_PASSWORD for all deployments)
// ROOT CAUSE #2 FIX: Don't fall back to REDIS_PASSWORD from parent env (CLI mode has no password)
const redisHost = process.env.CFN_REDIS_HOST || 'cfn-redis';
const redisPort = process.env.CFN_REDIS_PORT || '6379';
const redisPassword = process.env.CFN_REDIS_PASSWORD || '';

/**
 * Validate task ID format to prevent command injection
 * Allows: optional namespace prefix (e.g., "cli:", "task:"), alphanumeric, hyphens, underscores, dots
 * Pattern: /^([a-z]+:)?[a-zA-Z0-9_.-]+$/
 * - Optional prefix: lowercase letters followed by colon
 * - Main ID: alphanumeric, hyphens, underscores, dots
 * @param taskId - The task ID to validate
 * @throws Error if taskId is invalid
 */
function validateTaskId(taskId: string): void {
  if (!taskId || !/^([a-z]+:)?[a-zA-Z0-9_.-]+$/.test(taskId)) {
    throw new Error(`Invalid task ID format: "${taskId}". Must contain optional namespace prefix (e.g., "cli:") and alphanumeric characters, hyphens, underscores, or dots.`);
  }
}

/**
 * Validate agent ID format to prevent command injection
 * Allows: alphanumeric, hyphens, underscores
 * @param agentId - The agent ID to validate
 * @throws Error if agentId is invalid
 */
function validateAgentId(agentId: string): void {
  if (!agentId || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    throw new Error(`Invalid agent ID format: "${agentId}". Must contain only alphanumeric characters, hyphens, and underscores.`);
  }
}

/**
 * Create a Redis client with proper connection handling
 * Uses environment variables for connection configuration
 * @returns Promise<RedisClientType> - Connected Redis client
 */
async function createRedisClient(): Promise<RedisClientType> {
  debugLog('createRedisClient: Starting Redis connection attempt');
  debugLog('Redis config', { host: redisHost, port: redisPort, hasPassword: !!redisPassword });
  console.error('[DEBUG] createRedisClient: Starting Redis connection...');
  console.error(`[DEBUG] Redis config: host=${redisHost}, port=${redisPort}, hasPassword=${!!redisPassword}`);

  const portNum = parseInt(redisPort, 10);
  debugLog(`createRedisClient: Creating client for ${redisHost}:${portNum}`);

  const client = createClient({
    socket: {
      host: redisHost,
      port: portNum,
      reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      connectTimeout: 5000,
    },
    password: redisPassword || undefined,
  });

  client.on('error', (err: Error) => {
    debugLog('Redis Client Error event triggered', { error: err.message, stack: err.stack });
    console.error('[DEBUG] Redis Client Error:', err);
  });

  debugLog('createRedisClient: Client created, calling connect()');
  console.error('[DEBUG] createRedisClient: Client created, attempting connection...');

  await client.connect();

  debugLog('createRedisClient: ✓ Connected successfully');
  console.error('[DEBUG] createRedisClient: ✓ Connected successfully');
  return client;
}

export interface AgentExecutionResult {
  success: boolean;
  agentId: string;
  output?: string;
  error?: string;
  exitCode: number;
}

/**
 * Parse context string into environment variables
 *
 * Parses context string like "TASK_ID='xyz' MODE='mvp' MAX_ITERATIONS=5"
 * and sets the values as environment variables.
 *
 * Supports:
 * - Single quoted: KEY='value with spaces'
 * - Double quoted: KEY="value with spaces"
 * - Unquoted: KEY=value (no spaces in value)
 *
 * @param contextString - Context string from --context parameter
 * @returns Object with parsed key-value pairs
 */
function parseContextToEnv(contextString: string | undefined): Record<string, string> {
  if (!contextString) return {};

  const envVars: Record<string, string> = {};

  // Match KEY='value' or KEY="value" or KEY=value patterns
  // For quoted values: capture everything between quotes
  // For unquoted values: capture until next space or end of string
  const regex = /(\w+)=(?:(['"])([^\2]*?)\2|([^\s]+))/g;
  let match;

  while ((match = regex.exec(contextString)) !== null) {
    const [, key, , quotedValue, unquotedValue] = match;
    const value = quotedValue !== undefined ? quotedValue : unquotedValue;
    envVars[key] = value;
    // Also set in process.env for current process
    process.env[key] = value;
  }

  return envVars;
}

/**
 * Extract confidence score from agent output
 * Looks for patterns like:
 * - "confidence: 0.85"
 * - "Confidence: 0.90"
 * - "confidence score: 0.95"
 * - "self-confidence: 0.88"
 */
function extractConfidence(output: string | undefined): number {
  if (!output) return 0.85;

  // Try multiple patterns
  const patterns = [
    /confidence:\s*([0-9.]+)/i,
    /confidence\s+score:\s*([0-9.]+)/i,
    /self-confidence:\s*([0-9.]+)/i,
    /my\s+confidence:\s*([0-9.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      const score = parseFloat(match[1]);
      if (score >= 0 && score <= 1) {
        return score;
      }
    }
  }

  // Default to 0.85 if not found
  return 0.85;
}

/**
 * Execute CFN Loop protocol after agent completes work
 *
 * Steps:
 * 1. Signal completion to orchestrator
 * 2. Report confidence score
 * 3. Enter waiting mode (if iterations enabled)
 */
async function executeCFNProtocol(
  taskId: string,
  agentId: string,
  output: string | undefined,
  iteration: number,
  enableIterations: boolean = false,
  maxIterations: number = 10
): Promise<void> {
  console.error('[DEBUG] executeCFNProtocol: ENTRY POINT REACHED');
  console.log(`\n[CFN Protocol] Starting for agent ${agentId}`);
  console.log(`[CFN Protocol] Task ID: ${taskId}, Iteration: ${iteration}`);

  // SECURITY FIX: Validate inputs to prevent command injection
  console.error('[DEBUG] executeCFNProtocol: Validating taskId and agentId...');
  validateTaskId(taskId);
  validateAgentId(agentId);
  console.error('[DEBUG] executeCFNProtocol: Validation passed');

  let redisClient: RedisClientType | null = null;

  try {
    // Step 1: Signal completion using Redis client (NOT shell commands)
    debugLog('executeCFNProtocol: Starting Step 1 (Redis signaling)', { taskId, agentId, iteration });
    console.error('[DEBUG] executeCFNProtocol: Starting Step 1 (Redis signaling)...');
    console.log('[CFN Protocol] Step 1: Signaling completion...');

    debugLog('executeCFNProtocol: Calling createRedisClient()');
    redisClient = await createRedisClient();
    debugLog('executeCFNProtocol: Redis client obtained successfully');
    console.error('[DEBUG] executeCFNProtocol: Redis client obtained');

    // Signal to orchestrator (CFN Loop coordination) - using parameterized Redis call
    const orchestratorKey = `swarm:${taskId}:${agentId}:done`;
    debugLog('executeCFNProtocol: Sending orchestrator signal', { key: orchestratorKey });
    console.error(`[DEBUG] executeCFNProtocol: Sending orchestrator signal to key: swarm:${taskId}:${agentId}:done`);

    await redisClient.lPush(orchestratorKey, 'complete');

    debugLog('executeCFNProtocol: Orchestrator signal sent successfully');
    console.error('[DEBUG] executeCFNProtocol: Orchestrator signal sent successfully');
    console.log('[CFN Protocol] ✓ Orchestrator signal sent');

    // Signal to Main Chat (CLI mode coordination - correct key format) - using parameterized Redis call
    const mainChatKey = `cfn-completion:${taskId}`;
    debugLog('executeCFNProtocol: Preparing Main Chat signal', { key: mainChatKey });
    console.error(`[DEBUG] executeCFNProtocol: Preparing Main Chat signal for key: cfn-completion:${taskId}`);

    const confidence = extractConfidence(output);
    const agentMetadata = JSON.stringify({
      agentId,
      taskId,
      status: 'completed',
      iteration,
      confidence,
    });
    debugLog('executeCFNProtocol: Agent metadata prepared', { metadata: agentMetadata, confidence });

    await redisClient.lPush(mainChatKey, agentMetadata);

    debugLog('executeCFNProtocol: Main Chat signal sent successfully');
    console.error('[DEBUG] executeCFNProtocol: Main Chat signal sent successfully');
    console.log('[CFN Protocol] ✓ Main Chat signal sent');

    // Step 2: Extract and report confidence (already extracted above, reusing variable)
    debugLog('executeCFNProtocol: Starting Step 2 (confidence reporting)', { confidence });
    console.error('[DEBUG] executeCFNProtocol: Starting Step 2 (confidence reporting)...');
    console.log(`[CFN Protocol] Step 2: Reporting confidence (${confidence})...`);

    const reportCmd = `./.claude/skills/cfn-redis-coordination/report-completion.sh \
      --task-id "${taskId}" \
      --agent-id "${agentId}" \
      --confidence ${confidence} \
      --iteration ${iteration}`;

    debugLog('executeCFNProtocol: Executing report-completion.sh', { reportCmd });
    console.error('[DEBUG] executeCFNProtocol: Executing report-completion.sh...');

    await execAsync(reportCmd);

    debugLog('executeCFNProtocol: report-completion.sh completed successfully');
    console.error('[DEBUG] executeCFNProtocol: report-completion.sh completed');
    console.log('[CFN Protocol] ✓ Confidence reported');

    // Step 3: Exit cleanly (BUG #18 FIX - removed waiting mode)
    // Orchestrator will spawn appropriate specialist agent for next iteration
    // This enables adaptive agent specialization based on feedback type
    debugLog('executeCFNProtocol: Step 3 - Exiting cleanly');
    console.error('[DEBUG] executeCFNProtocol: Step 3 - Exiting cleanly...');
    console.log('[CFN Protocol] Step 3: Exiting cleanly (iteration complete)');
    console.log('[CFN Protocol] Protocol complete\n');
    debugLog('executeCFNProtocol: ✓ PROTOCOL COMPLETED SUCCESSFULLY');
    console.error('[DEBUG] executeCFNProtocol: ✓ PROTOCOL COMPLETED SUCCESSFULLY');
  } catch (error) {
    const errorDetails = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : { error: String(error) };
    debugLog('executeCFNProtocol: ERROR CAUGHT', errorDetails);
    console.error('[DEBUG] executeCFNProtocol: ERROR CAUGHT:', error);
    console.error('[CFN Protocol] Error:', error);
    throw error;
  } finally {
    // Always close the Redis connection
    debugLog('executeCFNProtocol: FINALLY block - cleaning up Redis client');
    console.error('[DEBUG] executeCFNProtocol: FINALLY block - cleaning up Redis client...');
    if (redisClient) {
      await redisClient.quit();
      debugLog('executeCFNProtocol: Redis client closed successfully');
      console.error('[DEBUG] executeCFNProtocol: Redis client closed');
    } else {
      debugLog('executeCFNProtocol: No Redis client to close');
    }
    debugLog('executeCFNProtocol: FINALLY block complete');
    console.error('[DEBUG] executeCFNProtocol: FINALLY block complete');
  }
}

/**
 * Check if custom routing (z.ai) is enabled
 */
async function isCustomRoutingEnabled(): Promise<boolean> {
  // Check environment variable
  if (process.env.CLAUDE_API_PROVIDER === 'zai') {
    return true;
  }

  // Check config file (.claude/config/api-provider.json)
  try {
    const configPath = path.join(projectRoot, '.claude', 'config', 'api-provider.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    return config.provider === 'zai' || config.provider === 'z.ai';
  } catch {
    return false;
  }
}

/**
 * Get API provider configuration
 */
async function getAPIProvider(): Promise<'anthropic' | 'zai'> {
  const customEnabled = await isCustomRoutingEnabled();
  return customEnabled ? 'zai' : 'anthropic';
}

/**
 * Execute agent using direct API calls
 */
async function executeViaAPI(
  definition: AgentDefinition,
  prompt: string,
  context: TaskContext
): Promise<AgentExecutionResult> {
  debugLog('executeViaAPI: FUNCTION ENTRY', { agentType: definition.name });
  console.error('[DEBUG] executeViaAPI: FUNCTION ENTRY');
  const agentId = getAgentId(definition, context);

  debugLog('executeViaAPI: Agent initialized', {
    agentId,
    taskId: context.taskId,
    iteration: context.iteration,
    hasContext: !!context.context
  });
  console.error(`[DEBUG] executeViaAPI: Generated agentId=${agentId}`);
  console.error(`[DEBUG] executeViaAPI: context.taskId=${context.taskId}, context.iteration=${context.iteration}`);

  console.log(`[agent-executor] Executing agent via API: ${definition.name}`);
  console.log(`[agent-executor] Agent ID: ${agentId}`);
  console.log(`[agent-executor] Model: ${definition.model}`);
  console.log('');

  // BUG #24 FIX: Parse and inject context environment variables
  // This enables CLI-spawned agents to access TASK_ID, MODE, etc. in Bash tool
  if (context.context) {
    console.log(`[agent-executor] Parsing context: ${context.context}`);
    const contextEnv = parseContextToEnv(context.context);
    console.log(`[agent-executor] Injected env vars: ${Object.keys(contextEnv).join(', ')}`);
  }

  try {
    // Check for conversation fork (Sprint 4 enhancement)
    const forkId = process.env.FORK_ID || await getCurrentFork(context.taskId || '', agentId);
    const iteration = context.iteration || 1;

    let systemPrompt: string;
    let messages: Array<{role: string, content: string}> = [];

    if (forkId && iteration > 1) {
      // Continue from fork (iterations 2+)
      console.log(`[agent-executor] Continuing from fork: ${forkId}`);

      // Load fork messages
      const forkMessages = await loadMessages(context.taskId || '', agentId, forkId);
      console.log(`[agent-executor] Loaded ${forkMessages.length} messages from fork`);

      // Extract system prompt from first message (it's always the system message)
      // The fork messages are assistant/user pairs, we need to add system separately
      systemPrompt = forkMessages[0]?.content || '';

      // Format remaining messages for API
      messages = formatMessagesForAPI(forkMessages.slice(1));

      // Add new user message with feedback
      messages.push({
        role: 'user',
        content: prompt
      });

      console.log(`[agent-executor] Fork continuation: ${messages.length} messages`);
    } else {
      // New conversation (iteration 1)
      console.log('[agent-executor] Starting new conversation');
      console.log('[agent-executor] Building system prompt with context...');

      const contextOptions = loadContextFromEnv();
      contextOptions.agentType = definition.name;
      if (context.taskId) contextOptions.taskId = context.taskId;
      if (context.iteration) contextOptions.iteration = context.iteration;

      systemPrompt = await buildCLIAgentSystemPrompt(contextOptions);
      console.log('[agent-executor] System prompt built successfully');

      // Initial user message
      messages = [{
        role: 'user',
        content: prompt
      }];
    }

    console.log('');

    // Dynamic import to avoid bundling issues
    const { executeAgentAPI } = await import('./anthropic-client.js');

    // Convert agent tool names to Anthropic API format
    debugLog('[TOOL DEBUG] definition.tools check', {
      hasTools: !!definition.tools,
      toolsLength: definition.tools?.length || 0,
      toolNames: definition.tools || []
    });
    console.error(`[TOOL DEBUG] definition.tools: ${JSON.stringify(definition.tools)}`);

    const tools = definition.tools && definition.tools.length > 0
      ? convertToolNames(definition.tools)
      : undefined;

    debugLog('[TOOL DEBUG] converted tools', {
      hasConvertedTools: !!tools,
      convertedToolsCount: tools?.length || 0,
      convertedToolNames: tools?.map(t => t.name) || []
    });
    console.error(`[TOOL DEBUG] Converted tools: ${tools?.map(t => t.name).join(', ') || 'NONE'}`);

    const result = await executeAgentAPI(
      definition.name,
      agentId,
      definition.model,
      prompt,
      systemPrompt,
      messages.length > 1 ? messages : undefined,
      undefined, // maxTokens (use default)
      tools  // Pass converted tools
    );

    // Store messages in conversation history (for future forking)
    if (context.taskId) {
      // Store user message
      const userMessage: Message = {
        role: 'user',
        content: prompt,
        iteration,
        timestamp: new Date().toISOString()
      };
      await storeMessage(context.taskId, agentId, userMessage);

      // Store assistant response
      if (result.output) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: result.output,
          iteration,
          timestamp: new Date().toISOString()
        };
        await storeMessage(context.taskId, agentId, assistantMessage);
      }

      console.log(`[agent-executor] Stored messages for iteration ${iteration}`);

      // Execute CFN Loop protocol (signal completion, report confidence, enter waiting mode)
      // Iterations are enabled for CFN Loop tasks (indicated by presence of taskId)
      debugLog('agent-executor: About to execute CFN Protocol', {
        taskId: context.taskId,
        agentId,
        iteration,
        outputLength: result.output.length
      });
      console.error('[DEBUG] agent-executor: About to execute CFN Protocol...');
      console.error(`[DEBUG] agent-executor: taskId=${context.taskId}, agentId=${agentId}, iteration=${iteration}`);
      try {
        const maxIterations = 10; // Default max iterations
        const enableIterations = true; // Enable iterations for all CFN Loop tasks

        debugLog('agent-executor: Calling executeCFNProtocol', { maxIterations, enableIterations });
        console.error('[DEBUG] agent-executor: Calling executeCFNProtocol...');
        await executeCFNProtocol(
          context.taskId,
          agentId,
          result.output,
          iteration,
          enableIterations,
          maxIterations
        );
        debugLog('agent-executor: ✓ executeCFNProtocol returned successfully');
        console.error('[DEBUG] agent-executor: ✓ executeCFNProtocol returned successfully');
      } catch (error) {
        const errorDetails = error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : { error: String(error) };
        debugLog('agent-executor: ✗ executeCFNProtocol threw error', errorDetails);
        console.error('[DEBUG] agent-executor: ✗ executeCFNProtocol threw error:', error);
        console.error('[agent-executor] CFN Protocol execution failed:', error);
        // Don't fail the entire agent execution if CFN protocol fails
        // This allows agents to complete even if Redis coordination has issues
      }
      console.error('[DEBUG] agent-executor: CFN Protocol section complete');
    }

    return {
      success: result.success,
      agentId,
      output: result.output,
      error: result.error,
      exitCode: result.success ? 0 : 1,
    };
  } catch (error) {
    console.error('[agent-executor] API execution failed:', error);
    return {
      success: false,
      agentId,
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

/**
 * Execute agent using shell script (fallback/simulation)
 */
async function executeViaScript(
  definition: AgentDefinition,
  prompt: string,
  context: TaskContext
): Promise<AgentExecutionResult> {
  const agentId = getAgentId(definition, context);

  // BUG #24 FIX: Parse and inject context environment variables
  if (context.context) {
    console.log(`[agent-executor] Parsing context: ${context.context}`);
    const contextEnv = parseContextToEnv(context.context);
    console.log(`[agent-executor] Injected env vars: ${Object.keys(contextEnv).join(', ')}`);
  }

  // Write prompt to temporary file
  const tmpDir = os.tmpdir();
  const promptFile = path.join(tmpDir, `agent-${agentId}-${Date.now()}.md`);
  await fs.writeFile(promptFile, prompt, 'utf-8');

  console.log(`[agent-executor] Executing agent via script: ${definition.name}`);
  console.log(`[agent-executor] Agent ID: ${agentId}`);
  console.log(`[agent-executor] Model: ${definition.model}`);
  console.log(`[agent-executor] Prompt file: ${promptFile}`);

  return new Promise((resolve) => {
    const scriptPath = path.join(projectRoot, '.claude', 'skills', 'agent-execution', 'execute-agent.sh');

    // Build environment variables - WHITELIST ONLY APPROACH
    // SECURITY FIX: Do not use ...process.env spread which exposes ALL variables including secrets
    // Instead, explicitly whitelist safe variables to pass to spawned process
    const safeEnvVars = [
      'CFN_REDIS_HOST',
      'CFN_REDIS_PORT',
      'CFN_REDIS_PASSWORD',  // CRITICAL: Required for Redis authentication
      'CFN_REDIS_URL',
      'REDIS_PASSWORD',      // Fallback for Redis password
      'CFN_MEMORY_BUDGET',
      'CFN_API_HOST',
      'CFN_API_PORT',
      'CFN_LOG_LEVEL',
      'CFN_LOG_FORMAT',
      'CFN_CONTAINER_MODE',
      'CFN_DOCKER_SOCKET',
      'CFN_NETWORK_NAME',
      'CFN_CUSTOM_ROUTING',
      'CFN_DEFAULT_PROVIDER',
      'NODE_ENV',
      'PATH',
      'HOME',
      'PWD'                  // Required for working directory context
    ];

    const env: Record<string, string> = {};

    // Add whitelisted variables
    for (const key of safeEnvVars) {
      const value = process.env[key];
      if (value !== undefined) {
        env[key] = value;
      }
    }

    // Add API key only when explicitly needed (with strict validation)
    if (process.env.ANTHROPIC_API_KEY) {
      if (process.env.ANTHROPIC_API_KEY.match(/^sk-[a-zA-Z0-9-]+$/)) {
        env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      }
    }

    // Add agent execution context (safe values)
    env.AGENT_TYPE = definition.name;
    env.AGENT_ID = agentId;
    env.AGENT_MODEL = definition.model;
    env.AGENT_TOOLS = definition.tools.join(',');
    env.TASK_ID = context.taskId || '';
    env.ITERATION = String(context.iteration || 1);
    env.MODE = context.mode || 'cli';
    env.PROMPT_FILE = promptFile;

    // Check if execute script exists
    fs.access(scriptPath)
      .then(() => {
        // Use execution script
        const proc = spawn('bash', [scriptPath], { env, stdio: 'inherit' });

        proc.on('exit', (code) => {
          resolve({
            success: code === 0,
            agentId,
            exitCode: code || 0,
          });
        });

        proc.on('error', (err) => {
          resolve({
            success: false,
            agentId,
            error: err.message,
            exitCode: 1,
          });
        });
      })
      .catch(() => {
        // Fallback: Print prompt
        console.log('\n=== Agent Prompt ===');
        console.log(prompt.substring(0, 500) + '...');
        console.log('\n[agent-executor] Execution script not found');
        console.log('[agent-executor] Using simulation mode\n');

        resolve({
          success: true,
          agentId,
          output: prompt,
          exitCode: 0,
        });
      });
  });
}

/**
 * Main agent execution function
 */
export async function executeAgent(
  definition: AgentDefinition,
  prompt: string,
  context: TaskContext,
  options: {
    method?: 'auto' | 'api' | 'script';
  } = {}
): Promise<AgentExecutionResult> {
  const method = options.method || 'auto';

  debugLog('executeAgent: Starting execution', {
    agentType: definition.name,
    method,
    taskId: context.taskId,
    iteration: context.iteration,
    agentId: context.agentId || 'not-set'
  });

  // Auto-select execution method
  if (method === 'auto') {
    // Try API execution first, fallback to script if API key not available
    try {
      debugLog('executeAgent: Attempting API execution');
      return await executeViaAPI(definition, prompt, context);
    } catch (error) {
      if (error instanceof Error && error.message.includes('API key not found')) {
        debugLog('executeAgent: API key not found, falling back to script');
        console.log('[agent-executor] API key not found, using script fallback');
        return executeViaScript(definition, prompt, context);
      }
      debugLog('executeAgent: API execution error', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  if (method === 'api') {
    debugLog('executeAgent: Using API method');
    return executeViaAPI(definition, prompt, context);
  }

  debugLog('executeAgent: Using script method');
  return executeViaScript(definition, prompt, context);
}

/**
 * Write agent output to file for debugging
 */
export async function saveAgentOutput(
  agentId: string,
  output: string,
  outputDir: string = '.claude/tmp/agent-output'
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${agentId}-${timestamp}.txt`;
  const filepath = path.join(outputDir, filename);

  await fs.writeFile(filepath, output, 'utf-8');

  return filepath;
}

/**
 * Main entry point when run as a script via tsx
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let agentType: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent-type' && i + 1 < args.length) {
      agentType = args[i + 1];
      break;
    }
  }

  if (!agentType) {
    console.error('[agent-executor] ERROR: --agent-type is required');
    process.exit(1);
  }

  // Load agent definition
  const { parseAgentDefinition } = await import('./agent-definition-parser.js');
  const definition = await parseAgentDefinition(agentType);

  if (!definition) {
    console.error(`[agent-executor] ERROR: Agent type not found: ${agentType}`);
    process.exit(1);
  }

  // Build task context from environment variables
  const context: TaskContext = {
    taskId: process.env.TASK_ID,
    iteration: process.env.ITERATION ? parseInt(process.env.ITERATION, 10) : 1,
    mode: process.env.MODE || 'cli',
    agentId: process.env.AGENT_ID,
    context: process.env.CONTEXT
  };

  // Get prompt from environment variable or use default
  const prompt = process.env.PROMPT || `Execute your assigned task for ${agentType}.

You are part of a CFN Loop workflow. Review any broadcast messages, complete your work, and report your confidence score.`;

  console.log(`[agent-executor] Starting agent: ${agentType}`);
  console.log(`[agent-executor] Task ID: ${context.taskId || 'none'}`);
  console.log(`[agent-executor] Iteration: ${context.iteration}`);
  console.log(`[agent-executor] Prompt source: ${process.env.PROMPT ? 'PROMPT env var' : 'default'}`);

  // Execute agent
  const result = await executeAgent(definition, prompt, context);

  // Exit with appropriate code
  if (!result.success) {
    console.error(`[agent-executor] Agent execution failed: ${result.error || 'unknown error'}`);
    process.exit(result.exitCode || 1);
  }

  console.log('[agent-executor] Agent execution completed successfully');
  process.exit(0);
}

// Run main if executed as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[agent-executor] Fatal error:', error);
    process.exit(1);
  });
}
