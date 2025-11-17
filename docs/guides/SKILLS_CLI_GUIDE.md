# Skills Database CLI Guide

## Overview

The Skills Database CLI (`cfn-skill`) provides a comprehensive command-line interface for managing skills, agent assignments, approval workflows, and analytics in the Claude Flow Novice system.

## Installation

```bash
npm install
npx cfn-skill --help
```

## Commands

### 1. List Skills

Display skills with filtering options.

```bash
# List all active skills
npx cfn skill list

# Filter by approval level
npx cfn skill list --approval=auto
npx cfn skill list --approval=human
npx cfn skill list --approval=escalate

# Filter by category
npx cfn skill list --category=coordination
npx cfn skill list --category=domain
npx cfn skill list --category=infrastructure

# Filter by team
npx cfn skill list --team=cfn
npx cfn skill list --team=backend

# Show pending approvals
npx cfn skill list --pending-approval

# List skills for specific agent
npx cfn skill list --agent=backend-developer
```

**Output Format:**
```
ID | Name                | Category      | Approval | Version | Status | Agents
---+---------------------+---------------+----------+---------+--------+-------
1  | jwt-authentication  | domain        | human    | 1.0.0   | active | 3
2  | redis-coordination  | coordination  | auto     | 2.1.0   | active | 12
```

### 2. Assign Skills to Agents

Map skills to agent types with priority and conditions.

```bash
# Basic assignment
npx cfn skill assign \
  --agent=backend-developer \
  --skill=jwt-authentication

# With priority (1-10, 1=highest)
npx cfn skill assign \
  --agent=backend-developer \
  --skill=jwt-authentication \
  --priority=3

# Mark as required
npx cfn skill assign \
  --agent=backend-developer \
  --skill=error-handling \
  --priority=1 \
  --required

# With conditional loading
npx cfn skill assign \
  --agent=backend-developer \
  --skill=jwt-authentication \
  --condition=auth
```

### 3. Create Skills

Add new skills to the database.

```bash
npx cfn skill create \
  --name=graphql-federation \
  --category=domain \
  --team=backend \
  --content-path=.claude/skills/graphql-federation/SKILL.md \
  --tags=graphql,federation,api \
  --version=1.0.0 \
  --approval-level=human \
  --owner=backend-team
```

**Required Parameters:**
- `--name`: Unique skill name
- `--category`: coordination, testing, infrastructure, domain, foundation
- `--content-path`: Path to skill markdown file

**Optional Parameters:**
- `--team`: Team ownership (default: "default")
- `--tags`: Comma-separated tags
- `--version`: Semantic version (default: "1.0.0")
- `--approval-level`: auto, escalate, human (default: "human")
- `--owner`: Owner name (default: "unknown")

### 4. Update Skills

Modify skill metadata.

```bash
# Update version
npx cfn skill update \
  --skill=cfn-coordination \
  --version=2.2.0

# Update tags
npx cfn skill update \
  --skill=cfn-coordination \
  --tags=redis,async,orchestration,v3

# Recalculate content hash after file changes
npx cfn skill update \
  --skill=cfn-coordination \
  --recalculate-hash

# Change approval level
npx cfn skill update \
  --skill=test-skill \
  --approval-level=auto

# Combined update
npx cfn skill update \
  --skill=cfn-coordination \
  --version=2.2.0 \
  --tags=updated,tags \
  --recalculate-hash
```

### 5. Deprecate Skills

Mark skills as deprecated with optional replacement.

```bash
# Basic deprecation
npx cfn skill deprecate \
  --skill=old-coordination

# With replacement
npx cfn skill deprecate \
  --skill=old-coordination \
  --replacement=cfn-coordination \
  --note="Replaced by v3 orchestration with enhanced monitoring"
```

### 6. Approve Skills

Approve or reject skills in the approval workflow.

```bash
# Approve skill
npx cfn skill approve \
  --skill=jwt-authentication \
  --decision=approved \
  --approver=expert@example.com \
  --reasoning="Security review passed, test coverage 95%"

# Reject skill
npx cfn skill approve \
  --skill=unsafe-skill \
  --decision=rejected \
  --approver=security@example.com \
  --reasoning="Security vulnerabilities found"

# Approve with version
npx cfn skill approve \
  --skill=jwt-authentication \
  --version=1.0.0 \
  --decision=approved
```

**Decision Values:**
- `approved`: Activates skill for use
- `rejected`: Archives skill

### 7. Escalate Skills

Escalate skills for expert review.

```bash
npx cfn skill escalate \
  --skill=redis-cluster \
  --version=1.1.0 \
  --reason="Requires security review for external Redis connection"
```

**Effect:**
- Changes `approval_level` to "escalate"
- Records escalation in approval history
- Triggers notification (if configured)

### 8. List Pending Approvals

View skills awaiting approval.

```bash
# All pending approvals
npx cfn skill pending

# Filter by approval level
npx cfn skill pending --approval-level=human
npx cfn skill pending --approval-level=escalate
```

**Output:**
```
ID | Name                | Category      | Approval Level | Version | Created
---+---------------------+---------------+----------------+---------+----------
12 | jwt-authentication  | domain        | human          | 1.0.0   | 2025-11-15
18 | redis-cluster       | infrastructure| escalate       | 1.1.0   | 2025-11-14
```

### 9. Check Approval Status

View approval history for a skill.

```bash
npx cfn skill approval-status --skill=jwt-authentication
```

**Output:**
```
Approval Status: jwt-authentication
──────────────────────────────────────────────────
Approval Level: human
Current Status: active

Approval History:

1. APPROVED (2025-11-15)
   Version: 1.0.0
   Approver: expert@example.com
   Reasoning: Security review passed
```

### 10. Analytics

Analyze skill effectiveness and approval workflows.

#### Effectiveness by Approval Level

```bash
npx cfn skill analytics effectiveness --days=30
```

**Output:**
```
Skill Effectiveness by Approval Level (30 days)
────────────────────────────────────────────────────────────

AUTO skills:
  Skills: 15
  Usages: 1,234
  Avg Confidence Impact: +0.08
  Avg Execution Time: 10.5ms

HUMAN skills:
  Skills: 8
  Usages: 456
  Avg Confidence Impact: +0.12
  Avg Execution Time: 15.2ms
```

#### Approval Velocity

```bash
npx cfn skill analytics velocity --days=30
```

**Output:**
```
Approval Velocity (30 days)
──────────────────────────────────────────────────

auto - approved:
  Count: 45
  Avg Time: 0.0 days

human - approved:
  Count: 8
  Avg Time: 5.7 days

SLA Compliance (7 days):
  Human Approvals: 87% (7/8)
```

#### Approval Bottlenecks

```bash
npx cfn skill analytics bottlenecks
```

**Output:**
```
Approval Bottlenecks
──────────────────────────────────────────────────

Longest Pending Approvals:

1. complex-auth-skill (human)
   Waiting: 14 days

2. redis-federation (escalate)
   Waiting: 9 days
```

#### Skills by Approval Level

```bash
npx cfn skill analytics by-approval
```

**Output:**
```
Skills by Approval Level
──────────────────────────────────────────────────

AUTO:
  active: 15
  deprecated: 2