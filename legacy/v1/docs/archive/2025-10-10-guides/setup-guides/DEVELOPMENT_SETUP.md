# Development Environment Setup

This document explains how to configure and use the enhanced local development environment with relaxed CSP policies and comprehensive debugging capabilities for dashboard development.

## 🚀 Quick Start

### 1. Basic Development Server

```bash
# Start the example development server
node src/development/example-dev-server.js

# Or with custom port
NODE_ENV=development PORT=3002 node src/development/example-dev-server.js
```

### 2. Enhanced Development Mode

```bash
# Start with all development features enabled
DEV_MODE=true node src/development/example-dev-server.js
```

## 📋 Features Overview

### 🔧 Configuration Management
- **Development-specific server configuration** with relaxed CSP policies
- **Environment switching** between development and production
- **Hot configuration swapping** without server restart
- **Configuration validation** and comparison tools

### 🛠️ Development Tools
- **Enhanced logging** with request/response details
- **Mock data endpoints** for testing
- **Authentication bypass** for development
- **CORS relaxation** for local development

### 🔍 Debugging Capabilities
- **WebSocket debugging** with comprehensive connection monitoring
- **Real-time connection status** indicators
- **Performance metrics** and health monitoring
- **Error tracking** and detailed logging

### 🧪 Testing Utilities
- **Connection testing** (basic, load, stress tests)
- **Real-time connection simulation**
- **Performance benchmarking**
- **Automated test reporting**

## 📁 Component Structure

```
src/development/
├── config-switcher.js          # Environment configuration manager
├── development-mode.js         # Development mode implementation
├── connection-status.js        # Connection monitoring utilities
├── testing-utils.js           # Real-time testing suite
├── websocket-debugger.js      # WebSocket debugging tools
└── example-dev-server.js      # Complete example server

config/
└── development-server.js       # Development/production configurations
```

## 🔧 Configuration Options

### Environment Variables

```bash
# Environment settings
NODE_ENV=development          # or production
DEV_MODE=true                 # Force development mode
DEV_PORT=3001                 # Custom port
DEV_HOST=localhost            # Custom host

# Security settings
DEV_BYPASS_TOKEN=dev-token    # Development bypass token
ALLOWED_ORIGINS=*            # CORS origins for development

# Debug settings
DEBUG_LEVEL=debug            # Logging level
ENABLE_METRICS=true          # Performance metrics
ENABLE_WEBSOCKET_DEBUG=true  # WebSocket debugging
```

### Configuration Files

Create `config/current-env.json` to persist environment settings:

```json
{
  "environment": "development",
  "timestamp": "2025-01-09T17:00:00.000Z",
  "config": {
    "server": {
      "port": 3001,
      "host": "localhost"
    }
  },
  "history": [
    {
      "from": "production",
      "to": "development",
      "timestamp": "2025-01-09T17:00:00.000Z",
      "reason": "Development work"
    }
  ]
}
```

## 🛠️ Development Mode Features

### Relaxed Security Policies

**Development CSP:**
```javascript
{
  "default-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:", "blob:"],
  "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:", "blob:", "http://localhost:*"],
  "connect-src": ["'self'", "data:", "blob:", "http://localhost:*", "ws://localhost:*", "wss://localhost:*"]
}
```

**Authentication Bypass:**
- Automatic authentication for localhost requests
- Development bypass tokens
- Admin privileges for development

### Enhanced Debugging

**WebSocket Debugging:**
```javascript
// Get WebSocket debug information
GET /api/debug/websocket

// Run stress test
POST /api/debug/websocket/stress-test
{
  "connections": 10,
  "messages": 100,
  "interval": 100
}
```

**Connection Status:**
```javascript
// Get connection status
GET /api/debug/connections

// Get specific connection info
GET /api/debug/connections/:id
```

## 🧪 Testing Utilities

### Basic Connection Test

```bash
curl -X POST http://localhost:3001/api/test/basic \
  -H "Content-Type: application/json" \
  -d '{
    "serverUrl": "ws://localhost:3001",
    "options": {
      "timeout": 5000
    }
  }'
```

### Load Testing

```bash
curl -X POST http://localhost:3001/api/test/load \
  -H "Content-Type: application/json" \
  -d '{
    "serverUrl": "ws://localhost:3001",
    "options": {
      "connections": 20,
      "messagesPerConnection": 50,
      "messageInterval": 100
    }
  }'
```

### Stress Testing

```bash
curl -X POST http://localhost:3001/api/test/stress \
  -H "Content-Type: application/json" \
  -d '{
    "serverUrl": "ws://localhost:3001",
    "options": {
      "rampUpTime": 10000,
      "peakConnections": 50,
      "sustainedTime": 30000,
      "rampDownTime": 10000
    }
  }'
```

## 📊 Monitoring and Metrics

### System Monitoring

```bash
# Get system metrics
GET /api/monitor/system

# Get performance metrics
GET /api/monitor/performance

# Health check
GET /api/monitor/health
```

### WebSocket Metrics

```bash
# Real-time WebSocket metrics
GET /api/debug/websocket

# Response example:
{
  "connections": [
    {
      "id": "conn_1234567890_abc123",
      "connected": true,
      "healthy": true,
      "messageCount": 42,
      "avgLatency": 15.2,
      "uptime": 120000
    }
  ],
  "metrics": {
    "totalConnections": 5,
    "activeConnections": 3,
    "totalMessages": 1250,
    "avgLatency": 18.5
  }
}
```

## 🔧 Environment Switching

### Switch Environments via API

```bash
# Switch to production
curl -X POST http://localhost:3001/api/config/switch \
  -H "Content-Type: application/json" \
  -d '{
    "environment": "production",
    "options": {
      "reason": "Production testing",
      "save": true
    }
  }'

# Switch back to development
curl -X POST http://localhost:3001/api/config/switch \
  -H "Content-Type: application/json" \
  -d '{
    "environment": "development",
    "options": {
      "reason": "Development work"
    }
  }'
```

### Get Current Configuration

```bash
# Get current environment info
GET /api/config/environment

# Compare environments
GET /api/config/compare?from=development&to=production

# Export configuration
GET /api/config/export?format=json
```

## 🛠️ Development Tools

### Mock Data Endpoints

```bash
# Get mock metrics
GET /api/dev/mock/metrics

# Get mock swarm data
GET /api/dev/mock/swarm

# Get mock alerts
GET /api/dev/mock/alerts
```

### Test Endpoints

```bash
# Success test
POST /api/dev/test/success

# Error test
POST /api/dev/test/error

# Delayed response
POST /api/dev/test/delay?delay=2000
```

### Echo Endpoint

```bash
# Echo request for testing
curl -X POST http://localhost:3001/api/dev/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello World"}'
```

## 🔌 Socket.IO Development Commands

### Client-side Usage

```javascript
const socket = io('http://localhost:3001');

// Get server status
socket.emit('dev:command', {
  type: 'get_status'
}, (response) => {
  console.log('Server status:', response);
});

// Switch environment
socket.emit('dev:command', {
  type: 'switch_environment',
  data: {
    environment: 'production'
  }
}, (response) => {
  console.log('Environment switched:', response);
});

// Run test
socket.emit('dev:command', {
  type: 'run_test',
  data: {
    testType: 'basic',
    serverUrl: 'ws://localhost:3001'
  }
}, (response) => {
  console.log('Test results:', response);
});

// Test message
socket.emit('test:message', {
  message: 'Hello from client'
}, (response) => {
  console.log('Echo response:', response);
});

// Ping test
socket.emit('ping', (timestamp) => {
  console.log('Latency:', Date.now() - timestamp, 'ms');
});
```

## 🚨 Troubleshooting

### Common Issues

1. **CSP Violations in Development**
   - Check the current CSP headers: `GET /api/config/environment`
   - Switch to development mode for relaxed CSP

2. **WebSocket Connection Issues**
   - Check WebSocket status: `GET /api/debug/websocket`
   - Verify connection health: `GET /api/debug/connections`

3. **Authentication Issues**
   - Use development bypass token: `X-Dev-Bypass: dev-bypass-2025`
   - Check authentication bypass status: `GET /api/dev/status`

4. **Performance Issues**
   - Run performance metrics: `GET /api/monitor/performance`
   - Check connection health: `GET /api/monitor/health`

### Debug Mode

Enable comprehensive debugging:

```bash
DEBUG=* node src/development/example-dev-server.js
```

Or enable specific debug modules:

```bash
DEBUG=websocket:* DEBUG=connection:* node src/development/example-dev-server.js
```

## 📚 API Reference

### Configuration API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config/environment` | GET | Get current environment configuration |
| `/api/config/switch` | POST | Switch to different environment |
| `/api/config/compare` | GET | Compare two environments |
| `/api/config/validate` | POST | Validate configuration |
| `/api/config/export` | GET | Export configuration |

### Debugging API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/debug/websocket` | GET | Get WebSocket debugging info |
| `/api/debug/websocket/stress-test` | POST | Run WebSocket stress test |
| `/api/debug/connections` | GET | Get connection status |
| `/api/debug/connections/:id` | GET | Get specific connection info |

### Testing API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/test/status` | GET | Get testing suite status |
| `/api/test/basic` | POST | Run basic connection test |
| `/api/test/load` | POST | Run load test |
| `/api/test/stress` | POST | Run stress test |
| `/api/test/:testId` | DELETE | Cancel running test |

### Monitoring API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/monitor/system` | GET | Get system metrics |
| `/api/monitor/performance` | GET | Get performance metrics |
| `/api/monitor/health` | GET | Get health status |

## 🔧 Integration with Existing Servers

To integrate these development tools into an existing Express server:

```javascript
import express from 'express';
import ConfigurationSwitcher from './src/development/config-switcher.js';
import DevelopmentMode from './src/development/development-mode.js';

const app = express();
const server = createServer(app);

// Initialize development components
const configSwitcher = new ConfigurationSwitcher(app, server, {
  autoDetect: true,
  allowHotSwap: true
});

// Initialize development mode if needed
if (configSwitcher.currentEnvironment === 'development') {
  const developmentMode = configSwitcher.getDevelopmentMode();
  // Additional development setup
}

// Start server
server.listen(3001, () => {
  console.log(`Server running in ${configSwitcher.currentEnvironment} mode`);
});
```

## 📈 Best Practices

1. **Environment Detection**: Always use the configuration switcher for environment detection
2. **Security**: Never use development bypass tokens in production
3. **Testing**: Use the testing utilities to validate real-time connections
4. **Monitoring**: Monitor connection health and performance during development
5. **Configuration**: Validate configuration changes before applying them

## 🎯 Next Steps

1. **Customize Configuration**: Modify `config/development-server.js` for your specific needs
2. **Add Custom Endpoints**: Extend the example server with your own API endpoints
3. **Integration Testing**: Use the testing utilities to validate your WebSocket implementations
4. **Performance Optimization**: Monitor and optimize connection performance using the debugging tools
5. **Production Deployment**: Use the configuration switcher to test production-like settings locally

For more detailed information about each component, refer to the inline documentation in the respective source files.