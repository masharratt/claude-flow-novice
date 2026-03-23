# Validation Templates Skill

**Version:** 1.0.0
**Purpose:** Domain-specific validation criteria for CFN Loop v3

## Overview

Provides predefined validation criteria for 6 task domains. Loop 2 validators use these to assess Loop 3 output quality.

## Templates

- `software.json` - Software development validation
- `content.json` - Content creation validation
- `research.json` - Research & analysis validation
- `design.json` - Design & UX validation
- `infrastructure.json` - Infrastructure & DevOps validation
- `data.json` - Data engineering validation

## Usage

```bash
# Load template for task type
VALIDATION_CRITERIA=$(cat ./.claude/skills/validation-templates/software.json)

# Extract critical criteria
CRITICAL=$(echo "$VALIDATION_CRITERIA" | jq '.validation_criteria.critical[]')
```

## Criteria Levels

**Critical** - Must pass for PROCEED decision
- Blockers, security issues, core functionality
- Examples: Tests pass, no vulnerabilities, build succeeds

**Important** - Should pass but can iterate
- Quality standards, coverage, documentation
- Examples: Coverage ≥ 80%, linter clean, docs updated

**Nice to Have** - Optional improvements
- Optimizations, tech debt, enhancements
- Examples: Performance improved, refactored code

## Integration

Used by:
- `.claude/agents/cfn-v3-coordinator.md` - Load validation criteria
- Loop 2 validator agents - Assess Loop 3 output