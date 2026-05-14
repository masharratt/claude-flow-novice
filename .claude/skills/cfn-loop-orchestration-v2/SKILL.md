---
name: cfn-loop-orchestration-v2
description: "CFN Loop coordination and orchestration - gate checks, validation, consensus, Product Owner decisions. Use when orchestrating multi-agent workflows, managing iteration cycles, or coordinating Loop 2/Loop 3 dependencies."
version: 1.1.0
tags: [mega-skill, cfn-loop, orchestration, validation]
status: production
---

# Loop Orchestration Skill (Mega-Skill)

**Version:** 1.1.0
**Purpose:** CFN Loop orchestration: gate check, validation, consensus, decision
**Status:** Production
**Consolidates:** cfn-loop-orchestration, cfn-loop-output-processing, cfn-loop-validation, cfn-loop-decision

> Coordination patterns (chain/broadcast/mesh/consensus) live in the standalone `cfn-coordination` skill. This mega-skill calls those patterns; it does not own them.

---

## Overview

- **Orchestrator** - Main loop execution and gate checks
- **Output** - Agent output parsing and consensus calculation
- **Validation** - Multi-layer validation framework
- **Decision** - Product Owner PROCEED/ITERATE/ABORT logic

---

## Directory Structure

```
cfn-loop-orchestration-v2/
├── SKILL.md
├── cli/
│   ├── orchestrate.sh
│   ├── cfn-orchestrator.cjs
│   └── resolve-provider-model.cjs
└── lib/
    ├── orchestrator/   # Loop execution + gate checks
    ├── output/         # Agent output parsing, consensus
    ├── validation/     # Multi-layer validation
    └── decision/       # Product Owner decision logic
```

---

## Migration Paths

| Old Skill | New Location |
|----------|----------|
| cfn-loop-orchestration/ | cfn-loop-orchestration-v2/lib/orchestrator/ |
| cfn-loop-output-processing/ | cfn-loop-orchestration-v2/lib/output/ |
| cfn-loop-validation/ | cfn-loop-orchestration-v2/lib/validation/ |
| cfn-loop-decision/ | cfn-loop-orchestration-v2/lib/decision/ |

For coordination patterns (chain/broadcast/mesh/consensus), see `.claude/skills/cfn-coordination/SKILL.md`.

---

## Entry Point

```bash
.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh
```

---

## Version History

### 1.1.0 (2026-05-13)
- Corrected aspirational claim: cfn-coordination is a standalone skill, not consolidated here
- Added decision/ to structure (was missing)
- Updated entry point path

### 1.0.0 (2025-12-02)
- Consolidated 4 loop orchestration skills into mega-skill
