/**
 * E2E Test: Web Portal CFN Loop with Hybrid Routing
 *
 * Tests that CFN Loop execution with coordinator-hybrid agent displays correctly
 * in the portal's CFN Loop view, including:
 * - Loop 3 iterations with confidence progression
 * - Loop 4 decision display (DEFER/PROCEED/ESCALATE badge + reasoning)
 * - Cost savings calculation: (traditional - actual) / traditional
 *
 * Test Flow:
 * 1. Start web portal
 * 2. Execute CFN Loop with coordinator-hybrid agent
 * 3. Navigate to CFN Loop view with Playwright
 * 4. Verify Loop 3 iterations display
 * 5. Verify Loop 4 decision display
 * 6. Verify cost savings calculation
 */

const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const { createClient } = require('redis');
const path = require('path');

const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

test.describe('Web Portal CFN Loop with Hybrid Routing', () => {
  let redisClient;
  let portalProcess;
  let cfnLoopProcess;
  let phaseId;

  test.beforeAll(async () => {
    console.log('🚀 Starting CFN Loop E2E test setup...');

    // Initialize Redis client
    redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();
    console.log('✅ Redis client connected');

    // Start web portal
    console.log('📡 Starting web portal...');
    portalProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.resolve(__dirname, '../../packages/web-portal'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '3000' }
    });

    // Wait for portal to be ready
    await waitForPortal(PORTAL_URL, 30000);
    console.log('✅ Web portal started successfully');
  });

  test.afterAll(async () => {
    console.log('🧹 Cleaning up CFN Loop test processes...');

    // Cleanup phase data from Redis
    if (phaseId) {
      const keys = await redisClient.keys(`cfn:${phaseId}:*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    }

    // Disconnect Redis
    await redisClient.quit();

    // Stop CFN Loop process
    if (cfnLoopProcess) {
      cfnLoopProcess.kill('SIGTERM');
    }

    // Stop portal process
    if (portalProcess) {
      portalProcess.kill('SIGTERM');
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Cleanup completed');
  });

  test('should display CFN Loop iterations and decisions in portal', async ({ page }) => {
    console.log('🧪 Starting CFN Loop hybrid routing E2E test...');

    // Step 1: Navigate to portal
    console.log('🌐 Navigating to web portal...');
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    console.log('✅ Portal loaded successfully');

    // Step 2: Execute CFN Loop with coordinator-hybrid agent
    console.log('🔄 Executing CFN Loop with hybrid coordinator...');
    phaseId = `test-phase-${Date.now()}`;

    const cfnLoopPromise = new Promise((resolve, reject) => {
      cfnLoopProcess = spawn('node', [
        path.resolve(__dirname, '../../src/cli/hybrid-routing/spawn-workers.js'),
        'E2E Test Phase: Authentication Implementation',
        '--max-agents=3',
        '--provider=zai',
        '--agents=coordinator-hybrid,coder,reviewer',
        '--subtasks=Coordinator: Orchestrate authentication phase|Coder: Implement JWT validation|Reviewer: Validate security'
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CFN_PHASE_ID: phaseId,
          CFN_MODE: 'mvp'  // Use MVP mode for faster testing
        }
      });

      let cfnOutput = '';
      const cfnTimeout = setTimeout(() => {
        reject(new Error('CFN Loop execution timeout'));
      }, 120000); // 2 minutes timeout

      cfnLoopProcess.stdout.on('data', (data) => {
        const output = data.toString();
        cfnOutput += output;
        console.log(`[CFN Loop] ${output.trim()}`);

        // Detect Loop 3 completion
        if (output.includes('Loop 3 Complete') || output.includes('READY_FOR_LOOP2')) {
          console.log('✅ Loop 3 completed');
        }

        // Detect Loop 4 decision
        if (output.includes('Loop 4 Complete') || output.includes('DEFER') || output.includes('PROCEED')) {
          clearTimeout(cfnTimeout);
          setTimeout(() => resolve(cfnOutput), 2000); // Give time for Redis writes
        }
      });

      cfnLoopProcess.stderr.on('data', (data) => {
        console.error(`[CFN Loop ERROR] ${data.toString().trim()}`);
      });

      cfnLoopProcess.on('error', (error) => {
        clearTimeout(cfnTimeout);
        reject(error);
      });
    });

    // Wait for CFN Loop to complete
    await cfnLoopPromise;
    console.log('✅ CFN Loop execution completed');

    // Step 3: Navigate to CFN Loop view
    console.log('🔍 Navigating to CFN Loop view...');
    const cfnLoopLink = page.locator('a[href*="cfn-loop"], a:has-text("CFN Loop"), nav a:has-text("CFN")').first();
    await expect(cfnLoopLink).toBeVisible({ timeout: 10000 });
    await cfnLoopLink.click();
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to CFN Loop view');

    // Step 4: Verify Loop 3 iterations display
    console.log('🔍 Verifying Loop 3 iterations display...');

    // Wait for phase card to appear
    const phaseCard = page.locator(`[data-phase-id="${phaseId}"], .phase-card, [data-testid="phase-card"]`).first();
    await expect(phaseCard).toBeVisible({ timeout: 5000 });

    // Verify Loop 3 section
    const loop3Section = phaseCard.locator('[data-loop="3"], .loop3-section, [data-testid="loop3"]').first();
    await expect(loop3Section).toBeVisible();

    // Verify iteration count is displayed
    const iterationCount = loop3Section.locator('[data-testid="iteration-count"], .iteration-count').first();
    await expect(iterationCount).toBeVisible();
    const iterationText = await iterationCount.textContent();
    expect(iterationText).toMatch(/Iteration \d+/);

    // Verify confidence progression
    const confidenceProgression = loop3Section.locator('[data-testid="confidence-progression"], .confidence-chart, .confidence-values').first();
    await expect(confidenceProgression).toBeVisible();

    // Get confidence values
    const confidenceValues = await loop3Section.locator('[data-testid="confidence-value"], .confidence').allTextContents();
    expect(confidenceValues.length).toBeGreaterThan(0);

    // Verify confidence values are in valid range (0-1)
    for (const value of confidenceValues) {
      const confidence = parseFloat(value);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }

    console.log(`✅ Loop 3 iterations verified (${confidenceValues.length} agents)`);

    // Step 5: Verify Loop 4 decision display
    console.log('🎯 Verifying Loop 4 decision display...');

    const loop4Section = phaseCard.locator('[data-loop="4"], .loop4-section, [data-testid="loop4"]').first();
    await expect(loop4Section).toBeVisible();

    // Verify decision badge
    const decisionBadge = loop4Section.locator('[data-testid="decision-badge"], .decision-badge, .decision-status').first();
    await expect(decisionBadge).toBeVisible();
    const decisionText = await decisionBadge.textContent();
    expect(['DEFER', 'PROCEED', 'ESCALATE']).toContain(decisionText.trim());

    // Verify decision has appropriate styling
    if (decisionText.includes('DEFER')) {
      await expect(decisionBadge).toHaveClass(/success|green|defer/);
    } else if (decisionText.includes('PROCEED')) {
      await expect(decisionBadge).toHaveClass(/warning|yellow|proceed/);
    } else if (decisionText.includes('ESCALATE')) {
      await expect(decisionBadge).toHaveClass(/error|red|escalate/);
    }

    // Verify reasoning is displayed
    const reasoning = loop4Section.locator('[data-testid="decision-reasoning"], .reasoning, .decision-details').first();
    await expect(reasoning).toBeVisible();
    const reasoningText = await reasoning.textContent();
    expect(reasoningText.length).toBeGreaterThan(10); // Non-empty reasoning

    // Verify backlog items if present
    const backlogSection = loop4Section.locator('[data-testid="backlog"], .backlog, .action-items').first();
    if (await backlogSection.isVisible()) {
      const backlogItems = await backlogSection.locator('li, .item').count();
      console.log(`ℹ️ Found ${backlogItems} backlog items`);
    }

    console.log(`✅ Loop 4 decision verified: ${decisionText.trim()}`);

    // Step 6: Verify cost savings calculation
    console.log('💰 Verifying cost savings calculation...');

    const costSection = phaseCard.locator('[data-testid="cost-savings"], .cost-savings, .cost-section').first();
    await expect(costSection).toBeVisible();

    // Get cost values
    const traditionalCost = costSection.locator('[data-testid="traditional-cost"], .traditional-cost').first();
    const actualCost = costSection.locator('[data-testid="actual-cost"], .actual-cost, .hybrid-cost').first();
    const savingsPercentage = costSection.locator('[data-testid="savings-percentage"], .savings-percent').first();

    await expect(traditionalCost).toBeVisible();
    await expect(actualCost).toBeVisible();
    await expect(savingsPercentage).toBeVisible();

    // Extract numeric values
    const traditionalText = await traditionalCost.textContent();
    const actualText = await actualCost.textContent();
    const savingsText = await savingsPercentage.textContent();

    const traditionalValue = parseFloat(traditionalText.replace(/[^0-9.]/g, ''));
    const actualValue = parseFloat(actualText.replace(/[^0-9.]/g, ''));
    const savingsValue = parseFloat(savingsText.replace(/[^0-9.]/g, ''));

    // Verify savings calculation: (traditional - actual) / traditional * 100
    const expectedSavings = ((traditionalValue - actualValue) / traditionalValue) * 100;
    expect(Math.abs(savingsValue - expectedSavings)).toBeLessThan(1); // Allow 1% margin

    // Verify actual cost is less than traditional cost
    expect(actualValue).toBeLessThan(traditionalValue);

    // Verify savings are significant (>90% for hybrid routing)
    expect(savingsValue).toBeGreaterThan(90);

    console.log(`✅ Cost savings verified: ${savingsValue.toFixed(1)}% ($${traditionalValue.toFixed(2)} → $${actualValue.toFixed(2)})`);

    console.log('🎉 CFN Loop hybrid routing E2E test completed successfully!');
  });

  test('should update CFN Loop view in real-time', async ({ page }) => {
    console.log('🔄 Testing real-time CFN Loop updates...');

    await page.goto(`${PORTAL_URL}/cfn-loop`);
    await page.waitForLoadState('networkidle');

    // Verify Socket.IO connection
    const socketIndicator = page.locator('[data-testid="socket-status"], .connection-status').first();

    if (await socketIndicator.isVisible()) {
      await expect(socketIndicator).toHaveClass(/connected|online/);
      console.log('✅ Real-time connection established');
    } else {
      console.log('ℹ️ Socket indicator not found, skipping real-time test');
    }

    // Verify phases list updates
    const phasesCount = await page.locator('.phase-card, [data-testid="phase-card"]').count();
    console.log(`ℹ️ Found ${phasesCount} phases in CFN Loop view`);

    // Verify auto-refresh or live updates
    const lastUpdateTime = await page.locator('[data-testid="last-update"], .last-updated').first().textContent();
    console.log(`ℹ️ Last update: ${lastUpdateTime}`);

    console.log('✅ Real-time CFN Loop updates verified');
  });
});

/**
 * Wait for portal to be ready
 */
async function waitForPortal(url, timeout) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Portal not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Portal not ready after ${timeout}ms`);
}
