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
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface AgentExecutionResult {
  success: boolean;
  agentId: string;
  output?: string;
  error?: string;
  exitCode: number;
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
  console.log(`\n[CFN Protocol] Starting for agent ${agentId}`);
  console.log(`[CFN Protocol] Task ID: ${taskId}, Iteration: ${iteration}`);

  try {
    // Step 1: Signal completion
    console.log('[CFN Protocol] Step 1: Signaling completion...');
    await execAsync(`redis-cli lpush "swarm:${taskId}:${agentId}:done" "complete"`);
    console.log('[CFN Protocol] ✓ Completion signaled');

    // Step 2: Extract and report confidence
    const confidence = extractConfidence(output);
    console.log(`[CFN Protocol] Step 2: Reporting confidence (${confidence})...`);

    const reportCmd = `./.claude/skills/cfn-redis-coordination/report-completion.sh \
      --task-id "${taskId}" \
      --agent-id "${agentId}" \
      --confidence ${confidence} \
      --iteration ${iteration}`;

    await execAsync(reportCmd);
    console.log('[CFN Protocol] ✓ Confidence reported');

    // Step 3: Exit cleanly (BUG #18 FIX - removed waiting mode)
    // Orchestrator will spawn appropriate specialist agent for next iteration
    // This enables adaptive agent specialization based on feedback type
    console.log('[CFN Protocol] Step 3: Exiting cleanly (iteration complete)');
    console.log('[CFN Protocol] Protocol complete\n');
  } catch (error) {
    console.error('[CFN Protocol] Error:', error);
    throw error;
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
    const configPath = path.join('.claude', 'config', 'api-provider.json');
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
  const agentId = getAgentId(definition, context);

  console.log(`[agent-executor] Executing agent via API: ${definition.name}`);
  console.log(`[agent-executor] Agent ID: ${agentId}`);
  console.log(`[agent-executor] Model: ${definition.model}`);
  console.log('');

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
    const tools = definition.tools && definition.tools.length > 0
      ? convertToolNames(definition.tools)
      : undefined;

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
      try {
        const maxIterations = 10; // Default max iterations
        const enableIterations = true; // Enable iterations for all CFN Loop tasks

        await executeCFNProtocol(
          context.taskId,
          agentId,
          result.output,
          iteration,
          enableIterations,
          maxIterations
        );
      } catch (error) {
        console.error('[agent-executor] CFN Protocol execution failed:', error);
        // Don't fail the entire agent execution if CFN protocol fails
        // This allows agents to complete even if Redis coordination has issues
      }
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

  // Write prompt to temporary file
  const tmpDir = os.tmpdir();
  const promptFile = path.join(tmpDir, `agent-${agentId}-${Date.now()}.md`);
  await fs.writeFile(promptFile, prompt, 'utf-8');

  console.log(`[agent-executor] Executing agent via script: ${definition.name}`);
  console.log(`[agent-executor] Agent ID: ${agentId}`);
  console.log(`[agent-executor] Model: ${definition.model}`);
  console.log(`[agent-executor] Prompt file: ${promptFile}`);

  return new Promise((resolve) => {
    const scriptPath = path.join('.claude', 'skills', 'agent-execution', 'execute-agent.sh');

    // Build environment variables
    const env = {
      ...process.env,
      AGENT_TYPE: definition.name,
      AGENT_ID: agentId,
      AGENT_MODEL: definition.model,
      AGENT_TOOLS: definition.tools.join(','),
      TASK_ID: context.taskId || '',
      ITERATION: String(context.iteration || 1),
      MODE: context.mode || 'cli',
      PROMPT_FILE: promptFile,
    };

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

  // Auto-select execution method
  if (method === 'auto') {
    // Try API execution first, fallback to script if API key not available
    try {
      return await executeViaAPI(definition, prompt, context);
    } catch (error) {
      if (error instanceof Error && error.message.includes('API key not found')) {
        console.log('[agent-executor] API key not found, using script fallback');
        return executeViaScript(definition, prompt, context);
      }
      throw error;
    }
  }

  if (method === 'api') {
    return executeViaAPI(definition, prompt, context);
  }

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
