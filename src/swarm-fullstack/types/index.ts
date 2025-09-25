/**
 * Full-Stack Swarm Team - Core Type Definitions
 * Extends existing SwarmMessageRouter types for full-stack development
 */

// Create a completely separate message interface to avoid conflicts
export interface FullStackAgentMessage {
  id: string;
  swarmId: string;
  agentId: string;
  agentType: FullStackAgentType;
  messageType: FullStackMessageType;
  content: string;
  timestamp: string;
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'critical';

  // Full-stack specific properties
  layer?: 'frontend' | 'backend' | 'database' | 'infrastructure' | 'testing';
  complexity?: number;
  dependencies?: string[];
  targetAgents?: string[];
  threadId?: string;
  parentMessageId?: string;

  // Enhanced metadata
  metadata?: {
    reasoning?: string;
    alternatives?: string[];
    confidence?: number;
    dependencies?: string[];
    nextSteps?: string[];
    tags?: string[];
    // Full-stack specific metadata
    codeChanges?: string[];
    testResults?: any;
    performanceMetrics?: any;
  };
}

// Base agent types (from original system)
export type BaseAgentType = 'researcher' | 'coder' | 'reviewer';

// Extended agent types for full-stack development
export type ExtendedAgentType =
  // Frontend agents
  | 'frontend-developer' | 'ui-designer' | 'accessibility-specialist'
  // Backend agents
  | 'backend-developer' | 'api-developer' | 'microservices-architect'
  // Database agents
  | 'database-developer' | 'data-architect' | 'migration-specialist'
  // Testing agents
  | 'qa-engineer' | 'e2e-tester' | 'performance-tester' | 'security-tester'
  // DevOps agents
  | 'devops-engineer' | 'deployment-specialist' | 'monitoring-specialist'
  // Coordination agents
  | 'project-coordinator' | 'integration-specialist' | 'release-manager';

// Full union type
export type FullStackAgentType = BaseAgentType | ExtendedAgentType;

export type FullStackMessageType =
  // Legacy compatibility
  | 'task-start' | 'progress-update' | 'decision' | 'coordination' | 'completion' | 'error' | 'reasoning'
  // Full-stack specific
  | 'feature-spec' | 'design-review' | 'code-review' | 'test-result' | 'deployment-status'
  | 'integration-check' | 'performance-report' | 'security-scan' | 'quality-gate'
  | 'dependency-update' | 'conflict-resolution' | 'rollback-request';

export interface SwarmTeamComposition {
  swarmId: string;
  feature: string;
  complexity: ComplexityLevel;
  agents: FullStackAgent[];
  estimatedDuration: number;
  requiredSkills: string[];
  resourceLimits: ResourceLimits;
}

export interface FullStackAgent {
  id: string;
  type: FullStackAgentType;
  capabilities: string[];
  currentTask?: string;
  status: 'idle' | 'active' | 'working' | 'blocked' | 'completed';
  performance: {
    tasksCompleted: number;
    successRate: number;
    averageTime: number;
    qualityScore: number;
  };
  resources: {
    cpuUsage: number;
    memoryUsage: number;
    activeTasks: number;
  };
}

export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'enterprise';

export interface ResourceLimits {
  maxAgents: number;
  maxCpuPerAgent: number;
  maxMemoryPerAgent: number;
  timeoutMinutes: number;
}

export interface ChromeMCPCommand {
  action: string;
  params: Record<string, any>;
  timeout?: number;
  retries?: number;
}

export interface ChromeMCPResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
  duration: number;
}

export interface ShadcnComponentRequest {
  component: string;
  variant?: string;
  props?: Record<string, any>;
  theme?: string;
  customizations?: Record<string, any>;
}

export interface TestExecutionPlan {
  swarmId: string;
  feature: string;
  testTypes: ('unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'accessibility')[];
  browsers: string[];
  devices: string[];
  priority: number;
  parallel: boolean;
}

export interface FeatureDevelopmentWorkflow {
  id: string;
  name: string;
  phases: WorkflowPhase[];
  currentPhase: number;
  team: SwarmTeamComposition;
  timeline: {
    startTime: string;
    estimatedCompletion: string;
    actualCompletion?: string;
  };
  qualityGates: QualityGate[];
  deploymentStrategy: 'blue-green' | 'canary' | 'rolling';
}

export interface WorkflowPhase {
  name: string;
  description: string;
  agents: FullStackAgentType[];
  estimatedDuration: number;
  dependencies: string[];
  outputs: string[];
  qualityChecks: string[];
}

export interface QualityGate {
  name: string;
  type: 'code-quality' | 'test-coverage' | 'performance' | 'security' | 'accessibility';
  threshold: number;
  blocking: boolean;
  automated: boolean;
}

// Re-export existing types from the original router for compatibility
export type { AgentMessage, MessageQuery, SwarmState } from '../../web/messaging/swarm-message-router.js';