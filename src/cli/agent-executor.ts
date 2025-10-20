/**
 * Agent Executor
 *
 * Executes CLI-spawned agents by:
 * 1. Checking custom routing configuration (z.ai vs Anthropic)
 * 2. Invoking the appropriate API
 * 3. Managing agent lifecycle and output
 */

import { spawn } from 'child_process';
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
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface AgentExecutionResult {
  success: boolean;
  agentId: string;
  output?: string;
  error?: string;
  exitCode: number;
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

    const result = await executeAgentAPI(
      definition.name,
      agentId,
      definition.model,
      prompt,
      systemPrompt,
      messages.length > 1 ? messages : undefined
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
