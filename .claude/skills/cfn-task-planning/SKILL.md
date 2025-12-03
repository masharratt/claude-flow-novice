---
name: cfn-task-planning
description: Task analysis, classification, configuration, and decomposition for CFN Loop
version: 1.0.0
tags: [mega-skill, task, planning, classification, decomposition]
status: production
---

# Task Planning Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Complete task analysis, classification, configuration, and decomposition
**Status:** Production
**Consolidates:** task-classifier, cfn-task-config-init, cfn-task-decomposition, cfn-task-audit

---

## Overview

This mega-skill provides complete task planning functionality:
- **Classifier** - Task type classification with multi-domain detection
- **Config** - Task configuration initialization
- **Decomposition** - Task breakdown into subtasks
- **Audit** - Task audit trail storage and retrieval

---

## Directory Structure

```
task-planning/
├── SKILL.md                          # This file
├── lib/
│   ├── classifier/                   # Task classification (from task-classifier)
│   │   ├── classify-task.sh          # Multi-domain classification
│   │   └── README.md                 # Classification documentation
│   ├── config/                       # Configuration (from cfn-task-config-init)
│   │   ├── initialize-config.sh      # Config initialization
│   │   └── README.md                 # Config documentation
│   ├── decomposition/                # Decomposition (from cfn-task-decomposition)
│   │   └── task-decomposer.sh        # Task breakdown
│   └── audit/                        # Audit (from cfn-task-audit)
│       ├── store-task-audit.sh       # Store audit data
│       └── get-audit-data.sh         # Retrieve audit data
└── cli/                              # CLI wrappers
    ├── classify-task.sh              # → lib/classifier/classify-task.sh
    ├── init-config.sh                # → lib/config/initialize-config.sh
    └── decompose-task.sh             # → lib/decomposition/task-decomposer.sh
```

---

## Quick Start

### 1. Classify a Task

```bash
# Simple output (backward compatible)
./cli/classify-task.sh "Implement JWT authentication"
# Output: software-development

# JSON output (full features)
./cli/classify-task.sh "Implement JWT authentication" --format=json
# Output:
# {
#   "task_type": "software-development",
#   "domains": ["backend", "security"],
#   "complexity": "low",
#   ...
# }
```

### 2. Initialize Task Config

```bash
./cli/init-config.sh \
  --task-id "task-123" \
  --description "Implement user auth" \
  --mode standard
```

### 3. Decompose a Task

```bash
./cli/decompose-task.sh \
  --task "Build e-commerce checkout flow" \
  --max-subtasks 5
```

---

## Module Details

### Classifier Module (lib/classifier/)

**Purpose:** Task type and domain classification

**Features:**
- Task type classification (software, content, research, design, infrastructure, data)
- Multi-domain detection (frontend, backend, security, devops, testing, database, documentation)
- Complexity assessment (low, medium, high)
- JSON output format with detailed keyword counts
- Backward compatible simple output

**Task Types:**
| Type | Keywords |
|------|----------|
| software-development | implement, build, code, api, backend, frontend |
| content-creation | write, article, blog, documentation, guide |
| research | research, analyze, investigate, data analysis |
| design | design, ui, ux, mockup, wireframe |
| infrastructure | deploy, kubernetes, docker, ci/cd, cloud |
| data-engineering | etl, pipeline, data warehouse, streaming |

### Config Module (lib/config/)

**Purpose:** Task configuration initialization

**Features:**
- Creates structured task configurations
- Sets scope boundaries and deliverables
- Supports mode-specific settings (mvp, standard, enterprise)

### Decomposition Module (lib/decomposition/)

**Purpose:** Task breakdown into subtasks

**Features:**
- Analyzes task description
- Generates subtask list with dependencies
- Topological sorting for execution order

### Audit Module (lib/audit/)

**Purpose:** Task audit trail management

**Features:**
- Store task execution data
- Retrieve historical audit data
- Track iterations and confidence scores

---

## Integration with CFN Loop

```bash
# 1. Classify task
TASK_JSON=$(./cli/classify-task.sh "$TASK_DESCRIPTION" --format=json)
TASK_TYPE=$(echo "$TASK_JSON" | jq -r '.task_type')
COMPLEXITY=$(echo "$TASK_JSON" | jq -r '.complexity')

# 2. Initialize config
./cli/init-config.sh --task-id "$TASK_ID" --description "$TASK_DESCRIPTION"

# 3. Decompose if complex
if [ "$COMPLEXITY" = "high" ]; then
  SUBTASKS=$(./cli/decompose-task.sh --task "$TASK_DESCRIPTION")
fi

# 4. Store audit data after completion
./lib/audit/store-task-audit.sh --task-id "$TASK_ID" --result "success" --confidence 0.92
```

---

## Migration from Individual Skills

### Old Paths → New Paths

| Old Path | New Path |
|----------|----------|
| `.claude/skills/task-classifier/classify-task.sh` | `.claude/skills/task-planning/lib/classifier/classify-task.sh` |
| `.claude/skills/cfn-task-config-init/initialize-config.sh` | `.claude/skills/task-planning/lib/config/initialize-config.sh` |
| `.claude/skills/cfn-task-decomposition/task-decomposer.sh` | `.claude/skills/task-planning/lib/decomposition/task-decomposer.sh` |
| `.claude/skills/cfn-task-audit/store-task-audit.sh` | `.claude/skills/task-planning/lib/audit/store-task-audit.sh` |
| `.claude/skills/cfn-task-audit/get-audit-data.sh` | `.claude/skills/task-planning/lib/audit/get-audit-data.sh` |

---

## Version History

### 1.0.0 (2025-12-02) - Mega-Skill Creation
- Merged: task-classifier, cfn-task-config-init, cfn-task-decomposition, cfn-task-audit
- Added: CLI wrappers
- Added: Unified documentation

---

## Dependencies

- **Bash:** 4.0+
- **jq:** JSON processing (for JSON output)
- **SQLite3:** Audit storage (optional)
