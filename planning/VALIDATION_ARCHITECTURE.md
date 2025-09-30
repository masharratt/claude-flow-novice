# Validation Architecture Design
## Automated Swarm Init & TodoWrite Batching Validation

**Version**: 1.0
**Date**: 2025-09-30
**Author**: System Architect Agent
**Status**: Design Complete - Ready for Implementation

---

## Executive Summary

This document defines the architecture for two automated validation features that enforce CLAUDE.md coordination patterns:

1. **Automated Swarm Init Validation** (4 hours) - Detects and prevents agent spawning without swarm initialization
2. **Automated TodoWrite Batching Validation** (3 hours) - Detects and warns about incremental todo anti-patterns

**Current State**: Manual enforcement via CLAUDE.md instructions (100% compliance observed in tests)
**Target State**: Automated validation with configurable enforcement levels (warnings → blocking)
**Integration**: Pre-command hooks, CLI flags, real-time monitoring

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Component Design](#component-design)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [API Specifications](#api-specifications)
5. [File Structure](#file-structure)
6. [Integration Strategy](#integration-strategy)
7. [Configuration Options](#configuration-options)
8. [Error Handling](#error-handling)
9. [Testing Strategy](#testing-strategy)
10. [Implementation Guidelines](#implementation-guidelines)
11. [Performance Considerations](#performance-considerations)
12. [Backward Compatibility](#backward-compatibility)

---

## System Architecture Overview

### Architecture Principles

1. **Non-Breaking**: Validation is opt-in initially, can be made mandatory via config
2. **Progressive Enhancement**: Start with warnings, upgrade to blocking when confidence high
3. **Integration-First**: Leverage existing hook infrastructure
4. **Agent-Friendly**: Provide structured JSON responses for agent consumption
5. **Human-Friendly**: Clear error messages with actionable fixes

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Command Layer                         │
│  (swarm init, agent spawn, TodoWrite, task orchestrate)         │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Pre-Command Hook System                       │
│  ┌──────────────────────┐    ┌───────────────────────────┐    │
│  │ Swarm Init Validator │    │ TodoWrite Batch Validator │    │
│  └──────────┬───────────┘    └───────────┬───────────────┘    │
│             │                             │                     │
│             ▼                             ▼                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            Validation State Manager                       │  │
│  │  - Track swarm initialization status                      │  │
│  │  - Monitor TodoWrite call frequency                       │  │
│  │  - Maintain validation history                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────┬────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Memory & Persistence Layer                    │
│  - .claude-flow/validation-state.json                           │
│  - SwarmMemory integration                                       │
│  - Metrics tracking                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
User Command
     │
     ▼
┌────────────────┐
│ CLI Handler    │
└────┬───────────┘
     │
     ▼
┌────────────────────────┐
│ Pre-Command Hook       │──────────┐
│ - Intercept command    │          │
│ - Extract parameters   │          │
└────┬───────────────────┘          │
     │                               │
     ▼                               ▼
┌────────────────────────┐    ┌─────────────────────┐
│ Validator Selection    │    │ Validation State    │
│ - swarm init?          │◄───│ - Current swarm?    │
│ - agent spawn?         │    │ - TodoWrite log?    │
│ - TodoWrite?           │    │ - Config settings?  │
└────┬───────────────────┘    └─────────────────────┘
     │
     ▼
┌────────────────────────┐
│ Validation Execution   │
│ - Run checks           │
│ - Generate report      │
│ - Determine action     │
└────┬───────────────────┘
     │
     ▼
┌────────────────────────┐
│ Response Handler       │
│ - PASS: Continue       │
│ - WARN: Display + Cont │
│ - BLOCK: Error + Abort │
└────┬───────────────────┘
     │
     ▼
┌────────────────────────┐
│ Metrics & Logging      │
│ - Store results        │
│ - Update state         │
│ - Emit events          │
└────────────────────────┘
```

---

## Component Design

### 1. Swarm Init Validator

**Purpose**: Ensure swarm initialization occurs before multi-agent spawning

**Responsibilities**:
- Monitor swarm initialization calls
- Track active swarm state
- Validate agent spawn attempts against swarm state
- Generate actionable error messages

**Key Classes**:

```typescript
// src/validators/swarm-init-validator.ts

import { ValidationResult, ValidationError, SwarmState } from '../types/validation.js';
import { SwarmMemoryManager } from '../memory/swarm-memory.js';

export interface SwarmInitValidationConfig {
  enabled: boolean;
  mode: 'warn' | 'block' | 'disabled';
  minAgentsForSwarm: number; // Default: 2
  trackStateInMemory: boolean;
  autoSuggestTopology: boolean;
}

export interface SwarmValidationContext {
  agentCount: number;
  currentSwarm?: SwarmState;
  commandTimestamp: Date;
  commandSource: 'cli' | 'mcp' | 'api';
}

export class SwarmInitValidator {
  private config: SwarmInitValidationConfig;
  private stateManager: ValidationStateManager;
  private memoryManager: SwarmMemoryManager;

  constructor(config: SwarmInitValidationConfig) {
    this.config = config;
    this.stateManager = new ValidationStateManager();
    this.memoryManager = new SwarmMemoryManager();
  }

  /**
   * Validate swarm initialization before agent spawning
   * @returns ValidationResult with pass/fail + recommendations
   */
  async validateSwarmInit(context: SwarmValidationContext): Promise<ValidationResult> {
    // Check if validation is enabled
    if (!this.config.enabled || this.config.mode === 'disabled') {
      return { valid: true, errors: [], warnings: [] };
    }

    // Single agent spawn doesn't require swarm
    if (context.agentCount < this.config.minAgentsForSwarm) {
      return { valid: true, errors: [], warnings: [] };
    }

    // Check if swarm is initialized
    const swarmState = await this.stateManager.getCurrentSwarmState();

    if (!swarmState || !swarmState.initialized) {
      return this.generateSwarmInitError(context);
    }

    // Validate topology matches agent count
    const topologyValidation = this.validateTopology(swarmState, context.agentCount);
    if (!topologyValidation.valid) {
      return topologyValidation;
    }

    // All checks passed
    return {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        swarmId: swarmState.id,
        topology: swarmState.topology,
        maxAgents: swarmState.maxAgents
      }
    };
  }

  /**
   * Generate detailed error message for missing swarm init
   */
  private generateSwarmInitError(context: SwarmValidationContext): ValidationResult {
    const suggestedTopology = context.agentCount <= 7 ? 'mesh' : 'hierarchical';

    const error: ValidationError = {
      field: 'swarm_initialization',
      code: 'SWARM_NOT_INITIALIZED',
      severity: this.config.mode === 'block' ? 'critical' : 'error',
      message: `Swarm initialization required for ${context.agentCount} agents`,
      fix: {
        description: 'Initialize swarm before spawning agents',
        commands: [
          `npx claude-flow-novice swarm init --topology ${suggestedTopology} --max-agents ${context.agentCount}`,
          '# OR via MCP',
          `mcp__claude-flow-novice__swarm_init({ topology: "${suggestedTopology}", maxAgents: ${context.agentCount}, strategy: "balanced" })`
        ],
        documentation: 'See CLAUDE.md section: "Swarm Initialization (MANDATORY)"'
      }
    };

    return {
      valid: false,
      errors: [error],
      warnings: [],
      blocking: this.config.mode === 'block',
      metadata: {
        suggestedTopology,
        detectedAgentCount: context.agentCount,
        timestamp: context.commandTimestamp
      }
    };
  }

  /**
   * Validate topology matches agent count requirements
   */
  private validateTopology(swarm: SwarmState, agentCount: number): ValidationResult {
    const errors: ValidationError[] = [];

    // Check agent count vs maxAgents
    if (agentCount > swarm.maxAgents) {
      errors.push({
        field: 'max_agents',
        code: 'AGENT_COUNT_EXCEEDED',
        severity: 'error',
        message: `Attempting to spawn ${agentCount} agents but swarm maxAgents is ${swarm.maxAgents}`,
        fix: {
          description: 'Reinitialize swarm with higher maxAgents',
          commands: [
            `npx claude-flow-novice swarm init --topology ${swarm.topology} --max-agents ${agentCount}`
          ]
        }
      });
    }

    // Check topology appropriateness
    if (agentCount >= 8 && swarm.topology === 'mesh') {
      errors.push({
        field: 'topology',
        code: 'TOPOLOGY_MISMATCH',
        severity: 'error',
        message: 'Mesh topology recommended for 2-7 agents; use hierarchical for 8+',
        fix: {
          description: 'Use hierarchical topology for better coordination',
          commands: [
            `npx claude-flow-novice swarm init --topology hierarchical --max-agents ${agentCount}`
          ]
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Record successful swarm initialization
   */
  async recordSwarmInit(swarmId: string, topology: string, maxAgents: number): Promise<void> {
    const state: SwarmState = {
      id: swarmId,
      initialized: true,
      topology,
      maxAgents,
      agentsSpawned: 0,
      createdAt: new Date(),
      status: 'active'
    };

    await this.stateManager.updateSwarmState(state);

    if (this.config.trackStateInMemory) {
      await this.memoryManager.store(`swarm/${swarmId}/state`, state);
    }
  }

  /**
   * Record agent spawn (increment counter)
   */
  async recordAgentSpawn(agentCount: number): Promise<void> {
    const state = await this.stateManager.getCurrentSwarmState();
    if (state) {
      state.agentsSpawned += agentCount;
      await this.stateManager.updateSwarmState(state);
    }
  }
}
```

### 2. TodoWrite Batching Validator

**Purpose**: Detect and prevent incremental todo anti-patterns

**Responsibilities**:
- Monitor TodoWrite call frequency
- Track todo batch sizes
- Detect anti-patterns (multiple small calls)
- Provide batching recommendations

**Key Classes**:

```typescript
// src/validators/todowrite-batch-validator.ts

import { ValidationResult, ValidationWarning } from '../types/validation.js';

export interface TodoWriteBatchConfig {
  enabled: boolean;
  mode: 'warn' | 'block' | 'disabled';
  minBatchSize: number; // Default: 5
  timeWindowMs: number; // Default: 300000 (5 minutes)
  maxCallsInWindow: number; // Default: 2
  trackHistory: boolean;
}

export interface TodoWriteCall {
  timestamp: Date;
  itemCount: number;
  callStack?: string;
  source: string;
}

export class TodoWriteBatchValidator {
  private config: TodoWriteBatchConfig;
  private callLog: TodoWriteCall[] = [];
  private stateManager: ValidationStateManager;

  constructor(config: TodoWriteBatchConfig) {
    this.config = config;
    this.stateManager = new ValidationStateManager();
    this.loadCallLog();
  }

  /**
   * Validate TodoWrite call for batching compliance
   */
  async validateBatchingPattern(itemCount: number, source: string): Promise<ValidationResult> {
    // Check if validation enabled
    if (!this.config.enabled || this.config.mode === 'disabled') {
      return { valid: true, errors: [], warnings: [] };
    }

    // Record this call
    const call: TodoWriteCall = {
      timestamp: new Date(),
      itemCount,
      source
    };

    this.callLog.push(call);
    this.cleanOldCalls();

    // Check batch size
    const batchSizeWarning = this.checkBatchSize(itemCount);

    // Check call frequency
    const frequencyWarning = this.checkCallFrequency();

    const warnings: ValidationWarning[] = [];

    if (batchSizeWarning) warnings.push(batchSizeWarning);
    if (frequencyWarning) warnings.push(frequencyWarning);

    // Store call log
    if (this.config.trackHistory) {
      await this.stateManager.updateTodoWriteLog(this.callLog);
    }

    return {
      valid: warnings.length === 0,
      errors: [],
      warnings,
      blocking: this.config.mode === 'block' && warnings.length > 0,
      metadata: {
        currentBatchSize: itemCount,
        recentCalls: this.callLog.length,
        timeWindowMinutes: this.config.timeWindowMs / 60000
      }
    };
  }

  /**
   * Check if batch size meets minimum threshold
   */
  private checkBatchSize(itemCount: number): ValidationWarning | null {
    if (itemCount < this.config.minBatchSize) {
      return {
        field: 'batch_size',
        code: 'SMALL_BATCH_SIZE',
        message: `TodoWrite batch size (${itemCount}) below recommended minimum (${this.config.minBatchSize})`,
        recommendation: `Batch ALL todos in single TodoWrite call with ${this.config.minBatchSize}+ items. See CLAUDE.md: "TodoWrite batching requirement"`
      };
    }
    return null;
  }

  /**
   * Check if too many calls in time window
   */
  private checkCallFrequency(): ValidationWarning | null {
    if (this.callLog.length >= this.config.maxCallsInWindow) {
      const callDetails = this.callLog.map((call, i) =>
        `  ${i + 1}. ${call.itemCount} items at ${call.timestamp.toISOString()}`
      ).join('\n');

      return {
        field: 'call_frequency',
        code: 'INCREMENTAL_TODO_ANTI_PATTERN',
        message: `${this.callLog.length} TodoWrite calls detected in ${this.config.timeWindowMs / 60000} minutes`,
        recommendation: `Anti-pattern detected! Batch ALL todos in SINGLE call instead of incremental updates.\n\nRecent calls:\n${callDetails}\n\nBest Practice: Plan all tasks upfront and create 5-10+ todos in one TodoWrite call.`
      };
    }
    return null;
  }

  /**
   * Remove calls outside time window
   */
  private cleanOldCalls(): void {
    const now = Date.now();
    const cutoff = now - this.config.timeWindowMs;

    this.callLog = this.callLog.filter(call =>
      call.timestamp.getTime() > cutoff
    );
  }

  /**
   * Load call log from persistent storage
   */
  private async loadCallLog(): Promise<void> {
    if (this.config.trackHistory) {
      const log = await this.stateManager.getTodoWriteLog();
      if (log) {
        this.callLog = log;
        this.cleanOldCalls();
      }
    }
  }

  /**
   * Get batching statistics for monitoring
   */
  async getBatchingStats(): Promise<{
    totalCalls: number;
    averageBatchSize: number;
    antiPatternDetections: number;
    complianceRate: number;
  }> {
    const totalCalls = this.callLog.length;
    const averageBatchSize = totalCalls > 0
      ? this.callLog.reduce((sum, call) => sum + call.itemCount, 0) / totalCalls
      : 0;

    const antiPatternDetections = this.callLog.filter(call =>
      call.itemCount < this.config.minBatchSize
    ).length;

    const complianceRate = totalCalls > 0
      ? ((totalCalls - antiPatternDetections) / totalCalls) * 100
      : 100;

    return {
      totalCalls,
      averageBatchSize,
      antiPatternDetections,
      complianceRate
    };
  }
}
```

### 3. Validation State Manager

**Purpose**: Centralized state management for validation data

```typescript
// src/validators/validation-state-manager.ts

import { promises as fs } from 'fs';
import path from 'path';

export interface ValidationState {
  swarm?: SwarmState;
  todoWriteLog?: TodoWriteCall[];
  metrics: ValidationMetrics;
  config: ValidationConfig;
}

export interface ValidationMetrics {
  swarmInitValidations: number;
  swarmInitBlocks: number;
  swarmInitWarnings: number;
  todoWriteValidations: number;
  todoWriteBlocks: number;
  todoWriteWarnings: number;
  lastUpdated: Date;
}

export class ValidationStateManager {
  private statePath: string;
  private state: ValidationState;

  constructor(baseDir: string = '.claude-flow') {
    this.statePath = path.join(process.cwd(), baseDir, 'validation-state.json');
    this.state = this.loadState();
  }

  /**
   * Get current swarm state
   */
  async getCurrentSwarmState(): Promise<SwarmState | null> {
    return this.state.swarm || null;
  }

  /**
   * Update swarm state
   */
  async updateSwarmState(swarm: SwarmState): Promise<void> {
    this.state.swarm = swarm;
    await this.saveState();
  }

  /**
   * Get TodoWrite call log
   */
  async getTodoWriteLog(): Promise<TodoWriteCall[]> {
    return this.state.todoWriteLog || [];
  }

  /**
   * Update TodoWrite call log
   */
  async updateTodoWriteLog(log: TodoWriteCall[]): Promise<void> {
    this.state.todoWriteLog = log;
    await this.saveState();
  }

  /**
   * Increment validation metrics
   */
  async recordValidation(
    type: 'swarm_init' | 'todowrite',
    result: 'pass' | 'warn' | 'block'
  ): Promise<void> {
    const metrics = this.state.metrics;

    if (type === 'swarm_init') {
      metrics.swarmInitValidations++;
      if (result === 'warn') metrics.swarmInitWarnings++;
      if (result === 'block') metrics.swarmInitBlocks++;
    } else {
      metrics.todoWriteValidations++;
      if (result === 'warn') metrics.todoWriteWarnings++;
      if (result === 'block') metrics.todoWriteBlocks++;
    }

    metrics.lastUpdated = new Date();
    await this.saveState();
  }

  /**
   * Load state from disk
   */
  private loadState(): ValidationState {
    try {
      const data = fs.readFileSync(this.statePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      // Initialize default state
      return {
        metrics: {
          swarmInitValidations: 0,
          swarmInitBlocks: 0,
          swarmInitWarnings: 0,
          todoWriteValidations: 0,
          todoWriteBlocks: 0,
          todoWriteWarnings: 0,
          lastUpdated: new Date()
        },
        config: this.getDefaultConfig()
      };
    }
  }

  /**
   * Save state to disk
   */
  private async saveState(): Promise<void> {
    const dir = path.dirname(this.statePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
  }

  /**
   * Get default validation config
   */
  private getDefaultConfig(): ValidationConfig {
    return {
      swarmInit: {
        enabled: true,
        mode: 'warn',
        minAgentsForSwarm: 2,
        trackStateInMemory: true,
        autoSuggestTopology: true
      },
      todoWrite: {
        enabled: true,
        mode: 'warn',
        minBatchSize: 5,
        timeWindowMs: 300000,
        maxCallsInWindow: 2,
        trackHistory: true
      }
    };
  }

  /**
   * Get validation metrics for reporting
   */
  async getMetrics(): Promise<ValidationMetrics> {
    return this.state.metrics;
  }

  /**
   * Clear validation state (useful for testing)
   */
  async clearState(): Promise<void> {
    this.state = {
      metrics: {
        swarmInitValidations: 0,
        swarmInitBlocks: 0,
        swarmInitWarnings: 0,
        todoWriteValidations: 0,
        todoWriteBlocks: 0,
        todoWriteWarnings: 0,
        lastUpdated: new Date()
      },
      config: this.getDefaultConfig()
    };
    await this.saveState();
  }
}
```

---

## Data Flow Diagrams

### Swarm Init Validation Flow

```
┌─────────────────────┐
│ User: swarm spawn   │
│ 3 agents            │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Pre-Command Hook                │
│ - Detect: agent spawn command   │
│ - Extract: agentCount = 3       │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ SwarmInitValidator              │
│ - Check: agentCount >= 2?       │
│   YES: Validation required      │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ ValidationStateManager          │
│ - Query: getCurrentSwarmState() │
└──────────┬──────────────────────┘
           │
           ▼
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐   ┌─────────────┐
│ Swarm  │   │ No Swarm    │
│ Exists │   │ Initialized │
└───┬────┘   └──────┬──────┘
    │               │
    │               ▼
    │        ┌──────────────────┐
    │        │ Generate Error   │
    │        │ - Code: SWARM_   │
    │        │   NOT_INITIALIZED│
    │        │ - Suggest fixes  │
    │        └──────┬───────────┘
    │               │
    │               ▼
    │        ┌──────────────────┐
    │        │ Mode Check       │
    │        ├──────────────────┤
    │        │ warn: Display +  │
    │        │       Continue   │
    │        │ block: Error +   │
    │        │        Exit 1    │
    │        └──────────────────┘
    │
    ▼
┌────────────────────┐
│ Validate Topology  │
│ - mesh for 2-7?    │
│ - hierarchical 8+? │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│ Return PASS        │
│ - Continue command │
│ - Record spawn     │
└────────────────────┘
```

### TodoWrite Batching Validation Flow

```
┌──────────────────────┐
│ User: TodoWrite(5)   │
│ items                │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Pre-Command Hook                │
│ - Detect: TodoWrite call        │
│ - Extract: itemCount = 5        │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ TodoWriteBatchValidator         │
│ - Record call                   │
│ - Clean old calls (>5min)       │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Check Batch Size                │
│ - itemCount >= minBatchSize?    │
│ - Current: 5 >= 5 ✅            │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Check Call Frequency            │
│ - callLog.length >= maxCalls?   │
│ - Current: 1 < 2 ✅             │
└──────────┬──────────────────────┘
           │
           ▼
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐   ┌──────────┐
│ PASS   │   │ WARNINGS │
└───┬────┘   └────┬─────┘
    │             │
    │             ▼
    │      ┌──────────────────┐
    │      │ Generate Warnings│
    │      │ - Small batch    │
    │      │ - Too many calls │
    │      └──────┬───────────┘
    │             │
    │             ▼
    │      ┌──────────────────┐
    │      │ Mode Check       │
    │      ├──────────────────┤
    │      │ warn: Display +  │
    │      │       Continue   │
    │      │ block: Error +   │
    │      │        Exit 1    │
    │      └──────────────────┘
    │
    ▼
┌────────────────────┐
│ Return Result      │
│ - Update state     │
│ - Continue command │
└────────────────────┘
```

---

## API Specifications

### Function Signatures

#### 1. Swarm Init Validation API

```typescript
// src/validators/swarm-init-validator.ts

/**
 * Validate swarm initialization before agent spawning
 * @param agentCount - Number of agents to spawn
 * @param options - Validation options
 * @returns ValidationResult with pass/fail status
 */
export async function validateSwarmInit(
  agentCount: number,
  options?: {
    source?: 'cli' | 'mcp' | 'api';
    skipValidation?: boolean;
  }
): Promise<ValidationResult>;

/**
 * Record swarm initialization
 * @param swarmId - Unique swarm identifier
 * @param topology - Swarm topology (mesh | hierarchical)
 * @param maxAgents - Maximum agents in swarm
 */
export async function recordSwarmInit(
  swarmId: string,
  topology: 'mesh' | 'hierarchical',
  maxAgents: number
): Promise<void>;

/**
 * Record agent spawn event
 * @param agentCount - Number of agents spawned
 */
export async function recordAgentSpawn(
  agentCount: number
): Promise<void>;

/**
 * Get current swarm state
 * @returns Current swarm state or null
 */
export async function getCurrentSwarmState(): Promise<SwarmState | null>;

/**
 * Clear swarm state (e.g., on swarm completion)
 */
export async function clearSwarmState(): Promise<void>;
```

#### 2. TodoWrite Batching Validation API

```typescript
// src/validators/todowrite-batch-validator.ts

/**
 * Validate TodoWrite batching pattern
 * @param itemCount - Number of todo items in batch
 * @param source - Source of the call
 * @returns ValidationResult with warnings/errors
 */
export async function validateTodoWriteBatch(
  itemCount: number,
  source?: string
): Promise<ValidationResult>;

/**
 * Get batching statistics
 * @returns Statistics about TodoWrite batching patterns
 */
export async function getBatchingStats(): Promise<{
  totalCalls: number;
  averageBatchSize: number;
  antiPatternDetections: number;
  complianceRate: number;
}>;

/**
 * Clear TodoWrite call log
 */
export async function clearTodoWriteLog(): Promise<void>;

/**
 * Get recent TodoWrite calls
 * @param limit - Maximum number of calls to return
 * @returns Recent TodoWrite calls
 */
export async function getRecentTodoWriteCalls(
  limit?: number
): Promise<TodoWriteCall[]>;
```

#### 3. Hook Integration Points

```typescript
// src/hooks/pre-command-validator.ts

/**
 * Pre-command validation hook
 * Intercepts commands and runs appropriate validators
 */
export async function preCommandValidator(
  command: string,
  args: string[],
  options: Record<string, any>
): Promise<{
  shouldProceed: boolean;
  validationResults: ValidationResult[];
  recommendations?: string[];
}>;

/**
 * Register validation hooks
 * Called during system initialization
 */
export function registerValidationHooks(): void;

/**
 * Unregister validation hooks
 * Called during system shutdown
 */
export function unregisterValidationHooks(): void;
```

### Configuration Interface

```typescript
// src/types/validation-config.ts

export interface ValidationConfig {
  // Global settings
  enabled: boolean;
  defaultMode: 'warn' | 'block' | 'disabled';

  // Swarm init validation
  swarmInit: {
    enabled: boolean;
    mode: 'warn' | 'block' | 'disabled';
    minAgentsForSwarm: number;
    trackStateInMemory: boolean;
    autoSuggestTopology: boolean;
  };

  // TodoWrite batching validation
  todoWrite: {
    enabled: boolean;
    mode: 'warn' | 'block' | 'disabled';
    minBatchSize: number;
    timeWindowMs: number;
    maxCallsInWindow: number;
    trackHistory: boolean;
  };

  // Metrics and reporting
  metrics: {
    enabled: boolean;
    trackCompliance: boolean;
    exportToSwarmMemory: boolean;
  };
}

/**
 * Load validation configuration
 * Reads from .claude-flow/validation-config.json
 * Falls back to defaults if not found
 */
export function loadValidationConfig(): ValidationConfig;

/**
 * Save validation configuration
 */
export function saveValidationConfig(config: ValidationConfig): Promise<void>;

/**
 * Get default validation configuration
 */
export function getDefaultValidationConfig(): ValidationConfig;
```

---

## File Structure

```
claude-flow-novice/
├── src/
│   ├── validators/                         # NEW: Validation module
│   │   ├── index.ts                        # Main exports
│   │   ├── swarm-init-validator.ts         # Swarm init validation
│   │   ├── todowrite-batch-validator.ts    # TodoWrite batching validation
│   │   ├── validation-state-manager.ts     # State management
│   │   └── __tests__/                      # Unit tests
│   │       ├── swarm-init-validator.test.ts
│   │       └── todowrite-batch-validator.test.ts
│   │
│   ├── types/
│   │   ├── validation.ts                   # NEW: Validation type definitions
│   │   └── validation-config.ts            # NEW: Config type definitions
│   │
│   ├── hooks/
│   │   ├── pre-command-validator.ts        # NEW: Pre-command hook integration
│   │   └── index.ts                        # Updated: Export new hooks
│   │
│   ├── cli/commands/
│   │   ├── swarm.ts                        # UPDATED: Add validation hooks
│   │   ├── agent.ts                        # UPDATED: Add validation hooks
│   │   └── validate.ts                     # NEW: Validation CLI commands
│   │
│   └── utils/
│       └── validation-formatter.ts         # NEW: Format validation messages
│
├── .claude-flow/
│   ├── validation-state.json               # NEW: Runtime validation state
│   └── validation-config.json              # NEW: User configuration
│
├── docs/
│   └── validation-guide.md                 # NEW: User documentation
│
└── test-results/
    └── validation-tests/                   # NEW: Validation test results
        ├── SI-05-automated.md
        └── TD-05-automated.md
```

### File Naming Conventions

- **Validators**: `{feature}-validator.ts`
- **Types**: `{feature}.ts` in `types/` directory
- **Tests**: `{feature}.test.ts` in `__tests__/` subdirectories
- **Hooks**: `{phase}-{feature}.ts` (e.g., `pre-command-validator.ts`)
- **Utils**: `{feature}-{utility}.ts` (e.g., `validation-formatter.ts`)

---

## Integration Strategy

### Phase 1: Non-Breaking Integration (Week 1)

**Goal**: Add validation without affecting existing workflows

```typescript
// CLI flag integration
npx claude-flow-novice swarm spawn --agents 3 --validate-swarm-init

// Default: warnings only, no blocking
// Config: .claude-flow/validation-config.json { mode: 'warn' }
```

**Integration Points**:
1. **Swarm Init Command** (`src/cli/commands/swarm.ts`)
   - Add `recordSwarmInit()` call after successful initialization
   - Store swarm state in ValidationStateManager

2. **Agent Spawn Command** (`src/cli/commands/agent.ts`)
   - Add pre-command hook to call `validateSwarmInit()`
   - Display warnings if validation fails (mode: 'warn')
   - Continue execution regardless of validation result

3. **TodoWrite Calls** (wherever TodoWrite is invoked)
   - Add pre-call hook to call `validateTodoWriteBatch()`
   - Display warnings for anti-patterns
   - Continue execution regardless of validation result

### Phase 2: Opt-In Blocking (Week 2)

**Goal**: Allow users to enable blocking mode

```typescript
// Enable blocking mode via config
{
  "swarmInit": {
    "enabled": true,
    "mode": "block"  // Changed from 'warn'
  }
}

// Or via CLI flag
npx claude-flow-novice swarm spawn --agents 3 --validate-swarm-init --block-on-fail
```

**Implementation**:
- Respect `mode` setting in validation config
- If `mode === 'block'`, throw error and exit with code 1
- Provide clear fix instructions in error message

### Phase 3: Default Validation (Week 3+)

**Goal**: Make validation default behavior (warnings)

```typescript
// Default config changes
{
  "swarmInit": {
    "enabled": true,
    "mode": "warn"  // Default on, warn mode
  },
  "todoWrite": {
    "enabled": true,
    "mode": "warn"
  }
}

// Users can disable via flag
npx claude-flow-novice swarm spawn --no-validate
```

### Hook Integration Example

```typescript
// src/cli/commands/swarm.ts (updated)

import { validateSwarmInit, recordSwarmInit } from '../../validators/swarm-init-validator.js';

export async function swarmSpawnAction(ctx: CommandContext) {
  const agentCount = parseInt(ctx.flags.agents as string) || 1;

  // PRE-COMMAND VALIDATION
  const validationResult = await validateSwarmInit(agentCount, {
    source: 'cli',
    skipValidation: ctx.flags.noValidate === true
  });

  if (!validationResult.valid) {
    if (validationResult.blocking) {
      // BLOCKING MODE: Error and exit
      console.error('❌ Validation Failed:');
      validationResult.errors.forEach(err => {
        console.error(`\n${err.message}`);
        if (err.fix) {
          console.error('\nFix:');
          console.error(err.fix.description);
          console.error('\nCommands:');
          err.fix.commands.forEach(cmd => console.error(`  ${cmd}`));
        }
      });
      process.exit(1);
    } else {
      // WARNING MODE: Display and continue
      console.warn('⚠️  Validation Warnings:');
      validationResult.warnings?.forEach(warn => {
        console.warn(`\n${warn.message}`);
        if (warn.recommendation) {
          console.warn(`Recommendation: ${warn.recommendation}`);
        }
      });
      console.warn('\nContinuing with command execution...\n');
    }
  }

  // PROCEED WITH COMMAND
  const result = await spawnAgents(agentCount, ctx.flags);

  // POST-COMMAND: Record spawn
  await recordAgentSpawn(agentCount);

  return result;
}

// src/cli/commands/swarm-init.ts (updated)

import { recordSwarmInit } from '../../validators/swarm-init-validator.js';

export async function swarmInitAction(ctx: CommandContext) {
  const topology = ctx.flags.topology as 'mesh' | 'hierarchical';
  const maxAgents = parseInt(ctx.flags.maxAgents as string);

  // Initialize swarm
  const swarmId = await initializeSwarm(topology, maxAgents);

  // RECORD SWARM INITIALIZATION
  await recordSwarmInit(swarmId, topology, maxAgents);

  console.log(`✅ Swarm initialized: ${swarmId}`);
  return { swarmId, topology, maxAgents };
}
```

---

## Configuration Options

### Default Configuration

```json
{
  "enabled": true,
  "defaultMode": "warn",

  "swarmInit": {
    "enabled": true,
    "mode": "warn",
    "minAgentsForSwarm": 2,
    "trackStateInMemory": true,
    "autoSuggestTopology": true
  },

  "todoWrite": {
    "enabled": true,
    "mode": "warn",
    "minBatchSize": 5,
    "timeWindowMs": 300000,
    "maxCallsInWindow": 2,
    "trackHistory": true
  },

  "metrics": {
    "enabled": true,
    "trackCompliance": true,
    "exportToSwarmMemory": true
  }
}
```

### CLI Flags

```bash
# Swarm init validation
--validate-swarm-init          # Enable swarm init validation
--no-validate-swarm-init       # Disable swarm init validation
--block-on-swarm-fail          # Block execution if validation fails

# TodoWrite batching validation
--validate-batching            # Enable batching validation
--no-validate-batching         # Disable batching validation
--min-batch-size <n>           # Override minimum batch size

# Global validation flags
--validate                     # Enable all validations
--no-validate                  # Disable all validations
--validation-mode <mode>       # Set mode: warn | block | disabled
```

### Environment Variables

```bash
# Override validation settings
CLAUDE_FLOW_VALIDATE=true                    # Enable validation
CLAUDE_FLOW_VALIDATION_MODE=block            # Set default mode
CLAUDE_FLOW_SWARM_INIT_VALIDATION=true       # Enable swarm init validation
CLAUDE_FLOW_TODOWRITE_VALIDATION=true        # Enable TodoWrite validation
```

---

## Error Handling

### Error Message Format

```typescript
interface ValidationErrorMessage {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  context: {
    file?: string;
    line?: number;
    command?: string;
  };
  fix?: {
    description: string;
    commands: string[];
    documentation?: string;
  };
}
```

### Example Error Messages

#### Swarm Init Error (Blocking Mode)

```
❌ Validation Failed: Swarm initialization required

Error Code: SWARM_NOT_INITIALIZED
Message: Attempting to spawn 3 agents without initialized swarm

Context:
  Command: swarm spawn --agents 3
  Agent Count: 3
  Current Swarm: None

Fix:
  Initialize swarm before spawning agents

  Option 1 - CLI:
    npx claude-flow-novice swarm init --topology mesh --max-agents 3

  Option 2 - MCP:
    mcp__claude-flow-novice__swarm_init({
      topology: "mesh",
      maxAgents: 3,
      strategy: "balanced"
    })

  Documentation: See CLAUDE.md section "Swarm Initialization (MANDATORY)"

Exit code: 1
```

#### TodoWrite Warning (Warning Mode)

```
⚠️  Validation Warning: TodoWrite batching anti-pattern detected

Warning Code: INCREMENTAL_TODO_ANTI_PATTERN
Message: 3 TodoWrite calls detected in 5 minutes (threshold: 2)

Recent Calls:
  1. 3 items at 2025-09-30T10:00:00Z
  2. 2 items at 2025-09-30T10:02:30Z
  3. 5 items at 2025-09-30T10:04:15Z

Recommendation:
  Batch ALL todos in SINGLE TodoWrite call with 5-10+ items.

  Anti-pattern: Multiple small TodoWrite calls
  Best practice: Plan all tasks upfront, create comprehensive todo list

  See CLAUDE.md: "TodoWrite batching requirement"

Continuing with execution...
```

### Structured JSON Output (for agents)

```json
{
  "validation": {
    "success": false,
    "blocking": true,
    "errors": [
      {
        "code": "SWARM_NOT_INITIALIZED",
        "field": "swarm_initialization",
        "severity": "critical",
        "message": "Swarm initialization required for 3 agents",
        "fix": {
          "description": "Initialize swarm before spawning agents",
          "commands": [
            "npx claude-flow-novice swarm init --topology mesh --max-agents 3"
          ],
          "documentation": "See CLAUDE.md section: Swarm Initialization (MANDATORY)"
        }
      }
    ],
    "warnings": [],
    "metadata": {
      "suggestedTopology": "mesh",
      "detectedAgentCount": 3,
      "timestamp": "2025-09-30T10:00:00Z"
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

**Location**: `src/validators/__tests__/`

#### Swarm Init Validator Tests

```typescript
// src/validators/__tests__/swarm-init-validator.test.ts

describe('SwarmInitValidator', () => {
  describe('validateSwarmInit', () => {
    it('should pass validation when swarm initialized', async () => {
      const validator = new SwarmInitValidator(config);
      await validator.recordSwarmInit('swarm-1', 'mesh', 5);

      const result = await validator.validateSwarmInit({
        agentCount: 3,
        commandTimestamp: new Date()
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when swarm not initialized', async () => {
      const validator = new SwarmInitValidator(config);

      const result = await validator.validateSwarmInit({
        agentCount: 3,
        commandTimestamp: new Date()
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('SWARM_NOT_INITIALIZED');
    });

    it('should suggest mesh topology for 2-7 agents', async () => {
      const validator = new SwarmInitValidator(config);

      const result = await validator.validateSwarmInit({
        agentCount: 5,
        commandTimestamp: new Date()
      });

      expect(result.metadata.suggestedTopology).toBe('mesh');
    });

    it('should suggest hierarchical topology for 8+ agents', async () => {
      const validator = new SwarmInitValidator(config);

      const result = await validator.validateSwarmInit({
        agentCount: 10,
        commandTimestamp: new Date()
      });

      expect(result.metadata.suggestedTopology).toBe('hierarchical');
    });

    it('should skip validation for single agent', async () => {
      const validator = new SwarmInitValidator(config);

      const result = await validator.validateSwarmInit({
        agentCount: 1,
        commandTimestamp: new Date()
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('topology validation', () => {
    it('should warn when using mesh for 8+ agents', async () => {
      const validator = new SwarmInitValidator(config);
      await validator.recordSwarmInit('swarm-1', 'mesh', 10);

      const result = await validator.validateSwarmInit({
        agentCount: 10,
        commandTimestamp: new Date()
      });

      expect(result.errors.some(e => e.code === 'TOPOLOGY_MISMATCH')).toBe(true);
    });

    it('should pass when using hierarchical for 8+ agents', async () => {
      const validator = new SwarmInitValidator(config);
      await validator.recordSwarmInit('swarm-1', 'hierarchical', 10);

      const result = await validator.validateSwarmInit({
        agentCount: 10,
        commandTimestamp: new Date()
      });

      expect(result.valid).toBe(true);
    });
  });
});
```

#### TodoWrite Batch Validator Tests

```typescript
// src/validators/__tests__/todowrite-batch-validator.test.ts

describe('TodoWriteBatchValidator', () => {
  describe('validateBatchingPattern', () => {
    it('should pass validation for batch size >= 5', async () => {
      const validator = new TodoWriteBatchValidator(config);

      const result = await validator.validateBatchingPattern(5, 'test');

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn for small batch size', async () => {
      const validator = new TodoWriteBatchValidator(config);

      const result = await validator.validateBatchingPattern(2, 'test');

      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('SMALL_BATCH_SIZE');
    });

    it('should detect incremental todo anti-pattern', async () => {
      const validator = new TodoWriteBatchValidator(config);

      // Make multiple small calls
      await validator.validateBatchingPattern(2, 'test-1');
      await validator.validateBatchingPattern(3, 'test-2');
      const result = await validator.validateBatchingPattern(2, 'test-3');

      expect(result.warnings.some(w =>
        w.code === 'INCREMENTAL_TODO_ANTI_PATTERN'
      )).toBe(true);
    });

    it('should clean old calls outside time window', async () => {
      const validator = new TodoWriteBatchValidator({
        ...config,
        timeWindowMs: 1000 // 1 second for testing
      });

      await validator.validateBatchingPattern(5, 'test-1');

      // Wait for time window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await validator.validateBatchingPattern(5, 'test-2');

      expect(result.valid).toBe(true);
    });
  });

  describe('batching statistics', () => {
    it('should calculate accurate statistics', async () => {
      const validator = new TodoWriteBatchValidator(config);

      await validator.validateBatchingPattern(10, 'test-1');
      await validator.validateBatchingPattern(8, 'test-2');
      await validator.validateBatchingPattern(2, 'test-3');

      const stats = await validator.getBatchingStats();

      expect(stats.totalCalls).toBe(3);
      expect(stats.averageBatchSize).toBeCloseTo(6.67, 1);
      expect(stats.antiPatternDetections).toBe(1); // Only test-3 is below threshold
      expect(stats.complianceRate).toBeCloseTo(66.67, 1);
    });
  });
});
```

### Integration Tests

**Location**: `src/validators/__tests__/integration/`

```typescript
// src/validators/__tests__/integration/validation-flow.test.ts

describe('Validation Integration', () => {
  it('should integrate with CLI swarm spawn command', async () => {
    // Test full flow: CLI → Validation → Error/Warning
    const result = await executeCommand('swarm spawn --agents 3 --validate-swarm-init');

    expect(result.exitCode).toBe(1); // Blocked
    expect(result.stderr).toContain('SWARM_NOT_INITIALIZED');
  });

  it('should allow execution after swarm init', async () => {
    await executeCommand('swarm init --topology mesh --max-agents 3');
    const result = await executeCommand('swarm spawn --agents 3 --validate-swarm-init');

    expect(result.exitCode).toBe(0); // Success
  });
});
```

### Test Coverage Requirements

- **Unit Tests**: ≥90% coverage for validator logic
- **Integration Tests**: Cover all CLI integration points
- **E2E Tests**: Real-world scenarios from test strategy (SI-05, TD-05)

---

## Implementation Guidelines

### Technology Stack

- **Language**: TypeScript (strict mode)
- **Testing**: Jest for unit/integration tests
- **Validation**: Zod for runtime type validation
- **Logging**: Existing Logger class (enhanced)
- **State Management**: JSON file-based persistence
- **Memory Integration**: SwarmMemoryManager

### Code Quality Standards

```typescript
// ESLint configuration additions
{
  "rules": {
    "@typescript-strict/no-any": "error",
    "@typescript-strict/strict-boolean-expressions": "error",
    "no-console": ["warn", { "allow": ["error", "warn"] }]
  }
}
```

### Implementation Phases

#### Phase 1: Core Validators (2 days)
- Implement `SwarmInitValidator`
- Implement `TodoWriteBatchValidator`
- Implement `ValidationStateManager`
- Write unit tests

#### Phase 2: Hook Integration (1 day)
- Create pre-command hook infrastructure
- Integrate with swarm commands
- Integrate with TodoWrite calls
- Write integration tests

#### Phase 3: CLI Integration (1 day)
- Add CLI flags
- Add validation commands
- Update help documentation
- Write E2E tests

#### Phase 4: Testing & Validation (0.5 days)
- Re-run SI-05 test scenario
- Re-run TD-05 test scenario
- Update test results documentation
- Collect metrics

### Performance Considerations

1. **State File I/O**: Minimize file reads/writes
   - Cache state in memory
   - Batch writes (debounce 1 second)
   - Use async I/O (non-blocking)

2. **Validation Speed**: Target <100ms for validation checks
   - In-memory state lookups
   - Avoid network calls
   - Lazy load configuration

3. **Memory Footprint**: Keep TodoWrite call log bounded
   - Maximum 100 entries
   - Auto-prune entries older than time window
   - Use circular buffer for efficiency

### Backward Compatibility

#### Migration Strategy

```typescript
// Automatic state migration
export class StateMigration {
  async migrateIfNeeded(statePath: string): Promise<void> {
    const state = await this.loadState(statePath);

    if (!state.version) {
      // Migrate from no-version to v1
      state.version = '1.0';
      state.swarmInit = { /* defaults */ };
      state.todoWrite = { /* defaults */ };
      await this.saveState(statePath, state);
    }
  }
}
```

#### Feature Flags

```json
{
  "features": {
    "swarmInitValidation": {
      "enabled": true,
      "rolloutPercentage": 100
    },
    "todoWriteValidation": {
      "enabled": true,
      "rolloutPercentage": 100
    }
  }
}
```

---

## Performance Metrics

### Target Performance

| Operation | Target | Acceptable | Maximum |
|-----------|--------|------------|---------|
| Swarm init validation | <50ms | <100ms | <200ms |
| TodoWrite validation | <30ms | <50ms | <100ms |
| State file read | <10ms | <20ms | <50ms |
| State file write | <20ms | <50ms | <100ms |

### Monitoring Points

```typescript
interface ValidationMetrics {
  swarmInit: {
    avgValidationTimeMs: number;
    validationsPerSecond: number;
    cacheHitRate: number;
  };
  todoWrite: {
    avgValidationTimeMs: number;
    validationsPerSecond: number;
    antiPatternRate: number;
  };
}
```

---

## Next Steps

### Immediate Actions (Today)

1. **Create file structure**
   ```bash
   mkdir -p src/validators/__tests__
   mkdir -p src/types
   touch src/validators/swarm-init-validator.ts
   touch src/validators/todowrite-batch-validator.ts
   touch src/validators/validation-state-manager.ts
   ```

2. **Initialize type definitions**
   ```bash
   touch src/types/validation.ts
   touch src/types/validation-config.ts
   ```

3. **Set up testing infrastructure**
   ```bash
   mkdir -p src/validators/__tests__/integration
   touch src/validators/__tests__/swarm-init-validator.test.ts
   touch src/validators/__tests__/todowrite-batch-validator.test.ts
   ```

### Implementation Timeline

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| **Day 1** | Implement core validators, state manager | 3 TypeScript files, unit tests |
| **Day 2** | Hook integration, CLI flags | Pre-command hooks, CLI updates |
| **Day 3** | Testing, validation, documentation | E2E tests, updated docs |
| **Day 4** | Polish, metrics, monitoring | Metrics dashboard, final testing |

### Success Criteria

- ✅ SI-05 test upgraded from PARTIAL PASS to PASS
- ✅ TD-05 test upgraded from PARTIAL PASS to PASS
- ✅ All unit tests passing (≥90% coverage)
- ✅ Integration tests passing
- ✅ Documentation complete
- ✅ No breaking changes to existing functionality

---

## Appendix

### A. Type Definitions Reference

```typescript
// Complete type definitions in src/types/validation.ts

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  blocking?: boolean;
  metadata?: Record<string, any>;
  validatedAt?: Date;
  validator?: string;
}

export interface ValidationError {
  field: string;
  code: string;
  severity: 'error' | 'critical';
  message: string;
  fix?: {
    description: string;
    commands: string[];
    documentation?: string;
  };
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  recommendation: string;
}

export interface SwarmState {
  id: string;
  initialized: boolean;
  topology: 'mesh' | 'hierarchical';
  maxAgents: number;
  agentsSpawned: number;
  createdAt: Date;
  status: 'active' | 'completed' | 'failed';
}

export interface TodoWriteCall {
  timestamp: Date;
  itemCount: number;
  callStack?: string;
  source: string;
}
```

### B. CLI Command Examples

```bash
# Swarm init validation
npx claude-flow-novice swarm init --topology mesh --max-agents 5
npx claude-flow-novice swarm spawn --agents 3 --validate-swarm-init
npx claude-flow-novice swarm spawn --agents 3 --no-validate

# TodoWrite validation
npx claude-flow-novice validate todowrite --show-stats
npx claude-flow-novice validate todowrite --clear-log

# Configuration
npx claude-flow-novice validate config --set swarmInit.mode=block
npx claude-flow-novice validate config --show

# Metrics
npx claude-flow-novice validate metrics
npx claude-flow-novice validate metrics --export metrics.json
```

### C. Error Code Reference

| Code | Severity | Description |
|------|----------|-------------|
| `SWARM_NOT_INITIALIZED` | Critical | No swarm initialized before agent spawn |
| `AGENT_COUNT_EXCEEDED` | Error | Agent count exceeds swarm maxAgents |
| `TOPOLOGY_MISMATCH` | Error | Topology inappropriate for agent count |
| `SMALL_BATCH_SIZE` | Warning | TodoWrite batch below minimum size |
| `INCREMENTAL_TODO_ANTI_PATTERN` | Warning | Multiple TodoWrite calls detected |

---

## Document Metadata

**Architecture Review Status**: ✅ Ready for Implementation
**Estimated Implementation Time**: 7-8 hours (2 features)
**Technical Risk**: LOW
**Integration Risk**: LOW
**Breaking Changes**: NONE

**Reviewed By**: System Architect Agent
**Approval Date**: 2025-09-30
**Target Completion**: Week of 2025-10-07

---

**End of Architecture Document**
