/**
 * CFN Loop Orchestration Engine - TypeScript Implementation
 * Main entry point
 */

export * from './types';
export * from './orchestrator/orchestrator';
export * from './gate-checker/gate-checker';
export * from './agent-spawner/agent-spawner';
export * from './redis/redis-coordinator';
export * from './utils/logger';
export * from './helpers/validator';
export * from './helpers/confidence-aggregator';

// Version
export const VERSION = '3.0.0';
