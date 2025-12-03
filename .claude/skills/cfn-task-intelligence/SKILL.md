---
name: cfn-task-intelligence
description: Task classification, complexity estimation, and specialist injection
version: 1.0.0
tags: [mega-skill, classification, complexity, specialist]
status: production
---

# Task Intelligence Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Task classification, complexity estimation, and specialist injection
**Status:** Production
**Consolidates:** task-classifier, cfn-specialist-injection, cfn-complexity-estimator
**Confidence:** 7.0/10 (feedback loop coupling)

---

## Overview

This mega-skill provides intelligent task analysis:
- **Classifier** - Categorize tasks for initial agent selection
- **Complexity** - Estimate iterations needed based on task characteristics
- **Specialist** - Inject specialized agents based on feedback themes

---

## Directory Structure

```
task-intelligence/
├── SKILL.md
├── lib/
│   ├── classifier/       # From task-classifier
│   ├── complexity/       # From cfn-complexity-estimator
│   └── specialist/       # From cfn-specialist-injection
└── cli/
```

---

## Pipeline Flow

1. Classify task → determine category
2. Estimate complexity → predict iterations
3. During execution: inject specialists based on feedback

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| task-classifier/ | task-intelligence/lib/classifier/ |
| cfn-complexity-estimator/ | task-intelligence/lib/complexity/ |
| cfn-specialist-injection/ | task-intelligence/lib/specialist/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated classifier + complexity + specialist into unified intelligence skill

