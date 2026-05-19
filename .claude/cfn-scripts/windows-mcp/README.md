# windows-mcp helpers

Optimize token cost when driving Windows apps from WSL2 Claude Code via windows-mcp.

## Why

Default `Screenshot`/`Snapshot` capture full multi-monitor desktop (6000x1440 here = ~11.5k image tokens + 5-15k text payload per call). Most testing only needs the target window.

## capture-window.ps1

Per-window PNG capture via `PrintWindow` API. Works on occluded/background windows. Saves PNG to `$env:TEMP\win.png` by default.

### Usage from WSL2 Claude Code

1. Find window handle:
   ```
   PowerShell: Get-Process | Where-Object {$_.MainWindowTitle -match 'YourApp'} | Select-Object Id, MainWindowTitle, MainWindowHandle
   ```
2. Capture (use `-ExecutionPolicy Bypass` because script lives on WSL UNC path):
   ```
   PowerShell: powershell -ExecutionPolicy Bypass -File '\\wsl.localhost\Ubuntu\home\masha\projects\claude-flow-novice\.claude\cfn-scripts\windows-mcp\capture-window.ps1' -Handle 12345 -Out "$env:TEMP\app.png"
   ```
3. Read in Claude Code:
   ```
   Read /mnt/c/Users/<user>/AppData/Local/Temp/app.png
   ```

### Cost comparison

| Approach | Tokens/call (image) |
|---|---|
| `Screenshot` full desktop (6000x1440) | ~11,500 |
| `Screenshot display=[0]` (3440x1440) | ~6,600 |
| `capture-window.ps1` (typical 1280x800) | ~1,400 |

## Call-pattern rules

- Use `Snapshot(use_vision=false, use_ui_tree=true)` for UIA-exposed apps (browsers, Electron chrome) — text-only, no image.
- Use `Snapshot(use_dom=true, use_vision=false)` for browser DOM (lowest token cost for web content).
- Use `capture-window.ps1` for game canvases, Godot, DirectX, occluded windows — vision required.
- Reuse last snapshot's element IDs for follow-up Click/Type — don't re-snapshot per step.
- Pass `display=[0]` to limit Snapshot to primary monitor when window crop not viable.
