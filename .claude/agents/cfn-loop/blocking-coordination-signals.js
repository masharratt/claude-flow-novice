/**
 * Blocking Coordination Signals for CFN Coordinators
 * 
 * Provides coordination primitives for CFN Loop 1 orchestration:
 * - Phase start/stop signaling
 * - Worker synchronization with timeout handling
 * - Consensus coordination for Loop 2 validation
 * - Board approval coordination for Enterprise mode
 * - HMAC-based authentication for secure signaling
 */

import crypto from 'crypto';
import { createClient } from 'redis';

export class BlockingCoordinationSignals {
  constructor(coordinatorId, hmacSecret, redisUrl = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.coordinatorId = coordinatorId;
    this.hmacSecret = hmacSecret;
    this.redisClient = null;
    this.redisAvailable = false;
    this.redisUrl = redisUrl;
    
    // Signal timeouts (configurable per mode)
    this.timeouts = {
      mvp: {
        phaseStart: 30000,      // 30s for workers to acknowledge phase start
        phaseComplete: 900000,  // 15m for phase completion
        consensus: 300000,      // 5m for validator consensus
        boardApproval: 0        // N/A for MVP
      },
      standard: {
        phaseStart: 60000,      // 1m for workers to acknowledge phase start
        phaseComplete: 1800000, // 30m for phase completion
        consensus: 600000,      // 10m for validator consensus
        boardApproval: 0        // N/A for Standard
      },
      enterprise: {
        phaseStart: 120000,     // 2m for workers to acknowledge phase start
        phaseComplete: 3600000, // 60m for phase completion
        consensus: 900000,      // 15m for validator consensus
        boardApproval: 600000   // 10m for board approval
      }
    };
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      this.redisClient = createClient({ url: this.redisUrl });
      
      this.redisClient.on('error', (err) => {
        console.log('⚠️  Redis unavailable for coordination signals:', err.message);
        this.redisAvailable = false;
      });

      await this.redisClient.connect();
      this.redisAvailable = true;
      console.log('✅ Redis coordination signals initialized');
      
    } catch (error) {
      console.log('⚠️  Redis coordination signals unavailable:', error.message);
      this.redisAvailable = false;
    }
  }

  /**
   * Generate HMAC signature for signal authentication
   */
  generateHmac(payload) {
    return crypto.createHmac('sha256', this.hmacSecret)
                  .update(JSON.stringify(payload))
                  .digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHmac(payload, signature) {
    const expectedSignature = this.generateHmac(payload);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  /**
   * Send signal to specific agent or broadcast to channel
   */
  async sendSignal(signalType, targetAgentId, payload = {}, mode = 'standard') {
    if (!this.redisAvailable) {
      console.log(`⚠️  Redis unavailable, skipping signal: ${signalType} to ${targetAgentId}`);
      return false;
    }

    try {
      const signal = {
        type: signalType,
        from: this.coordinatorId,
        to: targetAgentId,
        timestamp: Date.now(),
        mode,
        payload,
        signature: this.generateHmac({ signalType, targetAgentId, payload, mode, timestamp: Date.now() })
      };

      // Send to specific agent channel
      const channel = `cfn:signal:${targetAgentId}`;
      await this.redisClient.publish(channel, JSON.stringify(signal));

      // Also broadcast to coordinator channel for monitoring
      const coordinatorChannel = `cfn:coordinator:${this.coordinatorId}:signals`;
      await this.redisClient.publish(coordinatorChannel, JSON.stringify({
        ...signal,
        broadcast: true
      }));

      console.log(`📡 Sent signal: ${signalType} → ${targetAgentId} (${mode})`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to send signal ${signalType} to ${targetAgentId}:`, error.message);
      return false;
    }
  }

  /**
   * Wait for acknowledgments from multiple agents
   */
  async waitForAcks(signalKeys, timeoutMs = 300000) {
    if (!this.redisAvailable) {
      console.log('⚠️  Redis unavailable, returning empty ack results');
      return { acknowledged: [], timedOut: signalKeys, errors: [] };
    }

    const results = {
      acknowledged: [],
      timedOut: [],
      errors: []
    };

    const startTime = Date.now();
    const pendingAcks = new Set(signalKeys);

    console.log(`⏳ Waiting for ${signalKeys.length} acknowledgments (timeout: ${timeoutMs}ms)`);

    // Subscribe to acknowledgment channels
    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();

    try {
      // Set up subscription for each acknowledgment channel
      for (const signalKey of signalKeys) {
        const ackChannel = `cfn:ack:${signalKey}`;
        
        subscriber.subscribe(ackChannel, (message) => {
          try {
            const ack = JSON.parse(message);
            
            // Verify HMAC signature
            if (this.verifyHmac(ack.payload, ack.signature)) {
              results.acknowledged.push({
                signalKey,
                agentId: ack.from,
                timestamp: ack.timestamp,
                payload: ack.payload
              });
              
              pendingAcks.delete(signalKey);
              console.log(`✅ Received ack: ${signalKey} from ${ack.from}`);
            } else {
              results.errors.push({
                signalKey,
                error: 'Invalid HMAC signature'
              });
              pendingAcks.delete(signalKey);
            }
          } catch (error) {
            results.errors.push({
              signalKey,
              error: `Failed to parse ack: ${error.message}`
            });
            pendingAcks.delete(signalKey);
          }
        });
      }

      // Wait for all acknowledgments or timeout
      while (pendingAcks.size > 0 && (Date.now() - startTime) < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Mark remaining as timed out
      if (pendingAcks.size > 0) {
        results.timedOut = Array.from(pendingAcks);
        console.log(`⏰ Timeout: ${results.timedOut.length} acknowledgments not received`);
      }

    } finally {
      await subscriber.quit();
    }

    console.log(`📊 Ack results: ${results.acknowledged.length} received, ${results.timedOut.length} timed out, ${results.errors.length} errors`);
    return results;
  }

  /**
   * Send phase start signal to all workers
   */
  async sendPhaseStart(workerIds, phaseConfig) {
    const { mode, phaseId, gateThreshold, consensusThreshold, validators, boardMembers } = phaseConfig;
    
    console.log(`🚀 Starting phase ${phaseId} with ${workerIds.length} workers (${mode} mode)`);

    const promises = workerIds.map(workerId => 
      this.sendSignal('PHASE_START', workerId, {
        phaseId,
        gateThreshold,
        consensusThreshold,
        validators,
        boardMembers,
        mode,
        timeout: this.timeouts[mode].phaseComplete
      }, mode)
    );

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    console.log(`📡 Phase start signals sent: ${successful}/${workerIds.length}`);
    return successful;
  }

  /**
   * Wait for phase completion from workers
   */
  async waitForPhaseCompletion(workerIds, phaseId, mode = 'standard') {
    const signalKeys = workerIds.map(workerId => `phase-complete-${phaseId}-${workerId}`);
    const timeout = this.timeouts[mode].phaseComplete;
    
    return await this.waitForAcks(signalKeys, timeout);
  }

  /**
   * Send consensus request to validators
   */
  async sendConsensusRequest(validatorIds, phaseData, mode = 'standard') {
    console.log(`🤝 Requesting consensus from ${validatorIds.length} validators (${mode} mode)`);

    const promises = validatorIds.map(validatorId => 
      this.sendSignal('CONSENSUS_REQUEST', validatorId, {
        phaseData,
        consensusThreshold: mode === 'enterprise' ? 0.95 : (mode === 'standard' ? 0.90 : 0.80),
        mode
      }, mode)
    );

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    console.log(`📡 Consensus requests sent: ${successful}/${validatorIds.length}`);
    return successful;
  }

  /**
   * Wait for validator consensus
   */
  async waitForConsensus(validatorIds, phaseId, mode = 'standard') {
    const signalKeys = validatorIds.map(validatorId => `consensus-${phaseId}-${validatorId}`);
    const timeout = this.timeouts[mode].consensus;
    
    return await this.waitForAcks(signalKeys, timeout);
  }

  /**
   * Send board approval request (Enterprise mode only)
   */
  async sendBoardApprovalRequest(boardMemberIds, phaseData, mode = 'enterprise') {
    if (mode !== 'enterprise') {
      console.log('⚠️  Board approval only available in Enterprise mode');
      return 0;
    }

    console.log(`🏢 Requesting board approval from ${boardMemberIds.length} members`);

    const promises = boardMemberIds.map(memberId => 
      this.sendSignal('BOARD_APPROVAL_REQUEST', memberId, {
        phaseData,
        consensusThreshold: 0.95,
        mode
      }, mode)
    );

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    console.log(`📡 Board approval requests sent: ${successful}/${boardMemberIds.length}`);
    return successful;
  }

  /**
   * Wait for board approval (Enterprise mode only)
   */
  async waitForBoardApproval(boardMemberIds, phaseId, mode = 'enterprise') {
    if (mode !== 'enterprise') {
      return { acknowledged: [], timedOut: [], errors: [] };
    }

    const signalKeys = boardMemberIds.map(memberId => `board-approval-${phaseId}-${memberId}`);
    const timeout = this.timeouts[mode].boardApproval;
    
    return await this.waitForAcks(signalKeys, timeout);
  }

  /**
   * Send resume signal to blocked agents
   */
  async sendResumeSignal(agentIds, reason = '') {
    console.log(`▶️  Sending resume signal to ${agentIds.length} agents`);

    const promises = agentIds.map(agentId => 
      this.sendSignal('RESUME', agentId, {
        reason,
        timestamp: Date.now()
      })
    );

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    console.log(`📡 Resume signals sent: ${successful}/${agentIds.length}`);
    return successful;
  }

  /**
   * Send escalation signal for timeout handling
   */
  async sendEscalationSignal(agentId, escalationData) {
    console.log(`🚨 Sending escalation signal for agent ${agentId}`);

    return await this.sendSignal('ESCALATION', `coordinator:${this.coordinatorId}`, {
      agentId,
      escalationData,
      timestamp: Date.now()
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Coordinator Timeout Handler for CFN Loop orchestration
 */
export class CoordinatorTimeoutHandler {
  constructor(coordinatorId, signals) {
    this.coordinatorId = coordinatorId;
    this.signals = signals;
    this.activeTimeouts = new Map();
  }

  /**
   * Set timeout for operation with automatic escalation
   */
  setTimeout(operationId, timeoutMs, escalationData) {
    // Clear existing timeout for this operation
    if (this.activeTimeouts.has(operationId)) {
      clearTimeout(this.activeTimeouts.get(operationId));
    }

    const timeoutHandle = setTimeout(async () => {
      console.log(`⏰ Operation ${operationId} timed out after ${timeoutMs}ms`);
      
      // Send escalation signal
      await this.signals.sendEscalationSignal(this.coordinatorId, {
        operationId,
        timeoutMs,
        escalationData,
        timestamp: Date.now()
      });

      // Remove from active timeouts
      this.activeTimeouts.delete(operationId);
    }, timeoutMs);

    this.activeTimeouts.set(operationId, timeoutHandle);
    console.log(`⏱️  Set timeout for ${operationId}: ${timeoutMs}ms`);
  }

  /**
   * Clear timeout for operation
   */
  clearTimeout(operationId) {
    if (this.activeTimeouts.has(operationId)) {
      clearTimeout(this.activeTimeouts.get(operationId));
      this.activeTimeouts.delete(operationId);
      console.log(`✅ Cleared timeout for ${operationId}`);
    }
  }

  /**
   * Clear all active timeouts
   */
  clearTimeouts() {
    for (const [operationId, timeoutHandle] of this.activeTimeouts) {
      clearTimeout(timeoutHandle);
    }
    this.activeTimeouts.clear();
    console.log('🧹 Cleared all active timeouts');
  }
}

export default { BlockingCoordinationSignals, CoordinatorTimeoutHandler };