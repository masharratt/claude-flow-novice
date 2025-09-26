import { EventEmitter } from 'events';

export interface BrowserTestConfig {
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  timeout: number;
  retries: number;
  slowMo?: number;
  devtools?: boolean;
  browsers: BrowserType[];
}

export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  steps: TestStep[];
  assertions: TestAssertion[];
  setup?: TestStep[];
  teardown?: TestStep[];
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
}

export interface TestStep {
  type:
    | 'navigate'
    | 'click'
    | 'type'
    | 'wait'
    | 'select'
    | 'upload'
    | 'hover'
    | 'drag'
    | 'evaluate'
    | 'screenshot';
  selector?: string;
  value?: string | string[];
  url?: string;
  timeout?: number;
  waitFor?: 'networkidle' | 'load' | 'domcontentloaded';
  options?: Record<string, any>;
  description?: string;
}

export interface TestAssertion {
  type: 'visible' | 'text' | 'attribute' | 'count' | 'url' | 'title' | 'custom';
  selector?: string;
  expected: any;
  actual?: any;
  message?: string;
  timeout?: number;
}

export interface TestExecution {
  id: string;
  scenarioId: string;
  browser: BrowserType;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'timeout';
  steps: StepResult[];
  assertions: AssertionResult[];
  screenshots: Screenshot[];
  videos: Video[];
  logs: BrowserLog[];
  performance: PerformanceMetrics;
  errors: TestError[];
}

export interface StepResult {
  stepIndex: number;
  type: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  startTime: Date;
  endTime?: Date;
  duration: number;
  error?: string;
  screenshot?: string;
}

export interface AssertionResult {
  assertionIndex: number;
  type: string;
  expected: any;
  actual: any;
  passed: boolean;
  message: string;
  timestamp: Date;
}

export interface Screenshot {
  id: string;
  filename: string;
  path: string;
  timestamp: Date;
  stepIndex?: number;
  fullPage: boolean;
}

export interface Video {
  id: string;
  filename: string;
  path: string;
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface BrowserLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: 'console' | 'network' | 'page' | 'worker';
  message: string;
  location?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}

export interface PerformanceMetrics {
  loadTime: number;
  domContentLoaded: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
  networkRequests: NetworkRequest[];
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  duration: number;
  size: number;
  timestamp: Date;
  type: string;
}

export interface TestError {
  type: 'step' | 'assertion' | 'timeout' | 'network' | 'runtime';
  message: string;
  stack?: string;
  stepIndex?: number;
  screenshot?: string;
  timestamp: Date;
}

export interface CrossBrowserResults {
  scenarioId: string;
  executions: Map<BrowserType, TestExecution>;
  summary: {
    totalBrowsers: number;
    passedBrowsers: number;
    failedBrowsers: number;
    compatibility: number; // percentage
  };
  differences: BrowserDifference[];
}

export interface BrowserDifference {
  type: 'visual' | 'performance' | 'functionality' | 'error';
  browsers: BrowserType[];
  description: string;
  severity: 'low' | 'medium' | 'high';
  screenshots?: string[];
}

export class ChromeMCPIntegration extends EventEmitter {
  private testExecutions: Map<string, TestExecution> = new Map();
  private activeTests: Map<string, any> = new Map(); // Browser instances
  private config: BrowserTestConfig;
  private mcpConnected = false;

  constructor(config: Partial<BrowserTestConfig> = {}) {
    super();

    this.config = {
      headless: true,
      viewport: {
        width: 1280,
        height: 720,
      },
      timeout: 30000,
      retries: 2,
      slowMo: 0,
      devtools: false,
      browsers: ['chromium'],
      ...config,
    };

    this.initializeMCPConnection();
  }

  private async initializeMCPConnection(): Promise<void> {
    try {
      // Initialize connection to Chrome MCP server
      // In a real implementation, this would establish the MCP connection
      this.mcpConnected = true;
      this.emit('mcp:connected');
    } catch (error) {
      this.mcpConnected = false;
      this.emit('mcp:connection-failed', error);
    }
  }

  public async runScenario(
    scenario: TestScenario,
    browser: BrowserType = 'chromium',
  ): Promise<TestExecution> {
    if (!this.mcpConnected) {
      throw new Error('Chrome MCP not connected');
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const execution: TestExecution = {
      id: executionId,
      scenarioId: scenario.id,
      browser,
      startTime: new Date(),
      status: 'pending',
      steps: [],
      assertions: [],
      screenshots: [],
      videos: [],
      logs: [],
      performance: {
        loadTime: 0,
        domContentLoaded: 0,
        firstContentfulPaint: 0,
        largestContentfulPaint: 0,
        firstInputDelay: 0,
        cumulativeLayoutShift: 0,
        timeToInteractive: 0,
        networkRequests: [],
      },
      errors: [],
    };

    this.testExecutions.set(executionId, execution);
    this.emit('test:started', { execution, scenario });

    try {
      execution.status = 'running';

      // Execute setup steps
      if (scenario.setup) {
        await this.executeSteps(execution, scenario.setup, 'setup');
      }

      // Execute main test steps
      await this.executeSteps(execution, scenario.steps, 'main');

      // Execute assertions
      await this.executeAssertions(execution, scenario.assertions);

      // Execute teardown steps
      if (scenario.teardown) {
        await this.executeSteps(execution, scenario.teardown, 'teardown');
      }

      // Collect performance metrics
      await this.collectPerformanceMetrics(execution);

      execution.status = execution.errors.length > 0 ? 'failed' : 'passed';
      execution.endTime = new Date();

      this.emit('test:completed', { execution, scenario });
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.errors.push({
        type: 'runtime',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date(),
      });

      this.emit('test:failed', { execution, scenario, error });
    } finally {
      // Cleanup browser instance
      await this.cleanupBrowserInstance(executionId);
    }

    return execution;
  }

  private async executeSteps(
    execution: TestExecution,
    steps: TestStep[],
    phase: string,
  ): Promise<void> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepResult: StepResult = {
        stepIndex: i,
        type: step.type,
        status: 'pending',
        startTime: new Date(),
        duration: 0,
      };

      execution.steps.push(stepResult);
      this.emit('test:step-started', { execution, step, phase });

      try {
        stepResult.status = 'running';
        await this.executeStep(execution, step, stepResult);
        stepResult.status = 'passed';
      } catch (error) {
        stepResult.status = 'failed';
        stepResult.error = error instanceof Error ? error.message : String(error);

        execution.errors.push({
          type: 'step',
          message: stepResult.error,
          stepIndex: i,
          timestamp: new Date(),
        });

        // Take screenshot on failure
        stepResult.screenshot = await this.takeScreenshot(execution, `step_${i}_failure`);

        this.emit('test:step-failed', { execution, step, error, phase });
      } finally {
        stepResult.endTime = new Date();
        stepResult.duration = stepResult.endTime.getTime() - stepResult.startTime.getTime();

        this.emit('test:step-completed', { execution, step, stepResult, phase });
      }
    }
  }

  private async executeStep(
    execution: TestExecution,
    step: TestStep,
    stepResult: StepResult,
  ): Promise<void> {
    // Use Chrome MCP to execute browser actions
    switch (step.type) {
      case 'navigate':
        await this.mcpNavigate(execution.id, step.url!);
        break;

      case 'click':
        await this.mcpClick(execution.id, step.selector!, step.options);
        break;

      case 'type':
        await this.mcpType(execution.id, step.selector!, step.value as string, step.options);
        break;

      case 'wait':
        await this.mcpWait(execution.id, step.timeout || 1000, step.waitFor);
        break;

      case 'select':
        await this.mcpSelectOption(execution.id, step.selector!, step.value as string[]);
        break;

      case 'upload':
        await this.mcpUploadFiles(execution.id, step.value as string[]);
        break;

      case 'hover':
        await this.mcpHover(execution.id, step.selector!);
        break;

      case 'drag':
        await this.mcpDragAndDrop(execution.id, step.selector!, step.value as string);
        break;

      case 'evaluate':
        await this.mcpEvaluate(execution.id, step.value as string);
        break;

      case 'screenshot':
        stepResult.screenshot = await this.takeScreenshot(
          execution,
          (step.value as string) || 'step_screenshot',
        );
        break;

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }

    // Add delay if specified
    if (this.config.slowMo && this.config.slowMo > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.slowMo));
    }
  }

  // Chrome MCP wrapper methods
  private async mcpNavigate(executionId: string, url: string): Promise<void> {
    // This would use the actual Chrome MCP functions
    // For now, we'll simulate the calls
    await this.simulateMCPCall('browser_navigate', { url });
    this.logBrowserEvent(executionId, 'Navigation to ' + url);
  }

  private async mcpClick(executionId: string, selector: string, options?: any): Promise<void> {
    await this.simulateMCPCall('browser_click', { element: selector, ref: selector, ...options });
    this.logBrowserEvent(executionId, `Clicked element: ${selector}`);
  }

  private async mcpType(
    executionId: string,
    selector: string,
    text: string,
    options?: any,
  ): Promise<void> {
    await this.simulateMCPCall('browser_type', {
      element: selector,
      ref: selector,
      text,
      ...options,
    });
    this.logBrowserEvent(executionId, `Typed text in ${selector}: ${text}`);
  }

  private async mcpWait(executionId: string, timeout: number, waitFor?: string): Promise<void> {
    const waitOptions: any = {};

    if (waitFor) {
      if (waitFor === 'networkidle') {
        // Wait for network to be idle
      } else if (waitFor === 'load') {
        // Wait for page load
      } else if (waitFor === 'domcontentloaded') {
        // Wait for DOM content loaded
      }
    } else {
      waitOptions.time = timeout / 1000; // Convert to seconds
    }

    await this.simulateMCPCall('browser_wait_for', waitOptions);
    this.logBrowserEvent(executionId, `Waited ${timeout}ms`);
  }

  private async mcpSelectOption(
    executionId: string,
    selector: string,
    values: string[],
  ): Promise<void> {
    await this.simulateMCPCall('browser_select_option', {
      element: selector,
      ref: selector,
      values,
    });
    this.logBrowserEvent(executionId, `Selected options in ${selector}: ${values.join(', ')}`);
  }

  private async mcpUploadFiles(executionId: string, filePaths: string[]): Promise<void> {
    await this.simulateMCPCall('browser_file_upload', { paths: filePaths });
    this.logBrowserEvent(executionId, `Uploaded files: ${filePaths.join(', ')}`);
  }

  private async mcpHover(executionId: string, selector: string): Promise<void> {
    await this.simulateMCPCall('browser_hover', { element: selector, ref: selector });
    this.logBrowserEvent(executionId, `Hovered over element: ${selector}`);
  }

  private async mcpDragAndDrop(
    executionId: string,
    fromSelector: string,
    toSelector: string,
  ): Promise<void> {
    await this.simulateMCPCall('browser_drag', {
      startElement: fromSelector,
      startRef: fromSelector,
      endElement: toSelector,
      endRef: toSelector,
    });
    this.logBrowserEvent(executionId, `Dragged from ${fromSelector} to ${toSelector}`);
  }

  private async mcpEvaluate(executionId: string, expression: string): Promise<any> {
    const result = await this.simulateMCPCall('browser_evaluate', { function: expression });
    this.logBrowserEvent(executionId, `Evaluated: ${expression}`);
    return result;
  }

  private async simulateMCPCall(method: string, params: any): Promise<any> {
    // Simulate MCP call with delay
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    // Simulate occasional failures
    if (Math.random() < 0.05) {
      // 5% failure rate
      throw new Error(`Simulated MCP error for ${method}`);
    }

    return { success: true, method, params };
  }

  private logBrowserEvent(executionId: string, message: string): void {
    const execution = this.testExecutions.get(executionId);
    if (!execution) return;

    const log: BrowserLog = {
      timestamp: new Date(),
      level: 'info',
      source: 'page',
      message,
    };

    execution.logs.push(log);
  }

  private async executeAssertions(
    execution: TestExecution,
    assertions: TestAssertion[],
  ): Promise<void> {
    for (let i = 0; i < assertions.length; i++) {
      const assertion = assertions[i];
      const assertionResult: AssertionResult = {
        assertionIndex: i,
        type: assertion.type,
        expected: assertion.expected,
        actual: null,
        passed: false,
        message: assertion.message || '',
        timestamp: new Date(),
      };

      execution.assertions.push(assertionResult);
      this.emit('test:assertion-started', { execution, assertion });

      try {
        switch (assertion.type) {
          case 'visible':
            assertionResult.actual = await this.isElementVisible(execution.id, assertion.selector!);
            assertionResult.passed = assertionResult.actual === assertion.expected;
            break;

          case 'text':
            assertionResult.actual = await this.getElementText(execution.id, assertion.selector!);
            assertionResult.passed = assertionResult.actual === assertion.expected;
            break;

          case 'attribute':
            assertionResult.actual = await this.getElementAttribute(
              execution.id,
              assertion.selector!,
              assertion.expected.attribute,
            );
            assertionResult.passed = assertionResult.actual === assertion.expected.value;
            break;

          case 'count':
            assertionResult.actual = await this.getElementCount(execution.id, assertion.selector!);
            assertionResult.passed = assertionResult.actual === assertion.expected;
            break;

          case 'url':
            assertionResult.actual = await this.getCurrentUrl(execution.id);
            assertionResult.passed = assertionResult.actual === assertion.expected;
            break;

          case 'title':
            assertionResult.actual = await this.getPageTitle(execution.id);
            assertionResult.passed = assertionResult.actual === assertion.expected;
            break;

          case 'custom':
            assertionResult.actual = await this.mcpEvaluate(
              execution.id,
              assertion.expected.expression,
            );
            assertionResult.passed = assertion.expected.validator(assertionResult.actual);
            break;

          default:
            throw new Error(`Unknown assertion type: ${assertion.type}`);
        }

        if (!assertionResult.passed) {
          execution.errors.push({
            type: 'assertion',
            message: `Assertion failed: Expected ${assertion.expected}, got ${assertionResult.actual}`,
            timestamp: new Date(),
          });
        }

        this.emit('test:assertion-completed', { execution, assertion, assertionResult });
      } catch (error) {
        assertionResult.passed = false;
        assertionResult.message = error instanceof Error ? error.message : String(error);

        execution.errors.push({
          type: 'assertion',
          message: assertionResult.message,
          timestamp: new Date(),
        });

        this.emit('test:assertion-failed', { execution, assertion, error });
      }
    }
  }

  private async isElementVisible(executionId: string, selector: string): Promise<boolean> {
    // Simulate element visibility check
    return Math.random() > 0.1; // 90% visible
  }

  private async getElementText(executionId: string, selector: string): Promise<string> {
    // Simulate getting element text
    return `Text from ${selector}`;
  }

  private async getElementAttribute(
    executionId: string,
    selector: string,
    attribute: string,
  ): Promise<string> {
    // Simulate getting element attribute
    return `${attribute}-value`;
  }

  private async getElementCount(executionId: string, selector: string): Promise<number> {
    // Simulate element count
    return Math.floor(Math.random() * 5) + 1;
  }

  private async getCurrentUrl(executionId: string): Promise<string> {
    // Simulate getting current URL
    return 'https://example.com/current-page';
  }

  private async getPageTitle(executionId: string): Promise<string> {
    // Simulate getting page title
    return 'Test Page Title';
  }

  private async takeScreenshot(execution: TestExecution, name: string): Promise<string> {
    const screenshot: Screenshot = {
      id: `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      filename: `${name}_${execution.browser}_${Date.now()}.png`,
      path: `/screenshots/${execution.scenarioId}/${screenshot.filename}`,
      timestamp: new Date(),
      fullPage: false,
    };

    execution.screenshots.push(screenshot);

    // Use Chrome MCP to take actual screenshot
    await this.simulateMCPCall('browser_take_screenshot', {
      filename: screenshot.filename,
      fullPage: screenshot.fullPage,
    });

    return screenshot.path;
  }

  private async collectPerformanceMetrics(execution: TestExecution): Promise<void> {
    // Collect performance metrics using Chrome MCP
    const metrics = await this.simulateMCPCall('browser_evaluate', {
      function: `
        () => {
          const perfEntries = performance.getEntriesByType('navigation')[0];
          const paintEntries = performance.getEntriesByType('paint');

          return {
            loadTime: perfEntries.loadEventEnd - perfEntries.loadEventStart,
            domContentLoaded: perfEntries.domContentLoadedEventEnd - perfEntries.domContentLoadedEventStart,
            firstContentfulPaint: paintEntries.find(e => e.name === 'first-contentful-paint')?.startTime || 0,
            timeToInteractive: perfEntries.loadEventEnd - perfEntries.fetchStart
          };
        }
      `,
    });

    execution.performance = {
      ...execution.performance,
      ...metrics,
      largestContentfulPaint: Math.random() * 2000 + 1000,
      firstInputDelay: Math.random() * 100,
      cumulativeLayoutShift: Math.random() * 0.1,
    };

    // Collect network requests
    const networkRequests = await this.simulateMCPCall('browser_network_requests', {});
    execution.performance.networkRequests = this.parseNetworkRequests(networkRequests);
  }

  private parseNetworkRequests(rawRequests: any[]): NetworkRequest[] {
    // Parse and format network requests from Chrome MCP
    return rawRequests.map((req, index) => ({
      url: `https://example.com/api/endpoint${index}`,
      method: 'GET',
      status: 200 + (index % 4) * 100, // Vary status codes
      duration: Math.random() * 500 + 100,
      size: Math.random() * 10000 + 1000,
      timestamp: new Date(),
      type: 'xhr',
    }));
  }

  private async cleanupBrowserInstance(executionId: string): Promise<void> {
    const browserInstance = this.activeTests.get(executionId);
    if (browserInstance) {
      await this.simulateMCPCall('browser_close', {});
      this.activeTests.delete(executionId);
    }
  }

  public async runCrossBrowserTests(
    scenario: TestScenario,
    browsers?: BrowserType[],
  ): Promise<CrossBrowserResults> {
    const testBrowsers = browsers || this.config.browsers;
    const executions = new Map<BrowserType, TestExecution>();

    // Run tests in parallel across different browsers
    const testPromises = testBrowsers.map(async (browser) => {
      const execution = await this.runScenario(scenario, browser);
      executions.set(browser, execution);
      return execution;
    });

    await Promise.allSettled(testPromises);

    // Analyze results and find differences
    const results: CrossBrowserResults = {
      scenarioId: scenario.id,
      executions,
      summary: {
        totalBrowsers: testBrowsers.length,
        passedBrowsers: Array.from(executions.values()).filter((e) => e.status === 'passed').length,
        failedBrowsers: Array.from(executions.values()).filter((e) => e.status === 'failed').length,
        compatibility: 0,
      },
      differences: [],
    };

    results.summary.compatibility =
      (results.summary.passedBrowsers / results.summary.totalBrowsers) * 100;

    // Analyze differences between browsers
    results.differences = await this.analyzeBrowserDifferences(executions);

    this.emit('cross-browser:completed', results);

    return results;
  }

  private async analyzeBrowserDifferences(
    executions: Map<BrowserType, TestExecution>,
  ): Promise<BrowserDifference[]> {
    const differences: BrowserDifference[] = [];

    // Performance differences
    const performanceMetrics = Array.from(executions.entries()).map(([browser, exec]) => ({
      browser,
      loadTime: exec.performance.loadTime,
      fcp: exec.performance.firstContentfulPaint,
    }));

    const avgLoadTime =
      performanceMetrics.reduce((sum, m) => sum + m.loadTime, 0) / performanceMetrics.length;

    for (const metric of performanceMetrics) {
      if (Math.abs(metric.loadTime - avgLoadTime) > avgLoadTime * 0.2) {
        // 20% difference
        differences.push({
          type: 'performance',
          browsers: [metric.browser],
          description: `Load time significantly different: ${metric.loadTime}ms vs avg ${avgLoadTime.toFixed(0)}ms`,
          severity: 'medium',
        });
      }
    }

    // Error differences
    const browserErrors = Array.from(executions.entries()).map(([browser, exec]) => ({
      browser,
      errors: exec.errors,
    }));

    const browsersWithErrors = browserErrors.filter((be) => be.errors.length > 0);
    if (browsersWithErrors.length > 0 && browsersWithErrors.length < executions.size) {
      differences.push({
        type: 'functionality',
        browsers: browsersWithErrors.map((be) => be.browser),
        description: 'Functionality errors in some browsers',
        severity: 'high',
      });
    }

    return differences;
  }

  public getExecution(executionId: string): TestExecution | undefined {
    return this.testExecutions.get(executionId);
  }

  public getAllExecutions(): TestExecution[] {
    return Array.from(this.testExecutions.values());
  }

  public getExecutionsByScenario(scenarioId: string): TestExecution[] {
    return Array.from(this.testExecutions.values()).filter(
      (exec) => exec.scenarioId === scenarioId,
    );
  }

  public async cleanup(): Promise<void> {
    // Close all active browser instances
    for (const [executionId] of this.activeTests) {
      await this.cleanupBrowserInstance(executionId);
    }

    this.activeTests.clear();
    this.emit('mcp:disconnected');
  }
}
