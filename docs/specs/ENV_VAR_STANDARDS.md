# Environment Variable Standards

## Naming Convention

### Format
```
[SCOPE]_[COMPONENT]_[PURPOSE]
```

### Rules
- **UPPERCASE** with underscores only
- **SCOPE prefix** required:
  - `CFN_` - Core CFN Loop system
  - `APP_` - Application-specific
  - `DB_` - Database connections
  - `API_` - External API credentials
  - `AUTH_` - Authentication/authorization
  - `LOG_` - Logging configuration
  - `CACHE_` - Caching configuration

### Examples
```bash
# Good
CFN_REDIS_URL=redis://localhost:6379
AUTH_JWT_SECRET=xxx
DB_POSTGRES_URL=postgres://...
API_OPENAI_KEY=sk-xxx
LOG_LEVEL=debug

# Bad - missing scope prefix
REDIS_URL=redis://localhost:6379
JWT_SECRET=xxx
```

## Fallback Behavior

### Required: Define fallbacks explicitly

```typescript
// REQUIRED pattern
const config = {
  redisUrl: process.env.CFN_REDIS_URL ?? 'redis://localhost:6379',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  timeout: parseInt(process.env.CFN_TIMEOUT ?? '30000', 10),
};
```

### Fallback Categories

| Category | Fallback Strategy | Example |
|----------|-------------------|---------|
| **URLs** | Local default | `localhost:PORT` |
| **Secrets** | MUST error if missing | Throw on undefined |
| **Timeouts** | Sensible default | 30000ms |
| **Flags** | Conservative default | `false` |
| **Log levels** | `info` | Not `debug` in production |

### Required Validation

```typescript
// At startup, validate required vars exist
const REQUIRED_VARS = [
  'AUTH_JWT_SECRET',
  'DB_POSTGRES_URL',
];

function validateEnv(): void {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}
```

## Secret Handling

### Rules
1. **Never log** secret values
2. **Never commit** to git (use `.env.example` with placeholders)
3. **Redact** in all outputs as `[REDACTED]`
4. **Validate format** where possible (API key prefixes, etc.)

### Secret Detection Patterns
```bash
# Patterns that indicate secrets (must be validated/redacted)
*_SECRET*
*_KEY*
*_TOKEN*
*_PASSWORD*
*_CREDENTIAL*
*_API_KEY*
```

## Type Coercion

### Required: Explicit parsing
```typescript
// Numbers - always parseInt/parseFloat with radix
const port = parseInt(process.env.CFN_PORT ?? '3000', 10);
const ratio = parseFloat(process.env.CFN_RATIO ?? '0.5');

// Booleans - explicit comparison
const debug = process.env.CFN_DEBUG === 'true';
const enabled = process.env.CFN_FEATURE !== 'false';

// Arrays - split with defined delimiter
const hosts = (process.env.CFN_HOSTS ?? 'localhost').split(',');
```

## Documentation Requirements

### Every env var must have
1. **Description** - What it configures
2. **Type** - string, number, boolean, URL, etc.
3. **Default** - Fallback value if any
4. **Required** - Yes/No
5. **Example** - Valid value example

### Template
```markdown
| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `CFN_REDIS_URL` | URL | `redis://localhost:6379` | No | Redis connection URL |
| `AUTH_JWT_SECRET` | string | - | Yes | JWT signing secret |
```

## Validation Checklist

Before code review approval:
- [ ] All vars have scope prefix
- [ ] Secrets validated at startup (fail fast)
- [ ] Non-secrets have fallbacks
- [ ] Types explicitly parsed
- [ ] No secrets in logs
- [ ] `.env.example` updated
- [ ] Env var table in relevant docs
