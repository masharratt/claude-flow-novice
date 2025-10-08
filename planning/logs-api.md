# Logs API Documentation

## Overview

The logging API provides structured access to all logging functionality in Claude Flow. It offers programmatic control over log levels, destinations, formatting, and retrieval.

## Core API

### Logger Configuration

#### configure(options)

**Purpose**: Configure logger behavior

**Signature**: \`configure(options: LoggingConfig) -> Promise<void>\`

**Parameters**:
- \`options\` (LoggingConfig): Configuration object
  - \`level\` (string): Log level - 'debug', 'info', 'warn', 'error'
  - \`format\` (string): Output format - 'json', 'text'
  - \`destination\` (string): Where to log - 'console', 'file', 'both'
  - \`filePath\` (string, optional): Path for file logging
  - \`maxFileSize\` (number, optional): Maximum file size in bytes
  - \`maxFiles\` (number, optional): Maximum number of rotated files

**Example**:
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

### Log Methods

#### debug(message, meta?)

**Purpose**: Log debug-level information

**Signature**: \`debug(message: string, meta?: unknown) -> void\`

**Parameters**:
- \`message\` (string): Log message
- \`meta\` (unknown, optional): Additional context data

**Example**:
\`\`\`javascript
logger.debug('Processing request', { requestId: '123', userId: '456' });
\`\`\`

#### info(message, meta?)

**Purpose**: Log informational messages

**Signature**: \`info(message: string, meta?: unknown) -> void\`

**Parameters**:
- \`message\` (string): Log message
- \`meta\` (unknown, optional): Additional context data

**Example**:
\`\`\`javascript
logger.info('User authenticated', { userId: '456', timestamp: Date.now() });
\`\`\`

#### warn(message, meta?)

**Purpose**: Log warning messages

**Signature**: \`warn(message: string, meta?: unknown) -> void\`

**Parameters**:
- \`message\` (string): Warning message
- \`meta\` (unknown, optional): Additional context data

**Example**:
\`\`\`javascript
logger.warn('Rate limit approaching', { userId: '456', current: 95, limit: 100 });
\`\`\`

#### error(message, error?)

**Purpose**: Log error messages

**Signature**: \`error(message: string, error?: unknown) -> void\`

**Parameters**:
- \`message\` (string): Error message
- \`error\` (unknown, optional): Error object or details

**Example**:
\`\`\`javascript
logger.error('Database connection failed', {
  host: 'localhost',
  port: 5432,
  originalError: error
});
\`\`\`

### Advanced Features

#### child(context)

**Purpose**: Create child logger with additional context

**Signature**: \`child(context: Record<string, unknown>) -> Logger\`

**Parameters**:
- \`context\` (Record): Context data to include in all log entries

**Returns**: New Logger instance with inherited configuration plus context

**Example**:
\`\`\`javascript
const requestLogger = logger.child({
  requestId: '123',
  userId: '456',
  ip: '192.168.1.1'
});

requestLogger.info('Processing order');
// Output includes all context from parent + child
\`\`\`

#### close()

**Purpose**: Properly close logger and release resources

**Signature**: \`close() -> Promise<void>\`

**Example**:
\`\`\`javascript
// In application shutdown
await logger.close();
process.exit(0);
\`\`\`

## Response Formats

### JSON Format
\`\`\`json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "User authenticated successfully",
  "context": {
    "requestId": "123",
    "userId": "456"
  },
  "data": {
    "timestamp": 1705319400000,
    "method": "POST"
  }
}
\`\`\`

### Text Format
\`\`\`
[2024-01-15T10:30:00.000Z] INFO User authenticated successfully {"requestId":"123","userId":"456"} {"timestamp":1705319400000,"method":"POST"}
\`\`\`

## Error Handling

The logger handles errors gracefully:

- **File write errors**: Fallback to console logging
- **Invalid configurations**: Throw descriptive errors
- **Resource exhaustion**: Implement automatic cleanup

## Performance Considerations

- **Async file operations**: Non-blocking I/O
- **Buffered writes**: Efficient file operations
- **Log rotation**: Automatic file management
- **Memory usage**: Configurable buffer sizes

## Integration Examples

### Express.js Integration
\`\`\`javascript
import express from 'express';
import { logger } from './logger';

const app = express();

// Request logging middleware
app.use((req, res, next) => {
  const requestLogger = logger.child({
    method: req.method,
    url: req.url,
    ip: req.ip
  });

  requestLogger.info('Request received');
  next();
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Request failed', {
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack
  });

  res.status(500).json({ error: 'Internal server error' });
});
\`\`\`

### Process Integration
\`\`\`javascript
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});
\`\`\`

## Related Documentation

- [Features](./logs-features.md) - Available logging features
- [Functions](./logs-functions.md) - Utility functions
- [Hooks](./logs-hooks.md) - System integration hooks
- [MCP](./logs-mcp.md) - Model Context Protocol integration
- [Slash Commands](./logs-slash-commands.md) - CLI commands