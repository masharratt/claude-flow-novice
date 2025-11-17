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

export class TaskAgentIntegration {
  private static instance: TaskAgentIntegration;

  static getInstance(): TaskAgentIntegration {
    if (!this.instance) {
      this.instance = new TaskAgentIntegration();
    }
    return this.instance;
  }

  async prepareAgentSpawn(request: TaskAgentSpawnRequest): Promise<TaskAgentSpawnResult> {
    const validation = await validateAgentType(request.type);
    const warnings: string[] = [...validation.warnings];

    const spawnCommand = this.generateTaskCommand(request, validation);

    if (validation.fallbackUsed) {
      console.warn(`⚠️  Agent type validation for '${request.type}':`);
      for (const warning of warnings) {
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
      success: true,
    };
  }

  private generateTaskCommand(
    request: TaskAgentSpawnRequest,
    validation: AgentValidationResult,
  ): string {
    const enhancedPrompt = this.enhancePrompt(request, validation);

    return `Task("${request.description}", "${enhancedPrompt}", "${validation.resolvedType}")`;
  }

  private enhancePrompt(request: TaskAgentSpawnRequest, validation: AgentValidationResult): string {
    let enhancedPrompt = request.prompt;

    if (validation.fallbackUsed) {
      enhancedPrompt = `[Agent Type: Originally requested '${validation.originalType}', using '${validation.resolvedType}' as validated type]\n\n${enhancedPrompt}`;
    }

    enhancedPrompt += `\n\n[Coordination Context: Task coordination via TodoWrite tool]`;

    return enhancedPrompt;
  }

  async prepareBatchAgentSpawn(requests: TaskAgentSpawnRequest[]): Promise<TaskAgentSpawnResult[]> {
    const results: TaskAgentSpawnResult[] = [];

    for (const request of requests) {
      try {
        const result = await this.prepareAgentSpawn(request);
        results.push(result);
      } catch (error) {
        console.error(`Failed to prepare agent spawn for ${request.type}:`, error);
        results.push({
          originalRequest: request,
          validationResult: {
            isValid: false,
            resolvedType: 'researcher',
            originalType: request.type,
            fallbackUsed: true,
            warnings: [`Error validating agent type: ${error}`],
          },
          finalType: 'researcher',
          spawnCommand: `Task("${request.description}", "${request.prompt}", "researcher")`,
          warnings: [`Failed to validate ${request.type}, using researcher as fallback`],
          success: false,
        });
      }
    }

    return results;
  }

  async suggestAgentTypes(taskDescription: string): Promise<string[]> {
    const availableTypes = await getAvailableAgentTypes();
    const suggestions: string[] = [];
    const keywords = taskDescription.toLowerCase().split(/\s+/);

    for (const agentType of availableTypes) {
      const agentKeywords = agentType.toLowerCase().split(/[-_]/);

      const overlap = keywords.some((keyword) =>
        agentKeywords.some(
          (agentKeyword) => agentKeyword.includes(keyword) || keyword.includes(agentKeyword),
        ),
      );

      if (overlap) {
        suggestions.push(agentType);
      }
    }

    return suggestions.length === 0
      ? ['researcher', 'coder', 'reviewer', 'tester']
      : suggestions.slice(0, 5);
  }

  validateAgentTypeSync(type: string): { isValid: boolean; resolvedType: string } {
    const legacyMapping: Record<string, string> = {
      analyst: 'code-analyzer',
      'consensus-builder': 'consensus-builder',
      monitor: 'performance-benchmarker',
      coordinator: 'hierarchical-coordinator',
      optimizer: 'perf-analyzer',
      documenter: 'api-docs',
      specialist: 'system-architect',
      architect: 'system-architect',
    };

    const resolvedType = legacyMapping[type.toLowerCase()] || type;

    return {
      isValid: true,
      resolvedType,
    };
  }

  async getAgentInfo(): Promise<{
    available: string[];
    categories: { [category: string]: string[] };
    legacy: { [old: string]: string };
    suggestions: { [task: string]: string[] };
  }> {
    const availableTypes = await getAvailableAgentTypes();

    const categories: Record<string, string[]> = {
      core: [],
      development: [],
      analysis: [],
      coordination: [],
      testing: [],
      specialized: [],
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
        analyst: 'code-analyzer',
        'consensus-builder': 'consensus-builder',
        monitor: 'performance-benchmarker',
        coordinator: 'hierarchical-coordinator',
        optimizer: 'perf-analyzer',
        documenter: 'api-docs',
        specialist: 'system-architect',
        architect: 'system-architect',
      },
      suggestions: {
        code: ['coder', 'reviewer', 'code-analyzer'],
        test: ['tester', 'production-validator'],
        design: ['system-architect', 'base-template-generator'],
        analysis: ['code-analyzer', 'perf-analyzer'],
        documentation: ['api-docs'],
        coordination: ['task-orchestrator', 'hierarchical-coordinator'],
      },
    };
  }
}

export const taskAgentIntegration = TaskAgentIntegration.getInstance();

export const prepareAgentSpawn = (request: TaskAgentSpawnRequest) =>
  taskAgentIntegration.prepareAgentSpawn(request);

export const prepareBatchAgentSpawn = (requests: TaskAgentSpawnRequest[]) =>
  taskAgentIntegration.prepareBatchAgentSpawn(requests);

export const suggestAgentTypes = (taskDescription: string) =>
  taskAgentIntegration.suggestAgentTypes(taskDescription);

export const validateAgentTypeSync = (type: string) =>
  taskAgentIntegration.validateAgentTypeSync(type);

export const getAgentInfo = () => taskAgentIntegration.getAgentInfo();

export async function claudeCodeTaskHook(
  subagentType: string,
  description: string,
  prompt: string,
): Promise<{
  validatedType: string;
  enhancedPrompt: string;
  warnings: string[];
}> {
  const request: TaskAgentSpawnRequest = {
    type: subagentType,
    description,
    prompt,
  };

  const result = await prepareAgentSpawn(request);

  return {
    validatedType: result.finalType,
    enhancedPrompt: result.originalRequest.prompt,
    warnings: result.warnings,
  };
}