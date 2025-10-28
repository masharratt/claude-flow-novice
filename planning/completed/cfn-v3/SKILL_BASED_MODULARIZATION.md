# V2 Modularization Skill Architecture

## Overview
A skill-based, coordinatorized approach to executing the 12-week V2 modularization project.

## Architecture Components

### Skill Structure
```
.claude/skills/v2-modularization/
├── SKILL.md
├── execute-modularization.sh
├── phases/
│   ├── phase1-function-extraction.sh
│   ├── phase2-module-separation.sh
│   ├── phase3-hook-system.sh
│   └── phase4-v3-integration.sh
└── validators/
    ├── validate-phase1.sh
    ├── validate-phase2.sh
    └── validate-phase3.sh
```

## Coordination Strategy
- Use CFN Loop for phase-level orchestration
- CLI spawning for granular task execution
- Redis for persistent context storage
- Modular skills for implementation logic

## Iteration Mapping
- 1 CFN Loop Iteration ≈ 1-2 Project Sprints
- Explicit phase gates with 0.90+ consensus requirement
- Adaptive iteration based on deliverable completion

## Dependency Management
- Use Redis for task dependency tracking
- Implement waiting mode for sequential dependencies
- Fail-fast validation of predecessor task completion

## Consensus & Validation
- Loop 2: Reviewers validate phase deliverables
- Validators must achieve ≥0.90 confidence
- Product Owner makes proceed/iterate decisions

## State Persistence
- Store task context in Redis with 30-day TTL
- Support crash recovery via task_id
- Minimal context pruning to preserve full history
```