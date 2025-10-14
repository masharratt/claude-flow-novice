const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');

/**
 * E2E Test for Web Portal Hybrid Routing Feature
 * 
 * This test validates:
 * 1. Portal startup and accessibility
 * 2. Worker spawning via spawn-workers.js CLI
 * 3. Navigation to Agents view
 * 4. Hybrid worker filtering functionality
 * 5. Worker metadata display (subtask, provider, confidence, cost, duration)
 * 6. Cost calculation verification (tokens × $0.50/1M)
 */

test.describe('Web Portal Hybrid Routing', () => {
  let portalProcess;
  let workerProcesses = [];
  
  // Test data for validation
  const expectedWorkerMetadata = {
    subtask: 'hybrid-routing-test',
    provider: 'claude-flow-novice',
    confidence: 0.85,
    tokens: 1000000, // 1M tokens
    expectedCost: 0.50, // $0.50 for 1M tokens
    duration: '< 2s'
  };

  test.beforeAll(async () => {
    console.log('🚀 Starting test setup...');
    
    // Start the web portal
    console.log('📡 Starting web portal...');
    portalProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.resolve(__dirname, '../../packages/web-portal'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '3000' }
    });

    // Wait for portal to be ready
    await new Promise((resolve, reject) => {
      let startupOutput = '';
      const timeout = setTimeout(() => {
        reject(new Error('Portal startup timeout'));
      }, 30000);

      portalProcess.stdout.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;
        console.log(`[Portal] ${output.trim()}`);
        
        if (output.includes('ready') || output.includes('3000') || output.includes('localhost')) {
          clearTimeout(timeout);
          setTimeout(resolve, 2000); // Give it extra time to fully initialize
        }
      });

      portalProcess.stderr.on('data', (data) => {
        console.error(`[Portal ERROR] ${data.toString().trim()}`);
      });

      portalProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('✅ Web portal started successfully');
  });

  test.afterAll(async () => {
    console.log('🧹 Cleaning up test processes...');
    
    // Kill worker processes
    workerProcesses.forEach(worker => {
      try {
        worker.kill('SIGTERM');
      } catch (error) {
        console.warn('Failed to kill worker process:', error.message);
      }
    });

    // Kill portal process
    if (portalProcess) {
      try {
        portalProcess.kill('SIGTERM');
      } catch (error) {
        console.warn('Failed to kill portal process:', error.message);
      }
    }

    // Wait for processes to clean up
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Cleanup completed');
  });

  test('should spawn hybrid workers and display them correctly', async ({ page }) => {
    console.log('🧪 Starting hybrid routing E2E test...');

    // Step 1: Navigate to the web portal
    console.log('🌐 Navigating to web portal...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    console.log('✅ Portal loaded successfully');

    // Step 2: Spawn 3 test workers via CLI
    console.log('👥 Spawning 3 hybrid workers...');
    const workerPromises = [];
    
    for (let i = 1; i <= 3; i++) {
      const workerPromise = new Promise((resolve, reject) => {
        const workerProcess = spawn('node', [
          path.resolve(__dirname, '../../spawn-workers.cjs'),
          '--mode', 'mvp',
          '--coordinator-id', `test-worker-${i}`,
          '--gate_threshold', '0.70',
          '--consensus_threshold', '0.80',
          '--validators', '2'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            COORDINATOR_ID: `test-worker-${i}`,
            BLOCKING_COORDINATION_SECRET: 'test-secret-key'
          }
        });

        let workerOutput = '';
        const startupTimeout = setTimeout(() => {
          reject(new Error(`Worker ${i} startup timeout`));
        }, 15000);

        workerProcess.stdout.on('data', (data) => {
          const output = data.toString();
          workerOutput += output;
          console.log(`[Worker-${i}] ${output.trim()}`);
          
          if (output.includes('spawned') || output.includes('running') || output.includes('registered')) {
            clearTimeout(startupTimeout);
            workerProcesses.push(workerProcess);
            resolve({ process: workerProcess, id: `test-worker-${i}` });
          }
        });

        workerProcess.stderr.on('data', (data) => {
          console.error(`[Worker-${i} ERROR] ${data.toString().trim()}`);
        });

        workerProcess.on('error', (error) => {
          clearTimeout(startupTimeout);
          reject(error);
        });
      });
      
      workerPromises.push(workerPromise);
    }

    // Wait for all workers to spawn
    const spawnedWorkers = await Promise.all(workerPromises);
    console.log(`✅ Successfully spawned ${spawnedWorkers.length} workers`);

    // Step 3: Navigate to Agents view
    console.log('🔍 Navigating to Agents view...');
    
    // Look for navigation menu and Agents link
    const agentsLink = page.locator('a[href*="agents"], a:has-text("Agents"), nav a:has-text("Agents")').first();
    await expect(agentsLink).toBeVisible({ timeout: 10000 });
    await agentsLink.click();
    
    // Wait for Agents view to load
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="agents-view"], .agents-view, #agents', { timeout: 10000 });
    console.log('✅ Navigated to Agents view');

    // Step 4: Verify 'Show Hybrid Workers' checkbox filter
    console.log('🎯 Looking for Hybrid Workers filter...');
    
    const hybridCheckbox = page.locator('input[type="checkbox"][data-testid="show-hybrid-workers"], input[name*="hybrid"], label:has-text("Show Hybrid Workers")').first();
    await expect(hybridCheckbox).toBeVisible({ timeout: 5000 });
    
    // Ensure the checkbox is checked to show hybrid workers
    if (!(await hybridCheckbox.isChecked())) {
      await hybridCheckbox.check();
    }
    
    await expect(hybridCheckbox).toBeChecked();
    console.log('✅ Hybrid Workers filter found and enabled');

    // Step 5: Verify workers appear within 2 seconds with correct metadata
    console.log('⏱️ Waiting for workers to appear in UI...');
    
    // Look for worker cards/rows in the agents view
    const workerSelector = '[data-testid="worker-card"], [data-testid="agent-row"], .worker-item, .agent-item';
    await page.waitForSelector(workerSelector, { timeout: 2000 });
    
    const workers = await page.locator(workerSelector).all();
    expect(workers.length).toBeGreaterThanOrEqual(3);
    console.log(`✅ Found ${workers.length} workers in UI`);

    // Verify metadata for each worker
    for (let i = 0; i < Math.min(3, workers.length); i++) {
      const worker = workers[i];
      
      // Check for subtask information
      const subtaskElement = worker.locator('[data-testid="subtask"], .subtask, [data-field="subtask"]').first();
      await expect(subtaskElement).toBeVisible();
      const subtaskText = await subtaskElement.textContent();
      expect(subtaskText).toContain('hybrid-routing');
      
      // Check for provider information
      const providerElement = worker.locator('[data-testid="provider"], .provider, [data-field="provider"]').first();
      await expect(providerElement).toBeVisible();
      
      // Check for confidence score
      const confidenceElement = worker.locator('[data-testid="confidence"], .confidence, [data-field="confidence"]').first();
      await expect(confidenceElement).toBeVisible();
      const confidenceText = await confidenceElement.textContent();
      expect(confidenceText).toMatch(/0\.\d+/);
      
      // Check for cost information
      const costElement = worker.locator('[data-testid="cost"], .cost, [data-field="cost"]').first();
      await expect(costElement).toBeVisible();
      const costText = await costElement.textContent();
      expect(costText).toMatch(/\$\d+\.\d+/);
      
      // Check for duration information
      const durationElement = worker.locator('[data-testid="duration"], .duration, [data-field="duration"]').first();
      await expect(durationElement).toBeVisible();
      
      console.log(`✅ Worker ${i + 1} metadata verified`);
    }

    // Step 6: Verify cost calculation (tokens × $0.50/1M)
    console.log('💰 Verifying cost calculations...');
    
    // Look for specific worker with known token count for cost verification
    const testWorker = workers[0];
    
    // Get token count and cost for verification
    const tokensElement = testWorker.locator('[data-testid="tokens"], .tokens, [data-field="tokens"]').first();
    const costElement = testWorker.locator('[data-testid="cost"], .cost, [data-field="cost"]').first();
    
    if (await tokensElement.isVisible()) {
      const tokensText = await tokensElement.textContent();
      const costText = await costElement.textContent();
      
      // Extract numeric values
      const tokensMatch = tokensText.match(/(\d+(?:,\d+)*)/);
      const costMatch = costText.match(/\$(\d+\.?\d*)/);
      
      if (tokensMatch && costMatch) {
        const tokens = parseInt(tokensMatch[1].replace(/,/g, ''));
        const actualCost = parseFloat(costMatch[1]);
        const expectedCost = (tokens / 1000000) * 0.50; // $0.50 per 1M tokens
        
        // Allow small floating point differences
        expect(Math.abs(actualCost - expectedCost)).toBeLessThan(0.01);
        console.log(`✅ Cost calculation verified: ${tokens} tokens → $${actualCost.toFixed(2)}`);
      }
    } else {
      console.log('ℹ️ Token information not available for cost verification');
    }

    console.log('🎉 Hybrid routing E2E test completed successfully!');
  });

  test('should handle hybrid worker filtering correctly', async ({ page }) => {
    console.log('🔄 Testing hybrid worker filtering functionality...');

    // Navigate to Agents view
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    const agentsLink = page.locator('a[href*="agents"], a:has-text("Agents"), nav a:has-text("Agents")').first();
    await expect(agentsLink).toBeVisible();
    await agentsLink.click();
    await page.waitForLoadState('networkidle');

    // Find and interact with hybrid workers filter
    const hybridCheckbox = page.locator('input[type="checkbox"][data-testid="show-hybrid-workers"], input[name*="hybrid"], label:has-text("Show Hybrid Workers")').first();
    await expect(hybridCheckbox).toBeVisible();

    // Test filtering - uncheck to hide hybrid workers
    await hybridCheckbox.uncheck();
    await expect(hybridCheckbox).not.toBeChecked();
    
    // Wait a moment for UI to update
    await page.waitForTimeout(1000);
    
    // Check if hybrid workers are hidden
    const hybridWorkers = page.locator('[data-hybrid="true"], .worker-hybrid, [data-provider*="hybrid"]');
    const visibleHybridWorkers = await hybridWorkers.filter({ has: page.locator(':visible') }).count();
    
    // Re-check to show hybrid workers
    await hybridCheckbox.check();
    await expect(hybridCheckbox).toBeChecked();
    
    // Wait for UI to update
    await page.waitForTimeout(1000);
    
    // Verify hybrid workers are visible again
    const visibleHybridWorkersAfter = await hybridWorkers.filter({ has: page.locator(':visible') }).count();
    expect(visibleHybridWorkersAfter).toBeGreaterThan(visibleHybridWorkers);
    
    console.log('✅ Hybrid worker filtering functionality verified');
  });
});