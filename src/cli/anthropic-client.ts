/**
 * Anthropic API Client
 *
 * Handles communication with Claude API (Anthropic or z.ai provider).
 * Supports streaming responses and tool execution.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { executeTool, type ToolUse, type ToolResult } from './tool-executor.js';

const execAsync = promisify(exec);

export interface APIConfig {
  provider: 'anthropic' | 'zai';
  apiKey?: string;
  baseURL?: string;
}

export interface MessageOptions {
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: any[];
  messages?: Array<{ role: string; content: string }>; // Sprint 4: Conversation forking
}

export interface MessageResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason: string;
}

/**
 * Get API configuration from environment and config files
 */
export async function getAPIConfig(): Promise<APIConfig> {
  // Check environment variable
  const envProvider = process.env.CLAUDE_API_PROVIDER;
  if (envProvider === 'zai') {
    return {
      provider: 'zai',
      apiKey: process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic',
    };
  }

  // Check config file
  try {
    const configPath = path.join('.claude', 'config', 'api-provider.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    if (config.provider === 'zai' || config.provider === 'z.ai') {
      return {
        provider: 'zai',
        apiKey: config.apiKey || process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY,
        baseURL: config.baseURL || process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic',
      };
    }
  } catch {
    // Config file doesn't exist, use defaults
  }

  // Default to Anthropic
  return {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
  };
}

/**
 * Create Anthropic client with appropriate configuration
 */
export async function createClient(): Promise<Anthropic> {
  const config = await getAPIConfig();

  if (!config.apiKey) {
    throw new Error(
      `API key not found. Set ${config.provider === 'zai' ? 'ZAI_API_KEY' : 'ANTHROPIC_API_KEY'} environment variable.`
    );
  }

  const clientOptions: any = {
    apiKey: config.apiKey,
    timeout: 120000, // 2 minutes (120 seconds)
    maxRetries: 2,
  };

  if (config.provider === 'zai' && config.baseURL) {
    clientOptions.baseURL = config.baseURL;
  }

  return new Anthropic(clientOptions);
}

/**
 * Map agent model name to API model ID (provider-specific)
 */
export function mapModelName(agentModel: string, provider: 'anthropic' | 'zai' = 'anthropic'): string {
  // Z.ai uses GLM models - try glm-4.6 first for all models
  if (provider === 'zai') {
    const zaiModelMap: Record<string, string> = {
      haiku: 'glm-4.6',
      sonnet: 'glm-4.6',
      opus: 'glm-4.6',
    };
    return zaiModelMap[agentModel] || 'glm-4.6';
  }

  // Anthropic uses Claude models
  const modelMap: Record<string, string> = {
    haiku: 'claude-3-5-haiku-20241022',
    sonnet: 'claude-3-5-sonnet-20241022',
    opus: 'claude-3-opus-20240229',
  };

  return modelMap[agentModel] || modelMap.haiku;
}

/**
 * Get fallback model for Z.ai (glm-4.6 -> glm-4.5-air)
 */
function getFallbackModel(model: string): string | null {
  if (model === 'glm-4.6') {
    return 'glm-4.5-air';
  }
  return null;
}

/**
 * Send message to Claude API with streaming support and automatic fallback
 */
export async function sendMessage(
  options: MessageOptions,
  onChunk?: (text: string) => void
): Promise<MessageResponse> {
  const client = await createClient();
  const config = await getAPIConfig();

  // Primary model (glm-4.6 for Z.ai, Claude for Anthropic)
  let model = mapModelName(options.model, config.provider);
  const maxTokens = options.maxTokens || 16000; // Sprint 6: 16K hard limit for GLM-4.6 (agents target 10K for buffer)
  const temperature = options.temperature ?? 1.0;

  // Disable streaming for Z.ai (compatibility issue)
  const enableStreaming = options.stream && config.provider !== 'zai';

  console.log(`[anthropic-client] Provider: ${config.provider}`);
  console.log(`[anthropic-client] Model: ${model}`);
  console.log(`[anthropic-client] Max tokens: ${maxTokens}`);
  console.log(`[anthropic-client] Stream: ${enableStreaming ? 'enabled' : 'disabled'}`);
  console.log('');

  // Sprint 4: Use messages array if provided (conversation forking)
  const messages: Anthropic.MessageParam[] = options.messages
    ? options.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    : [
        {
          role: 'user',
          content: options.prompt,
        },
      ];

  // Retry logic: Try primary model (glm-4.6), fall back to glm-4.5 on error
  let lastError: Error | null = null;
  let attempts = 0;
  const maxAttempts = 2; // Primary + fallback

  while (attempts < maxAttempts) {
    const currentModel = attempts === 0 ? model : getFallbackModel(model);

    if (!currentModel) {
      // No fallback available, throw last error
      throw lastError || new Error('No model available');
    }

    attempts++;

    if (attempts > 1) {
      console.log(`[anthropic-client] Retrying with fallback model: ${currentModel}`);
    }

    const requestParams: Anthropic.MessageCreateParams = {
      model: currentModel,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    if (options.systemPrompt) {
      requestParams.system = options.systemPrompt;
    }

    if (options.tools && options.tools.length > 0) {
      requestParams.tools = options.tools;
    }

    try {
      // Streaming response
      if (enableStreaming) {
        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason = 'end_turn';

        console.log('[anthropic-client] Creating streaming request...');
        const stream = await client.messages.create({
          ...requestParams,
          stream: true,
        });

        console.log('[anthropic-client] Stream created, processing events...');
        for await (const event of stream) {
          console.log('[anthropic-client] Event type:', event.type);
          if (event.type === 'message_start') {
            // @ts-ignore - usage exists on message_start
            inputTokens = event.message.usage?.input_tokens || 0;
          } else if (event.type === 'content_block_delta') {
            // @ts-ignore - text exists on delta
            const text = event.delta?.text || '';
            fullContent += text;
            if (onChunk) {
              onChunk(text);
            }
          } else if (event.type === 'message_delta') {
            // @ts-ignore - usage exists on message_delta
            outputTokens = event.usage?.output_tokens || 0;
            // @ts-ignore - stop_reason exists on delta
            stopReason = event.delta?.stop_reason || 'end_turn';
          }
        }

        return {
          content: fullContent,
          usage: {
            inputTokens,
            outputTokens,
          },
          stopReason,
        };
      }

      // Non-streaming response
      const response = await client.messages.create(requestParams);

      const content =
        response.content
          .filter((block) => block.type === 'text')
          .map((block) => (block as any).text)
          .join('\n') || '';

      return {
        content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        stopReason: response.stop_reason || 'end_turn',
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[anthropic-client] Error with model ${currentModel}:`, lastError.message);

      // If this was the last attempt, throw the error
      if (attempts >= maxAttempts) {
        throw lastError;
      }

      // Continue to next attempt with fallback model
      console.log('[anthropic-client] Will retry with fallback model...');
    }
  }

  // Should never reach here
  throw lastError || new Error('All retry attempts failed');
}

/**
 * Execute agent with tool support (agentic loop)
 *
 * Handles:
 * 1. Send message with tools
 * 2. Get response
 * 3. If tool_use blocks, execute tools and send results back
 * 4. Repeat until final text response
 */
async function executeWithTools(
  options: MessageOptions,
  onChunk?: (text: string) => void
): Promise<MessageResponse> {
  const client = await createClient();
  const config = await getAPIConfig();

  const model = mapModelName(options.model, config.provider);
  const maxTokens = options.maxTokens || 16000;
  const temperature = options.temperature ?? 1.0;

  // Build initial messages array
  const messages: Anthropic.MessageParam[] = options.messages
    ? options.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    : [
        {
          role: 'user',
          content: options.prompt,
        },
      ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let fullTextContent = '';
  const MAX_ITERATIONS = 10; // Prevent infinite loops
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`[executeWithTools] Iteration ${iteration}`);

    const requestParams: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    if (options.systemPrompt) {
      requestParams.system = options.systemPrompt;
    }

    if (options.tools && options.tools.length > 0) {
      requestParams.tools = options.tools;
    }

    // Make API request (non-streaming for now to handle tool_use)
    const response = await client.messages.create(requestParams);

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Extract content blocks
    const textBlocks = response.content.filter(block => block.type === 'text');
    const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

    // Stream text output
    for (const block of textBlocks) {
      if (block.type === 'text') {
        const text = (block as any).text;
        fullTextContent += text;
        if (onChunk) {
          onChunk(text);
        }
      }
    }

    // If no tool uses, we're done
    if (toolUseBlocks.length === 0) {
      console.log(`[executeWithTools] No tool uses, completing`);
      return {
        content: fullTextContent,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
        stopReason: response.stop_reason || 'end_turn',
      };
    }

    // Execute tools
    console.log(`[executeWithTools] Executing ${toolUseBlocks.length} tool(s)`);
    const toolResults: ToolResult[] = [];

    for (const toolUseBlock of toolUseBlocks) {
      if (toolUseBlock.type !== 'tool_use') continue;

      const toolUse: ToolUse = {
        type: 'tool_use',
        id: (toolUseBlock as any).id,
        name: (toolUseBlock as any).name,
        input: (toolUseBlock as any).input,
      };

      console.log(`[executeWithTools] Tool: ${toolUse.name}`);
      const result = await executeTool(toolUse);
      toolResults.push(result);

      // Stream tool result
      if (onChunk) {
        onChunk(`\n[Tool: ${toolUse.name}] ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}\n`);
      }
    }

    // Add assistant message with tool_use
    messages.push({
      role: 'assistant',
      content: response.content as any,
    });

    // Add tool results as user message
    messages.push({
      role: 'user',
      content: toolResults as any,
    });

    // Continue to next iteration
  }

  // Reached max iterations
  console.warn(`[executeWithTools] Reached max iterations (${MAX_ITERATIONS})`);
  return {
    content: fullTextContent,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
    stopReason: 'max_tokens',
  };
}

/**
 * Execute agent via API with full lifecycle
 */
export async function executeAgentAPI(
  agentType: string,
  agentId: string,
  model: string,
  prompt: string,
  systemPrompt?: string,
  messages?: Array<{ role: string; content: string }>, // Sprint 4: Conversation forking
  maxTokens?: number, // Sprint 6: Configurable token limit
  tools?: any[] // Tool definitions for agent capabilities
): Promise<{ success: boolean; output: string; usage: any; error?: string }> {
  // Start heartbeat monitoring (declare at function scope for error handling)
  let heartbeatInterval: NodeJS.Timeout | null = null;
  const taskId = process.env.TASK_ID;

  try {
    console.log(`[anthropic-client] Executing agent: ${agentType}`);
    console.log(`[anthropic-client] Agent ID: ${agentId}`);
    if (messages && messages.length > 1) {
      console.log(`[anthropic-client] Continuing conversation (${messages.length} messages)`);
    }
    console.log('');

    if (taskId) {
      heartbeatInterval = setInterval(async () => {
        try {
          await execAsync(`redis-cli hset "swarm:${taskId}:agent:${agentId}" heartbeat "${Date.now()}" status "working"`);
        } catch (err) {
          console.error('[heartbeat] Error sending heartbeat:', err);
        }
      }, 30000); // Every 30 seconds

      console.log(`[heartbeat] Monitoring started for agent ${agentId} (30s interval)`);
    }

    let fullOutput = '';

    // If tools provided, use agentic loop with tool execution
    // Otherwise use simple streaming
    let response: MessageResponse;

    if (tools && tools.length > 0) {
      console.log(`[anthropic-client] Tools enabled: ${tools.map(t => t.name).join(', ')}`);
      response = await executeWithTools(
        {
          model,
          prompt,
          systemPrompt,
          messages,
          maxTokens,
          tools
        },
        (chunk) => {
          process.stdout.write(chunk);
          fullOutput += chunk;
        }
      );
    } else {
      response = await sendMessage(
        {
          model,
          prompt,
          systemPrompt,
          stream: true,
          messages,
          maxTokens,
        },
        (chunk) => {
          process.stdout.write(chunk);
          fullOutput += chunk;
        }
      );
    }

    console.log('\n');
    console.log('=== Agent Execution Complete ===');
    console.log(`Input tokens: ${response.usage.inputTokens}`);
    console.log(`Output tokens: ${response.usage.outputTokens}`);
    console.log(`Stop reason: ${response.stopReason}`);

    // Stop heartbeat and send final status
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);

      if (taskId) {
        await execAsync(`redis-cli hset "swarm:${taskId}:agent:${agentId}" heartbeat "${Date.now()}" status "complete"`);
        console.log(`[heartbeat] Monitoring stopped - agent ${agentId} complete`);
      }
    }

    return {
      success: true,
      output: response.content,
      usage: response.usage,
    };
  } catch (error) {
    console.error('[anthropic-client] Error:', error);

    // Stop heartbeat and send error status
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);

      if (taskId) {
        try {
          await execAsync(`redis-cli hset "swarm:${taskId}:agent:${agentId}" heartbeat "${Date.now()}" status "error"`);
          console.log(`[heartbeat] Monitoring stopped - agent ${agentId} error`);
        } catch (err) {
          // Ignore heartbeat errors during error handling
        }
      }
    }

    return {
      success: false,
      output: '',
      usage: { inputTokens: 0, outputTokens: 0 },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
