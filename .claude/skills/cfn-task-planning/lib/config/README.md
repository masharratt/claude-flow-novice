---
name: cfn-task-config-init
description: Initialize structured task configuration for CFN Task Mode with scope boundaries and deliverables
dependencies: []
---

# CFN Task Config Initialization

Generates structured task configuration file for CFN Task Mode to ensure product owner has complete scope context.

## Purpose

Without explicit scope configuration:
- Product owner cannot distinguish sprint vs epic completion
- No clear in-scope / out-of-scope boundaries
- Missing deliverables list for validation
- No acceptance criteria for quality gates

## Config Structure

```json
{
  "taskId": "cfn-phase-[timestamp]",
  "taskDescription": "User's original task description",
  "mode": "mvp|standard|enterprise",
  "spawnMode": "task",
  "scope": {
    "epicGoal": "1-2 sentence high-level objective",
    "inScope": ["Specific achievable objectives"],
    "outOfScope": ["Clear boundaries"],
    "deliverables": ["Exact file paths"],
    "directory": "Target creation path",
    "acceptanceCriteria": ["Measurable requirements"]
  },
  "agents": {
    "loop3": ["implementer-agents"],
    "loop2": ["validator-agents"]
  },
  "thresholds": {
    "gate": 0.75,
    "consensus": 0.90,
    "maxIterations": 10
  },
  "createdAt": "ISO-8601 timestamp"
}
```

## Usage

```bash
./.claude/skills/cfn-task-config-init/initialize-config.sh \
  --task-description "Implement JWT authentication" \
  --mode "standard" \
  --task-id "cfn-phase-1730545678"
```

**Returns:** Path to created config file

## Config Storage

**Location:** `.cfn/task-configs/task-[task-id].json`

**Lifecycle:**
- Created: At CFN Loop Task Mode start
- Read by: Main Chat coordinator, Product Owner (both modes)
- Updated: Never (immutable scope contract)
- Cleaned: After 7 days (configurable TTL)

## Scope Extraction

The script analyzes task description to extract:

**Epic Goal:**
- Summary of high-level objective (1-2 sentences)
- Derived from imperative verbs: "Implement", "Build", "Create"

**In-Scope:**
- Explicit requirements from task description
- Concrete deliverables mentioned
- Technology stack specified

**Out-of-Scope:**
- Common scope creep patterns (analytics, admin UI, monitoring)
- Advanced features not mentioned
- Enterprise/scaling concerns (unless mode=enterprise)

**Deliverables:**
- File paths inferred from task type
- Standard patterns (src/, tests/, docs/)
- Technology-specific conventions (*.ts for TypeScript, *.rs for Rust)

**Acceptance Criteria:**
- Test coverage thresholds
- Security requirements
- Documentation completeness
- Performance benchmarks (if applicable)

## Agent Selection

Based on task analysis:

**Keywords → Implementers:**
- "API", "backend", "server" → backend-dev
- "React", "Vue", "frontend" → react-frontend-engineer
- "mobile", "iOS", "Android" → mobile-dev
- "infrastructure", "deploy" → devops-engineer
- "package", "npm", "library" → npm-package-specialist

**Complexity → Validators:**
- Simple (1-2 files): reviewer, tester
- Standard (3-5 files): +architect, +security-specialist
- Complex (>5 files): +code-analyzer, +perf-analyzer

## Integration

**In `/cfn-loop` command:**
```bash
# Step 1: Initialize config (Task Mode only)
if [[ "$SPAWN_MODE" == "task" ]]; then
  CONFIG_PATH=$(./claude/skills/cfn-task-config-init/initialize-config.sh \
    --task-description "$ARGUMENTS" \
    --mode "$MODE" \
    --task-id "$TASK_ID")
fi
```

**In Main Chat (Task Mode):**
```javascript
// Read config before spawning agents
const config = JSON.parse(Read(configPath));

// Pass scope to all agents
const loop3Context = `
Task: ${config.taskDescription}

Scope:
- Epic Goal: ${config.scope.epicGoal}
- In-Scope: ${config.scope.inScope.join(', ')}
- Out-of-Scope: ${config.scope.outOfScope.join(', ')}
- Deliverables: ${config.scope.deliverables.join(', ')}
- Directory: ${config.scope.directory}
- Acceptance Criteria:
  ${config.scope.acceptanceCriteria.map(c => `  - ${c}`).join('\n')}
`;
```

**In Product Owner:**
```javascript
// Extract context from config
const config = JSON.parse(Read(configPath));

// Make informed decision
if (decision === "PROCEED") {
  // Check if sprint complete vs epic complete
  if (config.scope.sprints && currentSprint < totalSprints) {
    nextAction = `Proceed to Sprint ${currentSprint + 1}`;
  } else {
    nextAction = "Epic complete, all deliverables met";
  }
}
```

## Benefits

**Scope Clarity:**
- Product owner knows exact boundaries
- Prevents "consensus on vapor" (approving plans without code)
- Clear deliverable verification

**Consistent Context:**
- All agents receive same scope information
- No context drift between iterations
- Product owner has complete decision context

**Sprint Management:**
- Distinguishes sprint completion from epic completion
- Tracks progress across multi-sprint epics
- Enables autonomous sprint transitions

## Dependencies

- `jq` for JSON manipulation
- `.cfn/task-configs/` directory (auto-created)
- Task Mode only (CLI mode uses Redis context storage)

## Error Handling

**Missing task description:** Exit with error
**Invalid mode:** Default to "standard"
**Config file exists:** Overwrite with warning
**JSON validation fails:** Retry with escaped strings

## Output

**Success:**
```
✅ Config initialized: .cfn/task-configs/task-cfn-phase-1730545678.json
```

**Error:**
```
❌ Failed to initialize config: [error details]
Exit code: 1
```
