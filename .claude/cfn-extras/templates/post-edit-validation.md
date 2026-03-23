## Post-Edit Validation Template

### Validation Hooks Framework

```typescript
interface ValidationResult {
  valid: boolean;
  confidence: number;
  recommendations: string[];
  details: {
    fileType: string;
    lintIssues: number;
    testCoverage: {
      line: number;
      branch: number;
      function: number;
    }
  }
}

class PostEditValidator {
  async validate(file: string, content: string): Promise<ValidationResult> {
    const validators = [
      this.validateLinting(),
      this.validateTestCoverage(),
      this.validateSecurityPatterns(),
      this.validateCodeQuality()
    ];

    const results = await Promise.all(validators);

    return {
      valid: results.every(r => r.valid),
      confidence: this.calculateConfidence(results),
      recommendations: results.flatMap(r => r.recommendations),
      details: {
        fileType: path.extname(file),
        lintIssues: results[0].details.lintIssues,
        testCoverage: results[1].details.coverage
      }
    };
  }

  private calculateConfidence(results: ValidationResult[]): number {
    const confidenceScores = results.map(r => r.valid ? r.confidence : 0);
    return confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
  }

  // Separate validator methods implementation here
}

// Usage
const validator = new PostEditValidator();
const result = await validator.validate('/path/to/file.ts', fileContent);
```

### Validation Strategies

1. **Linting Validation**
   - Check code style consistency
   - Detect potential bugs
   - Enforce best practices

2. **Test Coverage Validation**
   - Ensure minimum coverage thresholds
   - Validate test quality
   - Detect untested code paths

3. **Security Pattern Detection**
   - Identify potential vulnerabilities
   - Check for hardcoded credentials
   - Validate input sanitization

4. **Code Quality Assessment**
   - Complexity analysis
   - Architectural best practices
   - Design pattern adherence

### Configuration Example

```yaml
post_edit_validation:
  linting:
    threshold: 0.90  # 90% lint pass rate
  test_coverage:
    line: 0.80       # 80% line coverage
    branch: 0.75     # 75% branch coverage
    function: 0.85   # 85% function coverage
  security:
    critical_issues: 0  # No critical security issues allowed
    high_priority_issues: 0  # No high-priority issues
  code_quality:
    complexity_threshold: 10  # Cyclomatic complexity limit
```

### Hooks Integration

```bash
./.claude/hooks/cfn-invoke-post-edit.sh [FILE_PATH] --agent-id "${AGENT_ID}"
```

### Performance Metrics

- Execution Time: <5s
- False Positive Rate: <2%
- Accuracy: >95%