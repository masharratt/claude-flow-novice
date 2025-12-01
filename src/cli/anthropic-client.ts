/**
 * Anthropic API Client
 *
 * Handles communication with Claude API (Anthropic or z.ai provider).
 * Supports streaming responses and tool execution.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import https from 'https';
import { executeTool, type ToolUse, type ToolResult } from './tool-executor.js';

const execAsync = promisify(exec);

// File-based debug logging (for background agents)
const AGENT_ID = process.env.AGENT_ID || 'unknown';
const API_LOG_FILE = `/tmp/cfn-api-${AGENT_ID}.log`;
function apiDebugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = data
    ? `${timestamp} [${AGENT_ID}] ${message} ${JSON.stringify(data)}\n`
    : `${timestamp} [${AGENT_ID}] ${message}\n`;
  try {
    fsSync.appendFileSync(API_LOG_FILE, logEntry);
  } catch (err) {
    // Ignore logging errors
  }
}

// HTTP Agent configuration with connection pooling limits
// Prevents memory leaks from unclosed connections in subagent spawning
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,        // Limit concurrent connections
  maxFreeSockets: 5,     // Limit idle connections in pool
  timeout: 120000,       // 2 minutes
  keepAliveMsecs: 1000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 120000,
  keepAliveMsecs: 1000
});

// Client singleton with reference counting for proper lifecycle management
// Fixes memory leak from creating new Anthropic instances per API call
let clientInstance: Anthropic | null = null;
let clientRefCount = 0;

export interface APIConfig {
  provider: 'anthropic' | 'zai' | 'kimi' | 'openrouter';
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
 *
 * Provider resolution order:
 * 1. CLAUDE_API_PROVIDER env var (legacy)
 * 2. PROVIDER env var (set by agent-spawner from --provider flag)
 * 3. Config file (.claude/config/api-provider.json)
 * 4. Default to Z.ai (cost-effective fallback per project requirements)
 *
 * BUG FIX: Previously only checked CLAUDE_API_PROVIDER, ignoring --provider flag
 * which sets PROVIDER env var via agent-spawner.ts
 */
export async function getAPIConfig(): Promise<APIConfig> {
  // Check environment variables - support both CLAUDE_API_PROVIDER (legacy) and PROVIDER (from CLI --provider flag)
  const envProvider = process.env.CLAUDE_API_PROVIDER || process.env.PROVIDER;

  // Debug logging for provider routing (helps diagnose auth errors)
  apiDebugLog('getAPIConfig: Provider detection', {
    CLAUDE_API_PROVIDER: process.env.CLAUDE_API_PROVIDER,
    PROVIDER: process.env.PROVIDER,
    resolved: envProvider
  });
  console.error(`[provider-routing] CLAUDE_API_PROVIDER=${process.env.CLAUDE_API_PROVIDER || 'unset'}, PROVIDER=${process.env.PROVIDER || 'unset'}, resolved=${envProvider || 'none'}`);

  if (envProvider === 'zai' || envProvider === 'z.ai') {
    console.error('[provider-routing] Using Z.ai provider');
    return {
      provider: 'zai',
      apiKey: process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic',
    };
  }

  if (envProvider === 'kimi') {
    console.error('[provider-routing] Using Kimi provider');
    return {
      provider: 'kimi',
      apiKey: process.env.KIMI_API_KEY,
      baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
    };
  }

  if (envProvider === 'openrouter') {
    console.error('[provider-routing] Using OpenRouter provider');
    return {
      provider: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    };
  }

  if (envProvider === 'anthropic') {
    console.error('[provider-routing] Using Anthropic provider (explicit)');
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  // Check config file
  try {
    const configPath = path.join('.claude', 'config', 'api-provider.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    if (config.provider === 'zai' || config.provider === 'z.ai') {
      console.error('[provider-routing] Using Z.ai provider (from config file)');
      return {
        provider: 'zai',
        apiKey: config.apiKey || process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY,
        baseURL: config.baseURL || process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic',
      };
    }

    if (config.provider === 'kimi') {
      console.error('[provider-routing] Using Kimi provider (from config file)');
      return {
        provider: 'kimi',
        apiKey: config.apiKey || process.env.KIMI_API_KEY,
        baseURL: config.baseURL || process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
      };
    }

    if (config.provider === 'openrouter') {
      console.error('[provider-routing] Using OpenRouter provider (from config file)');
      return {
        provider: 'openrouter',
        apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
        baseURL: config.baseURL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      };
    }

    if (config.provider === 'anthropic') {
      console.error('[provider-routing] Using Anthropic provider (from config file)');
      return {
        provider: 'anthropic',
        apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      };
    }
  } catch {
    // Config file doesn't exist, use defaults
  }

  // Default to Z.ai (cost-effective fallback per project requirements)
  // BUG FIX: Previously defaulted to Anthropic which caused auth errors when no provider specified
  console.error('[provider-routing] Using Z.ai provider (default fallback)');
  return {
    provider: 'zai',
    apiKey: process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic',
  };
}

/**
 * Validate provider configuration before creating client
 * Provides clear error messages for missing credentials
 */
export function validateProviderConfig(config: APIConfig): void {
  if (!config.apiKey) {
    const envVarMap: Record<string, string> = {
      'zai': 'ZAI_API_KEY (or ANTHROPIC_API_KEY)',
      'anthropic': 'ANTHROPIC_API_KEY',
      'kimi': 'KIMI_API_KEY',
      'openrouter': 'OPENROUTER_API_KEY'
    };
    const requiredVar = envVarMap[config.provider] || `${config.provider.toUpperCase()}_API_KEY`;
    throw new Error(
      `[provider-validation] API key not found for provider '${config.provider}'. ` +
      `Set the ${requiredVar} environment variable.\n` +
      `Tip: If using --provider flag, ensure the corresponding API key is exported.`
    );
  }

  // Provider-specific validation
  if (config.provider === 'kimi' || config.provider === 'openrouter') {
    console.error(`[provider-validation] WARNING: Provider '${config.provider}' uses OpenAI-compatible API format.`);
    console.error(`[provider-validation] The current implementation uses Anthropic SDK which may not be compatible.`);
    console.error(`[provider-validation] Consider using provider 'zai' or 'anthropic' for now.`);
  }
}

/**
 * Create Anthropic client with appropriate configuration
 *
 * Uses singleton pattern with reference counting to prevent memory leaks
 * from unclosed HTTP connections. Applies to all providers:
 * - anthropic: Direct Anthropic API
 * - zai: Z.ai proxy (all GLM models: 4.5, 4.6, etc.)
 * - kimi: Kimi API (future)
 * - openrouter: OpenRouter API (future)
 *
 * Memory leak fix: Reuses client instance with custom HTTP agents
 * that enforce connection limits (maxSockets: 10, maxFreeSockets: 5)
 */
export async function createClient(): Promise<Anthropic> {
  // Return existing instance if available
  if (clientInstance) {
    clientRefCount++;
    apiDebugLog('Reusing existing client instance', { refCount: clientRefCount });
    return clientInstance;
  }

  const config = await getAPIConfig();

  // Validate configuration before attempting API call
  validateProviderConfig(config);

  const clientOptions: any = {
    apiKey: config.apiKey,
    timeout: 120000, // 2 minutes (120 seconds)
    maxRetries: 2,
    httpAgent: httpAgent,   // Apply connection limits
    httpsAgent: httpsAgent, // Apply connection limits
  };

  // Z.ai uses Anthropic-compatible API format with custom base URL
  if ((config.provider === 'zai' || config.provider === 'anthropic') && config.baseURL) {
    clientOptions.baseURL = config.baseURL;
  }

  console.error(`[anthropic-client] Creating new client instance for provider: ${config.provider}`);
  apiDebugLog('Creating new client instance', { provider: config.provider, baseURL: config.baseURL });

  clientInstance = new Anthropic(clientOptions);
  clientRefCount = 1;

  return clientInstance;
}

/**
 * Dispose Anthropic client and clean up HTTP connections
 *
 * Uses reference counting to ensure client is only destroyed when
 * all operations have completed. Prevents premature disposal during
 * concurrent API calls.
 *
 * Should be called in finally blocks of executeAgentAPI and similar
 * long-running operations.
 */
export function disposeClient(): void {
  clientRefCount--;
  apiDebugLog('Disposing client reference', { refCount: clientRefCount });

  if (clientRefCount <= 0 && clientInstance) {
    // Force cleanup of internal HTTP client/agent
    // @ts-ignore - accessing internal property for cleanup
    if (clientInstance.httpClient?.destroy) {
      clientInstance.httpClient.destroy();
    }

    apiDebugLog('Client instance destroyed');
    clientInstance = null;
    clientRefCount = 0;
  }
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

  // Streaming supported for both providers; retry without streaming if a provider rejects it
  let enableStreaming = !!options.stream;

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
      // Streaming response (preferred)
      if (enableStreaming) {
        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason = 'end_turn';
        let stream: any = null;

        try {
          console.log('[anthropic-client] Creating streaming request...');
          stream = await client.messages.create({
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
        } finally {
          // Explicit stream cleanup to prevent memory leaks
          if (stream?.controller?.abort) {
            try {
              stream.controller.abort();
            } catch (err) {
              // Ignore abort errors (stream may already be closed)
            }
          }
        }
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
      // If streaming fails on Z.ai, retry once without streaming before falling back to model fallback logic
      if (enableStreaming && config.provider === 'zai') {
        console.warn('[anthropic-client] Streaming failed on z.ai, retrying without streaming:', error);
        enableStreaming = false;
        attempts--; // do not consume a model attempt
        continue;
      }

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
  const MAX_ITERATIONS = 20; // Prevent infinite loops (increased for exploration phase)
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

    apiDebugLog('executeWithTools: API response received', {
      iteration,
      contentBlockCount: response.content.length,
      blockTypes: response.content.map(b => b.type),
      stopReason: response.stop_reason
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Extract content blocks
    const textBlocks = response.content.filter(block => block.type === 'text');
    const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

    apiDebugLog('executeWithTools: Blocks extracted', {
      textBlockCount: textBlocks.length,
      toolUseBlockCount: toolUseBlocks.length,
      toolNames: toolUseBlocks.map((b: any) => b.name)
    });

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

  // Bug #6 Fix: Read Redis connection parameters from process.env and interpolate in TypeScript
  // FIX: Default to 'localhost' for CLI mode (host execution), not 'cfn-redis' (Docker)
  const redisHost = process.env.CFN_REDIS_HOST || 'localhost';
  const redisPort = process.env.CFN_REDIS_PORT || '6379';

  // Track memory usage for leak detection
  const initialMem = process.memoryUsage();
  apiDebugLog('Memory before API call', {
    heapUsed: (initialMem.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
    external: (initialMem.external / 1024 / 1024).toFixed(2) + 'MB'
  });

  try {
    apiDebugLog('executeAgentAPI: ENTRY', {
      agentType,
      agentId,
      hasTools: !!tools,
      toolsLength: tools?.length || 0,
      toolNames: tools?.map(t => t.name) || []
    });
    console.log(`[anthropic-client] Executing agent: ${agentType}`);
    console.log(`[anthropic-client] Agent ID: ${agentId}`);
    console.error(`[TOOL DEBUG executeAgentAPI] tools parameter: ${tools ? `Array[${tools.length}]` : 'undefined'}`);
    console.error(`[TOOL DEBUG executeAgentAPI] tools names: ${tools?.map(t => t.name).join(', ') || 'NONE'}`);
    if (messages && messages.length > 1) {
      console.log(`[anthropic-client] Continuing conversation (${messages.length} messages)`);
    }
    console.log('');

    if (taskId) {
      heartbeatInterval = setInterval(async () => {
        try {
          await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} hset "swarm:${taskId}:agent:${agentId}" heartbeat "${Date.now()}" status "working"`);
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
      apiDebugLog('executeAgentAPI: Using tool execution path', {
        toolCount: tools.length,
        toolNames: tools.map(t => t.name)
      });
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
        await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} hset "swarm:${taskId}:agent:${agentId}" heartbeat "${Date.now()}" status "complete"`);
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
          await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} hset "swarm:${taskId}:agent:${agentId}" heartbeat "${Date.now()}" status "error"`);
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
  } finally {
    // Dispose client to prevent memory leaks
    // Reference counting ensures client is only destroyed when all operations complete
    disposeClient();

    // Track memory after cleanup
    const finalMem = process.memoryUsage();
    const heapDelta = (finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024;
    apiDebugLog('Memory after API call', {
      heapUsed: (finalMem.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
      delta: heapDelta.toFixed(2) + 'MB'
    });

    // Warn if significant memory growth (>50MB) detected
    if (heapDelta > 50) {
      console.warn(`[memory-leak-warning] Heap grew by ${heapDelta.toFixed(2)}MB during agent execution`);
    }
  }
}
