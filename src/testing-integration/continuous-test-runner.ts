import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export interface TestSuite {
  id: string;
  name: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  files: string[];
  dependencies: string[];
  parallelizable: boolean;
  timeout: number;
  coverage: boolean;
  browsers?: string[]; // For e2e tests
  environment: 'node' | 'browser' | 'hybrid';
}

export interface TestResult {
  suiteId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  errors: TestError[];
  performance?: {
    memoryUsage: number;
    executionTime: number;
    cpuUsage: number;
  };
}

export interface TestError {
  file: string;
  line: number;
  message: string;
  stack: string;
  type: 'assertion' | 'timeout' | 'runtime' | 'setup';
}

export interface ContinuousTestingConfig {
  watchMode: boolean;
  parallelWorkers: number;
  testTimeout: number;
  retryCount: number;
  coverageThreshold: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  browsers: string[];
  environments: string[];
  notifications: {
    onFailure: boolean;
    onSuccess: boolean;
    onCoverageChange: boolean;
  };
}

export class ContinuousTestRunner extends EventEmitter {
  private testSuites: Map<string, TestSuite> = new Map();
  private runningTests: Map<string, ChildProcess> = new Map();
  private testHistory: TestResult[] = [];
  private watchedFiles: Set<string> = new Set();
  private fileWatchers: Map<string, any> = new Map();
  private config: ContinuousTestingConfig;

  constructor(config: Partial<ContinuousTestingConfig> = {}) {
    super();
    this.config = {
      watchMode: true,
      parallelWorkers: 4,
      testTimeout: 30000,
      retryCount: 2,
      coverageThreshold: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      },
      browsers: ['chromium', 'firefox', 'webkit'],
      environments: ['node', 'jsdom'],
      notifications: {
        onFailure: true,
        onSuccess: false,
        onCoverageChange: true
      },
      ...config
    };

    this.initializeDefaultTestSuites();
  }

  private initializeDefaultTestSuites(): void {
    // Unit Tests
    this.addTestSuite({
      id: 'unit-tests',
      name: 'Unit Tests',
      type: 'unit',
      files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      dependencies: [],
      parallelizable: true,
      timeout: 5000,
      coverage: true,
      environment: 'node'
    });

    // Integration Tests
    this.addTestSuite({
      id: 'integration-tests',
      name: 'Integration Tests',
      type: 'integration',
      files: ['tests/integration/**/*.test.ts'],
      dependencies: ['unit-tests'],
      parallelizable: true,
      timeout: 15000,
      coverage: true,
      environment: 'node'
    });

    // E2E Tests
    this.addTestSuite({
      id: 'e2e-tests',
      name: 'End-to-End Tests',
      type: 'e2e',
      files: ['tests/e2e/**/*.test.ts'],
      dependencies: ['integration-tests'],
      parallelizable: false,
      timeout: 60000,
      coverage: false,
      browsers: this.config.browsers,
      environment: 'browser'
    });

    // Performance Tests
    this.addTestSuite({
      id: 'performance-tests',
      name: 'Performance Tests',
      type: 'performance',
      files: ['tests/performance/**/*.test.ts'],
      dependencies: ['integration-tests'],
      parallelizable: false,
      timeout: 120000,
      coverage: false,
      environment: 'hybrid'
    });
  }

  public addTestSuite(suite: TestSuite): void {
    this.testSuites.set(suite.id, suite);
    this.emit('suite:added', suite);

    if (this.config.watchMode) {
      this.watchTestFiles(suite);
    }
  }

  private async watchTestFiles(suite: TestSuite): Promise<void> {
    for (const filePattern of suite.files) {
      try {
        const files = await this.expandFilePattern(filePattern);
        for (const file of files) {
          if (!this.watchedFiles.has(file)) {
            this.watchedFiles.add(file);
            const watcher = await fs.watchFile(file, { interval: 1000 }, () => {
              this.handleFileChange(file, suite.id);
            });
            this.fileWatchers.set(file, watcher);
          }
        }
      } catch (error) {
        console.warn(`Failed to watch files for pattern ${filePattern}:`, error);
      }
    }
  }

  private async expandFilePattern(pattern: string): Promise<string[]> {
    // This is a simplified implementation
    // In a real implementation, you'd use glob or similar
    return [pattern];
  }

  private handleFileChange(file: string, suiteId: string): void {
    this.emit('file:changed', { file, suiteId });

    // Debounce file changes
    setTimeout(() => {
      this.runTestSuite(suiteId, { triggeredBy: 'file-change', file });
    }, 500);
  }

  public async runTestSuite(
    suiteId: string,
    options: { triggeredBy?: string; file?: string; parallel?: boolean } = {}
  ): Promise<TestResult> {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Test suite ${suiteId} not found`);
    }

    // Check if tests are already running
    if (this.runningTests.has(suiteId)) {
      throw new Error(`Test suite ${suiteId} is already running`);
    }

    this.emit('suite:started', { suite, options });

    const startTime = new Date();
    let testProcess: ChildProcess;

    try {
      // Run dependencies first
      for (const depId of suite.dependencies) {
        const depResult = await this.runTestSuite(depId, { triggeredBy: 'dependency' });
        if (depResult.failed > 0) {
          throw new Error(`Dependency ${depId} failed`);
        }
      }

      // Create test command based on suite type
      const command = this.buildTestCommand(suite, options);
      testProcess = spawn(command.cmd, command.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...command.env }
      });

      this.runningTests.set(suiteId, testProcess);

      const result = await this.executeTestProcess(testProcess, suite);
      result.startTime = startTime;
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();

      this.testHistory.push(result);
      this.emit('suite:completed', { suite, result, options });

      // Check coverage thresholds
      if (result.coverage) {
        this.checkCoverageThresholds(suite, result);
      }

      return result;

    } catch (error) {
      const result: TestResult = {
        suiteId,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        passed: 0,
        failed: 1,
        skipped: 0,
        errors: [{
          file: '',
          line: 0,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack || '' : '',
          type: 'runtime'
        }]
      };

      this.emit('suite:failed', { suite, result, error, options });
      return result;

    } finally {
      this.runningTests.delete(suiteId);
    }
  }

  private buildTestCommand(
    suite: TestSuite,
    options: any
  ): { cmd: string; args: string[]; env: Record<string, string> } {
    const env: Record<string, string> = {};

    switch (suite.type) {
      case 'unit':
        return {
          cmd: 'npm',
          args: [
            'run',
            'test:unit',
            '--',
            '--maxWorkers',
            this.config.parallelWorkers.toString(),
            ...(suite.coverage ? ['--coverage'] : []),
            '--testTimeout',
            suite.timeout.toString()
          ],
          env
        };

      case 'integration':
        return {
          cmd: 'npm',
          args: [
            'run',
            'test:integration',
            '--',
            '--testTimeout',
            suite.timeout.toString()
          ],
          env
        };

      case 'e2e':
        return {
          cmd: 'npx',
          args: [
            'playwright',
            'test',
            '--timeout',
            suite.timeout.toString(),
            ...(suite.browsers ? suite.browsers.flatMap(b => ['--browser', b]) : [])
          ],
          env
        };

      case 'performance':
        return {
          cmd: 'npm',
          args: ['run', 'test:performance'],
          env: { ...env, NODE_ENV: 'production' }
        };

      default:
        throw new Error(`Unsupported test suite type: ${suite.type}`);
    }
  }

  private async executeTestProcess(
    process: ChildProcess,
    suite: TestSuite
  ): Promise<TestResult> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
        this.emit('suite:output', { suiteId: suite.id, type: 'stdout', data: data.toString() });
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
        this.emit('suite:output', { suiteId: suite.id, type: 'stderr', data: data.toString() });
      });

      process.on('close', (code) => {
        const result = this.parseTestOutput(suite, stdout, stderr, code || 0);
        resolve(result);
      });

      process.on('error', (error) => {
        reject(error);
      });

      // Set timeout
      setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Test suite ${suite.id} timed out after ${suite.timeout}ms`));
      }, suite.timeout);
    });
  }

  private parseTestOutput(
    suite: TestSuite,
    stdout: string,
    stderr: string,
    exitCode: number
  ): TestResult {
    const result: TestResult = {
      suiteId: suite.id,
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // Parse Jest output
    if (suite.type === 'unit' || suite.type === 'integration') {
      const jestResults = this.parseJestOutput(stdout);
      Object.assign(result, jestResults);
    }

    // Parse Playwright output
    if (suite.type === 'e2e') {
      const playwrightResults = this.parsePlaywrightOutput(stdout);
      Object.assign(result, playwrightResults);
    }

    // Parse coverage information
    if (suite.coverage && stdout.includes('Coverage')) {
      result.coverage = this.parseCoverageOutput(stdout);
    }

    // Parse errors from stderr
    if (stderr) {
      result.errors.push(...this.parseErrorOutput(stderr));
    }

    return result;
  }

  private parseJestOutput(output: string): Partial<TestResult> {
    const result: Partial<TestResult> = {};

    // Extract test counts
    const testSummary = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (testSummary) {
      result.failed = parseInt(testSummary[1]);
      result.passed = parseInt(testSummary[2]);
      result.skipped = 0; // Jest output parsing would be more complex in reality
    }

    return result;
  }

  private parsePlaywrightOutput(output: string): Partial<TestResult> {
    const result: Partial<TestResult> = {};

    // Extract test counts from Playwright output
    const testSummary = output.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
    if (testSummary) {
      result.passed = parseInt(testSummary[1]);
      result.failed = parseInt(testSummary[2]);
      result.skipped = 0;
    }

    return result;
  }

  private parseCoverageOutput(output: string): TestResult['coverage'] {
    // Simplified coverage parsing
    const coverage = {
      lines: 0,
      functions: 0,
      branches: 0,
      statements: 0
    };

    const coverageMatch = output.match(/All files[|\s]+(\d+\.?\d*)[|\s]+(\d+\.?\d*)[|\s]+(\d+\.?\d*)[|\s]+(\d+\.?\d*)/);
    if (coverageMatch) {
      coverage.statements = parseFloat(coverageMatch[1]);
      coverage.branches = parseFloat(coverageMatch[2]);
      coverage.functions = parseFloat(coverageMatch[3]);
      coverage.lines = parseFloat(coverageMatch[4]);
    }

    return coverage;
  }

  private parseErrorOutput(stderr: string): TestError[] {
    const errors: TestError[] = [];

    // Simple error parsing - in reality this would be more sophisticated
    const errorLines = stderr.split('\n').filter(line =>
      line.includes('Error') || line.includes('Failed') || line.includes('Exception')
    );

    for (const line of errorLines) {
      errors.push({
        file: '',
        line: 0,
        message: line.trim(),
        stack: line,
        type: 'runtime'
      });
    }

    return errors;
  }

  private checkCoverageThresholds(suite: TestSuite, result: TestResult): void {
    if (!result.coverage) return;

    const thresholds = this.config.coverageThreshold;
    const coverage = result.coverage;

    const failedThresholds: string[] = [];

    if (coverage.lines < thresholds.lines) failedThresholds.push('lines');
    if (coverage.functions < thresholds.functions) failedThresholds.push('functions');
    if (coverage.branches < thresholds.branches) failedThresholds.push('branches');
    if (coverage.statements < thresholds.statements) failedThresholds.push('statements');

    if (failedThresholds.length > 0) {
      this.emit('coverage:threshold-failed', {
        suite,
        result,
        failedThresholds,
        thresholds,
        coverage
      });
    } else {
      this.emit('coverage:threshold-passed', { suite, result, coverage });
    }
  }

  public async runAllSuites(parallel: boolean = true): Promise<TestResult[]> {
    const suiteIds = Array.from(this.testSuites.keys());

    if (parallel) {
      const promises = suiteIds.map(id =>
        this.runTestSuite(id, { triggeredBy: 'batch-run', parallel: true })
      );
      return Promise.all(promises);
    } else {
      const results: TestResult[] = [];
      for (const suiteId of suiteIds) {
        const result = await this.runTestSuite(suiteId, { triggeredBy: 'batch-run' });
        results.push(result);
      }
      return results;
    }
  }

  public getTestHistory(): TestResult[] {
    return [...this.testHistory];
  }

  public getLastResult(suiteId: string): TestResult | undefined {
    return this.testHistory
      .filter(result => result.suiteId === suiteId)
      .sort((a, b) => b.endTime.getTime() - a.endTime.getTime())[0];
  }

  public isRunning(suiteId?: string): boolean {
    if (suiteId) {
      return this.runningTests.has(suiteId);
    }
    return this.runningTests.size > 0;
  }

  public stopAllTests(): void {
    for (const [suiteId, process] of this.runningTests) {
      process.kill('SIGTERM');
      this.emit('suite:stopped', { suiteId });
    }
    this.runningTests.clear();
  }

  public stopWatching(): void {
    for (const [file, watcher] of this.fileWatchers) {
      fs.unwatchFile(file);
    }
    this.fileWatchers.clear();
    this.watchedFiles.clear();
  }

  public getConfiguration(): ContinuousTestingConfig {
    return { ...this.config };
  }

  public updateConfiguration(updates: Partial<ContinuousTestingConfig>): void {
    this.config = { ...this.config, ...updates };
    this.emit('config:updated', this.config);
  }
}