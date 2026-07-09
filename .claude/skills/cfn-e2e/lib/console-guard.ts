/**
 * console-guard.ts: Playwright console/network failure guard (fixture template).
 *
 * WHAT IT DOES
 *   Wraps the built-in `page` fixture with per-test listeners that collect, for
 *   every test: console messages of type "error", uncaught page errors
 *   (pageerror), same-origin HTTP responses with a 4xx/5xx status, and failed
 *   requests (requestfailed). In teardown it asserts both the console-error list
 *   and the network-failure list are empty, so a page that logs an error or
 *   serves a 500 fails the test even when the test body itself passes.
 *
 * WHY A FIXTURE, NOT A CONFIG OVERLAY
 *   These listeners must attach per test (test-scoped page). A playwright.config
 *   overlay cannot add per-test listeners and would clobber the project config.
 *   So this ships as a `test.extend` template you import instead of
 *   `@playwright/test`.
 *
 * INSTALL (copy into your project)
 *   1. Copy this file to `tests/e2e/fixtures/console-guard.ts`.
 *   2. In each spec, swap the import:
 *          // before
 *          import { test, expect } from '@playwright/test';
 *          // after
 *          import { test, expect } from '../fixtures/console-guard';
 *      (adjust the relative path to wherever the spec lives). No other change:
 *      the extended `test`/`expect` are drop-in replacements.
 *   3. Dependency-free beyond `@playwright/test` (already a dev dependency).
 *
 * OPT-OUT (per test)
 *   Some tests legitimately exercise console errors. Annotate those with
 *   `allow-console-errors` and the guard skips its teardown assertions:
 *
 *       test('shows a client-side error banner',
 *         { annotation: { type: 'allow-console-errors', description: 'asserts the error path' } },
 *         async ({ page }) => { ... });
 *
 * SAME-ORIGIN SCOPE
 *   Network failures are scoped to the app under test via
 *   `testInfo.project.use.baseURL`. When baseURL is absent, only the top-level
 *   document request is treated as same-origin (fallback). Third-party 4xx/5xx
 *   (analytics, CDNs) never fail your test.
 *
 * HMR / DEV-SERVER CARVE-OUT
 *   `net::ERR_ABORTED` on non-document requests (typical of HMR and cancelled
 *   dev-server fetches) is filtered out so local dev noise does not fail tests.
 */

import { test as base, expect, type Request, type Response } from '@playwright/test';

const ALLOW_ANNOTATION = 'allow-console-errors';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleViolations: string[] = [];
    const networkFailures: string[] = [];

    // Derive the app origin from the project baseURL (if configured).
    let baseOrigin: string | null = null;
    const baseURL = testInfo.project.use.baseURL;
    if (baseURL) {
      try {
        baseOrigin = new URL(baseURL).origin;
      } catch {
        baseOrigin = null;
      }
    }

    // Same-origin decision. With a baseURL: compare origins. Without one:
    // treat only the top-level document request as same-origin (fallback).
    const isSameOrigin = (url: string, isDocument: boolean): boolean => {
      if (baseOrigin) {
        try {
          return new URL(url).origin === baseOrigin;
        } catch {
          return false;
        }
      }
      return isDocument;
    };

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleViolations.push(`console.error: ${msg.text()}`);
      }
    });

    page.on('pageerror', (err) => {
      consoleViolations.push(`pageerror: ${err.message}`);
    });

    page.on('response', (response: Response) => {
      const status = response.status();
      if (status < 400) return;
      const req = response.request();
      const isDocument = req.resourceType() === 'document';
      if (isSameOrigin(response.url(), isDocument)) {
        networkFailures.push(`HTTP ${status}: ${req.method()} ${response.url()}`);
      }
    });

    page.on('requestfailed', (req: Request) => {
      const errorText = req.failure()?.errorText ?? 'unknown';
      const isDocument = req.resourceType() === 'document';
      // HMR / dev-server carve-out: ignore aborted non-document requests.
      if (errorText.includes('net::ERR_ABORTED') && !isDocument) return;
      if (isSameOrigin(req.url(), isDocument)) {
        networkFailures.push(`requestfailed (${errorText}): ${req.method()} ${req.url()}`);
      }
    });

    await use(page);

    // Teardown assertions (skipped for opted-out tests).
    const optedOut = testInfo.annotations.some((a) => a.type === ALLOW_ANNOTATION);
    if (optedOut) return;

    if (consoleViolations.length > 0 || networkFailures.length > 0) {
      const report = [
        '# console-guard violations',
        '',
        `## console errors (${consoleViolations.length})`,
        ...(consoleViolations.length ? consoleViolations : ['(none)']),
        '',
        `## network failures (${networkFailures.length})`,
        ...(networkFailures.length ? networkFailures : ['(none)']),
        '',
        `Opt out with the "${ALLOW_ANNOTATION}" annotation if these are expected.`,
      ].join('\n');

      await testInfo.attach('console-violations', {
        body: report,
        contentType: 'text/plain',
      });

      // Best-effort screenshot: the page may already be closing.
      try {
        const shot = await page.screenshot();
        await testInfo.attach('console-guard-screenshot', {
          body: shot,
          contentType: 'image/png',
        });
      } catch {
        // ignore: screenshot is diagnostic, not load-bearing.
      }

      expect(consoleViolations, 'console errors detected (see console-violations attachment)').toEqual([]);
      expect(networkFailures, 'same-origin network failures detected (see console-violations attachment)').toEqual([]);
    }
  },
});

export { expect };
