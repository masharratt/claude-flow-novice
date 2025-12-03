---
name: cfn-dependency-management
description: Task dependency extraction and context ingestion
version: 1.0.0
tags: [mega-skill, dependencies, extraction, ingestion]
status: production
---

# Dependency Management Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Task dependency extraction and context ingestion
**Status:** Production
**Consolidates:** cfn-dependency-extractor, cfn-dependency-ingestion
**Confidence:** 8.0/10 (consecutive pipeline stages)

---

## Overview

This mega-skill provides complete dependency handling:
- **Extractor** - Parse task criteria, identify dependencies, generate execution order
- **Ingestion** - Consume manifests, inject context, coordinate dependencies

---

## Directory Structure

```
dependency-management/
├── SKILL.md
├── lib/
│   ├── extractor/        # From cfn-dependency-extractor
│   └── ingestion/        # From cfn-dependency-ingestion
└── cli/
```

---

## Pipeline Flow

1. Extractor analyzes task → produces dependency graph
2. Ingestion consumes graph → injects context for execution

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-dependency-extractor/ | dependency-management/lib/extractor/ |
| cfn-dependency-ingestion/ | dependency-management/lib/ingestion/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated extractor + ingestion into unified dependency pipeline

