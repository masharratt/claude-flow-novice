# Multi-Coordinator Planning Skill

**Purpose:** Systematic planning and validation for parallel multi-coordinator execution workflows.

**Usage:**
```bash
./.claude/skills/cfn-multi-coordinator-planning/plan-multi-coordinator-work.sh [zone-config-file]
```

## Overview

Prevents Zone B-style execution failures through comprehensive pre-flight planning, resource allocation, and risk-based rollout validation.

## Core Functions

### 1. Task Configuration Validation
- Deliverable specificity verification
- Agent type diversity requirements
- Context completeness scoring
- Anti-pattern detection (consensus on vapor)

### 2. Resource Allocation Planning
- Redis namespace reservation and isolation
- Memory/CPU capacity planning per coordinator
- Coordinator limit calculations
- Monitoring overhead allocation

### 3. Dependency & Conflict Mapping
- Cross-zone dependency identification
- Shared resource conflict resolution
- Completion pathway validation
- Failure escalation planning

### 4. Risk-Based Rollout Strategy
- Zone complexity ranking
- Graduated phase rollout
- Success gate validation
- Rollback trigger definition

## Inputs

- Zone configuration file (JSON format)
- Task definitions per zone
- Resource availability parameters
- Risk tolerance settings

## Outputs

- Validated execution plan
- Resource allocation mapping
- Rollout sequence with success gates
- Risk assessment and mitigation strategies

## Validation

Comprehensive test suite covering:
- Namespace collision detection
- Resource capacity validation
- Dependency conflict resolution
- Rollout scenario testing

---