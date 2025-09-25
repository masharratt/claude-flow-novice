# End-to-End Tests

This directory contains E2E tests for the Claude Flow Novice web portal using Playwright with MCP server integration.

## Test Structure

### Core Test Files
- `web-portal.spec.ts` - Main web portal functionality tests
- `playwright-mcp.spec.ts` - MCP server integration tests

### Test Categories

#### 1. **Web Portal Functionality**
- Homepage loading and navigation
- Swarm dashboard operations
- Agent creation workflows
- Real-time metrics display
- Responsive design validation
- Error handling

#### 2. **MCP Integration**
- MCP server connectivity
- Command execution via web interface
- Real-time agent coordination
- Performance monitoring

#### 3. **Performance Testing**
- Page load times
- Network request monitoring
- Concurrent operations
- Resource usage analysis

## Running Tests

### Basic Commands
```bash
# Run all E2E tests
npm run test:e2e:playwright

# Run with UI (interactive mode)
npm run test:e2e:playwright:ui

# Run in debug mode
npm run test:e2e:playwright:debug

# Run with browser head visible
npm run test:e2e:playwright:headed
```

### Browser-Specific Testing
```bash
# Test on specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Mobile testing
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"
```

### Test Development
```bash
# Generate test code interactively
npm run playwright:codegen

# Install browsers
npm run playwright:install

# Show test reports
npx playwright show-report
```

## Configuration

### Main Config
- `config/playwright.config.ts` - Primary Playwright configuration
- Multi-browser setup (Chromium, Firefox, WebKit)
- Mobile device testing
- Screenshot and video capture
- Retry logic and timeouts

### Environment Settings
- Base URL: `http://localhost:3000`
- Headless mode: Configurable via env vars
- Timeout: 30 seconds default
- Retries: 2 on CI, 0 locally

## MCP Integration

### Playwright MCP Server
The tests integrate with `@modelcontextprotocol/server-playwright` to enable:
- Automated browser control via MCP commands
- Integration with Claude Flow's agent coordination
- Real-time test execution monitoring
- Dynamic test scenario generation

### MCP Commands Used
- `playwright_navigate` - Navigate to URLs
- `playwright_click` - Click elements
- `playwright_type` - Type into inputs
- `playwright_screenshot` - Capture screenshots
- `playwright_wait_for_element` - Wait for elements
- `playwright_evaluate` - Execute JavaScript

## Test Data Management

### Fixtures
Test fixtures are used for consistent test data across runs:
- User authentication states
- Mock API responses
- Test database seeds

### State Management
- Clean state between tests
- Shared authentication when needed
- Isolated test environments

## CI/CD Integration

### GitHub Actions
The `.github/workflows/e2e-tests.yml` workflow provides:
- Multi-browser parallel testing
- Mobile device testing
- Performance benchmarking
- Test result artifacts
- Failure screenshots/videos

### Reporting
- HTML reports with interactive timeline
- JUnit XML for CI systems
- Performance metrics collection
- Video recordings on failures

## Best Practices

### Element Selection
```typescript
// ✅ Good: Use data-testid
await page.locator('[data-testid="submit-button"]').click();

// ✅ Good: Use semantic selectors
await page.locator('button:has-text("Submit")').click();

// ❌ Avoid: Brittle CSS selectors
await page.locator('div.form > button:nth-child(3)').click();
```

### Waiting Strategies
```typescript
// ✅ Good: Wait for specific conditions
await page.waitForLoadState('networkidle');
await expect(page.locator('.loading')).not.toBeVisible();

// ❌ Avoid: Hard timeouts
await page.waitForTimeout(5000);
```

### Test Organization
```typescript
test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup for each test
  });

  test('should do something specific', async ({ page }) => {
    // Clear, focused test case
  });
});
```

## Troubleshooting

### Common Issues

#### Browser Installation
```bash
# Install browsers if missing
npx playwright install

# Check installed browsers
npx playwright --version
```

#### Test Failures
1. Check screenshots in `test-results/`
2. Review video recordings for complex scenarios
3. Use debug mode: `npm run test:e2e:playwright:debug`
4. Verify server is running on port 3000

#### MCP Server Issues
1. Ensure MCP servers are configured in `.mcp.json`
2. Check web portal MCP integration is enabled
3. Verify network connectivity to MCP servers
4. Review MCP server logs for errors

### Debug Commands
```bash
# Run specific test with debug
npx playwright test web-portal.spec.ts --debug

# Show test trace viewer
npx playwright show-trace trace.zip

# List all available tests
npx playwright test --list
```

## Performance Targets

### Load Time Benchmarks
- Initial page load: < 3 seconds
- First contentful paint: < 2.5 seconds
- Time to interactive: < 4 seconds
- Largest contentful paint: < 4 seconds

### Test Execution
- Full test suite: < 10 minutes
- Single browser: < 5 minutes
- Browser startup: < 30 seconds

## Contributing

### Adding New Tests
1. Create test file in appropriate category
2. Follow naming convention: `feature-name.spec.ts`
3. Include proper test descriptions and categorization
4. Add page object models for complex interactions
5. Update this README if adding new test categories

### Test Maintenance
- Keep selectors updated with UI changes
- Maintain test data fixtures
- Review and update timeout values
- Ensure cross-browser compatibility

---

For more information, see the [Playwright documentation](https://playwright.dev/docs/intro) and [MCP integration guide](https://github.com/modelcontextprotocol/servers).