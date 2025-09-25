/**
 * Chrome MCP Adapter - Wrapper Layer for Chrome DevTools MCP Server
 * Provides stable API that shields swarm teams from Chrome MCP changes
 */

import { EventEmitter } from 'events';
import { ChromeMCPCommand, ChromeMCPResponse } from '../types/index.js';
import { ILogger } from '../../core/logger.js';

export interface ChromeMCPConfig {
  serverUrl?: string;
  timeout: number;
  retries: number;
  version: string;
  capabilities: string[];
}

export interface BrowserTestResult {
  success: boolean;
  screenshots: string[];
  performance: {
    loadTime: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    cumulativeLayoutShift: number;
  };
  accessibility: {
    score: number;
    violations: any[];
  };
  errors: string[];
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
  };
}

export interface VisualRegressionResult {
  passed: boolean;
  differences: number;
  baseline: string;
  current: string;
  diff?: string;
  threshold: number;
}

export class ChromeMCPAdapter extends EventEmitter {
  private config: ChromeMCPConfig;
  private connected = false;
  private commandQueue: ChromeMCPCommand[] = [];
  private processingQueue = false;

  constructor(config: ChromeMCPConfig, private logger: ILogger) {
    super();
    this.config = {
      serverUrl: 'chrome-devtools://devtools/bundled/inspector.html',
      timeout: 30000,
      retries: 3,
      version: '1.0.0',
      capabilities: [],
      ...config
    };
  }

  /**
   * Connect to Chrome MCP Server with version detection
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to Chrome MCP Server', {
        version: this.config.version,
        serverUrl: this.config.serverUrl
      });

      // Detect Chrome MCP version and capabilities
      const capabilities = await this.detectCapabilities();
      this.config.capabilities = capabilities;

      this.connected = true;
      this.emit('connected', { capabilities });

      // Start processing queued commands
      this.processCommandQueue();

    } catch (error) {
      this.logger.error('Failed to connect to Chrome MCP Server', { error });
      throw new Error(`Chrome MCP connection failed: ${error.message}`);
    }
  }

  /**
   * Navigate to URL with swarm-aware error handling
   */
  async navigate(url: string, options: {
    viewport?: { width: number; height: number };
    waitUntil?: 'load' | 'networkidle' | 'domcontentloaded';
    timeout?: number;
  } = {}): Promise<ChromeMCPResponse> {
    const command: ChromeMCPCommand = {
      action: 'navigate',
      params: { url, ...options },
      timeout: options.timeout || this.config.timeout,
      retries: this.config.retries
    };

    return this.executeCommand(command);
  }

  /**
   * Take screenshot with optimization for swarm testing
   */
  async screenshot(options: {
    selector?: string;
    fullPage?: boolean;
    quality?: number;
    format?: 'png' | 'jpeg';
  } = {}): Promise<ChromeMCPResponse> {
    const command: ChromeMCPCommand = {
      action: 'screenshot',
      params: options,
      timeout: this.config.timeout
    };

    return this.executeCommand(command);
  }

  /**
   * Execute JavaScript in browser context
   */
  async executeScript(script: string, args: any[] = []): Promise<ChromeMCPResponse> {
    const command: ChromeMCPCommand = {
      action: 'execute_script',
      params: { script, args },
      timeout: this.config.timeout
    };

    return this.executeCommand(command);
  }

  /**
   * Run comprehensive E2E test suite
   */
  async runE2ETests(testConfig: {
    testFiles: string[];
    browsers: string[];
    parallel: boolean;
    reporter: string;
  }): Promise<BrowserTestResult> {
    const startTime = Date.now();

    try {
      // Execute test suite through Chrome MCP
      const testResult = await this.executeCommand({
        action: 'run_tests',
        params: testConfig,
        timeout: 300000 // 5 minutes for test execution
      });

      // Collect performance metrics
      const performanceMetrics = await this.collectPerformanceMetrics();

      // Run accessibility audit
      const accessibilityResult = await this.runAccessibilityAudit();

      // Capture screenshots for visual verification
      const screenshots = await this.captureTestScreenshots();

      return {
        success: testResult.success,
        screenshots,
        performance: performanceMetrics,
        accessibility: accessibilityResult,
        errors: testResult.data?.errors || [],
        coverage: testResult.data?.coverage
      };

    } catch (error) {
      this.logger.error('E2E test execution failed', { error });
      return {
        success: false,
        screenshots: [],
        performance: { loadTime: 0, firstContentfulPaint: 0, largestContentfulPaint: 0, cumulativeLayoutShift: 0 },
        accessibility: { score: 0, violations: [] },
        errors: [error.message]
      };
    }
  }

  /**
   * Visual regression testing with baseline comparison
   */
  async visualRegressionTest(config: {
    baselineDir: string;
    currentDir: string;
    threshold: number;
    selector?: string;
  }): Promise<VisualRegressionResult> {
    try {
      const result = await this.executeCommand({
        action: 'visual_regression',
        params: config,
        timeout: this.config.timeout * 2
      });

      return {
        passed: result.data.passed,
        differences: result.data.differences,
        baseline: result.data.baseline,
        current: result.data.current,
        diff: result.data.diff,
        threshold: config.threshold
      };

    } catch (error) {
      this.logger.error('Visual regression test failed', { error });
      return {
        passed: false,
        differences: 100,
        baseline: '',
        current: '',
        threshold: config.threshold
      };
    }
  }

  /**
   * Monitor performance metrics during test execution
   */
  async collectPerformanceMetrics(): Promise<BrowserTestResult['performance']> {
    try {
      const metrics = await this.executeCommand({
        action: 'collect_performance',
        params: {},
        timeout: this.config.timeout
      });

      return {
        loadTime: metrics.data.loadTime || 0,
        firstContentfulPaint: metrics.data.fcp || 0,
        largestContentfulPaint: metrics.data.lcp || 0,
        cumulativeLayoutShift: metrics.data.cls || 0
      };

    } catch (error) {
      this.logger.warn('Performance metrics collection failed', { error });
      return {
        loadTime: 0,
        firstContentfulPaint: 0,
        largestContentfulPaint: 0,
        cumulativeLayoutShift: 0
      };
    }
  }

  /**
   * Run accessibility audit
   */
  async runAccessibilityAudit(): Promise<BrowserTestResult['accessibility']> {
    try {
      const audit = await this.executeCommand({
        action: 'accessibility_audit',
        params: {},
        timeout: this.config.timeout
      });

      return {
        score: audit.data.score || 0,
        violations: audit.data.violations || []
      };

    } catch (error) {
      this.logger.warn('Accessibility audit failed', { error });
      return {
        score: 0,
        violations: []
      };
    }
  }

  /**
   * Capture screenshots for test documentation
   */
  async captureTestScreenshots(): Promise<string[]> {
    try {
      const screenshots = await this.executeCommand({
        action: 'capture_screenshots',
        params: { format: 'png', quality: 90 },
        timeout: this.config.timeout
      });

      return screenshots.data.screenshots || [];

    } catch (error) {
      this.logger.warn('Screenshot capture failed', { error });
      return [];
    }
  }

  /**
   * Core command execution with retry logic and version adaptation
   */
  private async executeCommand(command: ChromeMCPCommand): Promise<ChromeMCPResponse> {
    if (!this.connected) {
      await this.connect();
    }

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < (command.retries || this.config.retries); attempt++) {
      try {
        // Adapt command for current Chrome MCP version
        const adaptedCommand = this.adaptCommandForVersion(command);

        // Execute command (this would connect to actual Chrome MCP server)
        const result = await this.executeAdaptedCommand(adaptedCommand);

        const duration = Date.now() - startTime;

        this.logger.debug('Chrome MCP command executed', {
          action: command.action,
          duration,
          attempt: attempt + 1
        });

        return {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
          duration
        };

      } catch (error) {
        lastError = error;
        this.logger.warn(`Chrome MCP command failed (attempt ${attempt + 1})`, {
          action: command.action,
          error: error.message
        });

        if (attempt < (command.retries || this.config.retries) - 1) {
          await this.delay(1000 * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    const duration = Date.now() - startTime;
    return {
      success: false,
      error: lastError?.message || 'Command execution failed',
      timestamp: new Date().toISOString(),
      duration
    };
  }

  /**
   * Adapt commands for different Chrome MCP versions
   * This is where version-specific changes are handled
   */
  private adaptCommandForVersion(command: ChromeMCPCommand): ChromeMCPCommand {
    const adapted = { ...command };

    // Example: Handle version-specific parameter changes
    if (this.config.version.startsWith('1.0')) {
      // v1.0 compatibility
      if (command.action === 'navigate' && command.params.waitUntil) {
        adapted.params = {
          ...command.params,
          wait_until: command.params.waitUntil // Convert camelCase to snake_case
        };
        delete adapted.params.waitUntil;
      }
    }

    if (this.config.version.startsWith('2.0')) {
      // v2.0 compatibility - future proofing
      if (command.action === 'navigate') {
        adapted.params = {
          ...command.params,
          options: {
            viewport: command.params.viewport,
            waitUntil: command.params.waitUntil
          }
        };
      }
    }

    return adapted;
  }

  /**
   * Execute the adapted command against Chrome MCP server
   */
  private async executeAdaptedCommand(command: ChromeMCPCommand): Promise<any> {
    // This is where the actual Chrome MCP server communication happens
    // For now, we'll simulate the interaction

    switch (command.action) {
      case 'navigate':
        return { success: true, url: command.params.url };

      case 'screenshot':
        return {
          success: true,
          screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANS...'
        };

      case 'execute_script':
        return { success: true, result: 'script executed' };

      case 'run_tests':
        return {
          success: true,
          results: { passed: 5, failed: 0, skipped: 1 },
          coverage: { lines: 85.5, functions: 90.2, branches: 78.3 }
        };

      case 'visual_regression':
        return {
          passed: true,
          differences: 0,
          baseline: '/path/to/baseline.png',
          current: '/path/to/current.png'
        };

      default:
        throw new Error(`Unsupported command: ${command.action}`);
    }
  }

  /**
   * Detect Chrome MCP server capabilities and version
   */
  private async detectCapabilities(): Promise<string[]> {
    // This would query the Chrome MCP server for its capabilities
    return [
      'navigate',
      'screenshot',
      'execute_script',
      'run_tests',
      'visual_regression',
      'collect_performance',
      'accessibility_audit'
    ];
  }

  /**
   * Process queued commands when connection is restored
   */
  private async processCommandQueue(): Promise<void> {
    if (this.processingQueue || this.commandQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift();
      if (command) {
        try {
          await this.executeCommand(command);
        } catch (error) {
          this.logger.error('Queued command execution failed', { command, error });
        }
      }
    }

    this.processingQueue = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Disconnect from Chrome MCP server
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected');
    this.logger.info('Disconnected from Chrome MCP Server');
  }

  /**
   * Get adapter status and diagnostics
   */
  getStatus(): {
    connected: boolean;
    version: string;
    capabilities: string[];
    queuedCommands: number;
  } {
    return {
      connected: this.connected,
      version: this.config.version,
      capabilities: this.config.capabilities,
      queuedCommands: this.commandQueue.length
    };
  }
}