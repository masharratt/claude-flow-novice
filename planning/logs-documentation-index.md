# Logs Documentation Index

## Overview

This documentation provides comprehensive coverage of Claude Flow's logging system. The logging infrastructure offers structured, performant, and extensible logging capabilities for applications and AI agent coordination.

## Documentation Structure

### Core Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [logs-api.md](./logs-api.md) | Complete API reference | Developers, Integrators |
| [logs-features.md](./logs-features.md) | Available features and capabilities | Developers, System Admins |
| [logs-functions.md](./logs-functions.md) | Utility functions and helpers | Developers |
| [logs-hooks.md](./logs-hooks.md) | System integration points | Developers, DevOps |
| [logs-mcp.md](./logs-mcp.md) | Model Context Protocol integration | AI Engineers, Researchers |
| [logs-slash-commands.md](./logs-slash-commands.md) | CLI commands and operations | Developers, Operators |
| [documentation-style-guide.md](./documentation-style-guide.md) | Writing guidelines and standards | Documentation Authors |

## Quick Start

### Basic Usage

\`\`\`javascript
import { Logger } from './src/core/logger';

// Get logger instance
const logger = Logger.getInstance({
  level: 'info',
  destination: 'console'
});

// Log messages
logger.info('Application started');
logger.error('Database connection failed', { host: 'localhost' });

// Create child logger with context
const userLogger = logger.child({ userId: '123' });
userLogger.info('User logged in');
\`\`\`

### Configuration

\`\`\`javascript
await logger.configure({
  level: 'info',
  format: 'json',
  destination: 'both',
  filePath: './logs/app.log',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
});
\`\`\`

### CLI Commands

\`\`\`bash
# View recent logs
/logs --level error --limit 20

# Analyze log patterns
/logs-analyze --type errors --range 24h

# Search log entries
/logs-search "database AND failed" --since 1h
\`\`\`

## Architecture Overview

### Core Components

1. **Logger Class**: Main logging interface
2. **Transparency Logger**: Agent coordination logging
3. **Migration Logger**: Specialized migration logging
4. **File Management**: Rotation and cleanup
5. **Hook System**: Extensible integration points

### Log Flow

```
Application Code → Logger → Hooks → Formatters → Destinations
                                    ↓
                               File System / Console
```

### Data Model

\`\`\`typescript
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: Record<string, unknown>;
  data?: unknown;
  error?: unknown;
}
\`\`\`

## Integration Patterns

### Application Integration

\`\`\`javascript
// Express.js middleware
app.use((req, res, next) => {
  const requestLogger = logger.child({
    requestId: req.id,
    method: req.method,
    url: req.url
  });

  requestLogger.info('Request started');
  next();
});
\`\`\`

### AI Agent Integration

\`\`\`javascript
// Agent transparency logging
transparencyLogger.logMessage({
  swarmId: 'swarm-123',
  agentId: 'coder-1',
  messageType: 'decision',
  content: 'Implement feature X',
  metadata: {
    reasoning: 'Addresses requirement Y',
    confidence: 0.85
  }
});
\`\`\`

### MCP Integration

\`\`\`javascript
// Query logs via MCP
const results = await mcp.call('log_query', {
  level: 'error',
  since: '2024-01-15T00:00:00Z',
  limit: 50
});
\`\`\`

## Performance Considerations

### Optimization Strategies

1. **Async Operations**: Non-blocking I/O
2. **Buffered Writes**: Efficient file operations
3. **Log Levels**: Filter unnecessary output
4. **Context Management**: Efficient child logger creation

### Benchmarks

- **Throughput**: 10,000+ logs/second
- **Latency**: <1ms average per log entry
- **Memory**: <50MB for normal operations
- **File I/O**: Optimized batch writes

## Security Considerations

### Data Protection

- **Sensitive Data Filtering**: Automatic redaction
- **Access Control**: Role-based permissions
- **Audit Logging**: Complete operation tracking
- **Encryption**: Optional log file encryption

### Best Practices

1. Never log passwords, tokens, or secrets
2. Use structured logging for sensitive operations
3. Implement proper access controls
4. Regular log rotation and cleanup

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Logs not appearing | Level filter | Check log level configuration |
| File permissions | Access denied | Verify directory permissions |
| Performance issues | Synchronous operations | Use async configuration |
| Memory leaks | Large context objects | Minimize context data |

### Debug Commands

\`\`\`bash
# Check configuration
/logs-config show

# Validate log files
/logs-validate

# Monitor real-time
/logs-tail --level debug

# Analyze performance
/logs-analyze --type performance
\`\`\`

## Migration Guide

### From v1.x to v2.x

1. **Update imports**: Use new logger path
2. **Configuration**: Migrate to new config format
3. **Hooks**: Update hook signatures
4. **API changes**: Review breaking changes

\`\`\`javascript
// Old way
const logger = require('./logger');
logger.log('info', 'message');

// New way
import { Logger } from './src/core/logger';
const logger = Logger.getInstance();
logger.info('message');
\`\`\`

## Contributing

### Adding New Features

1. Follow [documentation style guide](./documentation-style-guide.md)
2. Update relevant documentation files
3. Add examples and use cases
4. Include performance considerations

### Documentation Standards

- **Sparse, concise language**
- **Practical examples**
- **Consistent formatting**
- **Cross-references**

## Support

### Getting Help

1. Check relevant documentation section
2. Search existing issues
3. Use troubleshooting commands
4. Review integration examples

### Resources

- **API Reference**: [logs-api.md](./logs-api.md)
- **Feature Overview**: [logs-features.md](./logs-features.md)
- **CLI Commands**: [logs-slash-commands.md](./logs-slash-commands.md)
- **Integration Hooks**: [logs-hooks.md](./logs-hooks.md)

## Version History

### v2.0.0
- Transparency logging for AI agents
- MCP integration
- Enhanced CLI commands
- Performance optimizations

### v1.6.6
- Bug fixes and stability improvements
- Enhanced error handling
- Memory optimizations

### v1.5.0
- File rotation improvements
- Hook system introduction
- Migration logging support

---

*This documentation covers the complete logging system. For specific implementation details, refer to the individual documentation files listed above.*