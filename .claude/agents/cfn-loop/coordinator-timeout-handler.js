/**
 * Coordinator Timeout Handler for CFN Loop orchestration
 * 
 * Provides timeout management and escalation handling for CFN coordinators:
 * - Phase timeout management
 * - Worker timeout escalation
 * - Consensus timeout handling
 * - Board approval timeout handling (Enterprise)
 * - Automatic retry logic with exponential backoff
 */

import { BlockingCoordinationSignals } from './blocking-coordination-signals.js';

export class CoordinatorTimeoutHandler {
  constructor(coordinatorId, signals = null) {
    this.coordinatorId = coordinatorId;
    this.signals = signals;
    this.activeTimeouts = new Map();
    this.retryCounters = new Map();
    this.escalationQueue = [];
    
    // Mode-specific timeout configurations
    this.timeouts = {
      mvp: {
        phaseStart: 30000,      // 30s for workers to acknowledge phase start
        phaseComplete: 900000,  // 15m for phase completion
        consensus: 300000,      // 5m for validator consensus
        boardApproval: 0,       // N/A for MVP
        maxRetries: 2,
        backoffMultiplier: 1.5
      },
      standard: {
        phaseStart: 60000,      // 1m for workers to acknowledge phase start
        phaseComplete: 1800000, // 30m for phase completion
        consensus: 600000,      // 10m for validator consensus
        boardApproval: 0,       // N/A for Standard
        maxRetries: 3,
        backoffMultiplier: 2.0
      },
      enterprise: {
        phaseStart: 120000,     // 2m for workers to acknowledge phase start
        phaseComplete: 3600000, // 60m for phase completion
        consensus: 900000,      // 15m for validator consensus
        boardApproval: 600000,  // 10m for board approval
        maxRetries: 5,
        backoffMultiplier: 2.5
      }
    };
  }

  /**
   * Set timeout for operation with automatic escalation
   */
  setTimeout(operationId, timeoutMs, escalationData, mode = 'standard') {
    // Clear existing timeout for this operation
    this.clearTimeout(operationId);

    const timeoutHandle = setTimeout(async () => {
      await this.handleTimeout(operationId, timeoutMs, escalationData, mode);
    }, timeoutMs);

    this.activeTimeouts.set(operationId, {
      handle: timeoutHandle,
      startTime: Date.now(),
      timeoutMs,
      escalationData,
      mode
    });

    console.log(`⏱️  Set timeout for ${operationId}: ${timeoutMs}ms (${mode})`);
  }

  /**
   * Handle timeout with escalation logic
   */
  async handleTimeout(operationId, timeoutMs, escalationData, mode) {
    console.log(`⏰ Operation ${operationId} timed out after ${timeoutMs}ms`);

    const retryCount = this.retryCounters.get(operationId) || 0;
    const maxRetries = this.timeouts[mode].maxRetries;

    // Check if we should retry
    if (retryCount < maxRetries) {
      await this.retryOperation(operationId, escalationData, mode, retryCount);
    } else {
      await this.escalateOperation(operationId, escalationData, mode, retryCount);
    }

    // Remove from active timeouts
    this.activeTimeouts.delete(operationId);
  }

  /**
   * Retry operation with exponential backoff
   */
  async retryOperation(operationId, escalationData, mode, retryCount) {
    const backoffMultiplier = this.timeouts[mode].backoffMultiplier;
    const baseTimeout = this.timeouts[mode][escalationData.type] || 300000;
    const newTimeout = Math.floor(baseTimeout * Math.pow(backoffMultiplier, retryCount));

    console.log(`🔄 Retrying operation ${operationId} (attempt ${retryCount + 1}/${this.timeouts[mode].maxRetries})`);
    console.log(`📅 New timeout: ${newTimeout}ms (${newTimeout / 1000 / 60}min)`);

    // Increment retry counter
    this.retryCounters.set(operationId, retryCount + 1);

    // Send retry signal if signals are available
    if (this.signals && escalationData.targetAgents) {
      await this.signals.sendSignal('RETRY', escalationData.targetAgents, {
        operationId,
        retryCount: retryCount + 1,
        maxRetries: this.timeouts[mode].maxRetries,
        newTimeout,
        reason: `Timeout retry ${retryCount + 1}/${this.timeouts[mode].maxRetries}`
      }, mode);
    }

    // Set new timeout
    this.setTimeout(operationId, newTimeout, escalationData, mode);
  }

  /**
   * Escalate operation after max retries
   */
  async escalateOperation(operationId, escalationData, mode, retryCount) {
    console.log(`🚨 Escalating operation ${operationId} after ${retryCount} retries`);

    const escalationInfo = {
      operationId,
      escalationData,
      mode,
      retryCount,
      timestamp: Date.now(),
      coordinatorId: this.coordinatorId
    };

    // Add to escalation queue
    this.escalationQueue.push(escalationInfo);

    // Send escalation signal if signals are available
    if (this.signals) {
      await this.signals.sendEscalationSignal(this.coordinatorId, escalationInfo);
    }

    // Log escalation details
    console.log(`📋 Escalation details:`, {
      operationId,
      type: escalationData.type,
      targetAgents: escalationData.targetAgents,
      mode,
      retryCount,
      totalDuration: Date.now() - (this.activeTimeouts.get(operationId)?.startTime || Date.now())
    });

    // Clean up retry counter
    this.retryCounters.delete(operationId);
  }

  /**
   * Clear timeout for operation
   */
  clearTimeout(operationId) {
    if (this.activeTimeouts.has(operationId)) {
      const timeoutInfo = this.activeTimeouts.get(operationId);
      clearTimeout(timeoutInfo.handle);
      this.activeTimeouts.delete(operationId);
      
      // Also clear retry counter
      this.retryCounters.delete(operationId);
      
      console.log(`✅ Cleared timeout for ${operationId}`);
    }
  }

  /**
   * Clear all active timeouts
   */
  clearTimeouts() {
    for (const [operationId, timeoutInfo] of this.activeTimeouts) {
      clearTimeout(timeoutInfo.handle);
    }
    this.activeTimeouts.clear();
    this.retryCounters.clear();
    console.log('🧹 Cleared all active timeouts and retry counters');
  }

  /**
   * Get timeout status for all operations
   */
  getTimeoutStatus() {
    const status = {
      activeTimeouts: {},
      retryCounters: {},
      pendingEscalations: this.escalationQueue.length,
      totalActive: this.activeTimeouts.size
    };

    // Active timeouts with remaining time
    for (const [operationId, timeoutInfo] of this.activeTimeouts) {
      const elapsed = Date.now() - timeoutInfo.startTime;
      const remaining = Math.max(0, timeoutInfo.timeoutMs - elapsed);
      
      status.activeTimeouts[operationId] = {
        type: timeoutInfo.escalationData.type,
        mode: timeoutInfo.mode,
        elapsed,
        remaining,
        progress: (elapsed / timeoutInfo.timeoutMs) * 100
      };
    }

    // Retry counters
    for (const [operationId, count] of this.retryCounters) {
      status.retryCounters[operationId] = count;
    }

    return status;
  }

  /**
   * Set phase timeout (convenience method)
   */
  setPhaseTimeout(phaseId, workerIds, mode = 'standard') {
    const timeoutMs = this.timeouts[mode].phaseComplete;
    
    this.setTimeout(`phase-${phaseId}`, timeoutMs, {
      type: 'phaseComplete',
      phaseId,
      targetAgents: workerIds,
      description: `Phase ${phaseId} completion`
    }, mode);
  }

  /**
   * Set consensus timeout (convenience method)
   */
  setConsensusTimeout(phaseId, validatorIds, mode = 'standard') {
    const timeoutMs = this.timeouts[mode].consensus;
    
    this.setTimeout(`consensus-${phaseId}`, timeoutMs, {
      type: 'consensus',
      phaseId,
      targetAgents: validatorIds,
      description: `Consensus for phase ${phaseId}`
    }, mode);
  }

  /**
   * Set board approval timeout (Enterprise mode only)
   */
  setBoardApprovalTimeout(phaseId, boardMemberIds) {
    const timeoutMs = this.timeouts.enterprise.boardApproval;
    
    this.setTimeout(`board-approval-${phaseId}`, timeoutMs, {
      type: 'boardApproval',
      phaseId,
      targetAgents: boardMemberIds,
      description: `Board approval for phase ${phaseId}`
    }, 'enterprise');
  }

  /**
   * Process escalation queue
   */
  async processEscalationQueue() {
    if (this.escalationQueue.length === 0) {
      return;
    }

    console.log(`📋 Processing ${this.escalationQueue.length} pending escalations`);

    const processedEscalations = [];
    
    for (const escalation of this.escalationQueue) {
      try {
        await this.handleEscalation(escalation);
        processedEscalations.push(escalation);
      } catch (error) {
        console.error(`❌ Failed to process escalation ${escalation.operationId}:`, error.message);
      }
    }

    // Remove processed escalations from queue
    this.escalationQueue = this.escalationQueue.filter(
      escalation => !processedEscalations.includes(escalation)
    );
  }

  /**
   * Handle individual escalation
   */
  async handleEscalation(escalation) {
    const { operationId, escalationData, mode, retryCount } = escalation;
    
    console.log(`🔧 Handling escalation for ${operationId} (${escalationData.type})`);

    // Different escalation strategies based on type
    switch (escalationData.type) {
      case 'phaseComplete':
        await this.handlePhaseTimeoutEscalation(escalation);
        break;
      
      case 'consensus':
        await this.handleConsensusTimeoutEscalation(escalation);
        break;
      
      case 'boardApproval':
        await this.handleBoardApprovalTimeoutEscalation(escalation);
        break;
      
      default:
        console.log(`⚠️  Unknown escalation type: ${escalationData.type}`);
    }
  }

  /**
   * Handle phase timeout escalation
   */
  async handlePhaseTimeoutEscalation(escalation) {
    const { escalationData, mode } = escalation;
    
    console.log(`🏗️  Phase timeout escalation: ${escalationData.phaseId}`);
    
    // Strategy: Reduce scope or extend timeline based on mode
    if (mode === 'mvp') {
      console.log(`🚀 MVP mode: Reducing scope for phase ${escalationData.phaseId}`);
      // Implement scope reduction logic
    } else if (mode === 'standard') {
      console.log(`⚖️  Standard mode: Extending timeline for phase ${escalationData.phaseId}`);
      // Implement timeline extension logic
    } else if (mode === 'enterprise') {
      console.log(`🏢 Enterprise mode: Executive escalation for phase ${escalationData.phaseId}`);
      // Implement executive escalation logic
    }
  }

  /**
   * Handle consensus timeout escalation
   */
  async handleConsensusTimeoutEscalation(escalation) {
    const { escalationData, mode } = escalation;
    
    console.log(`🤝 Consensus timeout escalation: ${escalationData.phaseId}`);
    
    // Strategy: Lower consensus threshold or add more validators
    if (mode === 'mvp') {
      console.log(`🚀 MVP mode: Proceeding with partial consensus for phase ${escalationData.phaseId}`);
    } else if (mode === 'standard') {
      console.log(`⚖️  Standard mode: Adding additional validators for phase ${escalationData.phaseId}`);
    } else if (mode === 'enterprise') {
      console.log(`🏢 Enterprise mode: Executive override for phase ${escalationData.phaseId}`);
    }
  }

  /**
   * Handle board approval timeout escalation
   */
  async handleBoardApprovalTimeoutEscalation(escalation) {
    const { escalationData } = escalation;
    
    console.log(`🏢 Board approval timeout escalation: ${escalationData.phaseId}`);
    
    // Strategy: Executive override or project hold
    console.log(`🚨 Enterprise mode: Executive intervention required for phase ${escalationData.phaseId}`);
    // Implement executive override logic
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.clearTimeouts();
    this.escalationQueue = [];
    console.log('🧹 Coordinator timeout handler cleaned up');
  }
}

export default CoordinatorTimeoutHandler;