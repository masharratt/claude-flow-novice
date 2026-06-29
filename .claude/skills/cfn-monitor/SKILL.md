---
name: cfn-monitor
description: "Post-deploy runtime health gate and incident triage runbook. Probes HTTP endpoints for status and latency, emits JSON summary, exits nonzero on any failure. Use after every deploy as a go/no-go gate. Stateless single-shot; see cfn: marker for the continuous-polling upgrade path."
version: 1.0.0
tags: [monitoring, health-check, incident, runbook, deploy-gate, fly-io]
status: production
---

# CFN Monitor

**Purpose:** Post-deploy health gate and incident triage aid. Probes a list of HTTP endpoints, checks expected status codes and optional latency budgets, emits a JSON summary to stdout, and exits nonzero if any target is unhealthy.

Not a metrics backend. Not an alerting daemon. A scriptable gate you run after a deploy and a runbook you follow when something breaks.

## When to Use

- After every deploy (Fly.io or otherwise) as a go/no-go check before marking the release green.
- As a quick sanity check before opening a pull request that touches HTTP routes.
- As the first step of incident triage: confirm scope and get a baseline.

## Inputs

### Flags (repeatable, stackable with env)

```
--target <url>[:<expected_status>[:<latency_budget_ms>]]
```

Each `--target` flag adds one probe. Parts are colon-separated after the URL.

Examples:
```
--target https://myapp.fly.dev/health
--target https://myapp.fly.dev/health:200
--target https://myapp.fly.dev/health:200:2000
--target https://myapp.fly.dev/api/status:200:1500
```

Defaults when omitted: `expected_status=200`, `latency_budget_ms` = no budget (latency reported but not checked).

### Environment: CFN_MONITOR_TARGETS

JSON array of target objects. Merged with any `--target` flags (flags take precedence on conflicts).

```json
[
  { "url": "https://myapp.fly.dev/health", "expected_status": 200, "latency_budget_ms": 2000 },
  { "url": "https://myapp.fly.dev/api/status", "expected_status": 200 }
]
```

`latency_budget_ms` is optional per entry. Omit to skip latency checking for that target.

### Other env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `CFN_MONITOR_TIMEOUT_S` | `10` | Per-probe curl timeout in seconds. |
| `CFN_MONITOR_TARGETS` | (none) | JSON array of targets (see above). |

## Outputs

JSON summary to **stdout**. All status messages go to **stderr** so stdout stays machine-readable.

```json
{
  "timestamp": "2026-06-28T12:00:00Z",
  "targets_total": 2,
  "targets_pass": 1,
  "targets_fail": 1,
  "results": [
    {
      "url": "https://myapp.fly.dev/health",
      "expected_status": 200,
      "actual_status": 200,
      "latency_ms": 312,
      "latency_budget_ms": 2000,
      "latency_ok": true,
      "status": "pass",
      "reason": ""
    },
    {
      "url": "https://myapp.fly.dev/api/status",
      "expected_status": 200,
      "actual_status": 503,
      "latency_ms": 4501,
      "latency_budget_ms": 1500,
      "latency_ok": false,
      "status": "fail",
      "reason": "status mismatch (expected 200, got 503); latency 4501ms > budget 1500ms"
    }
  ]
}
```

`status` per result: `pass` (status matched, latency within budget if set) or `fail`.

`latency_budget_ms` is `null` in output when no budget was configured for that target.

`latency_ok` is `null` when no budget is configured (no check performed).

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All targets healthy (status matched, latency within budget where configured). |
| 1 | One or more targets failed (status mismatch or latency budget exceeded). |
| 2 | No targets configured (nothing to probe). |
| 3 | Configuration parse error (malformed CFN_MONITOR_TARGETS JSON). |

## Alert Thresholds

Thresholds are per-target, configured at call time (not a daemon config file):

| Threshold | How configured | Behavior |
|-----------|---------------|---------|
| Status mismatch | `expected_status` per target (default 200) | Marks target `fail`; included in exit code 1. |
| Latency over budget | `latency_budget_ms` per target | Marks target `fail`; reason includes both values. |
| Consecutive failures | not in single-shot mode (see cfn: note below) | Upgrade path only. |

cfn: single-shot probe only, no consecutive-failure tracking. Upgrade trigger: need for scheduled polling that counts N consecutive failures before alerting (then wire a cron/systemd timer calling this script and maintain a state file for failure counts).

## Usage

```bash
# Single target
./.claude/skills/cfn-monitor/execute.sh --target https://myapp.fly.dev/health:200:2000

# Multiple targets via flags
./.claude/skills/cfn-monitor/execute.sh \
  --target https://myapp.fly.dev/health:200:2000 \
  --target https://myapp.fly.dev/api/users:200:1500

# From env
export CFN_MONITOR_TARGETS='[{"url":"https://myapp.fly.dev/health","expected_status":200,"latency_budget_ms":2000}]'
./.claude/skills/cfn-monitor/execute.sh

# Parse the JSON output
./.claude/skills/cfn-monitor/execute.sh --target https://myapp.fly.dev/health | jq '.results[]'

# Fail-fast in a deploy pipeline
./.claude/skills/cfn-monitor/execute.sh --target https://myapp.fly.dev/health:200:3000 || { echo "Deploy gate failed. Check output above."; exit 1; }
```

## Dependencies

- `curl` (always present in Fly builder and typical CI environments).
- `jq` for parsing `CFN_MONITOR_TARGETS` JSON. Degrades: if `jq` is absent and only `--target` flags are used, the skill works without it.
- No new dependencies added.

## Incident Triage

See `RUNBOOK.md` in this directory for the ordered triage procedure when a health check fails post-deploy.

## Related

- `cfn-deployment-lifecycle` - deploy orchestration that wraps this gate.
- `cfn-security-review` - pre-merge security gate (runs before deploy, not after).
- `RUNBOOK.md` - ordered triage steps for incidents flagged by this gate.
