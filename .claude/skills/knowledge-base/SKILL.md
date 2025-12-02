# Knowledge Base Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Organizational learning from CFN Loop execution
**Status:** Production
**Consolidates:** workflow-codification, cfn-playbook
**Confidence:** 7.0/10 (dual learning systems)

---

## Overview

This mega-skill provides organizational learning:
- **Workflow** - Track edge cases, failures, cost metrics, ROI
- **Playbook** - Store successful patterns, agent configs, iteration strategies

---

## Directory Structure

```
knowledge-base/
├── SKILL.md
├── lib/
│   ├── workflow/         # From workflow-codification
│   └── playbook/         # From cfn-playbook
└── cli/
```

---

## Learning System

- **Successes** → Playbook (what worked)
- **Failures** → Workflow codification (what to avoid)
- Combined: Complete organizational memory

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| workflow-codification/ | knowledge-base/lib/workflow/ |
| cfn-playbook/ | knowledge-base/lib/playbook/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated workflow + playbook into unified knowledge base

