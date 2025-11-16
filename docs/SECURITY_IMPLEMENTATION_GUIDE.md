# Security Implementation Guide

**For Developers Implementing Security Hardening**

Quick reference for using the security modules in production code.

## Quick Start

### 1. Input Validation

Validate all user inputs before processing:

```python
from src.workflow_codification.security import InputValidator

# Validate skill names
try:
    InputValidator.validate_skill_name(user_input)
except ValueError as e:
    return {"error": str(e)}, 400

# Validate commands
try:
    InputValidator.validate_command(command_string)
except ValueError as e:
    return {"error": str(e)}, 400

# Validate SQL parameters (always use parameterized queries)
try:
    InputValidator.validate_sql_parameter(param_value)
except ValueError as e:
    return {"error": str(e)}, 400

# Sanitize output to prevent XSS
safe_output = InputValidator.sanitize_output(user_provided_html)

# Validate file paths
try:
    InputValidator.validate_file_path(file_path, allowed_base="/tmp")
except ValueError as e:
    return {"error": str(e)}, 400
```

### 2. Rate Limiting

Protect endpoints from brute-force and DoS attacks:

```python
from src.workflow_codification.security import RateLimiter

limiter = RateLimiter()

@app.route('/api/endpoint')
def protected_endpoint():
    user_id = request.user.id
    ip_address = request.remote_addr

    # Check user rate limit (100 req/min)
    user_allowed, user_retry = limiter.check_user_rate_limit(user_id)
    if not user_allowed:
        return {
            "error": "Rate limit exceeded",
            "retry_after": user_retry
        }, 429

    # Check IP rate limit (200 req/min)
    ip_allowed, ip_retry = limiter.check_ip_rate_limit(ip_address)
    if not ip_allowed:
        return {
            "error": "Rate limit exceeded",
            "retry_after": ip_retry
        }, 429

    # Process request
    return process_request()
```

### 3. PII Sanitization

Remove sensitive data from logs before storage:

```python
from src.workflow_codification.security import PIISanitizer

# Sanitize text
error_message = "Error connecting from user@example.com"
safe_message = PIISanitizer.sanitize_text(error_message)
logger.error(safe_message)  # user@example.com is redacted

# Sanitize entire traces
trace = {
    "error_message": "Failed: password=secret123",
    "steps": [
        {"error_message": "API key: abcdef0123456789abcdef0123456789"}
    ]
}
safe_trace = PIISanitizer.sanitize_trace(trace)

# Check if text contains PII
if PIISanitizer.has_pii(user_input):
    logger.warning("PII detected in input")
```

### 4. Authentication

Validate API keys and tokens:

```python
from src.workflow_codification.security import AuthManager

auth = AuthManager()

@app.route('/api/protected')
def protected_resource():
    token = request.headers.get('Authorization')

    # Validate API key format
    if not auth.validate_api_key(token):
        return {"error": "Invalid API key"}, 401

    # Validate token expiration
    if not auth.validate_token(token):
        return {"error": "Token expired"}, 401

    # Process authenticated request
    return get_user_data()

# Generate new token for user
def create_token(user_id):
    token = auth.generate_token(user_id, ttl=3600)  # 1 hour
    return token

# Revoke token on logout
def logout_user(user_id, token):
    auth.revoke_token(token)

# Revoke all tokens for account reset
def reset_user_account(user_id):
    auth.revoke_all_user_tokens(user_id)
```

### 5. Security Auditing

Run security checks during build/deployment:

```python
from src.workflow_codification.security import SecurityAuditor
import json

# Generate comprehensive security report
report = SecurityAuditor.generate_security_report()

if report["overall_status"] == "FAIL":
    print("SECURITY AUDIT FAILED")
    print(f"High Severity Issues: {report['bandit_scan']['high_severity']}")
    print(f"Hardcoded Secrets: {report['hardcoded_secrets']['count']}")
    exit(1)
else:
    print("SECURITY AUDIT PASSED")
    print(f"Medium Issues: {report['bandit_scan']['medium_severity']}")
    print(f"Low Issues: {report['bandit_scan']['low_severity']}")

# Run individual checks
bandit_results = SecurityAuditor.run_bandit_scan("src/")
secrets = SecurityAuditor.check_secrets("src/")
dependencies = SecurityAuditor.check_dependencies()

# Log findings
for secret_finding in secrets:
    print(f"Potential secret in {secret_finding['file']}:{secret_finding['line']}")
```

## API Reference

### InputValidator

```python
class InputValidator:
    @staticmethod
    def validate_skill_name(skill_name: str) -> bool
    @staticmethod
    def validate_command(command: str) -> bool
    @staticmethod
    def validate_sql_parameter(param: Any) -> bool
    @staticmethod
    def sanitize_output(output: str) -> str
    @staticmethod
    def validate_file_path(file_path: str, allowed_base: str = None) -> bool
```

### RateLimiter

```python
class RateLimiter:
    def check_rate_limit(identifier: str, limit: int, window_seconds: int) -> Tuple[bool, Optional[int]]
    def check_user_rate_limit(user_id: str) -> Tuple[bool, Optional[int]]
    def check_ip_rate_limit(ip_address: str) -> Tuple[bool, Optional[int]]
    def reset_limit(identifier: str, prefix: str) -> bool
    def get_current_count(identifier: str, prefix: str, window_seconds: int) -> int
```

### PIISanitizer

```python
class PIISanitizer:
    @staticmethod
    def sanitize_text(text: str) -> str
    @staticmethod
    def sanitize_trace(trace: Dict[str, Any]) -> Dict[str, Any]
    @staticmethod
    def sanitize_dict(data: Dict[str, Any]) -> Dict[str, Any]
    @staticmethod
    def has_pii(text: str) -> bool
```

### AuthManager

```python
class AuthManager:
    def validate_api_key(api_key: str) -> bool
    def validate_token(token: str, ttl: int = None) -> bool
    def generate_token(identifier: str, ttl: int = None) -> str
    def revoke_token(token: str) -> bool
    def revoke_all_user_tokens(identifier: str) -> bool
    def get_token_expiration(token: str) -> Optional[float]
    def is_token_expired(token: str) -> bool
```

### SecurityAuditor

```python
class SecurityAuditor:
    @staticmethod
    def run_bandit_scan(directory: str = "src/") -> Dict[str, Any]
    @staticmethod
    def check_secrets(directory: str = "src/") -> List[Dict[str, Any]]
    @staticmethod
    def generate_security_report() -> Dict[str, Any]
    @staticmethod
    def check_dependencies() -> Dict[str, Any]
```

## Common Patterns

### API Endpoint Protection

```python
from flask import request, jsonify
from src.workflow_codification.security import InputValidator, RateLimiter, AuthManager

limiter = RateLimiter()
auth = AuthManager()

@app.route('/api/skills', methods=['POST'])
def create_skill():
    # 1. Authenticate
    token = request.headers.get('Authorization')
    if not auth.validate_token(token):
        return {"error": "Unauthorized"}, 401

    # 2. Rate limit
    user_id = request.user.id
    allowed, retry_after = limiter.check_user_rate_limit(user_id)
    if not allowed:
        return {"error": f"Rate limited. Retry after {retry_after}s"}, 429

    # 3. Validate input
    data = request.json
    try:
        InputValidator.validate_skill_name(data['name'])
    except ValueError as e:
        return {"error": str(e)}, 400

    # 4. Process request
    skill = create_skill_in_db(data['name'])
    return jsonify(skill), 201
```

### Database Query Protection

```python
from src.workflow_codification.security import InputValidator
import sqlite3

def get_user_by_email(email):
    # Validate input
    try:
        InputValidator.validate_sql_parameter(email)
    except ValueError:
        return None

    # Use parameterized query (NOT string concatenation)
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    return cursor.fetchone()
```

### Logging with PII Protection

```python
from src.workflow_codification.security import PIISanitizer
import logging

logger = logging.getLogger(__name__)

def log_error_safely(error_trace):
    # Sanitize before logging
    safe_trace = PIISanitizer.sanitize_trace(error_trace)
    logger.error(f"Error: {safe_trace}")
```

## Testing Security

Include security checks in your unit tests:

```python
import pytest
from src.workflow_codification.security import InputValidator

def test_user_registration():
    # Should reject SQL injection attempts
    with pytest.raises(ValueError):
        InputValidator.validate_sql_parameter("'; DROP TABLE users; --")

    # Should accept valid inputs
    assert InputValidator.validate_skill_name("valid-skill") is True
```

## Troubleshooting

### Rate Limiting Not Working
- Ensure Redis is running: `redis-cli ping`
- Check Redis configuration: `REDIS_HOST`, `REDIS_PORT`
- Verify connection: `redis-cli -h localhost -p 6379`

### Tokens Expiring Immediately
- Check token TTL: Default is 3600 seconds (1 hour)
- Verify system clock is synchronized
- Check Redis for expired keys

### False Positives in Secret Detection
- Bandit may flag legitimate subprocess calls
- Review findings and suppress with `# nosec` comments
- Document any intentional security trade-offs

### PII Not Being Sanitized
- Check pattern coverage in `PIISanitizer`
- Add custom patterns for organization-specific data
- Verify sanitization is applied before all logging

## Best Practices

1. **Always Validate Input**: Use `InputValidator` on all user inputs
2. **Rate Limit Everything**: Protect all public endpoints
3. **Sanitize Logs**: Never log PII without sanitization
4. **Use Parameterized Queries**: Never concatenate SQL
5. **Validate Tokens**: Check expiration on every protected endpoint
6. **Run Security Audits**: Automated checks in CI/CD pipeline
7. **Document Security Decisions**: Record any intentional trade-offs
8. **Keep Dependencies Updated**: Run `SecurityAuditor.check_dependencies()`
9. **Test Security Controls**: Include security tests in test suite
10. **Monitor Rate Limits**: Track and alert on suspicious patterns

## References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- GDPR Compliance: https://gdpr-info.eu/
- Bandit Documentation: https://bandit.readthedocs.io/
- Redis Security: https://redis.io/docs/management/security/
