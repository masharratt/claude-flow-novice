/* Isolated browser workflows for the wiki template. No real wiki state is edited.
   Run with node tests/test-wiki-portal-ui.cjs.
   PLAYWRIGHT_MODULE and CHROME_PATH can point to an existing browser runtime. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  // Graceful skip: playwright is an optional test dep (SKILL.md: "with
  // Playwright installed"). Point PLAYWRIGHT_MODULE at any checkout's
  // node_modules/playwright to run for real.
  console.log('SKIP: test-wiki-portal-ui — playwright module not found; set PLAYWRIGHT_MODULE to run');
  process.exit(0);
}
const root = process.env.WIKI_TEST_ROOT || path.resolve(__dirname, '..');
const portal = path.join(root, '.claude/skills/cfn-wiki/portal');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-browser-'));
const wiki = path.join(temp, '.wiki');
const pagePath = path.join(wiki, 'portal/index.html');
fs.mkdirSync(path.dirname(pagePath), { recursive: true });
const template = fs.readFileSync(path.join(portal, 'template.html'), 'utf8');
const payload = {
  meta: { repo: 'Browser fixture', generated_at: '2026-09-12T10:00:00Z', stale: false, degraded: '' },
  arch: {
    nodes: ['auth', 'api', 'ui'].map((id, i) => ({ id, label: id, count: i + 1, files: [id + '/entry.ts'] })),
    edges: [{ source: 'api', target: 'auth', type: 'IMPORTS', weight: 3 }],
  },
  catalog: { features: [
    { fid: 'auth', status: 'prod', description: '<img src=x onerror=alert(1)>', files: ['auth/entry.ts'], coupling_count: 1 },
    { fid: 'api', status: 'dev', description: 'Public endpoints', files: ['api/entry.ts'] },
  ] },
  state: { entities: [
    { name: 'Session', source: 'auth/entry.ts:1', states: ['created', 'active'], transitions: [{ from: 'created', to: 'active', trigger: 'sign in', guard: 'valid token' }],
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 500" style="max-width:1200px"><rect x="20" y="200" width="160" height="60" fill="#e0eee5" stroke="#246b59"/><text x="40" y="235" fill="#233c38">created</text><path d="M180 230 H1000" stroke="#246b59"/><rect x="1000" y="200" width="160" height="60" fill="#e0eee5" stroke="#246b59"/><text x="1020" y="235" fill="#233c38">active</text></svg>' },
    { name: 'Job', source: 'api/entry.ts:1', states: ['queued', 'done'], transitions: [{ from: 'queued', to: 'done', trigger: 'complete', guard: 'result exists' }] },
  ] },
  data: { erd: { tables: [
    { name: 'users', columns: [{ name: 'id', type: 'uuid', nullable: false }], fks: [] },
    { name: 'sessions', columns: [{ name: 'user_id', type: 'uuid', nullable: false }], fks: [{ from: 'user_id', to: 'users.id' }] },
  ] }, rls: [{ table: 'users', policy: 'owner_only', cmd: 'SELECT' }] },
  change: { commits: [{ date: '2026-09-09T12:00:00Z' }], hotspots: [{ file: 'auth/entry.ts', count: 2 }], story: { auth: { commit_count: 1, first_commit_date: '2026-09-09' } } },
};
function writePage(data) {
  fs.writeFileSync(pagePath, template.replace('__WIKI_PAYLOAD__', JSON.stringify(data).replace(/<\//g, '<\\/')));
}
writePage(payload);
let browser;
const servers = [];
async function startServer(readOnly = false) {
  const server = spawn('python3', [path.join(portal, 'server.py'), '--wiki-dir', wiki, '--port', '0', ...(readOnly ? ['--read-only'] : [])]);
  servers.push(server);
  return new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('Server startup timeout: ' + errors)), 10000);
    server.stderr.on('data', data => { errors += data; });
    server.stdout.on('data', data => {
      output += data;
      if (output.includes('\n')) {
        clearTimeout(timer);
        try { resolve(JSON.parse(output.split('\n')[0]).url); } catch (error) { reject(error); }
      }
    });
    server.on('error', error => { clearTimeout(timer); reject(error); });
    server.on('exit', code => { clearTimeout(timer); if (!output) reject(new Error('Server exited ' + code + ': ' + errors)); });
  });
}
async function until(check, label) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out: ' + label);
}
(async () => {
  const url = await startServer();
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(url)) external.push(request.url()); });
  await page.goto(url);
  assert.equal(await page.locator('body').getAttribute('data-ready'), '1');
  await page.locator('#module-search').fill('auth/entry');
  assert.equal(await page.locator('.module-item:visible').count(), 1);
  await page.locator('.module-item:visible').click();
  assert.equal(await page.locator('#arch-detail-name').textContent(), 'auth');
  assert.equal(await page.locator('#arch-svg [data-node="auth"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#arch-svg .edge.connected').count(), 1);
  assert.equal(await page.locator('#arch-svg [data-node="ui"]').getAttribute('class'), 'node-hit muted');
  await page.locator('#arch-svg [data-node="api"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#arch-detail-name').textContent(), 'api');
  console.log('PASS: module search, keyboard selection, source details and connected edges');

  await page.getByRole('tab', { name: 'Features', exact: false }).click();
  await page.locator('#feature-search').fill('auth/entry');
  assert.equal(await page.locator('.feat-card:visible').count(), 1);
  assert.match(await page.locator('.feat-card:visible .desc').textContent(), /<img src=x/);
  assert.equal(await page.locator('.feat-card img').count(), 0);
  await page.locator('#feature-status').selectOption('dev');
  assert.equal(await page.locator('#feature-empty').isVisible(), true);
  await page.locator('#feature-reset').click();
  assert.equal(await page.locator('.feat-card:visible').count(), 2);
  await page.reload();
  assert.equal(await page.getByRole('tab', { name: 'Features' }).getAttribute('aria-selected'), 'true');
  await page.getByRole('tab', { name: 'Features' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-data').getAttribute('aria-selected'), 'true');
  console.log('PASS: feature filters, reset, literal content, deep links and keyboard tabs');

  await page.locator('#state-search').fill('valid token');
  assert.equal(await page.locator('.entity-card:visible').count(), 1);
  const state = page.locator('.entity-card:visible');
  await state.locator('summary').click();
  assert.match(await state.locator('table').textContent(), /valid token/);
  const stateControls = state.getByRole('group');
  await stateControls.getByRole('button', { name: '100%', exact: true }).click();
  assert.equal(await stateControls.locator('output').textContent(), '100%');
  await stateControls.getByRole('button', { name: 'Zoom in', exact: true }).click();
  assert.equal(await stateControls.locator('output').textContent(), '125%');
  assert(await state.locator('.diagram-viewport').evaluate(n => n.scrollWidth > n.clientWidth));
  await stateControls.getByRole('button', { name: 'Expand', exact: true }).click();
  const dialog = page.locator('#diagram-dialog');
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await dialog.locator('svg').count(), 1);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#diagram-dialog').contains(document.activeElement)), true);
  await dialog.getByRole('button', { name: '100%', exact: true }).click();
  const canvas = dialog.locator('.diagram-viewport');
  await canvas.focus();
  await page.keyboard.press('+');
  assert.equal(await dialog.locator('output').textContent(), '125%');
  await page.keyboard.press('Escape');
  await until(async () => await dialog.isHidden() && await state.locator('svg').count() === 1, 'close and restore diagram');
  assert.equal(await state.locator('svg').count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Expand');
  await page.locator('#state-search').fill('complete');
  assert.match(await page.locator('.entity-card:visible').textContent(), /Diagram unavailable/);
  assert.match(await page.locator('.entity-card:visible table').textContent(), /result exists/);
  await page.locator('#state-search').fill('');
  assert.equal(await page.locator('#erd-svg .fk').count(), 1);
  const erd = page.locator('#erd-host');
  await erd.getByRole('button', { name: 'Expand', exact: true }).click();
  assert.equal(await dialog.locator('#erd-svg').count(), 1);
  await page.getByRole('button', { name: 'Close diagram' }).click();
  await until(async () => await erd.locator('#erd-svg').count() === 1, 'restore ER diagram');
  console.log('PASS: state and ER diagrams, transition fallback, zoom, expand, Escape and focus restoration');

  await page.getByRole('tab', { name: 'Features' }).click();
  const authNote = page.locator('[data-fid="auth"] .note-btn');
  const apiNote = page.locator('[data-fid="api"] .note-btn');
  await authNote.click();
  await page.locator('#anno-note').fill('Keep token rotation atomic.');
  await apiNote.click();
  assert.equal(await page.locator('#anno-note').inputValue(), '');
  await until(async () => {
    const doc = await (await fetch(url + 'api/annotations')).json();
    return doc.annotations['feature:auth']?.note === 'Keep token rotation atomic.';
  }, 'pending note saves to original target');
  await page.locator('#anno-note').fill('Public endpoint notes.');
  await page.locator('#anno-save').click();
  await until(async () => (await page.locator('#anno-status').textContent()).startsWith('Saved'), 'saved confirmation');
  await page.locator('#anno-close').click();
  await page.reload();
  await apiNote.click();
  await until(async () => (await page.locator('#anno-note').inputValue()) === 'Public endpoint notes.', 'persisted note reload');
  await page.locator('#anno-delete').click();
  await until(async () => {
    const doc = await (await fetch(url + 'api/annotations')).json();
    return !doc.annotations['feature:api'];
  }, 'note deletion');
  await page.locator('#anno-close').click();
  console.log('PASS: notes autosave to original target, persist after reload, and delete');

  await page.locator('#theme-toggle').click();
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ['arch', 'catalog', 'data', 'change']) {
      await page.locator('#tab-' + view).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'overflow at ' + width + ' in ' + view);
    }
  }
  console.log('PASS: saved theme and all four views at 375, 768 and 1440 pixels');

  const readOnlyUrl = await startServer(true);
  const readonly = await browser.newPage();
  await readonly.goto(readOnlyUrl + '#catalog');
  await readonly.locator('[data-fid="auth"] .note-btn').click();
  await readonly.locator('#anno-note').fill('Cannot persist this.');
  await readonly.locator('#anno-save').click();
  await until(async () => (await readonly.locator('#anno-status').textContent()).includes('read-only'), 'read-only save feedback');
  assert.equal(await readonly.locator('#anno-note').inputValue(), 'Cannot persist this.');
  await readonly.close();
  await page.goto(pathToFileURL(pagePath).href + '#catalog');
  await page.locator('[data-fid="auth"] .note-btn').click();
  assert.equal(await page.locator('#anno-note').isDisabled(), true);
  assert.equal(await page.locator('#anno-hint').isVisible(), true);
  console.log('PASS: static file mode and read-only server feedback');

  writePage({ meta: {}, arch: { nodes: [], edges: [] }, catalog: { features: [] }, state: { entities: [] }, data: { empty: true }, change: {} });
  await page.goto(url);
  assert.equal(await page.locator('body').getAttribute('data-ready'), '1');
  assert.match(await page.locator('#arch-scroll').textContent(), /No modules/);
  await page.locator('#tab-data').click();
  assert.match(await page.locator('#state-grid').textContent(), /No state machines/);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('PASS: empty payload, no browser errors and no external requests');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  for (const server of servers) {
    if (server.exitCode === null) {
      const stopped = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await stopped;
    }
  }
  fs.rmSync(temp, { recursive: true, force: true });
});
