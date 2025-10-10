# Redis Authentication Setup

Redis authentication is configured for Claude Flow Novice.

## Configuration

✅ Password: 64-character secure password
✅ Stored in: `.env` file (REDIS_PASSWORD)
✅ Runtime: Redis configured with `requirepass`

## Connecting to Redis

### From Application

```javascript
const redis = require('redis');
const client = redis.createClient({
  host: 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD
});
```

### From Redis CLI

```bash
export REDIS_PASSWORD=$(grep REDIS_PASSWORD .env | cut -d= -f2)
redis-cli -a "$REDIS_PASSWORD" ping
```

## Security Best Practices

1. **Never commit `.env`** - already in .gitignore
2. **Rotate password every 90 days**: `npm run security:rotate-keys`
3. **Use TLS** for production Redis connections
4. **Monitor** Redis logs for authentication failures

## Troubleshooting

### Authentication Failed

Check password in .env:
```bash
grep REDIS_PASSWORD .env
```

Verify Redis configuration:
```bash
redis-cli config get requirepass
```

### Password Rotation

Automated:
```bash
npm run security:rotate-keys
```

Manual:
```bash
# Generate new password
openssl rand -base64 48 | head -c 64

# Update .env
REDIS_PASSWORD=new-password-here

# Update Redis runtime
redis-cli config set requirepass "new-password-here"

# Test
redis-cli -a "new-password-here" ping
```

## Security Audit

Run comprehensive security audit:
```bash
npm run security:full-audit
```

## Support

For Redis authentication issues:
- Check logs: `sudo journalctl -u redis -n 50`
- Test connection: `redis-cli -a "$REDIS_PASSWORD" ping`
