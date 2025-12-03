---
name: cfn-test-framework
description: Test execution, running, and webapp testing for CFN
version: 1.0.0
tags: [mega-skill, testing, execution, playwright, webapp]
status: production
---

# Test Framework Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Test execution, running, and webapp testing for CFN
**Status:** Production
**Consolidates:** cfn-test-execution, cfn-test-runner, cfn-webapp-testing

---

## Overview

This mega-skill provides complete testing capabilities:
- **Execution** - Test suite execution and reporting
- **Runner** - Test process management and parallelization
- **Webapp** - Browser-based webapp testing (Playwright)

---

## Directory Structure

```
test-framework/
├── SKILL.md
├── lib/
│   ├── execution/        # From cfn-test-execution
│   ├── runner/           # From cfn-test-runner
│   └── webapp/           # From cfn-webapp-testing
└── cli/
```

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-test-execution/ | test-framework/lib/execution/ |
| cfn-test-runner/ | test-framework/lib/runner/ |
| cfn-webapp-testing/ | test-framework/lib/webapp/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated 3 testing skills into mega-skill

