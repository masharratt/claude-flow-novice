# Redis Performance Enhancement - Phase 4

## Overview

This project implements **Phase 4 Redis Transparency Enhancement** with a focus on **Historical Performance Analysis** for multi-agent systems. The system provides comprehensive performance tracking, anomaly detection, collaboration monitoring, and detailed analytics capabilities.

## Features

### 🎯 Core Capabilities

- **Historical Performance Analysis**: Track and analyze agent performance over time
- **Anomaly Detection**: Identify performance anomalies using statistical methods
- **Collaboration Tracking**: Monitor cross-agent collaboration patterns
- **Real-time Monitoring**: Live performance metrics and alerts
- **Comprehensive Reporting**: Generate detailed performance reports
- **Dashboard Integration**: Ready-to-use dashboard endpoints
- **Data Export**: Export performance data in JSON/CSV formats

### 📊 Analytics Features

- **Performance Trends**: Analyze performance patterns over time
- **Agent Scoring**: Calculate performance scores based on multiple metrics
- **Error Rate Analysis**: Track and analyze error patterns
- **Response Time Analytics**: Monitor response time distributions
- **Confidence Tracking**: Track agent confidence levels
- **Throughput Analysis**: Monitor task completion rates

### 🔍 Monitoring & Alerting

- **Real-time Alerts**: Configurable alert thresholds
- **Performance Anomalies**: Automatic anomaly detection
- **System Health Monitoring**: Overall system health checks
- **Custom Metrics**: Track custom performance metrics
- **Alert Aggregation**: Prevent alert fatigue with smart aggregation

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Express API   │    │ Performance      │    │   Redis         │
│   Server        │───▶│ Tracking         │───▶│   Database      │
│                 │    │ Middleware       │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   REST API      │    │ Performance      │    │   Time-Series   │
│   Endpoints     │    │ Analyzer         │    │   Data Storage  │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 16+ 
- Redis 6+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd redis-performance-enhancement

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit configuration
nano .env
```

### Configuration

Create a `.env` file with the following configuration:

```env
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Performance Settings
PERFORMANCE_RETENTION_DAYS=30
ALERT_RESPONSE_TIME=1000
ALERT_ERROR_RATE=0.05
COLLECT_DETAILED_METRICS=true

# Feature Flags
FEATURE_REAL_TIME_ALERTS=true
FEATURE_PREDICTIVE_ANALYTICS=false
FEATURE_COLLABORATION_TRACKING=true

# Security
PERFORMANCE_AUTH_REQUIRED=false
API_CORS_ORIGIN=*
```

### Running the Application

```bash
# Development mode
npm run dev

# Production mode
npm start

# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## API Documentation

### Health & System

#### `GET /health`
System health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "performance": {
    "status": "healthy",
    "redis": "connected",
    "systemStats": {
      "totalAgents": 5,
      "activeAgents": 3,
      "totalMetrics": 1250
    }
  }
}
```

### Agent Performance

#### `GET /api/performance/agents/:agentId/history`
Get performance history for a specific agent.

**Parameters:**
- `agentId` (path): Agent identifier
- `startTime` (query): Start timestamp (optional)
- `endTime` (query): End timestamp (optional)
- `limit` (query): Maximum number of records (default: 1000)
- `includeAggregates` (query): Include aggregate calculations (default: true)

**Response:**
```json
{
  "success": true,
  "data": {
    "agentId": "agent-123",
    "timeRange": {
      "startTime": 1704067200000,
      "endTime": 1704153600000
    },
    "metrics": [...],
    "aggregates": {
      "totalTasks": 100,
      "successfulTasks": 95,
      "failedTasks": 5,
      "averageResponseTime": 250,
      "performanceScore": 85.5
    }
  }
}
```

#### `GET /api/performance/agents/:agentId/report`
Generate comprehensive performance report.

**Response:**
```json
{
  "success": true,
  "data": {
    "agentId": "agent-123",
    "reportGenerated": "2024-01-01T00:00:00.000Z",
    "executiveSummary": {
      "overallPerformance": "excellent",
      "performanceScore": 85.5,
      "keyMetrics": {
        "totalTasks": 100,
        "successRate": "95.0%",
        "averageResponseTime": "250ms"
      }
    },
    "performanceMetrics": {...},
    "anomalies": [...],
    "recommendations": [...]
  }
}
```

### System Analytics

#### `GET /api/performance/trends`
Get system-wide performance trends.

**Parameters:**
- `timeRange` (query): Time range (default: 7d)

**Response:**
```json
{
  "success": true,
  "data": {
    "timeRange": {...},
    "trends": {
      "1h": [...],
      "1d": [...],
      "1w": [...]
    },
    "summary": {
      "trend": "improving",
      "changePercent": "5.2"
    }
  }
}
```

#### `GET /api/performance/dashboard`
Get dashboard data summary.

**Response:**
```json
{
  "success": true,
  "data": {
    "systemStats": {...},
    "recentAlerts": [...],
    "trends": {...},
    "topAgents": [...],
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  }
}
```

## Usage Examples

### Recording Performance Metrics

```javascript
// Manual metric recording
const response = await fetch('/api/performance/agents/agent-123/metrics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    responseTime: 250,
    confidence: 0.85,
    status: 'success',
    taskType: 'analysis'
  })
});
```

### Getting Performance History

```javascript
// Get last 24 hours of performance data
const response = await fetch('/api/performance/agents/agent-123/history?startTime=' + 
  (Date.now() - 24 * 60 * 60 * 1000) + '&endTime=' + Date.now());

const data = await response.json();
console.log(data.data.metrics);
```

### Generating Performance Report

```javascript
// Generate weekly performance report
const response = await fetch('/api/performance/agents/agent-123/report?timeRange=7d');
const report = await response.json();

console.log('Performance Score:', report.data.executiveSummary.performanceScore);
console.log('Recommendations:', report.data.recommendations);
```

## Configuration Options

### Redis Configuration

```javascript
// config/redis-performance.config.js
module.exports = {
  redis: {
    host: 'localhost',
    port: 6379,
    password: null,
    db: 0,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000
  }
};
```

### Performance Thresholds

```javascript
performance: {
  alertThresholds: {
    responseTime: 1000,    // ms
    errorRate: 0.05,       // 5%
    memoryUsage: 0.8,      // 80%
    confidence: 0.3        // 30%
  }
}
```

### Anomaly Detection

```javascript
anomalyDetection: {
  enabled: true,
  zScoreThreshold: 2.0,
  minDataPoints: 10,
  methods: {
    statistical: true,
    mlBased: false,
    threshold: true
  }
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- RedisPerformanceAnalyzer.test.js
```

### Test Structure

```
tests/
├── setup.js                 # Test setup and teardown
├── services/
│   └── RedisPerformanceAnalyzer.test.js
├── middleware/
│   └── PerformanceTrackingMiddleware.test.js
└── api/
    └── performance.test.js
```

## Monitoring & Observability

### Logging

The system uses Winston for structured logging:

```javascript
// Log levels: error, warn, info, debug
logger.info('Performance metrics recorded', { agentId, responseTime });
logger.warn('Performance alert triggered', { alert });
logger.error('System error', { error: error.message });
```

### Metrics Collection

Built-in metrics include:
- Response times
- Error rates
- Agent confidence scores
- Task completion rates
- Collaboration patterns
- System resource usage

### Health Checks

```bash
# Check system health
curl http://localhost:3000/health

# Check performance system health
curl http://localhost:3000/api/performance/health
```

## Deployment

### Docker Deployment

```dockerfile
# Build Docker image
docker build -t redis-performance .

# Run container
docker run -p 3000:3000 \
  -e REDIS_HOST=redis \
  -e NODE_ENV=production \
  redis-performance
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_HOST=redis
      - NODE_ENV=production
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

## Performance Optimization

### Redis Optimization

- Use Redis Cluster for high availability
- Enable data compression for large datasets
- Configure appropriate memory limits
- Use Redis persistence for data durability

### Application Optimization

- Enable response compression
- Use connection pooling
- Implement caching strategies
- Monitor memory usage

## Security Considerations

### Authentication & Authorization

```javascript
// Enable authentication
PERFORMANCE_AUTH_REQUIRED=true
PERFORMANCE_AUTH_SECRET=your-secret-key

// API key authentication
PERFORMANCE_API_KEY_REQUIRED=true
PERFORMANCE_API_KEYS=key1,key2,key3
```

### Rate Limiting

```javascript
// Configure rate limiting
API_RATE_WINDOW=900000  // 15 minutes
API_RATE_MAX=100        // 100 requests per window
```

### CORS Configuration

```javascript
// Configure CORS
API_CORS_ORIGIN=https://yourdomain.com
API_CORS_CREDENTIALS=true
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   ```bash
   # Check Redis status
   redis-cli ping
   
   # Check configuration
   # Verify REDIS_HOST and REDIS_PORT in .env
   ```

2. **High Memory Usage**
   ```bash
   # Check Redis memory usage
   redis-cli info memory
   
   # Reduce retention period
   PERFORMANCE_RETENTION_DAYS=7
   ```

3. **Slow Performance**
   ```bash
   # Check slow queries
   LOG_SLOW_QUERIES=true
   SLOW_QUERY_THRESHOLD=500
   ```

### Debug Mode

```bash
# Enable debug logging
DEBUG_QUERIES=true
PERFORMANCE_LOG_LEVEL=debug
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the test cases for usage examples

---

**Phase 4 Redis Transparency Enhancement** - Empowering multi-agent systems with comprehensive performance analytics and monitoring capabilities.