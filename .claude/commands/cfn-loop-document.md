---
description: "Update documentation files in /readme based on completed sprint/epic implementation"
argument-hint: "[--sprint=name] [--epic=name] [--phase=name]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Grep", "Glob", "Bash"]
---

# CFN Loop Document - Automated Documentation Updates

Update documentation files in `/readme` directory based on completed sprint/epic implementations, following sparse language patterns.

🚨 **AUTONOMOUS DOCUMENTATION GENERATION**

**Scope**: $ARGUMENTS

## Command Modes

```bash
/cfn-loop-document                           # Auto-detect completed work from git log
/cfn-loop-document --sprint=auth-system      # Document specific sprint
/cfn-loop-document --epic=e-commerce-v1      # Document entire epic
/cfn-loop-document --phase=user-auth         # Document single phase
```

## Execution Pattern

### Step 0: Read Documentation Guidelines
```javascript
// Read /readme/CLAUDE.md first to understand documentation structure and rules
Task("Documentation Guidelines Analyzer", `
  READ: /readme/CLAUDE.md

  EXTRACT:
  1. Documentation categories and organization
  2. File purposes and content areas
  3. Cross-references between docs
  4. Navigation paths and use cases
  5. Sparse language rules (CRITICAL)
  6. What NOT to include (marketing, cost optimization, verbose explanations)

  OUTPUT:
  {
    "file_purposes": {...},  // What each doc covers
    "categories": [...],     // Documentation categories
    "dependencies": {...},   // Which docs reference others
    "forbidden_patterns": [...], // What to avoid
    "required_patterns": [...] // Required sparse language patterns
  }
`, "analyst")
```

### Step 1: Detect Completed Work
```bash
# Auto-detect from recent commits
git log -20 --pretty=format:"%s%n%b" | grep -E "feat\(cfn-loop\)|Complete (Sprint|Epic|Phase)"

# Extract implementation details
git diff HEAD~10..HEAD --stat | grep -E "\.(ts|js|md)$"
```

### Step 2: Analyze Implementation
```javascript
// Spawn analyst agent to examine implementation
Task("Documentation Analyst", `
  ANALYZE IMPLEMENTATION:

  1. Read recent commits and changes
  2. Identify new features, APIs, commands
  3. Extract key functionality and patterns
  4. Determine which readme files need updates

  OUTPUT:
  {
    "new_features": [...],
    "new_commands": [...],
    "api_changes": [...],
    "affected_docs": [...]
  }
`, "analyst")
```

### Step 3: Generate Documentation Updates
```javascript
// Spawn specialized documentation agents
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 4,
  strategy: "balanced"
})

Task("Command Docs", `
  UPDATE: /readme/logs-slash-commands.md

  RULES (from /readme/CLAUDE.md):
  - Sparse language: active voice, present tense, no fluff
  - NO marketing language, cost optimization details, comparatives
  - NO "can be used", "will allow", "is recommended"
  - Code examples must work
  - Follow existing patterns

  NEW COMMANDS: ${newCommands}
`, "coder")

Task("Feature Docs", `
  UPDATE: /readme/logs-features.md

  RULES (from /readme/CLAUDE.md):
  - Focus: High-level feature descriptions
  - Pattern: Purpose → Usage → Integration
  - NO cost savings, performance comparisons, marketing claims
  - Exception: Internal metrics for optimization (e.g., "398K events/sec, 2.5μs latency")

  NEW FEATURES: ${newFeatures}
`, "coder")

Task("API Docs", `
  UPDATE: /readme/logs-api.md

  Document new REST endpoints, MCP tools
  Include: signatures, parameters, examples

  API CHANGES: ${apiChanges}
`, "api-docs")

Task("CLI Docs", `
  UPDATE: /readme/logs-cli-redis.md

  Document CLI commands, Redis integration
  Follow existing command patterns

  CLI CHANGES: ${cliChanges}
`, "coder")
```

### Step 4: Update Index
```bash
# Update documentation index with new sections
node << 'EOF'
const fs = require('fs');
const index = fs.readFileSync('/readme/logs-documentation-index.md', 'utf8');

// Add new entries maintaining alphabetical order
const newEntries = [
  '- [Recovery Commands](./logs-slash-commands.md#recovery-commands)',
  '- [Crash Detection](./logs-features.md#crash-detection)'
];

// Merge and sort
const updatedIndex = mergeAndSort(index, newEntries);
fs.writeFileSync('/readme/logs-documentation-index.md', updatedIndex);
EOF
```

### Step 5: Validate Documentation
```bash
# Run markdown validation
node config/hooks/markdown-validator.js readme/ --ci

# Verify all links work
node config/hooks/markdown-validator.js --check-links

# Check for sparse language violations and forbidden content
grep -r "will be\|is used\|can be used\|revolutionary\|amazing\|cost savings\|97%\|outperforms\|best-in-class" readme/logs-*.md && {
  echo "⚠️  Warning: Non-sparse language or forbidden content detected"
  echo "See /readme/CLAUDE.md for guidelines"
}
```

## Documentation Patterns (Sparse Language)

### ❌ Verbose Style (Avoid)
```markdown
This function can be used to initialize the swarm. It will create a
new swarm instance that is configured with the topology you specify.
You should use this before spawning any agents.
```

### ✅ Sparse Style (Required)
```markdown
## swarmInit

Initialize swarm with specified topology. Required before agent spawning.

**Signature**: `swarmInit(topology, maxAgents) -> swarmId`

**Example**:
\`\`\`javascript
const id = swarmInit('mesh', 5);
\`\`\`
```

### Command Documentation Template
```markdown
### /command-name [options]

**Purpose**: Single sentence describing what it does

**Usage**:
\`\`\`bash
/command-name --flag value
\`\`\`

**Flags**:
- `--flag`: Description (type, default)

**Output**: What the command returns

**Example**:
\`\`\`bash
/command-name --example input
# Output: result
\`\`\`
```

### Feature Documentation Template
```markdown
## Feature Name

**Purpose**: Problem this solves

**Implementation**: Key technical details

**Usage**:
\`\`\`javascript
// Minimal working example
featureFunction(params);
\`\`\`

**Integration**: How it connects to other features

**Configuration**: Available settings (if applicable)
```

### API Documentation Template
```markdown
### POST /endpoint

**Purpose**: What this endpoint does

**Request**:
\`\`\`json
{"field": "type"}
\`\`\`

**Response**:
\`\`\`json
{"status": "success", "data": {}}
\`\`\`

**Errors**: Status codes and meanings

**Example**:
\`\`\`bash
curl -X POST /endpoint -d '{"field":"value"}'
\`\`\`
```

## File Targets

### /readme/logs-slash-commands.md
**Updates**: New slash commands, command flags, usage examples

**Pattern**: Command signature → Purpose → Example

### /readme/logs-features.md
**Updates**: New features, capabilities, system behaviors

**Pattern**: Feature name → Purpose → Implementation → Integration

### /readme/logs-api.md
**Updates**: REST endpoints, MCP tools, API changes

**Pattern**: Endpoint → Request/Response → Example → Errors

### /readme/logs-cli-redis.md
**Updates**: CLI commands, Redis operations, coordination patterns

**Pattern**: Command → Flags → Output → Integration

### /readme/logs-functions.md
**Updates**: Core functions, utilities, helper methods

**Pattern**: Signature → Parameters → Returns → Example

### /readme/logs-mcp.md
**Updates**: MCP server tools, protocols, integrations

**Pattern**: Tool name → Protocol → Usage → Example

### /readme/additional-commands.md
**Updates**: Specialized commands, infrequent operations

**Pattern**: Category → Commands → Use cases

### /readme/logs-documentation-index.md
**Updates**: Table of contents, cross-references, navigation

**Pattern**: Category → Alphabetical links

## Auto-Detection Logic

```javascript
// Analyze git history to detect what to document
const detectChanges = () => {
  const commits = execSync('git log -20 --pretty=format:"%s"').toString();

  const changes = {
    newCommands: commits.match(/\/[a-z-]+/g) || [],
    newFeatures: commits.match(/feat\([^)]+\)/g) || [],
    apiChanges: commits.match(/api|endpoint|route/gi) || [],
    cliChanges: commits.match(/cli|command/gi) || []
  };

  return {
    shouldUpdateCommands: changes.newCommands.length > 0,
    shouldUpdateFeatures: changes.newFeatures.length > 0,
    shouldUpdateAPI: changes.apiChanges.length > 0,
    shouldUpdateCLI: changes.cliChanges.length > 0
  };
};
```

## Sparse Language Rules (from /readme/CLAUDE.md)

### Active Voice (Required)
- ✅ "Returns data from Redis"
- ❌ "Data is returned from Redis"

### Present Tense (Required)
- ✅ "Initializes swarm"
- ❌ "Will initialize swarm"

### No Fluff (Required)
- ✅ "Monitor CI/CD pipeline status"
- ❌ "This command can be used to monitor your CI/CD pipeline status"

### Minimal Examples (Required)
- ✅ `swarmInit('mesh', 5)`
- ❌ Long multi-line examples with excessive comments

### Direct Description (Required)
- ✅ "Execute autonomous workflow"
- ❌ "This feature allows you to execute a workflow autonomously"

### Forbidden Content
- ❌ Marketing language ("revolutionary", "amazing", "best-in-class")
- ❌ Cost optimization ("97% savings", "worker cost $0.50 vs $15")
- ❌ Comparative benchmarks ("40x faster than", "outperforms X by 200%")
- ❌ Motivational content ("unlock potential", "exciting capability")
- ❌ Future promises ("coming soon", "planned enhancements")
- ❌ Opinions without context ("always use", "not recommended")

## Output Format

```
Analyzing completed work...

Detected changes:
- Sprint: CFN Loop Recovery System
- New commands: 3
- New features: 5
- API changes: 2
- CLI updates: 4

Spawning documentation agents...
✅ Command docs agent (logs-slash-commands.md)
✅ Feature docs agent (logs-features.md)
✅ API docs agent (logs-api.md)
✅ CLI docs agent (logs-cli-redis.md)

Updating documentation...

logs-slash-commands.md
  + /recovery-status
  + /recovery-resume
  + /github-commit

logs-features.md
  + Crash Detection
  + Git Checkpoint Recovery
  + API Key Rotation

logs-api.md
  + POST /api/recovery/status
  + GET /api/checkpoints

logs-cli-redis.md
  + recovery:status
  + recovery:resume

Updating index...
✅ logs-documentation-index.md updated

Validating documentation...
✅ Markdown validation passed
✅ All links valid
✅ Sparse language compliance: 100%

Documentation update complete.
```

## Integration with CFN Loop

### Auto-Trigger Conditions
```javascript
// Automatically trigger documentation after:
if (
  epicComplete ||                    // Epic completion
  sprintComplete ||                  // Sprint completion
  majorPhaseComplete ||              // Major phase completion
  newSlashCommandAdded ||            // New slash command
  publicAPIChanged                   // Public API change
) {
  executeCommand('/cfn-loop-document');
}
```

### Memory Integration
```javascript
// Store documentation updates in swarm memory
mcp__claude-flow-novice__memory_usage({
  action: "store",
  namespace: "documentation",
  key: "last-update",
  value: JSON.stringify({
    timestamp: Date.now(),
    sprint: sprintName,
    filesUpdated: updatedFiles,
    newCommands: commandsList
  })
})
```

## Safety Features

### Backup Before Update
```bash
# Create backup of all readme files
for file in readme/*.md; do
  cp "$file" "$file.backup-$(date +%s)"
done
```

### Validation Gates
- Markdown syntax validation (no broken markup)
- Link validation (all internal links work)
- Code example testing (examples execute correctly)
- Sparse language check (pattern compliance from /readme/CLAUDE.md)
- Forbidden content check (no marketing, cost details, comparatives)

### Rollback Capability
```bash
# Rollback documentation updates if validation fails
if [ "$VALIDATION_FAILED" = true ]; then
  git restore readme/
  echo "❌ Documentation update failed validation"
  echo "Changes rolled back"
  exit 1
fi
```

## Example Workflow

```bash
# After completing CFN Loop epic
git log -1
# Output: feat(cfn-loop): Complete Epic - Recovery System v1.0

# Auto-trigger documentation
/cfn-loop-document --epic=recovery-system

# Agents analyze implementation
# - Read 50+ commits
# - Identify 12 new features
# - Find 8 new commands
# - Detect 5 API changes

# Update all affected documentation files
# Validate changes
# Commit updates automatically
```
