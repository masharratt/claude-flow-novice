/**
 * console-guard.selftest.spec.ts: documents the intended behavior of
 * lib/console-guard.ts. Uses data: URLs so no dev server or app is required.
 *
 * This pair demonstrates:
 *   (a) a clean page passes the guard,
 *   (b) an erroring page FAILS the guard by default (marked test.fail so the
 *       suite stays green when the failure fires as expected), and
 *   (c) the same erroring page PASSES when the `allow-console-errors`
 *       annotation opts out.
 *
 * The authoritative, browser-free check for W7 is tests/test-strict-console.sh;
 * this spec documents behavior and runs when a browser is available (via cfn-e2e).
 *
 * Import path note: here the fixture lives one dir up in lib/. In a real project
 * you would copy the fixture to tests/e2e/fixtures/ and import '../fixtures/console-guard'.
 */

import { test, expect } from '../lib/console-guard';

const CLEAN_PAGE = 'data:text/html,<title>clean</title><h1>ok</h1>';
const ERROR_PAGE =
  'data:text/html,<title>boom</title><body><h1>boom</h1><script>console.error("boom: synthetic console error")</script></body>';

test('clean page raises no console violations', async ({ page }) => {
  await page.goto(CLEAN_PAGE);
  await expect(page.locator('h1')).toHaveText('ok');
});

// Expected to fail: the fixture teardown asserts the console-error list is empty.
test.fail('erroring page fails the console guard by default', async ({ page }) => {
  await page.goto(ERROR_PAGE);
  await expect(page.locator('h1')).toHaveText('boom');
});

test(
  'erroring page passes when allow-console-errors is set',
  { annotation: { type: 'allow-console-errors', description: 'exercises the console-error path on purpose' } },
  async ({ page }) => {
    await page.goto(ERROR_PAGE);
    await expect(page).toHaveTitle('boom');
  },
);
