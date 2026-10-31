# ssh-egress-guard.ps1: Windows half of ssh-egress-guard.sh. Blocks outbound
# SSH (TCP 22) from every Windows program except to loopback and the Tailscale
# network. Run from an elevated (Administrator) PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File ssh-egress-guard.ps1            # apply (idempotent)
#   powershell -ExecutionPolicy Bypass -File ssh-egress-guard.ps1 -Remove
#   powershell -ExecutionPolicy Bypass -File ssh-egress-guard.ps1 -Status
#
# Why: the trojanized Claude Code extension 2.1.313 (29 Oct 2026, win32-x64
# build) opened a reverse SSH tunnel out to its server on port 22.
#
# Windows Firewall block rules beat allow rules, so the "except Tailscale" part
# is expressed as the block rule's remote-address ranges (everything EXCEPT
# 127/8, 100.64/10, ::1 and fd7a:115c:a1e0::/48).
#
# cfn: port 22 only, a tunnel over 443 still gets out; per-app outbound allow-listing if that matters
# cfn: WSL2 (NAT mode) traffic is covered by the Linux half, not this rule

param([switch]$Remove, [switch]$Status)

$Name = 'cfn-ssh-egress-block'

if ($Status) {
    $r = Get-NetFirewallRule -Name $Name -ErrorAction SilentlyContinue
    if ($r) { "$Name present, enabled=$($r.Enabled), action=$($r.Action)" } else { "$Name not present" }
    exit 0
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Error 'Run this from an Administrator PowerShell.'; exit 1 }

Get-NetFirewallRule -Name $Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Remove) { "$Name removed"; exit 0 }

$ranges = @(
    '0.0.0.0-100.63.255.255',
    '100.128.0.0-126.255.255.255',
    '128.0.0.0-255.255.255.255',
    '::2-fd7a:115c:a1df:ffff:ffff:ffff:ffff:ffff',
    'fd7a:115c:a1e1::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
)

New-NetFirewallRule -Name $Name -DisplayName $Name `
    -Description 'CFN: block outbound SSH except loopback and Tailscale (Claude Code 2.1.313 backdoor response, 2026-10-30)' `
    -Direction Outbound -Action Block -Protocol TCP -RemotePort 22 `
    -RemoteAddress $ranges -Profile Any -Enabled True | Out-Null

"$Name applied: outbound port 22 blocked except loopback and Tailscale"
