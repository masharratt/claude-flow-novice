/**
 * @file Web Portal Page Object
 * @description Page object model for web portal interactions
 */

import { Page, Locator, expect } from '@playwright/test';

export class WebPortalPage {
  private page: Page;

  // Login elements
  private loginForm: Locator;
  private usernameInput: Locator;
  private passwordInput: Locator;
  private loginButton: Locator;

  // Dashboard elements
  private userMenu: Locator;
  private systemStats: Locator;
  private swarmsPanel: Locator;
  private agentsPanel: Locator;
  private messagesPanel: Locator;
  private mcpToolsPanel: Locator;
  private transparencyLog: Locator;
  private interventionPanel: Locator;

  constructor(page: Page) {
    this.page = page;

    // Login selectors
    this.loginForm = page.locator('#loginForm');
    this.usernameInput = page.locator('[data-testid="username"]');
    this.passwordInput = page.locator('[data-testid="password"]');
    this.loginButton = page.locator('[data-testid="login-button"]');

    // Dashboard selectors
    this.userMenu = page.locator('[data-testid="user-menu"]');
    this.systemStats = page.locator('[data-testid="system-stats"]');
    this.swarmsPanel = page.locator('[data-testid="swarms-panel"]');
    this.agentsPanel = page.locator('[data-testid="agents-panel"]');
    this.messagesPanel = page.locator('[data-testid="messages-panel"]');
    this.mcpToolsPanel = page.locator('[data-testid="mcp-tools-panel"]');
    this.transparencyLog = page.locator('[data-testid="transparency-log"]');
    this.interventionPanel = page.locator('[data-testid="intervention-panel"]');
  }

  /**
   * Navigate to the web portal
   */
  async goto(url?: string): Promise<void> {
    const targetUrl = url || process.env.TEST_SERVER_URL || 'http://localhost:3000';
    await this.page.goto(targetUrl);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Perform login with credentials
   */
  async login(username: string = 'test-admin', password: string = 'test-password'): Promise<void> {
    // Wait for login form to be visible
    await expect(this.loginForm).toBeVisible({ timeout: 10000 });

    // Fill credentials
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);

    // Submit login
    await this.loginButton.click();

    // Wait for successful login
    await this.waitForDashboard();
  }

  /**
   * Wait for dashboard to load completely
   */
  async waitForDashboard(): Promise<void> {
    // Wait for user menu (indicates successful login)
    await expect(this.userMenu).toBeVisible({ timeout: 15000 });

    // Wait for main dashboard components
    await expect(this.systemStats).toBeVisible({ timeout: 10000 });
    await expect(this.swarmsPanel).toBeVisible({ timeout: 10000 });
    await expect(this.agentsPanel).toBeVisible({ timeout: 10000 });

    // Wait for WebSocket connection
    await this.page.waitForTimeout(2000);

    // Verify WebSocket is connected
    const isWebSocketConnected = await this.page.evaluate(() => {
      return window.socket ? window.socket.connected : false;
    });

    if (!isWebSocketConnected) {
      console.warn('WebSocket connection not established, tests may have limited real-time functionality');
    }
  }

  /**
   * Logout from the application
   */
  async logout(): Promise<void> {
    await this.userMenu.locator('button:has-text("Logout")').click();
    await expect(this.loginForm).toBeVisible({ timeout: 5000 });
  }

  /**
   * Get current system statistics
   */
  async getSystemStats(): Promise<{
    activeSwarms: number;
    activeAgents: number;
    runningTasks: number;
    completedTasks: number;
  }> {
    await expect(this.systemStats).toBeVisible();

    const stats = await this.systemStats.evaluate((el) => {
      const getValue = (id: string) => {
        const element = el.querySelector(`#${id}`);
        return parseInt(element?.textContent || '0', 10);
      };

      return {
        activeSwarms: getValue('activeSwarms'),
        activeAgents: getValue('activeAgents'),
        runningTasks: getValue('runningTasks'),
        completedTasks: getValue('completedTasks')
      };
    });

    return stats;
  }

  /**
   * Get list of active swarms
   */
  async getActiveSwarms(): Promise<Array<{ name: string; status: string; id: string }>> {
    await expect(this.swarmsPanel).toBeVisible();

    const swarms = await this.swarmsPanel.locator('.swarm-item').evaluateAll((items) => {
      return items.map(item => {
        const nameEl = item.querySelector('.swarm-name');
        const statusEl = item.querySelector('.swarm-status');
        const testId = item.getAttribute('data-testid') || '';

        return {
          name: nameEl?.textContent || '',
          status: statusEl?.textContent || '',
          id: testId.replace('swarm-', '')
        };
      });
    });

    return swarms;
  }

  /**
   * Get list of agents and their statuses
   */
  async getAgentStatuses(): Promise<Array<{ name: string; status: string; id: string }>> {
    await expect(this.agentsPanel).toBeVisible();

    const agents = await this.agentsPanel.locator('.agent-item').evaluateAll((items) => {
      return items.map(item => {
        const nameEl = item.querySelector('span:first-child');
        const statusEl = item.querySelector('.agent-status');
        const testId = item.getAttribute('data-testid') || '';

        return {
          name: nameEl?.textContent || '',
          status: statusEl?.textContent || '',
          id: testId.replace('agent-', '')
        };
      });
    });

    return agents;
  }

  /**
   * Get recent agent messages
   */
  async getRecentMessages(limit: number = 10): Promise<Array<{
    agent: string;
    message: string;
    time: string;
  }>> {
    await expect(this.messagesPanel).toBeVisible();

    const messages = await this.messagesPanel.locator('.message-item').evaluateAll((items, limit) => {
      return items.slice(0, limit).map(item => {
        const agentEl = item.querySelector('.message-agent');
        const textEl = item.querySelector('.message-text');
        const timeEl = item.querySelector('.message-time');

        return {
          agent: agentEl?.textContent || '',
          message: textEl?.textContent || '',
          time: timeEl?.textContent || ''
        };
      });
    }, limit);

    return messages;
  }

  /**
   * Wait for specific message to appear
   */
  async waitForMessage(messageText: string, timeout: number = 10000): Promise<void> {
    const messageLocator = this.messagesPanel.locator('.message-text').filter({
      hasText: messageText
    });

    await expect(messageLocator).toBeVisible({ timeout });
  }

  /**
   * Execute an MCP tool
   */
  async executeMcpTool(toolName: string): Promise<void> {
    await expect(this.mcpToolsPanel).toBeVisible();

    const toolButton = this.mcpToolsPanel.locator(`[data-tool="${toolName}"]`);
    await expect(toolButton).toBeVisible();
    await expect(toolButton).toBeEnabled();

    // Click the tool
    await toolButton.click();

    // Wait for execution state
    await expect(toolButton).toHaveText('Executing...');
    await expect(toolButton).toBeDisabled();

    // Wait for completion
    await expect(toolButton).toHaveText('Execute', { timeout: 15000 });
    await expect(toolButton).toBeEnabled();
  }

  /**
   * Handle human intervention
   */
  async handleIntervention(optionId: string, needMoreInfo: boolean = false): Promise<void> {
    // Wait for intervention panel to appear
    await expect(this.interventionPanel).toBeVisible({ timeout: 15000 });

    if (needMoreInfo) {
      await this.interventionPanel.locator('#needMoreInfo').click();
    } else {
      // Select option
      await this.interventionPanel.locator(`[data-option="${optionId}"]`).click();

      // Submit decision
      await this.interventionPanel.locator('#submitDecision').click();

      // Wait for panel to disappear
      await expect(this.interventionPanel).toBeHidden({ timeout: 10000 });
    }
  }

  /**
   * Get audit log entries
   */
  async getAuditLogEntries(limit: number = 20): Promise<Array<{
    action: string;
    timestamp: string;
    details: string;
  }>> {
    await expect(this.transparencyLog).toBeVisible();

    const entries = await this.transparencyLog.locator('.log-entry').evaluateAll((items, limit) => {
      return items.slice(0, limit).map(item => {
        const actionEl = item.querySelector('.log-action');
        const timestampEl = item.querySelector('.log-timestamp');
        const detailsEl = item.querySelector('.log-details');

        return {
          action: actionEl?.textContent || '',
          timestamp: timestampEl?.textContent || '',
          details: detailsEl?.textContent || ''
        };
      });
    }, limit);

    return entries;
  }

  /**
   * Wait for audit log entry with specific action
   */
  async waitForAuditLogEntry(action: string, timeout: number = 10000): Promise<void> {
    const logEntry = this.transparencyLog.locator('.log-action').filter({
      hasText: action
    });

    await expect(logEntry).toBeVisible({ timeout });
  }

  /**
   * Verify WebSocket connection status
   */
  async verifyWebSocketConnection(): Promise<boolean> {
    return await this.page.evaluate(() => {
      return window.socket ? window.socket.connected : false;
    });
  }

  /**
   * Simulate WebSocket disconnection
   */
  async simulateWebSocketDisconnection(): Promise<void> {
    await this.page.evaluate(() => {
      if (window.socket) {
        window.socket.disconnect();
      }
    });
  }

  /**
   * Simulate WebSocket reconnection
   */
  async simulateWebSocketReconnection(): Promise<void> {
    await this.page.evaluate(() => {
      if (window.socket) {
        window.socket.connect();
      }
    });

    // Wait for reconnection
    await this.page.waitForTimeout(2000);
  }

  /**
   * Get current page title
   */
  async getPageTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Take a screenshot for debugging
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true
    });
  }

  /**
   * Wait for loading states to complete
   */
  async waitForLoadingComplete(): Promise<void> {
    await this.page.waitForLoadState('networkidle');

    // Wait for any loading spinners or indicators to disappear
    const loadingSelectors = ['.loading', '.spinner', '[data-loading="true"]'];

    for (const selector of loadingSelectors) {
      const loadingElement = this.page.locator(selector);
      if (await loadingElement.isVisible().catch(() => false)) {
        await expect(loadingElement).toBeHidden({ timeout: 10000 });
      }
    }
  }

  /**
   * Check if element is visible
   */
  async isElementVisible(selector: string): Promise<boolean> {
    try {
      const element = this.page.locator(selector);
      return await element.isVisible();
    } catch {
      return false;
    }
  }

  /**
   * Scroll element into view
   */
  async scrollIntoView(selector: string): Promise<void> {
    const element = this.page.locator(selector);
    await element.scrollIntoViewIfNeeded();
  }

  /**
   * Wait for element to be stable (not moving)
   */
  async waitForElementStable(selector: string, timeout: number = 5000): Promise<void> {
    const element = this.page.locator(selector);
    await expect(element).toBeVisible();

    // Wait for element to be stable
    await element.waitFor({ state: 'stable', timeout });
  }

  /**
   * Get console errors from the page
   */
  async getConsoleErrors(): Promise<string[]> {
    return await this.page.evaluate(() => {
      return window.consoleErrors || [];
    });
  }

  /**
   * Clear any existing console errors
   */
  async clearConsoleErrors(): Promise<void> {
    await this.page.evaluate(() => {
      window.consoleErrors = [];
    });
  }
}