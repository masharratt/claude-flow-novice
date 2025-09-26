/**
 * Task Agent Integration Layer
 * Provides validation and fallback for Claude Code's Task tool
 */

import { validateAgentType, AgentValidationResult } from './agent-validator.js';
import { getAvailableAgentTypes } from './agent-loader.js';

export interface TaskAgentSpawnRequest {
  type: string;
  description: string;
  prompt: string;
  capabilities?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface TaskAgentSpawnResult {
  originalRequest: TaskAgentSpawnRequest;
  validationResult: AgentValidationResult;
  finalType: string;
  spawnCommand: string;
  warnings: string[];
  success: boolean;
}

/**
 * Enhanced Task agent spawning with validation and fallbacks
 */
export class TaskAgentIntegration {
  private static instance: TaskAgentIntegration;

  static getInstance(): TaskAgentIntegration {
    if (!this.instance) {
      this.instance = new TaskAgentIntegration();
    }
    return this.instance;
  }

  /**
   * Validate and prepare agent spawn for Task tool
   */
  async prepareAgentSpawn(request: TaskAgentSpawnRequest): Promise<TaskAgentSpawnResult> {
    const validation = await validateAgentType(request.type);
    const warnings: string[] = [...validation.warnings];

    // Generate the proper Task tool command
    const spawnCommand = this.generateTaskCommand(request, validation);

    // Log validation results
    if (validation.fallbackUsed) {
      console.warn(`⚠️  Agent type validation for '${request.type}':`);
      for (const warning of validation.warnings) {
        console.warn(`   ${warning}`);
      }
      console.info(`✅ Using validated type: '${validation.resolvedType}'`);
    }

    return {
      originalRequest: request,
      validationResult: validation,
      finalType: validation.resolvedType,
      spawnCommand,
      warnings,
      success: true
    };
  }

  /**
   * Generate the proper Task tool command with validated agent type
   */
  private generateTaskCommand(request: TaskAgentSpawnRequest, validation: AgentValidationResult): string {
    const enhancedPrompt = this.enhancePrompt(request, validation);

    // Return the command format that Claude Code's Task tool expects
    return `Task("${request.description}", "${enhancedPrompt}", "${validation.resolvedType}")`;
  }

  /**
   * Enhance the prompt with validation context
   */
  private enhancePrompt(request: TaskAgentSpawnRequest, validation: AgentValidationResult): string {
    let enhancedPrompt = request.prompt;

    // Add validation context if fallback was used
    if (validation.fallbackUsed) {
      enhancedPrompt = `[Agent Type: Originally requested '${validation.originalType}', using '${validation.resolvedType}' as validated type]\n\n${enhancedPrompt}`;
    }

    // Add coordination context
    enhancedPrompt += `\n\n[Coordination Context: Use hooks for coordination - npx claude-flow@alpha hooks pre-task --description "${request.description}"]`;

    return enhancedPrompt;
  }

  /**
   * Batch validation for multiple agent spawns
   */
  async prepareBatchAgentSpawn(requests: TaskAgentSpawnRequest[]): Promise<TaskAgentSpawnResult[]> {
    const results: TaskAgentSpawnResult[] = [];

    for (const request of requests) {
      try {
        const result = await this.prepareAgentSpawn(request);
        results.push(result);
      } catch (error) {
        console.error(`Failed to prepare agent spawn for ${request.type}:`, error);
        // Create error result
        results.push({
          originalRequest: request,
          validationResult: {
            isValid: false,
            resolvedType: 'researcher', // fallback
            originalType: request.type,
            fallbackUsed: true,
            warnings: [`Error validating agent type: ${error}`]
          },
          finalType: 'researcher',
          spawnCommand: `Task("${request.description}", "${request.prompt}", "researcher")`,
          warnings: [`Failed to validate ${request.type}, using researcher as fallback`],
          success: false
        });
      }
    }

    return results;
  }

  /**
   * Get suggested agent types based on task description
   */
  async suggestAgentTypes(taskDescription: string): Promise<string[]> {
    const availableTypes = await getAvailableAgentTypes();
    const suggestions: string[] = [];

    // Simple keyword matching for suggestions
    const keywords = taskDescription.toLowerCase().split(/\s+/);

    for (const agentType of availableTypes) {
      const agentKeywords = agentType.toLowerCase().split(/[-_]/);

      // Check for keyword overlap
      const overlap = keywords.some(keyword =>
        agentKeywords.some(agentKeyword =>
          agentKeyword.includes(keyword) || keyword.includes(agentKeyword)
        )
      );

      if (overlap) {
        suggestions.push(agentType);
      }
    }

    // If no suggestions, return common types
    if (suggestions.length === 0) {
      return ['researcher', 'coder', 'reviewer', 'tester'];
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Validate agent type synchronously (cached results only)
   */
  validateAgentTypeSync(type: string): { isValid: boolean, resolvedType: string } {
    // This would check cache or provide immediate feedback
    // For now, return basic legacy mapping
    const legacyMapping: { [key: string]: string } = {
      'analyst': 'code-analyzer',
      'consensus-builder': 'consensus-builder',
      'monitor': 'performance-benchmarker',
      'coordinator': 'hierarchical-coordinator',
      'optimizer': 'perf-analyzer',
      'documenter': 'api-docs',
      'specialist': 'system-architect',
      'architect': 'system-architect'
    };

    const resolvedType = legacyMapping[type.toLowerCase()] || type;

    return {
      isValid: true, // Optimistic validation
      resolvedType
    };
  }

  /**
   * Get comprehensive agent information for Claude Code
   */
  async getAgentInfo(): Promise<{
    available: string[];
    categories: { [category: string]: string[] };
    legacy: { [old: string]: string };
    suggestions: { [task: string]: string[] };
  }> {
    const availableTypes = await getAvailableAgentTypes();

    // Group by category (inferred from naming)
    const categories: { [category: string]: string[] } = {
      core: [],
      development: [],
      analysis: [],
      coordination: [],
      testing: [],
      specialized: []
    };

    for (const type of availableTypes) {
      if (type.includes('coder') || type.includes('dev')) {
        categories.development.push(type);
      } else if (type.includes('test')) {
        categories.testing.push(type);
      } else if (type.includes('analyz') || type.includes('review')) {
        categories.analysis.push(type);
      } else if (type.includes('coordinator') || type.includes('orchestrat')) {
        categories.coordination.push(type);
      } else if (['researcher', 'reviewer', 'planner'].includes(type)) {
        categories.core.push(type);
      } else {
        categories.specialized.push(type);
      }
    }

    return {
      available: availableTypes,
      categories,
      legacy: {
        'analyst': 'code-analyzer',
        'consensus-builder': 'consensus-builder',
        'monitor': 'performance-benchmarker',
        'coordinator': 'hierarchical-coordinator',
        'optimizer': 'perf-analyzer',
        'documenter': 'api-docs',
        'specialist': 'system-architect',
        'architect': 'system-architect'
      },
      suggestions: {
        'code': ['coder', 'reviewer', 'code-analyzer'],
        'test': ['tester', 'production-validator'],
        'design': ['system-architect', 'base-template-generator'],
        'analysis': ['code-analyzer', 'perf-analyzer'],
        'documentation': ['api-docs'],
        'coordination': ['task-orchestrator', 'hierarchical-coordinator']
      }
    };
  }
}

// Singleton instance
export const taskAgentIntegration = TaskAgentIntegration.getInstance();

// Convenience functions for Claude Code integration
export const prepareAgentSpawn = (request: TaskAgentSpawnRequest) =>
  taskAgentIntegration.prepareAgentSpawn(request);

export const prepareBatchAgentSpawn = (requests: TaskAgentSpawnRequest[]) =>
  taskAgentIntegration.prepareBatchAgentSpawn(requests);

export const suggestAgentTypes = (taskDescription: string) =>
  taskAgentIntegration.suggestAgentTypes(taskDescription);

export const validateAgentTypeSync = (type: string) =>
  taskAgentIntegration.validateAgentTypeSync(type);

export const getAgentInfo = () =>
  taskAgentIntegration.getAgentInfo();

/**
 * Hook for Claude Code to validate agent types before spawning
 * This can be called by Claude Code's Task tool implementation
 */
export async function claudeCodeTaskHook(subagentType: string, description: string, prompt: string): Promise<{
  validatedType: string;
  enhancedPrompt: string;
  warnings: string[];
}> {
  const request: TaskAgentSpawnRequest = {
    type: subagentType,
    description,
    prompt
  };

  const result = await prepareAgentSpawn(request);

  return {
    validatedType: result.finalType,
    enhancedPrompt: result.originalRequest.prompt, // Keep original prompt for now
    warnings: result.warnings
  };
}