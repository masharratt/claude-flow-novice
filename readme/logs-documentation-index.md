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
| [logs-cli-redis.md](./logs-cli-redis.md) | Redis CLI integration and commands | Developers, Operators |
| [documentation-style-guide.md](./documentation-style-guide.md) | Writing guidelines and standards | Documentation Authors |

## Context Management

- [ACE System Overview](./logs-features.md#adaptive-context-extension-ace)
- [Context Reflection](./logs-slash-commands.md#context-reflect)
- [Context Curation](./logs-slash-commands.md#context-curate)
- [Context Query](./logs-slash-commands.md#context-query)
- [Context Injection](./logs-slash-commands.md#context-inject)
- [Context Statistics](./logs-slash-commands.md#context-stats)
- [ACE Core Functions](./logs-functions.md#ace-core-functions)
- [Context Management Commands](./additional-commands.md#context-management)

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

### Hybrid Routing (Specialized Agent Selection)

\`\`\`bash
# List 50+ dynamically discovered agents
node src/cli/hybrid-routing/spawn-workers.js --list-agents

# List agents by category (16 categories)
node src/cli/hybrid-routing/spawn-workers.js --agents-by-category

# Automatic agent selection (keyword-based)
node src/cli/hybrid-routing/spawn-workers.js "Build auth" --max-agents=3

# Coordinator override (manual agent types)
node src/cli/hybrid-routing/spawn-workers.js "Refactor API" \
  --agents=architect,coder,reviewer

# Full override (custom agents + subtasks)
node src/cli/hybrid-routing/spawn-workers.js "OAuth2" \
  --agents=coder,security-specialist \
  --subtasks="Implement PKCE|Audit tokens"
\`\`\`

**Features**:
- **50+ specialized agents** dynamically discovered from `.claude/agents/` folder
- **16 categories**: analysis, architecture, cfn-loop, consensus, core-agents, development, devops, documentation, goal, planning-team, security, sparc, specialized, swarm, testing
- **Dynamic discovery**: Recursive scanning with category preservation, in-memory caching, lazy loading
- Three selection modes: automatic, coordinator override, full override
- z.ai provider integration for worker agents
- Real Claude API calls with bash execution capability
- Redis coordination, SQLite memory, web portal integration

**Documentation**: [\`additional-commands.md#hybrid-routing\`](./additional-commands.md#hybrid-routing-cost-optimized-worker-spawning), [\`logs-features.md#hybrid-routing\`](./logs-features.md#hybrid-routing-specialized-agent-selection), \`src/cli/hybrid-routing/COORDINATOR-OVERRIDE.md\`

### CFN Loop Coordinators

**Purpose**: Mode-specific coordinators with autonomous phase execution

**Coordinators**:
- **cfn-coordinator-mvp**: <$1/phase, 15min, 2-3 workers
- **cfn-coordinator-standard**: $2/phase, 30min, 4-5 workers
- **cfn-coordinator-enterprise**: $5/phase, 60min, 5-7 workers

**Key Features**:
- Autonomous Loop 3→2→4 execution
- Auto-phase-launch (full sprint lifecycle)
- Return-to-chat only for human decisions or completion
- Mode-specific parameter enforcement
- Telemetry (confidence, cost, duration, savings)

\`\`\`bash
node src/cli/hybrid-routing/spawn-coordinator.js "Execute sprint: Auth" --mode=mvp --sprint-id=auth-001
\`\`\`

**Documentation**: \`logs-features.md#cfn-loop-coordinators\`, \`.claude/agents/cfn-loop/cfn-coordinator-*.md\`

### Web Portal Dashboard

**Purpose**: Real-time monitoring and control interface

**Features**:
- Agent management & monitoring
- CFN Loop visualization
- Metrics dashboard (cost, tokens, latency)
- Hybrid routing control panel
- SQLite memory browser
- Redis coordination monitor

**Launch**:
\`\`\`bash
/launch-web-dashboard              # Dev mode (port 3001)
/launch-web-dashboard --production  # Production build
\`\`\`

**Access Points**:
- Main UI: \`http://localhost:3001\`
- API Server: \`http://localhost:3000\`
- WebSocket: \`ws://localhost:3000\`

**Documentation**: \`logs-slash-commands.md#launch-web-dashboard\`, \`.claude/commands/launch-web-dashboard.md\`

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

### Sprint 1.7 (2025-10-10)
- SQLite integration with dual-write CQRS pattern
- 5-level ACL system with AES-256-GCM encryption
- Cross-session recovery (<10s)
- Blocking coordination cleanup optimization (50-60x speedup)
- Agent lifecycle tracking and audit trail
- Comprehensive test suite (56 tests, 100% pass rate)

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