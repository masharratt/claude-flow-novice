/* Run with node. All writes stay in a disposable fleet; Chromium stays sandboxed. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn, execFileSync} = require('node:child_process');
const net = require('node:net');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.FLEET_TEST_ROOT || path.resolve(__dirname, '..');
const lib = path.join(root, '.claude/skills/cfn-fleet/lib');
const renderer = process.env.FLEET_DASHBOARD_RENDERER || path.join(lib, 'cmd-dashboard.sh');
const header = 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\n';
let run, server, server2, browser, stubDir;
// Twin of _fleet_tmux_socket: fleet-<run basename>, non [A-Za-z0-9_.-] folded to dashes.
const socketFor = dir => ('fleet-' + path.basename(dir).replace(/^fleet-/, '')).replace(/[^A-Za-z0-9_.-]/g, '-');
const freePort = () => new Promise((resolve, reject) => {const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => {const p = s.address().port; s.close(() => resolve(p));});});
(async () => {
  run = await fs.mkdtemp(path.join(os.tmpdir(), 'fleet-ui-test-'));
  try {
    const now = Math.floor(Date.now() / 1000);
    const rows = [
      ['WS01', 'auth', 'Session refresh', 'working', 'src/auth', '', '', '', now - 40, 'Writing tests', 'glm'],
      ['WS02', 'api', 'Rate limits', 'blocked', 'src/api', '', '', '', now - 120, 'Waiting on product', 'claude-sub'],
      ['WS03', 'ui', 'M1 art gate: ART-01 shots', 'landed', 'src/ui', 'abc1234', '', '', now - 400, 'done-ART01: committed abc1234. ' + 'Full playtest context line follows here. '.repeat(20) + 'The word done stays plain text.', 'codex'],
      ['WS04', 'docs', 'Docs', 'done', 'docs', 'def5678', '', '', now - 500, 'Finished', 'glm'],
      ['WS05', 'cache', 'Cache repair', 'dead', 'src/cache', '', '', '', now - 600, 'Exited', 'glm'],
      ['WS06', 'stale', 'Search <script>window.injected = true</script>', 'working', 'src/search', '', '', '', now - 2000, 'No update', 'glm'],
      ['WS07', 'queue', 'Queued work', 'pending', '', '', '', '', 0, '', 'glm'],
      ['WS08', 'start', 'Fresh start', 'started', 'src/new', '', '', '', now - 10, '', 'codex']
    ];
    const roster = () => header + rows.map(row => row.join('\t')).join('\n') + '\n';
    await fs.writeFile(path.join(run, 'roster.tsv'), roster());
    await fs.writeFile(path.join(run, 'fleet.env'), 'FLEET_WORKTREE=off\nFLEET_DB=none\n');
    await fs.writeFile(path.join(run, 'goal.txt'), 'Coordinate a release safely');
    await fs.writeFile(path.join(run, 'glossary.tsv'), [
      'code\tmeaning',
      'M1\tMilestone 1 art gate <img src=x onerror="window.glossaryInjected=1">',
      'ART-01\tBoth teams, close and tactical screenshots',
      'ART01\tBoth teams, close and tactical screenshots',
      '<script>alert(1)</script>\tInvalid code row must be skipped',
      'done\tDigit-less code must be skipped',
      ''
    ].join('\n'));
    await fs.mkdir(path.join(run, 'files'));
    await fs.writeFile(path.join(run, 'files/WS01.txt'), 'src/auth/session.ts\nsrc/auth/session.test.ts\n');
    await fs.writeFile(path.join(run, 'dashboard-events.jsonl'), JSON.stringify({ts: now, ws: 'WS02', from: 'working', to: 'blocked'}) + '\n');
    execFileSync('bash', ['-c', 'source "$1"; source "$2"; _fleet_dash_render "$3" 15 1', '_', path.join(lib, 'common.sh'), renderer, path.join(run, 'roster.tsv')], {env: {...process.env, FLEET_RUN_DIR: run}});
    server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', run]);
    const port = await new Promise((resolve, reject) => {
      let output = '';
      server.stdout.on('data', chunk => {output += chunk; const match = output.match(/port (\d+)/); if (match) resolve(match[1]);});
      server.once('error', reject);
      server.once('exit', code => reject(Error('Server exited: ' + code)));
    });
    const url = `http://127.0.0.1:${port}/dashboard.html`;
    browser = await chromium.launch({headless: true, chromiumSandbox: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
    const page = await browser.newPage({viewport: {width: 1440, height: 1050}, reducedMotion: 'reduce'});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#live-label').textContent === 'Live updates');
    assert.equal(await page.locator('#sum-attention').textContent(), '3', 'Blocked, dead and stale each count once');
    assert.equal(await page.locator('#sum-active').textContent(), '3', 'Started and working count as in flight');
    assert.equal(await page.locator('#sum-landed').textContent(), '1', 'Landed excludes done');
    assert.equal(await page.locator('#sum-done').textContent(), '1 / 8', 'Only done counts as finished');
    assert.equal(await page.evaluate(() => window.injected), undefined, 'Hostile task stays literal');
    // Attach command on JS-rendered cards: live rows only, pending gets none; plain http.server has no /api/health, so no Open button.
    const sock = socketFor(run);
    assert.equal(await page.locator('body').getAttribute('data-socket'), sock, 'Page carries the run socket');
    assert.equal(await page.locator('[data-ws="WS01"] .attach-cmd').textContent(), `tmux -L ${sock} attach -t auth`, 'JS card shows the local attach command');
    assert.equal(await page.locator('[data-ws="WS07"] .attach-cmd').count(), 0, 'Pending card has no attach command');
    assert.equal(await page.locator('[data-ws="WS01"] .open-btn').isVisible(), false, 'Open button hidden without /api/health');
    await page.evaluate(() => {window.__copied = null; Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: t => {window.__copied = t; return Promise.resolve();}}});});
    await page.locator('[data-ws="WS01"] .copy-btn').click();
    await page.waitForFunction(() => window.__copied !== null);
    assert.equal(await page.evaluate(() => window.__copied), `tmux -L ${sock} attach -t auth`, 'Copy puts the exact attach command on the clipboard');
    // Glossary legend: valid rows only (header, invalid-code and digit-less rows skipped), aliases merged.
    await page.waitForSelector('#glossary .gl-row');
    await page.waitForSelector('[data-ws="WS03"] .task .term');
    assert.equal(await page.locator('#glossary .gl-row').count(), 2, 'Legend keeps valid rows only');
    assert.equal(await page.locator('#glossary .gl-row').first().locator('.gl-code').textContent(), 'ART-01 / ART01', 'Alias spellings merge into one row');
    assert.equal(await page.locator('#glossary .gl-row').nth(1).locator('.gl-code').textContent(), 'M1', 'M1 row follows');
    assert.ok(!(await page.locator('#glossary').innerHTML()).includes('<img'), 'Hostile glossary meaning stays escaped');
    // Inline term tooltips in task and notes; plain word done stays unwrapped.
    assert.equal(await page.locator('[data-ws="WS03"] .task .term').count(), 2, 'M1 and ART-01 wrapped in task');
    assert.ok((await page.locator('[data-ws="WS03"] .task .term').first().getAttribute('title')).includes('Milestone 1 art gate'), 'Task term title carries meaning');
    assert.equal(await page.locator('[data-ws="WS03"] .notes .term').count(), 1, 'ART01 wrapped in notes, plain done not wrapped');
    assert.ok((await page.locator('[data-ws="WS03"] .notes .term').first().getAttribute('title')).includes('Both teams'), 'Note term title carries meaning');
    assert.equal(await page.evaluate(() => window.glossaryInjected), undefined, 'Glossary meaning never executes');
    // Status tooltip states the landed trap.
    assert.ok((await page.locator('[data-ws="WS03"] .pill').first().getAttribute('title')).includes('Not necessarily finished'), 'Landed pill tooltip warns landed is not finished');
    // Notes clamp and expand.
    const notes = page.locator('[data-ws="WS03"] .notes');
    assert.equal(await notes.locator('.notes-body').evaluate(el => getComputedStyle(el).getPropertyValue('-webkit-line-clamp')), '4', 'Long note clamped to 4 lines');
    assert.equal(await notes.getAttribute('aria-expanded'), 'false', 'Clamped note starts collapsed');
    await notes.click();
    assert.equal(await notes.getAttribute('aria-expanded'), 'true', 'Click expands the note');
    await notes.click();
    assert.equal(await notes.getAttribute('aria-expanded'), 'false', 'Second click collapses again');
    await notes.focus();
    await page.keyboard.press('Enter');
    assert.equal(await notes.getAttribute('aria-expanded'), 'true', 'Enter toggles the note too');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#tl .tl-item').count(), 1, 'Transitions render in activity panel');
    await page.locator('[data-view="attention"]').click();
    assert.equal(await page.locator('.card[data-ws]').count(), 3, 'Attention view isolates interventions');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.card[data-ws]').count(), 3, 'Attention view survives a live poll');
    assert.equal(await page.locator('[data-view="attention"]').getAttribute('aria-pressed'), 'true', 'Attention exposes selected state');
    await page.locator('#clear-filters').click();
    await page.locator('#sort').selectOption('hb');
    assert.equal(await page.locator('.card[data-ws]').first().getAttribute('data-ws'), 'WS06', 'Oldest heartbeat sorts first');
    assert.equal(await page.locator('#cards .card[data-ws]').last().getAttribute('data-ws'), 'WS08', 'Heartbeat sort orders live lanes only (freshest last)');
    assert.equal(await page.locator('#queued-cards .card[data-ws]').count(), 1, 'Pending row stays in the Queued section');
    assert.equal(await page.locator('#queued-cards [data-ws="WS07"]').count(), 1, 'Queued section holds WS07');
    await page.locator('#search').fill('src/auth');
    assert.equal(await page.locator('.card[data-ws]').count(), 1, 'Search matches ownership claims');
    await page.waitForSelector('[data-ws="WS01"] .files li');
    assert.equal(await page.locator('[data-ws="WS01"] .files li').count(), 2, 'Worker editing paths load');
    await page.locator('#search').fill('no matching worker');
    assert.ok((await page.locator('.empty-state').textContent()).includes('No rows match'), 'Empty filtered view explained');
    await page.locator('#clear-filters').click();
    await page.locator('[data-filter="blocked"]').click();
    assert.equal(await page.locator('.card[data-ws]').count(), 1, 'Closed-vocabulary filter works');
    await page.route('**/roster.tsv?*', route => route.abort());
    await page.waitForFunction(() => document.querySelector('#live-label').textContent === 'Updates paused');
    const received = await page.locator('#updated-pill').textContent();
    assert.equal(await page.locator('#connection-warning').isVisible(), true, 'Failed roster fetch shows explicit warning');
    await page.locator('#clear-filters').click();
    assert.equal(await page.locator('.card[data-ws]').count(), 8, 'Last good roster is retained during outage');
    assert.equal(await page.locator('#updated-pill').textContent(), received, 'Local filtering does not pretend fresh data arrived');
    await page.unroute('**/roster.tsv?*');
    await page.waitForFunction(() => document.querySelector('#live-label').textContent === 'Live updates');
    assert.equal(await page.locator('#connection-warning').isVisible(), false, 'Connection notice clears on successful retry');
    rows[1][3] = 'working'; rows[1][8] = Math.floor(Date.now() / 1000);
    await fs.writeFile(path.join(run, 'roster.tsv'), roster());
    await page.waitForFunction(() => document.querySelector('#sum-attention').textContent === '2');
    assert.equal(await page.locator('#sum-active').textContent(), '4', 'Live roster update refreshes totals');
    await fs.writeFile(path.join(run, 'glossary.tsv'), [
      'code\tmeaning',
      'M1\tMilestone 1 art gate',
      'ART-01\tBoth teams, close and tactical screenshots',
      'ART01\tBoth teams, close and tactical screenshots',
      'SYNC-01\tTwo clients, ten minutes, no desync',
      ''
    ].join('\n'));
    await page.waitForFunction(() => document.querySelectorAll('#glossary .gl-row').length === 3);
    assert.ok((await page.locator('[data-ws="WS03"] .task .term').first().getAttribute('title')).includes('Milestone 1 art gate'), 'Glossary edit updates term titles live');
    await page.locator('#theme-toggle').click(); await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'Theme persists');
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({width, height: 900});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
    }
    const staticPage = await browser.newPage({javaScriptEnabled: false, viewport: {width: 1440, height: 1050}});
    await staticPage.goto(url);
    assert.equal(await staticPage.locator('#cards > article').count(), 7, 'No-JS live cards remain siblings');
    assert.equal(await staticPage.locator('#queued-cards > article').count(), 1, 'No-JS pending row renders under Queued');
    assert.ok((await staticPage.locator('[data-ws="WS01"]').textContent()).includes('src/auth/session.ts'), 'No-JS editing evidence is present');
    assert.equal(await staticPage.locator('#glossary .gl-row').count(), 2, 'No-JS page shows the bash-rendered legend (setup-time glossary, pre SYNC-01 edit)');
    assert.equal(await staticPage.locator('[data-ws="WS03"] .task .term').count(), 0, 'No-JS task text stays unwrapped (JS-only termify)');
    await fs.writeFile(path.join(run, 'roster.tsv'), header);
    await page.waitForFunction(() => document.querySelector('#sum-done').textContent === '0 / 0');
    assert.ok((await page.locator('.empty-state').textContent()).includes('No workstreams yet'), 'Empty roster has an onboarding message');
    // Remote worker: host badge on the card and an unreachable state that is never DEAD.
    const hostHeader = header.trimEnd() + '\thost\n';
    const hostNow = Math.floor(Date.now() / 1000);
    await fs.writeFile(path.join(run, 'roster.tsv'), hostHeader +
      ['WS10', 'remote', 'Remote task', 'working', 'src/r', '', '', '', hostNow, 'on the server', 'claude-opus', 'vps'].join('\t') + '\n');
    await fs.writeFile(path.join(run, 'host-states.tsv'), 'WS10\tvps\tunreachable\t\n');
    await page.waitForSelector('[data-ws="WS10"] .chip.host');
    assert.equal(await page.locator('[data-ws="WS10"] .chip.host').textContent(), 'vps', 'Host badge names the ssh alias');
    await page.waitForSelector('[data-ws="WS10"] .badge.unreachable');
    assert.equal(await page.locator('[data-ws="WS10"] .badge.dead').count(), 0, 'Unreachable card is never shown as DEAD');
    assert.equal(await page.locator('#sum-attention').textContent(), '1', 'Unreachable host row needs attention');
    await fs.writeFile(path.join(run, 'host-states.tsv'), 'WS10\tvps\tprompt\tnoreport\n');
    await page.waitForSelector('[data-ws="WS10"] .badge.prompt');
    await page.waitForSelector('[data-ws="WS10"] .badge.noreport');
    assert.equal(await page.locator('[data-ws="WS10"] .badge.unreachable').count(), 0, 'Badge clears when the state changes');
    assert.equal(await page.locator('[data-ws="WS10"] .attach-cmd').textContent(), `ssh -t vps tmux -L ${sock} attach -t remote`, 'JS remote card shows the ssh attach command');
    // Open in terminal: the real dashboard server with a stub launcher that records argv.
    await fs.writeFile(path.join(run, 'roster.tsv'), hostHeader +
      ['WS01', 'auth', 'Local task', 'working', '', '', '', '', hostNow, '', 'glm', ''].join('\t') + '\n' +
      ['WS10', 'remote', 'Remote task', 'working', '', '', '', '', hostNow, '', 'glm', 'vps'].join('\t') + '\n');
    await fs.rm(path.join(run, 'host-states.tsv'), {force: true});
    stubDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fleet-ui-open-'));
    const stub = path.join(stubDir, 'open-stub'), openLog = path.join(stubDir, 'argv.log');
    await fs.writeFile(stub, '#!/bin/sh\n# test stub launcher: record argv\nprintf "%s\\n" "$*" >> "$FLEET_OPEN_LOG"\n', {mode: 0o755});
    const port2 = await freePort();
    server2 = spawn('python3', [path.join(lib, 'dashboard-server.py'), String(port2), run, sock], {env: {...process.env, FLEET_DASHBOARD_OPEN_CMD: stub, FLEET_OPEN_LOG: openLog}, stdio: 'ignore'});
    for (let i = 0; i < 50; i++) {
      try { const r = await fetch(`http://127.0.0.1:${port2}/api/health`); if (r.ok) break; } catch (e) { /* not up yet */ }
      await new Promise(r => setTimeout(r, 100));
    }
    const live = await browser.newPage({viewport: {width: 1440, height: 1050}});
    live.on('pageerror', e => errors.push(e.message));
    await live.goto(`http://127.0.0.1:${port2}/dashboard.html`);
    await live.waitForSelector('[data-ws="WS10"] .open-btn', {state: 'visible'});
    await live.locator('[data-ws="WS01"] .open-btn').click();
    await live.waitForFunction(() => /Opened/.test(document.querySelector('[data-ws="WS01"] .attach-msg').textContent));
    await live.locator('[data-ws="WS10"] .open-btn').click();
    await live.waitForFunction(() => /Opened/.test(document.querySelector('[data-ws="WS10"] .attach-msg').textContent));
    assert.deepEqual((await fs.readFile(openLog, 'utf8')).trim().split('\n'), [`tmux -L ${sock} attach -t auth`, `ssh -t vps tmux -L ${sock} attach -t remote`], 'Open runs the launcher with the roster-derived attach argv');
    await live.route('**/api/open-terminal', route => route.fulfill({status: 500, contentType: 'application/json', body: '{"ok":false,"error":"boom"}'}));
    await live.locator('[data-ws="WS01"] .open-btn').click();
    await live.waitForFunction(() => document.querySelector('[data-ws="WS01"] .attach-msg').textContent === 'Could not open a terminal, use the command shown');
    await live.close();
    // file:// page (the --no-serve case): Copy only, never an Open button.
    const filePage = await browser.newPage({viewport: {width: 1440, height: 1050}});
    await filePage.goto('file://' + path.join(run, 'dashboard.html'));
    assert.equal(await filePage.locator('[data-ws="WS01"] .attach-cmd').textContent(), `tmux -L ${sock} attach -t auth`, 'Bash-rendered card shows the attach command');
    assert.equal(await filePage.locator('[data-ws="WS01"] .copy-btn').isVisible(), true, 'Copy button shown on the file page');
    assert.equal(await filePage.locator('.open-btn:visible').count(), 0, 'No Open button on a file:// page');
    await filePage.close();
    assert.deepEqual(errors, [], 'No page errors across states');
    console.log('PASS: host badge and unreachable card, attention, landed/done semantics, heartbeat sorting, filters/search across polls, files, activity, outage retention and retry, fresh timestamps, live changes, themes, responsive layouts, empty roster, XSS escaping and no-JS fallback, glossary legend with alias merge and hostile-input guards, inline term tooltips, status tooltips, notes clamp and expand, live glossary updates, attach command and Copy on JS and bash cards, Open in terminal via the stub launcher, open failure message, Open hidden on file:// and without health.');
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) await new Promise(resolve => {server.once('exit', resolve); server.kill();});
    if (server2 && server2.exitCode === null) await new Promise(resolve => {server2.once('exit', resolve); server2.kill();});
    if (stubDir) await fs.rm(stubDir, {recursive: true, force: true});
    if (run) await fs.rm(run, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
