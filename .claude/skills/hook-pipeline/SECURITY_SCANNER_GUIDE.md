# Security Scanner v2.0.0

## Overview

Enhanced security scanner for detecting hardcoded secrets, API keys, and common vulnerabilities in source code. Supports multiple authentication patterns across different platforms.

## Detected Patterns

### 1. Google API Keys
- **Pattern**: `AIza[0-9A-Za-z_-]{35}`
- **Example**: `AIzaSyBqOVuhSvsXZBq2clCqakS8eytqE3qttBg`
- **Confidence Impact**: +30%

### 2. NPM Tokens
- **Pattern**: `npm_[A-Za-z0-9]{36}`
- **Example**: `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`
- **Confidence Impact**: +30%

### 3. N8N JWT Tokens
- **Pattern**: `eyJ[A-Za-z0-9_\-\.]{50,}`
- **Example**: Encoded JWT tokens used by N8N automation
- **Confidence Impact**: +25%

### 4. Z.ai API Keys
- **Pattern**: `sk-proj-[A-Za-z0-9_\-]{20,}`
- **Example**: `sk-proj-Xy9ZcTa3k2m9Ls8Qo1Pq4Ry5Uv6Wx7Yz`
- **Confidence Impact**: +25%

### 5. JavaScript/TypeScript Object Literals
- **Pattern**: `(apiKey|api_key|token|secret|password|Authorization|Bearer|key):\s*['"][^'"]{10,}['"]`
- **Example**: `apiKey: 'AIzaSyBqOVuhSvsXZBq2clCqakS8eytqE3qttBg'`
- **Confidence Impact**: +25%

### 6. SQL Injection
- **Pattern**: `(SELECT|INSERT|UPDATE|DELETE).*['"].*['"]`
- **Confidence Impact**: +20%

### 7. XSS Vulnerabilities
- **Pattern**: `innerHTML|document\.write|eval\(`
- **Confidence Impact**: +20%

### 8. Environment Variable Style Secrets
- **Pattern**: `(password|secret|token|api_key).*=.*['"]`
- **Confidence Impact**: +20%

### 9. Insecure Dependencies
- Checks JSON files for version declarations
- **Confidence Impact**: +15%

## Usage

### Basic Invocation
```bash
./.claude/skills/hook-pipeline/security-scanner.sh <file_path>
```

### Example
```bash
./.claude/skills/hook-pipeline/security-scanner.sh src/config.js
```

### Output Format
The scanner outputs JSON with the following structure:
```json
{
  "passed": false,
  "confidence": 85,
  "vulnerabilities": ["GOOGLE_API_KEY", "NPM_TOKEN"],
  "timestamp": 1765432924,
  "skipped": false
}
```

## Skipped File Types

The scanner automatically skips:
- Minified files (`.min.`)
- Test files (`.test.`, `.spec.`)
- Files in `node_modules/` directory
- Files in `.git/` directory

## Integration with Hook Pipeline

The scanner is designed to be called from the post-edit hook pipeline:

```bash
./.claude/hooks/cfn-invoke-post-edit.sh <file_path> --blocking
```

## Logging

Security scan logs are written to:
```
.artifacts/security-logs/security-scan-YYYYMMDD_HHMMSS.log
```

## Exit Codes

- `0`: No vulnerabilities detected
- `1`: File not found or unexpected error
- `2`: Vulnerabilities detected (non-blocking)

## Confidence Scoring

Confidence scores are calculated by summing impact values for each detected vulnerability:
- Maximum confidence: 100%
- Confidence represents the severity/certainty of findings

## Best Practices

1. **Always use with post-edit hooks**: Integrate into your development workflow
2. **Review findings**: Even non-blocking violations should be reviewed
3. **Regular updates**: Keep scanner patterns updated with new threats
4. **Log retention**: Archive old logs for compliance audit trails

## Troubleshooting

### Issue: "jq: command not found"
**Solution**: Ensure `jq` is installed: `sudo apt-get install jq`

### Issue: Scanner not detecting patterns
**Solution**: Verify file content matches expected pattern exactly (whitespace-sensitive)

### Issue: False positives
**Solution**: Some patterns may match non-secret strings. Review findings carefully.

## Security Considerations

- Scanner runs locally; no data is transmitted externally
- Logs contain detected patterns for audit purposes
- Archive security logs according to compliance requirements
- Never commit files with detected secrets

## Version History

- **v2.0.0** (2025-12-10): Added Google API, NPM token, N8N JWT, Z.ai key detection
- **v1.4.0** (Earlier): Original scanner with basic secret detection
