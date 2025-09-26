# SwarmMessageRouter Implementation Specifications

## Executive Summary

This document provides detailed technical specifications for implementing the enhanced SwarmMessageRouter system that extends support from 3 agents to 2-20 agents with full-stack development capabilities. The implementation maintains backward compatibility while introducing sophisticated coordination patterns.

## Implementation Architecture

### Core File Structure

```
src/
├── web/
│   └── messaging/
│       ├── swarm-message-router.ts                 # Current implementation
│       ├── enhanced-swarm-message-router.ts        # New enhanced version
│       ├── agent-type-system.ts                    # Agent classification
│       ├── resource-allocator.ts                   # Resource management
│       ├── performance-optimizer.ts                # Performance tuning
│       ├── backward-compatibility.ts               # Legacy support
│       └── integration/
│           ├── chrome-mcp-coordinator.ts           # Chrome MCP integration
│           └── shadcn-workflow-coordinator.ts      # shadcn integration
├── communication/
│   ├── message-bus.ts                             # Existing advanced messaging
│   └── full-stack-message-router.ts               # Enhanced routing logic
└── types/
    ├── enhanced-agent-types.ts                    # Extended type definitions
    └── full-stack-message-types.ts                # Enhanced message interfaces
```

## Detailed Implementation

### 1. Enhanced Agent Type System

**File: `src/types/enhanced-agent-types.ts`**

```typescript
/**
 * Enhanced agent type system supporting full-stack development teams
 */

export interface EnhancedAgentConfig {
  id: string;
  type: EnhancedAgentType;
  capabilities: AgentCapabilitySet;
  resourceLimits: ResourceConstraints;
  coordinationProfile: CoordinationProfile;
  metadata: AgentMetadata;
}

export interface EnhancedAgentType {
  category: AgentCategory;
  role: string;
  specialization?: string;
  tier: AgentTier;
  version: string; // For capability evolution tracking
}

export enum AgentCategory {
  // Development Categories
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  FULLSTACK = 'fullstack',
  MOBILE = 'mobile',

  // Quality & Testing
  QA = 'qa',
  TESTING = 'testing',
  PERFORMANCE = 'performance',

  // Operations
  DEVOPS = 'devops',
  INFRASTRUCTURE = 'infrastructure',
  SECURITY = 'security',

  // Data & Analytics
  DATABASE = 'database',
  ANALYTICS = 'analytics',

  // Architecture & Leadership
  ARCHITECT = 'architect',
  COORDINATOR = 'coordinator',
  PRODUCT = 'product',

  // Legacy Support (for backward compatibility)
  LEGACY_RESEARCHER = 'researcher',
  LEGACY_CODER = 'coder',
  LEGACY_REVIEWER = 'reviewer'
}

export enum AgentTier {
  JUNIOR = 'junior',      // 0-2 years experience equivalent
  REGULAR = 'regular',    // 2-5 years experience equivalent
  SENIOR = 'senior',      // 5-8 years experience equivalent
  LEAD = 'lead',          // 8+ years, team leadership
  SPECIALIST = 'specialist', // Deep domain expertise
  ARCHITECT = 'architect'  // System design authority
}

export interface AgentCapabilitySet {
  core: CoreCapability[];
  technical: TechnicalCapability[];
  domain: DomainCapability[];
  soft: SoftCapability[];
  learning: LearningCapability[];
}

export interface CoreCapability {
  name: string;
  proficiency: CapabilityLevel;
  certifications?: string[];
  lastUpdated: Date;
}

export enum CapabilityLevel {
  BEGINNER = 1,
  INTERMEDIATE = 2,
  ADVANCED = 3,
  EXPERT = 4,
  MASTER = 5
}

export interface ResourceConstraints {
  maxConcurrentTasks: number;
  maxMemoryMB: number;
  maxCpuPercent: number;
  diskSpaceMB: number;
  networkBandwidthMbps: number;
  specializationLocks: string[]; // Exclusive access requirements
}

export interface CoordinationProfile {
  preferredCommunicationStyle: CommunicationStyle;
  decisionMakingAuthority: DecisionScope;
  collaborationPatterns: CollaborationPattern[];
  escalationChain: string[]; // Agent IDs for escalation
  workingHours?: TimeWindow;
  timezone?: string;
}

export enum CommunicationStyle {
  DIRECT = 'direct',
  COLLABORATIVE = 'collaborative',
  HIERARCHICAL = 'hierarchical',
  PEER_TO_PEER = 'peer-to-peer',
  BROADCAST = 'broadcast'
}

export enum DecisionScope {
  TASK_LEVEL = 'task',
  MODULE_LEVEL = 'module',
  SERVICE_LEVEL = 'service',
  SYSTEM_LEVEL = 'system',
  ARCHITECTURE_LEVEL = 'architecture'
}

// Predefined agent configurations
export const AGENT_TYPE_REGISTRY: Record<string, EnhancedAgentConfig> = {
  'react-frontend-senior': {
    id: 'react-frontend-senior',
    type: {
      category: AgentCategory.FRONTEND,
      role: 'frontend-developer',
      specialization: 'react',
      tier: AgentTier.SENIOR,
      version: '1.0.0'
    },
    capabilities: {
      core: [
        { name: 'react', proficiency: CapabilityLevel.EXPERT, lastUpdated: new Date() },
        { name: 'typescript', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() },
        { name: 'testing', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() }
      ],
      technical: [
        { name: 'webpack', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() },
        { name: 'vite', proficiency: CapabilityLevel.EXPERT, lastUpdated: new Date() }
      ],
      domain: [
        { name: 'web-performance', proficiency: CapabilityLevel.EXPERT, lastUpdated: new Date() },
        { name: 'accessibility', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() }
      ],
      soft: [
        { name: 'mentoring', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() },
        { name: 'code-review', proficiency: CapabilityLevel.EXPERT, lastUpdated: new Date() }
      ],
      learning: [
        { name: 'new-frameworks', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() }
      ]
    },
    resourceLimits: {
      maxConcurrentTasks: 3,
      maxMemoryMB: 4096,
      maxCpuPercent: 80,
      diskSpaceMB: 10240,
      networkBandwidthMbps: 100,
      specializationLocks: ['react-ecosystem']
    },
    coordinationProfile: {
      preferredCommunicationStyle: CommunicationStyle.COLLABORATIVE,
      decisionMakingAuthority: DecisionScope.MODULE_LEVEL,
      collaborationPatterns: [
        CollaborationPattern.CODE_REVIEW,
        CollaborationPattern.PAIR_PROGRAMMING,
        CollaborationPattern.MENTORING
      ],
      escalationChain: ['frontend-architect', 'tech-lead'],
      workingHours: { start: '09:00', end: '17:00' },
      timezone: 'UTC'
    },
    metadata: {
      description: 'Senior React frontend developer with expertise in performance and accessibility',
      tags: ['react', 'typescript', 'performance', 'accessibility'],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    }
  },

  'api-backend-regular': {
    id: 'api-backend-regular',
    type: {
      category: AgentCategory.BACKEND,
      role: 'api-developer',
      specialization: 'rest',
      tier: AgentTier.REGULAR,
      version: '1.0.0'
    },
    capabilities: {
      core: [
        { name: 'nodejs', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() },
        { name: 'express', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() },
        { name: 'postgresql', proficiency: CapabilityLevel.INTERMEDIATE, lastUpdated: new Date() }
      ],
      technical: [
        { name: 'docker', proficiency: CapabilityLevel.INTERMEDIATE, lastUpdated: new Date() },
        { name: 'redis', proficiency: CapabilityLevel.INTERMEDIATE, lastUpdated: new Date() }
      ],
      domain: [
        { name: 'api-design', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() },
        { name: 'database-optimization', proficiency: CapabilityLevel.INTERMEDIATE, lastUpdated: new Date() }
      ],
      soft: [
        { name: 'documentation', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() }
      ],
      learning: [
        { name: 'microservices', proficiency: CapabilityLevel.BEGINNER, lastUpdated: new Date() }
      ]
    },
    resourceLimits: {
      maxConcurrentTasks: 2,
      maxMemoryMB: 2048,
      maxCpuPercent: 70,
      diskSpaceMB: 5120,
      networkBandwidthMbps: 50,
      specializationLocks: ['api-endpoints']
    },
    coordinationProfile: {
      preferredCommunicationStyle: CommunicationStyle.DIRECT,
      decisionMakingAuthority: DecisionScope.TASK_LEVEL,
      collaborationPatterns: [CollaborationPattern.CODE_REVIEW],
      escalationChain: ['backend-senior', 'backend-architect']
    },
    metadata: {
      description: 'Regular backend developer specializing in REST API development',
      tags: ['nodejs', 'express', 'api', 'postgresql'],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    }
  },

  // Legacy compatibility
  'researcher': {
    id: 'researcher',
    type: {
      category: AgentCategory.LEGACY_RESEARCHER,
      role: 'researcher',
      tier: AgentTier.REGULAR,
      version: '1.0.0'
    },
    capabilities: {
      core: [
        { name: 'research', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() },
        { name: 'analysis', proficiency: CapabilityLevel.ADVANCED, lastUpdated: new Date() }
      ],
      technical: [],
      domain: [],
      soft: [],
      learning: []
    },
    resourceLimits: {
      maxConcurrentTasks: 1,
      maxMemoryMB: 1024,
      maxCpuPercent: 50,
      diskSpaceMB: 2048,
      networkBandwidthMbps: 25,
      specializationLocks: []
    },
    coordinationProfile: {
      preferredCommunicationStyle: CommunicationStyle.COLLABORATIVE,
      decisionMakingAuthority: DecisionScope.TASK_LEVEL,
      collaborationPatterns: [CollaborationPattern.INFORMATION_SHARING]
    },
    metadata: {
      description: 'Legacy researcher agent for backward compatibility',
      tags: ['legacy', 'research'],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    }
  }
};
```

### 2. Enhanced Message Types and Routing

**File: `src/types/full-stack-message-types.ts`**

```typescript
/**
 * Enhanced message types for full-stack coordination
 */

export interface FullStackAgentMessage extends AgentMessage {
  // Extended message types for full-stack coordination
  messageType:
    // Legacy message types (backward compatibility)
    | 'task-start' | 'progress-update' | 'decision' | 'coordination' | 'completion' | 'error' | 'reasoning'

    // Dependency coordination
    | 'dependency-request' | 'dependency-resolved' | 'dependency-blocked' | 'dependency-updated'

    // Resource management
    | 'resource-claim' | 'resource-release' | 'resource-conflict' | 'resource-available'

    // Integration and sync
    | 'integration-point-update' | 'cross-layer-sync' | 'api-contract-change' | 'schema-migration'

    // Development lifecycle
    | 'phase-transition' | 'quality-gate-check' | 'code-review-request' | 'deployment-ready'

    // Monitoring and alerts
    | 'performance-alert' | 'security-scan' | 'health-check' | 'rollback-request'

    // Team coordination
    | 'standup-update' | 'blockers-report' | 'knowledge-share' | 'skill-request';

  // Enhanced metadata for full-stack development
  metadata: {
    // Legacy metadata (backward compatibility)
    reasoning?: string;
    alternatives?: string[];
    confidence?: number;
    dependencies?: string[];
    nextSteps?: string[];
    tags?: string[];

    // Full-stack specific metadata
    layer?: DevelopmentLayer;
    phase?: DevelopmentPhase;
    criticality?: CriticalityLevel;
    integrationPoints?: IntegrationPoint[];
    affectedServices?: string[];
    performanceImpact?: PerformanceImpact;
    securityImplications?: boolean;
    rollbackPlan?: RollbackPlan;
    testingRequirements?: TestingRequirement[];
    documentationLinks?: string[];
    stakeholders?: string[];
  };

  // Enhanced routing and delivery
  routingPolicy?: RoutingPolicy;
  broadcastScope?: BroadcastScope;
  deliveryGuarantee?: DeliveryGuarantee;
  retryPolicy?: RetryPolicy;

  // Multi-agent coordination
  coordinationPattern?: CoordinationPattern;
  synchronizationRequired?: boolean;
  consensusRequired?: boolean;
}

export enum DevelopmentLayer {
  PRESENTATION = 'presentation',
  APPLICATION = 'application',
  DOMAIN = 'domain',
  INFRASTRUCTURE = 'infrastructure',
  DATABASE = 'database',
  INTEGRATION = 'integration'
}

export enum DevelopmentPhase {
  DISCOVERY = 'discovery',
  PLANNING = 'planning',
  DESIGN = 'design',
  IMPLEMENTATION = 'implementation',
  TESTING = 'testing',
  REVIEW = 'review',
  DEPLOYMENT = 'deployment',
  MONITORING = 'monitoring'
}

export enum CriticalityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
  BLOCKER = 'blocker'
}

export enum PerformanceImpact {
  NONE = 'none',
  MINIMAL = 'minimal',
  MODERATE = 'moderate',
  SIGNIFICANT = 'significant',
  SEVERE = 'severe'
}

export interface IntegrationPoint {
  id: string;
  type: IntegrationType;
  sourceService: string;
  targetService: string;
  contract: APIContract;
  status: IntegrationStatus;
}

export enum IntegrationType {
  REST_API = 'rest-api',
  GRAPHQL = 'graphql',
  WEBSOCKET = 'websocket',
  MESSAGE_QUEUE = 'message-queue',
  DATABASE = 'database',
  FILE_SYSTEM = 'file-system',
  THIRD_PARTY = 'third-party'
}

export interface APIContract {
  version: string;
  schema: any; // JSON Schema or OpenAPI spec
  authentication: AuthenticationMethod;
  rateLimit?: RateLimit;
  deprecated?: boolean;
  deprecationDate?: Date;
}

export enum RoutingPolicy {
  DIRECT = 'direct',
  BROADCAST_CATEGORY = 'broadcast-category',
  BROADCAST_LAYER = 'broadcast-layer',
  BROADCAST_PHASE = 'broadcast-phase',
  DEPENDENCY_CHAIN = 'dependency-chain',
  HIERARCHICAL = 'hierarchical',
  MULTICAST = 'multicast',
  CONDITIONAL = 'conditional'
}

export enum BroadcastScope {
  SWARM = 'swarm',
  CATEGORY = 'category',
  TIER = 'tier',
  LAYER = 'layer',
  PHASE = 'phase',
  DEPENDENCY_GROUP = 'dependency-group',
  AFFECTED_AGENTS = 'affected-agents'
}

export enum DeliveryGuarantee {
  BEST_EFFORT = 'best-effort',
  AT_LEAST_ONCE = 'at-least-once',
  EXACTLY_ONCE = 'exactly-once',
  ORDERED = 'ordered'
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterPercent: number;
}

export enum CoordinationPattern {
  SEQUENTIAL = 'sequential',      // One agent at a time
  PARALLEL = 'parallel',          // Multiple agents simultaneously
  PIPELINE = 'pipeline',          // Assembly line pattern
  HIERARCHICAL = 'hierarchical',  // Through management chain
  PEER_TO_PEER = 'peer-to-peer', // Direct communication
  CONSENSUS = 'consensus',        // Agreement required
  LEADER_FOLLOWER = 'leader-follower' // One leads, others follow
}
```

### 3. Enhanced SwarmMessageRouter Implementation

**File: `src/web/messaging/enhanced-swarm-message-router.ts`**

```typescript
/**
 * Enhanced SwarmMessageRouter supporting 2-20 agents with full-stack coordination
 */

import { SwarmMessageRouter, AgentMessage, SwarmState } from './swarm-message-router.js';
import { ILogger } from '../../core/logger.js';
import { ResourceAllocator } from './resource-allocator.js';
import { PerformanceOptimizer } from './performance-optimizer.js';
import { BackwardCompatibilityManager } from './backward-compatibility.js';
import {
  FullStackAgentMessage,
  EnhancedAgentConfig,
  AgentCategory,
  RoutingPolicy,
  CoordinationPattern
} from '../types/full-stack-message-types.js';

export interface EnhancedRouterConfig {
  maxAgentsPerSwarm?: number;
  enablePerformanceOptimization?: boolean;
  enableBackwardCompatibility?: boolean;
  routingOptimization?: 'memory' | 'latency' | 'throughput';
  messageBuffering?: boolean;
  consensusTimeout?: number;
}

export interface EnhancedSwarmState extends SwarmState {
  agentConfigs: Map<string, EnhancedAgentConfig>;
  dependencyGraph: Map<string, Set<string>>;
  integrationPoints: Map<string, IntegrationPoint>;
  phaseState: DevelopmentPhase;
  resourceUtilization: ResourceUtilization;
  performanceMetrics: PerformanceMetrics;
}

export class EnhancedSwarmMessageRouter extends SwarmMessageRouter {
  private maxAgentsPerSwarm: number;
  private resourceAllocator: ResourceAllocator;
  private performanceOptimizer: PerformanceOptimizer;
  private compatibilityManager: BackwardCompatibilityManager;

  // Enhanced state management
  private enhancedSwarmStates = new Map<string, EnhancedSwarmState>();
  private coordinationPatterns = new Map<string, CoordinationPattern>();
  private messageBuffer = new Map<string, FullStackAgentMessage[]>();

  // Routing optimizations
  private routingCache = new Map<string, RoutingResult>();
  private agentCapabilityIndex = new Map<string, Set<string>>();

  constructor(logger: ILogger, config: EnhancedRouterConfig = {}) {
    super(logger);

    this.maxAgentsPerSwarm = config.maxAgentsPerSwarm || 20;
    this.resourceAllocator = new ResourceAllocator(logger, config);
    this.performanceOptimizer = new PerformanceOptimizer(logger, config);
    this.compatibilityManager = new BackwardCompatibilityManager(logger);

    this.initializeEnhancedCapabilities();
  }

  /**
   * Enhanced message handling with full-stack coordination
   */
  public handleAgentMessage(message: AgentMessage | FullStackAgentMessage): void {
    try {
      const enhancedMessage = this.ensureEnhancedMessage(message);
      const swarmState = this.getOrCreateEnhancedSwarmState(enhancedMessage.swarmId);

      // Backward compatibility check
      if (this.compatibilityManager.isLegacySwarm(swarmState)) {
        this.logger.debug('Handling legacy swarm message', { swarmId: enhancedMessage.swarmId });
        return super.handleAgentMessage(message);
      }

      // Validate enhanced swarm capacity
      if (!this.validateEnhancedSwarmCapacity(enhancedMessage, swarmState)) {
        return;
      }

      // Register or update agent
      this.registerEnhancedAgent(enhancedMessage, swarmState);

      // Store message with enhanced indexing
      this.storeEnhancedMessage(enhancedMessage);

      // Update coordination state
      this.updateEnhancedCoordination(enhancedMessage, swarmState);

      // Route message using enhanced policies
      this.routeEnhancedMessage(enhancedMessage, swarmState);

      // Update performance metrics
      this.performanceOptimizer.recordMessage(enhancedMessage);

      // Emit enhanced events
      this.emit('enhanced-message', enhancedMessage);

    } catch (error) {
      this.logger.error('Error handling enhanced agent message', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.id,
        messageType: message.messageType
      });
      throw error;
    }
  }

  /**
   * Enhanced agent registration with capability indexing
   */
  private registerEnhancedAgent(
    message: FullStackAgentMessage,
    swarmState: EnhancedSwarmState
  ): void {
    const existingAgent = swarmState.agents.find(a => a.id === message.agentId);

    if (!existingAgent) {
      // Add new agent
      const agentType = this.parseEnhancedAgentType(message.agentType);
      const newAgent = {
        id: message.agentId,
        type: message.agentType,
        category: agentType.category,
        tier: agentType.tier,
        status: 'active' as const,
        joinedAt: new Date().toISOString(),
        capabilities: this.getAgentCapabilities(message.agentType)
      };

      swarmState.agents.push(newAgent);

      // Index agent capabilities for efficient routing
      this.indexAgentCapabilities(message.agentId, newAgent.capabilities);

      // Update resource allocation
      this.resourceAllocator.allocateAgent(message.agentId, agentType);

      this.logger.info('Enhanced agent registered', {
        swarmId: message.swarmId,
        agentId: message.agentId,
        category: agentType.category,
        tier: agentType.tier,
        totalAgents: swarmState.agents.length
      });
    }

    // Update agent status
    this.updateAgentStatus(existingAgent || swarmState.agents[swarmState.agents.length - 1], message);
  }

  /**
   * Enhanced message routing with multiple strategies
   */
  private routeEnhancedMessage(
    message: FullStackAgentMessage,
    swarmState: EnhancedSwarmState
  ): void {
    const routingPolicy = message.routingPolicy || this.determineOptimalRouting(message, swarmState);

    // Check routing cache first
    const cacheKey = this.generateRoutingCacheKey(message, routingPolicy);
    let routingResult = this.routingCache.get(cacheKey);

    if (!routingResult || this.isCacheStale(routingResult)) {
      routingResult = this.calculateRouting(message, swarmState, routingPolicy);
      this.routingCache.set(cacheKey, routingResult);
    }

    // Execute routing based on policy
    switch (routingPolicy) {
      case RoutingPolicy.DIRECT:
        this.executeDirectRouting(message, routingResult);
        break;
      case RoutingPolicy.BROADCAST_CATEGORY:
        this.executeCategoryBroadcast(message, swarmState, routingResult);
        break;
      case RoutingPolicy.BROADCAST_LAYER:
        this.executeLayerBroadcast(message, swarmState, routingResult);
        break;
      case RoutingPolicy.DEPENDENCY_CHAIN:
        this.executeDependencyChainRouting(message, swarmState, routingResult);
        break;
      case RoutingPolicy.HIERARCHICAL:
        this.executeHierarchicalRouting(message, swarmState, routingResult);
        break;
      case RoutingPolicy.CONDITIONAL:
        this.executeConditionalRouting(message, swarmState, routingResult);
        break;
      default:
        this.executeMulticastRouting(message, swarmState, routingResult);
    }

    // Handle coordination patterns
    this.handleCoordinationPattern(message, swarmState);
  }

  /**
   * Handle different coordination patterns
   */
  private handleCoordinationPattern(
    message: FullStackAgentMessage,
    swarmState: EnhancedSwarmState
  ): void {
    const pattern = message.coordinationPattern || CoordinationPattern.PEER_TO_PEER;

    switch (pattern) {
      case CoordinationPattern.SEQUENTIAL:
        this.handleSequentialCoordination(message, swarmState);
        break;
      case CoordinationPattern.PARALLEL:
        this.handleParallelCoordination(message, swarmState);
        break;
      case CoordinationPattern.PIPELINE:
        this.handlePipelineCoordination(message, swarmState);
        break;
      case CoordinationPattern.CONSENSUS:
        this.handleConsensusCoordination(message, swarmState);
        break;
      case CoordinationPattern.LEADER_FOLLOWER:
        this.handleLeaderFollowerCoordination(message, swarmState);
        break;
      default:
        this.handlePeerToPeerCoordination(message, swarmState);
    }
  }

  /**
   * Handle consensus-based coordination
   */
  private handleConsensusCoordination(
    message: FullStackAgentMessage,
    swarmState: EnhancedSwarmState
  ): void {
    if (!message.consensusRequired) return;

    const consensusGroup = this.identifyConsensusGroup(message, swarmState);
    const consensusId = this.generateConsensusId();

    // Initiate consensus process
    const consensusMessage = {
      ...message,
      id: consensusId,
      messageType: 'consensus-request' as const,
      targetAgents: consensusGroup.map(agent => agent.id),
      metadata: {
        ...message.metadata,
        consensusTimeout: Date.now() + (this.config?.consensusTimeout || 30000),
        requiredVotes: Math.ceil(consensusGroup.length / 2) + 1
      }
    };

    this.emit('consensus-initiated', consensusMessage);
  }

  /**
   * Validate enhanced swarm capacity with intelligent limits
   */
  private validateEnhancedSwarmCapacity(
    message: FullStackAgentMessage,
    swarmState: EnhancedSwarmState
  ): boolean {
    const currentAgentCount = swarmState.agents.length;

    // Check absolute limit
    if (currentAgentCount >= this.maxAgentsPerSwarm) {
      this.logger.warn('Swarm at maximum capacity', {
        swarmId: message.swarmId,
        currentAgents: currentAgentCount,
        maxAgents: this.maxAgentsPerSwarm
      });
      return false;
    }

    // Check if agent already exists
    if (swarmState.agents.some(a => a.id === message.agentId)) {
      return true; // Agent update, not new addition
    }

    const agentType = this.parseEnhancedAgentType(message.agentType);

    // Check category-specific limits
    const categoryLimits = this.calculateCategoryLimits(swarmState);
    const categoryCount = this.countAgentsByCategory(swarmState, agentType.category);

    if (categoryCount >= categoryLimits[agentType.category]) {
      this.logger.warn('Category limit reached', {
        swarmId: message.swarmId,
        category: agentType.category,
        currentCount: categoryCount,
        limit: categoryLimits[agentType.category]
      });
      return false;
    }

    // Check resource availability
    return this.resourceAllocator.canAllocateAgent(agentType, swarmState);
  }

  /**
   * Calculate dynamic category limits based on swarm state
   */
  private calculateCategoryLimits(swarmState: EnhancedSwarmState): Record<AgentCategory, number> {
    const totalAgents = swarmState.agents.length;
    const baseLimit = Math.ceil(this.maxAgentsPerSwarm / Object.keys(AgentCategory).length);

    // Dynamic limits based on project complexity and current distribution
    const limits: Record<AgentCategory, number> = {} as any;

    Object.values(AgentCategory).forEach(category => {
      switch (category) {
        case AgentCategory.FRONTEND:
        case AgentCategory.BACKEND:
          limits[category] = Math.min(Math.ceil(totalAgents * 0.4), 8);
          break;
        case AgentCategory.QA:
        case AgentCategory.TESTING:
          limits[category] = Math.min(Math.ceil(totalAgents * 0.3), 6);
          break;
        case AgentCategory.DEVOPS:
        case AgentCategory.INFRASTRUCTURE:
          limits[category] = Math.min(Math.ceil(totalAgents * 0.2), 4);
          break;
        case AgentCategory.ARCHITECT:
        case AgentCategory.COORDINATOR:
          limits[category] = Math.min(Math.ceil(totalAgents * 0.1), 2);
          break;
        default:
          limits[category] = baseLimit;
      }
    });

    return limits;
  }

  /**
   * Ensure message is in enhanced format
   */
  private ensureEnhancedMessage(message: AgentMessage | FullStackAgentMessage): FullStackAgentMessage {
    if (this.isEnhancedMessage(message)) {
      return message;
    }

    return this.compatibilityManager.adaptLegacyMessage(message);
  }

  private isEnhancedMessage(message: AgentMessage | FullStackAgentMessage): message is FullStackAgentMessage {
    return 'routingPolicy' in message || 'coordinationPattern' in message;
  }

  /**
   * Get or create enhanced swarm state
   */
  private getOrCreateEnhancedSwarmState(swarmId: string): EnhancedSwarmState {
    if (!this.enhancedSwarmStates.has(swarmId)) {
      const baseState = this.getOrCreateSwarmState(swarmId);
      const enhancedState: EnhancedSwarmState = {
        ...baseState,
        agentConfigs: new Map(),
        dependencyGraph: new Map(),
        integrationPoints: new Map(),
        phaseState: DevelopmentPhase.PLANNING,
        resourceUtilization: this.resourceAllocator.createEmptyUtilization(),
        performanceMetrics: this.performanceOptimizer.createEmptyMetrics()
      };

      this.enhancedSwarmStates.set(swarmId, enhancedState);
    }

    return this.enhancedSwarmStates.get(swarmId)!;
  }

  /**
   * Initialize enhanced capabilities
   */
  private initializeEnhancedCapabilities(): void {
    // Set up performance monitoring
    this.performanceOptimizer.initialize();

    // Initialize capability indexing
    this.buildCapabilityIndex();

    // Set up cleanup intervals
    this.setupCleanupIntervals();

    this.logger.info('Enhanced SwarmMessageRouter initialized', {
      maxAgentsPerSwarm: this.maxAgentsPerSwarm,
      features: ['enhanced-routing', 'resource-allocation', 'performance-optimization']
    });
  }

  // Public API extensions

  /**
   * Get enhanced swarm metrics
   */
  public getEnhancedSwarmMetrics(swarmId: string): EnhancedSwarmMetrics {
    const state = this.enhancedSwarmStates.get(swarmId);
    if (!state) {
      throw new Error(`Enhanced swarm ${swarmId} not found`);
    }

    return {
      ...this.getSwarmState(swarmId),
      agentDistribution: this.calculateAgentDistribution(state),
      resourceUtilization: state.resourceUtilization,
      performanceMetrics: state.performanceMetrics,
      coordinationEfficiency: this.calculateCoordinationEfficiency(state),
      integrationHealth: this.assessIntegrationHealth(state)
    };
  }

  /**
   * Force swarm rebalancing
   */
  public async rebalanceSwarm(swarmId: string): Promise<RebalanceResult> {
    const state = this.enhancedSwarmStates.get(swarmId);
    if (!state) {
      throw new Error(`Enhanced swarm ${swarmId} not found`);
    }

    return await this.resourceAllocator.rebalanceSwarm(state);
  }

  /**
   * Update swarm configuration
   */
  public updateSwarmConfig(swarmId: string, config: Partial<EnhancedRouterConfig>): void {
    const state = this.enhancedSwarmStates.get(swarmId);
    if (!state) {
      throw new Error(`Enhanced swarm ${swarmId} not found`);
    }

    if (config.maxAgentsPerSwarm) {
      this.maxAgentsPerSwarm = config.maxAgentsPerSwarm;
    }

    this.logger.info('Swarm configuration updated', { swarmId, config });
  }

  // Additional helper methods would be implemented here...
}

// Export enhanced interfaces and types
export interface EnhancedSwarmMetrics {
  swarmId: string;
  agents: Array<{
    id: string;
    type: string;
    category: AgentCategory;
    status: string;
  }>;
  agentDistribution: Record<AgentCategory, number>;
  resourceUtilization: ResourceUtilization;
  performanceMetrics: PerformanceMetrics;
  coordinationEfficiency: number;
  integrationHealth: number;
}

export interface RebalanceResult {
  success: boolean;
  changes: Array<{
    agentId: string;
    action: 'added' | 'removed' | 'reassigned';
    reason: string;
  }>;
  newDistribution: Record<AgentCategory, number>;
}
```

### 4. Resource Allocator Implementation

**File: `src/web/messaging/resource-allocator.ts`**

```typescript
/**
 * Intelligent resource allocation for enhanced swarms
 */

import { ILogger } from '../../core/logger.js';
import { EnhancedAgentConfig, AgentCategory, AgentTier } from '../types/enhanced-agent-types.js';
import { EnhancedSwarmState, EnhancedRouterConfig } from './enhanced-swarm-message-router.js';

export interface ResourceUtilization {
  cpu: { used: number; total: number; percentage: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  network: { used: number; total: number; percentage: number };
  byAgent: Map<string, AgentResourceUsage>;
  byCategory: Map<AgentCategory, CategoryResourceUsage>;
}

export interface AgentResourceUsage {
  agentId: string;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  activeTasks: number;
  efficiency: number;
}

export interface CategoryResourceUsage {
  category: AgentCategory;
  totalAgents: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  };
  averageEfficiency: number;
}

export interface AllocationRequest {
  agentType: string;
  priority: number;
  estimatedDuration: number;
  requiredCapabilities: string[];
  preferredAgents?: string[];
  resourceRequirements: {
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  };
}

export interface AllocationResult {
  success: boolean;
  allocatedAgent?: string;
  estimatedCompletion?: Date;
  alternativeAgents?: string[];
  reason?: string;
  resourceProjection: ResourceProjection;
}

export interface ResourceProjection {
  futureUtilization: ResourceUtilization;
  riskAssessment: RiskLevel;
  recommendedActions: string[];
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export class ResourceAllocator {
  private resourceUtilization = new Map<string, ResourceUtilization>();
  private allocationHistory = new Map<string, AllocationRecord[]>();
  private performanceMetrics = new Map<string, AgentPerformanceMetrics>();

  constructor(
    private logger: ILogger,
    private config: EnhancedRouterConfig
  ) {
    this.initializeResourceTracking();
  }

  /**
   * Check if an agent can be allocated to a swarm
   */
  public canAllocateAgent(agentType: any, swarmState: EnhancedSwarmState): boolean {
    const utilization = this.resourceUtilization.get(swarmState.swarmId);
    if (!utilization) return true; // New swarm, no restrictions

    // Check overall resource limits
    if (this.wouldExceedResourceLimits(agentType, utilization)) {
      return false;
    }

    // Check category balance
    if (this.wouldCreateImbalance(agentType, swarmState)) {
      return false;
    }

    // Check specialized resource conflicts
    return !this.hasResourceConflicts(agentType, swarmState);
  }

  /**
   * Allocate an agent to a swarm
   */
  public async allocateAgent(agentId: string, agentType: any): Promise<void> {
    // Implementation for agent allocation
    this.logger.debug('Allocating agent', { agentId, agentType: agentType.category });
  }

  /**
   * Create empty resource utilization
   */
  public createEmptyUtilization(): ResourceUtilization {
    return {
      cpu: { used: 0, total: 100, percentage: 0 },
      memory: { used: 0, total: 8192, percentage: 0 },
      disk: { used: 0, total: 51200, percentage: 0 },
      network: { used: 0, total: 1000, percentage: 0 },
      byAgent: new Map(),
      byCategory: new Map()
    };
  }

  /**
   * Rebalance swarm resources
   */
  public async rebalanceSwarm(swarmState: EnhancedSwarmState): Promise<any> {
    // Implementation for swarm rebalancing
    return {
      success: true,
      changes: [],
      newDistribution: {}
    };
  }

  private wouldExceedResourceLimits(agentType: any, utilization: ResourceUtilization): boolean {
    // Check if adding this agent would exceed resource limits
    return false; // Placeholder implementation
  }

  private wouldCreateImbalance(agentType: any, swarmState: EnhancedSwarmState): boolean {
    // Check if adding this agent would create team imbalance
    return false; // Placeholder implementation
  }

  private hasResourceConflicts(agentType: any, swarmState: EnhancedSwarmState): boolean {
    // Check for resource conflicts with existing agents
    return false; // Placeholder implementation
  }

  private initializeResourceTracking(): void {
    // Initialize resource tracking systems
    this.logger.debug('Resource allocator initialized');
  }
}
```

### 5. Performance Optimizer Implementation

**File: `src/web/messaging/performance-optimizer.ts`**

```typescript
/**
 * Performance optimization for large swarms
 */

import { ILogger } from '../../core/logger.js';
import { FullStackAgentMessage } from '../types/full-stack-message-types.js';
import { EnhancedRouterConfig } from './enhanced-swarm-message-router.js';

export interface PerformanceMetrics {
  messageLatency: {
    average: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
  };
  routing: {
    cacheHitRate: number;
    averageHops: number;
    routingDecisionTime: number;
  };
  coordination: {
    consensusTime: number;
    coordinationOverhead: number;
    successRate: number;
  };
}

export interface OptimizationStrategy {
  messageBuffering: boolean;
  routingCaching: boolean;
  connectionPooling: boolean;
  batchProcessing: boolean;
  compressionEnabled: boolean;
}

export class PerformanceOptimizer {
  private metrics: PerformanceMetrics;
  private strategy: OptimizationStrategy;

  constructor(
    private logger: ILogger,
    private config: EnhancedRouterConfig
  ) {
    this.metrics = this.createEmptyMetrics();
    this.strategy = this.determineOptimizationStrategy();
  }

  public initialize(): void {
    this.logger.debug('Performance optimizer initialized');
  }

  public recordMessage(message: FullStackAgentMessage): void {
    // Record message for performance metrics
  }

  public createEmptyMetrics(): PerformanceMetrics {
    return {
      messageLatency: {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0
      },
      throughput: {
        messagesPerSecond: 0,
        bytesPerSecond: 0
      },
      routing: {
        cacheHitRate: 0,
        averageHops: 0,
        routingDecisionTime: 0
      },
      coordination: {
        consensusTime: 0,
        coordinationOverhead: 0,
        successRate: 100
      }
    };
  }

  private determineOptimizationStrategy(): OptimizationStrategy {
    return {
      messageBuffering: true,
      routingCaching: true,
      connectionPooling: true,
      batchProcessing: true,
      compressionEnabled: false
    };
  }
}
```

### 6. Backward Compatibility Manager

**File: `src/web/messaging/backward-compatibility.ts`**

```typescript
/**
 * Backward compatibility manager for legacy swarms
 */

import { ILogger } from '../../core/logger.js';
import { AgentMessage } from './swarm-message-router.js';
import { FullStackAgentMessage, DevelopmentLayer, DevelopmentPhase, RoutingPolicy, BroadcastScope } from '../types/full-stack-message-types.js';
import { EnhancedSwarmState } from './enhanced-swarm-message-router.js';

export class BackwardCompatibilityManager {
  constructor(private logger: ILogger) {}

  /**
   * Check if swarm is using legacy 3-agent pattern
   */
  public isLegacySwarm(swarmState: any): boolean {
    // Check agent count
    if (swarmState.agents.length > 3) {
      return false;
    }

    // Check agent types
    const legacyTypes = new Set(['researcher', 'coder', 'reviewer']);
    const agentTypes = new Set(swarmState.agents.map((a: any) => a.type));

    // If all agents are legacy types, treat as legacy
    return Array.from(agentTypes).every(type => legacyTypes.has(type));
  }

  /**
   * Adapt legacy message to enhanced format
   */
  public adaptLegacyMessage(legacyMessage: AgentMessage): FullStackAgentMessage {
    return {
      ...legacyMessage,
      metadata: {
        ...legacyMessage.metadata,
        layer: this.inferLayer(legacyMessage.agentType),
        phase: DevelopmentPhase.IMPLEMENTATION,
        criticality: 'medium' as const,
        integrationPoints: [],
        affectedServices: [],
        performanceImpact: 'minimal' as const,
        securityImplications: false
      },
      routingPolicy: RoutingPolicy.DIRECT,
      broadcastScope: BroadcastScope.SWARM,
      deliveryGuarantee: 'best-effort' as const
    };
  }

  private inferLayer(agentType: string): DevelopmentLayer {
    switch (agentType) {
      case 'researcher':
        return DevelopmentLayer.DOMAIN;
      case 'coder':
        return DevelopmentLayer.APPLICATION;
      case 'reviewer':
        return DevelopmentLayer.APPLICATION;
      default:
        return DevelopmentLayer.APPLICATION;
    }
  }
}
```

## Implementation Guidelines

### 1. Migration Strategy

**Phase 1: Core Infrastructure**
1. Implement enhanced type system
2. Create backward compatibility layer
3. Extend SwarmMessageRouter with basic enhancements

**Phase 2: Advanced Features**
1. Implement resource allocation
2. Add performance optimization
3. Create integration coordinators

**Phase 3: Full Feature Set**
1. Add Chrome MCP integration
2. Implement shadcn workflow coordination
3. Complete testing and documentation

### 2. Testing Strategy

```typescript
// Example test structure
describe('EnhancedSwarmMessageRouter', () => {
  describe('Backward Compatibility', () => {
    it('should handle legacy 3-agent swarms', () => {
      // Test legacy swarm detection and handling
    });
  });

  describe('Dynamic Scaling', () => {
    it('should support 2-20 agents dynamically', () => {
      // Test dynamic agent addition/removal
    });
  });

  describe('Full-Stack Coordination', () => {
    it('should coordinate across development layers', () => {
      // Test layer-based coordination
    });
  });
});
```

### 3. Performance Benchmarks

- **Message Latency**: < 50ms for swarms ≤ 10 agents
- **Throughput**: 1000+ messages/second
- **Memory Usage**: < 100MB per swarm
- **CPU Usage**: < 5% per agent under normal load

## Conclusion

This implementation specification provides a comprehensive roadmap for extending the SwarmMessageRouter system to support full-stack development teams. The design maintains backward compatibility while introducing sophisticated coordination capabilities that scale from 2 to 20 agents.

The modular architecture allows for incremental implementation and testing, ensuring system stability throughout the migration process.