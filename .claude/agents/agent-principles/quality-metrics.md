# Quality Metrics & Validation

**Version:** 2.0.0
**Last Updated:** 2025-09-30

## Measuring Agent Effectiveness

### 1. Quantitative Metrics

```yaml
Code Quality:
  compilation_success_rate: "First-time compile success"
  test_pass_rate: "Tests passing on first run"
  coverage: "Code coverage percentage"
  performance: "Execution time vs baseline"
  idiomaticity_score: "Language-specific best practices"

Process Metrics:
  iteration_count: "Revisions needed to complete task"
  time_to_completion: "Duration from start to finish"
  error_rate: "Errors encountered during execution"

Agent-Specific:
  architect_score: "Design quality assessment"
  reviewer_score: "Issues found / total issues"
  tester_score: "Bug catch rate"
```

### 2. Qualitative Metrics

```yaml
Code Review Criteria:
  - Readability: Easy to understand
  - Maintainability: Easy to modify
  - Correctness: Works as intended
  - Safety: No security vulnerabilities
  - Performance: Meets efficiency requirements

Architecture Criteria:
  - Scalability: Can grow with demand
  - Flexibility: Adapts to changing requirements
  - Simplicity: No unnecessary complexity
  - Documentation: Well-explained decisions
```

---

## Validation Checklist

Use this checklist before deploying an agent:

### Pre-Deployment Validation

```markdown
## Agent Profile Validation

### Structure ✓
- [ ] Valid YAML frontmatter
- [ ] All required fields present (name, description, tools, model, color, validation_hooks, lifecycle)
- [ ] Clear role definition in opening paragraph
- [ ] Appropriate section structure

### Format Selection ✓
- [ ] Format matches task complexity (Basic→Code-Heavy, Medium→Metadata, Complex→Minimal)
- [ ] Length appropriate (Minimal: 200-400, Metadata: 400-700, Code-Heavy: 700-1200)
- [ ] Examples present and relevant (for Code-Heavy)
- [ ] Structure/metadata present (for Metadata)

### Content Quality ✓
- [ ] Clear responsibilities defined
- [ ] Approach/methodology explained
- [ ] Integration points specified (memory keys, ACL levels)
- [ ] Success metrics defined
- [ ] Post-edit validation hook included

### Hook Validation System ✓
- [ ] validation_hooks declared in frontmatter
- [ ] agent-template-validator included (MANDATORY)
- [ ] cfn-loop-memory-validator included (MANDATORY)
- [ ] test-coverage-validator included (for implementers/testers)
- [ ] blocking-coordination-validator included (for coordinators only)

### SQLite Lifecycle Integration ✓
- [ ] lifecycle.pre_task hook present (INSERT INTO agents)
- [ ] lifecycle.post_task hook present (UPDATE agents SET status=completed)
- [ ] ACL level declared (1=Private, 3=Swarm, 4=Project)
- [ ] Error handling patterns implemented (retry logic, fallback)
- [ ] Memory key patterns follow conventions

### Blocking Coordination (Coordinators Only) ✓
- [ ] BlockingCoordinationSignals import present
- [ ] CoordinatorTimeoutHandler import present
- [ ] HMAC secret from environment variable
- [ ] Signal ACK patterns implemented
- [ ] Timeout handling logic present

### Language-Specific ✓
- [ ] If Rust: Format validated against benchmark findings
- [ ] If other language: Format choice documented as hypothesis
- [ ] Language-specific patterns included (for Code-Heavy)
- [ ] Idiomatic code examples (for Code-Heavy)

### Testing ✓
- [ ] Agent tested on representative tasks
- [ ] Quality metrics meet targets
- [ ] Integration with hooks verified
- [ ] Collaboration with other agents confirmed
- [ ] SQLite persistence verified
```

### Post-Deployment Monitoring

```markdown
## Ongoing Validation

### Performance Tracking
- [ ] Monitor iteration counts
- [ ] Track first-time success rate
- [ ] Measure time to completion
- [ ] Collect user feedback
- [ ] Monitor SQLite persistence success rate (target: >99.9%)

### Quality Assurance
- [ ] Review output quality regularly
- [ ] Check adherence to format guidelines
- [ ] Validate tool usage patterns
- [ ] Assess collaboration effectiveness
- [ ] Monitor ACL violation rate (target: 0% in production)

### Hook Validation Metrics
- [ ] Agent template validation pass rate (target: 100%)
- [ ] CFN Loop ACL compliance rate (target: 100%)
- [ ] Test coverage thresholds met (≥80% line, ≥75% branch)
- [ ] Blocking coordination pattern correctness (coordinators: 100%)
- [ ] Hook execution time (<5s composite)
- [ ] False positive rate (<2%)

### SQLite Integration Health
- [ ] Agent lifecycle completion rate (>95%)
- [ ] Memory persistence success rate (>99.9%)
- [ ] Error handling effectiveness (retry success rate >90%)
- [ ] Fallback activation rate (<1% for non-critical data)

### Continuous Improvement
- [ ] Document failure modes
- [ ] Refine based on metrics
- [ ] Update with new patterns
- [ ] Validate format choice periodically
- [ ] Review and update hook validators
```

---

## Benchmark System

### Running Agent Benchmarks

```bash
cd benchmark/agent-benchmarking

# Run Rust benchmarks (VALIDATED)
node index.js run 5 --rust --verbose

# Run JavaScript benchmarks (HYPOTHESIS)
node index.js run 5 --verbose

# Run specific scenario
node index.js run 3 --rust --scenario=rust-01-basic

# List available scenarios
node index.js list --scenarios --rust

# Analyze results
node index.js analyze
```

### Interpreting Results

```yaml
Quality Score Breakdown:
  Correctness (30%):
    - Basic functionality works
    - Edge cases handled
    - Error conditions managed

  Idiomaticity (25%):
    - Language best practices
    - Proper pattern usage
    - Efficient algorithms

  Code Quality (20%):
    - Readability
    - Documentation
    - Naming conventions

  Testing (15%):
    - Test coverage
    - Assertion quality
    - Edge case tests

  Performance (10%):
    - Execution efficiency
    - Memory usage
    - Optimization
```

### Statistical Significance

```yaml
ANOVA Analysis:
  f_statistic: "Variance between groups"
  p_value: "Probability results are random"
  significant_if: "p < 0.05"

Effect Size (Cohen's d):
  negligible: "d < 0.2"
  small: "0.2 ≤ d < 0.5"
  medium: "0.5 ≤ d < 0.8"
  large: "d ≥ 0.8"
```

---

## Continuous Improvement

### Metrics to Track

```yaml
Agent Performance Metrics:
  first_time_success_rate:
    target: ">80%"
    measure: "Compiles/runs on first attempt"

  iteration_count:
    target: "<3"
    measure: "Revisions needed to complete"

  quality_score:
    target: ">85%"
    measure: "Benchmark quality assessment"

  user_satisfaction:
    target: ">4.5/5"
    measure: "Feedback from users"

Hook Validation Metrics:
  agent_template_validation_pass_rate:
    target: "100%"
    measure: "SQLite lifecycle, ACL, error handling validation pass rate"

  cfn_loop_acl_compliance:
    target: "100%"
    measure: "Zero ACL violations in production"

  test_coverage_compliance:
    target: "≥80% line, ≥75% branch"
    measure: "Test coverage thresholds met"

  blocking_coordination_correctness:
    target: "100% (coordinators)"
    measure: "HMAC, signal ACK patterns validated"

  hook_execution_time:
    target: "<5s composite"
    measure: "Total validation time for all hooks"

  false_positive_rate:
    target: "<2%"
    measure: "Incorrect validation failures"

SQLite Integration Metrics:
  persistence_success_rate:
    target: ">99.9%"
    measure: "SQLite write operations successful"

  agent_lifecycle_completion:
    target: ">95%"
    measure: "Agents complete full lifecycle (spawn → complete)"

  error_recovery_success:
    target: ">90%"
    measure: "Retry operations successful on SQLITE_BUSY errors"

  acl_violation_rate:
    target: "0%"
    measure: "Unauthorized data access attempts"
```

### Feedback Loop

1. **Collect Data**: Track metrics for each agent usage
2. **Analyze**: Identify patterns in failures or low quality
3. **Hypothesize**: Determine likely causes
4. **Experiment**: Adjust agent format or content
5. **Validate**: Test changes with benchmark system
6. **Deploy**: Update agent if improvements confirmed
7. **Monitor**: Continue tracking metrics

---

## Success Criteria by Agent Type

### Coder Agents

- [ ] Code compiles without warnings
- [ ] All functions have documentation
- [ ] Error handling uses proper patterns (no .unwrap() in Rust)
- [ ] Tests cover >85% of code
- [ ] Idiomatic language usage
- [ ] Proper resource management

### Reviewer Agents

- [ ] Issues identified before production
- [ ] Suggestions are actionable and specific
- [ ] Feedback explains "why" not just "what"
- [ ] Team learns from feedback
- [ ] Security vulnerabilities caught
- [ ] Performance issues identified

### Architect Agents

- [ ] Architecture meets quality attributes
- [ ] Team can implement the design
- [ ] Documentation is clear and comprehensive
- [ ] Trade-offs are explicitly documented
- [ ] ADRs (Architecture Decision Records) created
- [ ] Stakeholder requirements satisfied

### Tester Agents

- [ ] Test coverage meets targets (85% unit, 70% integration)
- [ ] Tests are comprehensive (happy path, error cases, edge cases)
- [ ] Test code is maintainable
- [ ] Assertions are meaningful
- [ ] Performance tests where applicable
- [ ] Integration tests validate contracts

### DevOps Agents

- [ ] Pipelines execute successfully
- [ ] Deployment process is automated
- [ ] Rollback strategy is in place
- [ ] Monitoring and alerting configured
- [ ] Security scans integrated
- [ ] Documentation updated

---

## Quality Gates

### Blocking Issues (Must Fix)

- Compilation errors
- Test failures
- Security vulnerabilities (high/critical)
- Missing required documentation
- Code coverage below threshold
- Lint/format errors

### Non-Blocking Issues (Should Fix)

- Performance warnings
- Code style inconsistencies
- Missing optional documentation
- Low test coverage (but above minimum)
- Minor security issues

### Advisory (Nice to Have)

- Optimization opportunities
- Refactoring suggestions
- Additional test cases
- Enhanced documentation
- Improved naming
