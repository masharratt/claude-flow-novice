# Claude Flow Personal Web Portal Integration Tests

Comprehensive integration test suite for the Claude Flow Personal web portal system with MCP coordination, real-time communication, transparency features, and 3-agent swarm coordination.

## 🏗️ Test Architecture

### Test Structure
```
tests/web-portal/
├── mcp-integration.test.ts          # MCP system integration tests
├── real-time-communication.test.ts  # WebSocket messaging tests
├── transparency-system.test.ts      # Decision logging & reasoning chains
├── swarm-coordination.test.ts       # 3-agent swarm coordination
├── fixtures/                        # Test data and mock responses
├── mocks/                           # Mock implementations
├── setup/                           # Test configuration and utilities
├── jest.config.js                   # Jest test configuration
├── run-tests.sh                     # Comprehensive test runner
└── README.md                        # This documentation
```

## 🧪 Test Suites

### 1. MCP Integration Tests (`mcp-integration.test.ts`)

Tests the integration between Claude Flow Personal and MCP (Model Context Protocol) services:

- **Claude Flow MCP Commands**: Swarm initialization, agent spawning, task orchestration
- **ruv-swarm MCP Coordination**: Neural pattern training, DAA agents, knowledge sharing
- **WebSocket Message Routing**: Real-time message delivery and client management
- **Error Handling & Recovery**: Circuit breakers, retry logic, fallback mechanisms
- **Performance Monitoring**: Command execution metrics, health checks, memory management

**Key Features Tested:**
- ✅ Swarm initialization with hierarchical topology
- ✅ Agent spawning (researcher, coder, reviewer)
- ✅ Task orchestration with dependency tracking
- ✅ Neural pattern training and adaptation
- ✅ Knowledge sharing between agents
- ✅ WebSocket message routing and broadcasting
- ✅ Error recovery and circuit breaker patterns
- ✅ Performance metrics and bottleneck detection

### 2. Real-time Communication Tests (`real-time-communication.test.ts`)

Tests WebSocket-based real-time messaging and human intervention systems:

- **Agent Message Broadcasting**: Progress updates, status changes, coordination messages
- **Human Intervention Delivery**: Decision requests, approval workflows, timeout handling
- **WebSocket Connection Management**: Client lifecycle, authentication, health monitoring
- **Message Filtering & Routing**: Priority-based routing, content filtering, rate limiting

**Key Features Tested:**
- ✅ Agent progress broadcasting to multiple clients
- ✅ Human intervention requests with timeout handling
- ✅ WebSocket connection management and cleanup
- ✅ Message filtering by priority and content
- ✅ Rate limiting and client authentication
- ✅ Connection recovery and error handling

### 3. Transparency System Tests (`transparency-system.test.ts`)

Tests decision logging, reasoning chain capture, and transparency features:

- **Decision Logging**: Context capture, reasoning documentation, impact tracking
- **Reasoning Chain Capture**: Step-by-step analysis, confidence scoring, pattern recognition
- **Human Intervention Tracking**: Request/response cycles, learning metrics, audit trails
- **Agent Status Monitoring**: Real-time status updates, performance tracking, health metrics

**Key Features Tested:**
- ✅ Comprehensive decision logging with context
- ✅ Reasoning chain visualization and analysis
- ✅ Human intervention impact tracking
- ✅ Agent collaboration monitoring
- ✅ Performance dashboard generation
- ✅ Transparency data export for analysis

### 4. Swarm Coordination Tests (`swarm-coordination.test.ts`)

Tests the 3-agent swarm model with researcher-coder-reviewer coordination:

- **Sequential Workflows**: Research → Implementation → Review coordination
- **Task Handoffs**: Data transfer, validation, quality assurance
- **Dependency Management**: Complex workflows with conditional routing
- **Swarm Relaunch**: Failure detection, context preservation, recovery strategies
- **Performance Metrics**: Throughput, quality, coordination efficiency

**Key Features Tested:**
- ✅ Complete research-to-implementation-to-review workflows
- ✅ Task handoff validation and quality checks
- ✅ Dependency chain management with circular detection
- ✅ Swarm relaunch with context preservation (up to 10 times)
- ✅ Performance optimization and bottleneck analysis
- ✅ Custom metrics and KPI tracking

## 🔧 Test Fixtures & Mocks

### Fixtures (`fixtures/`)
- **`mcp-responses.ts`**: Mock MCP command responses for Claude Flow and ruv-swarm
- **`websocket-messages.ts`**: Sample WebSocket messages for all communication types
- **`transparency-data.ts`**: Mock decisions, reasoning chains, and intervention data
- **`swarm-data.ts`**: Task workflows, handoff data, and performance metrics

### Mocks (`mocks/`)
- **`websocket-mock.ts`**: Full WebSocket client/server mock with network simulation
- **`database-mock.ts`**: In-memory database for transparency data with full CRUD operations
- **`agent-mock.ts`**: Configurable agent mocks with performance characteristics

## 🛡️ Error Scenario Validation

Comprehensive error testing covers:

### Network Errors
- Connection timeouts and retries
- Network disconnections and recovery
- Intermittent connectivity issues
- High latency simulation

### Service Errors
- MCP service unavailability
- Rate limiting and backoff
- Authentication failures
- Service degradation patterns

### Agent Errors
- Agent unresponsiveness
- Task execution timeouts
- Performance degradation
- Memory exhaustion

### Coordination Errors
- Task handoff failures
- Coordination deadlocks
- Message routing failures
- Swarm relaunch scenarios

## 🚀 Running Tests

### Quick Start
```bash
# Run all tests
./tests/web-portal/run-tests.sh

# Run specific test suite
npx jest --config=tests/web-portal/jest.config.js --testNamePattern="MCP.*Integration"

# Run with coverage
npx jest --config=tests/web-portal/jest.config.js --coverage
```

### Test Runner Features
The `run-tests.sh` script provides:
- ✅ Individual test suite execution
- ✅ Error scenario validation
- ✅ Performance metrics collection
- ✅ Coverage report generation
- ✅ Resource usage analysis
- ✅ Detailed logging and reporting

### Test Configuration
```javascript
// jest.config.js highlights
{
  testEnvironment: 'node',
  testTimeout: 30000,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/web-portal/setup/test-setup.ts']
}
```

## 📊 Quality Metrics

### Coverage Targets
- **Lines**: >80%
- **Functions**: >80%
- **Branches**: >80%
- **Statements**: >80%

### Performance Benchmarks
- **Test Suite Duration**: <60s total
- **Individual Test**: <5s average
- **Memory Usage**: <512MB peak
- **Error Recovery**: <5s average

### Test Characteristics
- **Fast**: Tests complete quickly with mock implementations
- **Isolated**: No dependencies between tests or external services
- **Repeatable**: Consistent results across runs
- **Comprehensive**: Covers success paths and error scenarios
- **Maintainable**: Clear structure and extensive documentation

## 🔍 Debugging & Troubleshooting

### Common Issues
1. **Test Timeouts**: Increase timeout in jest.config.js or specific tests
2. **Memory Leaks**: Check for unclosed resources in afterEach blocks
3. **WebSocket Errors**: Ensure proper connection cleanup in tests
4. **Mock Failures**: Verify mock implementations match expected interfaces

### Logging
- Test logs: `logs/tests/*.log`
- Coverage reports: `coverage/web-portal/`
- Error summaries: Available via `testUtils.getErrorSummary()`

### Performance Analysis
```javascript
// Get test performance metrics
const metrics = testUtils.getPerformanceMetrics();
console.log('Test execution time:', metrics.duration);
console.log('Memory usage:', metrics.memoryUsage);
```

## 🎯 Test Scenarios Covered

### Success Scenarios (Happy Path)
- ✅ Complete authentication workflow (research → code → review)
- ✅ Real-time agent progress broadcasting
- ✅ Human intervention with timely responses
- ✅ Swarm coordination with optimal performance
- ✅ MCP command execution with expected responses

### Error Scenarios (Edge Cases)
- ✅ Network failures during critical operations
- ✅ Agent failures requiring swarm relaunch
- ✅ Human intervention timeouts with fallbacks
- ✅ Service degradation with graceful handling
- ✅ Resource exhaustion with recovery mechanisms

### Performance Scenarios
- ✅ High-load message broadcasting (1000+ clients)
- ✅ Complex workflow execution with multiple dependencies
- ✅ Concurrent swarm operations
- ✅ Large data handoffs between agents
- ✅ Extended session management

## 🎉 Integration with Claude Flow Personal

These tests validate the core functionality required for Claude Flow Personal:

1. **MCP Coordination**: Seamless integration with Claude Flow and ruv-swarm MCP servers
2. **Real-time UI**: WebSocket-based live updates for agent status and progress
3. **Transparency**: Complete visibility into agent decisions and reasoning
4. **Human-AI Collaboration**: Intervention workflows with timeout handling
5. **Reliability**: Error recovery and swarm relaunch capabilities
6. **Performance**: Metrics collection and optimization recommendations

The test suite ensures that Claude Flow Personal can reliably coordinate AI agents, provide real-time transparency, and handle complex workflows with human oversight.

## 📚 Additional Resources

- [Claude Flow Documentation](../../README.md)
- [MCP Protocol Specification](https://github.com/anthropics/mcp)
- [Jest Testing Framework](https://jestjs.io/)
- [WebSocket API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)