# The Definitive Guide to Agent Profile Design

**Version:** 2.0.0
**Last Updated:** 2025-09-30
**Status:** Production-Ready with Empirical Validation

This document is the single source of truth for creating, editing, and validating agent profiles in the Claude Flow ecosystem. It incorporates empirical findings from our comprehensive Rust benchmarking system and establishes evidence-based best practices.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Universal Principles](#core-universal-principles)
3. [Agent Profile Structure](#agent-profile-structure)
4. [Examples & Templates](#examples--templates)
5. [Specialized Guidance](#specialized-guidance)

---

## Quick Start

### The Three Golden Rules

1. **Complexity-Verbosity Inverse Law**: As task complexity increases, prompt verbosity should DECREASE
2. **Priming Paradox**: Verbose prompts excel at basic tasks, minimal prompts excel at complex reasoning
3. **Rust Validation**: These findings are validated for Rust; hypotheses for other languages

### Format Selection in 30 Seconds

```yaml
Is the task BASIC (parsing, simple logic, CRUD)?
  → Use CODE-HEAVY format (+43% quality improvement)

Is the task COMPLEX with clear requirements (architecture, review)?
  → Use MINIMAL format (avoid over-constraining)

Is the task MEDIUM complexity with structured steps?
  → Use METADATA format (structured guidance)
```

**For detailed format guidance:** See [Format Selection Principles](./agent-principles/format-selection.md)

---

## Core Universal Principles

### 1. Agent Profile Structure **REQUIRED FORMAT**

Every agent MUST include:

#### Frontmatter (YAML)

```yaml
---
name: agent-name                    # REQUIRED: Lowercase with hyphens
description: |                      # REQUIRED: Clear, keyword-rich description
  MUST BE USED when [primary use case].
  Use PROACTIVELY for [specific scenarios].
  ALWAYS delegate when user asks [trigger phrases].
  Keywords - [comma-separated keywords for search]
tools: [Read, Write, Edit, Bash, TodoWrite, mcp__claude-flow__swarm_init, mcp__claude-flow__agent_spawn]  # REQUIRED: Comma-separated list, can include MCP commands
model: sonnet                       # REQUIRED: sonnet | opus | haiku
color: seagreen                     # REQUIRED: Visual identifier
type: specialist                    # OPTIONAL: specialist | coordinator | swarm
capabilities:                       # OPTIONAL: Array of capability tags
  - rust
  - error-handling
lifecycle:                          # OPTIONAL: Hooks for agent lifecycle
  pre_task: "npx claude-flow@alpha hooks pre-task"
  post_task: "npx claude-flow@alpha hooks post-task"
hooks:                             # OPTIONAL: Integration points
  memory_key: "agent-name/context"
  validation: "post-edit"
triggers:                          # OPTIONAL: Automatic activation patterns
  - "build rust"
  - "implement concurrent"
constraints:                       # OPTIONAL: Limitations and boundaries
  - "Do not modify production database"
---
```

#### Body Structure

```markdown
# Agent Name

[Opening paragraph: WHO you are, WHAT you do]

## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run:

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "agent/step" --structured
```

[Why this matters and what it provides]

## Core Responsibilities

[Primary duties in clear, actionable bullet points]

## Approach & Methodology

[HOW the agent accomplishes tasks - frameworks, patterns, decision-making]

## Integration & Collaboration

[How this agent works with other agents and the broader system]

## Success Metrics

[How to measure agent effectiveness]
```

---

### 2. The Complexity-Verbosity Inverse Law

**Empirical Finding:** Task complexity and prompt verbosity have an inverse relationship.

```
Basic Tasks (parsing, CRUD):
  - Code-Heavy: 85.3% quality (+43% vs Minimal)
  - Best approach: Detailed examples with step-by-step guidance

Complex Tasks (architecture, lock-free algorithms):
  - Minimal: 87.2% quality (+31% vs Code-Heavy)
  - Best approach: High-level principles with reasoning freedom
```

**Why This Matters:**
- Basic tasks benefit from concrete patterns (priming effect)
- Complex tasks need creative freedom (over-specification creates tunnel vision)
- Medium tasks need structured scaffolding without over-constraining

**For detailed analysis:** See [Format Selection Principles](./agent-principles/format-selection.md)

---

### 3. Mandatory Post-Edit Validation

**UNIVERSAL REQUIREMENT:** Every agent MUST run post-edit hooks after file modifications.

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] \
  --memory-key "agent-name/context" \
  --structured
```

**Benefits:**
- TDD compliance verification
- Security analysis (XSS, eval(), hardcoded credentials)
- Formatting validation
- Test coverage analysis
- Cross-agent memory coordination
- Actionable recommendations

**For integration details:** See [Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)

---

### 4. Integration with Claude Flow

#### Hook System

Every agent integrates with:
- **Pre-task hooks**: Initialize context, set up memory namespace
- **Post-edit hooks**: Validate quality, coordinate with other agents
- **Post-task hooks**: Finalize task, export metrics
- **Session management**: Persist state across sessions

#### Memory Coordination

```javascript
// Memory key pattern: {agent-type}/{domain}/{aspect}
"architect/auth/design"
"coder/auth/implementation"
"reviewer/auth/feedback"
"tester/auth/coverage"
```

#### Swarm Coordination

When spawning multiple agents:
1. Run pre-task hook
2. Execute work
3. Run post-edit hook for each file
4. Store results in memory
5. Run post-task hook

**For detailed integration:** See [Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)

---

## Agent Profile Structure

### The Three Formats

1. **MINIMAL (200-400 lines)**: For complex, strategic tasks requiring reasoning freedom
2. **METADATA (400-700 lines)**: For medium complexity with structured workflows
3. **CODE-HEAVY (700-1200 lines)**: For basic tasks benefiting from concrete examples

**Detailed format specifications:** [Format Selection Principles](./agent-principles/format-selection.md)

### Format Selection Decision Tree

```
Task Complexity Assessment
        │
    ┌───┴────┐
    │        │
  BASIC   COMPLEX
    │        │
CODE-HEAVY MINIMAL
```

**Full decision tree and factors:** [Format Selection Principles](./agent-principles/format-selection.md)

---

## Examples & Templates

### Example 1: Minimal Format (Complex Tasks)

**File:** `.claude/agents/architecture/system-architect.md`

```markdown
---
name: system-architect
description: |
  MUST BE USED when designing enterprise-grade system architecture.
  Use PROACTIVELY for distributed systems, event-driven architecture.
  Keywords - architecture, system design, microservices, scalability
tools: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
model: sonnet
color: seagreen
---

# System Architect Agent

You are a senior system architect with deep expertise in designing
scalable, maintainable, and robust software systems.

## 🚨 MANDATORY POST-EDIT VALIDATION

After EVERY file edit:
```bash
npx claude-flow@alpha hooks post-edit [FILE] --memory-key "architect/step" --structured
```

## Core Responsibilities

- Design system architectures from business requirements
- Make strategic technical decisions with clear rationale
- Define component boundaries and interactions
- Ensure scalability, security, and maintainability
- Create Architecture Decision Records (ADRs)

## Architectural Approach

### Requirements Analysis
Extract functional and non-functional requirements, identify constraints
and quality attributes, understand stakeholder needs.

### Design Process
Apply appropriate patterns (microservices, event-driven, CQRS), consider
trade-offs, document decisions with ADRs.

### Quality Attributes
- Performance: Response times, throughput
- Scalability: Horizontal and vertical scaling
- Security: Zero-trust, defense-in-depth
- Maintainability: Modular design, clear interfaces
- Reliability: Fault tolerance, disaster recovery

## Collaboration

- Work with Coder agents for implementation guidance
- Coordinate with Reviewer agents for design validation
- Provide specifications to DevOps for infrastructure
- Share ADRs via memory system

## Success Metrics

- Architecture meets quality attributes
- Team can implement the design
- Documentation is clear and comprehensive
- Trade-offs are explicitly documented
```

**For more examples:** [Format Selection Principles](./agent-principles/format-selection.md)

---

### Example 2: Metadata Format (Medium Tasks)

**For complete example:** See API Developer template in [Format Selection Principles](./agent-principles/format-selection.md)

---

### Example 3: Code-Heavy Format (Basic Tasks)

**For complete example:** See Rust Coder template in [Format Selection Principles](./agent-principles/format-selection.md)

---

## Specialized Guidance

### By Agent Type

Different agent types have different format requirements:

- **Coder Agents**: Code-Heavy for basic tasks, Minimal for complex algorithms
- **Reviewer Agents**: Minimal format (requires contextual reasoning)
- **Architect Agents**: Minimal format (strategic thinking)
- **Tester Agents**: Code-Heavy for unit tests, Metadata for test strategy
- **Researcher Agents**: Minimal format (open-ended exploration)
- **DevOps Agents**: Metadata format (structured workflows)

**Full type-specific guidance:** [Agent Type Guidelines](./agent-principles/agent-type-guidelines.md)

---

### Prompt Engineering

Key principles for effective agent prompts:

1. **Clear Role Definition**: Establish expertise domain
2. **Specific Responsibilities**: Concrete, actionable duties
3. **Appropriate Tool Selection**: Only essential tools
4. **Integration Points**: Explicit collaboration contracts
5. **Validation Hooks**: Mandatory quality gates

**Anti-patterns to avoid:**
- Over-specification (tunnel vision)
- Under-specification (too vague)
- Example overload (cognitive burden)
- Rigid checklists (context-insensitive)

**Detailed best practices:** [Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)

---

### Quality Metrics & Validation

**Pre-Deployment Checklist:**
- [ ] Valid YAML frontmatter
- [ ] Format matches task complexity
- [ ] Clear responsibilities defined
- [ ] Integration points specified
- [ ] Post-edit hook included

**Ongoing Monitoring:**
- First-time success rate (>80%)
- Iteration count (<3)
- Quality score (>85%)
- User satisfaction (>4.5/5)

**Comprehensive validation guide:** [Quality Metrics & Validation](./agent-principles/quality-metrics.md)

---

## Benchmark System

### Running Benchmarks

```bash
cd benchmark/agent-benchmarking

# Run Rust benchmarks (VALIDATED)
node index.js run 5 --rust --verbose

# Run JavaScript benchmarks (HYPOTHESIS)
node index.js run 5 --verbose

# Analyze results
node index.js analyze
```

**Detailed benchmarking guide:** [Quality Metrics & Validation](./agent-principles/quality-metrics.md)

---

## Conclusion

### Key Takeaways

1. **Format matters**: Choose based on task complexity (inverse relationship)
2. **Validation is critical**: Hooks ensure quality and coordination
3. **Integration is essential**: Memory and swarm systems enable collaboration
4. **Continuous improvement**: Use metrics to refine agents

### Next Steps

1. Choose appropriate format for your agent
2. Use templates as starting points
3. Test with benchmark system
4. Deploy with validation hooks
5. Monitor and iterate

---

## Reference Documents

- **[Format Selection Principles](./agent-principles/format-selection.md)**: Detailed format guidance, benchmarking findings, decision tree
- **[Agent Type Guidelines](./agent-principles/agent-type-guidelines.md)**: Type-specific recommendations for coders, reviewers, architects, testers, researchers, DevOps
- **[Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)**: Effective prompt patterns, anti-patterns, integration with Claude Flow
- **[Quality Metrics & Validation](./agent-principles/quality-metrics.md)**: Validation checklists, benchmark system, continuous improvement

---

**Document Version:** 2.0.0
**Last Updated:** 2025-09-30
**Maintained By:** Claude Flow Core Team
**Feedback:** Document improvements and findings for future versions
