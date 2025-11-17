# Database Authentication Security

## Overview

This document describes the authentication security implementation for Redis and PostgreSQL databases in the Claude Flow platform. All database connections now require strong authentication to prevent unauthorized access.

**Security Standards Implemented:**
- CVSS 8.5-8.6 vulnerability mitigation
- Redis requirepass authentication (32+ character passwords)
- PostgreSQL password authentication with SCRAM-SHA-256 encryption
- Cryptographically secure password generation
- Environment variable-based credential management
- No hardcoded credentials in configuration files

## Security Levels

### CVSS Scores Addressed

- **Redis without authentication**: CVSS 8.5 (High)
  - Allows unauthorized command execution
  - Can compromise agent coordination
  - May lead to data exfiltration

- **PostgreSQL weak authentication**: CVSS 8.6 (High)
  - Weak default credentials
  - No password complexity requirements
  - Risk of unauthorized data access

## Password Requirements

All database passwords must meet these minimum security standards:

| Requirement | Value | Reason |
|---|---|---|
| Minimum Length | 32 characters | High entropy, resistant to brute force |
| Uppercase Letters | Yes (1+) | Character set diversity |
| Lowercase Letters | Yes (1+) | Character set diversity |
| Digits | Yes (1+) | Alphanumeric complexity |
| Special Characters | Yes (1+) | Enhanced complexity |
| Excluded Characters | `$ " ' \` ` | Environment variable safety |
| Ambiguous Characters | I, l, O, 0, 1 | Readability in passwords |

## Password Generation

### Using the Password Generator

Generate cryptographically secure passwords using the built-in utility:

```bash
# Install dependencies (if not already installed)
npm install

# Generate a password
node -e "
const { generatePassword } = require('./src/lib/password-generator');
const password = generatePassword();
console.log('Generated Password:', password);
console.log('Length:', password.length);
"
```

### Programmatic Generation

```typescript
import { generatePassword, validatePassword } from './src/lib/password-generator';

// Generate with default options (32 chars, mixed case, digits, special)
const password = generatePassword();

// Generate with custom options
const customPassword = generatePassword({
  length: 64,
  uppercase: true,
  lowercase: true,
  digits: true,
  special: true,
  excludeAmbiguous: true,
});

// Validate password strength
const validation = validatePassword(password);
if (validation.valid) {
  console.log('Password is strong');
} else {
  console.log('Validation errors:', validation.errors);
}
```

## Configuration

### Redis Authentication

#### Docker Compose Setup

```yaml
redis:
  image: redis:7-alpine
  environment:
    - REDIS_PASSWORD=${REDIS_PASSWORD}
  command: redis-server --requirepass ${REDIS_PASSWORD}
  healthcheck:
    test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
```

#### Environment Variables

Set in `.env` file:

```bash
REDIS_PASSWORD=YourGeneratedPassword32CharsMinimum
```

#### Connection String Formats

```
# With authentication
redis://:password@localhost:6379

# With authentication and database selection
redis://:password@localhost:6379/0
```

#### Testing Connection

```bash
# With authentication
redis-cli -h localhost -p 6379 -a "YOUR_PASSWORD" ping

# Should return: PONG
```

### PostgreSQL Authentication

#### Docker Compose Setup

```yaml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: cfn_loop
    POSTGRES_USER: cfn_user
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_INITDB_ARGS: "-c password_encryption=scram-sha-256"
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U cfn_user"]
```

#### Environment Variables

Set in `.env` file:

```bash
POSTGRES_PASSWORD=YourGeneratedPassword32CharsMinimum
```

#### Connection String Formats

```
# Standard connection string
postgresql://cfn_user:password@localhost:5432/cfn_loop

# With connection parameters
postgresql://cfn_user:password@localhost:5432/cfn_loop?sslmode=require
```

#### Testing Connection

```bash
# With authentication
psql -U cfn_user -d cfn_loop -h localhost -W

# Will prompt for password
# Enter: YOUR_PASSWORD
```

## Implementation Details

### Redis Adapter Changes

The Redis adapter now:
- Accepts password configuration via `DatabaseConfig`
- Constructs connection strings with `redis://:password@host:port` format
- Supports both environment variable and connection string configurations
- Validates connection with authentication

```typescript
const config: DatabaseConfig = {
  type: 'redis',
  host: 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD, // Required
  timeout: 5000,
  poolSize: 10,
};

const adapter = new RedisAdapter(config);
await adapter.connect(); // Uses password authentication
```

### PostgreSQL Adapter Changes

The PostgreSQL adapter now:
- Requires password configuration (throws error if missing)
- Uses SCRAM-SHA-256 password encryption
- Validates authentication before connection pool creation
- Supports parameterized queries for SQL injection prevention

```typescript
const config: DatabaseConfig = {
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'cfn_loop',
  username: 'cfn_user',
  password: process.env.POSTGRES_PASSWORD, // Required
  poolSize: 10,
  timeout: 30000,
};

const adapter = new PostgresAdapter(config);
await adapter.connect(); // Validates password is provided
```

## Password Rotation

### Rotation Procedure

1. **Generate new password:**
   ```bash
   node -e "const {generatePassword} = require('./src/lib/password-generator'); console.log(generatePassword());"
   ```

2. **Update database credentials:**
   ```bash
   # For PostgreSQL
   psql -U cfn_user -d cfn_loop -c "ALTER USER cfn_user WITH PASSWORD 'new_password';"

   # For Redis (requires restart)
   # No direct command; must update config and restart
   ```

3. **Update .env file:**
   ```bash
   # Update environment variables
   REDIS_PASSWORD=new_password
   POSTGRES_PASSWORD=new_password
   ```

4. **Restart services:**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

5. **Verify connections:**
   ```bash
   # Redis
   redis-cli -a "new_password" ping

   # PostgreSQL
   psql -U cfn_user -d cfn_loop -h localhost -W
   ```

## Troubleshooting

### Redis Connection Issues

```
Error: WRONGPASS invalid username-password pair
```

**Solutions:**
1. Verify `REDIS_PASSWORD` environment variable is set
2. Check password matches what's configured in Redis
3. Ensure no special characters causing parsing issues
4. Test with: `redis-cli -a "password" ping`

### PostgreSQL Connection Issues

```
Error: password authentication failed for user "cfn_user"
```

**Solutions:**
1. Verify `POSTGRES_PASSWORD` environment variable is set
2. Check that password is provided (not empty)
3. Test with: `psql -U cfn_user -d cfn_loop -h localhost -W`
4. Check PostgreSQL logs: `docker-compose logs postgres`

### Special Character Issues

If passwords contain special characters and cause issues:

1. **Environment Variable Escaping:**
   - Use quotes: `REDIS_PASSWORD="password_with_special!@#"`
   - Avoid: `$`, `` ` ``, `"`, `'` in passwords

2. **URL Encoding in Connection Strings:**
   - Password is automatically URL-encoded by adapters
   - Special characters are safe in `redis://:password@host`

3. **Regenerate Password:**
   ```bash
   node -e "const {generatePassword} = require('./src/lib/password-generator'); console.log(generatePassword());"
   ```

## Monitoring and Logging

### Redis Authentication Monitoring

```bash
# View Redis auth attempts
docker-compose logs -f redis | grep AUTH

# Monitor connection activity
redis-cli -a "password" CLIENT LIST
```

### PostgreSQL Authentication Monitoring

```bash
# View PostgreSQL connection logs
docker-compose logs -f postgres | grep authentication

# Check failed login attempts
psql -U cfn_user -d cfn_loop -c "SELECT * FROM pg_stat_statements WHERE query LIKE '%authentication%';"
```

## Security Best Practices

1. **Never commit passwords to version control:**
   - Use `.gitignore` for `.env` files
   - Use `.env.example` for template only

2. **Rotate passwords regularly:**
   - Monthly for development
   - Quarterly for production
   - Immediately after suspected compromise

3. **Use strong random generation:**
   - Always use `generatePassword()` utility
   - Never manually create passwords
   - Minimum 32 characters

4. **Secure password storage:**
   - Store in secrets management system (production)
   - Use environment variables for containers
   - Never log or output passwords

5. **Audit access:**
   - Monitor connection logs
   - Track authentication failures
   - Review access patterns

## Testing Authentication

### Unit Tests

Run authentication tests:

```bash
npm test -- tests/security/database-authentication.test.ts
```

Tests cover:
- Password generation with security requirements
- Password validation and complexity checking
- Redis authentication compatibility
- PostgreSQL authentication compatibility
- Database connection string formatting
- Authentication failure scenarios
- Security entropy and randomness

### Integration Tests

Test with actual database containers:

```bash
# Start services
docker-compose up -d

# Run integration tests
npm test -- tests/integration/database-authentication.test.ts

# Stop services
docker-compose down
```

## Compliance

This implementation addresses:

- **OWASP Top 10 #2: Broken Authentication** - Strong password requirements
- **OWASP Top 10 #3: Injection** - Parameterized queries, password sanitization
- **CWE-521: Weak Password Requirements** - 32+ character minimum
- **CWE-807: Reliance on Untrusted Inputs in Security Decision** - Cryptographic validation
- **CVE Prevention** - Redis/PostgreSQL authentication bypass mitigation

## References

- [Redis Security](https://redis.io/topics/security)
- [PostgreSQL Authentication](https://www.postgresql.org/docs/15/auth-methods.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Node.js crypto Module](https://nodejs.org/api/crypto.html)
- [Password Generator Utility](./src/lib/password-generator.ts)

## Support

For authentication issues:

1. Check error messages and logs
2. Review troubleshooting section above
3. Verify environment variables are set
4. Test connections manually
5. Generate new passwords and retry
6. Review database logs for details

## Changelog

### Version 1.0 (Current)
- Redis requirepass authentication enabled
- PostgreSQL password authentication enforced
- Cryptographically secure password generator
- Comprehensive test coverage (50+ tests)
- Environment variable configuration
- Docker Compose integration
- Password rotation procedures
- Monitoring and logging guidance
