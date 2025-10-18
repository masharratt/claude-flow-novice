# CFN Loop Enforcement

Coordinators automatically follow decision framework rules via validation hooks, rule injection, and self-correction monitoring.

## Architecture

```
┌─────────────────────────────────────────────────┐
│            CFN Loop Coordinators                │
│  (MVP / Standard / Enterprise / Hybrid)         │
└────────────┬────────────────────────────────────┘
             │
             ├─ Iteration Tracking (Redis INCR)
             ├─ Rule Injection (at transitions)
             ├─ Decision Validation (before execution)
             │
             v
┌─────────────────────────────────────────────────┐
│         Enforcement Components                  │
├─────────────────────────────────────────────────┤
│  1. Validation Hooks                            │
│     - validate-cfn-decision.ts                  │
│     - validation-rules.ts                       │
│                                                  │
│  2. Rule Injection                              │
│     - inject-rules-at-transition.ts             │
│     - transition-points.ts                      │
│                                                  │
│  3. Self-Correction Monitor                     │
│     - cfn-compliance-monitor.ts                 │
│     - correction-publisher.ts                   │
└─────────────────────────────────────────────────┘
```

## Usage

Coordinators integrate enforcement via this pattern:

```typescript
// 1. Track iteration
const iteration = await redis.incr(`cfn:phase-${phaseId}:loop3:iteration`);

// 2. Inject rules before worker spawn
const injectedRules = await injectCFNRulesAtTransition({
  point: CFNTransitionPoint.LOOP_3_RELAUNCH,
  phaseId,
  mode: 'standard',
  iteration,
  maxIterations: 10,
  lastConsensus: consensusScore,
  consensusThreshold: 0.90,
  concerns
});

// 3. Validate decision before execution
const validation = await validateCFNDecision(decision, context);
const finalDecision = validation.corrected ? validation.decision : decision;

// 4. Execute validated decision
await executeDecision(finalDecision);
```

## Compliance Monitor

Start real-time monitoring:

```typescript
import { CFNComplianceMonitor } from './src/cfn-loop/cfn-compliance-monitor.js';

const monitor = new CFNComplianceMonitor({
  autoCorrect: true,
  logPath: '.artifacts/logs/cfn-violations.log'
});

await monitor.start();
```

View violations:
```typescript
const violations = await monitor.getViolations('coordinator-id');
```

## Validation Rules

1. **LOOP without permission** - LOOP decisions execute immediately
2. **Iteration limits** - MVP: 5, Standard: 10, Enterprise: 15
3. **Consensus alignment** - LOOP vs PROCEED based on threshold

## Testing

```bash
npm test -- tests/cfn-loop/enforcement-integration.test.ts
```