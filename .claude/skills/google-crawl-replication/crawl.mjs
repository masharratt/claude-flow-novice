#!/usr/bin/env node
// google-crawl-replication: simulate Googlebot crawl + validate SEO health
// Pure Node 20+. No npm deps.

const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

function parseArgs(argv) {
  const args = { url: null, sitemap: null, urls: null, maxUrls: 50, strict: false, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--sitemap') args.sitemap = argv[++i];
    else if (a === '--urls') args.urls = argv[++i];
    else if (a === '--max-urls') args.maxUrls = parseInt(argv[++i], 10);
    else if (a === '--strict') args.strict = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  if (!args.url) { console.error('--url required'); process.exit(2); }
  args.url = args.url.replace(/\/$/, '');
  return args;
}

function printHelp() {
  console.log(`Usage: crawl.mjs --url <https://site> [options]

Options:
  --url <url>          Base URL (required)
  --sitemap <path>     Sitemap path (default: auto-discover /sitemap.xml)
  --urls <csv>         Comma-separated paths to crawl (skip sitemap)
  --max-urls <n>       Cap URLs sampled from sitemap (default 50)
  --strict             Exit non-zero on WARN as well as FAIL
  --json               JSON output instead of text
  --help, -h           Show this help`);
}

async function fetchWithTimeout(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const start = Date.now();
    const res = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) }, redirect: 'manual', signal: ctl.signal });
    const ttfb = Date.now() - start;
    return { res, ttfb };
  } finally {
    clearTimeout(t);
  }
}

async function fetchRobotsTxt(base) {
  try {
    const { res } = await fetchWithTimeout(`${base}/robots.txt`);
    if (res.status !== 200) return { ok: false, status: res.status, rules: [], text: '' };
    const text = await res.text();
    const rules = parseRobots(text);
    return { ok: true, status: 200, rules, text };
  } catch (e) {
    return { ok: false, error: e.message, rules: [], text: '' };
  }
}

function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^(User-agent|Allow|Disallow|Sitemap):\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === 'user-agent') {
      if (!current || current.locked) { current = { agents: [v.toLowerCase()], allow: [], disallow: [], locked: false }; groups.push(current); }
      else current.agents.push(v.toLowerCase());
    } else if (k === 'allow') { if (current) { current.allow.push(v); current.locked = true; } }
    else if (k === 'disallow') { if (current) { current.disallow.push(v); current.locked = true; } }
  }
  return groups;
}

function robotsAllows(rules, path, ua = 'googlebot') {
  const matchGroup = rules.find(g => g.agents.includes(ua)) || rules.find(g => g.agents.includes('*'));
  if (!matchGroup) return true;
  const longest = (arr) => arr
    .filter(p => p && path.startsWith(p))
    .sort((a, b) => b.length - a.length)[0] || '';
  const a = longest(matchGroup.allow);
  const d = longest(matchGroup.disallow);
  if (a.length >= d.length) return true;
  return false;
}

async function fetchSitemap(base, path) {
  const url = path?.startsWith('http') ? path : `${base}${path || '/sitemap.xml'}`;
  try {
    const { res } = await fetchWithTimeout(url);
    if (res.status !== 200) return { ok: false, status: res.status, urls: [], indexUrls: [] };
    const xml = await res.text();
    if (/<sitemapindex/i.test(xml)) {
      const indexUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
      const all = [];
      for (const child of indexUrls.slice(0, 10)) {
        const sub = await fetchSitemap(base, child);
        all.push(...sub.urls);
      }
      return { ok: true, status: 200, urls: all, indexUrls };
    }
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
    return { ok: true, status: 200, urls, indexUrls: [] };
  } catch (e) {
    return { ok: false, error: e.message, urls: [], indexUrls: [] };
  }
}

async function followRedirects(url) {
  const chain = [];
  let current = url;
  let lastRes = null;
  let lastTtfb = 0;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const { res, ttfb } = await fetchWithTimeout(current);
    lastRes = res;
    lastTtfb = ttfb;
    chain.push({ url: current, status: res.status });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }
  return { chain, finalUrl: current, finalRes: lastRes, finalTtfb: lastTtfb };
}

function extractCanonical(html) {
  const m = html.match(/<link[^>]+rel=["']?canonical["']?[^>]*>/i);
  if (!m) return null;
  const href = m[0].match(/href=["']([^"']+)["']/i);
  return href ? href[1].trim() : null;
}

function extractMetaRobots(html) {
  const m = html.match(/<meta[^>]+name=["']?robots["']?[^>]*>/i);
  if (!m) return null;
  const content = m[0].match(/content=["']([^"']+)["']/i);
  return content ? content[1].toLowerCase() : null;
}

function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return matches.map(m => m[1]);
}

async function checkUrl(url, robots, base) {
  const reasons = [];
  let severity = 'PASS';
  const bump = (s) => { if (s === 'FAIL' || (s === 'WARN' && severity === 'PASS')) severity = s; };

  const path = new URL(url).pathname;
  if (!robotsAllows(robots.rules, path)) {
    reasons.push(`robots.txt disallows Googlebot on ${path}`);
    bump('FAIL');
    return { url, status: 0, ttfb: 0, severity, reasons };
  }

  let chain, finalRes, finalTtfb, finalUrl;
  try {
    ({ chain, finalRes, finalTtfb, finalUrl } = await followRedirects(url));
  } catch (e) {
    return { url, status: 0, ttfb: 0, severity: 'FAIL', reasons: [`fetch error: ${e.message}`] };
  }

  const status = finalRes.status;
  if (chain.length - 1 > 2) { reasons.push(`redirect chain ${chain.length - 1} hops (>2)`); bump('WARN'); }

  if (status >= 500) { reasons.push(`server error ${status}`); bump('FAIL'); return { url, status, ttfb: finalTtfb, severity, reasons, chain }; }
  if (status === 404) { reasons.push('orphaned slug: 404 (check daily_seo.url_redirects)'); bump('FAIL'); return { url, status, ttfb: finalTtfb, severity, reasons, chain }; }
  if (status === 410) { reasons.push('410 Gone (intentional removal)'); bump('PASS'); return { url, status, ttfb: finalTtfb, severity, reasons, chain }; }
  if (status !== 200) { reasons.push(`unexpected status ${status}`); bump('FAIL'); return { url, status, ttfb: finalTtfb, severity, reasons, chain }; }

  const xRobots = finalRes.headers.get('x-robots-tag') || '';
  if (/noindex/i.test(xRobots)) { reasons.push(`X-Robots-Tag: ${xRobots}`); bump('FAIL'); }

  const ct = finalRes.headers.get('content-type') || '';
  if (!ct.includes('html')) {
    return { url, status, ttfb: finalTtfb, severity, reasons: reasons.length ? reasons : ['non-HTML, skipped HTML checks'], chain };
  }

  const html = await finalRes.text();

  if (html.length < 500) { reasons.push(`page body ${html.length} bytes (<500, likely empty/stub)`); bump('WARN'); }

  const metaRobots = extractMetaRobots(html);
  if (metaRobots && /noindex/.test(metaRobots)) { reasons.push(`meta robots: ${metaRobots}`); bump('FAIL'); }

  const canonical = extractCanonical(html);
  if (!canonical) { reasons.push('missing <link rel="canonical">'); bump('FAIL'); }
  else {
    try {
      const canonAbs = new URL(canonical, finalUrl).toString();
      const finalParsed = new URL(finalUrl);
      const canonParsed = new URL(canonAbs);
      const isRoot = (p) => p === '' || p === '/';
      const sameOrigin = canonParsed.origin === finalParsed.origin;
      const samePath = canonParsed.pathname === finalParsed.pathname
        || (isRoot(canonParsed.pathname) && isRoot(finalParsed.pathname));
      if (!sameOrigin || !samePath) {
        if (canonAbs.replace(/\/$/, '') === finalUrl.replace(/\/$/, '')) {
          reasons.push(`canonical trailing-slash drift: ${canonAbs} vs ${finalUrl}`);
          bump('FAIL');
        } else {
          reasons.push(`canonical ${canonAbs} != served ${finalUrl}`);
          bump('FAIL');
        }
      }
    } catch {
      reasons.push(`canonical malformed: ${canonical}`);
      bump('FAIL');
    }
  }

  const jsonLds = extractJsonLd(html);
  for (const block of jsonLds) {
    try { JSON.parse(block); }
    catch (e) { reasons.push(`JSON-LD parse error: ${e.message.slice(0, 60)}`); bump('WARN'); }
  }

  if (finalTtfb > 800) { reasons.push(`TTFB ${finalTtfb}ms (>800)`); bump('WARN'); }

  if (severity === 'PASS') reasons.push(`${status}, ${finalTtfb}ms, canonical OK`);

  return { url, status, ttfb: finalTtfb, severity, reasons, chain };
}

async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const base = args.url;
  const baseHost = new URL(base).host;

  const preflight = { base, robots: null, sitemap: null, warnings: [] };

  preflight.robots = await fetchRobotsTxt(base);
  if (!preflight.robots.ok) {
    preflight.warnings.push(`robots.txt: ${preflight.robots.error || 'status ' + preflight.robots.status}`);
  }

  let urlsToCheck = [];
  if (args.urls) {
    urlsToCheck = args.urls.split(',').map(p => p.trim()).filter(Boolean).map(p => p.startsWith('http') ? p : `${base}${p.startsWith('/') ? p : '/' + p}`);
  } else {
    preflight.sitemap = await fetchSitemap(base, args.sitemap);
    if (!preflight.sitemap.ok) preflight.warnings.push(`sitemap: status ${preflight.sitemap.status || 'err'}`);
    urlsToCheck = preflight.sitemap.urls.slice(0, args.maxUrls);
    if (!urlsToCheck.length) urlsToCheck = [base + '/'];
    const offHost = preflight.sitemap.urls.filter(u => { try { return new URL(u).host !== baseHost; } catch { return false; } });
    if (offHost.length) preflight.warnings.push(`sitemap contains ${offHost.length} URLs on different host than ${baseHost} (e.g., ${offHost[0]})`);
  }

  const results = await runPool(urlsToCheck, (u) => checkUrl(u, preflight.robots, base), CONCURRENCY);

  const summary = {
    base, total: results.length,
    pass: results.filter(r => r.severity === 'PASS').length,
    warn: results.filter(r => r.severity === 'WARN').length,
    fail: results.filter(r => r.severity === 'FAIL').length,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify({ preflight, summary, results }, null, 2) + '\n');
  } else {
    if (!preflight.robots.ok) console.log(`[PREFLIGHT FAIL] robots.txt: ${preflight.robots.error || preflight.robots.status}`);
    else console.log(`[PREFLIGHT PASS] robots.txt: ${preflight.robots.rules.length} group(s)`);
    if (preflight.sitemap) {
      if (!preflight.sitemap.ok) console.log(`[PREFLIGHT FAIL] sitemap: status ${preflight.sitemap.status}`);
      else console.log(`[PREFLIGHT PASS] sitemap: ${preflight.sitemap.urls.length} URL(s), sampling ${urlsToCheck.length}`);
    }
    for (const w of preflight.warnings) console.log(`[WARN] ${w}`);
    console.log('');
    for (const r of results) {
      const tag = r.severity === 'PASS' ? '[PASS]' : r.severity === 'WARN' ? '[WARN]' : '[FAIL]';
      console.log(`${tag} ${r.url}`);
      for (const reason of r.reasons) console.log(`       ${reason}`);
    }
    console.log('');
    console.log(`Summary: ${summary.pass} PASS / ${summary.fail} FAIL / ${summary.warn} WARN  (${summary.total} URLs)`);
  }

  const hardFail = summary.fail > 0 || !preflight.robots.ok || (preflight.sitemap && !preflight.sitemap.ok);
  const anyWarn = summary.warn > 0 || preflight.warnings.length > 0;
  if (hardFail) process.exit(1);
  if (args.strict && anyWarn) process.exit(1);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(2); });
