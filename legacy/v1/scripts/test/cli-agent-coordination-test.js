#!/usr/bin/env node

/**
 * CLI Agent Coordination Test
 *
 * This test demonstrates spawning real Claude Code agents using the CLI
 * and testing their coordination capabilities through slash commands
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CLIAgentCoordinationTest {
  constructor() {
    this.outputDir = './cli-agent-results';
    this.testStartTime = Date.now();
    this.agentProcesses = new Map();
    this.coordinationResults = [];
  }

  async start() {
    console.log('🚀 Starting CLI Agent Coordination Test');
    console.log('   This test spawns REAL Claude Code agents using slash commands\n');

    await fs.mkdir(this.outputDir, { recursive: true });

    // Step 1: Initialize swarm
    await this.initializeSwarm();

    // Step 2: Spawn agents using slash commands
    await this.spawnAgentsWithSlashCommands();

    // Step 3: Test coordination
    await this.testAgentCoordination();

    // Step 4: Generate report
    await this.generateReport();
  }

  async initializeSwarm() {
    console.log('📋 Step 1: Initializing swarm...');

    return new Promise((resolve) => {
      const swarmInit = spawn('claude-flow-novice', ['swarm', 'init', 'mesh', '5', 'balanced'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      let output = '';

      swarmInit.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(text.trim());
      });

      swarmInit.stderr.on('data', (data) => {
        console.error('ERROR:', data.toString().trim());
      });

      swarmInit.on('close', (code) => {
        console.log(`✅ Swarm initialization completed with code: ${code}\n`);
        resolve();
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        swarmInit.kill();
        resolve();
      }, 10000);
    });
  }

  async spawnAgentsWithSlashCommands() {
    console.log('🤖 Step 2: Spawning agents with slash commands...');

    const agentTypes = [
      { type: 'coder', name: 'Code Agent 1' },
      { type: 'tester', name: 'Test Agent 1' },
      { type: 'reviewer', name: 'Review Agent 1' },
      { type: 'analyst', name: 'Analysis Agent 1' },
      { type: 'researcher', name: 'Research Agent 1' }
    ];

    for (const agent of agentTypes) {
      console.log(`   Spawning ${agent.type}: ${agent.name}`);

      await this.spawnAgent(agent);

      // Small delay between spawns
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`✅ Spawned ${agentTypes.length} agents\n`);
  }

  async spawnAgent(agentConfig) {
    return new Promise((resolve) => {
      const agentProcess = spawn('claude-flow-novice', ['swarm', 'spawn', agentConfig.type, agentConfig.name], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      const agentId = `${agentConfig.type}-${Date.now()}`;
      let output = '';

      agentProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`   [${agentId}] ${text.trim()}`);
      });

      agentProcess.stderr.on('data', (data) => {
        console.error(`   [${agentId}] ERROR: ${data.toString().trim()}`);
      });

      agentProcess.on('close', (code) => {
        this.agentProcesses.set(agentId, {
          config: agentConfig,
          output: output,
          exitCode: code,
          spawned: Date.now()
        });
        resolve();
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        agentProcess.kill();
        resolve();
      }, 15000);
    });
  }

  async testAgentCoordination() {
    console.log('📡 Step 3: Testing agent coordination...');

    // Test swarm status
    await this.checkSwarmStatus();

    // Test orchestration
    await this.testTaskOrchestration();

    console.log('✅ Coordination testing completed\n');
  }

  async checkSwarmStatus() {
    console.log('   Checking swarm status...');

    return new Promise((resolve) => {
      const statusCheck = spawn('claude-flow-novice', ['swarm', 'status', 'true'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      let output = '';

      statusCheck.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`     ${text.trim()}`);
      });

      statusCheck.stderr.on('data', (data) => {
        console.error(`     ERROR: ${data.toString().trim()}`);
      });

      statusCheck.on('close', (code) => {
        this.coordinationResults.push({
          test: 'swarm-status',
          success: code === 0,
          output: output,
          timestamp: Date.now()
        });
        resolve();
      });

      setTimeout(() => {
        statusCheck.kill();
        resolve();
      }, 10000);
    });
  }

  async testTaskOrchestration() {
    console.log('   Testing task orchestration...');

    const testTask = 'Create a simple coordination test between agents';

    return new Promise((resolve) => {
      const orchestration = spawn('claude-flow-novice', ['swarm', 'orchestrate', testTask], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      let output = '';

      orchestration.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`     ${text.trim()}`);
      });

      orchestration.stderr.on('data', (data) => {
        console.error(`     ERROR: ${data.toString().trim()}`);
      });

      orchestration.on('close', (code) => {
        this.coordinationResults.push({
          test: 'task-orchestration',
          success: code === 0,
          output: output,
          timestamp: Date.now()
        });
        resolve();
      });

      setTimeout(() => {
        orchestration.kill();
        resolve();
      }, 15000);
    });
  }

  async generateReport() {
    console.log('📊 Step 4: Generating test report...');

    const testDuration = Date.now() - this.testStartTime;
    const successfulAgents = Array.from(this.agentProcesses.values()).filter(a => a.exitCode === 0).length;
    const successfulTests = this.coordinationResults.filter(r => r.success).length;

    const report = {
      test: {
        type: 'cli-agent-coordination-test',
        duration: testDuration,
        startTime: new Date(this.testStartTime).toISOString(),
        endTime: new Date().toISOString()
      },
      agents: {
        total: this.agentProcesses.size,
        successful: successfulAgents,
        successRate: (successfulAgents / this.agentProcesses.size * 100).toFixed(2) + '%'
      },
      coordination: {
        totalTests: this.coordinationResults.length,
        successful: successfulTests,
        successRate: (successfulTests / this.coordinationResults.length * 100).toFixed(2) + '%'
      },
      details: {
        agents: Array.from(this.agentProcesses.entries()).map(([id, agent]) => ({
          id,
          type: agent.config.type,
          name: agent.config.name,
          success: agent.exitCode === 0,
          spawned: new Date(agent.spawned).toISOString()
        })),
        tests: this.coordinationResults
      }
    };

    const reportFile = path.join(this.outputDir, `cli-agent-test-report-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    console.log('\n📋 CLI AGENT COORDINATION TEST RESULTS:');
    console.log(`   Test Duration: ${(testDuration / 1000).toFixed(2)} seconds`);
    console.log(`   Agents Spawned: ${this.agentProcesses.size}`);
    console.log(`   Successful Agents: ${successfulAgents} (${report.agents.successRate})`);
    console.log(`   Coordination Tests: ${this.coordinationResults.length}`);
    console.log(`   Successful Tests: ${successfulTests} (${report.coordination.successRate})`);
    console.log(`   Report saved to: ${reportFile}`);

    console.log('\n🎯 SUMMARY:');
    if (report.agents.successRate === '100.00%' && report.coordination.successRate === '100.00%') {
      console.log('   ✅ All tests passed! Real CLI agents are working correctly.');
    } else {
      console.log('   ⚠️  Some tests failed. Check the detailed report for more information.');
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--help')) {
    console.log(`
CLI Agent Coordination Test

Usage: node cli-agent-coordination-test.js

This test demonstrates:
1. Initializing a swarm using CLI commands
2. Spawning real Claude Code agents
3. Testing agent coordination and orchestration
4. Generating a comprehensive test report

The agents spawned are REAL Claude Code agent processes, not simulated workers.
    `);
    process.exit(0);
  }

  const test = new CLIAgentCoordinationTest();

  test.start().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

export default CLIAgentCoordinationTest;