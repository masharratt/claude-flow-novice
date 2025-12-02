# Validation Framework Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Multi-layer validation for CFN Loop
**Status:** Production
**Consolidates:** cfn-validation-templates, cfn-defense-in-depth, cfn-deliverable-validation, cfn-validation-runner-instrumentation, json-validation

---

## Overview

This mega-skill provides complete validation capabilities:
- **Templates** - Task-type specific validation templates
- **Layers** - Defense-in-depth multi-layer validation
- **Deliverables** - File and content validation
- **Instrumentation** - Validation runner metrics
- **JSON** - Schema validation and sanitization

---

## Directory Structure

```
validation-framework/
├── SKILL.md
├── lib/
│   ├── templates/        # From cfn-validation-templates
│   ├── layers/           # From cfn-defense-in-depth
│   ├── deliverables/     # From cfn-deliverable-validation
│   ├── instrumentation/  # From cfn-validation-runner-instrumentation
│   └── json/             # From json-validation
└── cli/
```

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-validation-templates/ | validation-framework/lib/templates/ |
| cfn-defense-in-depth/ | validation-framework/lib/layers/ |
| cfn-deliverable-validation/ | validation-framework/lib/deliverables/ |
| cfn-validation-runner-instrumentation/ | validation-framework/lib/instrumentation/ |
| json-validation/ | validation-framework/lib/json/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated 5 validation skills into mega-skill
