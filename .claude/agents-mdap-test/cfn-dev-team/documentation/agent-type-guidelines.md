---
name: agent-type-guidelines
description: Guidelines for creating different types of agents based on their primary function
model: standard
type: documentation
color: orange
skills: [cfn-session-handoff, cfn-knowledge-base]
capabilities: [agent-creation-guidelines, rust-coding, javascript-typescript-coding, code-review, architecture-design, testing-patterns, research-methodology, devops-workflows, multi-agent-coordination, product-ownership]
tags: [agent-type-guidelines, documentation, guidelines, coder-agents, reviewer-agents, architect-agents, tester-agents, researcher-agents, devops-agents, coordinator-agents, product-owner-agents]
validation_hooks: [agent-template-validator, cfn-loop-memory-validator, test-coverage-validator, blocking-coordination-validator]
acl_level: 3
version: 1.0.0
priority: P2
---

# Agent Type Guidelines

**Version:** 2.0.0
**Last Updated:** 2025-09-30

## Overview

This document provides specific guidance for creating different types of agents based on their primary function.

---

→ **Skills**: Cerebras MCP (blueprint prompts) | RuVector (semantic search) | Post-edit hook (file validation)

## 1. Coder Agents

### For Rust (VALIDATED)

**Basic Tasks:** Use CODE-HEAVY

```yaml
Tasks:
  - String processing
  - Basic error handling
  - Simple data structures
  - CRUD operations
  - Configuration parsing

Expected Improvement: +43% quality vs Minimal

Validation Hooks:
  - agent-template-validator (validates SQLite lifecycle, ACL declarations)
  - cfn-loop-memory-validator (validates ACL levels for memory operations)
  - test-coverage-validator (validates ≥80% line, ≥75% branch coverage)

ACL Level: 1 (Private - agent-scoped data)
SQLite: Persist confidence scores, implementation notes
```

**Complex Tasks:** Use MINIMAL

```yaml
Tasks:
  - Lock-free algorithms
  - Lifetime-complex generics
  - Unsafe code design
  - Embedded HAL
  - Async runtime design

Expected Improvement: +31% quality vs Code-Heavy

Validation Hooks:
  - agent-template-validator (validates SQLite lifecycle, ACL declarations)
  - cfn-loop-memory-validator (validates ACL levels for memory operations)
  - test-coverage-validator (validates ≥80% line, ≥75% branch coverage)

ACL Level: 1 (Private - agent-scoped data)
SQLite: Persist confidence scores, implementation notes
```

**Example Agents:**
- `benchmarking-tests/test-agent-code-heavy.md` - Basic tasks
- `benchmarking-tests/test-agent-minimal.md` - Complex tasks

### For JavaScript/TypeScript (HYPOTHESIS)

Apply same principles but validate with testing:

**Basic Tasks:** Code-Heavy
- Simple React components
- Express route handlers
- Utility functions
- Basic async/await

**Complex Tasks:** Minimal
- State management architecture
- Complex React patterns (render props, HOCs)
- Performance optimization
- TypeScript advanced types

---

## 2. Reviewer Agents

**Recommended Format:** MINIMAL

**Rationale:**
- Reviews require contextual reasoning
- Over-specification creates checklist mentality
- Need flexibility to identify novel issues
- Trust AI's pattern recognition

**Validation Hooks:**
- `agent-template-validator` (validates SQLite lifecycle, ACL declarations)
- `cfn-loop-memory-validator` (validates ACL levels for memory operations)

**ACL Level:** 3 (Swarm - shared across validation team)

**SQLite Requirements:**
- Persist review feedback, validation consensus
- Store findings with appropriate ACL for team access

**Key Responsibilities:**
- Assess code quality, readability, and maintainability
- Identify bugs, security issues, and performance problems
- Suggest architectural improvements
- Ensure adherence to best practices

**Review Approach:**

### 1. Initial Assessment
- Understand the change's purpose
- Review related context (issues, documentation)
- Identify the scope and impact

### 2. Deep Analysis
- **Correctness**: Does it work as intended?
- **Security**: Any vulnerabilities?
- **Performance**: Efficiency concerns?
- **Maintainability**: Easy to understand and modify?
- **Testing**: Adequate test coverage?

### 3. Provide Feedback
- Be specific and actionable
- Explain the "why" behind suggestions
- Offer alternatives when critiquing
- Acknowledge good patterns

**Example:** `quality/reviewer.md`

---

## 3. Architect Agents

**Recommended Format:** MINIMAL

**Rationale:**
- Architecture requires strategic thinking
- Solutions must be context-specific
- Over-constraining limits creative solutions
- Need to consider trade-offs dynamically

**Validation Hooks:**
- `agent-template-validator` (validates SQLite lifecycle, ACL declarations)
- `cfn-loop-memory-validator` (validates ACL levels for memory operations)

**ACL Level:** 3 (Swarm - coordinate multiple agents)

**SQLite Requirements:**
- Persist ADRs (Architecture Decision Records) with 1 year retention
- Store design decisions with appropriate ACL for team access
- All architectural decisions MUST persist to SQLite for audit trail

**Core Responsibilities:**
- Design system architectures from requirements
- Make strategic technical decisions
- Evaluate technology trade-offs
- Create architectural documentation

**Approach:**

### Requirements Analysis
Extract functional and non-functional requirements, identify constraints and quality attributes, understand stakeholder needs.

### Architecture Design
Apply appropriate patterns (microservices, event-driven, CQRS), consider trade-offs, document decisions with ADRs.

### Decision Making
Framework for evaluating options with explicit trade-off documentation.

**Collaboration:**
- Work with Coder agents for implementation guidance
- Coordinate with Reviewer agents for design validation
- Provide specifications to DevOps for infrastructure
- Share ADRs via memory system

**Example:** `architecture/system-architect.md`

---

## 4. Tester Agents

**Recommended Format:** CODE-HEAVY for unit tests, METADATA for test strategy

**Rationale:**
- Unit tests benefit from concrete patterns
- Test structure is often formulaic
- Examples show proper assertion style
- But test strategy needs metadata structure

**Validation Hooks:**
- `agent-template-validator` (validates SQLite lifecycle, ACL declarations)
- `test-coverage-validator` (validates ≥80% line, ≥75% branch coverage)

**ACL Level:** 3 (Swarm - shared across validation team)

**SQLite Requirements:**
- Persist test results, coverage metrics
- Store test strategy with appropriate ACL for team access

**Test Patterns:**

### Rust Testing Pattern

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_success_case() {
        let result = function_under_test(valid_input);
        assert_eq!(result, expected_output);
    }

    #[test]
    fn test_error_case() {
        let result = function_under_test(invalid_input);
        assert!(result.is_err());
    }

    #[test]
    #[should_panic(expected = "error message")]
    fn test_panic_case() {
        function_that_should_panic();
    }
}
```

### JavaScript Testing Pattern

```javascript
describe('ModuleName', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  test('should handle success case', () => {
    const result = functionUnderTest(validInput);
    expect(result).toEqual(expectedOutput);
  });

  test('should handle error case', async () => {
    await expect(asyncFunction(invalidInput))
      .rejects.toThrow('error message');
  });
});
```

**Test Strategy:**

```yaml
Coverage Requirements:
  unit_tests: 85%
  integration_tests: 70%
  e2e_tests: 30%

Test Categories:
  - Happy path tests
  - Error condition tests
  - Edge case tests
  - Performance tests (if applicable)
```

**Example:** `testing/unit/tdd-london-swarm.md`

---

## 5. Researcher Agents

**Recommended Format:** MINIMAL

**Rationale:**
- Research requires open-ended exploration
- Avoid bias from excessive structure
- Let evidence guide conclusions
- Need flexibility in methodology

**Validation Hooks:**
- `agent-template-validator` (validates SQLite lifecycle, ACL declarations)

**ACL Level:** 1 (Private) or 3 (Swarm) depending on context

**SQLite Requirements:**
- Persist research findings, competitive analysis
- Store with appropriate ACL based on sharing requirements

**Core Responsibilities:**
- Research technologies, patterns,