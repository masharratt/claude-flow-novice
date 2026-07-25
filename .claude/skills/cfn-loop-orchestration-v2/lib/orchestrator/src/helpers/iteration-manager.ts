/**
 * Iteration Manager
 * Manages CFN Loop iteration transitions and agent wake operations
 */

export interface IterationPreparation {
  nextIteration: number;
  feedback: any;
  timestamp: string;
}

export interface WakeResult {
  signals: string[];
}

/**
 * Prepares next iteration with feedback
 * @param params Current iteration and feedback data
 * @returns IterationPreparation for next iteration
 */
export function prepareIteration(params: {
  currentIteration: number;
  feedback: any;
}): IterationPreparation {
  return {
    nextIteration: params.currentIteration + 1,
    feedback: params.feedback,
    timestamp: new Date().toISOString()
  };
}

/**
 * Prepares wake signals for agents
 * @param agentIds Array of agent IDs to wake
 * @returns WakeResult with signal identifiers
 */
export function wakeAgents(agentIds: string[]): WakeResult {
  const signals = agentIds.map(agentId => {
    return `wake:${agentId}:${Date.now()}`;
  });

  return {
    signals
  };
}
