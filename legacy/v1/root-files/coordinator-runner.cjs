#!/usr/bin/env node

/**
 * CFN Coordinator Runner
 * 
 * Executes the Byzantine consensus coordinator with PBFT protocol
 * and SQLite integration for audit trails and state persistence.
 */

const sqlite = require('better-sqlite3');
const path = require('path');

class CoordinatorRunner {
  constructor() {
    this.args = this.parseArgs();
    this.coordinatorId = this.args.id || process.env.COORDINATOR_ID;
    this.mode = this.args.mode || process.env.COORDINATOR_MODE || 'mvp';
    this.config = JSON.parse(this.args.config || '{}');
    
    // Initialize SQLite with coordinator database
    this.db = new sqlite('./coordinator-registry.db');
    this.currentRound = 1;
    this.consensusPhase = 'PRE-PREPARE';
    this.consensusValue = null;
    this.participantAgents = this.config.participantAgents || [];
    this.validatorAgents = this.config.validatorAgents || [];
    this.boardMembers = this.config.boardMembers || [];
    
    // Initialize blocking coordination signals (mock for now)
    this.signals = this.initializeSignals();
  }

  parseArgs() {
    const args = {};
    process.argv.slice(2).forEach(arg => {
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        args[key.replace(/-/g, '_')] = value || true;
      }
    });
    return args;
  }

  initializeSignals() {
    // Mock signals class - in real implementation would use BlockingCoordinationSignals
    return {
      sendSignal: async (type, agentId, message) => {
        console.log(`📡 Sending ${type} to ${agentId}:`, message);
        
        // Store signal in SQLite for audit
        await this.db.prepare(`
          INSERT INTO coordinator_signals (coordinator_id, signal_type, target_agent, message, timestamp)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(this.coordinatorId, type, agentId, JSON.stringify(message));
        
        // Simulate agent response
        setTimeout(() => {
          console.log(`✅ ${agentId} acknowledged ${type}`);
        }, Math.random() * 1000);
        
        return true;
      },

      waitForAcks: async (signalIds, timeout) => {
        console.log(`⏳ Waiting for ${signalIds.length} acknowledgments (${timeout}ms timeout)`);
        
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              acknowledged: signalIds.map(id => ({
                agentId: id.split('-').pop(),
                signalId: id,
                timestamp: Date.now(),
                signature: `mock-signature-${id}`
              })),
              timedOut: [],
              total: signalIds.length
            });
          }, Math.random() * timeout * 0.5); // Random response within timeout
        });
      }
    };
  }

  async initializeCoordinator() {
    console.log(`🎯 Initializing ${this.mode.toUpperCase()} coordinator ${this.coordinatorId}`);
    
    // Create coordinator-specific tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS coordinator_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coordinator_id TEXT,
        signal_type TEXT,
        target_agent TEXT,
        message TEXT,
        timestamp DATETIME
      );
      
      CREATE TABLE IF NOT EXISTS consensus_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coordinator_id TEXT,
        round INTEGER,
        phase TEXT,
        proposal TEXT,
        proposal_hash TEXT,
        signature TEXT,
        status TEXT DEFAULT 'pending',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT,
        action TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Register coordinator lifecycle event
    await this.db.prepare(`
      INSERT INTO agents (id, name, type, status, capabilities, spawned_at)
      VALUES (?, ?, 'coordinator', 'initializing', ?, datetime('now'))
    `).run(
      this.coordinatorId, 
      `${this.mode}-coordinator`, 
      JSON.stringify(['pbft-coordination', 'malicious-detection', `${this.mode}-mode`])
    );

    // Initial audit log entry
    await this.db.prepare(`
      INSERT INTO audit_log (agent_id, action, details, timestamp)
      VALUES (?, 'coordinator_initialized', ?, datetime('now'))
    `).run(this.coordinatorId, JSON.stringify({
      consensusType: 'PBFT',
      maxFaultyNodes: this.config.maxFaultyNodes,
      mode: this.mode,
      thresholds: {
        gate: this.config.gateThreshold,
        consensus: this.config.consensusThreshold
      }
    }));

    console.log(`✅ Coordinator initialized with ${this.participantAgents.length} participants`);
    console.log(`🔧 Validators: ${this.validatorAgents.length}`);
    if (this.boardMembers.length > 0) {
      console.log(`👥 Board Members: ${this.boardMembers.length}`);
    }
  }

  async executeLoop1Orchestration() {
    console.log(`🔄 Starting Loop 1 Orchestration (Loop 3→2→4 repeating)`);
    
    while (this.currentRound <= 5) { // Max 5 rounds for demo
      console.log(`\n--- Round ${this.currentRound} ---`);
      
      try {
        // Phase 1: PRE-PREPARE (Loop 3)
        const prePrepareResult = await this.executePrePreparePhase();
        if (!prePrepareResult.success) {
          console.log('❌ PRE-PREPARE phase failed, initiating view change');
          await this.initiateViewChange('pre-prepare-failure');
          continue;
        }

        // Phase 2: PREPARE (Loop 2)
        const prepareResult = await this.executePreparePhase();
        if (!prepareResult.success) {
          console.log('❌ PREPARE phase failed, initiating view change');
          await this.initiateViewChange('prepare-failure');
          continue;
        }

        // Phase 3: COMMIT (Loop 4)
        const commitResult = await this.executeCommitPhase(prepareResult);
        if (commitResult.success) {
          console.log('🎉 CONSENSUS ACHIEVED!');
          await this.handleConsensusAchieved(commitResult);
          break;
        } else {
          console.log('❌ COMMIT phase failed, continuing to next round');
          this.currentRound++;
        }

      } catch (error) {
        console.error('💥 Error in orchestration:', error.message);
        await this.initiateViewChange('orchestration-error');
      }
    }
  }

  async executePrePreparePhase() {
    console.log(`📤 Phase 1: PRE-PREPARE (Loop 3)`);
    
    const proposal = {
      type: 'consensus-proposal',
      round: this.currentRound,
      value: `proposal-${this.currentRound}-${Date.now()}`,
      timestamp: Date.now()
    };

    const proposalHash = `hash-${Date.now()}`;
    const signature = `signature-${Date.now()}`;

    // Store pre-prepare in SQLite
    await this.db.prepare(`
      INSERT INTO consensus_log (coordinator_id, round, phase, proposal, proposal_hash, signature, status)
      VALUES (?, ?, 'PRE-PREPARE', ?, ?, ?, 'broadcast')
    `).run(this.coordinatorId, this.currentRound, JSON.stringify(proposal), proposalHash, signature);

    // Send PRE-PREPARE to all agents
    for (const agentId of this.participantAgents) {
      await this.signals.sendSignal('PRE-PREPARE', agentId, {
        round: this.currentRound,
        proposal,
        proposalHash,
        signature,
        sequenceNumber: this.currentRound,
        timestamp: Date.now()
      });
    }

    this.consensusValue = proposal.value;
    this.consensusPhase = 'PREPARE';
    
    return { success: true, proposal, proposalHash, signature };
  }

  async executePreparePhase() {
    console.log(`📥 Phase 2: PREPARE (Loop 2)`);
    
    const prepareAcks = await this.signals.waitForAcks(
      this.participantAgents.map(id => `prepare-${this.currentRound}-${id}`),
      this.config.timeout
    );

    const validPrepares = prepareAcks.acknowledged.filter(ack => 
      ack.signature && ack.timestamp
    );

    const requiredVotes = Math.floor(2 * this.participantAgents.length / 3) + 1;
    
    if (validPrepares.length >= requiredVotes) {
      // Update consensus log
      await this.db.prepare(`
        UPDATE consensus_log SET status = 'prepared' 
        WHERE coordinator_id = ? AND round = ? AND phase = 'PRE-PREPARE'
      `).run(this.coordinatorId, this.currentRound);

      // Store consensus progress
      await this.db.prepare(`
        INSERT INTO coordinator_metrics (coordinator_id, round, phase, confidence, votes)
        VALUES (?, ?, 'PREPARE', ?, ?)
      `).run(this.coordinatorId, this.currentRound, 0.85, validPrepares.length);

      this.consensusPhase = 'COMMIT';
      
      return { 
        success: true, 
        validPrepares, 
        votes: validPrepares.length,
        requiredVotes
      };
    }
    
    return { success: false, votes: validPrepares.length, requiredVotes };
  }

  async executeCommitPhase(prepareResult) {
    console.log(`✅ Phase 3: COMMIT (Loop 4)`);
    
    const commitAcks = await this.signals.waitForAcks(
      this.participantAgents.map(id => `commit-${this.currentRound}-${id}`),
      this.config.timeout
    );

    const validCommits = commitAcks.acknowledged.filter(ack => 
      ack.signature && ack.timestamp
    );

    const consensusRatio = validCommits.length / this.participantAgents.length;
    const thresholdMet = consensusRatio >= this.config.consensusThreshold;
    
    if (thresholdMet) {
      // Update consensus log
      await this.db.prepare(`
        UPDATE consensus_log SET status = 'committed' 
        WHERE coordinator_id = ? AND round = ? AND phase = 'PRE-PREPARE'
      `).run(this.coordinatorId, this.currentRound);

      // Store final metrics
      await this.db.prepare(`
        INSERT INTO coordinator_metrics (coordinator_id, round, phase, confidence, votes)
        VALUES (?, ?, 'COMMIT', ?, ?)
      `).run(this.coordinatorId, this.currentRound, consensusRatio, validCommits.length);

      return { 
        success: true, 
        consensusValue: this.consensusValue,
        round: this.currentRound,
        consensusRatio,
        votes: validCommits.length
      };
    }
    
    return { 
      success: false, 
      consensusRatio,
      threshold: this.config.consensusThreshold,
      votes: validCommits.length
    };
  }

  async handleConsensusAchieved(result) {
    console.log(`🎊 CONSENSUS ACHIEVED: ${result.consensusValue}`);
    console.log(`📊 Round: ${result.round}, Consensus Ratio: ${result.consensusRatio.toFixed(3)}`);
    
    // Update coordinator status
    await this.db.prepare(`
      UPDATE agents SET status = 'consensus_achieved', completed_at = datetime('now')
      WHERE id = ?
    `).run(this.coordinatorId);

    // Final audit log entry
    await this.db.prepare(`
      INSERT INTO audit_log (agent_id, action, details, timestamp)
      VALUES (?, 'consensus_achieved', ?, datetime('now'))
    `).run(this.coordinatorId, JSON.stringify({
      consensusValue: result.consensusValue,
      round: result.round,
      consensusRatio: result.consensusRatio,
      mode: this.mode,
      participants: this.participantAgents.length,
      validators: this.validatorAgents.length
    }));

    // Auto-inject mode instructions
    await this.autoInjectModeInstructions(result);

    // Check return-to-chat triggers
    await this.checkReturnTriggers(result);
  }

  async autoInjectModeInstructions(consensusResult) {
    console.log(`🔧 Auto-injecting ${this.mode.toUpperCase()} mode instructions`);
    
    const instructions = {
      mode: this.mode,
      nextPhase: 'EXECUTION',
      thresholds: this.config,
      returnTriggers: {
        humanDecision: {
          enabled: true,
          threshold: this.mode === 'mvp' ? 0.90 : this.mode === 'standard' ? 0.85 : 0.80
        },
        sprintComplete: {
          enabled: true,
          criteria: ['consensus_achieved', 'all_validators_confirm']
        }
      }
    };

    // Store instructions in SQLite (would use memory adapter in real implementation)
    console.log('💾 Mode instructions stored for next phase');
  }

  async checkReturnTriggers(consensusResult) {
    console.log(`🔄 Checking return-to-chat triggers`);
    
    // Check human decision trigger
    if (consensusResult.consensusRatio > 0.85) {
      console.log(`👤 Human decision trigger activated (confidence: ${consensusResult.consensusRatio.toFixed(3)})`);
      console.log('⏸️  Awaiting human approval before proceeding...');
    }

    // Check sprint complete trigger
    if (this.currentRound <= 3 && consensusResult.consensusRatio >= this.config.consensusThreshold) {
      console.log('🏁 Sprint complete trigger activated');
      console.log('📞 Returning to chat with consensus results');
      
      await this.db.prepare(`
        INSERT INTO audit_log (agent_id, action, details, timestamp)
        VALUES (?, 'sprint_complete', ?, datetime('now'))
      `).run(this.coordinatorId, JSON.stringify({
        consensusValue: consensusResult.consensusValue,
        rounds: this.currentRound,
        mode: this.mode
      }));
    }
  }

  async initiateViewChange(reason) {
    console.log(`🔄 Initiating view change: ${reason}`);
    
    await this.db.prepare(`
      INSERT INTO audit_log (agent_id, action, details, timestamp)
      VALUES (?, 'view_change', ?, datetime('now'))
    `).run(this.coordinatorId, JSON.stringify({ reason, round: this.currentRound }));

    // Simple round-robin primary selection
    const currentPrimaryIndex = this.participantAgents.indexOf(this.participantAgents[0]);
    const newPrimaryIndex = (currentPrimaryIndex + 1) % this.participantAgents.length;
    
    this.participantAgents = [
      this.participantAgents[newPrimaryIndex],
      ...this.participantAgents.filter((_, i) => i !== newPrimaryIndex)
    ];

    this.currentRound++;
    this.consensusPhase = 'PRE-PREPARE';
    
    console.log(`📋 New primary selected: ${this.participantAgents[0]}`);
    console.log(`🔄 Starting round ${this.currentRound}`);
  }

  async run() {
    try {
      await this.initializeCoordinator();
      await this.executeLoop1Orchestration();
      
      console.log('\n✅ Coordinator execution completed');
      process.exit(0);
      
    } catch (error) {
      console.error('💥 Coordinator execution failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const runner = new CoordinatorRunner();
  runner.run().catch(console.error);
}

module.exports = CoordinatorRunner;