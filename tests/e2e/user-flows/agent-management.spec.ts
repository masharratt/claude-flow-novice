import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../utils/pages/dashboard-page';
import { AgentManagementPage } from '../../utils/pages/agent-management-page';
import { SwarmPage } from '../../utils/pages/swarm-page';

/**
 * Agent Management User Flow Tests
 *
 * Critical user journeys for agent management:
 * - Agent creation and configuration
 * - Agent lifecycle management
 * - Task assignment and monitoring
 * - Agent performance tracking
 */

test.describe('Agent Management User Flows', () => {
  let dashboardPage: DashboardPage;
  let agentPage: AgentManagementPage;
  let swarmPage: SwarmPage;

  // Use authenticated state
  test.use({ storageState: 'test-results/.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    agentPage = new AgentManagementPage(page);
    swarmPage = new SwarmPage(page);

    await dashboardPage.navigate();
  });

  test.describe('Agent Creation', () => {
    test('should create a new agent successfully', async ({ page }) => {
      await test.step('Navigate to agent creation', async () => {
        await dashboardPage.clickAgentManagement();
        await agentPage.clickCreateAgent();
        await expect(agentPage.createAgentForm).toBeVisible();
      });

      await test.step('Fill agent configuration', async () => {
        await agentPage.fillAgentForm({
          name: 'Test Coder Agent',
          type: 'coder',
          description: 'A test coder agent for automated testing',
          capabilities: ['javascript', 'testing', 'debugging'],
          maxMemory: '512MB',
          timeout: '30s'
        });
      });

      await test.step('Submit agent creation', async () => {
        await agentPage.submitCreateAgent();
      });

      await test.step('Verify agent created', async () => {
        await expect(agentPage.successNotification).toContainText('Agent created successfully');
        await expect(agentPage.agentList).toContainText('Test Coder Agent');
        await expect(agentPage.getAgentStatus('Test Coder Agent')).toContainText('Ready');
      });
    });

    test('should validate agent configuration', async ({ page }) => {
      await dashboardPage.clickAgentManagement();
      await agentPage.clickCreateAgent();

      await test.step('Test required fields', async () => {
        await agentPage.submitCreateAgent();
        await expect(agentPage.nameError).toContainText('Agent name is required');
        await expect(agentPage.typeError).toContainText('Agent type is required');
      });

      await test.step('Test name uniqueness', async () => {
        await agentPage.fillAgentForm({
          name: 'Test Coder Agent', // Existing name
          type: 'coder'
        });
        await agentPage.submitCreateAgent();
        await expect(agentPage.errorNotification).toContainText('Agent name already exists');
      });
    });

    test('should show agent type capabilities', async ({ page }) => {
      await dashboardPage.clickAgentManagement();
      await agentPage.clickCreateAgent();

      await test.step('Select different agent types', async () => {
        const agentTypes = ['coder', 'reviewer', 'tester', 'researcher'];

        for (const type of agentTypes) {
          await agentPage.selectAgentType(type);
          await expect(agentPage.capabilityHints).toBeVisible();
          await expect(agentPage.capabilityHints).toContainText(type);
        }
      });
    });
  });

  test.describe('Agent Lifecycle Management', () => {
    test('should start and stop agents', async ({ page }) => {
      await dashboardPage.clickAgentManagement();

      await test.step('Start inactive agent', async () => {
        await agentPage.clickAgentAction('Test Agent', 'start');
        await expect(agentPage.getAgentStatus('Test Agent')).toContainText('Starting');

        // Wait for agent to be ready
        await expect(agentPage.getAgentStatus('Test Agent')).toContainText('Ready', { timeout: 30000 });
      });

      await test.step('Stop active agent', async () => {
        await agentPage.clickAgentAction('Test Agent', 'stop');
        await expect(agentPage.getAgentStatus('Test Agent')).toContainText('Stopping');

        // Wait for agent to stop
        await expect(agentPage.getAgentStatus('Test Agent')).toContainText('Stopped', { timeout: 15000 });
      });
    });

    test('should restart agent', async ({ page }) => {
      await dashboardPage.clickAgentManagement();

      // Ensure agent is running first
      await agentPage.clickAgentAction('Test Agent', 'start');
      await expect(agentPage.getAgentStatus('Test Agent')).toContainText('Ready', { timeout: 30000 });

      await test.step('Restart agent', async () => {
        await agentPage.clickAgentAction('Test Agent', 'restart');
        await expect(agentPage.getAgentStatus('Test Agent')).toContainText('Restarting');
        await expect(agentPage.getAgentStatus('Test Agent')).toContainText('Ready', { timeout: 45000 });
      });
    });

    test('should delete agent with confirmation', async ({ page }) => {
      await dashboardPage.clickAgentManagement();

      await test.step('Attempt to delete agent', async () => {
        await agentPage.clickAgentAction('Test Agent', 'delete');
        await expect(agentPage.deleteConfirmation).toBeVisible();
        await expect(agentPage.deleteConfirmation).toContainText('Are you sure?');
      });

      await test.step('Cancel deletion', async () => {
        await agentPage.clickCancelDelete();
        await expect(agentPage.deleteConfirmation).not.toBeVisible();
        await expect(agentPage.agentList).toContainText('Test Agent');
      });

      await test.step('Confirm deletion', async () => {
        await agentPage.clickAgentAction('Test Agent', 'delete');
        await agentPage.clickConfirmDelete();
        await expect(agentPage.successNotification).toContainText('Agent deleted');
        await expect(agentPage.agentList).not.toContainText('Test Agent');
      });
    });
  });

  test.describe('Task Assignment', () => {
    test('should assign task to agent', async ({ page }) => {
      await dashboardPage.clickAgentManagement();

      await test.step('Select agent and assign task', async () => {
        await agentPage.clickAgent('Test Coder Agent');
        await agentPage.clickAssignTask();
        await expect(agentPage.taskAssignmentModal).toBeVisible();
      });

      await test.step('Fill task details', async () => {
        await agentPage.fillTaskForm({
          title: 'Implement user authentication',
          description: 'Create login and registration functionality',
          priority: 'high',
          deadline: '2024-12-31',
          requirements: ['JWT tokens', 'Password hashing', 'Input validation']
        });
      });

      await test.step('Submit task assignment', async () => {
        await agentPage.submitTaskAssignment();
        await expect(agentPage.successNotification).toContainText('Task assigned successfully');
      });

      await test.step('Verify task in agent queue', async () => {
        await expect(agentPage.agentTasks).toContainText('Implement user authentication');
        await expect(agentPage.getTaskStatus('Implement user authentication')).toContainText('Queued');
      });
    });

    test('should show task progress', async ({ page }) => {
      await dashboardPage.clickAgentManagement();
      await agentPage.clickAgent('Test Coder Agent');

      // Start the assigned task
      await agentPage.clickTaskAction('Implement user authentication', 'start');

      await test.step('Monitor task progress', async () => {
        await expect(agentPage.getTaskStatus('Implement user authentication')).toContainText('In Progress');
        await expect(agentPage.taskProgressBar).toBeVisible();

        // Wait for some progress
        await page.waitForTimeout(5000);
        const progress = await agentPage.getTaskProgress('Implement user authentication');
        expect(parseInt(progress)).toBeGreaterThan(0);
      });
    });

    test('should handle task completion', async ({ page }) => {
      await dashboardPage.clickAgentManagement();
      await agentPage.clickAgent('Test Coder Agent');

      // Simulate task completion (in real scenario, this would happen automatically)
      await test.step('Complete task', async () => {
        await agentPage.clickTaskAction('Implement user authentication', 'complete');
        await expect(agentPage.getTaskStatus('Implement user authentication')).toContainText('Completed');
      });

      await test.step('View task results', async () => {
        await agentPage.clickTaskAction('Implement user authentication', 'view-results');
        await expect(agentPage.taskResultsModal).toBeVisible();
        await expect(agentPage.taskResultsModal).toContainText('Task completed successfully');
      });
    });
  });

  test.describe('Agent Performance Tracking', () => {
    test('should display agent metrics', async ({ page }) => {
      await dashboardPage.clickAgentManagement();
      await agentPage.clickAgent('Test Coder Agent');

      await test.step('View performance metrics', async () => {
        await agentPage.clickMetricsTab();
        await expect(agentPage.performanceMetrics).toBeVisible();
      });

      await test.step('Verify metrics data', async () => {
        await expect(agentPage.cpuUsageChart).toBeVisible();
        await expect(agentPage.memoryUsageChart).toBeVisible();
        await expect(agentPage.taskCompletionRate).toBeVisible();
        await expect(agentPage.averageResponseTime).toBeVisible();
      });
    });

    test('should show task history', async ({ page }) => {
      await dashboardPage.clickAgentManagement();
      await agentPage.clickAgent('Test Coder Agent');

      await test.step('View task history', async () => {
        await agentPage.clickHistoryTab();
        await expect(agentPage.taskHistory).toBeVisible();
      });

      await test.step('Filter task history', async () => {
        await agentPage.filterTaskHistory('completed');
        await expect(agentPage.taskHistoryItems).toHaveCount(1);

        await agentPage.filterTaskHistory('all');
        await expect(agentPage.taskHistoryItems.count()).toBeGreaterThan(1);
      });
    });

    test('should export agent performance data', async ({ page }) => {
      await dashboardPage.clickAgentManagement();
      await agentPage.clickAgent('Test Coder Agent');

      await test.step('Export performance data', async () => {
        await agentPage.clickMetricsTab();

        const downloadPromise = page.waitForEvent('download');
        await agentPage.clickExportMetrics();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/agent-metrics.*\.csv/);
      });
    });
  });

  test.describe('Agent Configuration Update', () => {
    test('should update agent configuration', async ({ page }) => {
      await dashboardPage.clickAgentManagement();

      await test.step('Open agent settings', async () => {
        await agentPage.clickAgentAction('Test Coder Agent', 'settings');
        await expect(agentPage.agentSettingsModal).toBeVisible();
      });

      await test.step('Update configuration', async () => {
        await agentPage.updateAgentConfig({
          maxMemory: '1GB',
          timeout: '60s',
          capabilities: ['javascript', 'testing', 'debugging', 'deployment']
        });
      });

      await test.step('Save configuration', async () => {
        await agentPage.saveAgentConfig();
        await expect(agentPage.successNotification).toContainText('Agent configuration updated');
      });

      await test.step('Verify configuration applied', async () => {
        // Configuration update might require agent restart
        await expect(agentPage.getAgentStatus('Test Coder Agent')).toContainText('Restarting');
        await expect(agentPage.getAgentStatus('Test Coder Agent')).toContainText('Ready', { timeout: 45000 });
      });
    });

    test('should validate configuration changes', async ({ page }) => {
      await dashboardPage.clickAgentManagement();
      await agentPage.clickAgentAction('Test Coder Agent', 'settings');

      await test.step('Test invalid memory setting', async () => {
        await agentPage.updateAgentConfig({
          maxMemory: 'invalid-value'
        });

        await agentPage.saveAgentConfig();
        await expect(agentPage.configError).toContainText('Invalid memory format');
      });

      await test.step('Test invalid timeout setting', async () => {
        await agentPage.updateAgentConfig({
          timeout: '0s'
        });

        await agentPage.saveAgentConfig();
        await expect(agentPage.configError).toContainText('Timeout must be greater than 0');
      });
    });
  });

  test.describe('Bulk Operations', () => {
    test('should perform bulk actions on agents', async ({ page }) => {
      await dashboardPage.clickAgentManagement();

      await test.step('Select multiple agents', async () => {
        await agentPage.selectAgent('Agent 1');
        await agentPage.selectAgent('Agent 2');
        await agentPage.selectAgent('Agent 3');

        await expect(agentPage.bulkActionBar).toBeVisible();
        await expect(agentPage.selectedAgentCount).toContainText('3 agents selected');
      });

      await test.step('Perform bulk start', async () => {
        await agentPage.clickBulkAction('start');
        await expect(agentPage.bulkActionProgress).toBeVisible();

        // Wait for all agents to start
        await expect(agentPage.bulkActionProgress).not.toBeVisible({ timeout: 60000 });
        await expect(agentPage.successNotification).toContainText('3 agents started successfully');
      });

      await test.step('Perform bulk stop', async () => {
        await agentPage.selectAllAgents();
        await agentPage.clickBulkAction('stop');

        // Confirm bulk action
        await expect(agentPage.bulkConfirmation).toBeVisible();
        await agentPage.confirmBulkAction();

        await expect(agentPage.successNotification).toContainText('All agents stopped successfully');
      });
    });
  });
});