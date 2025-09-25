import { test, expect } from '@playwright/test';
import { PerformanceMonitor } from '../utils/performance/performance-monitor';
import { LoadTestRunner } from '../utils/performance/load-test-runner';
import { MetricsCollector } from '../utils/performance/metrics-collector';

/**
 * Performance Testing with Playwright Metrics
 *
 * Comprehensive performance testing suite:
 * - Load testing with concurrent users
 * - Response time monitoring
 * - Resource utilization tracking
 * - Performance regression detection
 * - Memory and CPU profiling
 */

test.describe('Performance Testing Suite', () => {
  let performanceMonitor: PerformanceMonitor;
  let loadTestRunner: LoadTestRunner;
  let metricsCollector: MetricsCollector;

  test.beforeEach(async ({ page, browser }) => {
    performanceMonitor = new PerformanceMonitor(page);
    loadTestRunner = new LoadTestRunner(browser);
    metricsCollector = new MetricsCollector();

    await performanceMonitor.initialize();
  });

  test.describe('Page Load Performance', () => {
    test('should measure dashboard loading performance', async ({ page }) => {
      await test.step('Measure cold load performance', async () => {
        const coldLoadMetrics = await performanceMonitor.measurePageLoad('/dashboard', {
          clearCache: true,
          throttling: 'none'
        });

        expect(coldLoadMetrics.loadTime).toBeLessThan(3000); // 3 seconds
        expect(coldLoadMetrics.domContentLoaded).toBeLessThan(1500); // 1.5 seconds
        expect(coldLoadMetrics.firstContentfulPaint).toBeLessThan(1200); // 1.2 seconds
        expect(coldLoadMetrics.largestContentfulPaint).toBeLessThan(2500); // 2.5 seconds

        await metricsCollector.recordMetrics('dashboard-cold-load', coldLoadMetrics);
      });

      await test.step('Measure warm load performance', async () => {
        const warmLoadMetrics = await performanceMonitor.measurePageLoad('/dashboard', {
          clearCache: false,
          throttling: 'none'
        });

        expect(warmLoadMetrics.loadTime).toBeLessThan(1000); // 1 second for warm load
        expect(warmLoadMetrics.domContentLoaded).toBeLessThan(500); // 500ms

        await metricsCollector.recordMetrics('dashboard-warm-load', warmLoadMetrics);
      });

      await test.step('Measure performance with network throttling', async () => {
        const throttledMetrics = await performanceMonitor.measurePageLoad('/dashboard', {
          clearCache: true,
          throttling: '3G'
        });

        expect(throttledMetrics.loadTime).toBeLessThan(8000); // 8 seconds on 3G
        expect(throttledMetrics.firstContentfulPaint).toBeLessThan(4000); // 4 seconds

        await metricsCollector.recordMetrics('dashboard-throttled-load', throttledMetrics);
      });
    });

    test('should measure agent management page performance', async ({ page }) => {
      await test.step('Load agent management page', async () => {
        const agentPageMetrics = await performanceMonitor.measurePageLoad('/agents', {
          waitFor: '[data-testid="agent-list"]'
        });

        expect(agentPageMetrics.loadTime).toBeLessThan(2500);
        expect(agentPageMetrics.timeToInteractive).toBeLessThan(3000);

        await metricsCollector.recordMetrics('agent-page-load', agentPageMetrics);
      });

      await test.step('Measure large agent list performance', async () => {
        // Simulate scenario with many agents
        await page.addInitScript(() => {
          window.TEST_AGENT_COUNT = 100;
        });

        const largListMetrics = await performanceMonitor.measurePageLoad('/agents');

        expect(largListMetrics.loadTime).toBeLessThan(4000); // Allow more time for large lists
        expect(largListMetrics.cumulativeLayoutShift).toBeLessThan(0.1); // Minimal layout shift

        await metricsCollector.recordMetrics('agent-large-list-load', largListMetrics);
      });
    });

    test('should measure swarm visualization performance', async ({ page }) => {
      await test.step('Load swarm page with complex topology', async () => {
        const swarmMetrics = await performanceMonitor.measurePageLoad('/swarms', {
          waitFor: '[data-testid="swarm-visualization"]'
        });

        expect(swarmMetrics.loadTime).toBeLessThan(3500);
        expect(swarmMetrics.firstContentfulPaint).toBeLessThan(1500);

        await metricsCollector.recordMetrics('swarm-visualization-load', swarmMetrics);
      });

      await test.step('Measure real-time updates performance', async () => {
        await page.goto('/swarms/active-swarm');

        const realtimeMetrics = await performanceMonitor.measureRealtimeUpdates({
          duration: 30000, // 30 seconds
          updateInterval: 1000 // 1 second updates
        });

        expect(realtimeMetrics.averageUpdateTime).toBeLessThan(100); // 100ms per update
        expect(realtimeMetrics.memoryLeakage).toBeLessThan(50); // Less than 50MB growth

        await metricsCollector.recordMetrics('swarm-realtime-updates', realtimeMetrics);
      });
    });
  });

  test.describe('API Performance Testing', () => {
    test('should measure API response times', async ({ request }) => {
      const apiEndpoints = [
        { path: '/api/agents', name: 'agents-list', maxTime: 500 },
        { path: '/api/swarms', name: 'swarms-list', maxTime: 800 },
        { path: '/api/tasks', name: 'tasks-list', maxTime: 600 },
        { path: '/api/metrics/dashboard', name: 'dashboard-metrics', maxTime: 1200 }
      ];

      for (const endpoint of apiEndpoints) {
        await test.step(`Test ${endpoint.name} API performance`, async () => {
          const apiMetrics = await performanceMonitor.measureAPIPerformance(request, {
            endpoint: endpoint.path,
            method: 'GET',
            iterations: 10
          });

          expect(apiMetrics.averageResponseTime).toBeLessThan(endpoint.maxTime);
          expect(apiMetrics.p95ResponseTime).toBeLessThan(endpoint.maxTime * 1.5);
          expect(apiMetrics.errorRate).toBe(0);

          await metricsCollector.recordMetrics(`api-${endpoint.name}`, apiMetrics);
        });
      }
    });

    test('should measure API performance under load', async ({ browser }) => {
      await test.step('Test concurrent API requests', async () => {
        const concurrentUsers = 10;
        const requestsPerUser = 20;

        const loadTestResults = await loadTestRunner.runAPILoadTest({
          endpoint: '/api/agents',
          concurrentUsers,
          requestsPerUser,
          rampUpTime: 10000 // 10 seconds
        });

        expect(loadTestResults.averageResponseTime).toBeLessThan(1000);
        expect(loadTestResults.errorRate).toBeLessThan(0.01); // Less than 1% errors
        expect(loadTestResults.throughput).toBeGreaterThan(50); // At least 50 requests/second

        await metricsCollector.recordMetrics('api-load-test', loadTestResults);
      });

      await test.step('Test API stress limits', async () => {
        const stressTestResults = await loadTestRunner.runAPIStressTest({
          endpoint: '/api/tasks',
          maxConcurrentUsers: 50,
          testDuration: 60000, // 1 minute
          stepUpInterval: 10000 // Add 10 users every 10 seconds
        });

        // API should handle stress gracefully
        expect(stressTestResults.errorRate).toBeLessThan(0.05); // Less than 5% errors
        expect(stressTestResults.maxResponseTime).toBeLessThan(5000); // Max 5 seconds

        await metricsCollector.recordMetrics('api-stress-test', stressTestResults);
      });
    });
  });

  test.describe('Multi-Agent Performance Testing', () => {
    test('should measure agent spawning performance', async ({ page }) => {
      await test.step('Measure single agent spawn time', async () => {
        await page.goto('/agents');

        const spawnMetrics = await performanceMonitor.measureAgentOperation('spawn', {
          agentType: 'coder',
          configuration: 'default'
        });

        expect(spawnMetrics.spawnTime).toBeLessThan(5000); // 5 seconds
        expect(spawnMetrics.memoryUsage).toBeLessThan(100); // 100MB
        expect(spawnMetrics.cpuUsage).toBeLessThan(50); // 50% CPU during spawn

        await metricsCollector.recordMetrics('single-agent-spawn', spawnMetrics);
      });

      await test.step('Measure bulk agent spawning', async () => {
        const bulkSpawnMetrics = await performanceMonitor.measureBulkAgentSpawn({
          agentCount: 5,
          agentTypes: ['coder', 'tester', 'reviewer', 'researcher', 'coordinator'],
          spawnStrategy: 'parallel'
        });

        expect(bulkSpawnMetrics.totalSpawnTime).toBeLessThan(15000); // 15 seconds for 5 agents
        expect(bulkSpawnMetrics.averageSpawnTime).toBeLessThan(8000); // 8 seconds average
        expect(bulkSpawnMetrics.peakMemoryUsage).toBeLessThan(500); // 500MB peak

        await metricsCollector.recordMetrics('bulk-agent-spawn', bulkSpawnMetrics);
      });
    });

    test('should measure swarm coordination performance', async ({ page }) => {
      await test.step('Test swarm initialization performance', async () => {
        await page.goto('/swarms');

        const swarmInitMetrics = await performanceMonitor.measureSwarmOperation('initialize', {
          topology: 'hierarchical',
          agentCount: 6,
          strategy: 'balanced'
        });

        expect(swarmInitMetrics.initializationTime).toBeLessThan(20000); // 20 seconds
        expect(swarmInitMetrics.coordinationOverhead).toBeLessThan(10); // 10% overhead
        expect(swarmInitMetrics.networkLatency).toBeLessThan(100); // 100ms network latency

        await metricsCollector.recordMetrics('swarm-initialization', swarmInitMetrics);
      });

      await test.step('Test task distribution performance', async () => {
        // Use existing swarm for task distribution test
        const taskDistributionMetrics = await performanceMonitor.measureTaskDistribution({
          swarmId: 'test-swarm',
          taskCount: 20,
          taskComplexity: 'medium'
        });

        expect(taskDistributionMetrics.distributionTime).toBeLessThan(5000); // 5 seconds
        expect(taskDistributionMetrics.loadBalanceEfficiency).toBeGreaterThan(0.8); // 80% efficiency
        expect(taskDistributionMetrics.coordinationMessages).toBeLessThan(100); // Less than 100 messages

        await metricsCollector.recordMetrics('task-distribution', taskDistributionMetrics);
      });

      await test.step('Test swarm scaling performance', async () => {
        const scalingMetrics = await performanceMonitor.measureSwarmScaling({
          initialAgents: 3,
          targetAgents: 10,
          scalingStrategy: 'adaptive'
        });

        expect(scalingMetrics.scaleUpTime).toBeLessThan(30000); // 30 seconds
        expect(scalingMetrics.scaleDownTime).toBeLessThan(15000); // 15 seconds
        expect(scalingMetrics.resourceUtilization).toBeGreaterThan(0.7); // 70% utilization

        await metricsCollector.recordMetrics('swarm-scaling', scalingMetrics);
      });
    });
  });

  test.describe('User Interface Performance', () => {
    test('should measure UI responsiveness under load', async ({ browser }) => {
      await test.step('Test UI responsiveness with concurrent users', async () => {
        const concurrentUsers = 5;
        const contexts = await Promise.all(
          Array.from({ length: concurrentUsers }, () => browser.newContext())
        );
        const pages = await Promise.all(contexts.map(context => context.newPage()));

        const uiResponseMetrics = await loadTestRunner.runUILoadTest({
          pages,
          scenario: 'agent-management-workflow',
          duration: 60000 // 1 minute
        });

        expect(uiResponseMetrics.averageInteractionTime).toBeLessThan(500); // 500ms
        expect(uiResponseMetrics.p95InteractionTime).toBeLessThan(1000); // 1 second
        expect(uiResponseMetrics.frameDropRate).toBeLessThan(0.02); // Less than 2% frame drops

        await metricsCollector.recordMetrics('ui-concurrent-load', uiResponseMetrics);

        // Cleanup
        await Promise.all(contexts.map(context => context.close()));
      });
    });

    test('should measure complex UI operations performance', async ({ page }) => {
      await test.step('Test complex form interactions', async () => {
        await page.goto('/agents/create');

        const formMetrics = await performanceMonitor.measureFormPerformance({
          formSelector: '[data-testid="agent-form"]',
          interactions: [
            { type: 'fill', selector: '[name="name"]', value: 'Performance Test Agent' },
            { type: 'select', selector: '[name="type"]', value: 'coder' },
            { type: 'fill', selector: '[name="description"]', value: 'Long description with many words to test form performance under realistic conditions' },
            { type: 'click', selector: '[data-testid="add-capability"]' },
            { type: 'select', selector: '[name="capability"]', value: 'javascript' }
          ]
        });

        expect(formMetrics.totalInteractionTime).toBeLessThan(3000);
        expect(formMetrics.averageFieldResponseTime).toBeLessThan(100);
        expect(formMetrics.validationTime).toBeLessThan(200);

        await metricsCollector.recordMetrics('complex-form-performance', formMetrics);
      });

      await test.step('Test data table performance', async () => {
        await page.goto('/agents');

        // Add many rows to test table performance
        await page.addInitScript(() => {
          window.TEST_TABLE_ROWS = 500;
        });

        const tableMetrics = await performanceMonitor.measureTablePerformance({
          tableSelector: '[data-testid="agents-table"]',
          operations: ['sort', 'filter', 'pagination']
        });

        expect(tableMetrics.sortTime).toBeLessThan(1000);
        expect(tableMetrics.filterTime).toBeLessThan(800);
        expect(tableMetrics.paginationTime).toBeLessThan(400);
        expect(tableMetrics.renderTime).toBeLessThan(2000);

        await metricsCollector.recordMetrics('data-table-performance', tableMetrics);
      });
    });

    test('should measure real-time updates performance', async ({ page }) => {
      await test.step('Test WebSocket performance', async () => {
        await page.goto('/swarms/active-swarm');

        const websocketMetrics = await performanceMonitor.measureWebSocketPerformance({
          duration: 30000, // 30 seconds
          messageFrequency: 100 // Every 100ms
        });

        expect(websocketMetrics.averageLatency).toBeLessThan(50); // 50ms
        expect(websocketMetrics.messageDropRate).toBeLessThan(0.001); // Less than 0.1%
        expect(websocketMetrics.reconnectionRate).toBe(0); // No reconnections expected

        await metricsCollector.recordMetrics('websocket-performance', websocketMetrics);
      });

      await test.step('Test real-time chart updates', async () => {
        const chartMetrics = await performanceMonitor.measureChartPerformance({
          chartSelector: '[data-testid="performance-chart"]',
          updateFrequency: 1000, // Every second
          dataPoints: 100,
          duration: 30000 // 30 seconds
        });

        expect(chartMetrics.averageRenderTime).toBeLessThan(50);
        expect(chartMetrics.frameRate).toBeGreaterThan(30); // 30 FPS minimum
        expect(chartMetrics.memoryGrowth).toBeLessThan(20); // Less than 20MB growth

        await metricsCollector.recordMetrics('realtime-chart-performance', chartMetrics);
      });
    });
  });

  test.describe('Memory and Resource Monitoring', () => {
    test('should monitor memory usage patterns', async ({ page }) => {
      await test.step('Test memory usage in long-running session', async () => {
        const memoryMetrics = await performanceMonitor.measureMemoryUsage({
          page,
          duration: 300000, // 5 minutes
          operations: [
            'navigate-dashboard',
            'create-agents',
            'manage-swarms',
            'view-metrics',
            'delete-resources'
          ]
        });

        expect(memoryMetrics.peakMemoryUsage).toBeLessThan(500); // 500MB peak
        expect(memoryMetrics.memoryLeakRate).toBeLessThan(1); // Less than 1MB/minute leak
        expect(memoryMetrics.garbageCollectionFrequency).toBeLessThan(10); // Less than 10 GC/minute

        await metricsCollector.recordMetrics('memory-usage-patterns', memoryMetrics);
      });

      await test.step('Test memory usage with multiple tabs', async () => {
        const tabMetrics = await loadTestRunner.measureMultiTabMemoryUsage({
          tabCount: 5,
          tabScenarios: ['/dashboard', '/agents', '/swarms', '/tasks', '/metrics'],
          duration: 120000 // 2 minutes
        });

        expect(tabMetrics.totalMemoryUsage).toBeLessThan(1000); // 1GB total
        expect(tabMetrics.memoryPerTab).toBeLessThan(200); // 200MB per tab
        expect(tabMetrics.sharedMemoryEfficiency).toBeGreaterThan(0.3); // 30% sharing

        await metricsCollector.recordMetrics('multi-tab-memory', tabMetrics);
      });
    });

    test('should monitor CPU and network usage', async ({ page }) => {
      await test.step('Test CPU usage patterns', async () => {
        const cpuMetrics = await performanceMonitor.measureCPUUsage({
          page,
          scenario: 'intensive-operations',
          duration: 120000 // 2 minutes
        });

        expect(cpuMetrics.averageCPUUsage).toBeLessThan(70); // 70% average CPU
        expect(cpuMetrics.peakCPUUsage).toBeLessThan(90); // 90% peak CPU
        expect(cpuMetrics.cpuEfficiency).toBeGreaterThan(0.6); // 60% efficiency

        await metricsCollector.recordMetrics('cpu-usage-patterns', cpuMetrics);
      });

      await test.step('Test network usage optimization', async () => {
        const networkMetrics = await performanceMonitor.measureNetworkUsage({
          page,
          operations: ['page-load', 'ajax-requests', 'websocket-messages'],
          duration: 180000 // 3 minutes
        });

        expect(networkMetrics.totalDataTransfer).toBeLessThan(50); // 50MB total
        expect(networkMetrics.requestCount).toBeLessThan(500); // 500 requests
        expect(networkMetrics.cacheHitRate).toBeGreaterThan(0.8); // 80% cache hits

        await metricsCollector.recordMetrics('network-usage-optimization', networkMetrics);
      });
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Capture performance metrics even for failed tests
    const finalMetrics = await performanceMonitor.captureSnapshot();
    await metricsCollector.recordMetrics(`final-${testInfo.title}`, finalMetrics);

    // Generate performance report for this test
    if (testInfo.status !== testInfo.expectedStatus) {
      await performanceMonitor.generateFailureReport({
        testName: testInfo.title,
        error: testInfo.error?.message,
        metrics: finalMetrics
      });
    }
  });

  test.afterAll(async () => {
    // Compile all performance metrics
    const performanceReport = await metricsCollector.generatePerformanceReport();

    // Check for performance regressions
    const regressionAnalysis = await metricsCollector.analyzePerformanceRegressions();

    // Save performance baselines
    await metricsCollector.updatePerformanceBaselines();

    // Generate summary dashboard
    await metricsCollector.generatePerformanceDashboard({
      report: performanceReport,
      regressions: regressionAnalysis
    });
  });
});