# Web Portal Playwright Test Suite

This directory contains comprehensive Playwright test scenarios for the Claude Flow web portal system, focusing on real-time communication, human intervention, and system transparency.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Playwright installed
- Test server running on port 3000

### Installation
```bash
# Install Playwright dependencies
npm run playwright:install

# Or install specific browsers
npx playwright install chromium firefox webkit
```

### Running Tests
```bash
# Run all web portal tests
npm run test:e2e:playwright

# Run with UI mode for debugging
npm run test:e2e:playwright:ui

# Run in headed mode (visible browser)
npm run test:e2e:playwright:headed

# Run specific test file
npx playwright test tests/playwright/web-portal/specs/agent-messaging.spec.ts

# Run tests with debugging
npm run test:e2e:playwright:debug
```

## 📁 Directory Structure

```
tests/playwright/web-portal/
├── config/
│   └── playwright.config.ts          # Main Playwright configuration
├── specs/
│   ├── agent-messaging.spec.ts       # Agent messaging display tests
│   ├── human-intervention.spec.ts    # Human intervention system tests
│   ├── websocket-communication.realtime.spec.ts  # WebSocket tests
│   ├── mcp-integration.spec.ts       # MCP integration panel tests
│   ├── swarm-dashboard.spec.ts       # Dashboard interaction tests
│   └── transparency-logging.spec.ts  # Audit logging tests
├── page-objects/
│   └── web-portal-page.ts            # Page object model
├── fixtures/
│   ├── test-data.ts                  # Test data factories
│   └── static/
│       └── index.html                # Mock web portal
├── mocks/
│   └── mock-services.ts              # Mock external services
└── utils/
    ├── global-setup.ts               # Test environment setup
    ├── global-teardown.ts            # Test cleanup
    ├── test-server.ts                # Mock web server
    ├── test-database.ts              # In-memory test database
    └── test-helpers.ts               # Utility functions
```

## 🧪 Test Coverage

### 1. Agent Messaging Display (`agent-messaging.spec.ts`)
- **Message Display and Formatting**: Proper message structure, styling, and layout
- **Real-time Message Updates**: WebSocket-driven message streaming
- **Message Content and Filtering**: Text handling, special characters, agent correlation
- **Message Interaction and Accessibility**: Keyboard navigation, screen reader support
- **Error Handling and Resilience**: WebSocket disconnection, malformed data recovery

### 2. Human Intervention System (`human-intervention.spec.ts`)
- **Intervention Panel Display**: UI components, question presentation, option layout
- **Decision Submission**: Option selection, validation, processing states
- **Non-blocking Agent Operations**: Continued agent activity during intervention
- **Context Preservation**: Task state maintenance, agent coordination
- **Multiple Interventions**: Sequential handling, history tracking
- **Error Handling**: Network failures, malformed data, UI recovery

### 3. WebSocket Communication (`websocket-communication.realtime.spec.ts`)
- **Connection Management**: Establishment, handshake, failure handling
- **Real-time Data Streaming**: Dashboard stats, agent status, task progress
- **Message Broadcasting and Subscriptions**: Channel management, targeted messages
- **Bidirectional Communication**: Client-server interaction, custom events
- **Error Handling and Recovery**: Connection failures, timeout handling, data validation
- **Performance and Scalability**: High-volume messages, concurrent connections, memory management

### 4. MCP Integration Panel (`mcp-integration.spec.ts`)
- **Panel Display and Layout**: Tool listing, descriptions, execute buttons
- **Tool Execution**: Parameter passing, execution states, result handling
- **Response Handling and Feedback**: Success messages, timing information, status updates
- **Error Handling**: Execution failures, network timeouts, malformed responses
- **Integration with System State**: Stats updates, dashboard coordination, audit logging
- **Accessibility and Usability**: Keyboard navigation, visual feedback, mobile support

### 5. Swarm Dashboard Interactions (`swarm-dashboard.spec.ts`)
- **System Overview Panel**: Statistics display, real-time updates, visual hierarchy
- **Swarms Panel**: Active swarm listing, status information, interaction handling
- **Agents Panel**: Status indicators, real-time updates, scrollable lists
- **Dashboard Layout and Responsiveness**: Grid layout, screen adaptation, card overflow
- **Real-time Dashboard Updates**: Data consistency, concurrent updates, user interaction preservation
- **Dashboard Performance**: Loading efficiency, update frequency handling, memory management

### 6. Transparency Logging (`transparency-logging.spec.ts`)
- **Audit Log Display**: Entry structure, chronological ordering, action types
- **Log Entry Details**: Detailed information, JSON formatting, relationship tracking
- **Real-time Log Updates**: New entry addition, ordering maintenance, high-frequency updates
- **Log Filtering and Search**: Visibility management, scrolling behavior
- **Integration with System Actions**: Intervention logging, MCP execution tracking, agent state changes
- **Data Integrity and Compliance**: Chronological accuracy, immutability, consistency, edge case handling

## 🛠 Test Infrastructure

### Page Object Model
The `WebPortalPage` class provides a clean interface for interacting with the web portal:

```typescript
const portalPage = new WebPortalPage(page);
await portalPage.goto();
await portalPage.login('test-admin', 'test-password');
await portalPage.waitForDashboard();

// Execute MCP tool
await portalPage.executeMcpTool('swarm_init');

// Handle intervention
await portalPage.handleIntervention('oauth2');

// Get system stats
const stats = await portalPage.getSystemStats();
```

### Test Data Factory
Structured test data generation for consistent testing:

```typescript
import { TestDataFactory } from '../fixtures/test-data';

// Create test scenario
const scenario = TestDataFactory.createScenario('complex');

// Create specific test data
const intervention = TestDataFactory.createIntervention({
  priority: 'high',
  question: 'Which approach should we take?'
});
```

### Mock Services
Comprehensive mocking of external dependencies:

```typescript
const mockServices = new MockServices();
await mockServices.start();

// Simulate different conditions
mockServices.simulateNetworkConditions('slow');
mockServices.simulateEvents('agent-update', 5);
```

### Test Helpers
Utility functions for common test operations:

```typescript
import { TestHelpers } from '../utils/test-helpers';

// Wait for element to be stable
await TestHelpers.waitForElementStable(page, '.loading-spinner');

// Take performance measurements
const metrics = await TestHelpers.getPerformanceMetrics(page);

// Mock API responses
await TestHelpers.mockApiResponse(page, '/api/agents', { agents: [] });
```

## 🎯 Test Configuration

### Browser Support
Tests run on multiple browsers:
- **Chromium** (desktop)
- **Firefox** (desktop)
- **Safari/WebKit** (desktop)
- **Chrome Mobile** (mobile)
- **Safari Mobile** (mobile)

### Test Projects
- `setup`: Authentication and initial state setup
- `chromium-desktop`: Primary desktop browser tests
- `firefox-desktop`: Firefox-specific tests
- `webkit-desktop`: Safari/WebKit tests
- `mobile-chrome`: Mobile Chrome tests
- `mobile-safari`: Mobile Safari tests
- `real-time-tests`: WebSocket and real-time feature tests
- `performance-tests`: Performance and load tests
- `api-integration`: API integration tests

### Test Execution Modes
- **Parallel**: Multiple tests run simultaneously
- **Sequential**: Tests run one after another (CI mode)
- **Headed/Headless**: Visible/invisible browser execution
- **Debug**: Step-through debugging mode
- **UI**: Interactive test runner interface

## 📊 Test Reports and Artifacts

### Generated Reports
- **HTML Report**: Interactive test results with screenshots and videos
- **JSON Report**: Machine-readable test results
- **JUnit XML**: CI/CD integration format
- **Line Report**: Console output

### Test Artifacts
- **Screenshots**: On failure or explicit capture
- **Videos**: Full test execution recording (on failure)
- **Traces**: Detailed execution traces for debugging
- **Network Logs**: API request/response logging

## 🔧 Configuration Options

### Environment Variables
```bash
BASE_URL=http://localhost:3000          # Test server URL
TEST_SESSION_ID=playwright-session     # Unique session identifier
MOCK_SERVICES_PORT=4000                # Mock services port
CI=true                                # CI environment flag
```

### Playwright Configuration
Key configuration options:
- **Timeout**: 60 seconds for tests, 10 seconds for assertions
- **Retries**: 2 retries on CI, 1 locally
- **Workers**: 1 on CI, unlimited locally
- **Global Setup/Teardown**: Environment preparation and cleanup

## 🚨 Common Issues and Troubleshooting

### WebSocket Connection Issues
```typescript
// Verify connection in test
const isConnected = await portalPage.verifyWebSocketConnection();
if (!isConnected) {
  await portalPage.simulateWebSocketReconnection();
}
```

### Element Stability Issues
```typescript
// Wait for animations to complete
await TestHelpers.waitForElementStable(page, '.animated-element');

// Disable animations for testing
await page.evaluate(() => {
  const style = window.testUtils.disableAnimations();
});
```

### Performance Issues
```typescript
// Monitor memory usage
const memoryBefore = await page.evaluate(() => window.testUtils.getMemoryUsage());
// ... test operations
const memoryAfter = await page.evaluate(() => window.testUtils.getMemoryUsage());
```

### Network-Related Failures
```typescript
// Mock slow network
await TestHelpers.simulateSlowNetwork(page, 1000);

// Retry with backoff
await TestHelpers.retryWithBackoff(async () => {
  await page.locator('#api-button').click();
  await expect(page.locator('#result')).toBeVisible();
});
```

## 📈 Performance Considerations

### Test Optimization
- **Parallel Execution**: Independent tests run simultaneously
- **Selective Browser Testing**: Critical paths on all browsers, others on primary browser
- **Data Setup Optimization**: Reuse authentication state across tests
- **Network Mocking**: Reduce external dependencies

### Resource Management
- **Memory Monitoring**: Track JavaScript heap usage during tests
- **Connection Pooling**: Reuse WebSocket connections where possible
- **Cleanup**: Proper teardown of test resources and mock services

## 🔐 Security Testing

Tests include security validation:
- **Authentication Flow**: Login/logout, session management
- **Input Validation**: XSS prevention, injection attack resistance
- **Authorization**: Role-based access control
- **Data Sanitization**: Special character handling, output encoding

## 📝 Contributing

### Adding New Tests
1. Create test file in appropriate `specs/` subdirectory
2. Follow existing naming conventions (`feature.spec.ts`)
3. Use page object model for UI interactions
4. Include error scenarios and edge cases
5. Add performance and accessibility checks

### Test Structure Template
```typescript
test.describe('Feature Name', () => {
  let portalPage: WebPortalPage;

  test.beforeEach(async ({ page }) => {
    portalPage = new WebPortalPage(page);
    await portalPage.goto();
    await portalPage.login();
    await portalPage.waitForDashboard();
  });

  test.describe('Sub-feature', () => {
    test('should behave correctly', async ({ page }) => {
      // Test implementation
    });
  });
});
```

### Best Practices
- **Descriptive Test Names**: Clearly describe expected behavior
- **Independent Tests**: Each test should be able to run in isolation
- **Error Handling**: Test both success and failure scenarios
- **Performance Monitoring**: Include timing assertions for critical operations
- **Accessibility**: Verify keyboard navigation and screen reader support

---

For more information about the Claude Flow web portal system, see the main project documentation.