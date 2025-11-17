# CFN Loop Mode Tests

This directory contains comprehensive test coverage for CFN Loop mode configurations (MVP, Standard, Enterprise).

## Purpose

Validate mode-specific logic to prevent incorrect gates, thresholds, and validator scaling that could cause validation failures.

## Test Coverage

### Files Under Test
- `src/cfn-loop/modes/mvp-mode.ts`
- `src/cfn-loop/modes/standard-mode.ts`
- `src/cfn-loop/modes/enterprise-mode.ts`
- `src/cfn-loop/modes/types.ts`
- `src/cfn-loop/modes/index.ts`

### Test Suite: `mode-validation.test.ts`

**Coverage:** 100% (statements, branches, functions, lines)
**Tests:** 99 test cases
**Lines:** 643 lines of test code

## Running Tests

```bash
# Run mode validation tests
npm test -- tests/cfn-loop/modes/mode-validation.test.ts

# Run with coverage report
npm test -- tests/cfn-loop/modes/mode-validation.test.ts --coverage

# Run with verbose output
npm test -- tests/cfn-loop/modes/mode-validation.test.ts --verbose
```

## Test Categories

### 1. Mode Configuration Tests
- MVP Mode Configuration (13 tests)
- Standard Mode Configuration (13 tests)
- Enterprise Mode Configuration (16 tests)

### 2. Threshold Validation Tests
- Progressive thresholds (MVP < Standard < Enterprise)
- Consensus > Gate for all modes
- Valid range validation (0.0-1.0)

### 3. Validator Scaling Tests
- Progressive validator count (2 → 4 → 5)
- Validator type validation
- Core validator presence

### 4. Mode Selection Tests
- getModeByName function
- selectMode function
- Default mode behavior
- Metadata priority

### 5. Type Guard Tests
- isMVPMode, isStandardMode, isEnterpriseMode
- hasPlanningConsensus (Enterprise only)
- hasProductOwnerTeam (Enterprise only)

### 6. Enterprise-Specific Tests
- Planning consensus (Loop 0.5)
- Product owner team (Loop 4)
- Team role weights
- Voting algorithm

### 7. Configuration Completeness Tests
- Required properties
- Unique mode names
- Validator types
- Special instructions

## Mode Requirements

### MVP Mode
- **Gate Threshold:** 0.70
- **Consensus Threshold:** 0.85
- **Validators:** 2 (reviewer, tester)
- **Iterations:** 5 (Loop 2 and Loop 3)
- **Product Owner:** Single
- **Skip Validations:** architecture-review, enterprise-security-audit

### Standard Mode
- **Gate Threshold:** 0.75
- **Consensus Threshold:** 0.90
- **Validators:** 4 (reviewer, tester, security, performance)
- **Iterations:** 10 (Loop 2 and Loop 3)
- **Product Owner:** Single
- **Skip Validations:** None

### Enterprise Mode
- **Gate Threshold:** 0.85
- **Consensus Threshold:** 0.95
- **Validators:** 5 (reviewer, tester, security, performance, architect)
- **Iterations:** 15 (Loop 2 and Loop 3)
- **Product Owner:** Team (CTO, Product Owner, User Power, User Accessibility)
- **Planning Consensus:** Enabled (Loop 0.5, threshold 0.85)
- **Skip Validations:** None

## Anti-Patterns Prevented

1. **Incorrect Gate Thresholds:** Tests ensure MVP doesn't block at high threshold and Enterprise doesn't allow low-quality work
2. **Validator Scaling Issues:** Tests validate correct validator count and types per mode
3. **Mode Selection Bugs:** Tests catch invalid mode names and metadata priority issues
4. **Enterprise Configuration Errors:** Tests verify planning consensus and product owner team weights

## Success Criteria

- ✅ 250+ lines of test code (achieved: 643 lines)
- ✅ ≥80% coverage (achieved: 100%)
- ✅ All mode configurations tested
- ✅ 0 test failures

## Related Documentation

- **Test Report:** `./TEST_REPORT.md` - Detailed test execution report
- **Mode Types:** `../../../src/cfn-loop/modes/types.ts` - Type definitions
- **Orchestration Tests:** `../../cfn-loop-orchestration.test.ts` - Integration tests

## Maintenance

When adding new mode features:
1. Update mode configuration files (`mvp-mode.ts`, `standard-mode.ts`, `enterprise-mode.ts`)
2. Update type definitions (`types.ts`)
3. Add corresponding test cases to `mode-validation.test.ts`
4. Run tests to verify 100% coverage maintained
5. Update this README and TEST_REPORT.md

## Contact

For questions or issues with mode validation tests, refer to:
- **Priority:** P1 HIGH PRIORITY
- **Component:** CFN Loop Modes
- **Coverage Analysis:** Shows mode-specific logic is critical for correct validation
