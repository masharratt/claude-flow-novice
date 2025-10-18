/**
 * Agent Spawn Wrapper - Ensures agentType is passed to provider routing
 *
 * This wrapper intercepts agent spawns and ensures the agentType parameter
 * is properly passed through to the ProviderManager for tiered routing.
 *
 * Usage in Claude Code context:
 * Instead of relying on Task tool's provider manager call,
 * this wrapper explicitly sets agentType before delegation.
 */

import { LLMRequest, LLMResponse, LLMProvider } from './types.js';
import { ProviderManager } from './provider-manager.js';
import { ILogger } from '../core/logger.js';

export interface AgentSpawnRequest extends LLMRequest {
  agentType: string; // Required! Must be set by caller
}

export class AgentSpawnWrapper {
  private providerManager: ProviderManager;
  private logger: ILogger;

  constructor(providerManager: ProviderManager, logger: ILogger) {
    this.providerManager = providerManager;
    this.logger = logger;
  }

  /**
   * Spawn an agent with proper provider routing
   *
   * @param request - LLM request with agentType specified
   * @returns LLM response from appropriate provider
   */
  async spawnAgent(request: AgentSpawnRequest): Promise<LLMResponse> {
    if (!request.agentType) {
      this.logger.warn('Agent spawn without agentType, defaulting to main-chat');
      request.agentType = 'main-chat';
    }

    this.logger.debug(`Spawning agent: ${request.agentType}`);

    // Pass agentType explicitly to provider manager
    // This ensures tiered routing works correctly
    const response = await this.providerManager.complete(request, request.agentType);

    this.logger.debug(`Agent ${request.agentType} completed with provider: ${response.provider}`);

    return response;
  }

  /**
   * Spawn agent with streaming
   */
  async *spawnAgentStream(request: AgentSpawnRequest): AsyncIterable<any> {
    if (!request.agentType) {
      this.logger.warn('Agent spawn without agentType, defaulting to main-chat');
      request.agentType = 'main-chat';
    }

    this.logger.debug(`Spawning agent (stream): ${request.agentType}`);

    yield* this.providerManager.streamComplete(request, request.agentType);
  }
}

/**
 * Map common agent type aliases to standard names
 */
export function normalizeAgentType(agentType: string): string {
  const typeMap: Record<string, string> = {
    // Core agents
    'coder': 'coder',
    'developer': 'coder',
    'programmer': 'coder',

    'tester': 'tester',
    'qa': 'tester',
    'test-engineer': 'tester',

    'reviewer': 'reviewer',
    'code-reviewer': 'reviewer',

    // Strategic agents
    'architect': 'architect',
    'system-architect': 'system-architect',
    'coordinator': 'coordinator',
    'orchestrator': 'coordinator',

    // Research agents
    'researcher': 'researcher',
    'analyst': 'analyst',

    // Main chat
    'main-chat': 'main-chat',
    'chat': 'main-chat',
    'assistant': 'main-chat',
  };

  return typeMap[agentType.toLowerCase()] || agentType;
}
