/**
 * @file Test Helper Functions
 * @description Utility functions for Playwright tests
 */

import { Page, expect } from '@playwright/test';

export class TestHelpers {
  /**
   * Wait for element to be stable (not animating)
   */
  static async waitForElementStable(page: Page, selector: string, timeout = 5000): Promise<void> {
    const element = page.locator(selector);
    await element.waitFor({ state: 'visible', timeout });

    let previousRect = await element.boundingBox();
    let stableCount = 0;
    const requiredStableCount = 3;

    while (stableCount < requiredStableCount) {
      await page.waitForTimeout(100);
      const currentRect = await element.boundingBox();

      if (
        previousRect &&
        currentRect &&
        previousRect.x === currentRect.x &&
        previousRect.y === currentRect.y &&
        previousRect.width === currentRect.width &&
        previousRect.height === currentRect.height
      ) {
        stableCount++;
      } else {
        stableCount = 0;
      }

      previousRect = currentRect;
    }
  }

  /**
   * Wait for all network requests to complete
   */
  static async waitForNetworkIdle(page: Page, timeout = 10000): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * Clear browser cache and cookies
   */
  static async clearBrowserData(page: Page): Promise<void> {
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }

  /**
   * Inject test utilities into page context
   */
  static async injectTestUtilities(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Global test utilities
      window.testUtils = {
        // Performance monitoring
        performanceMetrics: {
          startTime: performance.now(),
          markers: new Map<string, number>(),
          measurements: new Map<string, number>()
        },

        // Mark performance point
        mark: (name: string) => {
          const time = performance.now();
          window.testUtils.performanceMetrics.markers.set(name, time);
          return time;
        },

        // Measure time between marks
        measure: (name: string, startMark: string, endMark?: string) => {
          const startTime = window.testUtils.performanceMetrics.markers.get(startMark);
          const endTime = endMark
            ? window.testUtils.performanceMetrics.markers.get(endMark)
            : performance.now();

          if (startTime && endTime) {
            const duration = endTime - startTime;
            window.testUtils.performanceMetrics.measurements.set(name, duration);
            return duration;
          }
          return 0;
        },

        // Get all performance data
        getPerformanceData: () => {
          return {
            markers: Object.fromEntries(window.testUtils.performanceMetrics.markers),
            measurements: Object.fromEntries(window.testUtils.performanceMetrics.measurements),
            totalTime: performance.now() - window.testUtils.performanceMetrics.startTime
          };
        },

        // DOM utilities
        waitForElement: (selector: string, timeout = 5000) => {
          return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const checkElement = () => {
              const element = document.querySelector(selector);
              if (element) {
                resolve(element);
              } else if (Date.now() - startTime > timeout) {
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
              } else {
                setTimeout(checkElement, 100);
              }
            };

            checkElement();
          });
        },

        // Wait for multiple elements
        waitForElements: (selectors: string[], timeout = 5000) => {
          return Promise.all(
            selectors.map(selector => window.testUtils.waitForElement(selector, timeout))
          );
        },

        // Check if element is in viewport
        isInViewport: (element: Element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
          );
        },

        // Scroll element into view smoothly
        scrollIntoView: (selector: string) => {
          const element = document.querySelector(selector);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        },

        // Memory utilities
        getMemoryUsage: () => {
          if ('memory' in performance) {
            return {
              used: (performance as any).memory.usedJSHeapSize,
              total: (performance as any).memory.totalJSHeapSize,
              limit: (performance as any).memory.jsHeapSizeLimit
            };
          }
          return null;
        },

        // Network utilities
        interceptFetch: () => {
          const originalFetch = window.fetch;
          const requests: any[] = [];

          window.fetch = function(...args) {
            const request = {
              url: args[0],
              options: args[1],
              timestamp: Date.now()
            };
            requests.push(request);
            return originalFetch.apply(this, args);
          };

          return {
            getRequests: () => requests,
            restore: () => { window.fetch = originalFetch; }
          };
        },

        // Console utilities
        captureConsole: () => {
          const logs: any[] = [];
          const originalMethods = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
          };

          ['log', 'warn', 'error', 'info'].forEach(method => {
            (console as any)[method] = (...args: any[]) => {
              logs.push({
                level: method,
                args: args,
                timestamp: Date.now()
              });
              (originalMethods as any)[method].apply(console, args);
            };
          });

          return {
            getLogs: () => logs,
            restore: () => {
              Object.assign(console, originalMethods);
            }
          };
        },

        // WebSocket utilities
        mockWebSocket: () => {
          const originalWebSocket = window.WebSocket;
          const connections: any[] = [];

          window.WebSocket = function(url: string, protocols?: string | string[]) {
            const mockSocket = {
              url,
              protocols,
              readyState: 1, // OPEN
              send: (data: any) => console.log('Mock WebSocket send:', data),
              close: () => console.log('Mock WebSocket close'),
              addEventListener: (event: string, handler: Function) => {},
              removeEventListener: (event: string, handler: Function) => {},
              dispatchEvent: (event: Event) => true
            };

            connections.push(mockSocket);
            return mockSocket as any;
          } as any;

          return {
            getConnections: () => connections,
            restore: () => { window.WebSocket = originalWebSocket; }
          };
        },

        // Animation utilities
        disableAnimations: () => {
          const style = document.createElement('style');
          style.textContent = `
            *, *::before, *::after {
              animation-duration: 0.001ms !important;
              transition-duration: 0.001ms !important;
              animation-delay: 0ms !important;
              transition-delay: 0ms !important;
            }
          `;
          document.head.appendChild(style);
          return style;
        },

        // Event utilities
        triggerEvent: (selector: string, eventType: string, eventData?: any) => {
          const element = document.querySelector(selector);
          if (element) {
            const event = new CustomEvent(eventType, { detail: eventData });
            element.dispatchEvent(event);
          }
        },

        // Form utilities
        fillForm: (formSelector: string, data: Record<string, any>) => {
          const form = document.querySelector(formSelector);
          if (form) {
            Object.entries(data).forEach(([name, value]) => {
              const input = form.querySelector(`[name="${name}"], #${name}`);
              if (input) {
                (input as any).value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
          }
        },

        // Table utilities
        getTableData: (tableSelector: string) => {
          const table = document.querySelector(tableSelector);
          if (!table) return [];

          const rows = table.querySelectorAll('tr');
          const headers = Array.from(rows[0]?.querySelectorAll('th, td') || [])
            .map(cell => cell.textContent?.trim());

          const data = Array.from(rows).slice(1).map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            const rowData: Record<string, any> = {};

            cells.forEach((cell, index) => {
              if (headers[index]) {
                rowData[headers[index]] = cell.textContent?.trim();
              }
            });

            return rowData;
          });

          return data;
        },

        // Local storage utilities
        mockLocalStorage: () => {
          const storage = new Map<string, string>();

          const mockStorage = {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
            clear: () => storage.clear(),
            get length() { return storage.size; },
            key: (index: number) => Array.from(storage.keys())[index] || null
          };

          const originalLocalStorage = window.localStorage;
          Object.defineProperty(window, 'localStorage', {
            value: mockStorage,
            writable: true
          });

          return {
            getStorage: () => Object.fromEntries(storage),
            restore: () => {
              Object.defineProperty(window, 'localStorage', {
                value: originalLocalStorage,
                writable: true
              });
            }
          };
        }
      };

      // Error tracking
      window.testErrors = [];
      window.addEventListener('error', (event) => {
        window.testErrors.push({
          type: 'error',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          timestamp: Date.now()
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        window.testErrors.push({
          type: 'unhandledrejection',
          reason: event.reason,
          timestamp: Date.now()
        });
      });
    });
  }

  /**
   * Take a screenshot with timestamp
   */
  static async takeScreenshot(
    page: Page,
    name: string,
    options: { fullPage?: boolean; clip?: any } = {}
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    const path = `test-results/screenshots/${filename}`;

    await page.screenshot({
      path,
      fullPage: options.fullPage,
      clip: options.clip
    });

    return path;
  }

  /**
   * Generate test data with specific patterns
   */
  static generateTestData(type: 'email' | 'username' | 'password' | 'text', count = 1): string[] {
    const generators = {
      email: () => `test${Math.random().toString(36).substr(2, 8)}@example.com`,
      username: () => `user${Math.random().toString(36).substr(2, 8)}`,
      password: () => Math.random().toString(36).substr(2, 12) + '!',
      text: () => `Test text ${Math.random().toString(36).substr(2, 10)}`
    };

    return Array.from({ length: count }, () => generators[type]());
  }

  /**
   * Retry function with exponential backoff
   */
  static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Wait for condition with timeout
   */
  static async waitForCondition(
    condition: () => Promise<boolean> | boolean,
    timeout = 10000,
    interval = 100
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await condition();
        if (result) {
          return;
        }
      } catch (error) {
        // Condition check failed, continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Mock API responses
   */
  static async mockApiResponse(
    page: Page,
    pattern: string | RegExp,
    response: any,
    options: { status?: number; delay?: number } = {}
  ): Promise<void> {
    await page.route(pattern, async (route) => {
      if (options.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay));
      }

      await route.fulfill({
        status: options.status || 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });
  }

  /**
   * Simulate slow network conditions
   */
  static async simulateSlowNetwork(page: Page, delay = 2000): Promise<void> {
    await page.route('**/*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      await route.continue();
    });
  }

  /**
   * Get performance metrics from page
   */
  static async getPerformanceMetrics(page: Page): Promise<any> {
    return await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as any;
      const paint = performance.getEntriesByType('paint');

      return {
        navigation: {
          loadComplete: navigation?.loadEventEnd - navigation?.navigationStart,
          domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.navigationStart,
          firstByte: navigation?.responseStart - navigation?.navigationStart
        },
        paint: paint.reduce((acc: any, entry) => {
          acc[entry.name] = entry.startTime;
          return acc;
        }, {}),
        memory: window.testUtils?.getMemoryUsage() || null,
        custom: window.testUtils?.getPerformanceData() || null
      };
    });
  }

  /**
   * Validate accessibility
   */
  static async validateAccessibility(page: Page, selector?: string): Promise<any[]> {
    return await page.evaluate((sel) => {
      const violations: any[] = [];
      const elements = sel ? [document.querySelector(sel)] : [document];

      elements.forEach(element => {
        if (!element) return;

        // Check for missing alt attributes
        const images = element.querySelectorAll('img:not([alt])');
        images.forEach(img => {
          violations.push({
            type: 'missing-alt',
            element: img.tagName,
            message: 'Image missing alt attribute'
          });
        });

        // Check for missing labels
        const inputs = element.querySelectorAll('input:not([aria-label]):not([aria-labelledby])');
        inputs.forEach(input => {
          const hasLabel = element.querySelector(`label[for="${input.id}"]`);
          if (!hasLabel) {
            violations.push({
              type: 'missing-label',
              element: input.tagName,
              message: 'Form input missing label'
            });
          }
        });

        // Check for proper heading hierarchy
        const headings = Array.from(element.querySelectorAll('h1,h2,h3,h4,h5,h6'));
        let lastLevel = 0;
        headings.forEach(heading => {
          const level = parseInt(heading.tagName.charAt(1));
          if (level > lastLevel + 1) {
            violations.push({
              type: 'heading-hierarchy',
              element: heading.tagName,
              message: 'Heading hierarchy not properly structured'
            });
          }
          lastLevel = level;
        });
      });

      return violations;
    }, selector);
  }

  /**
   * Simulate user interactions with realistic timing
   */
  static async simulateUserInteraction(
    page: Page,
    steps: Array<{ action: string; selector?: string; text?: string; delay?: number }>
  ): Promise<void> {
    for (const step of steps) {
      if (step.delay) {
        await page.waitForTimeout(step.delay);
      }

      switch (step.action) {
        case 'click':
          if (step.selector) {
            await page.locator(step.selector).click();
          }
          break;

        case 'type':
          if (step.selector && step.text) {
            await page.locator(step.selector).type(step.text, { delay: 100 });
          }
          break;

        case 'hover':
          if (step.selector) {
            await page.locator(step.selector).hover();
          }
          break;

        case 'scroll':
          if (step.selector) {
            await page.locator(step.selector).scrollIntoViewIfNeeded();
          } else {
            await page.mouse.wheel(0, 500);
          }
          break;
      }

      // Random small delay between actions
      await page.waitForTimeout(100 + Math.random() * 200);
    }
  }
}