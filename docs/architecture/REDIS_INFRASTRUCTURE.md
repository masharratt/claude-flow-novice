# Redis Infrastructure Configuration

## Overview

The Redis configuration system provides a robust, configurable approach to managing Redis connections in the Claude Flow Novice project. It supports multiple connection strategies, advanced error handling, and flexible configuration.

## Configuration File

Location: `config/redis.config.js`

### Key Features

1. **Flexible Connection Settings**
   - Primary connection configuration
   - Fallback connection support
   - Environment variable overrides

2. **Connection Options**
   - Connection timeout management
   - Retry strategy for connection failures
   - Socket keepalive and reconnection settings

3. **Logging and Monitoring**
   - Configurable logging levels
   - Connection event tracking

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Primary Redis connection URL | `redis://localhost:6379` |
| `REDIS_USERNAME` | Redis username | `''` (empty) |
| `REDIS_PASSWORD` | Redis password | `''` (empty) |
| `REDIS_LOGGING` | Enable detailed logging | `false` |
| `REDIS_LOG_LEVEL` | Logging verbosity | `'error'` |
| `REDIS_FALLBACK_1` | First fallback Redis URL | `''` |
| `REDIS_CLUSTER_MODE` | Enable Redis cluster mode | `false` |
| `REDIS_SENTINEL_MODE` | Enable Redis sentinel mode | `false` |

## Connection Management

### Client Creation

```javascript
const { createRedisClient, checkRedisAvailability } = require('../config/redis.config');

async function connectToRedis() {
  try {
    const client = await createRedisClient();
    const available = await checkRedisAvailability(client);

    if (available) {
      console.log('Redis connection successful');
    } else {
      console.warn('Redis connection failed');
    }
  } catch (error) {
    console.error('Redis connection error:', error);
  }
}
```

### Retry and Error Handling

- Exponential backoff for connection retries
- Maximum of 3 connection attempts
- Detailed error logging
- Graceful failure mechanisms

## Test Integration

The `spawn-workers.test.js` has been updated to:
- Check Redis availability before running tests
- Skip Redis-specific tests if connection fails
- Provide robust error handling

### Example Test Setup

```javascript
describe('Redis Coordination', () => {
  let redisClient;
  let redisAvailable = false;

  beforeAll(async () => {
    redisClient = await createRedisClient();
    redisAvailable = await checkRedisAvailability(redisClient);
  });

  // Redis tests with conditional execution
  test('Redis connection test', function() {
    if (!redisAvailable) {
      this.skip(); // Skip test if Redis unavailable
    }

    // Test Redis functionality
  });
});
```

## Best Practices

1. Always use `createRedisClient()` for connections
2. Check Redis availability before operations
3. Handle connection failures gracefully
4. Use environment variables for configuration
5. Implement fallback and retry mechanisms

## Troubleshooting

- Ensure Redis server is running
- Check network connectivity
- Verify credentials and connection URL
- Review logs for detailed error information

## Advanced Modes

### Cluster Mode

Enable distributed Redis operations with multiple nodes.

```bash
export REDIS_CLUSTER_MODE=true
```

### Sentinel Mode

Implement high availability with Redis Sentinel.

```bash
export REDIS_SENTINEL_MODE=true
```

## Security Considerations

- Never hardcode Redis credentials
- Use environment variables
- Implement proper access controls
- Rotate credentials periodically