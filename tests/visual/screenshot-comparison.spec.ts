import { test, expect } from '@playwright/test';
import { VisualTestRunner } from '../utils/visual/visual-test-runner';
import { ScreenshotComparator } from '../utils/visual/screenshot-comparator';
import { BaselineManager } from '../utils/visual/baseline-manager';

/**
 * Automated Screenshot Comparison for UI Validation
 *
 * Comprehensive visual regression testing:
 * - Component-level screenshot comparison
 * - Cross-browser visual consistency
 * - Responsive design validation
 * - Dynamic content handling
 * - Visual diff analysis and reporting
 */

test.describe('Visual Regression Testing', () => {
  let visualTestRunner: VisualTestRunner;
  let screenshotComparator: ScreenshotComparator;
  let baselineManager: BaselineManager;

  test.beforeAll(async () => {
    visualTestRunner = new VisualTestRunner();
    screenshotComparator = new ScreenshotComparator();
    baselineManager = new BaselineManager();

    await baselineManager.initializeBaselines();
  });

  test.describe('Page-Level Visual Testing', () => {
    test('should validate dashboard visual consistency', async ({ page }) => {
      await test.step('Load dashboard and prepare for screenshot', async () => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // Hide dynamic content that changes between runs
        await page.addStyleTag({
          content: `
            [data-testid="current-time"] { visibility: hidden; }
            [data-testid="live-metrics"] { visibility: hidden; }
            .loading-spinner { display: none !important; }
          `
        });

        // Wait for all images to load
        await page.waitForFunction(() => {
          const images = Array.from(document.images);
          return images.every(img => img.complete);
        });
      });

      await test.step('Take full page screenshot', async () => {
        const screenshot = await visualTestRunner.takeFullPageScreenshot(page, {
          name: 'dashboard-full-page',
          mask: ['[data-testid="user-avatar"]', '[data-testid="last-login"]'],
          clip: { x: 0, y: 0, width: 1280, height: 1024 }
        });

        const comparison = await screenshotComparator.compareWithBaseline(
          'dashboard-full-page',
          screenshot,
          { threshold: 0.2 }
        );

        expect(comparison.pixelDiffCount).toBeLessThan(1000);
        expect(comparison.diffPercentage).toBeLessThan(5);
      });

      await test.step('Test specific dashboard components', async () => {
        const components = [
          { selector: '[data-testid="agent-status-widget"]', name: 'agent-status-widget' },
          { selector: '[data-testid="swarm-overview"]', name: 'swarm-overview' },
          { selector: '[data-testid="performance-metrics"]', name: 'performance-metrics' },
          { selector: '[data-testid="recent-activities"]', name: 'recent-activities' }
        ];

        for (const component of components) {
          const componentScreenshot = await visualTestRunner.takeComponentScreenshot(
            page,
            component.selector,
            { name: `dashboard-${component.name}` }
          );

          const componentComparison = await screenshotComparator.compareWithBaseline(
            `dashboard-${component.name}`,
            componentScreenshot
          );

          expect(componentComparison.diffPercentage).toBeLessThan(3);
        }
      });
    });

    test('should validate agent management interface', async ({ page }) => {
      await test.step('Take agent list screenshot', async () => {
        await page.goto('/agents');
        await page.waitForSelector('[data-testid="agent-list"]');

        // Ensure consistent data for visual testing
        await page.addInitScript(() => {
          window.VISUAL_TEST_MODE = true;
          window.MOCK_AGENTS = [
            { id: '1', name: 'Test Agent 1', type: 'coder', status: 'active' },
            { id: '2', name: 'Test Agent 2', type: 'tester', status: 'inactive' },
            { id: '3', name: 'Test Agent 3', type: 'reviewer', status: 'busy' }
          ];
        });

        await page.reload();
        await page.waitForSelector('[data-testid="agent-list"]');

        const agentListScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="agent-list"]',
          { name: 'agent-list-interface' }
        );

        const comparison = await screenshotComparator.compareWithBaseline(
          'agent-list-interface',
          agentListScreenshot
        );

        expect(comparison.diffPercentage).toBeLessThan(2);
      });

      await test.step('Test agent creation modal', async () => {
        await page.click('[data-testid="create-agent-button"]');
        await page.waitForSelector('[data-testid="agent-creation-modal"]');

        const modalScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="agent-creation-modal"]',
          { name: 'agent-creation-modal' }
        );

        const modalComparison = await screenshotComparator.compareWithBaseline(
          'agent-creation-modal',
          modalScreenshot
        );

        expect(modalComparison.diffPercentage).toBeLessThan(1);
      });
    });

    test('should validate swarm visualization', async ({ page }) => {
      await test.step('Test swarm topology visualization', async () => {
        await page.goto('/swarms/test-swarm');
        await page.waitForSelector('[data-testid="swarm-visualization"]');

        // Wait for visualization to fully render
        await page.waitForFunction(() => {
          const svg = document.querySelector('[data-testid="swarm-visualization"] svg');
          return svg && svg.children.length > 0;
        });

        const visualizationScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="swarm-visualization"]',
          { name: 'swarm-topology-visualization' }
        );

        const comparison = await screenshotComparator.compareWithBaseline(
          'swarm-topology-visualization',
          visualizationScreenshot,
          { threshold: 0.3 } // Allow some variance in SVG rendering
        );

        expect(comparison.diffPercentage).toBeLessThan(10); // SVGs can vary slightly
      });

      await test.step('Test swarm control panel', async () => {
        const controlPanelScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="swarm-control-panel"]',
          { name: 'swarm-control-panel' }
        );

        const controlComparison = await screenshotComparator.compareWithBaseline(
          'swarm-control-panel',
          controlPanelScreenshot
        );

        expect(controlComparison.diffPercentage).toBeLessThan(2);
      });
    });
  });

  test.describe('Cross-Browser Visual Consistency', () => {
    const browsers = ['chromium', 'firefox', 'webkit'];

    for (const browserName of browsers) {
      test(`should maintain visual consistency in ${browserName}`, async ({ page }) => {
        // Skip if not running the specific browser
        if (!test.info().project.name.toLowerCase().includes(browserName)) {
          test.skip();
        }

        await test.step('Test dashboard consistency across browsers', async () => {
          await page.goto('/dashboard');
          await page.waitForLoadState('networkidle');

          const dashboardScreenshot = await visualTestRunner.takeFullPageScreenshot(page, {
            name: `dashboard-${browserName}`,
            fullPage: false,
            clip: { x: 0, y: 0, width: 1280, height: 720 }
          });

          // Compare with Chromium baseline (assuming it's the reference)
          if (browserName !== 'chromium') {
            const crossBrowserComparison = await screenshotComparator.compareCrossBrowser(
              'dashboard-chromium',
              `dashboard-${browserName}`,
              dashboardScreenshot
            );

            expect(crossBrowserComparison.diffPercentage).toBeLessThan(5);
          }
        });

        await test.step('Test form rendering consistency', async () => {
          await page.goto('/agents/create');
          await page.waitForSelector('[data-testid="agent-form"]');

          const formScreenshot = await visualTestRunner.takeComponentScreenshot(
            page,
            '[data-testid="agent-form"]',
            { name: `agent-form-${browserName}` }
          );

          if (browserName !== 'chromium') {
            const formComparison = await screenshotComparator.compareCrossBrowser(
              'agent-form-chromium',
              `agent-form-${browserName}`,
              formScreenshot
            );

            expect(formComparison.diffPercentage).toBeLessThan(3);
          }
        });
      });
    }
  });

  test.describe('Responsive Design Visual Testing', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 },
      { name: 'ultrawide', width: 3440, height: 1440 }
    ];

    for (const viewport of viewports) {
      test(`should render correctly on ${viewport.name} viewport`, async ({ page }) => {
        await test.step('Set viewport and navigate', async () => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.goto('/dashboard');
          await page.waitForLoadState('networkidle');
        });

        await test.step('Test responsive layout', async () => {
          const responsiveScreenshot = await visualTestRunner.takeFullPageScreenshot(page, {
            name: `dashboard-${viewport.name}`,
            fullPage: false,
            clip: { x: 0, y: 0, width: viewport.width, height: viewport.height }
          });

          const responsiveComparison = await screenshotComparator.compareWithBaseline(
            `dashboard-${viewport.name}`,
            responsiveScreenshot
          );

          expect(responsiveComparison.diffPercentage).toBeLessThan(3);
        });

        await test.step('Test navigation menu responsiveness', async () => {
          const navScreenshot = await visualTestRunner.takeComponentScreenshot(
            page,
            '[data-testid="navigation"]',
            { name: `navigation-${viewport.name}` }
          );

          const navComparison = await screenshotComparator.compareWithBaseline(
            `navigation-${viewport.name}`,
            navScreenshot
          );

          expect(navComparison.diffPercentage).toBeLessThan(2);
        });

        await test.step('Test mobile-specific interactions', async () => {
          if (viewport.name === 'mobile') {
            // Test mobile menu if present
            const mobileMenuExists = await page.isVisible('[data-testid="mobile-menu-toggle"]');

            if (mobileMenuExists) {
              await page.click('[data-testid="mobile-menu-toggle"]');
              await page.waitForSelector('[data-testid="mobile-menu"]');

              const mobileMenuScreenshot = await visualTestRunner.takeComponentScreenshot(
                page,
                '[data-testid="mobile-menu"]',
                { name: 'mobile-menu-expanded' }
              );

              const mobileMenuComparison = await screenshotComparator.compareWithBaseline(
                'mobile-menu-expanded',
                mobileMenuScreenshot
              );

              expect(mobileMenuComparison.diffPercentage).toBeLessThan(2);
            }
          }
        });
      });
    }
  });

  test.describe('Dynamic Content Visual Testing', () => {
    test('should handle loading states consistently', async ({ page }) => {
      await test.step('Test loading spinner appearance', async () => {
        await page.goto('/agents');

        // Intercept API call to simulate slow loading
        await page.route('/api/agents', route => {
          setTimeout(() => route.continue(), 2000);
        });

        // Reload to trigger loading state
        await page.reload();
        await page.waitForSelector('[data-testid="loading-spinner"]');

        const loadingScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="loading-container"]',
          { name: 'loading-state-agents' }
        );

        const loadingComparison = await screenshotComparator.compareWithBaseline(
          'loading-state-agents',
          loadingScreenshot
        );

        expect(loadingComparison.diffPercentage).toBeLessThan(1);
      });
    });

    test('should handle error states consistently', async ({ page }) => {
      await test.step('Test API error state', async () => {
        await page.route('/api/agents', route => {
          route.fulfill({ status: 500, contentType: 'application/json', body: '{"error": "Server error"}' });
        });

        await page.goto('/agents');
        await page.waitForSelector('[data-testid="error-state"]');

        const errorScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="error-state"]',
          { name: 'error-state-agents' }
        );

        const errorComparison = await screenshotComparator.compareWithBaseline(
          'error-state-agents',
          errorScreenshot
        );

        expect(errorComparison.diffPercentage).toBeLessThan(1);
      });
    });

    test('should handle empty states consistently', async ({ page }) => {
      await test.step('Test empty agent list', async () => {
        await page.route('/api/agents', route => {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{"agents": []}' });
        });

        await page.goto('/agents');
        await page.waitForSelector('[data-testid="empty-state"]');

        const emptyScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="empty-state"]',
          { name: 'empty-state-agents' }
        );

        const emptyComparison = await screenshotComparator.compareWithBaseline(
          'empty-state-agents',
          emptyScreenshot
        );

        expect(emptyComparison.diffPercentage).toBeLessThan(1);
      });
    });
  });

  test.describe('Component State Visual Testing', () => {
    test('should validate button states', async ({ page }) => {
      await page.goto('/agents/create');

      const buttonStates = ['default', 'hover', 'active', 'disabled'];

      for (const state of buttonStates) {
        await test.step(`Test ${state} button state`, async () => {
          const button = page.locator('[data-testid="submit-button"]');

          // Apply state
          switch (state) {
            case 'hover':
              await button.hover();
              break;
            case 'active':
              await button.focus();
              break;
            case 'disabled':
              await page.evaluate(() => {
                const btn = document.querySelector('[data-testid="submit-button"]');
                btn.disabled = true;
              });
              break;
          }

          const buttonScreenshot = await visualTestRunner.takeComponentScreenshot(
            page,
            '[data-testid="submit-button"]',
            { name: `button-${state}` }
          );

          const buttonComparison = await screenshotComparator.compareWithBaseline(
            `button-${state}`,
            buttonScreenshot
          );

          expect(buttonComparison.diffPercentage).toBeLessThan(1);
        });
      }
    });

    test('should validate form validation states', async ({ page }) => {
      await page.goto('/agents/create');

      await test.step('Test valid form state', async () => {
        await page.fill('[name="name"]', 'Valid Agent Name');
        await page.selectOption('[name="type"]', 'coder');

        const validFormScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="agent-form"]',
          { name: 'form-state-valid' }
        );

        const validComparison = await screenshotComparator.compareWithBaseline(
          'form-state-valid',
          validFormScreenshot
        );

        expect(validComparison.diffPercentage).toBeLessThan(2);
      });

      await test.step('Test invalid form state', async () => {
        await page.fill('[name="name"]', ''); // Invalid: empty name
        await page.click('[data-testid="submit-button"]');
        await page.waitForSelector('[data-testid="validation-error"]');

        const invalidFormScreenshot = await visualTestRunner.takeComponentScreenshot(
          page,
          '[data-testid="agent-form"]',
          { name: 'form-state-invalid' }
        );

        const invalidComparison = await screenshotComparator.compareWithBaseline(
          'form-state-invalid',
          invalidFormScreenshot
        );

        expect(invalidComparison.diffPercentage).toBeLessThan(2);
      });
    });
  });

  test.describe('Theme and Styling Visual Testing', () => {
    test('should validate dark theme consistency', async ({ page }) => {
      await test.step('Enable dark theme', async () => {
        await page.goto('/dashboard');
        await page.click('[data-testid="theme-toggle"]');
        await page.waitForSelector('[data-theme="dark"]');
      });

      await test.step('Test dark theme dashboard', async () => {
        const darkThemeScreenshot = await visualTestRunner.takeFullPageScreenshot(page, {
          name: 'dashboard-dark-theme',
          fullPage: false,
          clip: { x: 0, y: 0, width: 1280, height: 720 }
        });

        const darkThemeComparison = await screenshotComparator.compareWithBaseline(
          'dashboard-dark-theme',
          darkThemeScreenshot
        );

        expect(darkThemeComparison.diffPercentage).toBeLessThan(3);
      });

      await test.step('Test dark theme components', async () => {
        const components = [
          { selector: '[data-testid="navigation"]', name: 'navigation-dark' },
          { selector: '[data-testid="agent-status-widget"]', name: 'widget-dark' }
        ];

        for (const component of components) {
          const componentScreenshot = await visualTestRunner.takeComponentScreenshot(
            page,
            component.selector,
            { name: component.name }
          );

          const componentComparison = await screenshotComparator.compareWithBaseline(
            component.name,
            componentScreenshot
          );

          expect(componentComparison.diffPercentage).toBeLessThan(2);
        }
      });
    });

    test('should validate high contrast mode', async ({ page }) => {
      await test.step('Enable high contrast mode', async () => {
        await page.goto('/dashboard');
        await page.addStyleTag({
          content: `
            :root {
              --contrast-ratio: 7:1;
              --primary-color: #000000;
              --background-color: #ffffff;
              --text-color: #000000;
            }
          `
        });
      });

      await test.step('Test high contrast dashboard', async () => {
        const highContrastScreenshot = await visualTestRunner.takeFullPageScreenshot(page, {
          name: 'dashboard-high-contrast',
          fullPage: false,
          clip: { x: 0, y: 0, width: 1280, height: 720 }
        });

        const contrastComparison = await screenshotComparator.compareWithBaseline(
          'dashboard-high-contrast',
          highContrastScreenshot
        );

        expect(contrastComparison.diffPercentage).toBeLessThan(5);
      });
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Capture failure screenshot for analysis
    if (testInfo.status !== testInfo.expectedStatus) {
      const failureScreenshot = await page.screenshot({
        path: `test-results/failures/${testInfo.title}-failure.png`,
        fullPage: true
      });

      await visualTestRunner.analyzeFailureScreenshot({
        testName: testInfo.title,
        screenshot: failureScreenshot,
        error: testInfo.error?.message
      });
    }
  });

  test.afterAll(async () => {
    // Generate visual test report
    const visualReport = await visualTestRunner.generateVisualTestReport();

    // Update baselines if tests pass and UPDATE_BASELINES is set
    if (process.env.UPDATE_BASELINES === 'true') {
      await baselineManager.updateVisualBaselines();
    }

    // Generate diff gallery for manual review
    await screenshotComparator.generateDiffGallery();

    // Cleanup temporary screenshots
    await visualTestRunner.cleanup();
  });
});