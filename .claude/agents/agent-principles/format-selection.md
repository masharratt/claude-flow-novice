---
name: format-selection
description: Documentation file for format-selection
type: documentation
acl_level: 3  # Swarm-level documentation
validation_hooks:
  - agent-template-validator
lifecycle:
  pre_task: |
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', 'documentation', 'active', CURRENT_TIMESTAMP)"
  post_task: |
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"
---

## 🚀 OPTIMIZED FOR CLI/REDIS/SQLITE ENVIRONMENTS

**Your role is optimized for:**
- **Redis pub/sub communication** for real-time agent coordination
- **SQLite memory management** with ACL-secured data persistence
- **CFN Loop integration** for systematic development workflows
- **Evidence chain optimization** for transparent development processes


## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run the enhanced post-edit hook:

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "format-selection/${AGENT_ID}/step" --structured
```

**This provides:**
- 🧪 **TDD Compliance**: Validates test-first development practices
- 🔒 **Security Analysis**: Detects eval(), hardcoded credentials, XSS vulnerabilities
- 🎨 **Formatting**: Prettier/rustfmt analysis with diff preview
- 📊 **Coverage Analysis**: Test coverage validation with configurable thresholds
- 🤖 **Actionable Recommendations**: Specific steps to improve code quality
- 💾 **Memory Coordination**: Stores results for cross-agent collaboration

**⚠️ NO EXCEPTIONS**: Run this hook for ALL file types (JS, TS, Rust, Python, etc.)


# Agent Format Selection Principles

**Version:** 2.0.0
**Last Updated:** 2025-09-30

## The Three Agent Formats

### Format 1: MINIMAL (Complex Tasks)

**Use For:**
- Architectural design
- Code review and analysis
- Research and investigation
- Strategic decision-making
- Creative problem-solving

**Characteristics:**
- **Length**: 200-400 lines
- **Structure**: Role definition + Core principles + Minimal constraints
- **Philosophy**: Trust the AI's reasoning; provide direction, not prescription

**Validation Hooks Required:**
- `agent-template-validator` (MANDATORY - validates SQLite lifecycle hooks)
- `cfn-loop-memory-validator` (MANDATORY - validates ACL levels)

**Why Minimal Works for Complex Tasks:**
- Avoids over-constraining the solution space
- Allows creative application of principles
- Reduces cognitive load from excessive instructions
- Trusts AI's pattern recognition and reasoning

---

### Format 2: METADATA (Medium Complexity)

**Use For:**
- Structured workflows with clear steps
- API development with specifications
- DevOps pipeline automation
- Data processing pipelines
- Configuration management

**Characteristics:**
- **Length**: 400-700 lines
- **Structure**: Detailed specifications + Requirements + Structured examples
- **Philosophy**: Provide scaffolding through metadata; guide without examples

**Validation Hooks Required:**
- `agent-template-validator` (MANDATORY - validates SQLite lifecycle hooks)
- `cfn-loop-memory-validator` (MANDATORY - validates ACL levels)
- `test-coverage-validator` (MANDATORY - validates ≥80% line, ≥75% branch coverage)
- `blocking-coordination-validator` (if coordinator - validates HMAC secrets, signal ACK patterns)

**Why Metadata Works for Medium Tasks:**
- Provides structure without over-prescribing implementation
- Ensures completeness through checklists
- Balances guidance with flexibility
- Clearly defines requirements and success criteria

---

### Format 3: CODE-HEAVY (Basic Tasks)

**Use For:**
- Basic CRUD operations
- Simple parsing and string manipulation
- Standard configuration tasks
- Common testing patterns
- Straightforward implementations

**Characteristics:**
- **Length**: 700-1200 lines
- **Structure**: Detailed examples + Code patterns + Step-by-step guidance
- **Philosophy**: Show exactly what good looks like; prime with concrete examples

**Validation Hooks Required:**
- `agent-template-validator` (MANDATORY - validates SQLite lifecycle hooks)
- `cfn-loop-memory-validator` (MANDATORY - validates ACL levels)
- `test-coverage-validator` (MANDATORY - validates ≥80% line, ≥75% branch coverage)
- `blocking-coordination-validator` (if coordinator - validates HMAC secrets, signal ACK patterns)

**Why Code-Heavy Works for Basic Tasks:**
- Concrete examples reduce ambiguity
- Patterns prime the AI for correct idioms
- Step-by-step guidance ensures completeness
- Visual comparisons (❌ vs ✅) reinforce best practices
- Reduces iteration cycles for straightforward tasks

---

## Format Selection Decision Tree

```
┌─────────────────────────────────────────────────────┐
│  What is the PRIMARY task complexity?              │
└─────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
    ┌───────┐      ┌─────────┐    ┌─────────┐
    │ BASIC │      │ MEDIUM  │    │ COMPLEX │
    └───────┘      └─────────┘    └─────────┘
        │               │               │
        │               │               │
        ▼               ▼               ▼

┌─────────────┐  ┌───────────────┐  ┌──────────────┐
│ CODE-HEAVY  │  │   METADATA    │  │   MINIMAL    │
│   FORMAT    │  │    FORMAT     │  │   FORMAT     │
└─────────────┘  └───────────────┘  └──────────────┘

Examples:         Examples:          Examples:
- Parsing         - API dev          - Architecture
- CRUD ops        - CI/CD            - Code review
- String manip    - Data pipeline    - Research
- Config files    - Workflow auto    - Strategy
- Unit tests      - ETL processes    - Design

Quality:          Quality:           Quality:
+43% vs Min       Balanced           +31% vs Code

Lines:            Lines:             Lines:
700-1200          400-700            200-400
```

## Decision Factors Matrix

| Factor | Basic (Code-Heavy) | Medium (Metadata) | Complex (Minimal) |
|--------|-------------------|-------------------|-------------------|
| **Task Nature** | Straightforward, well-defined | Multi-step, structured | Open-ended, strategic |
| **Ambiguity** | Low (clear inputs/outputs) | Medium (some interpretation) | High (requires reasoning) |
| **Creativity Required** | Low (follow patterns) | Medium (adapt patterns) | High (novel solutions) |
| **Domain Expertise** | Low-Medium | Medium | High |
| **Iteration Tolerance** | Low (want first-time success) | Medium | High (expect refinement) |
| **Example Benefit** | High (priming effect) | Medium (reference) | Low (constraining) |

---

## The Sparse Language Findings

### Executive Summary from Benchmark Testing

Our comprehensive benchmarking system tested three agent formats across 5 Rust complexity levels (basic to master) and 10 JavaScript scenarios.

#### Key Discoveries

**1. The Complexity-Verbosity Inverse Law**

```
Task Complexity ↑ → Prompt Verbosity ↓

Basic Tasks (parsing, CRUD):
  - Code-Heavy: 85.3% quality (+43% vs Minimal)
  - Metadata: 78.9% quality
  - Minimal: 59.6% quality

Complex Tasks (architecture, lock-free algorithms):
  - Minimal: 87.2% quality (+31% vs Code-Heavy)
  - Metadata: 74.5% quality
  - Code-Heavy: 66.4% quality (over-constrained)
```

**Why This Happens:**
- **Basic tasks**: Benefit from concrete examples and patterns (priming effect)
- **Complex tasks**: Need reasoning freedom; verbose prompts create tunnel vision
- **Medium tasks**: Structured metadata provides scaffolding without over-constraining

**2. The Priming Paradox**

```yaml
Priming Effect:
  Definition: "Providing examples/patterns guides behavior"

  Positive Priming (Basic Tasks):
    - Code examples → faster convergence
    - Pattern demonstrations → correct idioms
    - Concrete syntax → fewer compile errors

  Negative Priming (Complex Tasks):
    - Excessive examples → tunnel vision
    - Over-specification → missed creative solutions
    - Pattern fixation → suboptimal architectures
```

**3. Language-Specific Validation Status**

| Language | Validation Status | Evidence | Confidence |
|----------|------------------|----------|------------|
| **Rust** | ✅ **VALIDATED** | 60 benchmark runs, statistical significance | **HIGH** |
| JavaScript | 🟡 **HYPOTHESIS** | 60 benchmark runs, patterns observed | **MEDIUM** |
| TypeScript | 🟡 **HYPOTHESIS** | Extrapolated from JS findings | **MEDIUM** |
| Python | 🟡 **HYPOTHESIS** | Similar to JS patterns | **LOW-MEDIUM** |
| Go | 🟡 **HYPOTHESIS** | Similar to Rust (system language) | **LOW** |

**Recommendation:** Use Rust findings as the baseline; validate for your specific language context.

---

## Quick Start: Choose Your Format in 30 Seconds

```yaml
Is the task BASIC (parsing, simple logic, CRUD)?
  → Use CODE-HEAVY format (+43% quality improvement)
  → Example: tests/benchmarking-tests/test-agent-code-heavy.md
  → Add to frontmatter: validation_hooks: [agent-template-validator, cfn-loop-memory-validator, test-coverage-validator]

Is the task COMPLEX with clear requirements (architecture, review)?
  → Use MINIMAL format (avoid over-constraining)
  → Example: architecture/system-architect.md
  → Add to frontmatter: validation_hooks: [agent-template-validator, cfn-loop-memory-validator]

Is the task MEDIUM complexity with structured steps?
  → Use METADATA format (structured guidance)
  → Example: development/backend/dev-backend-api.md
  → Add to frontmatter: validation_hooks: [agent-template-validator, cfn-loop-memory-validator, test-coverage-validator]
  → If coordinator: Also add blocking-coordination-validator
```

## The Three Golden Rules

1. **Complexity-Verbosity Inverse Law**: As task complexity increases, prompt verbosity should DECREASE
2. **Priming Paradox**: Verbose prompts excel at basic tasks, minimal prompts excel at complex reasoning
3. **Rust Validation**: These findings are validated for Rust; hypotheses for other languages
