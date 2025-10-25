# Transparency Middleware

## Overview

The Transparency Middleware is a sophisticated agent interaction tracking system designed to capture, log, and analyze agent activities with comprehensive memory tracking and advanced security features.

## Key Features

- **Memory Capture:** Comprehensive logging of agent interactions
- **Security:** Built-in data anonymization and payload filtering
- **Performance:** Low-overhead, high-throughput event tracking
- **Flexibility:** Configurable capture and logging strategies

## Quick Start

### Installation

```bash
npm install @claude-flow/transparency-middleware
```

### Basic Configuration

Create a `config.json` in your project:

```json
{
  "capture": {
    "edit_operations": true,
    "bash_commands": true,
    "task_spawning": true
  },
  "security": {
    "anonymize_sensitive_data": true,
    "max_payload_size_bytes": 10240
  },
  "events": {
    "emit_to_redis": true,
    "emit_to_sqlite": true
  }
}
```

### Basic Usage

```typescript
import TransparencyMiddleware from '@claude-flow/transparency-middleware';

const config = TransparencyMiddleware.loadConfig('./config.json');
const middleware = new TransparencyMiddleware(config);

await middleware.initialize();
await middleware.captureAgentExecution('agent-id', agentOutput, 'task-id');
await middleware.cleanup();
```

## Documentation

For detailed usage, configuration, and troubleshooting, see [SKILL.md](SKILL.md).

## Performance Characteristics

- **Memory Overhead:** <50MB for 1000 events
- **Storage:** ~1KB per high-value event
- **Latency:** <5ms per event capture
- **Throughput:** 1000+ events/sec

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.