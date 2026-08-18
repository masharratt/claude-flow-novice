# Signed-in Chrome for playwright-mcp (per-project setup)

Goal: let `@playwright/mcp` drive your real, signed-in Chrome session (Google, GitHub, etc.) instead of a clean throwaway profile. Scoped per project via `.mcp.json`.

## Why a copy, not an attach

Chrome **136+ blocks HTTP remote debugging on the default user-data-dir** (`~/.config/google-chrome`). Passing `--remote-debugging-port=9222` is silently accepted but the port never binds. Passing `--user-data-dir=<same path>` explicitly does **not** bypass it. Pipe debugging (`--remote-debugging-pipe`) is allowed on the default dir, but `@playwright/mcp`'s `--cdp-endpoint` is HTTP/WS-only, so it can't use the pipe without a custom bridge.

Working approach: **copy the profile to a non-default dir**. Chrome allows CDP HTTP there, and `@playwright/mcp --user-data-dir <copy>` launches + drives a signed-in clone. Cookie decryption works because the `os_crypt` key lives in `Local State` (copied), keyed to the user/machine, not the path.

## Prerequisites

- Google Chrome installed at `/opt/google/chrome/chrome` (or change the `channel`/path).
- `playwright` resolvable in the project (`npm i -D playwright` or present already).
- Linux/WSL2. Headed display only needed if you want to *see* the browser; the MCP launches headed by default (WSLg forwards it).

## Steps

### 1. Copy the profile (excluding caches + locks)

```bash
SRC=~/.config/google-chrome
DST=~/.cache/ms-playwright-mcp/real-michael      # any non-default path
mkdir -p "$(dirname "$DST")"
rsync -a \
  --exclude='Cache/' --exclude='Code Cache/' --exclude='GPUCache/' \
  --exclude='ShaderCache/' --exclude='GrShaderCache/' \
  --exclude='GraphiteDawnCache/' --exclude='DawnCache/' \
  --exclude='optimization_guide*' \
  --exclude='component_crx_cache' --exclude='extensions_crx_cache' \
  --exclude='SingletonLock' --exclude='SingletonSocket' --exclude='SingletonCookie' \
  "$SRC/" "$DST/"
```

- Close the real Chrome first for a clean SQLite snapshot (Cookies/History use WAL). A live copy usually works but may miss logins flushed in the last few seconds.
- Stale `SingletonLock` after a crashed Chrome? `rm -f ~/.config/google-chrome/Singleton*` before copying.
- Result is ~750MB–1GB depending on extensions/history. Drop `--exclude='Extensions/'` is **not** recommended if you want extensions carried; the 490MB `Default/Extensions` is the usual bulk — keep it.

### 2. Verify the clone is actually signed in

Run this from the **project directory** (playwright must resolve there — `/tmp` has no `node_modules`, ESM resolves from script location):

```bash
cd <project>
cat > .verify-profile.mjs <<'EOF'
import { chromium } from 'playwright';
const ctx = await chromium.launchPersistentContext(process.argv[2], {
  channel: 'chrome', headless: true, args: ['--no-sandbox']
});
try {
  const cookies = await ctx.cookies();
  const google = [...new Set(cookies
    .filter(c => c.domain.includes('google.com'))
    .map(c => c.name).filter(n => /SID|HSID|APISID|__Secure-3P|LSID|SSID/.test(n)))];
  console.log('TOTAL_COOKIES=' + cookies.length);
  console.log('GOOGLE_SESSION=' + (google.join(',') || 'NONE'));
} finally { await ctx.close(); }
EOF
node .verify-profile.mjs ~/.cache/ms-playwright-mcp/real-michael
rm -f .verify-profile.mjs
```

Expect `GOOGLE_SESSION=__Secure-3PSID,SID,HSID,SSID,SAPISID,...` and 100+ cookies. `NONE` means the copy missed the session — re-copy with Chrome closed.

### 3. Wire the project's `.mcp.json`

Add a `playwright-real` server (coexists with the global `playwright` plugin — clean profile stays available as `mcp__plugin_playwright_playwright__*`):

```json
{
  "mcpServers": {
    "playwright-real": {
      "_comment": "Drives a signed-in clone of the real Chrome profile. Chrome 146 blocks HTTP debugging on the default dir, hence the copy. Tools = mcp__playwright-real__*.",
      "type": "stdio",
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--user-data-dir",
        "/home/you/.cache/ms-playwright-mcp/real-michael"
      ]
    }
  }
}
```

Must be an absolute path. JSON does not expand `~` or `$HOME`, so write it out in full: `/home/<user>/...` on Linux, `/Users/<user>/...` on macOS.

Point multiple projects at the **same** clone path to share logins, or give each project its own copy if you want isolated sessions.

### 4. Activate

In Claude Code: `/mcp` → reconnect → approve `playwright-real`. Tools arrive as `mcp__playwright-real__browser_navigate`, `mcp__playwright-real__browser_snapshot`, etc.

## Refresh logins

After signing into new sites in your real Chrome: close Chrome, rerun the step-1 `rsync`. New cookies propagate to the clone.

## Security

The clone holds your full Google/GitHub/etc. sessions on disk — **same sensitivity as your real profile**. Treat the copy path as a credential. Don't commit it. Don't copy it across machines (the `os_crypt` key won't decrypt elsewhere).

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| CDP port 9222 never binds | Chrome 136+ block on default profile. Use the copy approach (this doc). |
| `ERR_MODULE_NOT_FOUND: playwright` | Script not run from project dir, or playwright not installed there. `cd <project>` first. |
| `SingletonLock` error / chrome defers to existing | Another chrome owns that dir. Quit it, or `rm -f <dst>/Singleton*`. |
| Verified clone has `GOOGLE_SESSION=NONE` | Copied while Chrome was writing. Close Chrome, re-copy. |
| `--cdp-endpoint http://localhost:9222` times out | You're trying the dead attach path. Switch to `--user-data-dir <copy>`. |
| Cookie DB at `Default/Cookies` not `Default/Network/Cookies` | Path varies by Chrome version; `find` for it. |

## Reference impl (fireside-family)

- Profile copy: `~/.cache/ms-playwright-mcp/real-michael`
- `.mcp.json`: `playwright-real` server
- Verified 2026-07-17: 138 cookies, michael@dailyautomations.com Google + GitHub. No Fireside/Supabase (never logged in via Chrome).
- Memory: `project-playwright-real-chrome-profile.md` in the fireside project memory dir.
