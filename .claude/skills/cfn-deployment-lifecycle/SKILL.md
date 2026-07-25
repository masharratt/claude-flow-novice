---
name: cfn-deployment-lifecycle
description: "Skill deployment and promotion lifecycle. Use when transitioning skills from APPROVED to DEPLOYED, or promoting skills staging to production with SLA enforcement."
version: 1.0.0
tags: [mega-skill, deployment, promotion, lifecycle]
status: production
---

# Deployment Lifecycle Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Skill deployment and promotion lifecycle management
**Status:** Production
**Consolidates:** cfn-deployment, cfn-promotion
**Confidence:** 9.5/10 (explicit dependency coupling)

---

## Overview

This mega-skill provides complete skill lifecycle management:
- **Deployment** - APPROVED → DEPLOYED transitions with atomic transactions
- **Promotion** - Staging → Production moves with SLA enforcement

---

## Directory Structure

```
deployment-lifecycle/
├── SKILL.md
├── lib/
│   ├── deployment/       # From cfn-deployment
│   └── promotion/        # From cfn-promotion
└── cli/
```

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-deployment/ | deployment-lifecycle/lib/deployment/ |
| cfn-promotion/ | deployment-lifecycle/lib/promotion/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated deployment + promotion into unified lifecycle skill

---

## Quick Start

Deploy a skill after it has been approved:
```bash
bash .claude/skills/cfn-deployment-lifecycle/lib/deployment/deploy.sh --skill <skill-name> --status APPROVED
```

Promote a skill from staging to production with SLA checks:
```bash
bash .claude/skills/cfn-deployment-lifecycle/lib/promotion/promote.sh --skill <skill-name> --from staging --to production
```

Check deployment status for a skill:
```bash
bash .claude/skills/cfn-deployment-lifecycle/lib/deployment/deploy.sh --skill <skill-name> --status-check
```

