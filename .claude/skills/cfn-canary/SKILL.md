---
name: cfn-canary
description: "MUST BE USED within 10 minutes of any production deployment. Post-deploy health monitoring: polls a URL for 10 minutes checking errors, performance regressions, availability."
version: 1.0.0
tags: [deployment, monitoring, canary, health-check]
status: production
---

# CFN Canary

**Purpose:** Monitor a deployed application for 10 minutes after deployment, detecting errors and regressions before users are affected.

## Usage

Invoke as `/canary <url>` where url is the production endpoint to monitor.

Optional: pass the key-events list from `OPS_<slug>.md` §3 (event name + the query or command that returns its count since deploy). Without it, the report states `Event arrival: NOT CHECKED (no event list)`, never a silent pass.

## Monitoring Protocol

### Phase 1: Baseline Capture
Before monitoring begins, capture baseline metrics:
- HTTP status code
- Response time (ms)
- Response body size
- Key response headers (content-type, cache-control)

If no baseline exists, the first check becomes the baseline.

### Phase 2: Polling Loop (10 minutes, 30-second intervals)
Every 30 seconds, check:
1. **Availability:** HTTP status 200? If not, alert.
2. **Response time:** >2x baseline? Flag as performance regression.
3. **Response size:** Changed significantly (>50% diff)? Flag as content change.
4. **Error indicators:** Check response body for common error patterns (500, "Internal Server Error", "503", stack traces).

### Phase 2b: Event Arrival (when an event list is given)
A page that loads while tracking records nothing is not healthy. At the end of the window, run each event's count query once:
- Count >= 1: PASS.
- Count 0: FAIL, `no events arrived`. Zero is a failure, never a pass. If the event needs real user traffic that 10 minutes may not produce, trigger it once yourself (a test check-in, a test login) or re-run the count later; do not mark it passed.
- Query errored or returned nothing parseable: FAIL, `count unreadable`, kept distinct from zero.

Report every event by name with its count, so a missing one is visible: `match.open=14 checkin=0 session.attend=3`.

### Phase 3: Alert Logic
Transient tolerance: require 2+ consecutive failures before alerting. Single failures may be network blips.

Alert levels:
- **CRITICAL:** Site down (non-200 status, 2+ consecutive)
- **CRITICAL:** A key event had zero arrivals or an unreadable count (Phase 2b)
- **WARNING:** Performance regression (response time >2x baseline, 2+ consecutive)
- **INFO:** Content change detected (response size shift)

### Phase 4: Report
Output summary:
```
## Canary: <url> (10min)

### Status: HEALTHY | DEGRADED | DOWN

### Checks: N/N passed
### Event arrival: <event>=<count> ... | NOT CHECKED (no event list)
### Alerts: N

### Timeline
HH:MM:SS - 200 (Xms) OK
HH:MM:SS - 200 (Xms) OK
HH:MM:SS - 500 (Xms) ALERT: Server error
...

### Recommendation
<action based on findings>
```

## Limitations
- HTTP-only monitoring (no browser rendering, no JS execution); event arrival needs a count query supplied by the caller
- For full browser-based canary testing, combine with cfn-e2e
- Does not check specific page content or user flows

## Integration
- Run after `fly deploy` or any deployment command
- Uses curl for HTTP checks (no external dependencies)
- Can be combined with cfn-e2e for deeper verification
