#!/usr/bin/env node
// cfn-a11y-gate axe runner. Navigates each URL in a headless browser, injects
// axe-core, runs the WCAG ruleset, flattens violations to one record per
// offending node, prints a JSON array to stdout.
//
// Usage:   node axe-runner.js <url> [<url> ...]
// Env:     CFN_A11Y_TAGS  comma-separated axe tags (default wcag2a,wcag2aa)
//
// Dependency: @axe-core/playwright + playwright must be installed in the
// project. This runner does NOT install them. execute.sh checks first and
// exits with an install instruction when they are absent; this is a defensive
// second check.
//
// Exit codes:
//   0  ran successfully (violations, if any, are in the JSON; count != error)
//   3  missing dependency (@axe-core/playwright or playwright not resolvable)
//   4  runtime error (browser launch / navigation / analysis failed)
//
// cfn: depends on a preinstalled axe-core. Upgrade trigger: bundle a pinned
// local copy of axe-core under lib/ if drift across projects becomes a problem.
'use strict';

async function main() {
  const urls = process.argv.slice(2).filter(Boolean);
  if (urls.length === 0) {
    process.stderr.write('axe-runner: no URLs given\n');
    process.exit(4);
  }

  const tags = (process.env.CFN_A11Y_TAGS || 'wcag2a,wcag2aa')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  let AxeBuilder;
  let playwright;
  try {
    AxeBuilder = require('@axe-core/playwright').default;
    playwright = require('playwright');
  } catch (err) {
    process.stderr.write('axe-runner: missing dependency: ' + err.message + '\n');
    process.exit(3);
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (err) {
    process.stderr.write('axe-runner: browser launch failed: ' + err.message + '\n');
    process.exit(4);
  }

  const out = [];
  try {
    const context = await browser.newContext();
    for (const url of urls) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        const results = await new AxeBuilder({ page }).withTags(tags).analyze();
        for (const v of results.violations) {
          const nodes = v.nodes && v.nodes.length ? v.nodes : [{}];
          for (const node of nodes) {
            const target = Array.isArray(node.target) ? node.target.join(' ') : '';
            out.push({
              url,
              rule: v.id,
              impact: v.impact || 'minor',
              help: v.help || v.id,
              description: v.description || v.help || v.id,
              helpUrl: v.helpUrl || '',
              selector: target,
              failureSummary: (node.failureSummary || '').replace(/\s+/g, ' ').trim(),
            });
          }
        }
      } catch (err) {
        process.stderr.write('axe-runner: ' + url + ': ' + err.message + '\n');
        await page.close().catch(() => {});
        await browser.close().catch(() => {});
        process.exit(4);
      }
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }

  process.stdout.write(JSON.stringify({ violations: out }) + '\n');
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write('axe-runner: ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exit(4);
});
