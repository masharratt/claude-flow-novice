---
name: agent-creation-guide
description: Practical guide to creating, customizing, and maintaining AI agents in the Claude Flow Novice system
model: claude-sonnet-4
tools: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
---

# Agent Creation & Customization Guide

**Version:** 4.0.0
**Last Updated:** 2025-10-20
**Audience:** NPM Users & Developers

This is your practical guide to creating, customizing, and maintaining AI agents in the Claude Flow Novice system. Whether you're using our npm package or building custom workflows, this guide will help you create powerful, specialized agents tailored to your needs.

---

## Table of Contents

1. [Quick Start - Create Your First Agent](#quick-start-create-your-first-agent)
2. [Understanding the Agent Directory](#understanding-the-agent-directory)
3. [Agent Anatomy](#agent-anatomy)
4. [Step-by-Step Agent Creation](#step-by-step-agent-creation)
5. [Ready-to-Use Templates](#ready-to-use-templates)
6. [Customization Guide](#customization-guide)
7. [Testing Your Agent](#testing-your-agent)
8. [Advanced Concepts](#advanced-concepts)
9. [Troubleshooting](#troubleshooting)

## CFN Dev Team Specific Resources

### New Agent Structure Documentation
- [CFN Dev Team README.md](./README.md) - Comprehensive guide to our 23 production agents
- [agent-builder.md](./developers/agent-builder.md) - Specialized agent for creating new agents
- [Agent Directory Structure](./README.md#directory-structure) - Detailed overview of agent categories

### Agent Discovery Patterns
- Recursively search `.claude/agents/cfn-dev-team` subdirectories
- Use Glob: `**/*.md` to find all agent files
- Validate against agent-template-validator
- Maintain agent registry via SQLite database

---

## Quick Start - Create Your First Agent

### What You'll Learn
In 5 minutes, you'll create a custom agent that can perform specialized tasks in your workflow.

### Prerequisites
```bash
# Install claude-flow-novice
npm install claude-flow-novice

# Verify installation
npx claude-flow-novice --version
```

### Your First Agent (3 Steps)

**Step 1: Create the agent file**
```bash
mkdir -p .claude/agents/custom
touch .claude/agents/custom/my-first-agent.md
```

**Step 2: Add basic configuration**
```markdown
---
name: my-first-agent
description: |
  MUST BE USED when performing [your specific task].
  Keywords - [relevant, keywords, for, your, task]
tools: [Read, Write, Edit, Bash, TodoWrite]
model: haiku
type: specialist
---

# My First Agent

You are a specialized agent that helps with [describe what your agent does].

## Core Responsibilities
- [Responsibility 1]
- [Responsibility 2]
- [Responsibility 3]

## Approach
[Describe how your agent should approach tasks]
```

**Step 3: Test your agent**
```bash
# Spawn your agent
npx claude-flow-novice agent-spawn my-first-agent --task-id test-1
```

**That's it!** You've created a working agent.

---

## Understanding the Agent Directory

### Directory Structure

```
.claude/agents/
├── CLAUDE.md                    # This guide
├── core-agents/                 # Production-ready core agents
│   ├── coder.md                # Code implementation
│   ├── reviewer.md             # Code review & quality
│   ├── tester.md               # Testing & validation
│   └── coordinator.md          # Multi-agent coordination
├── development/                 # Development-focused agents
│   ├── backend-dev.md
│   ├── react-frontend-engineer.md
│   └── devops-engineer.md
├── security/                    # Security-focused agents
│   └── security-specialist.md
├── custom/                      # YOUR CUSTOM AGENTS GO HERE
│   └── your-agent.md
└── templates/                   # Reusable templates
    ├── redis-coordination.md
    ├── memory-operations.md
    └── team-dynamics.md
```

### Where to Put Your Agents

**Option 1: Project-Specific** (Recommended for teams)
```bash
# Lives in your project repo
<project-root>/.claude/agents/custom/
```
- ✅ Version controlled with your code
- ✅ Shared across team
- ✅ Project-specific workflows

**Option 2: Personal Agents**
```bash
# Lives in your home directory
~/.claude/agents/
```
- ✅ Available across all projects
- ✅ Personal productivity tools
- ⚠️ Not shared with team

---

## Agent Anatomy

Every agent has three main parts:

### 1. Frontmatter (YAML Configuration)

```yaml
---
name: agent-name                    # Unique identifier (lowercase, hyphens)
description: |                      # What the agent does & when to use it
  MUST BE USED when [use case].
  Keywords - [searchable, terms]
tools: [Read, Write, Edit, Bash]    # Available tools (Bash includes Redis CLI)
model: haiku                        # haiku | sonnet | opus
type: specialist                    # specialist | coordinator | swarm
capabilities:                       # Optional tags
  - api-development
  - database-design
acl_level: 1                        # Data access level (1-5)
---
```

### 2. Agent Body (Instructions)

```markdown
# Agent Name

Brief description of what this agent does.

## Core Responsibilities
- Primary duty 1
- Primary duty 2

## Approach & Methodology
How the agent thinks about and solves problems.

## Collaboration
How this agent works with other agents.

## Success Metrics
How to measure if the agent succeeded.
```

### 3. Template References (Optional)

```markdown
## Redis Coordination
→ See: `.claude/templates/redis-coordination.md`

## Memory Operations
→ See: `.claude/templates/memory-operations.md`
```

---

## Step-by-Step Agent Creation

### Step 1: Define Your Agent's Purpose

**Ask yourself:**
- What specific task will this agent perform?
- When should it be automatically triggered?
- What expertise does it need?
- How will it collaborate with other agents?

**Example:**
> "I need an agent that reviews database schema migrations for security issues and performance problems."

### Step 2: Choose Your Template

We provide 3 templates based on task complexity:

| Template | Best For | Size | Example Use |
|----------|----------|------|-------------|
| **Simple** | Single, focused tasks | 100-200 lines | File formatter, linter |
| **Standard** | Multi-step workflows | 200-400 lines | API developer, reviewer |
| **Advanced** | Complex coordination | 400-700 lines | Architect, coordinator |

### Step 3: Create Your Agent File

```bash
# For a database migration reviewer
touch .claude/agents/custom/migration-reviewer.md
```

### Step 4: Fill in the Template

**Simple Template Example:**

```markdown
---
name: migration-reviewer
description: |
  MUST BE USED when reviewing database migrations for security and performance.
  Use PROACTIVELY for SQL schema changes, migrations, database updates.
  Keywords - database, migration, schema, SQL, security, performance
tools: [Read, Grep, TodoWrite]
model: haiku
type: specialist
capabilities:
  - database-security
  - sql-review
  - performance-analysis
acl_level: 3
---

# Database Migration Reviewer

You are a specialized database expert focused on reviewing migration files for
security vulnerabilities and performance issues.

## Core Responsibilities

1. **Security Review**
   - Check for SQL injection vulnerabilities
   - Validate access control patterns
   - Review encryption of sensitive data
   - Ensure proper sanitization

2. **Performance Analysis**
   - Identify missing indexes
   - Flag inefficient queries
   - Check for N+1 query patterns
   - Validate transaction boundaries

3. **Best Practices**
   - Ensure migrations are reversible
   - Check for breaking changes
   - Validate naming conventions
   - Verify proper error handling

## Review Process

1. Read migration file
2. Analyze SQL patterns
3. Check against security checklist
4. Evaluate performance implications
5. Provide actionable feedback

## Output Format

Provide a confidence score (0.0-1.0) and structured feedback:
- Critical issues (must fix)
- Warnings (should address)
- Suggestions (nice to have)
- Approved changes

## Success Metrics
- Zero critical security issues
- No obvious performance bottlenecks
- Migrations are reversible
- Confidence score ≥ 0.85
```

### Step 5: Test Your Agent

```bash
# Test with a sample task
npx claude-flow-novice agent-spawn migration-reviewer \
  --task-id test-migration \
  --prompt "Review the migration in db/migrations/001_add_users_table.sql"
```

---

## Ready-to-Use Templates

### Template 1: Code Implementer

```markdown
---
name: my-implementer
description: |
  MUST BE USED when implementing [specific type of code].
  Keywords - implement, build, create, develop
tools: [Read, Write, Edit, Bash, TodoWrite]
model: haiku
type: specialist
acl_level: 1
---

# [Type] Implementer

You implement [specific type of code] following best practices.

## Core Responsibilities
- Write clean, maintainable code
- Follow TDD approach
- Implement features from specifications
- Optimize for readability

## Implementation Workflow
1. Understand requirements
2. Write tests first
3. Implement solution
4. Refactor for quality
5. Validate coverage

## Success Criteria
- All tests pass
- Code coverage ≥ 80%
- Follows coding standards
- Confidence score ≥ 0.80
```

### Template 2: Code Reviewer

```markdown
---
name: my-reviewer
description: |
  MUST BE USED for reviewing [specific type of code].
  Keywords - review, validate, quality, security
tools: [Read, Grep, TodoWrite]
model: haiku
type: validator
acl_level: 3
---

# [Type] Code Reviewer

You review [specific type of code] for quality, security, and best practices.

## Review Criteria

### Code Quality
- [ ] Clear variable names
- [ ] Proper error handling
- [ ] Minimal complexity
- [ ] Good documentation

### Security
- [ ] No hardcoded secrets
- [ ] Proper input validation
- [ ] Safe API usage
- [ ] No XSS/injection risks

### Performance
- [ ] Efficient algorithms
- [ ] No memory leaks
- [ ] Proper caching
- [ ] Optimized queries

## Output Format
Provide confidence score and categorized feedback:
- 🔴 Critical (blocking issues)
- 🟡 Warnings (should fix)
- 🟢 Suggestions (improvements)

## Success Metrics
- Confidence score ≥ 0.90
- Zero critical issues
- Actionable feedback provided
```

### Template 3: Specialist Agent

```markdown
---
name: my-specialist
description: |
  MUST BE USED when [specialized task].
  Use PROACTIVELY for [scenarios].
  Keywords - [domain, specific, keywords]
tools: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
model: sonnet
type: specialist
capabilities:
  - [capability-1]
  - [capability-2]
acl_level: 1
---

# [Domain] Specialist

You are an expert in [domain] with deep knowledge of [specific expertise].

## Expertise Areas
- [Area 1]: [Description]
- [Area 2]: [Description]
- [Area 3]: [Description]

## Approach
[How you analyze and solve problems in this domain]

## Tools & Techniques
- [Tool/Technique 1]
- [Tool/Technique 2]
- [Tool/Technique 3]

## Collaboration
- **With Implementers**: Provide specifications and guidance
- **With Reviewers**: Share domain expertise
- **Solo**: Full end-to-end implementation

## Success Metrics
- Domain-specific quality criteria
- Stakeholder satisfaction
- Technical accuracy
- Confidence score ≥ 0.85
```

---

## Customization Guide

### 1. Choosing the Right Model

| Model | Speed | Cost | Best For |
|-------|-------|------|----------|
| **haiku** | ⚡⚡⚡ | $ | Simple tasks, quick iterations |
| **sonnet** | ⚡⚡ | $$ | Balanced performance, most tasks |
| **opus** | ⚡ | $$$ | Complex reasoning, critical tasks |

**Recommendation:** Start with `haiku`, upgrade to `sonnet` if needed.

### 2. Selecting Tools

Available tools:
```yaml
# File Operations
tools: [Read, Write, Edit, MultiEdit]

# Search & Navigation
tools: [Grep, Glob]

# Execution
tools: [Bash]

# Coordination & Task Management
tools: [TodoWrite]

# Agent Spawning (Coordinators)
tools: [Bash]  # For CLI spawning: npx claude-flow-novice agent-spawn
```

**Note:** Agent coordination uses Redis pub/sub + CLI spawning, not MCP tools.

**Rule of Thumb:** Only include tools your agent will actually use. More tools = more complexity.

### 3. Setting ACL Levels

| Level | Scope | Use When |
|-------|-------|----------|
| **1** | Private | Agent's own data only |
| **3** | Swarm | Shared across team of agents |
| **4** | Project | Strategic decisions, audit logs |
| **5** | System | Infrastructure only |

**Most agents use level 1 or 3.**

### 4. Adding Capabilities (Tags)

```yaml
capabilities:
  - rust              # Language expertise
  - api-design        # Domain knowledge
  - security-review   # Specialized skill
  - performance-opt   # Focus area
```

These help with agent discovery and routing.

### 5. Customizing Behavior

**Tone & Style:**
```markdown
You are a [friendly/professional/technical] agent that [approach].

## Communication Style
- Use [formal/casual] language
- Provide [detailed/concise] explanations
- Focus on [theory/practice]
```

**Decision-Making:**
```markdown
## Decision Framework
When [situation], prioritize:
1. [Criterion 1]
2. [Criterion 2]
3. [Criterion 3]
```

**Error Handling:**
```markdown
## Error Handling Strategy
- For [error type]: [action]
- If [condition]: [fallback]
- Always: [safety measure]
```

---

## Testing Your Agent

### Manual Testing

```bash
# Basic spawn test
npx claude-flow-novice agent-spawn my-agent --task-id test-1

# With specific prompt
npx claude-flow-novice agent-spawn my-agent \
  --task-id test-2 \
  --prompt "Specific task instructions"
```

### Integration Testing

Create a test task:
```bash
# Create test directory
mkdir -p tests/agents

# Create test file
cat > tests/agents/test-my-agent.sh << 'EOF'
#!/bin/bash
set -e

echo "Testing my-agent..."

# Spawn agent
npx claude-flow-novice agent-spawn my-agent \
  --task-id test-integration

# Verify output
# [Add your verification logic]

echo "✅ Test passed"
EOF

chmod +x tests/agents/test-my-agent.sh

# Run test
./tests/agents/test-my-agent.sh
```

### Validation Checklist

Before deploying your agent:

- [ ] YAML frontmatter is valid
- [ ] Name is unique and descriptive
- [ ] Description includes use cases and keywords
- [ ] Tools list includes only needed tools
- [ ] Core responsibilities are clear
- [ ] Success metrics are defined
- [ ] Agent tested with sample tasks
- [ ] Documentation is complete

---

## Advanced Concepts

### Multi-Agent Coordination

Agents can work together using Redis pub/sub and CLI spawning:

```markdown
## Redis Coordination
→ See: `.claude/templates/redis-coordination.md`

### Agent Spawning Pattern
```bash
# Spawn agents via CLI (coordinators only)
npx claude-flow-novice agent-spawn backend-dev --task-id "${TASK_ID}"
npx claude-flow-novice agent-spawn reviewer --task-id "${TASK_ID}"
```

### Signaling Pattern
```bash
# Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Wait for other agent (zero-token blocking)
redis-cli blpop "swarm:${TASK_ID}:other-agent:done" 30
```
```

### Memory Operations

Agents can persist and share data:

```markdown
## Memory Operations
→ See: `.claude/templates/memory-operations.md`

### SQLite Integration
```typescript
await sqlite.memoryAdapter.set(
  `agent/${agentId}/data/${taskId}`,
  { confidence: 0.85, status: 'complete' },
  { aclLevel: 1, ttl: 2592000 }
);
```
```

### CFN Loop Integration

For self-correcting workflows:

```markdown
## CFN Loop Mechanics
→ See: `.claude/templates/cfn-loop-mechanics.md`

Agents participate in 3-loop validation:
- Loop 3: Implementation
- Loop 2: Validation
- Loop 4: Strategic decisions
```

### Lifecycle Hooks

```yaml
lifecycle:
  pre_task: |
    # Runs before agent starts
    echo "Initializing agent..."

  post_task: |
    # Runs after agent completes
    echo "Agent completed with confidence: ${CONFIDENCE_SCORE}"
```

### Validation Hooks

```yaml
validation_hooks:
  - agent-template-validator      # Validates agent structure
  - cfn-loop-memory-validator     # Validates memory operations
  - test-coverage-validator       # Validates test coverage
```

---

## Troubleshooting

### Agent Not Found

**Problem:** `Error: Agent 'my-agent' not found`

**Solutions:**
1. Check file is in `.claude/agents/` directory
2. Verify filename matches agent name: `my-agent.md`
3. Ensure YAML frontmatter has `name: my-agent`

### Invalid YAML

**Problem:** `Error: Invalid YAML frontmatter`

**Solutions:**
1. Check YAML syntax with `---` delimiters
2. Ensure proper indentation (2 spaces)
3. Quote special characters in strings
4. Validate at https://www.yamllint.com/

### Agent Behavior Issues

**Problem:** Agent doesn't perform as expected

**Solutions:**
1. Review and clarify core responsibilities
2. Simplify instructions (less is often more)
3. Add specific examples of desired behavior
4. Test with varied prompts
5. Check model choice (try upgrading haiku → sonnet)

### Tools Not Working

**Problem:** `Error: Tool [X] not available`

**Solutions:**
1. Verify tool is in frontmatter `tools` list
2. Check spelling matches exactly
3. For agent spawning, use Bash tool with CLI commands
4. Review tool permissions

### Memory/Coordination Issues

**Problem:** Agents can't share data

**Solutions:**
1. Check Redis is running: `redis-cli ping`
2. Verify ACL levels are compatible
3. Ensure memory keys follow patterns
4. Check SQLite database exists

---

## Example: Complete Custom Agent

Here's a real-world example - a Terraform reviewer agent:

```markdown
---
name: terraform-reviewer
description: |
  MUST BE USED when reviewing Terraform infrastructure code.
  Use PROACTIVELY for IaC review, security validation, cost optimization.
  Keywords - terraform, infrastructure, IaC, cloud, AWS, security
tools: [Read, Grep, Glob, TodoWrite]
model: sonnet
type: specialist
capabilities:
  - terraform
  - infrastructure-as-code
  - cloud-security
  - cost-optimization
acl_level: 3
---

# Terraform Infrastructure Reviewer

You are an infrastructure expert specializing in Terraform code review with
focus on security, best practices, and cost optimization.

## Core Responsibilities

### 1. Security Review
- Check for exposed secrets or credentials
- Validate IAM policies (principle of least privilege)
- Review security group rules
- Ensure encryption at rest and in transit
- Verify logging and monitoring

### 2. Best Practices
- Validate resource naming conventions
- Check for proper tagging strategy
- Ensure state management best practices
- Review module structure and reusability
- Validate provider versioning

### 3. Cost Optimization
- Identify over-provisioned resources
- Flag expensive resource types
- Suggest reserved instances where applicable
- Review data transfer patterns
- Validate auto-scaling configurations

### 4. Compliance
- Check against company standards
- Validate regulatory requirements
- Ensure disaster recovery provisions
- Review backup strategies

## Review Process

1. **Parse Terraform Files**
   - Read all `.tf` files in directory
   - Identify resource types and configurations
   - Map dependencies

2. **Security Analysis**
   - Run security checklist
   - Flag critical issues
   - Identify vulnerabilities

3. **Cost Analysis**
   - Estimate monthly costs
   - Identify optimization opportunities
   - Calculate potential savings

4. **Compliance Check**
   - Verify against standards
   - Document exceptions
   - Recommend remediation

5. **Generate Report**
   - Categorize findings by severity
   - Provide specific recommendations
   - Include confidence score

## Output Format

### Summary
- Overall confidence score (0.0-1.0)
- Total issues found by severity
- Estimated monthly cost
- Compliance status

### Detailed Findings

**🔴 Critical Issues** (must fix before deployment)
- [Issue description]
- File: `path/to/file.tf:line`
- Recommendation: [specific fix]

**🟡 Warnings** (should address)
- [Issue description]
- Impact: [description]
- Suggestion: [improvement]

**🟢 Optimizations** (nice to have)
- [Opportunity description]
- Potential savings: [amount]
- Effort: [low/medium/high]

## Success Metrics
- Security score ≥ 0.90
- Zero critical vulnerabilities
- Cost optimization opportunities identified
- Compliance requirements met
- Clear, actionable feedback

## Collaboration
- **With DevOps**: Review infrastructure changes
- **With Security Team**: Validate security posture
- **With Finance**: Optimize cloud spend
- **Solo**: Complete IaC review and reporting
```

**Usage:**
```bash
npx claude-flow-novice agent-spawn terraform-reviewer \
  --prompt "Review Terraform files in ./infrastructure"
```

---

## Quick Reference

### Common Agent Patterns

**Code Writer:**
```yaml
tools: [Read, Write, Edit, Bash, TodoWrite]
model: haiku
type: specialist
acl_level: 1
```

**Code Reviewer:**
```yaml
tools: [Read, Grep, TodoWrite]
model: sonnet
type: validator
acl_level: 3
```

**Coordinator:**
```yaml
tools: [Read, Bash, TodoWrite]  # Bash for Redis CLI + agent spawning
model: sonnet
type: coordinator
acl_level: 3
```

### File Naming Convention

```
.claude/agents/
├── [category]/
│   └── [agent-name].md    # lowercase, hyphens, descriptive
```

**Good:** `terraform-reviewer.md`, `api-security-validator.md`
**Bad:** `TerraformReviewer.md`, `agent1.md`, `myAgent.md`

### Essential YAML Fields

**Minimum required:**
```yaml
---
name: agent-name
description: |
  What the agent does and when to use it
tools: [Read, Write]
model: haiku
---
```

**Recommended:**
```yaml
---
name: agent-name
description: |
  MUST BE USED when [use case]
  Keywords - [keywords]
tools: [Read, Write, Edit, TodoWrite]
model: haiku
type: specialist
capabilities: [capability-tags]
acl_level: 1
---
```

---

## Resources

### Template Files
- `.claude/templates/redis-coordination.md` - Multi-agent coordination
- `.claude/templates/memory-operations.md` - Data persistence
- `.claude/templates/team-dynamics.md` - Agent collaboration
- `.claude/templates/cfn-loop-mechanics.md` - Self-correcting workflows

### Example Agents
- `.claude/agents/core-agents/coder.md` - Code implementation
- `.claude/agents/core-agents/reviewer.md` - Code review
- `.claude/agents/core-agents/tester.md` - Testing & validation
- `.claude/agents/development/backend-dev.md` - Backend development
- `.claude/agents/security/security-specialist.md` - Security analysis

### Documentation
- `README.md` - Project overview
- `.claude/skills/` - Reusable skill modules
- `.claude/commands/` - Slash command definitions

### Technical Deep-Dive

For advanced users who want to understand the theoretical foundations:
- [Format Selection Principles](./agent-principles/format-selection.md)
- [Agent Type Guidelines](./agent-principles/agent-type-guidelines.md)
- [Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)
- [Quality Metrics & Validation](./agent-principles/quality-metrics.md)

---

## Need Help?

### Common Questions

**Q: How many agents should I create?**
A: Start with 1-3 focused agents. Add more as needed. Quality > quantity.

**Q: Should I modify core agents?**
A: No, create custom agents instead. Core agents may be updated in new releases.

**Q: Can agents call other agents?**
A: Yes! Coordinators spawn agents via CLI: `npx claude-flow-novice agent-spawn [agent-name]`

**Q: How do I share agents with my team?**
A: Put them in `.claude/agents/` and commit to git.

**Q: What's the difference between skills and agents?**
A: Skills are reusable behaviors (like templates). Agents are executable workers that use skills.

### Getting Help

1. Check existing agents for examples
2. Review template files for patterns
3. Test incrementally with simple tasks
4. Start simple, add complexity gradually
5. Open issues on GitHub for bugs

---

## What's Next?

Now that you understand agent creation, explore:

1. **Multi-Agent Workflows** - Coordinate multiple agents for complex tasks
2. **CFN Loop Integration** - Build self-correcting pipelines
3. **Custom Skills** - Create reusable behavior modules
4. **Web Portal** - Monitor agent execution in real-time
5. **Advanced Coordination** - Redis pub/sub, memory operations

**Ready to build something amazing? Start creating your first agent!**

---

## CFN Loop Completion Protocol (MODE-SPECIFIC)

**Date:** 2025-11-06
**Status:** Memory Leak Fix Applied - ANTI-023 Resolution

### ⚠️ CRITICAL: Mode-Specific Completion Required

Agents MUST use different completion protocols based on how they were spawned:

### Task Mode (Spawned via Task() tool in Main Chat)

**Simply complete your work and return structured output.**

```json
{
  "confidence": 0.85,
  "status": "COMPLETE|NEEDS_WORK",
  "summary": "Brief summary of work completed",
  "deliverables": ["file1.ts", "file2.test.ts"]
}
```

**❌ DO NOT:**
- Use Redis commands (redis-cli)
- Execute bash scripts for completion
- Signal completion via CLI tools
- **Main Chat receives your output automatically**

### CLI Mode (Spawned via `npx claude-flow-novice agent-spawn`)

**Step 1: Complete Work**
Execute assigned task (implementation, validation, review, etc.)

**Step 2: Signal Completion**
```bash
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

**Step 3: Report Confidence Score and Exit**
```bash
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence [0.0-1.0] \
  --iteration 1
```

### How to Tell Which Mode You're In

- **Task Mode**: You were spawned via `Task("agent-name", "...")` in Main Chat
- **CLI Mode**: You were spawned via `npx claude-flow-novice agent-spawn ...` command

### Why This Matters

- **Task Mode**: Main Chat handles everything, just return results
- **CLI Mode**: Coordinator needs Redis signals to collect confidence scores
- **Mixed protocols cause memory leaks** (ANTI-023 pattern)

### Related Documentation

- **Memory Leak Fix:** `docs/bugs/BUG_MEMORY_LEAK_VALIDATOR_FIX.md`
- **Agent Lifecycle:** `.claude/agents/AGENT_LIFECYCLE.md`
- **Main Documentation:** `CLAUDE.md:333-357` (Mode-specific protocols)

---

**Document Version:** 4.2.0 (Memory Leak Fix - Mode-Specific Protocols)
**Last Updated:** 2025-11-06
**Maintained By:** Claude Flow Novice Team
**Feedback:** We'd love to hear how you're using agents! Share your creations.
