# Confidence Scores - Detailed Guide

Confidence scores quantify agent certainty about deliverable quality. This guide explains calculation formulas, thresholds, interpretation, and real-world examples.

---

## Overview

**Purpose:** Confidence scores provide objective quality metrics for gating decisions

**Range:** 0.0 (no confidence) to 1.0 (complete confidence)

**Usage:**
- **Self-Validation (Loop 2):** Threshold = 0.75 (75%)
- **Consensus (Loop 3):** Threshold = 0.90 (90%)

---

## Self-Validation Confidence Formula

### Calculation Components

```javascript
function calculateSelfConfidence(validationResults) {
  const weights = {
    testsPassed: 0.30,      // Critical: all tests must pass
    coverage: 0.25,         // Important: ≥80% coverage
    syntax: 0.15,           // Basic: no syntax/type errors
    security: 0.20,         // Critical: no vulnerabilities
    formatting: 0.10        // Style: code formatting
  };

  let score = 0;

  // 1. Tests: binary (pass/fail)
  score += validationResults.testsPassed ? weights.testsPassed : 0;

  // 2. Coverage: linear scale (80% threshold)
  const coverageScore = validationResults.coverage >= 80
    ? 1.0
    : validationResults.coverage / 80;
  score += weights.coverage * coverageScore;

  // 3. Syntax: binary
  score += validationResults.noSyntaxErrors ? weights.syntax : 0;

  // 4. Security: weighted by severity
  const securityScore = calculateSecurityScore(validationResults.securityIssues);
  score += weights.security * securityScore;

  // 5. Formatting: binary
  score += validationResults.formattingCorrect ? weights.formatting : 0;

  return score;
}
```

### Security Score Calculation

```javascript
function calculateSecurityScore(issues) {
  if (issues.length === 0) return 1.0;

  // Penalize by severity
  const severityWeights = {
    critical: 1.0,    // Immediate failure
    high: 0.5,        // 50% penalty
    medium: 0.2,      // 20% penalty
    low: 0.1          // 10% penalty
  };

  const totalPenalty = issues.reduce((sum, issue) =>
    sum + (severityWeights[issue.severity] || 0), 0
  );

  // Maximum penalty: 1.0 (no confidence)
  return Math.max(0, 1.0 - totalPenalty);
}
```

---

## Real-World Examples

### Example 1: Perfect Score (100%)

**Scenario:** Well-tested, secure implementation

**Validation Results:**
```javascript
{
  testsPassed: true,          // ✅
  coverage: 92,               // ✅ (above 80%)
  noSyntaxErrors: true,       // ✅
  securityIssues: [],         // ✅
  formattingCorrect: true     // ✅
}
```

**Calculation:**
```javascript
score = (0.30 × 1.0)    // tests
      + (0.25 × 1.0)    // coverage (92/80 = 1.0 capped)
      + (0.15 × 1.0)    // syntax
      + (0.20 × 1.0)    // security
      + (0.10 × 1.0)    // formatting
      = 1.00            // 100% ✅ PASS
```

### Example 2: High Confidence (98%)

**Scenario:** Minor security warning

**Validation Results:**
```javascript
{
  testsPassed: true,          // ✅
  coverage: 85,               // ✅
  noSyntaxErrors: true,       // ✅
  securityIssues: [
    { severity: "low", message: "Consider rate limiting" }
  ],
  formattingCorrect: true     // ✅
}
```

**Calculation:**
```javascript
// Security penalty: 1.0 - 0.1 (low) = 0.9

score = (0.30 × 1.0)    // tests
      + (0.25 × 1.0)    // coverage
      + (0.15 × 1.0)    // syntax
      + (0.20 × 0.9)    // security (low issue)
      + (0.10 × 1.0)    // formatting
      = 0.98            // 98% ✅ PASS
```

### Example 3: Marginal Pass (82%)

**Scenario:** Exactly at coverage threshold

**Validation Results:**
```javascript
{
  testsPassed: true,          // ✅
  coverage: 80,               // ✅ (exactly at threshold)
  noSyntaxErrors: true,       // ✅
  securityIssues: [
    { severity: "medium", message: "SQL injection risk" }
  ],
  formattingCorrect: true     // ✅
}
```

**Calculation:**
```javascript
// Security penalty: 1.0 - 0.2 (medium) = 0.8

score = (0.30 × 1.0)    // tests
      + (0.25 × 1.0)    // coverage (80/80 = 1.0)
      + (0.15 × 1.0)    // syntax
      + (0.20 × 0.8)    // security (medium issue)
      + (0.10 × 1.0)    // formatting
      = 0.91            // 91% ✅ PASS
```

### Example 4: Low Confidence (75% - Borderline)

**Scenario:** Coverage below threshold, high security issue

**Validation Results:**
```javascript
{
  testsPassed: true,          // ✅
  coverage: 65,               // ⚠️ (below 80%)
  noSyntaxErrors: true,       // ✅
  securityIssues: [
    { severity: "high", message: "JWT secret hardcoded" }
  ],
  formattingCorrect: true     // ✅
}
```

**Calculation:**
```javascript
// Coverage: 65/80 = 0.8125
// Security penalty: 1.0 - 0.5 (high) = 0.5

score = (0.30 × 1.0)         // tests
      + (0.25 × 0.8125)      // coverage (65/80)
      + (0.15 × 1.0)         // syntax
      + (0.20 × 0.5)         // security (high issue)
      + (0.10 × 1.0)         // formatting
      = 0.753               // 75.3% ✅ BARELY PASS
```

### Example 5: Critical Failure (14%)

**Scenario:** Multiple critical issues

**Validation Results:**
```javascript
{
  testsPassed: false,         // ❌
  coverage: 45,               // ❌
  noSyntaxErrors: false,      // ❌
  securityIssues: [
    { severity: "critical", message: "eval() usage detected" }
  ],
  formattingCorrect: false    // ❌
}
```

**Calculation:**
```javascript
// Coverage: 45/80 = 0.5625
// Security penalty: 1.0 - 1.0 (critical) = 0.0

score = (0.30 × 0.0)         // tests FAILED
      + (0.25 × 0.5625)      // coverage (45/80)
      + (0.15 × 0.0)         // syntax FAILED
      + (0.20 × 0.0)         // security CRITICAL
      + (0.10 × 0.0)         // formatting FAILED
      = 0.141               // 14.1% ❌ BLOCK
```

---

## Consensus Confidence Formula

### Calculation Components

```javascript
function calculateConsensusConfidence(validators) {
  // 1. Average confidence across all validators
  const avgConfidence = validators.reduce((sum, v) =>
    sum + v.confidence, 0
  ) / validators.length;

  // 2. Agreement rate (percentage approving)
  const agreementRate = validators.filter(v => v.approve).length / validators.length;

  // 3. Combined score (weighted average)
  const consensusConfidence = (avgConfidence * 0.6) + (agreementRate * 0.4);

  return {
    averageConfidence: avgConfidence,
    agreementRate: agreementRate,
    consensusConfidence: consensusConfidence
  };
}
```

### Consensus Examples

#### Scenario 1: Unanimous Approval (100%)

**Validators:**
```javascript
[
  { id: "reviewer", approve: true, confidence: 0.95 },
  { id: "security", approve: true, confidence: 0.93 },
  { id: "architect", approve: true, confidence: 0.91 },
  { id: "tester", approve: true, confidence: 0.94 }
]
```

**Calculation:**
```javascript
avgConfidence = (0.95 + 0.93 + 0.91 + 0.94) / 4 = 0.9325
agreementRate = 4/4 = 1.0

consensusConfidence = (0.9325 × 0.6) + (1.0 × 0.4)
                    = 0.5595 + 0.4
                    = 0.9595          // 95.95% ✅ PASS
```

**Decision:** PASS (agreement ≥ 90%, avgConfidence ≥ 90%)

#### Scenario 2: Partial Disagreement (75%)

**Validators:**
```javascript
[
  { id: "reviewer", approve: true, confidence: 0.88 },
  { id: "security", approve: true, confidence: 0.85 },
  { id: "architect", approve: false, confidence: 0.72 },
  { id: "tester", approve: true, confidence: 0.90 }
]
```

**Calculation:**
```javascript
avgConfidence = (0.88 + 0.85 + 0.72 + 0.90) / 4 = 0.8375
agreementRate = 3/4 = 0.75

consensusConfidence = (0.8375 × 0.6) + (0.75 × 0.4)
                    = 0.5025 + 0.3
                    = 0.8025          // 80.25% ❌ FAIL
```

**Decision:** FAIL (agreementRate 75% < 90% threshold)

#### Scenario 3: Critical Issue Block

**Validators:**
```javascript
[
  { id: "reviewer", approve: true, confidence: 0.95, criticalIssues: [] },
  { id: "security", approve: true, confidence: 0.93, criticalIssues: ["SQL Injection"] },
  { id: "architect", approve: true, confidence: 0.91, criticalIssues: [] },
  { id: "tester", approve: true, confidence: 0.94, criticalIssues: [] }
]
```

**Calculation:**
```javascript
avgConfidence = 0.9325
agreementRate = 1.0
criticalPassing = false  // ❌ Critical issue detected

// Even with 100% agreement and 93% confidence:
decision = "FAIL"        // ❌ MUST fix critical issue
```

---

## Threshold Interpretation

### Self-Validation Thresholds

| Score Range | Interpretation | Action |
|-------------|---------------|--------|
| **0.90 - 1.00** | Excellent | Proceed to consensus |
| **0.75 - 0.89** | Good | Proceed to consensus |
| **0.60 - 0.74** | Below threshold | Retry with feedback |
| **0.40 - 0.59** | Poor | Multiple retries likely |
| **0.00 - 0.39** | Critical failure | Block until fixed |

### Consensus Thresholds

| Agreement | Avg Confidence | Interpretation | Action |
|-----------|---------------|----------------|--------|
| **≥90%** | **≥90%** | Strong consensus | PASS ✅ |
| **≥90%** | **<90%** | Agreement but low confidence | FAIL ❌ |
| **<90%** | **≥90%** | Disagreement despite confidence | FAIL ❌ |
| **<90%** | **<90%** | Weak consensus | FAIL ❌ |

---

## Adjusting Thresholds

### When to Lower (0.70-0.75)

**Use Cases:**
- Prototyping / proof-of-concept
- Non-production experimentation
- Learning exercises
- Early-stage development

**Configuration:**
```javascript
export const CFN_CONFIG = {
  selfValidation: {
    confidenceThreshold: 0.70  // Lowered from 0.75
  }
};
```

### When to Raise (0.80-0.85)

**Use Cases:**
- Production-critical systems
- Security-sensitive applications
- Public APIs
- Financial or healthcare systems

**Configuration:**
```javascript
export const CFN_CONFIG = {
  selfValidation: {
    confidenceThreshold: 0.85  // Raised from 0.75
  }
};
```

### When to Maximize (0.90-0.95)

**Use Cases:**
- Compliance-regulated code (GDPR, HIPAA, SOC2)
- Payment processing
- Authentication systems
- Mission-critical infrastructure

**Configuration:**
```javascript
export const CFN_CONFIG = {
  selfValidation: {
    confidenceThreshold: 0.90  // Maximum strictness
  },
  consensus: {
    agreementThreshold: 0.95,  // 95% agreement required
    confidenceThreshold: 0.95
  }
};
```

---

## Custom Weight Configuration

### Default Weights
```javascript
{
  testsPassed: 0.30,    // 30% - Tests are critical
  coverage: 0.25,       // 25% - Coverage important
  syntax: 0.15,         // 15% - Basic requirement
  security: 0.20,       // 20% - Security critical
  formatting: 0.10      // 10% - Style matters least
}
```

### Example: Security-Critical Application
```javascript
// Emphasize security over style
{
  testsPassed: 0.30,
  coverage: 0.20,
  syntax: 0.10,
  security: 0.35,       // Increased from 0.20
  formatting: 0.05      // Decreased from 0.10
}
```

### Example: Test-Driven Development
```javascript
// Maximize test importance
{
  testsPassed: 0.40,    // Increased from 0.30
  coverage: 0.30,       // Increased from 0.25
  syntax: 0.10,
  security: 0.15,
  formatting: 0.05
}
```

---

## Troubleshooting Low Scores

### Problem: Confidence Always Below 75%

**Diagnosis:**
```bash
npx enhanced-hooks post-edit "file.js" --structured
```

**Common Causes:**

1. **Missing Tests (30% penalty)**
   - Solution: Write tests first (TDD)
   - Target: All functions tested

2. **Low Coverage (<80%)**
   - Solution: Add tests for edge cases
   - Target: 80%+ coverage

3. **Security Issues**
   - Critical: Immediate fix required
   - High: Address before proceeding
   - Medium/Low: Document for later

4. **Syntax Errors**
   - Solution: Run linter and fix errors
   - Tools: ESLint, Prettier, TypeScript

### Problem: Consensus Fails Repeatedly

**Diagnosis:** Review validator feedback

**Common Causes:**

1. **Contradictory Feedback**
   - Validator 1: "Use Redis"
   - Validator 2: "Use in-memory"
   - Solution: Clarify requirements

2. **Ambiguous Requirements**
   - Solution: Add specific acceptance criteria
   - Re-initialize swarm with context

3. **Critical Issues**
   - Even 100% agreement fails if critical issues exist
   - Solution: Fix blocking issues first

---

## Next Steps

- **[Agent Coordination](Agent-Coordination.md)** - Learn swarm initialization patterns
- **[Security](Security.md)** - Understand security scoring details
- **[Troubleshooting](Troubleshooting.md)** - Fix common scoring issues
- **[API Reference](API-Reference.md)** - Implement custom scoring logic

---

**Last Updated:** 2025-10-02
**Version:** 1.5.22
