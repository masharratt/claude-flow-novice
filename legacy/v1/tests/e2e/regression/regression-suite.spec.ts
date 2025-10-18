import { test, expect } from '@playwright/test';
import { RegressionSuite } from '../../utils/regression/regression-suite';
import { BaselineManager } from '../../utils/regression/baseline-manager';
import { ChangeDetector } from '../../utils/regression/change-detector';

/**
 * Automated Regression Testing Framework
 *
 * Comprehensive regression testing suite that:
 * - Maintains test baselines
 * - Detects unintended changes
 * - Provides detailed comparison reports
 * - Supports multiple validation types (UI, API, Performance)
 */

test.describe('Automated Regression Testing', () => {
  let regressionSuite: RegressionSuite;
  let baselineManager: BaselineManager;
  let changeDetector: ChangeDetector;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    regressionSuite = new RegressionSuite(page);
    baselineManager = new BaselineManager();
    changeDetector = new ChangeDetector();

    await baselineManager.initializeBaselines();
  });

  test.describe('UI Regression Testing', () => {
    test('should detect UI changes in dashboard layout', async ({ page }) => {
      await test.step('Capture current dashboard state', async () => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        const currentState = await regressionSuite.captureUIState({
          selector: '[data-testid="dashboard"]',
          includeCSS: true,
          includeLayout: true
        });

        const baseline = await baselineManager.getBaseline('dashboard-layout');
        const changes = await changeDetector.compareUIStates(baseline, currentState);

        if (changes.hasChanges) {
          await regressionSuite.generateChangeReport({
            testName: 'dashboard-layout',
            changes,
            severity: 'medium'
          });
        }

        expect(changes.criticalChanges).toHaveLength(0);
      });
    });

    test('should validate agent management interface consistency', async ({ page }) => {
      await test.step('Test agent list rendering', async () => {
        await page.goto('/agents');
        await page.waitForSelector('[data-testid="agent-list"]');

        const agentListState = await regressionSuite.captureUIState({
          selector: '[data-testid="agent-list"]',
          includeText: true,
          includeAttributes: true
        });

        const baseline = await baselineManager.getBaseline('agent-list-interface');
        const differences = await changeDetector.compareUIStates(baseline, agentListState);

        // Allow minor text changes but detect structural changes
        const structuralChanges = differences.changes.filter(change =>
          change.type === 'structure' || change.type === 'layout'
        );

        expect(structuralChanges).toHaveLength(0);
      });

      await test.step('Test agent creation form stability', async () => {
        await page.click('[data-testid="create-agent-button"]');
        await page.waitForSelector('[data-testid="agent-form"]');

        const formState = await regressionSuite.captureUIState({
          selector: '[data-testid="agent-form"]',
          includeFormElements: true,
          includeValidation: true
        });

        const baseline = await baselineManager.getBaseline('agent-creation-form');
        const changes = await changeDetector.compareUIStates(baseline, formState);

        // Form structure should remain stable
        expect(changes.formElementChanges).toHaveLength(0);
        expect(changes.validationRuleChanges).toHaveLength(0);
      });
    });

    test('should detect responsive design regressions', async ({ browser }) => {
      const viewports = [
        { name: 'mobile', width: 375, height: 667 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'desktop', width: 1920, height: 1080 }
      ];

      for (const viewport of viewports) {
        await test.step(`Test ${viewport.name} viewport`, async () => {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height }
          });
          const page = await context.newPage();

          await page.goto('/dashboard');
          await page.waitForLoadState('networkidle');

          const responsiveState = await regressionSuite.captureUIState({
            selector: 'body',
            includeResponsiveElements: true,
            viewport: viewport.name
          });

          const baseline = await baselineManager.getBaseline(`responsive-${viewport.name}`);
          const changes = await changeDetector.compareUIStates(baseline, responsiveState);

          // Mobile-specific assertions
          if (viewport.name === 'mobile') {
            expect(changes.overflowElements).toHaveLength(0);
            expect(changes.horizontalScrollDetected).toBe(false);
          }

          expect(changes.criticalResponsiveIssues).toHaveLength(0);
          await context.close();
        });
      }
    });
  });

  test.describe('API Regression Testing', () => {
    test('should validate API response structures', async ({ request }) => {
      const apiEndpoints = [
        { path: '/api/agents', method: 'GET', name: 'agents-list' },
        { path: '/api/swarms', method: 'GET', name: 'swarms-list' },
        { path: '/api/tasks', method: 'GET', name: 'tasks-list' },
        { path: '/api/metrics', method: 'GET', name: 'metrics-data' }
      ];

      for (const endpoint of apiEndpoints) {
        await test.step(`Test ${endpoint.name} API`, async () => {
          const response = await request[endpoint.method.toLowerCase()](endpoint.path);
          expect(response.ok()).toBe(true);

          const responseData = await response.json();
          const currentStructure = await regressionSuite.captureAPIStructure(responseData);

          const baseline = await baselineManager.getBaseline(`api-${endpoint.name}`);
          const changes = await changeDetector.compareAPIStructures(baseline, currentStructure);

          // Breaking changes should not be allowed
          expect(changes.breakingChanges).toHaveLength(0);

          // Document non-breaking changes
          if (changes.nonBreakingChanges.length > 0) {
            await regressionSuite.logAPIChanges({
              endpoint: endpoint.path,
              changes: changes.nonBreakingChanges,
              severity: 'info'
            });
          }
        });
      }
    });

    test('should validate API error responses', async ({ request }) => {
      const errorScenarios = [
        { path: '/api/agents/nonexistent', status: 404, name: 'agent-not-found' },
        { path: '/api/tasks', method: 'POST', data: {}, status: 400, name: 'invalid-task-data' },
        { path: '/api/swarms/invalid-id', status: 400, name: 'invalid-swarm-id' }
      ];

      for (const scenario of errorScenarios) {
        await test.step(`Test ${scenario.name} error handling`, async () => {
          let response;
          if (scenario.method === 'POST') {
            response = await request.post(scenario.path, { data: scenario.data });
          } else {
            response = await request.get(scenario.path);
          }

          expect(response.status()).toBe(scenario.status);

          const errorResponse = await response.json();
          const errorStructure = await regressionSuite.captureErrorStructure(errorResponse);

          const baseline = await baselineManager.getBaseline(`error-${scenario.name}`);
          const changes = await changeDetector.compareErrorStructures(baseline, errorStructure);

          // Error message structure should remain consistent
          expect(changes.structureChanges).toHaveLength(0);
        });
      }
    });

    test('should validate API performance characteristics', async ({ request }) => {
      const performanceEndpoints = [
        { path: '/api/agents', name: 'agents-list', maxTime: 1000 },
        { path: '/api/dashboard/summary', name: 'dashboard-summary', maxTime: 2000 },
        { path: '/api/metrics/performance', name: 'performance-metrics', maxTime: 3000 }
      ];

      for (const endpoint of performanceEndpoints) {
        await test.step(`Test ${endpoint.name} performance`, async () => {
          const startTime = Date.now();
          const response = await request.get(endpoint.path);
          const endTime = Date.now();

          const responseTime = endTime - startTime;
          expect(response.ok()).toBe(true);
          expect(responseTime).toBeLessThan(endpoint.maxTime);

          // Record performance metrics
          await regressionSuite.recordPerformanceMetric({
            endpoint: endpoint.path,
            responseTime,
            timestamp: new Date().toISOString()
          });

          // Compare with baseline performance
          const performanceBaseline = await baselineManager.getPerformanceBaseline(endpoint.name);
          const performanceChange = responseTime - performanceBaseline.averageTime;

          // Alert if performance degrades by more than 50%
          if (performanceChange > performanceBaseline.averageTime * 0.5) {
            await regressionSuite.generatePerformanceAlert({
              endpoint: endpoint.path,
              currentTime: responseTime,
              baselineTime: performanceBaseline.averageTime,
              degradation: (performanceChange / performanceBaseline.averageTime * 100).toFixed(2)
            });
          }
        });
      }
    });
  });

  test.describe('Workflow Regression Testing', () => {
    test('should validate agent creation workflow stability', async ({ page }) => {
      const workflowSteps = [
        { action: 'navigate', target: '/agents' },
        { action: 'click', selector: '[data-testid="create-agent-button"]' },
        { action: 'fill', selector: '[name="agentName"]', value: 'Regression Test Agent' },
        { action: 'select', selector: '[name="agentType"]', value: 'coder' },
        { action: 'click', selector: '[data-testid="submit-agent"]' },
        { action: 'wait', selector: '[data-testid="success-notification"]' }
      ];

      await test.step('Execute workflow and capture state changes', async () => {
        const workflowTrace = await regressionSuite.executeWorkflowWithTracking(page, workflowSteps);

        const baseline = await baselineManager.getWorkflowBaseline('agent-creation-workflow');
        const changes = await changeDetector.compareWorkflowTraces(baseline, workflowTrace);

        // Workflow should complete without changes to critical steps
        expect(changes.criticalStepChanges).toHaveLength(0);
        expect(changes.workflowCompletionRate).toBe(100);
      });
    });

    test('should validate swarm coordination workflow', async ({ page }) => {
      const swarmWorkflow = [
        { action: 'navigate', target: '/swarms' },
        { action: 'click', selector: '[data-testid="create-swarm-button"]' },
        { action: 'select', selector: '[name="topology"]', value: 'hierarchical' },
        { action: 'fill', selector: '[name="maxAgents"]', value: '3' },
        { action: 'click', selector: '[data-testid="add-agent-button"]' },
        { action: 'select', selector: '[name="agentType"]', value: 'coordinator' },
        { action: 'click', selector: '[data-testid="confirm-agent"]' },
        { action: 'click', selector: '[data-testid="initialize-swarm"]' },
        { action: 'wait', condition: 'swarm-active' }
      ];

      await test.step('Execute swarm workflow with monitoring', async () => {
        const workflowResult = await regressionSuite.executeComplexWorkflow(page, swarmWorkflow);

        const baseline = await baselineManager.getWorkflowBaseline('swarm-coordination-workflow');
        const comparison = await changeDetector.compareWorkflowResults(baseline, workflowResult);

        // Swarm initialization should succeed consistently
        expect(comparison.successRateChange).toBeGreaterThanOrEqual(-0.05); // Allow 5% degradation
        expect(comparison.averageTimeChange).toBeLessThan(30000); // Allow 30s increase
      });
    });

    test('should validate task assignment workflow', async ({ page }) => {
      // Use existing swarm for task assignment
      await page.goto('/swarms');
      await page.click('[data-testid="test-swarm"]');

      const taskWorkflow = [
        { action: 'click', selector: '[data-testid="assign-task-button"]' },
        { action: 'fill', selector: '[name="taskTitle"]', value: 'Regression Test Task' },
        { action: 'fill', selector: '[name="taskDescription"]', value: 'Test task for regression validation' },
        { action: 'select', selector: '[name="priority"]', value: 'medium' },
        { action: 'select', selector: '[name="assignTo"]', value: 'auto' },
        { action: 'click', selector: '[data-testid="submit-task"]' },
        { action: 'wait', condition: 'task-assigned' }
      ];

      await test.step('Execute task assignment workflow', async () => {
        const execution = await regressionSuite.executeWorkflowWithValidation(page, taskWorkflow);

        const baseline = await baselineManager.getWorkflowBaseline('task-assignment-workflow');
        const analysis = await changeDetector.analyzeWorkflowExecution(baseline, execution);

        // Task assignment should work reliably
        expect(analysis.errorRate).toBeLessThanOrEqual(baseline.acceptableErrorRate);
        expect(analysis.completionTime).toBeLessThanOrEqual(baseline.maxCompletionTime * 1.2);
      });
    });
  });

  test.describe('Data Regression Testing', () => {
    test('should validate database schema consistency', async () => {
      await test.step('Check database schema structure', async () => {
        const currentSchema = await regressionSuite.captureDBSchema();
        const schemaBaseline = await baselineManager.getSchemaBaseline();

        const schemaChanges = await changeDetector.compareDBSchemas(schemaBaseline, currentSchema);

        // Breaking schema changes should be flagged
        expect(schemaChanges.breakingChanges).toHaveLength(0);

        // Document non-breaking changes
        if (schemaChanges.nonBreakingChanges.length > 0) {
          await regressionSuite.logSchemaChanges({
            changes: schemaChanges.nonBreakingChanges,
            timestamp: new Date().toISOString()
          });
        }
      });
    });

    test('should validate data migration consistency', async () => {
      await test.step('Test data migration integrity', async () => {
        const migrationResults = await regressionSuite.executeMigrationTest();
        const migrationBaseline = await baselineManager.getMigrationBaseline();

        const migrationComparison = await changeDetector.compareMigrationResults(
          migrationBaseline,
          migrationResults
        );

        // Data integrity should be maintained
        expect(migrationComparison.dataIntegrityIssues).toHaveLength(0);
        expect(migrationComparison.migrationSuccess).toBe(true);
        expect(migrationComparison.dataLoss).toBe(0);
      });
    });

    test('should validate configuration consistency', async () => {
      await test.step('Check configuration file integrity', async () => {
        const currentConfig = await regressionSuite.captureConfigurationState();
        const configBaseline = await baselineManager.getConfigBaseline();

        const configChanges = await changeDetector.compareConfigurations(
          configBaseline,
          currentConfig
        );

        // Critical configuration should remain stable
        expect(configChanges.criticalConfigChanges).toHaveLength(0);

        // Validate environment-specific changes
        const environmentChanges = configChanges.changes.filter(change =>
          change.scope === 'environment'
        );

        // Environment changes should be documented
        if (environmentChanges.length > 0) {
          await regressionSuite.documentConfigurationChanges({
            environmentChanges,
            timestamp: new Date().toISOString()
          });
        }
      });
    });
  });

  test.describe('Security Regression Testing', () => {
    test('should validate authentication security measures', async ({ page }) => {
      await test.step('Test authentication regression', async () => {
        const securityTests = await regressionSuite.executeSecurityTests([
          'sql-injection-protection',
          'xss-protection',
          'csrf-protection',
          'authentication-bypass',
          'authorization-escalation'
        ]);

        const securityBaseline = await baselineManager.getSecurityBaseline();
        const securityChanges = await changeDetector.compareSecurityResults(
          securityBaseline,
          securityTests
        );

        // Security posture should not degrade
        expect(securityChanges.vulnerabilityIncrease).toBe(0);
        expect(securityChanges.securityScoreDecrease).toBeLessThanOrEqual(0);
      });
    });

    test('should validate API security endpoints', async ({ request }) => {
      await test.step('Test API security regression', async () => {
        const securityEndpoints = [
          { path: '/api/auth/login', method: 'POST', security: 'rate-limiting' },
          { path: '/api/admin', method: 'GET', security: 'authorization' },
          { path: '/api/users/profile', method: 'PUT', security: 'authentication' }
        ];

        for (const endpoint of securityEndpoints) {
          const securityTest = await regressionSuite.testEndpointSecurity(request, endpoint);
          const securityBaseline = await baselineManager.getEndpointSecurityBaseline(endpoint.path);

          const securityComparison = await changeDetector.compareEndpointSecurity(
            securityBaseline,
            securityTest
          );

          expect(securityComparison.securityWeakened).toBe(false);
        }
      });
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Capture failure state for regression analysis
    if (testInfo.status !== testInfo.expectedStatus) {
      await regressionSuite.captureFailureState({
        testName: testInfo.title,
        page,
        failureReason: testInfo.error?.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  test.afterAll(async () => {
    // Generate regression test summary
    await regressionSuite.generateRegressionSummary();

    // Update baselines if tests pass
    if (process.env.UPDATE_BASELINES === 'true') {
      await baselineManager.updateBaselines();
    }

    // Cleanup test artifacts
    await regressionSuite.cleanup();
  });
});