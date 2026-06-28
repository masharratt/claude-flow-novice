---
name: cfn-routing-config
description: "Provider routing and hybrid routing config for CFN. Use when configuring which API provider handles requests, or setting up hybrid multi-provider routing."
version: 1.0.0
tags: [mega-skill, routing, provider, hybrid, api]
status: production
---

# Routing Config Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Provider routing and hybrid configuration for CFN
**Status:** Production
**Consolidates:** cfn-provider-routing, cfn-hybrid-routing

---

## Overview

This mega-skill provides complete routing configuration:
- **Provider** - API provider selection and routing rules
- **Hybrid** - Hybrid mode routing (CLI + Task coordination)

---

## Directory Structure

```
routing-config/
├── SKILL.md
├── lib/
│   ├── provider/         # From cfn-provider-routing
│   └── hybrid/           # From cfn-hybrid-routing
└── cli/
```

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-provider-routing/ | routing-config/lib/provider/ |
| cfn-hybrid-routing/ | routing-config/lib/hybrid/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated 2 routing skills into mega-skill

