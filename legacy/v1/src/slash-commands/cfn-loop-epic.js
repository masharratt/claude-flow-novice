#!/usr/bin/env node

/**
 * CFN Loop Epic Slash Command
 * Usage: /cfn-loop-epic <epic-directory-path>
 *
 * Executes a multi-phase epic through the CFN Loop with sprint support.
 * Auto-discovers phase files and epic-config.json, orchestrates phase-by-phase execution.
 *
 * Features:
 * - PhaseOrchestrator integration with sprint support
 * - Dependency graph resolution (topological ordering)
 * - Cross-phase validation
 * - Status updates in source files
 * - Autonomous phase progression
 * - IMMEDIATE transition between phases
 */

import { SlashCommand } from "../core/slash-command.js";
import * as fs from 'fs';
import * as path from 'path';
import { validateEpicDirectory } from '../utils/path-security.js';

export class CfnLoopEpicCommand extends SlashCommand {
  constructor() {
    super(
      "cfn-loop-epic",
      "Execute multi-phase epic through autonomous CFN Loop with sprint support"
    );
  }

  getUsage() {
    return "/cfn-loop-epic <epic-directory-path> [--max-loop2=10] [--max-loop3=10] [--consensus=0.90]";
  }

  getExamples() {
    return [
      '/cfn-loop-epic planning/example-epic/',
      '/cfn-loop-epic planning/auth-system-v2/ --consensus=0.95',
      '/cfn-loop-epic epics/microservices-migration/ --max-loop2=7',
    ];
  }

  async execute(args, context) {
    const { epicDir, maxLoop2, maxLoop3, consensusThreshold } = this.parseArgs(args);

    if (!epicDir) {
      return this.formatResponse({
        success: false,
        error: "Epic directory path required",
        usage: this.getUsage(),
        examples: this.getExamples(),
      });
    }

    const cwd = context.cwd || process.cwd();
    const fullPath = path.isAbsolute(epicDir) ? epicDir : path.join(cwd, epicDir);

    // SECURITY CVE-2025-004: Validate epic directory is within allowed paths
    try {
      validateEpicDirectory(fullPath);
    } catch (securityError) {
      return this.formatResponse({
        success: false,
        error: `Security validation failed: ${securityError.message}`,
        suggestions: [
          "Epic directory must be within allowed paths: planning/, docs/, epics/, phases/, sprints/",
          "Path traversal attacks (../../../../etc/passwd) are blocked",
          "Use relative paths from project root",
        ],
      });
    }

    if (!fs.existsSync(fullPath)) {
      return this.formatResponse({
        success: false,
        error: `Epic directory not found: ${epicDir}`,
        suggestions: [
          "Check directory path is correct",
          "Use path relative to project root",
          "Example: planning/example-epic/",
        ],
      });
    }

    if (!fs.statSync(fullPath).isDirectory()) {
      return this.formatResponse({
        success: false,
        error: `Path is not a directory: ${epicDir}`,
      });
    }

    try {
      const epic = this.discoverEpic(fullPath, cwd);

      console.log(`🔄 Starting CFN Loop Epic Execution`);
      console.log(`📋 Epic: ${epic.name}`);
      console.log(`🏗️ Phases: ${epic.phases.length}`);
      console.log(`🏃 Total Sprints: ${epic.totalSprints}`);

      const cfnPrompt = this.generateCfnLoopEpicPrompt({
        epic,
        epicDir,
        maxLoop2,
        maxLoop3,
        consensusThreshold,
      });

      return this.formatResponse({
        success: true,
        prompt: cfnPrompt,
        epic: epic,
        epicDir: epicDir,
        config: {
          maxLoop2,
          maxLoop3,
          consensusThreshold,
          phases: epic.phases.length,
          sprints: epic.totalSprints,
        },
        memoryNamespace: `cfn-loop-epic/${epic.id}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return this.formatResponse({
        success: false,
        error: `Failed to discover epic: ${error.message}`,
      });
    }
  }

  parseArgs(args) {
    const options = {
      maxLoop2: 10, // Default 10 iterations for Loop 2
      maxLoop3: 10,
      consensusThreshold: 0.90,
    };

    const dirParts = [];

    for (const arg of args) {
      if (arg.startsWith("--max-loop2=")) {
        options.maxLoop2 = parseInt(arg.split("=")[1]) || 10;
      } else if (arg.startsWith("--max-loop3=")) {
        options.maxLoop3 = parseInt(arg.split("=")[1]) || 10;
      } else if (arg.startsWith("--consensus=")) {
        options.consensusThreshold = parseFloat(arg.split("=")[1]) || 0.90;
      } else {
        dirParts.push(arg);
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
      epicDir: dirParts.join(" "),
      ...options,
    };
  }

  discoverEpic(epicPath, cwd) {
    const epic = {
      id: '',
      name: '',
      description: '',
      status: 'not_started',
      owner: '',
      estimatedDuration: '',
      phases: [],
      totalSprints: 0,
      dependencies: [],
      acceptanceCriteria: [],
      configFile: null,
      overviewFile: null,
    };

    // Look for epic-config.json
    const configPath = path.join(epicPath, 'epic-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      epic.id = config.epicId || path.basename(epicPath);
      epic.name = config.name || epic.id;
      epic.description = config.description || '';
      epic.status = config.status || 'not_started';
      epic.owner = config.owner || '';
      epic.estimatedDuration = config.estimatedDuration || '';
      epic.acceptanceCriteria = config.epicAcceptanceCriteria || [];
      epic.configFile = path.relative(cwd, configPath);

      // Parse phases from config
      if (config.phases && Array.isArray(config.phases)) {
        epic.phases = config.phases.map(p => ({
          id: p.phaseId,
          name: p.name,
          description: p.description,
          file: p.file,
          status: p.status || 'not_started',
          dependencies: p.dependencies || [],
          estimatedDuration: p.estimatedDuration || '',
          sprints: p.sprints || [],
        }));

        // Count total sprints
        epic.totalSprints = epic.phases.reduce((sum, p) => sum + (p.sprints?.length || 0), 0);
      }

      // Look for overview file
      if (config.overviewFile) {
        const overviewPath = path.join(cwd, config.overviewFile);
        if (fs.existsSync(overviewPath)) {
          epic.overviewFile = config.overviewFile;
        }
      }
    } else {
      // Auto-discover phase files
      epic.id = path.basename(epicPath);
      epic.name = epic.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const files = fs.readdirSync(epicPath);
      const phaseFiles = files.filter(f =>
        f.startsWith('phase-') && (f.endsWith('.md') || f.endsWith('.txt'))
      ).sort();

      epic.phases = phaseFiles.map((file, idx) => {
        const fullFilePath = path.join(epicPath, file);
        const content = fs.readFileSync(fullFilePath, 'utf-8');
        const phase = this.parsePhaseFileBasic(content, file);

        return {
          id: phase.id || `phase-${idx + 1}`,
          name: phase.name || file.replace(/\.\w+$/, '').replace(/-/g, ' '),
          description: phase.description || '',
          file: path.relative(cwd, fullFilePath),
          status: phase.status || 'not_started',
          dependencies: phase.dependencies || [],
          estimatedDuration: phase.estimatedDuration || '',
          sprints: phase.sprints || [],
        };
      });

      // Count sprints
      epic.totalSprints = epic.phases.reduce((sum, p) => sum + (p.sprints?.length || 0), 0);
    }

    // Build dependency graph
    epic.dependencies = this.buildDependencyGraph(epic.phases);

    return epic;
  }

  parsePhaseFileBasic(content, fileName) {
    const phase = {
      id: '',
      name: '',
      description: '',
      status: 'not_started',
      dependencies: [],
      estimatedDuration: '',
      sprints: [],
    };

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('# Phase')) {
        phase.name = line.replace(/^#\s*Phase\s*\d*:\s*/i, '').trim();
      } else if (line.startsWith('**Phase ID**:')) {
        phase.id = line.replace(/\*\*Phase ID\*\*:\s*`?/i, '').replace(/`.*$/, '').trim();
      } else if (line.startsWith('**Dependencies**:')) {
        const depMatch = line.match(/phase-[\w-]+/gi);
        if (depMatch) {
          phase.dependencies = depMatch;
        }
      } else if (line.startsWith('**Estimated Duration**:')) {
        phase.estimatedDuration = line.replace(/\*\*Estimated Duration\*\*:\s*/i, '').trim();
      } else if (line.startsWith('**Status**:')) {
        if (line.includes('❌')) phase.status = 'not_started';
        else if (line.includes('✅')) phase.status = 'complete';
        else if (line.includes('🔄')) phase.status = 'in_progress';
      }
    }

    // Extract sprints
    const sprintMatches = content.match(/###\s*Sprint\s+(\d+\.\d+):/gi);
    if (sprintMatches) {
      phase.sprints = sprintMatches.map(m => ({
        id: `sprint-${m.match(/\d+\.\d+/)[0]}`,
        name: '',
      }));
    }

    return phase;
  }

  buildDependencyGraph(phases) {
    const graph = [];

    for (const phase of phases) {
      if (phase.dependencies && phase.dependencies.length > 0) {
        for (const dep of phase.dependencies) {
          graph.push({ from: phase.id, to: dep });
        }
      }
    }

    return graph;
  }

  generateTopologicalOrder(phases, dependencies) {
    const graph = new Map();
    const inDegree = new Map();

    // Initialize graph
    for (const phase of phases) {
      graph.set(phase.id, []);
      inDegree.set(phase.id, 0);
    }

    // Build graph
    for (const dep of dependencies) {
      if (graph.has(dep.to)) {
        graph.get(dep.to).push(dep.from);
        inDegree.set(dep.from, (inDegree.get(dep.from) || 0) + 1);
      }
    }

    // Topological sort
    const queue = [];
    const order = [];

    for (const [phaseId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(phaseId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      order.push(current);

      for (const dependent of graph.get(current) || []) {
        inDegree.set(dependent, inDegree.get(dependent) - 1);
        if (inDegree.get(dependent) === 0) {
          queue.push(dependent);
        }
      }
    }

    return order;
  }

  generateCfnLoopEpicPrompt(options) {
    const { epic, epicDir, maxLoop2, maxLoop3, consensusThreshold } = options;

    const topologicalOrder = this.generateTopologicalOrder(epic.phases, epic.dependencies);

    return `
🔄 **AUTONOMOUS CFN LOOP - EPIC EXECUTION**

**Epic**: ${epic.name}
**Epic ID**: ${epic.id}
**Epic Directory**: ${epicDir}
${epic.configFile ? `**Config File**: ${epic.configFile}` : ''}
${epic.overviewFile ? `**Overview File**: ${epic.overviewFile}` : ''}
**Total Phases**: ${epic.phases.length}
**Total Sprints**: ${epic.totalSprints}
**Estimated Duration**: ${epic.estimatedDuration}
**Owner**: ${epic.owner}

🚨 **CRITICAL: AUTONOMOUS MULTI-PHASE PROGRESSION**

**Configuration:**
- Loop 2 Max Iterations (Consensus): ${maxLoop2}
- Loop 3 Max Subtask Iterations: ${maxLoop3}
- Consensus Threshold: ${consensusThreshold * 100}%
- Phase-Level Validation: ENABLED
- Sprint-Level Validation: ENABLED
- Cross-Phase Dependencies: AUTO-RESOLVED
- Topological Ordering: ENABLED
- Status Updates: AUTO-WRITTEN to source files
- Circuit Breaker: ENABLED

**AUTONOMOUS EXECUTION RULES:**
• Phase fails → IMMEDIATE retry with feedback (NO approval)
• Phase completes → IMMEDIATE next phase (NO approval)
• Dependencies unsatisfied → WAIT for dependency completion
• All phases complete → IMMEDIATE epic validation
• Max iterations → AUTONOMOUS extension and retry

---

## **EPIC DESCRIPTION**

${epic.description}

---

## **PHASE EXECUTION ORDER (Topological)**

${topologicalOrder.map((phaseId, idx) => {
  const phase = epic.phases.find(p => p.id === phaseId);
  return `${idx + 1}. **${phase.name}** (${phase.id})
   - Dependencies: ${phase.dependencies.length > 0 ? phase.dependencies.join(', ') : 'None'}
   - Sprints: ${phase.sprints.length}
   - Duration: ${phase.estimatedDuration}
   - Status: ${phase.status}`;
}).join('\n')}

---

## **PHASE DETAILS**

${epic.phases.map((phase, idx) => `
### Phase ${idx + 1}/${epic.phases.length}: ${phase.name}

**Phase ID**: ${phase.id}
**File**: ${phase.file}
**Status**: ${phase.status}
**Dependencies**: ${phase.dependencies.length > 0 ? phase.dependencies.join(', ') : 'None'}
**Sprints**: ${phase.sprints.length}
**Estimated Duration**: ${phase.estimatedDuration}

**Description**: ${phase.description}

${phase.sprints.length > 0 ? `**Sprint Breakdown**:
${phase.sprints.map((s, i) => `  ${i + 1}. ${s.id}: ${s.name || 'See phase file'}`).join('\n')}` : ''}

---
`).join('\n')}

---

## **EXECUTION PROTOCOL**

### **STEP 1: Initialize Epic-Level Swarm**

\`\`\`javascript
// Initialize swarm for entire epic
mcp__claude-flow-novice__swarm_init({
  topology: "hierarchical",
  maxAgents: 20,
  strategy: "adaptive"
});

// Store epic context in memory
mcp__claude-flow-novice__memory_store({
  key: "cfn-loop-epic/${epic.id}/epic-context",
  value: {
    epicId: "${epic.id}",
    epicName: "${epic.name}",
    totalPhases: ${epic.phases.length},
    totalSprints: ${epic.totalSprints},
    topologicalOrder: ${JSON.stringify(topologicalOrder)},
    startTime: new Date().toISOString()
  },
  namespace: "swarm"
});
\`\`\`

---

### **STEP 2: Execute Phases in Topological Order**

${topologicalOrder.map((phaseId, idx) => {
  const phase = epic.phases.find(p => p.id === phaseId);
  return `
#### **Phase ${idx + 1}/${epic.phases.length}: ${phase.name}**

**Dependency Check:**

\`\`\`javascript
// Check if all dependencies satisfied
const dependencies = ${JSON.stringify(phase.dependencies)};
const unsatisfiedDeps = [];

for (const depId of dependencies) {
  const depResult = await mcp__claude-flow-novice__memory_search({
    pattern: \`cfn-loop-epic/${epic.id}/\${depId}/status\`,
    namespace: "swarm"
  });

  if (!depResult || depResult.status !== "complete") {
    unsatisfiedDeps.push(depId);
  }
}

if (unsatisfiedDeps.length > 0) {
  console.log(\`⏸️ Phase ${phase.id} WAITING for: \${unsatisfiedDeps.join(', ')}\`);
  // Skip to next phase check - dependencies will be resolved
} else {
  console.log(\`✅ All dependencies satisfied for Phase ${phase.id}\`);
  // PROCEED with phase execution
}
\`\`\`

**Execute Phase with Sprint Support:**

\`\`\`javascript
// Use /cfn-loop-sprints for this phase
console.log(\`🚀 IMMEDIATELY executing Phase ${phase.id} with ${phase.sprints.length} sprints\`);

// Call sprint orchestrator (simulated)
await executeCfnLoopSprints({
  phaseFile: "${phase.file}",
  maxLoop2: ${maxLoop2},
  maxLoop3: ${maxLoop3},
  consensusThreshold: ${consensusThreshold}
});

// On phase completion, store result
mcp__claude-flow-novice__memory_store({
  key: "cfn-loop-epic/${epic.id}/${phase.id}/status",
  value: "complete",
  namespace: "swarm"
});

console.log(\`✅ Phase ${phase.id} COMPLETE - IMMEDIATELY proceeding to Phase ${idx + 2}/${epic.phases.length}\`);
// IMMEDIATELY proceed to next phase (NO approval)
\`\`\`

---
`;
}).join('\n')}

---

### **STEP 3: Epic Completion Validation**

**All Phases Complete - Epic-Level Consensus:**

\`\`\`javascript
console.log(\`
✅ **ALL PHASES COMPLETE - EPIC VALIDATION**

**Epic**: ${epic.name}
**Phases Completed**: ${epic.phases.length}/${epic.phases.length}
**Total Sprints**: ${epic.totalSprints}
\`);

// Spawn epic-level validators
Task("epic-validator-1", "Comprehensive epic review for ${epic.name}", "reviewer")
Task("epic-validator-2", "Cross-phase integration validation", "system-architect")
Task("epic-validator-3", "Security audit for entire epic", "security-specialist")
Task("epic-validator-4", "Performance benchmarking across all phases", "perf-analyzer")

// Epic-level consensus
const epicVotes = [/* collect votes */];
const epicApprovalRate = epicVotes.filter(v => v.vote === "approve").length / epicVotes.length;

if (epicApprovalRate >= ${consensusThreshold}) {
  console.log("✅ **EPIC ${epic.id} COMPLETE**");

  // Update epic status in config file
  ${epic.configFile ? `
  const configContent = fs.readFileSync("${epic.configFile}", "utf-8");
  const config = JSON.parse(configContent);
  config.status = "complete";
  fs.writeFileSync("${epic.configFile}", JSON.stringify(config, null, 2));
  ` : ''}

  console.log(\`
**Epic Acceptance Criteria:**
${epic.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

**Next Steps:**
1. Review epic deliverables
2. Prepare production deployment
3. Update project roadmap
  \`);
} else {
  console.log("❌ Epic validation FAILED - Reviewing failed phases");
  // Identify and retry failed phases
}
\`\`\`

---

## **DEPENDENCY GRAPH**

${epic.dependencies.length > 0 ? `
\`\`\`
${epic.dependencies.map(d => `${d.from} → ${d.to}`).join('\n')}
\`\`\`
` : 'No cross-phase dependencies'}

---

## **EXECUTION CHECKLIST**

**Before Starting:**
- [ ] Epic directory loaded: ${epicDir}
${epic.configFile ? `- [ ] Config file parsed: ${epic.configFile}` : ''}
- [ ] ${epic.phases.length} phases identified
- [ ] ${epic.totalSprints} total sprints counted
- [ ] Topological order computed
- [ ] Swarm initialized
- [ ] Epic context stored

**For Each Phase:**
- [ ] Dependencies satisfied
- [ ] Sprint execution completed
- [ ] Phase-level validation passed
- [ ] Status updated in phase file
- [ ] Result stored in memory
- [ ] IMMEDIATE transition to next phase

**Epic Completion:**
- [ ] All phases complete
- [ ] Epic-level validation passed
- [ ] Config file status updated
- [ ] Acceptance criteria validated
- [ ] Next steps identified

---

🚀 **EXECUTE AUTONOMOUS EPIC PROGRESSION NOW**

IMMEDIATELY begin Epic-level swarm initialization and proceed autonomously through all phases.

⚠️ CRITICAL: This is AUTONOMOUS EPIC EXECUTION. NO approval between phases. Self-correct until epic complete.
`;
  }
}

export default CfnLoopEpicCommand;
