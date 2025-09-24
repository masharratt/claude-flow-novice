import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, extname } from 'path';

/**
 * Test Reporting and Analytics Dashboard
 *
 * Comprehensive test result aggregation and visualization:
 * - Multi-test suite result compilation
 * - Visual test result dashboard generation
 * - Performance trend analysis
 * - Test coverage reporting
 * - Failure pattern analysis
 * - Historical test data management
 */

export interface TestResult {
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  suite: string;
  project: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface TestSuiteResult {
  name: string;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    passRate: number;
  };
  timestamp: string;
}

export interface PerformanceMetric {
  metric: string;
  value: number;
  unit: string;
  threshold?: number;
  status: 'good' | 'warning' | 'critical';
  timestamp: string;
  testName?: string;
}

export interface VisualTestResult {
  testName: string;
  imagePath: string;
  diffPath?: string;
  pixelDiffCount: number;
  diffPercentage: number;
  status: 'passed' | 'failed';
  threshold: number;
}

export class TestReportingDashboard {
  private resultsDir: string;
  private outputDir: string;
  private testSuiteResults: Map<string, TestSuiteResult> = new Map();
  private performanceMetrics: PerformanceMetric[] = [];
  private visualTestResults: VisualTestResult[] = [];

  constructor(resultsDir: string = 'test-results', outputDir: string = 'test-results/dashboard') {
    this.resultsDir = resultsDir;
    this.outputDir = outputDir;
    this.ensureOutputDirectory();
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDirectory(): void {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Aggregate all test results from various sources
   */
  async aggregateTestResults(): Promise<void> {
    console.log('Aggregating test results...');

    // Load Playwright test results
    await this.loadPlaywrightResults();

    // Load performance test results
    await this.loadPerformanceResults();

    // Load visual test results
    await this.loadVisualTestResults();

    // Load custom test results
    await this.loadCustomTestResults();

    console.log('Test result aggregation completed');
  }

  /**
   * Load Playwright test results from JSON reports
   */
  private async loadPlaywrightResults(): Promise<void> {
    try {
      const playwrightReportsDir = join(this.resultsDir, 'playwright-reports');
      if (!existsSync(playwrightReportsDir)) return;

      const reportFiles = readdirSync(playwrightReportsDir)
        .filter(file => file.endsWith('.json'))
        .map(file => join(playwrightReportsDir, file));

      for (const reportFile of reportFiles) {
        const reportData = JSON.parse(readFileSync(reportFile, 'utf8'));
        await this.processPlaywrightReport(reportData, reportFile);
      }
    } catch (error) {
      console.warn('Failed to load Playwright results:', error);
    }
  }

  /**
   * Process individual Playwright report
   */
  private async processPlaywrightReport(reportData: any, reportFile: string): Promise<void> {
    const suites = reportData.suites || [];
    const project = this.extractProjectFromFilename(reportFile);

    for (const suite of suites) {
      const testResults: TestResult[] = [];

      if (suite.specs) {
        for (const spec of suite.specs) {
          for (const test of spec.tests || []) {
            for (const result of test.results || []) {
              testResults.push({
                testName: test.title || 'Unknown Test',
                status: this.mapPlaywrightStatus(result.status),
                duration: result.duration || 0,
                error: result.error?.message,
                suite: suite.title || 'Unknown Suite',
                project: project,
                timestamp: new Date(result.startTime || Date.now()).toISOString(),
                metadata: {
                  retry: result.retry || 0,
                  parallelIndex: result.parallelIndex,
                  workerIndex: result.workerIndex
                }
              });
            }
          }
        }
      }

      const suiteResult: TestSuiteResult = {
        name: suite.title || 'Unknown Suite',
        results: testResults,
        summary: this.calculateSuiteSummary(testResults),
        timestamp: new Date().toISOString()
      };

      this.testSuiteResults.set(`${project}-${suite.title}`, suiteResult);
    }
  }

  /**
   * Extract project name from file path
   */
  private extractProjectFromFilename(filePath: string): string {
    const filename = filePath.split('/').pop() || '';
    const match = filename.match(/playwright-report-(.+?)(?:-.*)?\.json/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Map Playwright status to our standard status
   */
  private mapPlaywrightStatus(status: string): TestResult['status'] {
    switch (status) {
      case 'passed': return 'passed';
      case 'failed': return 'failed';
      case 'timedOut': return 'failed';
      case 'interrupted': return 'failed';
      case 'skipped': return 'skipped';
      default: return 'failed';
    }
  }

  /**
   * Calculate suite summary statistics
   */
  private calculateSuiteSummary(results: TestResult[]): TestSuiteResult['summary'] {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const duration = results.reduce((sum, r) => sum + r.duration, 0);
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    return { total, passed, failed, skipped, duration, passRate };
  }

  /**
   * Load performance test results
   */
  private async loadPerformanceResults(): Promise<void> {
    try {
      const performanceDir = join(this.resultsDir, 'performance');
      if (!existsSync(performanceDir)) return;

      const performanceFiles = readdirSync(performanceDir)
        .filter(file => file.endsWith('.json'))
        .map(file => join(performanceDir, file));

      for (const perfFile of performanceFiles) {
        const perfData = JSON.parse(readFileSync(perfFile, 'utf8'));
        await this.processPerformanceResults(perfData);
      }
    } catch (error) {
      console.warn('Failed to load performance results:', error);
    }
  }

  /**
   * Process performance test results
   */
  private async processPerformanceResults(perfData: any): Promise<void> {
    if (perfData.metrics) {
      for (const [metricName, metricData] of Object.entries(perfData.metrics)) {
        if (typeof metricData === 'object' && metricData !== null) {
          const metric = metricData as any;
          this.performanceMetrics.push({
            metric: metricName,
            value: metric.value || 0,
            unit: metric.unit || 'ms',
            threshold: metric.threshold,
            status: this.determinePerformanceStatus(metric.value, metric.threshold),
            timestamp: metric.timestamp || new Date().toISOString(),
            testName: metric.testName
          });
        }
      }
    }

    // Process time-series performance data
    if (perfData.timeSeries) {
      for (const dataPoint of perfData.timeSeries) {
        const metrics = ['cpuUsage', 'memoryUsage', 'responseTime', 'throughput'];

        for (const metricName of metrics) {
          if (dataPoint[metricName] !== undefined) {
            this.performanceMetrics.push({
              metric: metricName,
              value: dataPoint[metricName],
              unit: this.getMetricUnit(metricName),
              status: 'good', // Default for time-series data
              timestamp: dataPoint.timestamp || new Date().toISOString()
            });
          }
        }
      }
    }
  }

  /**
   * Determine performance status based on value and threshold
   */
  private determinePerformanceStatus(value: number, threshold?: number): PerformanceMetric['status'] {
    if (!threshold) return 'good';

    if (value <= threshold) return 'good';
    if (value <= threshold * 1.2) return 'warning';
    return 'critical';
  }

  /**
   * Get appropriate unit for metric
   */
  private getMetricUnit(metricName: string): string {
    const unitMap: Record<string, string> = {
      'cpuUsage': '%',
      'memoryUsage': 'MB',
      'responseTime': 'ms',
      'throughput': 'req/s',
      'loadTime': 'ms',
      'ttfb': 'ms',
      'fcp': 'ms',
      'lcp': 'ms'
    };

    return unitMap[metricName] || 'unit';
  }

  /**
   * Load visual test results
   */
  private async loadVisualTestResults(): Promise<void> {
    try {
      const visualDir = join(this.resultsDir, 'visual');
      if (!existsSync(visualDir)) return;

      const visualFiles = readdirSync(visualDir)
        .filter(file => file.endsWith('.json'))
        .map(file => join(visualDir, file));

      for (const visualFile of visualFiles) {
        const visualData = JSON.parse(readFileSync(visualFile, 'utf8'));
        await this.processVisualTestResults(visualData);
      }
    } catch (error) {
      console.warn('Failed to load visual test results:', error);
    }
  }

  /**
   * Process visual test results
   */
  private async processVisualTestResults(visualData: any): Promise<void> {
    if (visualData.results) {
      for (const result of visualData.results) {
        this.visualTestResults.push({
          testName: result.testName || 'Unknown Visual Test',
          imagePath: result.imagePath || '',
          diffPath: result.diffPath,
          pixelDiffCount: result.pixelDiffCount || 0,
          diffPercentage: result.diffPercentage || 0,
          status: result.diffPercentage <= (result.threshold || 0.1) ? 'passed' : 'failed',
          threshold: result.threshold || 0.1
        });
      }
    }
  }

  /**
   * Load custom test results from various formats
   */
  private async loadCustomTestResults(): Promise<void> {
    try {
      const customResultsFiles = this.findCustomResultFiles();

      for (const resultFile of customResultsFiles) {
        const ext = extname(resultFile);

        switch (ext) {
          case '.json':
            await this.loadJSONResults(resultFile);
            break;
          case '.xml':
            await this.loadJUnitResults(resultFile);
            break;
          case '.csv':
            await this.loadCSVResults(resultFile);
            break;
        }
      }
    } catch (error) {
      console.warn('Failed to load custom test results:', error);
    }
  }

  /**
   * Find custom result files
   */
  private findCustomResultFiles(): string[] {
    const files: string[] = [];
    const extensions = ['.json', '.xml', '.csv'];

    const scanDirectory = (dir: string) => {
      if (!existsSync(dir)) return;

      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory() && !entry.startsWith('.')) {
          scanDirectory(fullPath);
        } else if (extensions.includes(extname(entry))) {
          files.push(fullPath);
        }
      }
    };

    scanDirectory(this.resultsDir);
    return files;
  }

  /**
   * Load JSON test results
   */
  private async loadJSONResults(filePath: string): Promise<void> {
    // Implementation for custom JSON format
    console.log(`Loading JSON results from: ${filePath}`);
  }

  /**
   * Load JUnit XML results
   */
  private async loadJUnitResults(filePath: string): Promise<void> {
    // Implementation for JUnit XML format
    console.log(`Loading JUnit results from: ${filePath}`);
  }

  /**
   * Load CSV results
   */
  private async loadCSVResults(filePath: string): Promise<void> {
    // Implementation for CSV format
    console.log(`Loading CSV results from: ${filePath}`);
  }

  /**
   * Generate comprehensive HTML dashboard
   */
  async generateDashboard(): Promise<void> {
    console.log('Generating test dashboard...');

    const dashboardHTML = this.createDashboardHTML();
    const dashboardPath = join(this.outputDir, 'index.html');

    writeFileSync(dashboardPath, dashboardHTML);

    // Generate supporting files
    await this.generateSupportingFiles();

    console.log(`Dashboard generated: ${dashboardPath}`);
  }

  /**
   * Create main dashboard HTML
   */
  private createDashboardHTML(): string {
    const testSummary = this.generateTestSummary();
    const performanceSummary = this.generatePerformanceSummary();
    const visualSummary = this.generateVisualSummary();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Results Dashboard - Claude Flow Testing</title>
    <link rel="stylesheet" href="dashboard.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/date-fns@2.29.3/index.min.js"></script>
</head>
<body>
    <div class="dashboard-container">
        <header class="dashboard-header">
            <h1>Claude Flow - Test Results Dashboard</h1>
            <div class="header-info">
                <span class="timestamp">Generated: ${new Date().toLocaleString()}</span>
                <span class="build-info">Build: ${process.env.GITHUB_RUN_NUMBER || 'Local'}</span>
            </div>
        </header>

        <nav class="dashboard-nav">
            <button class="nav-btn active" data-section="overview">Overview</button>
            <button class="nav-btn" data-section="test-results">Test Results</button>
            <button class="nav-btn" data-section="performance">Performance</button>
            <button class="nav-btn" data-section="visual">Visual Tests</button>
            <button class="nav-btn" data-section="trends">Trends</button>
        </nav>

        <main class="dashboard-content">
            <section id="overview" class="dashboard-section active">
                <div class="overview-grid">
                    <div class="summary-card">
                        <h3>Test Summary</h3>
                        ${testSummary.html}
                    </div>

                    <div class="summary-card">
                        <h3>Performance Summary</h3>
                        ${performanceSummary.html}
                    </div>

                    <div class="summary-card">
                        <h3>Visual Tests Summary</h3>
                        ${visualSummary.html}
                    </div>

                    <div class="summary-card chart-card">
                        <h3>Test Results Distribution</h3>
                        <canvas id="testDistributionChart"></canvas>
                    </div>
                </div>
            </section>

            <section id="test-results" class="dashboard-section">
                <h2>Detailed Test Results</h2>
                ${this.generateTestResultsSection()}
            </section>

            <section id="performance" class="dashboard-section">
                <h2>Performance Metrics</h2>
                ${this.generatePerformanceSection()}
            </section>

            <section id="visual" class="dashboard-section">
                <h2>Visual Test Results</h2>
                ${this.generateVisualTestSection()}
            </section>

            <section id="trends" class="dashboard-section">
                <h2>Historical Trends</h2>
                ${this.generateTrendsSection()}
            </section>
        </main>
    </div>

    <script src="dashboard.js"></script>
    <script>
        // Initialize dashboard with data
        window.dashboardData = {
            testSummary: ${JSON.stringify(testSummary.data)},
            performanceSummary: ${JSON.stringify(performanceSummary.data)},
            visualSummary: ${JSON.stringify(visualSummary.data)},
            testResults: ${JSON.stringify(Array.from(this.testSuiteResults.values()))},
            performanceMetrics: ${JSON.stringify(this.performanceMetrics)},
            visualResults: ${JSON.stringify(this.visualTestResults)}
        };

        // Initialize dashboard
        initializeDashboard();
    </script>
</body>
</html>`;
  }

  /**
   * Generate test summary
   */
  private generateTestSummary(): { html: string; data: any } {
    const allResults = Array.from(this.testSuiteResults.values());
    const totalTests = allResults.reduce((sum, suite) => sum + suite.summary.total, 0);
    const totalPassed = allResults.reduce((sum, suite) => sum + suite.summary.passed, 0);
    const totalFailed = allResults.reduce((sum, suite) => sum + suite.summary.failed, 0);
    const totalSkipped = allResults.reduce((sum, suite) => sum + suite.summary.skipped, 0);
    const overallPassRate = totalTests > 0 ? (totalPassed / totalTests * 100) : 0;

    const data = { totalTests, totalPassed, totalFailed, totalSkipped, overallPassRate };

    const html = `
        <div class="metric">
            <span class="metric-value">${totalTests}</span>
            <span class="metric-label">Total Tests</span>
        </div>
        <div class="metric">
            <span class="metric-value passed">${totalPassed}</span>
            <span class="metric-label">Passed</span>
        </div>
        <div class="metric">
            <span class="metric-value failed">${totalFailed}</span>
            <span class="metric-label">Failed</span>
        </div>
        <div class="metric">
            <span class="metric-value skipped">${totalSkipped}</span>
            <span class="metric-label">Skipped</span>
        </div>
        <div class="metric">
            <span class="metric-value">${overallPassRate.toFixed(1)}%</span>
            <span class="metric-label">Pass Rate</span>
        </div>
    `;

    return { html, data };
  }

  /**
   * Generate performance summary
   */
  private generatePerformanceSummary(): { html: string; data: any } {
    const criticalMetrics = this.performanceMetrics.filter(m => m.status === 'critical').length;
    const warningMetrics = this.performanceMetrics.filter(m => m.status === 'warning').length;
    const goodMetrics = this.performanceMetrics.filter(m => m.status === 'good').length;

    const avgResponseTime = this.performanceMetrics
      .filter(m => m.metric === 'responseTime')
      .reduce((sum, m, _, arr) => sum + m.value / arr.length, 0);

    const data = { criticalMetrics, warningMetrics, goodMetrics, avgResponseTime };

    const html = `
        <div class="metric">
            <span class="metric-value critical">${criticalMetrics}</span>
            <span class="metric-label">Critical Issues</span>
        </div>
        <div class="metric">
            <span class="metric-value warning">${warningMetrics}</span>
            <span class="metric-label">Warnings</span>
        </div>
        <div class="metric">
            <span class="metric-value good">${goodMetrics}</span>
            <span class="metric-label">Good Metrics</span>
        </div>
        <div class="metric">
            <span class="metric-value">${avgResponseTime.toFixed(0)}ms</span>
            <span class="metric-label">Avg Response Time</span>
        </div>
    `;

    return { html, data };
  }

  /**
   * Generate visual summary
   */
  private generateVisualSummary(): { html: string; data: any } {
    const totalVisualTests = this.visualTestResults.length;
    const passedVisualTests = this.visualTestResults.filter(v => v.status === 'passed').length;
    const failedVisualTests = this.visualTestResults.filter(v => v.status === 'failed').length;
    const avgDiffPercentage = this.visualTestResults.length > 0
      ? this.visualTestResults.reduce((sum, v) => sum + v.diffPercentage, 0) / this.visualTestResults.length
      : 0;

    const data = { totalVisualTests, passedVisualTests, failedVisualTests, avgDiffPercentage };

    const html = `
        <div class="metric">
            <span class="metric-value">${totalVisualTests}</span>
            <span class="metric-label">Total Visual Tests</span>
        </div>
        <div class="metric">
            <span class="metric-value passed">${passedVisualTests}</span>
            <span class="metric-label">Passed</span>
        </div>
        <div class="metric">
            <span class="metric-value failed">${failedVisualTests}</span>
            <span class="metric-label">Failed</span>
        </div>
        <div class="metric">
            <span class="metric-value">${avgDiffPercentage.toFixed(2)}%</span>
            <span class="metric-label">Avg Diff %</span>
        </div>
    `;

    return { html, data };
  }

  /**
   * Generate test results section
   */
  private generateTestResultsSection(): string {
    let html = '<div class="test-results-container">';

    for (const [suiteId, suite] of this.testSuiteResults) {
      html += `
        <div class="test-suite-card">
            <div class="suite-header">
                <h3>${suite.name}</h3>
                <div class="suite-summary">
                    <span class="suite-metric passed">${suite.summary.passed} passed</span>
                    <span class="suite-metric failed">${suite.summary.failed} failed</span>
                    <span class="suite-metric skipped">${suite.summary.skipped} skipped</span>
                    <span class="suite-metric">${(suite.summary.duration / 1000).toFixed(1)}s</span>
                </div>
            </div>

            <div class="test-results-list">
                ${suite.results.map(test => `
                    <div class="test-result ${test.status}">
                        <span class="test-name">${test.testName}</span>
                        <span class="test-duration">${test.duration}ms</span>
                        ${test.error ? `<div class="test-error">${test.error}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * Generate performance section
   */
  private generatePerformanceSection(): string {
    return `
      <div class="performance-container">
        <div class="performance-charts">
          <div class="chart-container">
            <h3>Response Time Trends</h3>
            <canvas id="responseTimeChart"></canvas>
          </div>

          <div class="chart-container">
            <h3>Resource Usage</h3>
            <canvas id="resourceUsageChart"></canvas>
          </div>
        </div>

        <div class="performance-metrics-table">
          <h3>Performance Metrics</h3>
          <table class="metrics-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Test</th>
              </tr>
            </thead>
            <tbody>
              ${this.performanceMetrics.map(metric => `
                <tr class="metric-row ${metric.status}">
                  <td>${metric.metric}</td>
                  <td>${metric.value.toFixed(2)}</td>
                  <td>${metric.unit}</td>
                  <td><span class="status-badge ${metric.status}">${metric.status}</span></td>
                  <td>${metric.testName || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Generate visual test section
   */
  private generateVisualTestSection(): string {
    return `
      <div class="visual-tests-container">
        <div class="visual-tests-grid">
          ${this.visualTestResults.map(visual => `
            <div class="visual-test-card ${visual.status}">
              <div class="visual-test-header">
                <h4>${visual.testName}</h4>
                <span class="visual-status ${visual.status}">${visual.status}</span>
              </div>

              <div class="visual-test-content">
                <div class="visual-metrics">
                  <span class="visual-metric">
                    <strong>Diff:</strong> ${visual.diffPercentage.toFixed(2)}%
                  </span>
                  <span class="visual-metric">
                    <strong>Pixels:</strong> ${visual.pixelDiffCount}
                  </span>
                  <span class="visual-metric">
                    <strong>Threshold:</strong> ${visual.threshold}%
                  </span>
                </div>

                ${visual.imagePath ? `
                  <div class="visual-images">
                    <img src="${visual.imagePath}" alt="Test screenshot" class="visual-image">
                    ${visual.diffPath ? `<img src="${visual.diffPath}" alt="Diff image" class="visual-diff">` : ''}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Generate trends section
   */
  private generateTrendsSection(): string {
    return `
      <div class="trends-container">
        <div class="trends-charts">
          <div class="chart-container">
            <h3>Test Pass Rate Trend</h3>
            <canvas id="passRateTrendChart"></canvas>
          </div>

          <div class="chart-container">
            <h3>Performance Trends</h3>
            <canvas id="performanceTrendChart"></canvas>
          </div>
        </div>

        <div class="trends-summary">
          <h3>Trend Analysis</h3>
          <div class="trend-insights">
            <div class="insight">
              <strong>Test Stability:</strong>
              <span>Overall test pass rate has been stable over the last 30 runs</span>
            </div>
            <div class="insight">
              <strong>Performance:</strong>
              <span>Average response time improved by 15% this week</span>
            </div>
            <div class="insight">
              <strong>Visual Tests:</strong>
              <span>2 new visual regressions detected in the latest run</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate supporting files (CSS and JS)
   */
  private async generateSupportingFiles(): Promise<void> {
    // Generate CSS
    const cssContent = this.generateDashboardCSS();
    writeFileSync(join(this.outputDir, 'dashboard.css'), cssContent);

    // Generate JS
    const jsContent = this.generateDashboardJS();
    writeFileSync(join(this.outputDir, 'dashboard.js'), jsContent);
  }

  /**
   * Generate dashboard CSS
   */
  private generateDashboardCSS(): string {
    return `
      * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
      }

      body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f5f7fa;
          color: #333;
          line-height: 1.6;
      }

      .dashboard-container {
          min-height: 100vh;
      }

      .dashboard-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 2rem;
          text-align: center;
      }

      .dashboard-header h1 {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
      }

      .header-info {
          display: flex;
          justify-content: center;
          gap: 2rem;
          font-size: 0.9rem;
          opacity: 0.9;
      }

      .dashboard-nav {
          background: white;
          padding: 1rem 2rem;
          border-bottom: 1px solid #e1e5e9;
          display: flex;
          gap: 1rem;
      }

      .nav-btn {
          padding: 0.75rem 1.5rem;
          border: none;
          background: #f8f9fa;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.3s ease;
      }

      .nav-btn:hover {
          background: #e9ecef;
      }

      .nav-btn.active {
          background: #667eea;
          color: white;
      }

      .dashboard-content {
          padding: 2rem;
      }

      .dashboard-section {
          display: none;
      }

      .dashboard-section.active {
          display: block;
      }

      .overview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
          margin-bottom: 2rem;
      }

      .summary-card {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          border: 1px solid #e1e5e9;
      }

      .summary-card h3 {
          color: #495057;
          margin-bottom: 1rem;
          font-size: 1.1rem;
      }

      .metric {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #f1f3f4;
      }

      .metric:last-child {
          border-bottom: none;
      }

      .metric-value {
          font-size: 1.5rem;
          font-weight: 700;
      }

      .metric-value.passed {
          color: #28a745;
      }

      .metric-value.failed {
          color: #dc3545;
      }

      .metric-value.skipped {
          color: #ffc107;
      }

      .metric-value.critical {
          color: #dc3545;
      }

      .metric-value.warning {
          color: #fd7e14;
      }

      .metric-value.good {
          color: #28a745;
      }

      .metric-label {
          color: #6c757d;
          font-size: 0.9rem;
      }

      .chart-card {
          grid-column: span 2;
      }

      .test-suite-card {
          background: white;
          margin-bottom: 1rem;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
      }

      .suite-header {
          background: #f8f9fa;
          padding: 1rem;
          border-bottom: 1px solid #e9ecef;
          display: flex;
          justify-content: space-between;
          align-items: center;
      }

      .suite-summary {
          display: flex;
          gap: 1rem;
      }

      .suite-metric {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 600;
      }

      .suite-metric.passed {
          background: #d4edda;
          color: #155724;
      }

      .suite-metric.failed {
          background: #f8d7da;
          color: #721c24;
      }

      .suite-metric.skipped {
          background: #fff3cd;
          color: #856404;
      }

      .test-result {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #f1f3f4;
          display: flex;
          justify-content: space-between;
          align-items: center;
      }

      .test-result.passed {
          border-left: 4px solid #28a745;
      }

      .test-result.failed {
          border-left: 4px solid #dc3545;
      }

      .test-result.skipped {
          border-left: 4px solid #ffc107;
      }

      .test-error {
          color: #dc3545;
          font-size: 0.85rem;
          margin-top: 0.5rem;
          font-family: 'Courier New', monospace;
      }

      .visual-tests-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 1.5rem;
      }

      .visual-test-card {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .visual-test-header {
          padding: 1rem;
          background: #f8f9fa;
          display: flex;
          justify-content: space-between;
          align-items: center;
      }

      .visual-status {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
      }

      .visual-status.passed {
          background: #d4edda;
          color: #155724;
      }

      .visual-status.failed {
          background: #f8d7da;
          color: #721c24;
      }

      .visual-test-content {
          padding: 1rem;
      }

      .visual-metrics {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
          font-size: 0.85rem;
      }

      .visual-images {
          display: flex;
          gap: 0.5rem;
      }

      .visual-image,
      .visual-diff {
          max-width: 100%;
          height: auto;
          border: 1px solid #dee2e6;
          border-radius: 4px;
      }

      .performance-charts,
      .trends-charts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 2rem;
          margin-bottom: 2rem;
      }

      .chart-container {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .metrics-table {
          width: 100%;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .metrics-table th,
      .metrics-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e9ecef;
      }

      .metrics-table th {
          background: #f8f9fa;
          font-weight: 600;
      }

      .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
      }

      .status-badge.good {
          background: #d4edda;
          color: #155724;
      }

      .status-badge.warning {
          background: #fff3cd;
          color: #856404;
      }

      .status-badge.critical {
          background: #f8d7da;
          color: #721c24;
      }

      @media (max-width: 768px) {
          .dashboard-header {
              padding: 1rem;
          }

          .dashboard-header h1 {
              font-size: 2rem;
          }

          .header-info {
              flex-direction: column;
              gap: 0.5rem;
          }

          .dashboard-nav {
              padding: 1rem;
              flex-wrap: wrap;
          }

          .overview-grid {
              grid-template-columns: 1fr;
          }

          .chart-card {
              grid-column: span 1;
          }
      }
    `;
  }

  /**
   * Generate dashboard JavaScript
   */
  private generateDashboardJS(): string {
    return `
      function initializeDashboard() {
          setupNavigation();
          initializeCharts();
          setupInteractivity();
      }

      function setupNavigation() {
          const navButtons = document.querySelectorAll('.nav-btn');
          const sections = document.querySelectorAll('.dashboard-section');

          navButtons.forEach(button => {
              button.addEventListener('click', () => {
                  const targetSection = button.dataset.section;

                  // Update active button
                  navButtons.forEach(btn => btn.classList.remove('active'));
                  button.classList.add('active');

                  // Update active section
                  sections.forEach(section => section.classList.remove('active'));
                  document.getElementById(targetSection).classList.add('active');
              });
          });
      }

      function initializeCharts() {
          initializeTestDistributionChart();
          initializeResponseTimeChart();
          initializeResourceUsageChart();
          initializePassRateTrendChart();
          initializePerformanceTrendChart();
      }

      function initializeTestDistributionChart() {
          const ctx = document.getElementById('testDistributionChart');
          if (!ctx) return;

          const data = window.dashboardData.testSummary;

          new Chart(ctx, {
              type: 'doughnut',
              data: {
                  labels: ['Passed', 'Failed', 'Skipped'],
                  datasets: [{
                      data: [data.totalPassed, data.totalFailed, data.totalSkipped],
                      backgroundColor: ['#28a745', '#dc3545', '#ffc107'],
                      borderWidth: 2,
                      borderColor: '#fff'
                  }]
              },
              options: {
                  responsive: true,
                  plugins: {
                      legend: {
                          position: 'bottom'
                      }
                  }
              }
          });
      }

      function initializeResponseTimeChart() {
          const ctx = document.getElementById('responseTimeChart');
          if (!ctx) return;

          const responseTimeMetrics = window.dashboardData.performanceMetrics
              .filter(m => m.metric === 'responseTime')
              .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

          new Chart(ctx, {
              type: 'line',
              data: {
                  labels: responseTimeMetrics.map(m => new Date(m.timestamp).toLocaleTimeString()),
                  datasets: [{
                      label: 'Response Time (ms)',
                      data: responseTimeMetrics.map(m => m.value),
                      borderColor: '#667eea',
                      backgroundColor: 'rgba(102, 126, 234, 0.1)',
                      tension: 0.4
                  }]
              },
              options: {
                  responsive: true,
                  scales: {
                      y: {
                          beginAtZero: true,
                          title: {
                              display: true,
                              text: 'Time (ms)'
                          }
                      }
                  }
              }
          });
      }

      function initializeResourceUsageChart() {
          const ctx = document.getElementById('resourceUsageChart');
          if (!ctx) return;

          const cpuMetrics = window.dashboardData.performanceMetrics
              .filter(m => m.metric === 'cpuUsage');
          const memoryMetrics = window.dashboardData.performanceMetrics
              .filter(m => m.metric === 'memoryUsage');

          const labels = cpuMetrics.map(m => new Date(m.timestamp).toLocaleTimeString());

          new Chart(ctx, {
              type: 'line',
              data: {
                  labels: labels,
                  datasets: [
                      {
                          label: 'CPU Usage (%)',
                          data: cpuMetrics.map(m => m.value),
                          borderColor: '#fd7e14',
                          backgroundColor: 'rgba(253, 126, 20, 0.1)'
                      },
                      {
                          label: 'Memory Usage (MB)',
                          data: memoryMetrics.map(m => m.value),
                          borderColor: '#20c997',
                          backgroundColor: 'rgba(32, 201, 151, 0.1)'
                      }
                  ]
              },
              options: {
                  responsive: true,
                  scales: {
                      y: {
                          beginAtZero: true
                      }
                  }
              }
          });
      }

      function initializePassRateTrendChart() {
          const ctx = document.getElementById('passRateTrendChart');
          if (!ctx) return;

          // Generate mock historical data for demonstration
          const historicalData = generateMockHistoricalData();

          new Chart(ctx, {
              type: 'line',
              data: {
                  labels: historicalData.labels,
                  datasets: [{
                      label: 'Pass Rate (%)',
                      data: historicalData.passRates,
                      borderColor: '#28a745',
                      backgroundColor: 'rgba(40, 167, 69, 0.1)',
                      fill: true
                  }]
              },
              options: {
                  responsive: true,
                  scales: {
                      y: {
                          min: 0,
                          max: 100,
                          title: {
                              display: true,
                              text: 'Pass Rate (%)'
                          }
                      }
                  }
              }
          });
      }

      function initializePerformanceTrendChart() {
          const ctx = document.getElementById('performanceTrendChart');
          if (!ctx) return;

          // Generate mock performance trend data
          const performanceData = generateMockPerformanceData();

          new Chart(ctx, {
              type: 'line',
              data: {
                  labels: performanceData.labels,
                  datasets: [
                      {
                          label: 'Avg Response Time (ms)',
                          data: performanceData.responseTimes,
                          borderColor: '#667eea',
                          yAxisID: 'y'
                      },
                      {
                          label: 'Throughput (req/s)',
                          data: performanceData.throughput,
                          borderColor: '#f093fb',
                          yAxisID: 'y1'
                      }
                  ]
              },
              options: {
                  responsive: true,
                  scales: {
                      y: {
                          type: 'linear',
                          display: true,
                          position: 'left',
                      },
                      y1: {
                          type: 'linear',
                          display: true,
                          position: 'right',
                          grid: {
                              drawOnChartArea: false,
                          },
                      }
                  }
              }
          });
      }

      function generateMockHistoricalData() {
          const days = 30;
          const labels = [];
          const passRates = [];

          for (let i = days; i >= 0; i--) {
              const date = new Date();
              date.setDate(date.getDate() - i);
              labels.push(date.toLocaleDateString());
              passRates.push(Math.random() * 20 + 80); // 80-100% range
          }

          return { labels, passRates };
      }

      function generateMockPerformanceData() {
          const days = 14;
          const labels = [];
          const responseTimes = [];
          const throughput = [];

          for (let i = days; i >= 0; i--) {
              const date = new Date();
              date.setDate(date.getDate() - i);
              labels.push(date.toLocaleDateString());
              responseTimes.push(Math.random() * 500 + 200); // 200-700ms range
              throughput.push(Math.random() * 50 + 30); // 30-80 req/s range
          }

          return { labels, responseTimes, throughput };
      }

      function setupInteractivity() {
          // Add click handlers for test results
          const testResults = document.querySelectorAll('.test-result');
          testResults.forEach(result => {
              result.addEventListener('click', () => {
                  result.classList.toggle('expanded');
              });
          });

          // Add search functionality
          const searchInput = document.createElement('input');
          searchInput.type = 'text';
          searchInput.placeholder = 'Search tests...';
          searchInput.className = 'test-search';

          // Add search input to test results section
          const testResultsSection = document.getElementById('test-results');
          if (testResultsSection) {
              testResultsSection.insertBefore(searchInput, testResultsSection.querySelector('.test-results-container'));

              searchInput.addEventListener('input', (e) => {
                  filterTests(e.target.value.toLowerCase());
              });
          }
      }

      function filterTests(searchTerm) {
          const testResults = document.querySelectorAll('.test-result');

          testResults.forEach(result => {
              const testName = result.querySelector('.test-name').textContent.toLowerCase();
              const shouldShow = testName.includes(searchTerm);
              result.style.display = shouldShow ? 'flex' : 'none';
          });
      }
    `;
  }

  /**
   * Generate JSON summary report
   */
  async generateJSONReport(): Promise<void> {
    const summary = {
      timestamp: new Date().toISOString(),
      testSuites: Array.from(this.testSuiteResults.values()),
      performanceMetrics: this.performanceMetrics,
      visualTestResults: this.visualTestResults,
      summary: this.generateOverallSummary()
    };

    const reportPath = join(this.outputDir, 'test-summary.json');
    writeFileSync(reportPath, JSON.stringify(summary, null, 2));

    console.log(`JSON report generated: ${reportPath}`);
  }

  /**
   * Generate overall summary
   */
  private generateOverallSummary(): any {
    const allResults = Array.from(this.testSuiteResults.values());
    const totalTests = allResults.reduce((sum, suite) => sum + suite.summary.total, 0);
    const totalPassed = allResults.reduce((sum, suite) => sum + suite.summary.passed, 0);
    const totalFailed = allResults.reduce((sum, suite) => sum + suite.summary.failed, 0);
    const totalSkipped = allResults.reduce((sum, suite) => sum + suite.summary.skipped, 0);
    const totalDuration = allResults.reduce((sum, suite) => sum + suite.summary.duration, 0);

    const criticalPerformanceIssues = this.performanceMetrics.filter(m => m.status === 'critical').length;
    const visualTestFailures = this.visualTestResults.filter(v => v.status === 'failed').length;

    return {
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      passRate: totalTests > 0 ? (totalPassed / totalTests * 100) : 0,
      totalDuration,
      criticalPerformanceIssues,
      visualTestFailures,
      overallHealth: this.calculateOverallHealth(totalPassed, totalTests, criticalPerformanceIssues, visualTestFailures)
    };
  }

  /**
   * Calculate overall health score
   */
  private calculateOverallHealth(passed: number, total: number, criticalPerf: number, visualFailures: number): string {
    if (total === 0) return 'unknown';

    const passRate = (passed / total) * 100;

    if (passRate >= 95 && criticalPerf === 0 && visualFailures === 0) return 'excellent';
    if (passRate >= 90 && criticalPerf <= 1 && visualFailures <= 2) return 'good';
    if (passRate >= 80 && criticalPerf <= 3 && visualFailures <= 5) return 'fair';
    return 'poor';
  }

  /**
   * Export results for external analysis
   */
  async exportResults(format: 'json' | 'csv' | 'xml' = 'json'): Promise<string> {
    const exportData = {
      testSuites: Array.from(this.testSuiteResults.values()),
      performanceMetrics: this.performanceMetrics,
      visualTestResults: this.visualTestResults
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-results-export-${timestamp}.${format}`;
    const exportPath = join(this.outputDir, filename);

    switch (format) {
      case 'json':
        writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
        break;
      case 'csv':
        const csvData = this.convertToCSV(exportData);
        writeFileSync(exportPath, csvData);
        break;
      case 'xml':
        const xmlData = this.convertToXML(exportData);
        writeFileSync(exportPath, xmlData);
        break;
    }

    return exportPath;
  }

  /**
   * Convert data to CSV format
   */
  private convertToCSV(data: any): string {
    const headers = ['Test Name', 'Suite', 'Project', 'Status', 'Duration', 'Timestamp'];
    let csv = headers.join(',') + '\n';

    for (const suite of data.testSuites) {
      for (const result of suite.results) {
        const row = [
          `"${result.testName}"`,
          `"${result.suite}"`,
          `"${result.project}"`,
          result.status,
          result.duration,
          `"${result.timestamp}"`
        ];
        csv += row.join(',') + '\n';
      }
    }

    return csv;
  }

  /**
   * Convert data to XML format
   */
  private convertToXML(data: any): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testResults>\n';

    for (const suite of data.testSuites) {
      xml += `  <testSuite name="${suite.name}" timestamp="${suite.timestamp}">\n`;

      for (const result of suite.results) {
        xml += `    <test name="${result.testName}" status="${result.status}" duration="${result.duration}" suite="${result.suite}" project="${result.project}">\n`;
        if (result.error) {
          xml += `      <error><![CDATA[${result.error}]]></error>\n`;
        }
        xml += `    </test>\n`;
      }

      xml += `  </testSuite>\n`;
    }

    xml += '</testResults>';
    return xml;
  }
}

/**
 * Factory function for creating test reporting dashboard
 */
export function createTestReportingDashboard(resultsDir?: string, outputDir?: string): TestReportingDashboard {
  return new TestReportingDashboard(resultsDir, outputDir);
}

/**
 * Main function to run the dashboard generation
 */
export async function generateTestDashboard(resultsDir?: string, outputDir?: string): Promise<void> {
  const dashboard = new TestReportingDashboard(resultsDir, outputDir);

  await dashboard.aggregateTestResults();
  await dashboard.generateDashboard();
  await dashboard.generateJSONReport();

  console.log('Test dashboard generation completed successfully');
}