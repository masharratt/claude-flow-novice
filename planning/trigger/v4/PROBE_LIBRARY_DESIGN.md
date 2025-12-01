# MDAP v2 Troubleshooting: Probe Library Design

**Status**: Design | **Date**: 2025-11-28

## Overview

Probes are **fast, definitive diagnostic checks** that test one hypothesis at a time. Each probe:
- Takes <1 second to execute
- Returns clear true/false result
- Costs ~$0.0001 per probe
- Can run in parallel

---

## Core Probe Types (8 Essential)

### Probe 1: String/Enum Comparison Mismatch

**Hypothesis**: "Error is caused by comparing string values that don't match"

**When to Use**: Status checks, enum comparisons, authentication state checks

**Probe Code**:
```typescript
async function probeStringMismatch(code: string, errorContext: string): Promise<ProbeResult> {
  // Extract all string comparisons
  const comparisons = Array.from(
    code.matchAll(/(\w+)\s*===?\s*["']([^"']+)["']/g)
  ).map(m => ({ variable: m[1], value: m[2] }));

  // Extract all string assignments
  const assignments = Array.from(
    code.matchAll(/(\w+)\s*=\s*["']([^"']+)["']/g)
  ).map(m => ({ variable: m[1], value: m[2] }));

  // Find mismatches (comparing "COMPLETE" but assigning "COMPLETED")
  const mismatches = comparisons.filter(comp =>
    assignments.some(assign =>
      assign.variable === comp.variable && assign.value !== comp.value
    )
  );

  return {
    confirmed: mismatches.length > 0,
    evidence: mismatches.map(m =>
      `Variable '${m.variable}' compared to '${comp.value}' but assigned '${assign.value}'`
    ),
    confidence: mismatches.length > 0 ? 95 : 5
  };
}
```

**Example Result**:
```json
{
  "confirmed": true,
  "evidence": [
    "status === 'COMPLETE' but assigned 'COMPLETED'",
    "type === 'task' but assigned 'TASK'"
  ],
  "confidence": 98
}
```

---

### Probe 2: Null/Undefined Safety

**Hypothesis**: "Error is caused by accessing properties on potentially null/undefined values"

**When to Use**: NullPointerException, TypeError "cannot read property", undefined values

**Probe Code**:
```typescript
async function probeNullSafety(code: string): Promise<ProbeResult> {
  // Find property access patterns without null checks
  // Pattern: obj.property (no check) vs obj?.property (safe)

  const unsafePatterns = Array.from(
    code.matchAll(/(\w+)\.(\w+)\s*(?=[.;\[\]]|$)/g)
  ).filter(m => !hasNullCheckBefore(code, m.index, m[1]));

  const safePatterns = Array.from(
    code.matchAll(/(\w+)\?\.(\w+)/g)
  );

  const nullChecks = Array.from(
    code.matchAll(/if\s*\(\s*\w+\s*[!?]/g)
  );

  return {
    confirmed: unsafePatterns.length > nullChecks.length,
    evidence: unsafePatterns.slice(0, 3).map(m =>
      `Unsafe access: ${m[1]}.${m[2]}`
    ),
    riskScore: unsafePatterns.length - nullChecks.length,
    confidence: Math.min(100, unsafePatterns.length * 10)
  };
}
```

**Example Result**:
```json
{
  "confirmed": true,
  "evidence": [
    "Unsafe access: agent.status",
    "Unsafe access: metrics.value",
    "Unsafe access: data.items"
  ],
  "riskScore": 3,
  "confidence": 92
}
```

---

### Probe 3: Async/Await Race Condition

**Hypothesis**: "Error is caused by missing await or concurrent operations"

**When to Use**: Timing issues, "undefined" errors in async code, race conditions

**Probe Code**:
```typescript
async function probeAsyncRaceCondition(code: string): Promise<ProbeResult> {
  // Find Promise calls without await
  const promiseCalls = Array.from(
    code.matchAll(/(\w+)\s*\(/g)
  ).filter(m => isAsyncFunction(code, m[1]));

  const awaitedCalls = Array.from(
    code.matchAll(/await\s+(\w+)\s*\(/g)
  );

  const unawaited = promiseCalls.filter(p =>
    !awaitedCalls.some(a => a[1] === p[1])
  );

  // Find Promise.all/race patterns
  const parallelOps = Array.from(
    code.matchAll(/Promise\.(all|race|allSettled)\s*\(/g)
  ).length;

  // Find synchronization primitives
  const hasLocking = /mutex|lock|semaphore|concurrent/i.test(code);

  return {
    confirmed: unawaited.length > 0 || (parallelOps > 1 && !hasLocking),
    evidence: [
      ...unawaited.slice(0, 2).map(u => `Missing await: ${u[1]}()`),
      parallelOps > 1 ? `${parallelOps} parallel operations without synchronization` : null
    ].filter(Boolean),
    riskScore: unawaited.length + (parallelOps > 1 && !hasLocking ? 2 : 0),
    confidence: unawaited.length > 0 ? 90 : 60
  };
}
```

**Example Result**:
```json
{
  "confirmed": true,
  "evidence": [
    "Missing await: fetchMetrics()",
    "2 parallel operations without synchronization"
  ],
  "riskScore": 3,
  "confidence": 88
}
```

---

### Probe 4: Unhandled Exception Path

**Hypothesis**: "Error is due to unhandled exception or missing error handling"

**When to Use**: Uncaught errors, try/catch missing, promise rejection

**Probe Code**:
```typescript
async function probeErrorHandling(code: string): Promise<ProbeResult> {
  // Find async operations without try/catch or .catch()
  const asyncOps = Array.from(
    code.matchAll(/await\s+\w+\s*\(|\.then\s*\(/g)
  );

  const tryCatchBlocks = Array.from(
    code.matchAll(/try\s*\{/g)
  ).length;

  const catchHandlers = Array.from(
    code.matchAll(/\.catch\s*\(/g)
  );

  const unhandledOps = asyncOps.length - (tryCatchBlocks + catchHandlers.length);

  return {
    confirmed: unhandledOps > 0,
    evidence: [
      `${asyncOps.length} async operations`,
      `${tryCatchBlocks} try/catch blocks`,
      `${unhandledOps} potentially unhandled operations`
    ],
    confidence: Math.min(100, unhandledOps * 20)
  };
}
```

---

### Probe 5: State Update Timing Issue

**Hypothesis**: "Error occurs because state isn't updated when expected"

**When to Use**: React component state issues, Redux state not updating, timing dependency

**Probe Code**:
```typescript
async function probeStateUpdateTiming(code: string): Promise<ProbeResult> {
  // Look for immediate state usage after update
  const immediateUsage = Array.from(
    code.matchAll(/setState\s*\([^)]+\)\s*;?\s*\w+\s*=\s*state\./g)
  );

  // Look for useEffect dependencies
  const useEffects = Array.from(
    code.matchAll(/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([^}]+)\}/g)
  );

  // Missing dependencies
  const missingDeps = useEffects.filter(ue =>
    !ue[1].includes('[]') && !ue[1].includes('[')
  );

  return {
    confirmed: immediateUsage.length > 0 || missingDeps.length > 0,
    evidence: [
      ...immediateUsage.slice(0, 2).map(() => "Immediate state usage after update"),
      ...missingDeps.slice(0, 2).map(() => "useEffect missing dependency array")
    ],
    confidence: immediateUsage.length > 0 ? 85 : 70
  };
}
```

---

### Probe 6: Array/Loop Boundary Error

**Hypothesis**: "Error is off-by-one or array boundary issue"

**When to Use**: Array index errors, loop iteration issues, length check errors

**Probe Code**:
```typescript
async function probeArrayBoundary(code: string): Promise<ProbeResult> {
  // Find array access patterns
  const arrayAccess = Array.from(
    code.matchAll(/(\w+)\[(\d+|[a-z]\w*)\]/g)
  );

  // Find length checks
  const lengthChecks = Array.from(
    code.matchAll(/\.length\s*[<>=!]/g)
  );

  // Find for loops
  const forLoops = Array.from(
    code.matchAll(/for\s*\(\s*let\s+\w+\s*=\s*0;\s*\w+\s*[<>=]+\s*(\w+\.length|\d+);/g)
  );

  // Check if indices are <= instead of <
  const potentialOffByOne = Array.from(
    code.matchAll(/\[.*?<=.*?\]/g)
  );

  return {
    confirmed: potentialOffByOne.length > 0 || forLoops.length > arrayAccess.length,
    evidence: [
      ...potentialOffByOne.slice(0, 2).map(p => `Potential off-by-one: ${p[0]}`),
      forLoops.length > 0 ? `${forLoops.length} for loops found` : null
    ].filter(Boolean),
    confidence: potentialOffByOne.length > 0 ? 80 : 50
  };
}
```

---

### Probe 7: Type Mismatch

**Hypothesis**: "Error is caused by comparing/using wrong type"

**When to Use**: "is not a function", type errors, NaN issues

**Probe Code**:
```typescript
async function probeTypeMismatch(code: string): Promise<ProbeResult> {
  // Find type-sensitive operations
  const typeOps = Array.from(
    code.matchAll(/(\w+)\.map\s*\(|(\w+)\.filter\s*\(|(\w+)\s*\+\s*(\w+)|(\w+)\s*===\s*(\w+)/g)
  );

  // Find type assertions/checks
  const typeChecks = Array.from(
    code.matchAll(/typeof\s+\w+|Array\.isArray|instanceof|Number\.isInteger/g)
  );

  // Find conversions
  const conversions = Array.from(
    code.matchAll(/String\(|Number\(|parseInt\(|Boolean\(/g)
  );

  const uncheckedOps = typeOps.length - (typeChecks.length + conversions.length);

  return {
    confirmed: uncheckedOps > 2,
    evidence: [
      `${typeOps.length} type-sensitive operations`,
      `${typeChecks.length} type checks`,
      `${uncheckedOps} potentially unsafe operations`
    ],
    confidence: Math.min(100, uncheckedOps * 15)
  };
}
```

---

### Probe 8: Variable Scope/Closure Issue

**Hypothesis**: "Error is caused by incorrect variable scope or closure"

**When to Use**: Unexpected variable values, closure-related bugs, global variable issues

**Probe Code**:
```typescript
async function probeVariableScope(code: string): Promise<ProbeResult> {
  // Find variables used outside their scope
  const declarations = new Map<string, number>();

  Array.from(code.matchAll(/(?:let|const|var)\s+(\w+)/g))
    .forEach(m => declarations.set(m[1], m.index));

  // Find usage in loops/callbacks
  const loopUsage = Array.from(
    code.matchAll(/for\s*\([^)]*\)\s*\{[^}]*(\w+)[^}]*\}/g)
  );

  // Find closure issues
  const closureIssues = loopUsage.filter(lu =>
    declarations.get(lu[1]) && declarations.get(lu[1]) < lu.index
  );

  // Find missing const/let
  const implicitGlobals = Array.from(
    code.matchAll(/(?<!(?:let|const|var)\s+)(\w+)\s*=/g)
  ).filter(m => !['if', 'for', 'while'].includes(m[1]));

  return {
    confirmed: closureIssues.length > 0 || implicitGlobals.length > 0,
    evidence: [
      ...closureIssues.slice(0, 2).map(ci => `Closure issue: ${ci[1]}`),
      ...implicitGlobals.slice(0, 2).map(ig => `Implicit global: ${ig[1]}`)
    ],
    confidence: closureIssues.length > 0 ? 85 : 65
  };
}
```

---

## Optional Probe Types (for advanced debugging)

### Probe 9: Performance Bottleneck

**Hypothesis**: "Slow performance due to inefficient algorithm"

```typescript
// O(n²) operations in loops
// Missing memoization
// Inefficient data structures
// Unnecessary re-renders
```

---

### Probe 10: Side Effect / Mutation

**Hypothesis**: "Error caused by unexpected mutation or side effect"

```typescript
// Direct object mutation (no copy)
// Array mutation (.push, .splice) without spread
// State mutation in Redux
// Unintended global variable modification
```

---

## Probe Library Architecture

```typescript
interface Probe {
  id: number;
  name: string;
  hypothesis: string;
  priority: number; // 1-8 (higher = try first)
  category: "type" | "logic" | "async" | "state" | "scope" | "perf";
  run: (code: string, context: string) => Promise<ProbeResult>;
}

interface ProbeResult {
  probeId: number;
  confirmed: boolean;           // Does this probe confirm the hypothesis?
  confidence: number;           // 0-100
  evidence: string[];           // Specific findings
  severity?: "critical" | "warning" | "info";
}

const PROBE_LIBRARY: Probe[] = [
  {
    id: 1,
    name: "String Comparison Mismatch",
    hypothesis: "Status/enum string values don't match",
    priority: 8,
    category: "logic",
    run: probeStringMismatch
  },
  {
    id: 2,
    name: "Null Safety",
    hypothesis: "Accessing properties on null/undefined",
    priority: 7,
    category: "type",
    run: probeNullSafety
  },
  {
    id: 3,
    name: "Async Race Condition",
    hypothesis: "Missing await or concurrent operations",
    priority: 7,
    category: "async",
    run: probeAsyncRaceCondition
  },
  {
    id: 4,
    name: "Unhandled Exception",
    hypothesis: "Missing error handling",
    priority: 6,
    category: "logic",
    run: probeErrorHandling
  },
  {
    id: 5,
    name: "State Update Timing",
    hypothesis: "State not updated when expected",
    priority: 6,
    category: "state",
    run: probeStateUpdateTiming
  },
  {
    id: 6,
    name: "Array Boundary",
    hypothesis: "Off-by-one or array access error",
    priority: 5,
    category: "logic",
    run: probeArrayBoundary
  },
  {
    id: 7,
    name: "Type Mismatch",
    hypothesis: "Using wrong type in operation",
    priority: 5,
    category: "type",
    run: probeTypeMismatch
  },
  {
    id: 8,
    name: "Variable Scope",
    hypothesis: "Incorrect variable scope or closure",
    priority: 4,
    category: "scope",
    run: probeVariableScope
  }
];
```

---

## Probe Execution Strategy

```typescript
async function runProbes(
  selectedProbes: Probe[],
  code: string,
  context: string
): Promise<ProbeResult[]> {
  // Run all probes in parallel via Groq
  const results = await Promise.all(
    selectedProbes.map(probe => {
      console.log(`[Probe ${probe.id}] ${probe.name}...`);
      return probe.run(code, context);
    })
  );

  return results;
}

// Execution time:
// - 8 probes × 1s (parallel) = 1s total (not 8s sequential)
// - Cost: 8 × $0.0001 = $0.0008
```

---

## Probe Selection by Complexity

```typescript
function selectProbes(complexity: "simple" | "moderate" | "complex"): Probe[] {
  switch (complexity) {
    case "simple":
      // Just the high-confidence probes
      return PROBE_LIBRARY.filter(p => p.priority >= 7);
      // 3-4 probes

    case "moderate":
      // Most probes
      return PROBE_LIBRARY.filter(p => p.priority >= 5);
      // 6-7 probes

    case "complex":
      // All probes
      return PROBE_LIBRARY;
      // 8 probes
  }
}
```

---

## Success Metrics

- **Accuracy**: Probes correctly identify root cause 90%+ of the time
- **Speed**: All probes complete in <2 seconds
- **Cost**: $0.0008 per probe run
- **False Positive Rate**: <10% (probe confirms but isn't the root cause)
- **False Negative Rate**: <5% (probe misses an actual issue)

---

**Status**: Ready for Implementation
