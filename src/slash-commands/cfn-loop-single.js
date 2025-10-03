#!/usr/bin/env node

/**
 * CFN Loop Single Task Slash Command
 * Usage: /cfn-loop-single <task description or file reference>
 *
 * Executes a single task through the CFN Loop without sprint/phase structure.
 * Supports three input formats:
 * 1. Natural language: /cfn-loop-single "Implement JWT authentication"
 * 2. Full file reference: /cfn-loop-single planning/tasks/implement-jwt.md
 * 3. Partial file reference: /cfn-loop-single implement-jwt (auto-searches planning/)
 *
 * Features:
 * - Direct CFNLoopIntegrator execution
 * - Autonomous self-correction (no approval prompts)
 * - IMMEDIATE retry on failure
 * - Circuit breaker protection
 * - Memory coordination
 */

import { SlashCommand } from "../core/slash-command.js";
import * as fs from 'fs';
import * as path from 'path';

export class CfnLoopSingleCommand extends SlashCommand {
  constructor() {
    super(
      "cfn-loop-single",
      "Execute single task through autonomous CFN Loop (natural language, file path, or partial reference)"
    );
  }

  getUsage() {
    return "/cfn-loop-single <task description or file reference> [--max-loop2=10] [--max-loop3=10] [--consensus=0.90] [--confidence=0.75]";
  }

  getExamples() {
    return [
      '/cfn-loop-single "Implement JWT authentication with bcrypt"',
      '/cfn-loop-single planning/tasks/auth-implementation.md',
      '/cfn-loop-single auth-implementation --max-loop2=7',
      '/cfn-loop-single "Fix security vulnerability in login endpoint" --consensus=0.95',
    ];
  }

  async execute(args, context) {
    // parseArgs can throw validation errors - let them propagate
    const { taskInput, maxLoop2, maxLoop3, consensusThreshold, confidenceThreshold } = this.parseArgs(args);

    if (!taskInput) {
      return this.formatResponse({
        success: false,
        error: "Task description or file reference required",
        usage: this.getUsage(),
        examples: this.getExamples(),
      });
    }

    // Determine input type and extract task description
    const taskResolution = await this.resolveTaskInput(taskInput, context);

    if (!taskResolution.success) {
      return this.formatResponse({
        success: false,
        error: taskResolution.error,
        suggestions: taskResolution.suggestions,
      });
    }

    const { taskDescription, sourceFile, agents, validators } = taskResolution;

    console.log(`🔄 Starting CFN Loop Single Task Execution`);
    console.log(`📋 Task: ${taskDescription.substring(0, 100)}...`);
    if (sourceFile) {
      console.log(`📁 Source: ${sourceFile}`);
    }

    const cfnPrompt = this.generateCfnLoopSinglePrompt({
      taskDescription,
      sourceFile,
      agents,
      validators,
      maxLoop2,
      maxLoop3,
      consensusThreshold,
      confidenceThreshold,
    });

    return this.formatResponse({
      success: true,
      prompt: cfnPrompt,
      task: taskDescription,
      sourceFile: sourceFile,
      config: {
        maxLoop2,
        maxLoop3,
        consensusThreshold,
        confidenceThreshold,
        agents: agents.length,
        validators: validators.length,
      },
      memoryNamespace: `cfn-loop-single/${this.generateTaskId(taskDescription)}`,
      timestamp: new Date().toISOString(),
    });
  }

  parseArgs(args) {
    const options = {
      maxLoop2: 10, // Updated from 5 to 10 iterations for consistency
      maxLoop3: 10,
      consensusThreshold: 0.90,
      confidenceThreshold: 0.75,
    };

    const taskParts = [];

    for (const arg of args) {
      if (arg.startsWith("--max-loop2=")) {
        const value = parseInt(arg.split("=")[1]);
        options.maxLoop2 = isNaN(value) ? 10 : value;
      } else if (arg.startsWith("--max-loop3=")) {
        const value = parseInt(arg.split("=")[1]);
        options.maxLoop3 = isNaN(value) ? 10 : value;
      } else if (arg.startsWith("--consensus=")) {
        const value = parseFloat(arg.split("=")[1]);
        options.consensusThreshold = isNaN(value) ? 0.90 : value;
      } else if (arg.startsWith("--confidence=")) {
        const value = parseFloat(arg.split("=")[1]);
        options.confidenceThreshold = isNaN(value) ? 0.75 : value;
      } else {
        taskParts.push(arg);
      }
    }

    // CFN-2025-001: Validate iteration limits
    if (options.maxLoop2 < 1 || options.maxLoop2 > 100) {
      throw new Error("--max-loop2 must be between 1 and 100");
    }
    if (options.maxLoop3 < 1 || options.maxLoop3 > 100) {
      throw new Error("--max-loop3 must be between 1 and 100");
    }

    // Validate thresholds
    if (options.consensusThreshold < 0.5 || options.consensusThreshold > 1.0) {
      throw new Error("--consensus must be between 0.5 and 1.0");
    }
    if (options.confidenceThreshold < 0.5 || options.confidenceThreshold > 1.0) {
      throw new Error("--confidence must be between 0.5 and 1.0");
    }

    return {
      taskInput: taskParts.join(" "),
      ...options,
    };
  }

  async resolveTaskInput(input, context) {
    // Check if input looks like a file path
    const isFilePath = input.includes('/') || input.includes('\\') || input.endsWith('.md');

    if (isFilePath) {
      return await this.resolveFileReference(input, context);
    }

    // Check if input is a partial reference (single word/phrase without path separators)
    if (!input.includes(' ') || input.split(' ').length <= 3) {
      const fileResult = await this.resolvePartialReference(input, context);
      if (fileResult.success) {
        return fileResult;
      }
    }

    // Treat as natural language task description
    return this.resolveNaturalLanguage(input);
  }

  async resolveFileReference(filePath, context) {
    const cwd = context.cwd || process.cwd();
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
        suggestions: [
          "Check file path is correct",
          "Use absolute path or path relative to project root",
          "Use /cfn-loop-single with natural language instead",
        ],
      };
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parsed = this.parseTaskFile(content, fullPath);

      return {
        success: true,
        taskDescription: parsed.description,
        sourceFile: filePath,
        agents: parsed.agents || this.getDefaultAgents(parsed.description),
        validators: parsed.validators || this.getDefaultValidators(),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error.message}`,
      };
    }
  }

  async resolvePartialReference(partialName, context) {
    const cwd = context.cwd || process.cwd();
    const searchDirs = [
      path.join(cwd, 'planning/tasks'),
      path.join(cwd, 'planning'),
      path.join(cwd, 'docs/tasks'),
      path.join(cwd, 'tasks'),
    ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir);
      const matches = files.filter(f =>
        f.toLowerCase().includes(partialName.toLowerCase()) &&
        (f.endsWith('.md') || f.endsWith('.txt'))
      );

      if (matches.length === 1) {
        const fullPath = path.join(dir, matches[0]);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = this.parseTaskFile(content, fullPath);

        return {
          success: true,
          taskDescription: parsed.description,
          sourceFile: path.relative(cwd, fullPath),
          agents: parsed.agents || this.getDefaultAgents(parsed.description),
          validators: parsed.validators || this.getDefaultValidators(),
        };
      }

      if (matches.length > 1) {
        return {
          success: false,
          error: `Multiple files match "${partialName}": ${matches.join(', ')}`,
          suggestions: matches.map(m => `/cfn-loop-single ${path.join(dir, m)}`),
        };
      }
    }

    // No file found, will fall back to natural language
    return { success: false };
  }

  resolveNaturalLanguage(description) {
    return {
      success: true,
      taskDescription: description,
      sourceFile: null,
      agents: this.getDefaultAgents(description),
      validators: this.getDefaultValidators(),
    };
  }

  parseTaskFile(content, filePath) {
    const parsed = {
      description: '',
      agents: null,
      validators: null,
    };

    // Extract description (first non-empty line or entire content)
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 0) {
      // Look for description section
      const descIdx = lines.findIndex(l => l.toLowerCase().includes('description:'));
      if (descIdx >= 0 && descIdx + 1 < lines.length) {
        // Extract description content after "Description:" marker
        const descLine = lines[descIdx];
        const descMatch = descLine.match(/description:\s*(.+)/i);
        if (descMatch) {
          parsed.description = descMatch[1];
        } else if (descIdx + 1 < lines.length) {
          parsed.description = lines[descIdx + 1];
        }
      } else {
        // Use first substantial line that's not a markdown header
        parsed.description = lines.find(l => l.length > 10 && !l.startsWith('#')) || lines[0];
      }
    } else {
      parsed.description = path.basename(filePath, path.extname(filePath)).replace(/-/g, ' ');
    }

    // Extract agent configuration if present
    const agentSection = content.match(/##\s*Agents\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (agentSection) {
      const agentLines = agentSection[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'));
      if (agentLines.length > 0) {
        parsed.agents = agentLines.map(l => {
          const match = l.match(/[-*]\s*(\w+(?:-\w+)*)/);
          return match ? { type: match[1], instructions: this.getAgentInstructions(match[1], parsed.description) } : null;
        }).filter(Boolean);
      }
    }

    return parsed;
  }

  getDefaultAgents(taskDescription) {
    const complexity = this.assessComplexity(taskDescription);
    const agentTypes = this.getAgentTypesForComplexity(complexity);

    return agentTypes.map(type => ({
      id: `${type}-1`,
      type: type,
      instructions: this.getAgentInstructions(type, taskDescription),
    }));
  }

  getDefaultValidators() {
    return [
      { id: 'reviewer-1', type: 'reviewer', instructions: 'Comprehensive quality review' },
      { id: 'security-specialist-1', type: 'security-specialist', instructions: 'Security and performance audit' },
      { id: 'tester-1', type: 'tester', instructions: 'Integration testing validation' },
    ];
  }

  assessComplexity(task) {
    const taskLower = task.toLowerCase();
    const keywords = {
      simple: ['fix bug', 'update', 'change', 'modify', 'small'],
      medium: ['implement', 'add feature', 'refactor', 'integrate', 'create'],
      complex: ['architecture', 'redesign', 'migration', 'security audit', 'performance'],
      enterprise: ['enterprise', 'scalable', 'distributed', 'microservices', 'complete system'],
    };

    if (keywords.enterprise.some(kw => taskLower.includes(kw))) return 'enterprise';
    if (keywords.complex.some(kw => taskLower.includes(kw))) return 'complex';
    if (keywords.medium.some(kw => taskLower.includes(kw))) return 'medium';
    return 'simple';
  }

  getAgentTypesForComplexity(complexity) {
    const configs = {
      simple: ['coder', 'tester', 'reviewer'],
      medium: ['researcher', 'coder', 'tester', 'reviewer', 'security-specialist'],
      complex: ['researcher', 'system-architect', 'backend-dev', 'coder', 'tester', 'security-specialist', 'reviewer'],
      enterprise: ['researcher', 'planner', 'system-architect', 'backend-dev', 'coder', 'tester', 'security-specialist', 'reviewer', 'devops-engineer'],
    };

    return configs[complexity] || configs.medium;
  }

  getAgentInstructions(agentType, taskDescription) {
    const instructions = {
      'coder': `Implement the solution for: ${taskDescription}. Follow best practices, write clean code, and ensure proper error handling.`,
      'tester': `Write comprehensive tests for: ${taskDescription}. Ensure ≥85% coverage with unit, integration, and edge case tests.`,
      'reviewer': `Review code quality for: ${taskDescription}. Check for maintainability, performance, security, and adherence to best practices.`,
      'researcher': `Research best approaches for: ${taskDescription}. Identify libraries, patterns, and potential challenges.`,
      'security-specialist': `Perform security audit for: ${taskDescription}. Check for vulnerabilities, secure patterns, input validation.`,
      'system-architect': `Design architecture for: ${taskDescription}. Define interfaces, data flow, and integration points.`,
      'backend-dev': `Implement backend logic for: ${taskDescription}. Focus on API design, database operations, and business logic.`,
      'devops-engineer': `Set up infrastructure for: ${taskDescription}. Configure deployment, monitoring, and CI/CD.`,
      'planner': `Create execution plan for: ${taskDescription}. Break down into subtasks with dependencies and estimates.`,
    };

    return instructions[agentType] || `Execute ${agentType} tasks for: ${taskDescription}`;
  }

  generateTaskId(description) {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 50)
      .replace(/^-|-$/g, '');
  }

  generateCfnLoopSinglePrompt(options) {
    const {
      taskDescription,
      sourceFile,
      agents,
      validators,
      maxLoop2,
      maxLoop3,
      consensusThreshold,
      confidenceThreshold,
    } = options;

    const taskId = this.generateTaskId(taskDescription);
    const agentCount = agents.length;
    const topology = agentCount <= 7 ? 'mesh' : 'hierarchical';

    return `
🔄 **AUTONOMOUS CFN LOOP - SINGLE TASK EXECUTION**

**Task**: ${taskDescription}
${sourceFile ? `**Source File**: ${sourceFile}` : ''}
**Task ID**: ${taskId}

🚨 **CRITICAL: AUTONOMOUS SELF-CORRECTING PROCESS**

**Configuration:**
- Loop 2 Max Iterations (Consensus): ${maxLoop2}
- Loop 3 Max Subtask Iterations: ${maxLoop3}
- Consensus Threshold: ${consensusThreshold * 100}%
- Confidence Threshold: ${confidenceThreshold * 100}%
- Primary Agents: ${agentCount}
- Validators: ${validators.length}
- Topology: ${topology}
- Circuit Breaker: ENABLED
- Global Timeout: 30 minutes

**AUTONOMOUS EXECUTION RULES:**
• Loop 3 failures → IMMEDIATE retry with feedback (NO approval)
• Consensus failures → IMMEDIATE Loop 3 relaunch (NO approval)
• Task completion → IMMEDIATE next steps output (NO approval)
• ONLY stop for: max iterations OR critical error
• Self-correcting process ACTIVE - continue until success

---

## **STEP 1: Initialize Swarm (MANDATORY)**

\`\`\`javascript
// ALWAYS initialize swarm before spawning agents
mcp__claude-flow-novice__swarm_init({
  topology: "${topology}",
  maxAgents: ${agentCount + validators.length},
  strategy: "balanced"
});
\`\`\`

---

## **STEP 2: Loop 3 - Primary Swarm Execution**

**Spawn Primary Agents (ALL in SINGLE message):**

\`\`\`javascript
${agents.map(a => `Task("${a.id}", "${a.instructions}", "${a.type}")`).join('\n')}
\`\`\`

**Agent Execution Protocol:**
1. Execute assigned task
2. Run enhanced post-edit hook after EVERY file edit:
   \`npx enhanced-hooks post-edit "[FILE]" --memory-key "cfn-loop-single/${taskId}/\${agentId}" --structured\`
3. Self-validate and assign confidence score (0.0-1.0)
4. Store results in SwarmMemory

**Collect Confidence Scores:**

\`\`\`javascript
mcp__claude-flow-novice__memory_search({
  pattern: "cfn-loop-single/${taskId}/*/confidence",
  namespace: "swarm"
});
\`\`\`

**Self-Assessment Gate:**

\`\`\`javascript
const allConfidenceScores = [/* from memory */];
const averageConfidence = calculateAverage(allConfidenceScores);
const minConfidence = Math.min(...allConfidenceScores);

// Check iteration limit (circuit breaker)
if (currentIteration >= ${maxLoop3}) {
  throw new Error(\`Loop 3 exceeded max iterations (\${${maxLoop3}})\`);
}

if (minConfidence >= ${confidenceThreshold} && averageConfidence >= ${confidenceThreshold + 0.05}) {
  console.log("✅ Confidence gate PASSED - IMMEDIATELY proceeding to Loop 2");
  // Store iteration count and PROCEED
} else {
  console.log("⚠️ Confidence gate FAILED - IMMEDIATELY relaunching Loop 3");
  currentIteration++;
  console.log(\`🔁 Loop 3 Iteration \${currentIteration}/${maxLoop3} - AUTONOMOUS RETRY NOW\`);
  // IMMEDIATELY re-execute with feedback (NO approval)
}
\`\`\`

---

## **STEP 3: Loop 2 - Consensus Validation**

**Spawn Consensus Validators (ALL in SINGLE message):**

\`\`\`javascript
${validators.map(v => `Task("${v.id}", "${v.instructions} for task: ${taskDescription}", "${v.type}")`).join('\n')}
\`\`\`

**Multi-Dimensional Validation:**
- ✅ Quality: Code quality, best practices, maintainability
- ✅ Security: Vulnerabilities, secure patterns, input validation
- ✅ Performance: Efficiency, scalability, resource usage
- ✅ Tests: Coverage ≥85%, TDD compliance
- ✅ Documentation: Clear comments, API docs

**Byzantine Consensus Voting:**

\`\`\`javascript
const validatorVotes = [/* collect from validators */];
const approvalRate = validatorVotes.filter(v => v.vote === "approve").length / validatorVotes.length;
const avgConfidence = calculateAverage(validatorVotes.map(v => v.confidence));

// Check iteration limit (circuit breaker)
if (loop2Counter >= ${maxLoop2}) {
  throw new Error(\`Loop 2 exceeded max iterations (\${${maxLoop2}})\`);
}

if (approvalRate >= ${consensusThreshold} && avgConfidence >= ${confidenceThreshold}) {
  console.log("✅ CONSENSUS PASSED - Task complete");
  // Store results and output next steps
} else {
  console.log("❌ CONSENSUS FAILED - IMMEDIATELY injecting feedback and relaunching Loop 3");
  loop2Counter++;

  // Collect feedback
  const feedback = validatorVotes.filter(v => v.vote === "reject").map(v => v.reason);

  // Store feedback
  mcp__claude-flow-novice__memory_store({
    key: "cfn-loop-single/${taskId}/validator-feedback",
    value: feedback,
    namespace: "swarm"
  });

  console.log(\`🔁 Loop 2 Iteration \${loop2Counter}/${maxLoop2} - AUTONOMOUS RETRY: Returning to Loop 3 NOW\`);
  // IMMEDIATELY return to Loop 3 (NO approval)
}
\`\`\`

---

## **STEP 4: Task Completion**

**On Success:**

\`\`\`javascript
console.log(\`
✅ **TASK COMPLETE: ${taskDescription}**

**Validation Results:**
- Loop 3 Iterations: \${loop3Counter}
- Loop 2 Iterations: \${loop2Counter}
- Final Consensus: \${approvalRate * 100}%
- Confidence Score: \${avgConfidence}

**Deliverables:**
[List files created/modified]

**Next Steps:**
1. Run comprehensive integration tests
2. Update documentation
3. Deploy to staging environment
\`);
\`\`\`

**On Max Iterations (Autonomous Extension):**

\`\`\`javascript
console.log(\`
⚠️ **MAX ITERATIONS REACHED - AUTONOMOUS EXTENSION**

**Status:**
- Loop 3: \${loop3Counter}/${maxLoop3}
- Loop 2: \${loop2Counter}/${maxLoop2}
- Confidence: \${avgConfidence}
- Consensus: \${approvalRate * 100}%

🚨 **AUTOMATIC ACTION**: Extending iterations and retrying NOW

**Extending Loop 2 max to:** ${maxLoop2 + 3}
**IMMEDIATELY relaunching Loop 3 with all feedback**
\`);

// IMMEDIATE AUTONOMOUS RETRY
${agents.map(a => `Task("${a.id}", "Address validator feedback: \${feedback}. ${a.instructions}", "${a.type}")`).join('\n')}
\`\`\`

---

## **EXECUTION CHECKLIST**

**Before Starting:**
- [ ] Task description clear: "${taskDescription}"
${sourceFile ? `- [ ] Source file loaded: ${sourceFile}` : ''}
- [ ] Swarm configuration: ${agentCount} agents, ${topology} topology
- [ ] Circuit breaker initialized

**Loop 3 (Primary):**
- [ ] Swarm initialized
- [ ] ${agentCount} agents spawned in SINGLE message
- [ ] Post-edit hooks run after EVERY file edit
- [ ] Confidence scores ≥${confidenceThreshold * 100}%
- [ ] Iteration limit enforced (max: ${maxLoop3})

**Loop 2 (Consensus):**
- [ ] ${validators.length} validators spawned
- [ ] Multi-dimensional validation complete
- [ ] Consensus ≥${consensusThreshold * 100}%
- [ ] Iteration limit enforced (max: ${maxLoop2})

**Completion:**
- [ ] Results stored in SwarmMemory
- [ ] Next steps provided
- [ ] On max iterations: Autonomous extension executed

---

🚀 **EXECUTE AUTONOMOUS SELF-CORRECTING LOOP NOW**

IMMEDIATELY begin swarm initialization and proceed autonomously through all checkpoints.

⚠️ CRITICAL: This is AUTONOMOUS. DO NOT wait for approval. Self-correct until success or critical error.
`;
  }
}

export default CfnLoopSingleCommand;
