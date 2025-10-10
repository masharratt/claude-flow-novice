/**
 * Claude Flow Novice - Main Entry Point
 *
 * AI agent orchestration framework for beginners
 */

// Core exports
export { AgentManager } from './agents/agent-manager.js';
export { SimpleAgent } from './agents/simple-agent.js';
export { ProjectManager } from './core/project-manager.js';

// Type exports
export type { AgentConfig, SwarmConfig } from './types/agent-types.js';

// Constants
export const AgentType = {
  CODER: 'coder',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
  PLANNER: 'planner',
  ARCHITECT: 'architect',
  RESEARCHER: 'researcher',
  SECURITY_SPECIALIST: 'security-specialist',
  PERF_ANALYZER: 'perf-analyzer',
  DEVOPS_ENGINEER: 'devops-engineer',
  CICD_ENGINEER: 'cicd-engineer',
  API_DOCS: 'api-docs',
  BACKEND_DEV: 'backend-dev',
  FRONTEND_DEV: 'frontend-dev',
  MOBILE_DEV: 'mobile-dev'
} as const;

export type AgentType = typeof AgentType[keyof typeof AgentType];

// Version
export const VERSION = '1.6.6';

// Default configuration
export const defaultConfig = {
  maxAgents: 7,
  strategy: 'development',
  mode: 'mesh',
  persistence: true,
  consensusThreshold: 0.90,
  gateThreshold: 0.75
};
