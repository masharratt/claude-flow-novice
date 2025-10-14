#!/usr/bin/env node

/**
 * CFN Coordinator Worker Spawner
 * 
 * Spawns Byzantine consensus coordinators with different profiles:
 * - MVP: Gate 0.70, Consensus 0.80, 2 validators
 * - Standard: Gate 0.75, Consensus 0.90, 4 validators  
 * - Enterprise: Gate 0.75, Consensus 0.95, 4 validators + 4-person board
 */

const { spawn } = require('child_process');
const sqlite = require('better-sqlite3');
const path = require('path');

// Initialize SQLite for coordinator tracking
const db = new sqlite('./coordinator-registry.db');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS coordinators (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    config TEXT NOT NULL,
    spawned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME,
    completed_at DATETIME
  );
  
  CREATE TABLE IF NOT EXISTS coordinator_metrics (
    coordinator_id TEXT,
    round INTEGER,
    phase TEXT,
    confidence REAL,
    votes INTEGER,
    malicious_detected TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coordinator_id) REFERENCES coordinators(id)
  );
`);

class WorkerSpawner {
  constructor() {
    this.args = this.parseArgs();
    this.coordinatorId = this.args['coordinator-id'] || this.generateCoordinatorId();
    this.mode = this.args.mode || 'mvp';
    this.config = this.getModeConfig();
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

  generateCoordinatorId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `cfn-${this.mode}-${timestamp}-${random}`;
  }

  getModeConfig() {
    const configs = {
      mvp: {
        mode: 'mvp',
        gateThreshold: 0.70,
        consensusThreshold: 0.80,
        validators: 2,
        maxFaultyNodes: 1,
        timeout: 30000,
        retryAttempts: 3,
        checkpointInterval: 60000,
        participantAgents: ['agent-1', 'agent-2', 'agent-3'],
        validatorAgents: ['validator-1', 'validator-2'],
        boardMembers: [],
        security: {
          enhancedSignatures: false,
          zeroKnowledgeProofs: false,
          replayProtection: true,
          thresholdSignatures: false
        },
        compliance: {
          level: 'basic',
          frameworks: [],
          auditLevel: 'standard'
        }
      },
      standard: {
        mode: 'standard',
        gateThreshold: 0.75,
        consensusThreshold: 0.90,
        validatorThreshold: 0.75,
        validators: 4,
        maxFaultyNodes: 2,
        timeout: 45000,
        retryAttempts: 5,
        checkpointInterval: 60000,
        participantAgents: [
          'agent-1', 'agent-2', 'agent-3', 'agent-4', 
          'agent-5', 'agent-6', 'agent-7'
        ],
        validatorAgents: ['validator-1', 'validator-2', 'validator-3', 'validator-4'],
        boardMembers: [],
        security: {
          enhancedSignatures: true,
          zeroKnowledgeProofs: true,
          replayProtection: true,
          thresholdSignatures: true
        },
        compliance: {
          level: 'standard',
          frameworks: ['SOC2', 'ISO27001'],
          auditLevel: 'comprehensive'
        }
      },
      enterprise: {
        mode: 'enterprise',
        gateThreshold: 0.75,
        consensusThreshold: 0.95,
        validatorThreshold: 0.80,
        boardThreshold: 0.75,
        complianceThreshold: 0.90,
        validators: 4,
        boardMembers: 4,
        maxFaultyNodes: 4,
        timeout: 60000,
        retryAttempts: 7,
        checkpointInterval: 30000,
        participantAgents: [
          'agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5', 
          'agent-6', 'agent-7', 'agent-8', 'agent-9', 'agent-10',
          'agent-11', 'agent-12', 'agent-13'
        ],
        validatorAgents: ['validator-1', 'validator-2', 'validator-3', 'validator-4'],
        boardMembers: ['board-1', 'board-2', 'board-3', 'board-4'],
        security: {
          enhancedSignatures: true,
          zeroKnowledgeProofs: true,
          replayProtection: true,
          thresholdSignatures: true,
          quantumResistant: true,
          hardwareSecurityModule: true
        },
        compliance: {
          level: 'enterprise',
          frameworks: ['SOC2', 'ISO27001', 'GDPR', 'HIPAA'],
          auditLevel: 'enterprise',
          realTimeMonitoring: true,
          automatedReporting: true
        }
      }
    };

    // Override with command line arguments
    const config = configs[this.mode];
    
    if (this.args.gate_threshold) {
      config.gateThreshold = parseFloat(this.args.gate_threshold);
    }
    if (this.args.consensus_threshold) {
      config.consensusThreshold = parseFloat(this.args.consensus_threshold);
    }
    if (this.args.validators) {
      config.validators = parseInt(this.args.validators);
      config.validatorAgents = Array.from({length: config.validators}, (_, i) => `validator-${i+1}`);
    }
    if (this.args.board_size) {
      config.boardMembers = parseInt(this.args.board_size);
      config.boardMembers = Array.from({length: config.boardMembers}, (_, i) => `board-${i+1}`);
    }
    if (this.args.timeout) {
      config.timeout = parseInt(this.args.timeout);
    }
    if (this.args.checkpoint_interval) {
      config.checkpointInterval = parseInt(this.args.checkpoint_interval);
    }

    return config;
  }

  async registerCoordinator() {
    const stmt = db.prepare(`
      INSERT INTO coordinators (id, mode, status, config)
      VALUES (?, ?, 'spawned', ?)
    `);
    
    stmt.run(this.coordinatorId, this.mode, JSON.stringify(this.config));
    
    console.log(`✅ Registered coordinator ${this.coordinatorId} in SQLite registry`);
  }

  async spawnCoordinator() {
    console.log(`🚀 Spawning ${this.mode.toUpperCase()} coordinator...`);
    console.log(`📋 Configuration:`);
    console.log(`   - Coordinator ID: ${this.coordinatorId}`);
    console.log(`   - Mode: ${this.mode}`);
    console.log(`   - Gate Threshold: ${this.config.gateThreshold}`);
    console.log(`   - Consensus Threshold: ${this.config.consensusThreshold}`);
    console.log(`   - Validators: ${this.config.validators}`);
    console.log(`   - Max Faulty Nodes: ${this.config.maxFaultyNodes}`);
    console.log(`   - Timeout: ${this.config.timeout}ms`);
    
    if (this.config.boardMembers && this.config.boardMembers.length > 0) {
      console.log(`   - Board Members: ${this.config.boardMembers.length}`);
    }

    // Spawn the coordinator process
    const coordinatorProcess = spawn('node', [
      path.join(__dirname, 'coordinator-runner.js'),
      '--id', this.coordinatorId,
      '--mode', this.mode,
      '--config', JSON.stringify(this.config)
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        COORDINATOR_ID: this.coordinatorId,
        COORDINATOR_MODE: this.mode,
        BLOCKING_COORDINATION_SECRET: process.env.BLOCKING_COORDINATION_SECRET || 'default-secret-key'
      }
    });

    // Handle process output
    coordinatorProcess.stdout.on('data', (data) => {
      console.log(`[${this.coordinatorId}] ${data.toString().trim()}`);
    });

    coordinatorProcess.stderr.on('data', (data) => {
      console.error(`[${this.coordinatorId}] ERROR: ${data.toString().trim()}`);
    });

    coordinatorProcess.on('close', (code) => {
      console.log(`[${this.coordinatorId}] Process exited with code ${code}`);
      this.updateCoordinatorStatus('completed');
    });

    coordinatorProcess.on('error', (error) => {
      console.error(`[${this.coordinatorId}] Process error: ${error.message}`);
      this.updateCoordinatorStatus('failed');
    });

    // Update status to running
    this.updateCoordinatorStatus('running');

    return coordinatorProcess;
  }

  updateCoordinatorStatus(status) {
    const stmt = db.prepare(`
      UPDATE coordinators 
      SET status = ?, last_active = CURRENT_TIMESTAMP
      ${status === 'completed' ? ', completed_at = CURRENT_TIMESTAMP' : ''}
      WHERE id = ?
    `);
    
    stmt.run(status, this.coordinatorId);
  }

  async listCoordinators() {
    const stmt = db.prepare(`
      SELECT id, mode, status, spawned_at, completed_at 
      FROM coordinators 
      ORDER BY spawned_at DESC
    `);
    
    const coordinators = stmt.all();
    
    console.log('\n📊 Registered Coordinators:');
    console.log('ID\t\t\tMode\t\tStatus\t\tSpawned At\t\tCompleted At');
    console.log('-'.repeat(100));
    
    coordinators.forEach(coord => {
      const completed = coord.completed_at || 'N/A';
      console.log(`${coord.id}\t${coord.mode}\t\t${coord.status}\t\t${coord.spawned_at}\t${completed}`);
    });
  }

  async getCoordinatorMetrics(coordinatorId) {
    const stmt = db.prepare(`
      SELECT round, phase, confidence, votes, malicious_detected, timestamp
      FROM coordinator_metrics 
      WHERE coordinator_id = ?
      ORDER BY round, phase
    `);
    
    const metrics = stmt.all(coordinatorId);
    
    console.log(`\n📈 Metrics for ${coordinatorId}:`);
    console.log('Round\tPhase\t\tConfidence\tVotes\tMalicious Detected\tTimestamp');
    console.log('-'.repeat(80));
    
    metrics.forEach(metric => {
      const malicious = metric.malicious_detected || 'None';
      console.log(`${metric.round}\t${metric.phase}\t\t${metric.confidence}\t\t${metric.votes}\t${malicious}\t\t${metric.timestamp}`);
    });
  }

  async run() {
    try {
      if (this.args.list) {
        await this.listCoordinators();
        return;
      }

      if (this.args.metrics) {
        await this.getCoordinatorMetrics(this.args.metrics);
        return;
      }

      // Register and spawn coordinator
      await this.registerCoordinator();
      const process = await this.spawnCoordinator();

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log(`\n🛑 Shutting down coordinator ${this.coordinatorId}...`);
        process.kill('SIGINT');
        this.updateCoordinatorStatus('terminated');
        process.exit(0);
      });

    } catch (error) {
      console.error('❌ Failed to spawn coordinator:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const spawner = new WorkerSpawner();
  spawner.run().catch(console.error);
}

module.exports = WorkerSpawner;