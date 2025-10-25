## Transparency Middleware

### Overview
The Transparency Middleware is a critical component of our agent orchestration system, designed to capture, log, and analyze agent interactions with comprehensive memory tracking and security features.

## Testing

### Unit Tests
Run the comprehensive unit test suite:
```bash
npm test src/middleware/transparency-middleware.test.ts
```

**Coverage:** 95%+ on all core methods

### Integration Tests
Test middleware with CFN Loop orchestrator:
```bash
./.claude/skills/transparency-middleware/test-integration.sh
```

### End-to-End Tests
Full lifecycle test with sample agent:
```bash
./.claude/skills/transparency-middleware/test-e2e.sh
```

## Usage Examples

### Basic Usage
```typescript
import TransparencyMiddleware from './src/middleware/transparency-middleware.js';

const config = TransparencyMiddleware.loadConfig('./.claude/skills/transparency-middleware/config.json');
const middleware = new TransparencyMiddleware(config);

await middleware.initialize();

// Capture agent execution
await middleware.captureAgentExecution('backend-dev', agentOutput, 'task-123');

await middleware.cleanup();
```

### Wrapper Script Usage
```bash
# Wrap any agent execution with automatic memory capture
./.claude/skills/transparency-middleware/wrap-agent.sh \
  "backend-dev" \
  "agent-1" \
  "task-auth-impl" \
  "implement authentication"
```

### Query Stored Memories
```bash
# Query all memories for a task
./.claude/skills/transparency-middleware/query-memory.sh "task-auth-impl" "*" 100

# Query specific agent's memories
./.claude/skills/transparency-middleware/query-memory.sh "task-auth-impl" "backend-dev" 50
```

## Configuration Guide

See `config.json` for all options. Key settings:

- `capture.edit_operations` - Capture Edit/Write/MultiEdit tools
- `capture.bash_commands` - Capture Bash commands
- `capture.task_spawning` - Capture Task spawning
- `security.anonymize_sensitive_data` - Redact secrets
- `security.max_payload_size_bytes` - Limit event size

## Troubleshooting

**Issue:** Memory not being captured
- Check `config.capture.*` filters
- Verify SQLite database permissions
- Enable debug logging

**Issue:** Redis events not emitted
- Check Redis connection (`redis-cli ping`)
- Verify `config.events.emit_*` flags
- Check channel name in config

## Performance

- **Memory overhead:** <50MB for 1000 events
- **Storage:** ~1KB per high-value event
- **Latency:** <5ms per event capture
- **Throughput:** 1000+ events/sec