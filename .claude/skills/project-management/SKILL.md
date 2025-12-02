# Project Management Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Backlog and changelog management for CFN projects
**Status:** Production
**Consolidates:** cfn-backlog-management, cfn-changelog-management

---

## Overview

This mega-skill provides project tracking:
- **Backlog** - Issue and task backlog management
- **Changelog** - Version changelog generation and maintenance

---

## Directory Structure

```
project-management/
├── SKILL.md
├── lib/
│   ├── backlog/          # From cfn-backlog-management
│   └── changelog/        # From cfn-changelog-management
└── cli/
```

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-backlog-management/ | project-management/lib/backlog/ |
| cfn-changelog-management/ | project-management/lib/changelog/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated 2 project management skills into mega-skill

