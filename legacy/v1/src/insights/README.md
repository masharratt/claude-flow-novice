# Phase 6 High-ROI Insights Engine

AI-powered insights engine identifying high-ROI optimization opportunities using Redis coordination for fleet management and performance analysis.

## Overview

The Phase 6 Insights Engine provides comprehensive analysis capabilities for multi-regional fleet management, including:

- **Performance Analysis**: Identifies bottlenecks, resource waste, and optimization opportunities
- **ROI Calculation**: Advanced cost-benefit analysis with confidence scoring
- **Recommendation Engine**: Prioritized actionable insights with implementation guidance
- **Multi-Regional Fleet Overview**: Geographic performance comparison and visualization
- **Redis Coordination**: Swarm memory integration and event coordination

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  InsightsEngine │    │  ROICalculator  │    │ FleetOverview   │
│                 │    │                 │    │                 │
│ - Coordination  │◄──►│ - Cost Analysis │◄──►│ - Regional Data │
│ - Analysis      │    │ - ROI Scoring   │    │ - Performance   │
│ - Integration   │    │ - Confidence    │    │ - Comparison    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │RedisCoordinator │
                    │                 │
                    │ - Pub/Sub       │
                    │ - Memory Store  │
                    │ - Events        │
                    └─────────────────┘
```

## Components

### 1. InsightsEngine (`insights-engine.js`)
Main orchestrator that coordinates all components and runs periodic analysis cycles.

**Key Features:**
- Periodic data collection from all regions
- Integration with all analysis components
- Redis-based event publishing
- Comprehensive reporting

### 2. ROICalculator (`roi-calculator.js`)
Calculates return on investment for identified optimization opportunities.

**Key Features:**
- Cost-benefit analysis
- Confidence scoring
- Risk assessment
- Financial metrics (NPV, IRR, payback period)

### 3. RecommendationEngine (`recommendation-engine.js`)
Generates prioritized actionable recommendations based on insights.

**Key Features:**
- Priority scoring algorithm
- Implementation guidance
- Effort-impact analysis
- Categorization by type

### 4. FleetOverview (`fleet-overview.js`)
Provides multi-regional fleet visualization and comparison.

**Key Features:**
- Geographic performance mapping
- Regional health scoring
- Fleet topology visualization
- Historical trend analysis

### 5. RedisCoordinator (`redis-coordinator.js`)
Handles Redis-based coordination and swarm memory integration.

**Key Features:**
- Event publishing/subscribing
- Swarm memory storage
- Cross-agent communication
- Status broadcasting

## Usage

### Basic Setup

```javascript
import { createInsightsEngine, presets } from './index.js';

// Create engine with production preset
const engine = createInsightsEngine(presets.production);

// Initialize and start
await engine.initialize();
await engine.start();

// Get comprehensive report
const report = await engine.getComprehensiveReport();
console.log('Insights:', report);
```

### Custom Configuration

```javascript
const engine = createInsightsEngine({
  redis: {
    host: 'localhost',
    port: 6379
  },
  regions: ['us-east', 'us-west', 'eu-west', 'asia-pacific'],
  analysis: {
    interval: 30000 // 30 seconds
  },
  thresholds: {
    performance: {
      latency: 100,    // ms
      cpu: 80,        // %
      memory: 85      // %
    },
    cost: {
      wasteThreshold: 15  // %
    }
  }
});
```

### Event Handling

```javascript
// Listen for analysis completion
engine.on('analysis-completed', (insights) => {
  console.log(`Generated ${insights.summary.totalInsights} insights`);
  console.log(`Estimated value: $${insights.summary.estimatedValue}`);
});

// Listen for errors
engine.on('error', (error) => {
  console.error('Analysis error:', error);
});

// Listen to Redis coordination events
engine.on('insights-published', (insights) => {
  console.log('Insights published to Redis');
});
```

## API Reference

### InsightsEngine

#### Methods
- `initialize()`: Initialize all components and Redis connections
- `start()`: Start periodic analysis cycles
- `stop()`: Stop analysis and cleanup resources
- `triggerAnalysis()`: Run on-demand analysis cycle
- `getCurrentInsights()`: Get latest insights report
- `getComprehensiveReport()`: Get complete system report

#### Events
- `initialized`: Engine initialization complete
- `started`: Analysis cycles started
- `analysis-completed`: Analysis cycle completed with results
- `error`: Error occurred during analysis
- `insights-published`: Insights published to Redis

### ROICalculator

#### Methods
- `calculateROI(insight)`: Calculate ROI for single insight
- `calculateROI(insights)`: Calculate ROI for multiple insights

### RecommendationEngine

#### Methods
- `generate(insightsWithROI)`: Generate recommendations from insights

### FleetOverview

#### Methods
- `getFleetOverview()`: Get complete fleet overview
- `getRegionalComparison()`: Get regional performance comparison

### RedisCoordinator

#### Methods
- `publishInsights(insights)`: Publish insights to Redis channel
- `publishRecommendations(recommendations)`: Publish recommendations
- `storeSwarmMemory(key, data)`: Store data in swarm memory
- `getSwarmMemory(key)`: Retrieve data from swarm memory

## Configuration

### Redis Configuration
```javascript
redis: {
  host: 'localhost',    // Redis server host
  port: 6379,          // Redis server port
  password: undefined, // Redis password (if required)
  db: 0                // Redis database number
}
```

### Analysis Configuration
```javascript
analysis: {
  interval: 30000,           // Analysis interval in ms
  retentionPeriod: 86400000  // Data retention period in ms
}
```

### Thresholds Configuration
```javascript
thresholds: {
  performance: {
    latency: 100,    // Latency threshold in ms
    cpu: 80,        // CPU usage threshold in %
    memory: 85,     // Memory usage threshold in %
    errorRate: 5    // Error rate threshold in %
  },
  cost: {
    wasteThreshold: 15,       // Resource waste threshold in %
    optimizationTarget: 10    // Cost optimization target in %
  }
}
```

## Data Flow

1. **Data Collection**: Engine collects metrics from all configured regions
2. **Analysis**: Performance, cost, and scaling analysis algorithms identify issues
3. **ROI Calculation**: Each insight is analyzed for potential return on investment
4. **Recommendation Generation**: Prioritized recommendations are created
5. **Fleet Analysis**: Multi-regional fleet overview is generated
6. **Redis Publishing**: Results are published to Redis channels for swarm coordination
7. **Storage**: Results are stored in Redis and swarm memory for persistence

## Integration

### With Swarm Systems
The engine publishes to Redis channels for coordination with other swarm agents:

- `swarm:phase-6:insights`: Insights updates
- `swarm:phase-6:recommendations`: Recommendation updates  
- `swarm:phase-6:fleet`: Fleet overview updates
- `swarm:phase-6:events`: General swarm events

### Memory Storage
Swarm memory is used for:
- Latest analysis results
- Historical trends
- Configuration state
- Agent coordination data

## Demo

Run the included demo to see the engine in action:

```bash
node src/insights/demo.js
```

The demo will:
1. Initialize the insights engine
2. Start analysis cycles
3. Generate sample insights and recommendations
4. Display fleet overview and regional comparison
5. Show swarm memory integration
6. Provide comprehensive report output

## Performance Considerations

- **Analysis Interval**: Adjust based on your requirements (default: 30 seconds)
- **Data Retention**: Configure retention period to balance memory usage
- **Redis Connections**: Ensure Redis server can handle the connection load
- **Region Count**: More regions increase processing time and memory usage

## Error Handling

The engine includes comprehensive error handling:
- Redis connection failures
- Analysis cycle errors
- Component initialization failures
- Data collection errors

All errors are emitted as events and logged for debugging.

## Contributing

When extending the insights engine:
1. Follow the existing component patterns
2. Add proper error handling
3. Include Redis coordination for new features
4. Update the comprehensive report format
5. Add appropriate event emissions

## License

This component is part of the Phase 6 UI Dashboard & Fleet Visualization implementation.
