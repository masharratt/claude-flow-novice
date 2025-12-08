ORCHESTRATOR                    AGENT
    |                              |
    |---spawn("agent")------------>|
    |                              |
    |---BLPOP(timeout=0)--------   |
    |          ↓                   |
    |     BLOCKING FOREVER         |
    |     (no timeout)             |
    |                              |
    |                              | [crashes]
    |                              | X
    |     STILL WAITING            |
    |     (never wakes up)         |