/**
 * Context Injector - Broadcast Message Builder
 * Constructs context messages for agent execution in CFN Loop
 * Implements iteration tracking, phase awareness, and success criteria injection
 *
 * Used by: cfn-loop-orchestration to broadcast agent context across Redis
 * Reference: helpers/context-injection.sh (142 LOC) - shell predecessor
 */

import { ExecutionMode } from '../types';

/**
 * Loop phase enumeration
 */
export type LoopPhase = 'loop3' | 'loop2' | 'product-owner' | 'iteration-prep';

/**
 * Success criteria for task execution
 */
export interface SuccessCriteria {
  criteria: string[];
  testPassRate: number;
  consensusThreshold: number;
}

/**
 * Broadcast context message for agent execution
 */
export interface BroadcastContext {
  taskId: string;
  iteration: number;
  phase: LoopPhase;
  mode: ExecutionMode;
  agentIds?: string[] | undefined;
  successCriteria?: SuccessCriteria | undefined;
  taskDescription?: string | undefined;
  timestamp: string;
  contextVersion: string;
}

/**
 * Result of successful broadcast context construction
 */
export interface BroadcastResult {
  context: BroadcastContext;
  json: string;
  messageCount: number;
}

/**
 * Build broadcast context for agent execution
 *
 * @param params Context parameters
 * @returns BroadcastResult with JSON-formatted message
 * @throws Error if required fields are missing
 *
 * @example
 * ```typescript
 * const result = buildBroadcastContext({
 *   taskId: 'task-123',
 *   iteration: 1,
 *   phase: 'loop3',
 *   mode: 'standard',
 *   agentIds: ['agent-1', 'agent-2']
 * });
 *
 * console.log(result.json); // JSON string for Redis broadcast
 * ```
 */
export function buildBroadcastContext(params: {
  taskId: string;
  iteration: number;
  phase: LoopPhase;
  mode: ExecutionMode;
  agentIds?: string[] | undefined;
  successCriteria?: SuccessCriteria | undefined;
  taskDescription?: string | undefined;
}): BroadcastResult {
  // Validate required fields
  if (!params.taskId) {
    throw new Error('taskId is required for broadcast context');
  }

  if (typeof params.iteration !== 'number' || params.iteration < 1) {
    throw new Error('iteration must be a positive number');
  }

  if (!params.phase) {
    throw new Error('phase is required for broadcast context');
  }

  if (!params.mode) {
    throw new Error('mode is required for broadcast context');
  }

  // Validate phase value
  const validPhases: LoopPhase[] = ['loop3', 'loop2', 'product-owner', 'iteration-prep'];
  if (!validPhases.includes(params.phase)) {
    throw new Error(`Invalid phase: ${params.phase}. Must be one of: ${validPhases.join(', ')}`);
  }

  // Construct broadcast context
  const context: BroadcastContext = {
    taskId: params.taskId,
    iteration: params.iteration,
    phase: params.phase,
    mode: params.mode,
    timestamp: new Date().toISOString(),
    contextVersion: '3.0',
  };

  // Add optional fields if provided
  if (params.agentIds && Array.isArray(params.agentIds) && params.agentIds.length > 0) {
    context.agentIds = params.agentIds;
  }

  if (params.successCriteria) {
    validateSuccessCriteria(params.successCriteria);
    context.successCriteria = params.successCriteria;
  }

  if (params.taskDescription) {
    context.taskDescription = params.taskDescription;
  }

  // Serialize to JSON
  const json = JSON.stringify(context, null, 2);

  return {
    context,
    json,
    messageCount: params.agentIds ? params.agentIds.length : 1,
  };
}

/**
 * Build multiple broadcast messages for different agents
 *
 * @param baseContext Base context parameters
 * @param agentContexts Per-agent context overrides
 * @returns Array of broadcast contexts
 *
 * @example
 * ```typescript
 * const messages = buildBroadcastMessages(
 *   { taskId: 'task-1', iteration: 1, phase: 'loop3', mode: 'standard' },
 *   [
 *     { agentId: 'loop3-backend-1', agentType: 'backend-engineer' },
 *     { agentId: 'loop3-frontend-1', agentType: 'react-frontend-engineer' }
 *   ]
 * );
 * ```
 */
export function buildBroadcastMessages(
  baseContext: {
    taskId: string;
    iteration: number;
    phase: LoopPhase;
    mode: ExecutionMode;
    successCriteria?: SuccessCriteria;
    taskDescription?: string;
  },
  agentContexts: Array<{
    agentId: string;
    agentType: string;
  }>
): BroadcastContext[] {
  if (!Array.isArray(agentContexts) || agentContexts.length === 0) {
    throw new Error('agentContexts must be a non-empty array');
  }

  // Validate base context by building it
  buildBroadcastContext({
    ...baseContext,
    agentIds: agentContexts.map(ac => ac.agentId),
  });

  // Build individual context for each agent
  return agentContexts.map(agentCtx => ({
    taskId: baseContext.taskId,
    iteration: baseContext.iteration,
    phase: baseContext.phase,
    mode: baseContext.mode,
    agentIds: [agentCtx.agentId] as string[] | undefined,
    successCriteria: baseContext.successCriteria ?? undefined,
    taskDescription: baseContext.taskDescription ?? undefined,
    timestamp: new Date().toISOString(),
    contextVersion: '3.0',
  }));
}

/**
 * Build iteration-specific broadcast context for agent wake operations
 *
 * @param taskId Unique task identifier
 * @param iteration Current iteration number
 * @param mode Execution mode
 * @param feedback Optional feedback for next iteration
 * @returns BroadcastContext for iteration prep
 */
export function buildIterationContext(
  taskId: string,
  iteration: number,
  mode: ExecutionMode,
  feedback?: unknown
): BroadcastContext {
  const taskDescription: string | undefined = feedback ? JSON.stringify(feedback) : undefined;
  return buildBroadcastContext({
    taskId,
    iteration,
    phase: 'iteration-prep',
    mode,
    taskDescription,
  }).context;
}

/**
 * Format context as JSON for Redis broadcast
 *
 * @param context Broadcast context
 * @param compact If true, removes whitespace
 * @returns JSON string
 */
export function formatContextJson(context: BroadcastContext, compact: boolean = false): string {
  if (compact) {
    return JSON.stringify(context);
  }
  return JSON.stringify(context, null, 2);
}

/**
 * Parse broadcast context from JSON
 *
 * @param json JSON string containing broadcast context
 * @returns Parsed BroadcastContext
 * @throws Error if JSON is invalid or missing required fields
 */
export function parseBroadcastContext(json: string): BroadcastContext {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON for broadcast context: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Broadcast context must be a JSON object');
  }

  const context = parsed as Record<string, unknown>;

  // Validate required fields
  if (!context.taskId || typeof context.taskId !== 'string') {
    throw new Error('taskId must be a non-empty string');
  }

  if (typeof context.iteration !== 'number') {
    throw new Error('iteration must be a number');
  }

  if (!context.phase || typeof context.phase !== 'string') {
    throw new Error('phase must be a non-empty string');
  }

  if (!context.mode || typeof context.mode !== 'string') {
    throw new Error('mode must be a non-empty string');
  }

  const agentIds: string[] | undefined = context.agentIds ? (context.agentIds as string[]) : undefined;
  const successCriteria: SuccessCriteria | undefined = context.successCriteria ? (context.successCriteria as SuccessCriteria) : undefined;
  const taskDescription: string | undefined = context.taskDescription ? (context.taskDescription as string) : undefined;

  return {
    taskId: context.taskId,
    iteration: context.iteration,
    phase: context.phase as LoopPhase,
    mode: context.mode as ExecutionMode,
    timestamp: (context.timestamp as string) || new Date().toISOString(),
    contextVersion: (context.contextVersion as string) || '3.0',
    agentIds,
    successCriteria,
    taskDescription,
  };
}

/**
 * Validate success criteria structure
 *
 * @param criteria Success criteria to validate
 * @throws Error if structure is invalid
 */
function validateSuccessCriteria(criteria: SuccessCriteria): void {
  if (!Array.isArray(criteria.criteria) || criteria.criteria.length === 0) {
    throw new Error('successCriteria.criteria must be a non-empty array');
  }

  if (typeof criteria.testPassRate !== 'number' || criteria.testPassRate < 0 || criteria.testPassRate > 1) {
    throw new Error('successCriteria.testPassRate must be a number between 0 and 1');
  }

  if (typeof criteria.consensusThreshold !== 'number' || criteria.consensusThreshold < 0 || criteria.consensusThreshold > 1) {
    throw new Error('successCriteria.consensusThreshold must be a number between 0 and 1');
  }
}

/**
 * Merge multiple broadcast contexts for multi-phase execution
 *
 * @param contexts Array of broadcast contexts
 * @returns Merged context with combined agentIds
 */
export function mergeBroadcastContexts(contexts: BroadcastContext[]): BroadcastContext {
  if (!Array.isArray(contexts) || contexts.length === 0) {
    throw new Error('contexts must be a non-empty array');
  }

  const first = contexts[0];
  if (!first) {
    throw new Error('First context is undefined');
  }

  // Validate all contexts have same base properties
  for (const context of contexts) {
    if (context.taskId !== first.taskId) {
      throw new Error('All contexts must have the same taskId for merging');
    }
    if (context.iteration !== first.iteration) {
      throw new Error('All contexts must have the same iteration for merging');
    }
  }

  // Merge agent IDs from all contexts
  const mergedAgentIds = Array.from(
    new Set(contexts.flatMap(c => c.agentIds || []))
  );

  return {
    taskId: first.taskId,
    iteration: first.iteration,
    phase: first.phase,
    mode: first.mode,
    timestamp: new Date().toISOString(),
    contextVersion: first.contextVersion,
    agentIds: mergedAgentIds.length > 0 ? mergedAgentIds : undefined,
    successCriteria: first.successCriteria ?? undefined,
    taskDescription: first.taskDescription ?? undefined,
  };
}
