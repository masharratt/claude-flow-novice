#!/usr/bin/env node

/**
 * Slash Commands Index
 *
 * Exports all slash commands and utilities
 */

// Base command class
export { SlashCommand } from "../core/slash-command.js";

// Individual command classes
export { SparcCommand } from "./sparc.js";
export { SwarmCommand } from "./swarm.js";
export { HooksCommand } from "./hooks.js";
export { NeuralCommand } from "./neural.js";
export { PerformanceCommand } from "./performance.js";
export { GitHubCommand } from "./github.js";
export { WorkflowCommand } from "./workflow.js";
export { ClaudeMdSlashCommand } from "./claude-md.js";
export { CfnLoopCommand } from "./cfn-loop.js";
export { CfnLoopSingleCommand } from "./cfn-loop-single.js";
export { CfnLoopSprintsCommand } from "./cfn-loop-sprints.js";
export { CfnLoopEpicCommand } from "./cfn-loop-epic.js";
export { ParseEpicCommand } from "./parse-epic.js";

// Command executors
export { executeClaudeSoulCommand } from "./claude-soul.js";
export { executeClaudeMdCommand } from "./claude-md.js";

// Registry and utilities
export {
  SlashCommandRegistry,
  globalRegistry,
  executeSlashCommand,
  getAllCommands,
  getCommandHelp,
  registerCommand,
} from "./register-all-commands.js";

// Registration functions
export { registerClaudeSoulCommand } from "./register-claude-soul.js";
export { default as registerClaudeMd } from "./register-claude-md.js";

/**
 * Quick access to commonly used commands
 */
export const Commands = {
  SPARC: "sparc",
  SWARM: "swarm",
  HOOKS: "hooks",
  NEURAL: "neural",
  PERFORMANCE: "performance",
  GITHUB: "github",
  WORKFLOW: "workflow",
  CLAUDE_MD: "claude-md",
  CLAUDE_SOUL: "claude-soul",
  CFN_LOOP: "cfn-loop",
  CFN_LOOP_SINGLE: "cfn-loop-single",
  CFN_LOOP_SPRINTS: "cfn-loop-sprints",
  CFN_LOOP_EPIC: "cfn-loop-epic",
  PARSE_EPIC: "parse-epic",
};

/**
 * Command aliases for quick access
 */
export const Aliases = {
  s: "swarm",
  h: "hooks",
  n: "neural",
  p: "performance",
  perf: "performance",
  gh: "github",
  git: "github",
  w: "workflow",
  wf: "workflow",
  cfn: "cfn-loop",
  loop: "cfn-loop",
  "cfn-single": "cfn-loop-single",
  "cfn-sprints": "cfn-loop-sprints",
  "cfn-epic": "cfn-loop-epic",
  parse: "parse-epic",
  epic: "parse-epic",
};

/**
 * Initialize all slash commands
 * @returns {SlashCommandRegistry} - Initialized registry
 */
export function initializeSlashCommands() {
  console.log("🚀 Initializing Claude-Flow slash commands...");

  // Registry is automatically initialized when imported
  const commandCount = globalRegistry.listCommands().length;

  console.log(`✅ Initialized ${commandCount} slash commands`);
  console.log("Available commands:", Object.values(Commands).join(", "));

  return globalRegistry;
}

/**
 * Get quick help text
 */
export function getQuickHelp() {
  return `
🚀 **CLAUDE-FLOW SLASH COMMANDS**

**Essential Commands:**
- \`/cfn-loop "task description"\` - Autonomous self-correcting 3-loop workflow (IMMEDIATE retries)
- \`/fullstack "goal"\` - Autonomous full-stack team with CFN Loop (NO approvals)
- \`/swarm init mesh 8\` - Initialize agent swarm
- \`/hooks enable\` - Enable automation hooks
- \`/sparc spec "task"\` - Run SPARC methodology
- \`/neural train coordination\` - Train neural patterns
- \`/performance report\` - Generate performance report
- \`/github analyze repo\` - Analyze GitHub repository
- \`/workflow create "name"\` - Create automated workflow

🚨 **CFN Loop & Fullstack are AUTONOMOUS** - self-correct until success or max iterations

**For full help:** Use \`/help\` or see individual command documentation
`;
}

export default {
  Commands,
  Aliases,
  globalRegistry,
  executeSlashCommand,
  getAllCommands,
  getCommandHelp,
  initializeSlashCommands,
  getQuickHelp,
};
