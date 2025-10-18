# Validation Reports

Validation and verification reports from CFN Loop 2 consensus validation phases.

## Purpose

This directory contains validator agent outputs from CFN Loop 2, consensus scoring results, quality gate assessments, and validation recommendations that inform Loop 4 product owner decisions.

## Report Types

### Loop 2 Consensus Validation
- **Format**: `validation-{phase}-loop2-{date}.md`
- **Content**: Validator agent outputs, consensus score, pass/fail status, recommendations
- **Generated**: After CFN Loop 2 completes (2-4 validator agents)

### Quality Gate Results
- **Format**: `quality-gate-{phase}-{date}.json`
- **Content**: Test coverage, code quality metrics, security checks, performance validation
- **Generated**: Automated quality gates during validation

### Validator Agent Reports
- **Format**: `validator-{agent-role}-{phase}-{date}.md`
- **Content**: Individual validator findings, confidence score, blockers, recommendations
- **Generated**: Each validator agent in Loop 2

### Consensus Analysis
- **Format**: `consensus-{phase}-{date}.json`
- **Content**: Aggregated validation scores, weighted consensus, decision factors
- **Generated**: After all Loop 2 validators complete

## Validation Criteria

### Code Quality
- **Test coverage**: ≥80% (configurable via --minimum-coverage)
- **Linting**: Zero errors, warnings under threshold
- **Formatting**: Prettier/rustfmt compliance
- **Type safety**: TypeScript strict mode, no 'any' types

### Security
- **Vulnerability scans**: No critical/high severity issues
- **Dependency audits**: All packages up-to-date
- **Security patterns**: No eval(), hardcoded credentials, XSS risks
- **Access control**: Proper authentication/authorization

### Performance
- **Execution time**: Within acceptable thresholds
- **Memory usage**: No memory leaks detected
- **WASM acceleration**: Applied where applicable
- **Algorithmic complexity**: Efficient algorithms used

### Architecture
- **Design patterns**: Appropriate patterns applied
- **SOLID principles**: Single responsibility, loose coupling
- **Error handling**: Comprehensive error handling
- **Documentation**: Code comments, API docs present

## Report Structure

```markdown
# Validation Report - {Phase Name}

## Metadata
- Phase: {name}
- Date: {ISO-8601}
- Loop: 2
- Consensus Score: {0.0-1.0}
- Threshold: 0.90
- Status: {PASS|FAIL}

## Validators
- validator-1 (reviewer): Confidence 0.92
- validator-2 (security-specialist): Confidence 0.88
- validator-3 (perf-analyzer): Confidence 0.91

## Consensus Analysis
- Weighted Average: 0.90
- Agreement Level: 94%
- Dissenting Opinions: 0

## Validation Results

### Code Quality ✅
- Test Coverage: 87%
- Linting: 0 errors, 2 warnings
- Formatting: Compliant
- Type Safety: Strict mode enabled

### Security ✅
- Vulnerabilities: 0 critical, 1 medium (backlog)
- Dependencies: All up-to-date
- Security Patterns: Compliant

### Performance ⚠️
- Execution Time: Acceptable
- Memory Usage: 5MB leak detected (fix required)
- WASM: Applied (52x speedup)

### Architecture ✅
- Design Patterns: Factory, Observer used appropriately
- SOLID: Compliant
- Error Handling: Comprehensive

## Recommendations
1. Fix 5MB memory leak in auth service (HIGH priority)
2. Address medium severity dependency vulnerability (backlog)
3. Reduce linting warnings to 0 (LOW priority)

## Product Owner Referral
Refer to Loop 4 for decision on:
- Memory leak fix (MUST fix before production)
- Dependency upgrade (can defer to next sprint)

## Next Steps
- Loop 4: Product Owner GOAP decision
- If PROCEED: Fix memory leak, rerun Loop 3
- If DEFER: Accept with backlog items
```

## Usage

Validation reports are consumed by:
- Loop 4 product owner GOAP decision engine
- CFN Loop retry logic (if consensus <0.90)
- Sprint retrospectives
- Quality assurance teams
- Stakeholder status updates

## Examples

- `validation-auth-phase-loop2-2025-10-10.md` - Loop 2 consensus validation
- `quality-gate-auth-phase-2025-10-10.json` - Automated quality gate results
- `validator-security-specialist-auth-2025-10-10.md` - Individual validator report
- `consensus-auth-phase-2025-10-10.json` - Consensus analysis breakdown

## Retention

Keep validation reports for current epic + 1 sprint. Archive after epic completion.

## Consensus Threshold

**Target**: ≥0.90 consensus score across all validators
**Retry**: If <0.90, relaunch Loop 3 with targeted fixes
**Max Iterations**: 10 per phase (configurable via --max-loop2)
