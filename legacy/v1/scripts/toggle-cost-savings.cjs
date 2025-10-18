#!/usr/bin/env node
/**
 * Cost-Savings Mode Toggle Script
 * Switches between CLI-based (cost-savings) and Task-tool coordination
 * Usage: node scripts/toggle-cost-savings.js [on|off|status]
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '.claude-flow', 'cost-savings-mode.json');
const CLAUDE_MD_PATH = path.join(__dirname, '..', 'CLAUDE.md');
const CLI_COORDINATORS_MARKER = '<!-- CLI_COORDINATORS_START -->';
const CLI_COORDINATORS_END = '<!-- CLI_COORDINATORS_END -->';
const TASK_COORDINATORS_MARKER = '<!-- TASK_COORDINATORS_START -->';
const TASK_COORDINATORS_END = '<!-- TASK_COORDINATORS_END -->';

// Ensure config directory exists
const configDir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// CLI Coordinators Section
const CLI_COORDINATORS_SECTION = `
### CLI-Based Coordinators (Cost-Savings Mode ACTIVE)

**When cost-savings mode is enabled, use these CLI spawning patterns:**

#### coordinator-hybrid (PRIMARY)
\`\`\`bash
# Coordinator spawns workers via CLI
node src/cli/hybrid-routing/spawn-workers.js \\
  "Task description" \\
  --agents=analyst,coder,tester \\
  --provider zai \\
  --redis-channel swarm:task
\`\`\`

#### cfn-coordinator-mvp
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "MVP phase implementation" \\
  --agents=coder,coder \\
  --provider zai \\
  --redis-channel swarm:mvp-phase \\
  --timeout 900000 \\
  --budget 0.50
\`\`\`

#### cfn-coordinator-standard
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Standard phase implementation" \\
  --agents=analyst,coder,coder,tester \\
  --provider zai \\
  --redis-channel swarm:std-phase \\
  --timeout 1800000
\`\`\`

#### cfn-coordinator-enterprise
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Enterprise phase implementation" \\
  --agents=analyst,architect,coder,coder,security-specialist,tester \\
  --provider zai \\
  --redis-channel swarm:ent-phase \\
  --timeout 3600000
\`\`\`

#### adaptive-coordinator
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Adaptive coordination task" \\
  --agents=analyst,architect,coder,coder,coder,tester,reviewer \\
  --provider zai \\
  --redis-channel swarm:adaptive \\
  --max-agents 8
\`\`\`

**Cost Structure (CLI Mode):**
- Coordinator: $0 (runs in main chat, uses subscription)
- Workers: ~$0.50/1M tokens (z.ai provider)
- **Savings: ~97% vs pure Claude**
`;

// Task-Tool Coordinators Section
const TASK_COORDINATORS_SECTION = `
### Task-Tool Coordinators (Cost-Savings Mode DISABLED)

**When cost-savings mode is disabled, use these Task spawning patterns:**

#### coordinator-hybrid (PRIMARY)
\`\`\`javascript
Task("coordinator-hybrid",
  \`Coordinate task: [description]

   Spawn workers via Task tool:
   - Task("analyst", "Analyze requirements", "analyst")
   - Task("coder", "Implement solution", "coder")
   - Task("tester", "Validate tests", "tester")

   Coordinate via Redis pub/sub on swarm:task channel\`,
  "coordinator"
)
\`\`\`

#### cfn-coordinator-mvp
\`\`\`javascript
Task("cfn-coordinator-mvp",
  \`Execute MVP phase: [description]

   MVP Parameters:
   - Gate threshold: 0.70
   - Consensus: 0.80
   - Validators: 2
   - Max iterations: 5

   Spawn 2-3 workers via Task tool\`,
  "coordinator"
)
\`\`\`

#### cfn-coordinator-standard
\`\`\`javascript
Task("cfn-coordinator-standard",
  \`Execute standard phase: [description]

   Standard Parameters:
   - Gate threshold: 0.75
   - Consensus: 0.90
   - Validators: 4
   - Max iterations: 10

   Spawn 3-5 workers via Task tool\`,
  "coordinator"
)
\`\`\`

#### cfn-coordinator-enterprise
\`\`\`javascript
Task("cfn-coordinator-enterprise",
  \`Execute enterprise phase: [description]

   Enterprise Parameters:
   - Gate threshold: 0.75
   - Consensus: 0.95
   - Validators: 4
   - Max iterations: 15
   - Loop 0.5: Planning consensus

   Spawn 5-8 workers via Task tool\`,
  "coordinator"
)
\`\`\`

#### adaptive-coordinator
\`\`\`javascript
Task("adaptive-coordinator",
  \`Coordinate with adaptive topology:

   Topology: mesh (2-7) | hierarchical (8+)
   Dynamic switching based on agent count

   Spawn workers via Task tool\`,
  "coordinator"
)
\`\`\`

**Cost Structure (Task-Tool Mode):**
- All agents use main provider (Claude Max or z.ai based on /switch-api)
- Higher cost but maximum coordinator intelligence
- Direct Task tool orchestration
`;

function getCurrentMode() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { mode: 'task-tool', lastToggled: null };
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveMode(mode) {
  const config = {
    mode,
    lastToggled: new Date().toISOString()
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  return config;
}

function updateClaudeMd(mode) {
  let claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');

  // Remove existing sections
  claudeMd = claudeMd.replace(
    new RegExp(`${CLI_COORDINATORS_MARKER}[\\s\\S]*?${CLI_COORDINATORS_END}`, 'g'),
    ''
  );
  claudeMd = claudeMd.replace(
    new RegExp(`${TASK_COORDINATORS_MARKER}[\\s\\S]*?${TASK_COORDINATORS_END}`, 'g'),
    ''
  );

  // Find insertion point (after "### Hybrid CLI-Based Routing" section)
  const insertionPattern = /### Hybrid CLI-Based Routing \(Default with Claude Max\)/;
  const match = claudeMd.match(insertionPattern);

  if (!match) {
    console.error('❌ Could not find insertion point in CLAUDE.md');
    return false;
  }

  // Find end of Hybrid CLI-Based Routing section (next ### or EOF)
  const sectionStart = match.index + match[0].length;
  const nextSectionMatch = claudeMd.slice(sectionStart).match(/\n### /);
  const insertionPoint = nextSectionMatch
    ? sectionStart + nextSectionMatch.index
    : claudeMd.length;

  // Insert appropriate section
  const sectionToInsert = mode === 'cli'
    ? `\n${CLI_COORDINATORS_MARKER}${CLI_COORDINATORS_SECTION}\n${CLI_COORDINATORS_END}\n`
    : `\n${TASK_COORDINATORS_MARKER}${TASK_COORDINATORS_SECTION}\n${TASK_COORDINATORS_END}\n`;

  claudeMd = claudeMd.slice(0, insertionPoint) + sectionToInsert + claudeMd.slice(insertionPoint);

  fs.writeFileSync(CLAUDE_MD_PATH, claudeMd);
  return true;
}

function showStatus() {
  const config = getCurrentMode();
  const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
  const hasCliSection = claudeMd.includes(CLI_COORDINATORS_MARKER);
  const hasTaskSection = claudeMd.includes(TASK_COORDINATORS_MARKER);

  console.log('\n📊 Cost-Savings Mode Status\n');
  console.log(`Mode: ${config.mode.toUpperCase()}`);
  console.log(`Active sections in CLAUDE.md: ${hasCliSection ? 'CLI' : hasTaskSection ? 'Task-tool' : 'None'}`);
  console.log(`Spawning pattern: ${config.mode === 'cli' ? 'spawn-workers.js' : 'Task()'}`);
  console.log(`Provider: ${config.mode === 'cli' ? 'z.ai (workers)' : 'main provider'}`);
  console.log(`Cost savings: ${config.mode === 'cli' ? '~97%' : '0%'}`);
  console.log(`Last toggled: ${config.lastToggled || 'Never'}\n`);
}

function enableCostSavings() {
  console.log('🔧 Enabling CLI cost-savings mode...\n');

  const updated = updateClaudeMd('cli');
  if (!updated) {
    process.exit(1);
  }

  saveMode('cli');

  console.log('✅ Cost-savings mode ENABLED\n');
  console.log('📋 Changes applied:');
  console.log('  • CLAUDE.md updated with CLI coordinator sections');
  console.log('  • Coordinators will use spawn-workers.js for spawning');
  console.log('  • Workers will use z.ai provider ($0.50/1M tokens)');
  console.log('  • Coordinators run on Claude Max subscription ($0)');
  console.log('  • ~97% cost savings active\n');
}

function disableCostSavings() {
  console.log('🔧 Disabling CLI cost-savings mode...\n');

  const updated = updateClaudeMd('task-tool');
  if (!updated) {
    process.exit(1);
  }

  saveMode('task-tool');

  console.log('✅ Cost-savings mode DISABLED\n');
  console.log('📋 Changes applied:');
  console.log('  • CLAUDE.md updated with Task-tool coordinator sections');
  console.log('  • Coordinators will use Task() for spawning');
  console.log('  • All agents use main provider');
  console.log('  • Maximum coordinator intelligence prioritized\n');
}

// Main execution
const command = process.argv[2] || 'status';

switch (command.toLowerCase()) {
  case 'on':
  case 'enable':
    enableCostSavings();
    break;
  case 'off':
  case 'disable':
    disableCostSavings();
    break;
  case 'status':
    showStatus();
    break;
  default:
    console.log('Usage: node scripts/toggle-cost-savings.js [on|off|status]');
    process.exit(1);
}
