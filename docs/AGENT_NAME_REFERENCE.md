# Agent Name Reference Guide

**Version:** 2.15.6
**Last Updated:** 2025-11-18
**Purpose:** Prevent agent name mismatches in CFN Loop execution

---

## Common Agent Name Errors (Issue #4)

Users often request agents using generic names that don't match actual agent file names, causing CFN Loop to fail with:

```
Warning: Agent types not found: frontend-developer, qa-tester
```

This document provides the correct agent names to use.

---

## Agent Name Mapping

### DO NOT USE → USE THIS INSTEAD

| ❌ Generic Name (DON'T USE) | ✅ Actual Agent Name (USE THIS) | Location |
|---------------------------|--------------------------------|----------|
| `frontend-developer` | `react-frontend-engineer` | `.claude/agents/cfn-dev-team/developers/frontend/react-frontend-engineer.md` |
| `qa-tester` | `tester` | `.claude/agents/cfn-dev-team/testers/tester.md` |
| `backend-dev` | `backend-developer` | `.claude/agents/cfn-dev-team/developers/backend-developer.md` |
| `frontend-dev` | `react-frontend-engineer` | `.claude/agents/cfn-dev-team/developers/frontend/react-frontend-engineer.md` |
| `ui-dev` | `react-frontend-engineer` | `.claude/agents/cfn-dev-team/developers/frontend/react-frontend-engineer.md` |
| `test-engineer` | `tester` | `.claude/agents/cfn-dev-team/testers/tester.md` |
| `reviewer` | `code-reviewer` | `.claude/agents/cfn-dev-team/validation/code-reviewer.md` |
| `devops` | `devops-engineer` | `.claude/agents/cfn-dev-team/infrastructure/devops-engineer.md` |
| `security` | `security-specialist` | `.claude/agents/cfn-dev-team/security/security-specialist.md` |
| `database` | `database-architect` | `.claude/agents/cfn-dev-team/data/database-architect.md` |

---

## Complete Agent Directory

### Developers
- `backend-developer` - Backend API and service development
- `react-frontend-engineer` - React/TypeScript frontend development
- `mobile-dev` - React Native mobile development
- `rust-developer` - Rust systems programming

### Testers
- `tester` - Comprehensive testing and QA
- `playwright-tester` - End-to-end browser testing
- `integration-tester` - Integration and workflow testing
- `load-testing-specialist` - Performance and scalability testing
- `contract-tester` - API contract testing with Pact
- `mutation-testing-specialist` - Test quality validation

### Infrastructure
- `devops-engineer` - CI/CD, containerization, IaC
- `docker-specialist` - Docker and container orchestration
- `kubernetes-specialist` - K8s cluster management
- `monitoring-specialist` - Observability and metrics

### Data
- `database-architect` - Schema design and optimization
- `data-engineer` - ETL pipelines and data warehousing

### Security
- `security-specialist` - Security audits and threat modeling

### Validation
- `code-reviewer` - Code quality and review
- `code-quality-validator` - Technical debt assessment

### Architecture
- `system-architect` - Enterprise architecture design
- `api-designer-persona` - RESTful API design

---

## How to Find Agent Names

### Method 1: List Available Agents
```bash
# List all agent markdown files
find .claude/agents/cfn-dev-team -name "*.md" -type f | sed 's/.*\///' | sed 's/.md$//' | sort
```

### Method 2: Search by Keyword
```bash
# Search for agents related to "test"
grep -r "MUST BE USED" .claude/agents/cfn-dev-team/ | grep -i test
```

### Method 3: Check Agent Frontmatter
```bash
# Read agent description
head -20 .claude/agents/cfn-dev-team/testers/tester.md
```

---

## Usage Examples

### ❌ WRONG - Generic Names
```bash
/cfn-loop-cli "Build login UI" --agents "frontend-developer,backend-dev,qa-tester"
# Result: Error - Agent types not found
```

### ✅ CORRECT - Actual Names
```bash
/cfn-loop-cli "Build login UI" --agents "react-frontend-engineer,backend-developer,tester"
# Result: Agents spawn successfully
```

---

## Why This Happens

**Agent Resolution Logic:**
1. CFN Loop receives agent name (e.g., "frontend-developer")
2. Looks up file: `.claude/agents/cfn-dev-team/**/frontend-developer.md`
3. File not found → Error: "Agent types not found"

**Solution:**
Use exact filename (without .md extension) as agent name.

---

## CLI Mode Agent Specification

### Option 1: Inline Agent List
```bash
/cfn-loop-cli "Task description" --agents "react-frontend-engineer,tester,code-reviewer"
```

### Option 2: Let CFN Loop Select
```bash
/cfn-loop-cli "Task description" --mode=standard
# CFN Loop automatically selects appropriate agents based on task
```

### Option 3: Use Task Mode (Coordinator selects)
```bash
/cfn-loop-task "Task description" --mode=standard
# Coordinator analyzes task and spawns appropriate agents
```

---

## Agent Alias System (Future Enhancement)

**Status:** Not yet implemented
**Proposal:** Add alias mapping to support common generic names

```typescript
// Future: Agent alias mapping
const agentAliases = {
  'frontend-developer': 'react-frontend-engineer',
  'qa-tester': 'tester',
  'backend-dev': 'backend-developer',
  // ...
};
```

**Tracking:** See `planning/backlog/agent-alias-system.md`

---

## Troubleshooting

### Error: "Agent types not found: X"
**Cause:** Agent name doesn't match any file in `.claude/agents/cfn-dev-team/`
**Solution:** Use this reference guide to find correct name

### Error: "No agents specified"
**Cause:** `--agents` flag missing or empty
**Solution:** Either provide `--agents` list OR let CFN Loop auto-select

### Warning: "Agent specialization mismatch"
**Cause:** Selected agent doesn't match task requirements
**Solution:** Review agent descriptions and select appropriate specialist

---

## Related Documentation

- **Agent Profiles:** `.claude/agents/cfn-dev-team/README.md`
- **CFN Loop CLI:** `.claude/commands/cfn/CFN_LOOP_CLI_MODE.md`
- **Agent Spawning:** `.claude/skills/cfn-agent-spawning/SKILL.md`
- **Coordinator Parameters:** `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`

---

## Version History

- **2.15.6** (2025-11-18): Initial creation (Issue #4 fix)
