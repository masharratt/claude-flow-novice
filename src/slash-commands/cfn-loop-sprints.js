#!/usr/bin/env node

/**
 * CFN Loop Sprints Slash Command
 * Usage: /cfn-loop-sprints <phase-file-path>
 *
 * Executes a single phase with multiple sprints through the CFN Loop.
 * Parses sprint definitions from phase file and orchestrates sprint-by-sprint execution.
 *
 * Features:
 * - SprintOrchestrator integration
 * - Sprint dependency resolution
 * - Cross-sprint validation
 * - Status updates in source file
 * - Autonomous sprint progression
 * - IMMEDIATE retry on sprint failure
 */

import { SlashCommand } from "../core/slash-command.js";
import * as fs from 'fs';
import * as path from 'path';

export class CfnLoopSprintsCommand extends SlashCommand {
  constructor() {
    super(
      "cfn-loop-sprints",
      "Execute single phase with sprints through autonomous CFN Loop"
    );
  }

  getUsage() {
    return "/cfn-loop-sprints <phase-file-path> [--max-loop2=10] [--max-loop3=10] [--consensus=0.90]";
  }

  getExamples() {
    return [
      '/cfn-loop-sprints planning/example-epic/phase-1-core-auth.md',
      '/cfn-loop-sprints planning/auth-epic/phase-2-rbac.md --consensus=0.95',
      '/cfn-loop-sprints phase-3-oauth.md --max-loop2=7',
    ];
  }

  async execute(args, context) {
    const { phaseFile, maxLoop2, maxLoop3, consensusThreshold } = this.parseArgs(args);

    if (!phaseFile) {
      return this.formatResponse({
        success: false,
        error: "Phase file path required",
        usage: this.getUsage(),
        examples: this.getExamples(),
      });
    }

    const cwd = context.cwd || process.cwd();
    const fullPath = path.isAbsolute(phaseFile) ? phaseFile : path.join(cwd, phaseFile);

    if (!fs.existsSync(fullPath)) {
      return this.formatResponse({
        success: false,
        error: `Phase file not found: ${phaseFile}`,
        suggestions: [
          "Check file path is correct",
          "Use path relative to project root",
          "Example: planning/example-epic/phase-1-core-auth.md",
        ],
      });
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const phase = this.parsePhaseFile(content, fullPath);

      console.log(`🔄 Starting CFN Loop Sprint Execution`);
      console.log(`📋 Phase: ${phase.name}`);
      console.log(`🏃 Sprints: ${phase.sprints.length}`);

      const cfnPrompt = this.generateCfnLoopSprintsPrompt({
        phase,
        phaseFile,
        maxLoop2,
        maxLoop3,
        consensusThreshold,
      });

      return this.formatResponse({
        success: true,
        prompt: cfnPrompt,
        phase: phase,
        phaseFile: phaseFile,
        config: {
          maxLoop2,
          maxLoop3,
          consensusThreshold,
          sprints: phase.sprints.length,
        },
        memoryNamespace: `cfn-loop-sprints/${phase.id}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return this.formatResponse({
        success: false,
        error: `Failed to parse phase file: ${error.message}`,
      });
    }
  }

  parseArgs(args) {
    const options = {
      maxLoop2: 10, // Default 10 iterations for Loop 2
      maxLoop3: 10,
      consensusThreshold: 0.90,
    };

    const fileParts = [];

    for (const arg of args) {
      if (arg.startsWith("--max-loop2=")) {
        options.maxLoop2 = parseInt(arg.split("=")[1]) || 10;
      } else if (arg.startsWith("--max-loop3=")) {
        options.maxLoop3 = parseInt(arg.split("=")[1]) || 10;
      } else if (arg.startsWith("--consensus=")) {
        options.consensusThreshold = parseFloat(arg.split("=")[1]) || 0.90;
      } else {
        fileParts.push(arg);
      }
    }

    // CFN-2025-001: Validate iteration limits
    if (options.maxLoop2 < 1 || options.maxLoop2 > 100) {
      throw new Error("--max-loop2 must be between 1 and 100");
    }
    if (options.maxLoop3 < 1 || options.maxLoop3 > 100) {
      throw new Error("--max-loop3 must be between 1 and 100");
    }

    return {
      phaseFile: fileParts.join(" "),
      ...options,
    };
  }

  parsePhaseFile(content, filePath) {
    const phase = {
      id: '',
      name: '',
      description: '',
      sprints: [],
      dependencies: [],
      estimatedDuration: '',
      acceptanceCriteria: [],
      file: filePath,
    };

    const lines = content.split('\n');

    // Extract phase metadata
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('# Phase')) {
        phase.name = line.replace(/^#\s*Phase\s*\d*:\s*/i, '').trim();
      } else if (line.startsWith('**Phase ID**:')) {
        phase.id = line.replace(/\*\*Phase ID\*\*:\s*`?/i, '').replace(/`.*$/, '').trim();
      } else if (line.startsWith('**Estimated Duration**:')) {
        phase.estimatedDuration = line.replace(/\*\*Estimated Duration\*\*:\s*/i, '').trim();
      } else if (line.startsWith('## Phase Description')) {
        const descLines = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('##')) {
          descLines.push(lines[i]);
          i++;
        }
        phase.description = descLines.join('\n').trim();
      }
    }

    // Extract sprints
    const sprintRegex = /###\s*Sprint\s+(\d+\.\d+):\s*(.+)/gi;
    let match;
    let currentSprint = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const sprintMatch = line.match(/###\s*Sprint\s+(\d+\.\d+):\s*(.+)/i);
      if (sprintMatch) {
        if (currentSprint) {
          phase.sprints.push(currentSprint);
        }

        currentSprint = {
          id: `sprint-${sprintMatch[1]}`,
          name: sprintMatch[2].trim(),
          status: 'not_started',
          duration: '',
          dependencies: [],
          tasks: [],
          acceptanceCriteria: [],
          deliverables: [],
        };

        // Parse sprint details
        i++;
        while (i < lines.length && !lines[i].startsWith('###') && !lines[i].startsWith('##')) {
          const detailLine = lines[i].trim();

          if (detailLine.startsWith('**Status**:')) {
            const statusMatch = detailLine.match(/❌\s*Not Started|✅\s*Complete|🔄\s*In Progress/i);
            if (statusMatch) {
              if (statusMatch[0].includes('❌')) currentSprint.status = 'not_started';
              else if (statusMatch[0].includes('✅')) currentSprint.status = 'complete';
              else if (statusMatch[0].includes('🔄')) currentSprint.status = 'in_progress';
            }
          } else if (detailLine.startsWith('**Duration**:')) {
            currentSprint.duration = detailLine.replace(/\*\*Duration\*\*:\s*/i, '').trim();
          } else if (detailLine.startsWith('**Dependencies**:')) {
            const depMatch = detailLine.match(/Sprint\s+(\d+\.\d+)/gi);
            if (depMatch) {
              currentSprint.dependencies = depMatch.map(d => `sprint-${d.replace(/Sprint\s+/i, '')}`);
            }
          } else if (detailLine.match(/^\d+\.\s+/)) {
            // Task or acceptance criteria
            const task = detailLine.replace(/^\d+\.\s+/, '');
            if (lines[i - 1] && lines[i - 1].includes('**Tasks**:')) {
              currentSprint.tasks.push(task);
            } else if (lines[i - 1] && lines[i - 1].includes('**Acceptance Criteria**:')) {
              currentSprint.acceptanceCriteria.push(task);
            }
          } else if (detailLine.startsWith('-') && lines[i - 1] && lines[i - 1].includes('**Deliverables**:')) {
            currentSprint.deliverables.push(detailLine.replace(/^-\s*/, ''));
          }

          i++;
        }
        i--; // Step back for outer loop
      }
    }

    if (currentSprint) {
      phase.sprints.push(currentSprint);
    }

    // If no sprints found, create a single sprint from the entire phase
    if (phase.sprints.length === 0) {
      phase.sprints.push({
        id: `sprint-${phase.id}-1`,
        name: phase.name,
        status: 'not_started',
        duration: phase.estimatedDuration,
        dependencies: [],
        tasks: [],
        acceptanceCriteria: phase.acceptanceCriteria,
        deliverables: [],
      });
    }

    return phase;
  }

  generateCfnLoopSprintsPrompt(options) {
    const { phase, phaseFile, maxLoop2, maxLoop3, consensusThreshold } = options;

    return `
🔄 **AUTONOMOUS CFN LOOP - SPRINT EXECUTION**

**Phase**: ${phase.name}
**Phase ID**: ${phase.id}
**Phase File**: ${phaseFile}
**Total Sprints**: ${phase.sprints.length}
**Estimated Duration**: ${phase.estimatedDuration}

🚨 **CRITICAL: AUTONOMOUS SPRINT-BY-SPRINT PROGRESSION**

**Configuration:**
- Loop 2 Max Iterations (Consensus): ${maxLoop2}
- Loop 3 Max Subtask Iterations: ${maxLoop3}
- Consensus Threshold: ${consensusThreshold * 100}%
- Sprint-Level Validation: ENABLED
- Cross-Sprint Dependencies: AUTO-RESOLVED
- Status Updates: AUTO-WRITTEN to source file
- Circuit Breaker: ENABLED

**AUTONOMOUS EXECUTION RULES:**
• Sprint fails → IMMEDIATE retry with feedback (NO approval)
• Sprint completes → IMMEDIATE next sprint (NO approval)
• Dependencies unsatisfied → WAIT for dependency completion
• All sprints complete → IMMEDIATE phase validation
• Max iterations → AUTONOMOUS extension and retry

---

## **PHASE DESCRIPTION**

${phase.description}

---

## **SPRINT BREAKDOWN**

${phase.sprints.map((sprint, idx) => `
### Sprint ${idx + 1}/${phase.sprints.length}: ${sprint.name}

**Sprint ID**: ${sprint.id}
**Status**: ${sprint.status}
**Duration**: ${sprint.duration}
**Dependencies**: ${sprint.dependencies.length > 0 ? sprint.dependencies.join(', ') : 'None'}

**Tasks**:
${sprint.tasks.map((t, i) => `${i + 1}. ${t}`).join('\n') || 'See phase file for details'}

**Acceptance Criteria**:
${sprint.acceptanceCriteria.map((ac, i) => `- ${ac}`).join('\n')}

**Deliverables**:
${sprint.deliverables.map(d => `- ${d}`).join('\n') || 'See acceptance criteria'}

---
`).join('\n')}

---

## **EXECUTION PROTOCOL**

### **STEP 1: Initialize Phase-Level Swarm**

\`\`\`javascript
// Initialize swarm for entire phase
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 12,
  strategy: "balanced"
});

// Store phase context in memory
mcp__claude-flow-novice__memory_store({
  key: "cfn-loop-sprints/${phase.id}/phase-context",
  value: {
    phaseId: "${phase.id}",
    phaseName: "${phase.name}",
    totalSprints: ${phase.sprints.length},
    startTime: new Date().toISOString()
  },
  namespace: "swarm"
});
\`\`\`

---

### **STEP 2: Execute Sprints Sequentially with CFN Loop**

${phase.sprints.map((sprint, idx) => `
#### **Sprint ${idx + 1}: ${sprint.name}**

**Dependency Check:**

\`\`\`javascript
// Check if dependencies satisfied
const dependencies = ${JSON.stringify(sprint.dependencies)};
const unsatisfiedDeps = [];

for (const depId of dependencies) {
  const depResult = await mcp__claude-flow-novice__memory_search({
    pattern: \`cfn-loop-sprints/${phase.id}/\${depId}/status\`,
    namespace: "swarm"
  });

  if (!depResult || depResult.status !== "complete") {
    unsatisfiedDeps.push(depId);
  }
}

if (unsatisfiedDeps.length > 0) {
  console.log(\`⏸️ Sprint ${sprint.id} WAITING for: \${unsatisfiedDeps.join(', ')}\`);
  // Skip to next iteration - dependencies will be resolved
} else {
  console.log(\`✅ All dependencies satisfied for Sprint ${sprint.id}\`);
  // PROCEED with sprint execution
}
\`\`\`

**Update Source File Status:**

\`\`\`javascript
// Mark sprint as in_progress in phase file
const phaseContent = fs.readFileSync("${phaseFile}", "utf-8");
const updatedContent = phaseContent.replace(
  /###\\s*Sprint\\s+${sprint.id.replace('sprint-', '')}:[^]*?\\*\\*Status\\*\\*:\\s*❌\\s*Not Started/,
  (match) => match.replace("❌ Not Started", "🔄 In Progress")
);
fs.writeFileSync("${phaseFile}", updatedContent);
\`\`\`

**Loop 3: Primary Swarm for Sprint ${sprint.id}**

\`\`\`javascript
// Spawn agents for sprint tasks
Task("coder-sprint-${idx + 1}", "Implement tasks for ${sprint.name}: ${sprint.tasks.join(', ')}", "coder")
Task("tester-sprint-${idx + 1}", "Write tests for ${sprint.name} with ≥85% coverage", "tester")
Task("reviewer-sprint-${idx + 1}", "Review code quality for ${sprint.name}", "reviewer")

// Self-validation gate
const confidenceScores = [/* collect from agents */];
const avgConfidence = calculateAverage(confidenceScores);

if (avgConfidence >= 0.75) {
  console.log("✅ Sprint ${sprint.id} self-validation PASSED");
  // IMMEDIATELY proceed to Loop 2
} else {
  console.log("⚠️ Sprint ${sprint.id} self-validation FAILED - IMMEDIATE retry");
  // IMMEDIATELY relaunch Loop 3 (NO approval)
}
\`\`\`

**Loop 2: Consensus Validation for Sprint ${sprint.id}**

\`\`\`javascript
// Spawn validators
Task("validator-1-sprint-${idx + 1}", "Validate ${sprint.name} against acceptance criteria: ${sprint.acceptanceCriteria.join(', ')}", "reviewer")
Task("validator-2-sprint-${idx + 1}", "Security and performance audit for ${sprint.name}", "security-specialist")

// Consensus voting
const validatorVotes = [/* collect votes */];
const approvalRate = validatorVotes.filter(v => v.vote === "approve").length / validatorVotes.length;

if (approvalRate >= ${consensusThreshold}) {
  console.log("✅ Sprint ${sprint.id} CONSENSUS PASSED");

  // Update status to complete
  const phaseContent = fs.readFileSync("${phaseFile}", "utf-8");
  const updatedContent = phaseContent.replace(
    /###\\s*Sprint\\s+${sprint.id.replace('sprint-', '')}:[^]*?\\*\\*Status\\*\\*:\\s*🔄\\s*In Progress/,
    (match) => match.replace("🔄 In Progress", "✅ Complete")
  );
  fs.writeFileSync("${phaseFile}", updatedContent);

  // Store sprint result
  mcp__claude-flow-novice__memory_store({
    key: "cfn-loop-sprints/${phase.id}/${sprint.id}/status",
    value: "complete",
    namespace: "swarm"
  });

  console.log("🚀 IMMEDIATELY proceeding to Sprint ${idx + 2}/${phase.sprints.length}");
  // IMMEDIATELY proceed to next sprint (NO approval)
} else {
  console.log("❌ Sprint ${sprint.id} CONSENSUS FAILED - IMMEDIATE retry");

  // Collect feedback
  const feedback = validatorVotes.filter(v => v.vote === "reject").map(v => v.reason);

  // IMMEDIATELY return to Loop 3 with feedback (NO approval)
}
\`\`\`

---
`).join('\n')}

---

### **STEP 3: Phase Completion Validation**

**All Sprints Complete - Phase-Level Consensus:**

\`\`\`javascript
console.log(\`
✅ **ALL SPRINTS COMPLETE - PHASE VALIDATION**

**Phase**: ${phase.name}
**Sprints Completed**: ${phase.sprints.length}/${phase.sprints.length}
\`);

// Spawn phase-level validators
Task("phase-validator-1", "Comprehensive phase review for ${phase.name}", "reviewer")
Task("phase-validator-2", "Integration validation across all sprints", "system-architect")
Task("phase-validator-3", "Security audit for entire phase", "security-specialist")

// Phase-level consensus
const phaseVotes = [/* collect votes */];
const phaseApprovalRate = phaseVotes.filter(v => v.vote === "approve").length / phaseVotes.length;

if (phaseApprovalRate >= ${consensusThreshold}) {
  console.log("✅ **PHASE ${phase.id} COMPLETE**");

  // Update phase status in file
  const phaseContent = fs.readFileSync("${phaseFile}", "utf-8");
  const updatedContent = phaseContent.replace(
    /\\*\\*Status\\*\\*:\\s*❌\\s*Not Started/,
    "**Status**: ✅ Complete"
  );
  fs.writeFileSync("${phaseFile}", updatedContent);

  console.log(\`
**Next Steps:**
1. Review phase deliverables
2. Update epic status
3. Begin next phase (if dependencies satisfied)
  \`);
} else {
  console.log("❌ Phase validation FAILED - Reviewing failed sprints");
  // Identify and retry failed sprints
}
\`\`\`

---

## **EXECUTION CHECKLIST**

**Before Starting:**
- [ ] Phase file loaded: ${phaseFile}
- [ ] ${phase.sprints.length} sprints identified
- [ ] Swarm initialized
- [ ] Phase context stored

**For Each Sprint:**
- [ ] Dependencies satisfied
- [ ] Status updated to in_progress
- [ ] Primary swarm executed
- [ ] Self-validation passed
- [ ] Consensus validation passed
- [ ] Status updated to complete
- [ ] Result stored in memory
- [ ] IMMEDIATE transition to next sprint

**Phase Completion:**
- [ ] All sprints complete
- [ ] Phase-level validation passed
- [ ] Source file status updated
- [ ] Next steps identified

---

🚀 **EXECUTE AUTONOMOUS SPRINT PROGRESSION NOW**

IMMEDIATELY begin Phase-level swarm initialization and proceed autonomously through all sprints.

⚠️ CRITICAL: This is AUTONOMOUS SPRINT EXECUTION. NO approval between sprints. Self-correct until phase complete.
`;
  }
}

export default CfnLoopSprintsCommand;
