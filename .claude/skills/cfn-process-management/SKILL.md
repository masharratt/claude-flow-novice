---
name: cfn-process-management
description: Process instrumentation and lifecycle management
version: 1.0.0
tags: [mega-skill, process, monitoring, lifecycle]
status: production
---

# Process Management Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Process instrumentation and lifecycle management
**Status:** Production
**Consolidates:** cfn-process-instrumentation, cfn-process-lifecycle

---

## Overview

This mega-skill provides process management:
- **Instrumentation** - Process metrics and monitoring
- **Lifecycle** - Process start/stop/restart management

---

## Directory Structure

```
process-management/
├── SKILL.md
├── lib/
│   ├── instrumentation/  # From cfn-process-instrumentation
│   └── lifecycle/        # From cfn-process-lifecycle
└── cli/
```

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-process-instrumentation/ | process-management/lib/instrumentation/ |
| cfn-process-lifecycle/ | process-management/lib/lifecycle/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated 2 process skills into mega-skill

