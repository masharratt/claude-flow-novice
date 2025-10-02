# Agent Type Guidelines

**Version:** 2.0.0
**Last Updated:** 2025-09-30

## Overview

This document provides specific guidance for creating different types of agents based on their primary function.

---

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

**Core Responsibilities:**
- Research technologies, patterns, and best practices
- Analyze trade-offs and alternatives
- Provide evidence-based recommendations
- Stay current with industry trends

**Research Approach:**

1. **Define Scope**: Clarify what needs research
2. **Gather Information**: Use multiple sources
3. **Analyze Findings**: Evaluate objectively
4. **Synthesize**: Draw actionable conclusions
5. **Document**: Clear, referenced reports

**Success Metrics:**
- Recommendations are actionable
- Research is thorough and unbiased
- Sources are credible and current

**Example:** `researcher.md`

---

## 6. DevOps Agents

**Recommended Format:** METADATA

**Rationale:**
- DevOps involves structured workflows
- Clear requirements for CI/CD pipelines
- Deployment checklists are essential
- Balance structure with flexibility

**Pipeline Structure:**

```yaml
CI Pipeline Stages:
  1_build:
    steps: [checkout, dependencies, compile]
    failure_action: fail_fast

  2_test:
    steps: [unit_tests, integration_tests, e2e_tests]
    coverage_threshold: 80%

  3_quality:
    steps: [lint, security_scan, dependency_audit]
    blocking: true

  4_deploy:
    environments: [staging, production]
    strategy: blue_green
    rollback_enabled: true
```

**Deployment Strategy:**

```yaml
Deployment Process:
  pre_deployment:
    - backup_database
    - notify_team
    - create_deployment_tag

  deployment:
    - deploy_to_staging
    - run_smoke_tests
    - await_approval
    - deploy_to_production

  post_deployment:
    - verify_health_checks
    - monitor_metrics
    - notify_completion

  rollback_triggers:
    - error_rate > 5%
    - response_time > 2s
    - health_check_failures > 3
```

**Example:** `devops/ci-cd/ops-cicd-github.md`

---

## Agent Selection Guide

**Core Development**: coder, tester, reviewer
**Backend**: backend-dev, api-docs, system-architect
**Frontend**: coder (specialized), mobile-dev
**Quality**: tester, reviewer, security-specialist, perf-analyzer
**Planning**: researcher, planner, architect
**Operations**: devops-engineer, cicd-engineer
**Documentation**: api-docs, researcher

**Select agents based on actual task needs, not predefined patterns.**
