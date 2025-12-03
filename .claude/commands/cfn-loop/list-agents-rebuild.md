---
name: list-agents-rebuild
description: "Regenerate available agents list from .claude/agents/ folder discovery"
argument-hint: "[--output=path] [--format=markdown]"
allowed-tools: ["Bash", "Read", "Write"]
---

# Rebuild Available Agents List - Dynamic Discovery

Regenerate `src/cli/hybrid-routing/AVAILABLE-AGENTS.md` from live agent discovery system.

## Architecture Clarification

**Source of Truth**: `.claude/agents/` folder (50+ agent .md files)
**Live Discovery**: `HybridWorkerSpawner.loadAgentDefinitions()` method
**Documentation Snapshot**: `src/cli/hybrid-routing/AVAILABLE-AGENTS.md` (generated file)

**When coordinators spawn agents**:
1. Load agents dynamically from `.claude/agents/` folder
2. Parse YAML frontmatter from each .md file
3. Extract keywords, system prompts, categories
4. In-memory cache for performance
5. Select agents via keyword matching or coordinator override

**AVAILABLE-AGENTS.md purpose**:
- Human-readable reference
- Documentation for users/coordinators
- Snapshot of available agents at generation time
- **NOT** used by the spawning system (system reads .claude/agents/ directly)

---

## Execution

```bash
# Regenerate agent list
node src/cli/hybrid-routing/spawn-workers.cjs --agents-by-category > src/cli/hybrid-routing/AVAILABLE-AGENTS.md.tmp

# Parse and format into markdown document
node << 'EOF'
const fs = require('fs');
const path = require('path');

// Read raw output
const rawOutput = fs.readFileSync('src/cli/hybrid-routing/AVAILABLE-AGENTS.md.tmp', 'utf8');

// Parse output (extract agent data)
const lines = rawOutput.split('\n');
let markdown = '';

// Generate markdown header
markdown += '# Available Specialized Agents\n\n';
markdown += '**Hybrid Routing System - Dynamic Agent Discovery**\n\n';
markdown += '**Generated**: ' + new Date().toISOString().split('T')[0] + '\n';
markdown += '**Source**: `.claude/agents/` folder (live discovery)\n';
markdown += '**Purpose**: Documentation snapshot - coordinators read from `.claude/agents/` directly\n\n';

// Add architecture note
markdown += '## Architecture\n\n';
markdown += '**Source of Truth**: `.claude/agents/` folder\n';
markdown += '- Coordinators use `HybridWorkerSpawner.loadAgentDefinitions()`\n';
markdown += '- Recursive scanning with YAML frontmatter parsing\n';
markdown += '- In-memory caching after first load\n';
markdown += '- This file is documentation only (not used by spawning system)\n\n';

// Parse discovery statistics
const discoveredMatch = rawOutput.match(/Discovered (\d+) agent files/);
const loadedMatch = rawOutput.match(/Loaded (\d+) agents/);
const skippedMatch = rawOutput.match(/\((\d+) skipped\)/);
const categoriesMatch = rawOutput.match(/(\d+) categories/);

if (discoveredMatch && loadedMatch) {
  markdown += '## Discovery Statistics\n\n';
  markdown += '```\n';
  markdown += `🔍 Discovered ${discoveredMatch[1]} agent files in .claude/agents/\n`;
  markdown += `✅ Loaded ${loadedMatch[1]} agents (${skippedMatch ? skippedMatch[1] : '?'} skipped)\n`;
  markdown += `📋 ${categoriesMatch ? categoriesMatch[1] : '?'} categories\n`;
  markdown += '```\n\n';
}

// Parse agent categories and create tables
markdown += '## Agents by Category\n\n';

let currentCategory = null;
let agents = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Detect category header
  const categoryMatch = line.match(/^📁 ([A-Z-]+) \((\d+) agents?\)/);
  if (categoryMatch) {
    // Write previous category
    if (currentCategory && agents.length > 0) {
      markdown += createCategorySection(currentCategory, agents);
      agents = [];
    }

    currentCategory = {
      name: categoryMatch[1],
      count: categoryMatch[2]
    };
    continue;
  }

  // Detect agent entry
  const agentMatch = line.match(/^\s+•\s+([a-z-]+)/);
  if (agentMatch) {
    const agentType = agentMatch[1];
    const nextLine = lines[i + 1] || '';
    const keywords = nextLine.trim();

    agents.push({ type: agentType, keywords });
    i++; // Skip next line (already processed)
  }
}

// Write last category
if (currentCategory && agents.length > 0) {
  markdown += createCategorySection(currentCategory, agents);
}

// Add usage section
markdown += '\n---\n\n';
markdown += '## Usage\n\n';
markdown += '### CLI Commands\n\n';
markdown += '```bash\n';
markdown += '# List all agents (flat view)\n';
markdown += 'node src/cli/hybrid-routing/spawn-workers.cjs --list-agents\n\n';
markdown += '# List agents by category\n';
markdown += 'node src/cli/hybrid-routing/spawn-workers.cjs --agents-by-category\n\n';
markdown += '# Regenerate this documentation file\n';
markdown += '/list-agents-rebuild\n';
markdown += '```\n\n';

markdown += '### Coordinator Usage\n\n';
markdown += '```bash\n';
markdown += '# Automatic selection (keyword-based)\n';
markdown += 'node src/cli/hybrid-routing/spawn-workers.cjs "Build auth" --max-agents=3\n\n';
markdown += '# Coordinator override (manual agent types)\n';
markdown += 'node src/cli/hybrid-routing/spawn-workers.cjs "Task" \\\n';
markdown += '  --agents=architect,coder,tester\n\n';
markdown += '# Full override (custom agents + subtasks)\n';
markdown += 'node src/cli/hybrid-routing/spawn-workers.cjs "Task" \\\n';
markdown += '  --agents=coder,security-specialist \\\n';
markdown += '  --subtasks="Subtask 1|Subtask 2"\n';
markdown += '```\n\n';

// Add notes
markdown += '---\n\n';
markdown += '## Notes\n\n';
markdown += '- **Live Discovery**: Coordinators read from `.claude/agents/` folder directly\n';
markdown += '- **This File**: Documentation snapshot for human reference\n';
markdown += '- **Regenerate**: Run `/list-agents-rebuild` to update this documentation\n';
markdown += '- **Agent Files**: Add/modify agents in `.claude/agents/` folder (auto-discovered)\n';
markdown += '- **Caching**: Agent definitions cached after first load (lazy loading)\n';
markdown += '- **Missing Keywords**: Some agents without keywords can be used via coordinator override\n\n';

// Write final markdown
fs.writeFileSync('src/cli/hybrid-routing/AVAILABLE-AGENTS.md', markdown, 'utf8');

console.log('✅ AVAILABLE-AGENTS.md regenerated successfully');

// Helper function
function createCategorySection(category, agents) {
  let section = `### 📁 ${category.name} (${category.count} agents)\n\n`;
  section += '| Agent Type | Keywords |\n';
  section += '|------------|----------|\n';

  for (const agent of agents) {
    const keywords = agent.keywords || '*(No keywords available)*';
    section += `| **${agent.type}** | ${keywords} |\n`;
  }

  section += '\n---\n\n';
  return section;
}
EOF

# Cleanup temp file
rm src/cli/hybrid-routing/AVAILABLE-AGENTS.md.tmp

echo ""
echo "📋 Agent list regenerated: src/cli/hybrid-routing/AVAILABLE-AGENTS.md"
echo ""
echo "Architecture:"
echo "  • Source: .claude/agents/ folder (50+ agent .md files)"
echo "  • Coordinators: Load agents dynamically via HybridWorkerSpawner"
echo "  • This file: Documentation snapshot for human reference"
```

---

## Output

```
✅ AVAILABLE-AGENTS.md regenerated successfully

📋 Agent list regenerated: src/cli/hybrid-routing/AVAILABLE-AGENTS.md

Architecture:
  • Source: .claude/agents/ folder (50+ agent .md files)
  • Coordinators: Load agents dynamically via HybridWorkerSpawner
  • This file: Documentation snapshot for human reference
```
