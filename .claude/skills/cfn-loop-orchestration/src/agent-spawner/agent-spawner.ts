/**
 * Agent spawner implementation
 * Spawns specialized agents for loop execution
 */

import { AgentSpec, ExecutionMode } from '../types';

/**
 * Agent spawner class - placeholder for migration
 */
export class AgentSpawner {
  /**
   * Spawn agents for a specific loop and wave
   */
  static async spawnAgents(
    taskId: string,
    loopNumber: number,
    agentCount: number,
    _mode: ExecutionMode
  ): Promise<AgentSpec[]> {
    const agents: AgentSpec[] = [];

    for (let i = 0; i < agentCount; i++) {
      agents.push({
        id: `${taskId}-loop${loopNumber}-agent${i}`,
        type: `loop${loopNumber}-agent`,
        memoryTier: 2,
        memoryLimit: '1g',
      });
    }

    return agents;
  }
}
