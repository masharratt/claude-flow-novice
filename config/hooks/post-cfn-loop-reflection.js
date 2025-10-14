#!/usr/bin/env node

/**
 * Post-CFN-Loop Reflection Hook
 *
 * Comprehensive reflection after CFN Loop phase completion.
 * Aggregates learnings from all agents in the loop and creates phase-level bullets.
 *
 * Usage: Configured in Claude Code hooks settings
 * Trigger: After CFN Loop phase completion (auto)
 *
 * Environment Variables:
 * - PHASE: CFN Loop phase name
 * - LOOP_NUMBER: Loop number (0-4)
 * - SWARM_ID: Swarm ID
 * - AGENT_IDS: Comma-separated agent IDs involved in loop
 * - CONSENSUS_SCORE: Loop 2 consensus score (if applicable)
 * - GATE_SCORE: Loop 3 gate score (if applicable)
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const CONFIG = {
  reflectionTypes: {
    0: 'epic_orchestration',      // Loop 0: Epic/Sprint planning
    1: 'phase_execution',          // Loop 1: Phase coordination
    2: 'consensus_validation',     // Loop 2: Validation insights
    3: 'implementation',           // Loop 3: Primary implementation
    4: 'product_owner_decision',   // Loop 4: PO decision reasoning
  },

  minAgentsForReflection: 1,
  autoCurateThreshold: 0.8,
  aggregateAgentReflections: true,
};

/**
 * Main hook execution
 */
async function main() {
  const phase = process.env.PHASE || process.argv[2];
  const loopNumber = parseInt(process.env.LOOP_NUMBER || process.argv[3] || '3');
  const swarmId = process.env.SWARM_ID || process.argv[4];
  const agentIds = (process.env.AGENT_IDS || process.argv[5] || '').split(',').filter(Boolean);
  const consensusScore = parseFloat(process.env.CONSENSUS_SCORE || '0');
  const gateScore = parseFloat(process.env.GATE_SCORE || '0');

  if (!phase || !swarmId) {
    console.error('❌ POST-CFN-LOOP-REFLECTION: Missing required parameters (phase, swarmId)');
    process.exit(1);
  }

  console.log(`🔄 POST-CFN-LOOP-REFLECTION: Phase ${phase}, Loop ${loopNumber}`);
  console.log(`   Swarm: ${swarmId}`);
  console.log(`   Agents: ${agentIds.length}`);

  try {
    const reflectionType = CONFIG.reflectionTypes[loopNumber];

    if (!reflectionType) {
      console.log(`⏭️  No reflection configured for Loop ${loopNumber}`);
      process.exit(0);
    }

    console.log(`📊 Reflection type: ${reflectionType}`);

    // Different reflection strategies by loop
    let reflectionResult;

    switch (loopNumber) {
      case 2:
        // Loop 2: Reflect on consensus validation
        reflectionResult = await reflectOnConsensusValidation({
          phase,
          swarmId,
          agentIds,
          consensusScore,
        });
        break;

      case 3:
        // Loop 3: Aggregate agent implementation learnings
        reflectionResult = await reflectOnImplementation({
          phase,
          swarmId,
          agentIds,
          gateScore,
        });
        break;

      case 4:
        // Loop 4: Reflect on PO decision reasoning
        reflectionResult = await reflectOnProductOwnerDecision({
          phase,
          swarmId,
        });
        break;

      default:
        console.log(`ℹ️  Reflection not implemented for Loop ${loopNumber} yet`);
        process.exit(0);
    }

    if (reflectionResult.success) {
      console.log(`✅ Loop ${loopNumber} reflection completed`);
      console.log(`📊 Extracted ${reflectionResult.lessonCount} phase-level lessons`);

      if (reflectionResult.autoCurated) {
        console.log(`✅ Auto-curated: ${reflectionResult.bulletIds.length} bullets updated`);
      }

      // Store phase completion metrics
      await storePhaseMetrics({
        phase,
        loopNumber,
        swarmId,
        reflectionId: reflectionResult.reflectionId,
        lessonCount: reflectionResult.lessonCount,
      });

      process.exit(0);
    } else {
      console.error(`❌ Loop ${loopNumber} reflection failed: ${reflectionResult.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`❌ POST-CFN-LOOP-REFLECTION ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Reflect on Loop 2 consensus validation
 */
async function reflectOnConsensusValidation(options) {
  const { phase, swarmId, agentIds, consensusScore } = options;

  console.log(`🔍 Reflecting on consensus validation (score: ${consensusScore})...`);

  // Aggregate validator feedback
  const validatorFeedback = await getValidatorFeedback(agentIds);

  // Spawn reflector with consensus-specific context
  const reflection = await spawnReflector({
    type: 'consensus_validation',
    phase,
    swarmId,
    context: {
      consensusScore,
      validatorFeedback,
      agentCount: agentIds.length,
    },
    autoCurate: consensusScore >= CONFIG.autoCurateThreshold,
  });

  return reflection;
}

/**
 * Reflect on Loop 3 implementation
 */
async function reflectOnImplementation(options) {
  const { phase, swarmId, agentIds, gateScore } = options;

  console.log(`🔍 Reflecting on implementation (gate score: ${gateScore})...`);

  // Aggregate agent confidence reports
  const agentReports = await getAgentConfidenceReports(agentIds);

  // Identify common patterns and issues
  const patterns = analyzePatterns(agentReports);

  // Spawn reflector with implementation-specific context
  const reflection = await spawnReflector({
    type: 'implementation',
    phase,
    swarmId,
    context: {
      gateScore,
      agentReports,
      patterns,
      agentCount: agentIds.length,
    },
    autoCurate: gateScore >= CONFIG.autoCurateThreshold,
  });

  return reflection;
}

/**
 * Reflect on Loop 4 product owner decision
 */
async function reflectOnProductOwnerDecision(options) {
  const { phase, swarmId } = options;

  console.log(`🔍 Reflecting on product owner decision...`);

  // Get PO decision details
  const poDecision = await getProductOwnerDecision(phase, swarmId);

  // Spawn reflector with PO-specific context
  const reflection = await spawnReflector({
    type: 'product_owner_decision',
    phase,
    swarmId,
    context: {
      decision: poDecision.decision,
      reasoning: poDecision.reasoning,
      overrides: poDecision.overrides,
    },
    autoCurate: true, // Always auto-curate PO reflections
  });

  return reflection;
}

/**
 * Get validator feedback from Loop 2
 */
async function getValidatorFeedback(agentIds) {
  // Query SQLite for validator reports
  // Placeholder implementation
  return agentIds.map(id => ({
    agentId: id,
    score: 0.85,
    feedback: 'Example validator feedback',
  }));
}

/**
 * Get agent confidence reports from Loop 3
 */
async function getAgentConfidenceReports(agentIds) {
  // Query SQLite memory for agent confidence reports
  // Placeholder implementation
  return agentIds.map(id => ({
    agentId: id,
    confidence: 0.82,
    blockers: [],
    achievements: ['Task completed'],
  }));
}

/**
 * Analyze patterns across agent reports
 */
function analyzePatterns(reports) {
  const patterns = {
    commonBlockers: [],
    successPatterns: [],
    edgeCases: [],
  };

  // Aggregate common blockers
  const blockerCounts = {};
  reports.forEach(report => {
    report.blockers?.forEach(blocker => {
      blockerCounts[blocker] = (blockerCounts[blocker] || 0) + 1;
    });
  });

  patterns.commonBlockers = Object.entries(blockerCounts)
    .filter(([, count]) => count >= 2)
    .map(([blocker]) => blocker);

  return patterns;
}

/**
 * Get product owner decision from Loop 4
 */
async function getProductOwnerDecision(phase, swarmId) {
  // Query SQLite for PO decision
  // Placeholder implementation
  return {
    decision: 'PROCEED',
    reasoning: 'All gates passed',
    overrides: [],
  };
}

/**
 * Spawn context-reflector agent
 */
async function spawnReflector(options) {
  return new Promise((resolve, reject) => {
    const args = [
      '/context-reflect',
      `--reflection-type=${options.type}`,
      `--phase=${options.phase}`,
      `--swarm-id=${options.swarmId}`,
      '--output=json',
    ];

    if (options.autoCurate) {
      args.push('--auto-curate');
    }

    // Pass context as JSON file
    const contextFile = `/tmp/cfn-reflection-context-${Date.now()}.json`;
    require('fs').writeFileSync(contextFile, JSON.stringify(options.context));
    args.push(`--context-file=${contextFile}`);

    const proc = spawn('claude-flow-novice', args, {
      cwd: path.join(__dirname, '../..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      // Cleanup temp file
      try {
        require('fs').unlinkSync(contextFile);
      } catch (e) {}

      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve({
            success: true,
            reflectionId: result.reflectionId,
            lessonCount: result.extracted_lessons?.length || 0,
            autoCurated: result.autoCurated || false,
            bulletIds: result.bulletIds || [],
          });
        } catch (error) {
          reject(new Error(`Failed to parse reflection output: ${error.message}`));
        }
      } else {
        reject(new Error(`Reflection failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn reflector: ${error.message}`));
    });
  });
}

/**
 * Store phase completion metrics
 */
async function storePhaseMetrics(data) {
  // Insert into SQLite metrics table
  console.log(`📊 Storing phase metrics for ${data.phase}...`);
  // Placeholder implementation
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
