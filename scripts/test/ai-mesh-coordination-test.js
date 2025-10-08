#!/usr/bin/env node

/**
 * AI-Driven Mesh Coordination Test
 *
 * Real-world scenario using actual Claude Code CLI agents
 * 7 AI coordinators in mesh topology with 70 language combinations
 * Complete inter-agent communication logging
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AIMeshCoordinator {
  constructor() {
    this.outputDir = path.join(__dirname, '../ai-mesh-results');
    this.communicationLog = path.join(this.outputDir, 'ai-communications.log');
    this.coordinators = new Map();
    this.subAgents = new Map();
    this.agentProcesses = new Map();
    this.communicationCapture = new Map();

    this.programmingLanguages = [
      'Python', 'JavaScript', 'Rust', 'Go', 'Java', 'C++', 'TypeScript'
    ];

    this.verbalLanguages = [
      'Spanish', 'French', 'German', 'Italian', 'Portuguese',
      'Japanese', 'Russian', 'Chinese', 'Arabic', 'Hindi'
    ];
  }

  async start() {
    console.log('🤖 Starting AI-Driven Mesh Coordination Test');
    console.log('   Programming Languages: 7');
    console.log('   Verbal Languages: 10');
    console.log('   Target Combinations: 70 (7x10)');
    console.log('   Method: REAL AI agents via Claude Code CLI\n');

    await fs.mkdir(this.outputDir, { recursive: true });
    await this.setupCommunicationCapture();

    // Step 1: Spawn 7 AI coordinators
    await this.spawnAICoordinators();

    // Step 2: Monitor real coordination
    await this.monitorAICoordination();

    // Step 3: Collect and analyze results
    await this.collectResults();
  }

  async setupCommunicationCapture() {
    // Initialize communication logging
    const logHeader = {
      timestamp: Date.now(),
      testType: 'AI_DRIVEN_MESH_COORDINATION',
      config: {
        coordinators: 7,
        subAgentsPerCoordinator: 10,
        totalSubAgents: 70,
        programmingLanguages: this.programmingLanguages.length,
        verbalLanguages: this.verbalLanguages.length
      }
    };

    await fs.appendFile(this.communicationLog, JSON.stringify(logHeader) + '\n');
    console.log('📝 Communication logging initialized');
  }

  async spawnAICoordinators() {
    console.log('🚀 Step 1: Spawning 7 AI Coordinators');

    for (let i = 1; i <= 7; i++) {
      const coordinatorId = `ai-coordinator-${i}`;

      // Prepare coordinator instructions
      const instructions = this.generateCoordinatorInstructions(i);

      // Spawn AI coordinator using Claude Code CLI
      const aiCoordinator = await this.spawnAIAgent(coordinatorId, instructions);

      this.coordinators.set(coordinatorId, {
        id: coordinatorId,
        process: aiCoordinator,
        status: 'active',
        assignedLanguage: null,
        subAgents: []
      });

      console.log(`   ✅ ${coordinatorId} spawned as AI agent`);

      // Small delay between spawns
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('✅ All 7 AI coordinators spawned\n');
  }

  generateCoordinatorInstructions(coordinatorNumber) {
    return `
You are AI Coordinator ${coordinatorNumber} in a 7-coordinator mesh system.

YOUR MISSION:
- Coordinate with 6 other AI coordinators to cover 70 unique language combinations
- Choose ONE programming language from: ${this.programmingLanguages.join(', ')}
- Communicate with other coordinators to avoid conflicts
- Once assigned a language, create 10 Hello World functions in 10 different verbal languages

VERBAL LANGUAGES TO ASSIGN: ${this.verbalLanguages.join(', ')}

COORDINATION PROTOCOL:
1. Start by proposing your preferred programming language
2. Listen to other coordinators' proposals
3. If conflicts arise, negotiate and resolve through discussion
4. Once consensus is reached, implement your 10 language combinations

COMMUNICATION REQUIREMENTS:
- All messages must be logged to /dev/shm/ai-coordinator-${coordinatorNumber}-messages.log
- Include your reasoning for language selection
- Document all conflict resolution discussions
- Report final assignments clearly

FILE OUTPUT:
- Create Hello World files in ./ai-mesh-results/
- Use naming: hello_world_[verbal]_[programming].extension
- Example: hello_world_spanish_python.py

WORK autonomously but coordinate with other AI coordinators to achieve ZERO OVERLAP across all 70 combinations.
`;
  }

  async spawnAIAgent(agentId, instructions) {
    const messageFile = `/dev/shm/${agentId}-instructions.txt`;
    await fs.writeFile(messageFile, instructions);

    // Use Claude Code CLI to spawn actual AI agent
    const agentProcess = spawn('claude', [
      'flow-novice', 'swarm', 'spawn',
      '--agent-type', 'coordinator',
      '--name', agentId,
      '--instructions', messageFile
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    });

    // Set up communication capture
    await this.setupAgentCommunicationCapture(agentId, agentProcess);

    this.agentProcesses.set(agentId, agentProcess);

    return agentProcess;
  }

  async setupAgentCommunicationCapture(agentId, process) {
    const commFile = `/dev/shm/${agentId}-messages.log`;

    // Capture stdout
    process.stdout.on('data', async (data) => {
      const message = {
        timestamp: Date.now(),
        agentId: agentId,
        type: 'STDOUT',
        content: data.toString().trim()
      };

      await this.logCommunication(message);
      await fs.appendFile(commFile, JSON.stringify(message) + '\n');
    });

    // Capture stderr
    process.stderr.on('data', async (data) => {
      const message = {
        timestamp: Date.now(),
        agentId: agentId,
        type: 'STDERR',
        content: data.toString().trim()
      };

      await this.logCommunication(message);
      await fs.appendFile(commFile, JSON.stringify(message) + '\n');
    });

    // Log process events
    process.on('close', async (code) => {
      const message = {
        timestamp: Date.now(),
        agentId: agentId,
        type: 'PROCESS_CLOSE',
        content: `Process closed with code: ${code}`
      };

      await this.logCommunication(message);
      await fs.appendFile(commFile, JSON.stringify(message) + '\n');
    });
  }

  async logCommunication(message) {
    // Central logging for all inter-agent communications
    const logEntry = {
      timestamp: message.timestamp,
      agentId: message.agentId,
      type: message.type,
      content: message.content,
      globalTimestamp: Date.now()
    };

    await fs.appendFile(this.communicationLog, JSON.stringify(logEntry) + '\n');

    // Also track per-agent communication patterns
    if (!this.communicationCapture.has(message.agentId)) {
      this.communicationCapture.set(message.agentId, []);
    }
    this.communicationCapture.get(message.agentId).push(logEntry);

    // Real-time monitoring output
    console.log(`[${message.agentId}] ${message.type}: ${message.content.substring(0, 100)}...`);
  }

  async monitorAICoordination() {
    console.log('📡 Step 2: Monitoring AI Coordinator Inter-Communication');
    console.log('   AI agents will now coordinate autonomously...\n');

    // Let AI coordinators work for specified time
    const monitoringDuration = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < monitoringDuration) {
      await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds

      // Check agent status
      const activeAgents = Array.from(this.coordinators.values()).filter(c => c.status === 'active').length;
      console.log(`   📊 Active AI coordinators: ${activeAgents}/7`);

      // Look for coordination evidence
      await this.analyzeCoordinationProgress();
    }

    console.log('⏰ AI coordination period ended\n');
  }

  async analyzeCoordinationProgress() {
    // Look for evidence of coordination in communication logs
    try {
      const logContent = await fs.readFile(this.communicationLog, 'utf8');
      const messages = logContent.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

      const agentMessages = new Map();
      messages.forEach(msg => {
        if (!agentMessages.has(msg.agentId)) {
          agentMessages.set(msg.agentId, 0);
        }
        agentMessages.set(msg.agentId, agentMessages.get(msg.agentId) + 1);
      });

      console.log('   📈 Message activity by agent:');
      agentMessages.forEach((count, agentId) => {
        console.log(`      ${agentId}: ${count} messages`);
      });

    } catch (error) {
      console.log('   ⚠️  Could not analyze coordination progress');
    }
  }

  async collectResults() {
    console.log('📋 Step 3: Collecting AI Coordination Results');

    // Check for generated files
    const generatedFiles = await this.scanGeneratedFiles();

    // Analyze communication patterns
    const communicationAnalysis = await this.analyzeCommunications();

    // Generate final report
    const results = {
      timestamp: Date.now(),
      testType: 'AI_DRIVEN_MESH_COORDINATION',
      results: {
        generatedFiles: generatedFiles,
        communicationAnalysis: communicationAnalysis,
        agentStatus: this.getAgentStatus()
      }
    };

    const resultsFile = path.join(this.outputDir, `ai-results-${Date.now()}.json`);
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));

    console.log(`📁 Results saved to: ${resultsFile}`);
    console.log('📊 Communication analysis saved to: ai-communications.log');

    // Cleanup
    await this.cleanup();
  }

  async scanGeneratedFiles() {
    try {
      const files = await fs.readdir(this.outputDir);
      const helloFiles = files.filter(file => file.startsWith('hello_world_'));

      console.log(`   📄 Found ${helloFiles.length} Hello World files`);

      return {
        totalFiles: helloFiles.length,
        fileList: helloFiles,
        languageCombinations: this.analyzeLanguageCombinations(helloFiles)
      };

    } catch (error) {
      console.log('   ❌ Could not scan generated files');
      return { totalFiles: 0, fileList: [], languageCombinations: {} };
    }
  }

  analyzeLanguageCombinations(files) {
    const combinations = {};

    files.forEach(file => {
      // Parse filename to extract languages
      const parts = file.replace('hello_world_', '').replace(/\.[^/.]+$/, '').split('_');
      if (parts.length >= 2) {
        const verbal = parts[0];
        const programming = parts[1];
        const key = `${programming}+${verbal}`;

        combinations[key] = (combinations[key] || 0) + 1;
      }
    });

    return combinations;
  }

  async analyzeCommunications() {
    const analysis = {
      totalMessages: 0,
      messagesByAgent: {},
      communicationTypes: {},
      coordinationEvidence: false
    };

    this.communicationCapture.forEach((messages, agentId) => {
      analysis.messagesByAgent[agentId] = messages.length;
      analysis.totalMessages += messages.length;

      messages.forEach(msg => {
        analysis.communicationTypes[msg.type] = (analysis.communicationTypes[msg.type] || 0) + 1;

        // Look for coordination keywords
        if (msg.content.toLowerCase().includes('coordinator') ||
            msg.content.toLowerCase().includes('language') ||
            msg.content.toLowerCase().includes('conflict')) {
          analysis.coordinationEvidence = true;
        }
      });
    });

    return analysis;
  }

  getAgentStatus() {
    const status = {};
    this.coordinators.forEach((coordinator, id) => {
      status[id] = {
        status: coordinator.status,
        assignedLanguage: coordinator.assignedLanguage,
        processId: coordinator.process.pid
      };
    });
    return status;
  }

  async cleanup() {
    console.log('🧹 Cleaning up AI processes...');

    // Terminate all AI agent processes
    this.agentProcesses.forEach((process, agentId) => {
      try {
        process.kill('SIGTERM');
        console.log(`   ✅ Terminated ${agentId}`);
      } catch (error) {
        console.log(`   ⚠️  Could not terminate ${agentId}`);
      }
    });

    // Cleanup temp files
    try {
      const tempFiles = [
        '/dev/shm/ai-coordinator-*-instructions.txt',
        '/dev/shm/ai-coordinator-*-messages.log'
      ];

      for (const pattern of tempFiles) {
        const { execSync } = await import('child_process');
        try {
          execSync(`rm -f ${pattern}`);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    console.log('✅ Cleanup complete');
  }
}

// Run the AI mesh coordinator test
const aiMesh = new AIMeshCoordinator();
aiMesh.start().catch(console.error);