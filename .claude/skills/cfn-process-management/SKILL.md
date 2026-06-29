---
name: cfn-process-management
description: "Process instrumentation and lifecycle management. Use when starting/stopping/tracking OS processes, instrumenting process metrics, or managing process lifecycle for CFN."
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

> **Orphan reaper (complements this skill's internal cleanup):** `.claude/hooks/reap-orphan-test-workers.sh` reaps leaked test workers (reparented to PID 1) and stuck CodeSearch indexers out-of-band. It is a safety net for processes this skill's lifecycle management did not stop, not a replacement for it.

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

---

## Quick Start

Start process instrumentation for an agent:
```bash
bash .claude/skills/cfn-process-management/lib/instrumentation/instrument.sh --agent-id <agent-id> --metrics cpu,memory
```

Manage process lifecycle (start, stop, restart):
```bash
bash .claude/skills/cfn-process-management/lib/lifecycle/manage.sh --action start --process <process-name>
bash .claude/skills/cfn-process-management/lib/lifecycle/manage.sh --action stop --process <process-name>
```

Check process health and metrics:
```bash
bash .claude/skills/cfn-process-management/lib/instrumentation/instrument.sh --agent-id <agent-id> --report
```

