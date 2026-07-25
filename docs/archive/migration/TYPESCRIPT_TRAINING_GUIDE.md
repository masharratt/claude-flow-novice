# TypeScript Training Guide

**Version:** v2.16.0+
**Last Updated:** 2025-11-20
**Target Audience:** All Developers

## Table of Contents

1. [Learning Path Overview](#learning-path-overview)
2. [TypeScript Basics](#typescript-basics)
3. [CFN Loop Architecture](#cfn-loop-architecture)
4. [Hands-On Exercises](#hands-on-exercises)
5. [Debugging Techniques](#debugging-techniques)
6. [Best Practices](#best-practices)
7. [Resources and References](#resources-and-references)

---

## Learning Path Overview

### Beginner Track (4-8 hours)

**Prerequisites:** Basic JavaScript knowledge

**Topics:**
1. TypeScript fundamentals (2 hours)
2. CFN Loop TypeScript architecture (1 hour)
3. Using TypeScript CLI tools (1 hour)
4. Basic debugging (1 hour)
5. Hands-on exercises (3 hours)

**Outcome:** Can use TypeScript implementations effectively

### Intermediate Track (8-16 hours)

**Prerequisites:** Beginner track complete

**Topics:**
1. Advanced TypeScript types (2 hours)
2. CFN Loop module deep dive (2 hours)
3. Writing TypeScript modules (2 hours)
4. Testing TypeScript code (2 hours)
5. Advanced debugging (2 hours)
6. Hands-on project (6 hours)

**Outcome:** Can contribute to TypeScript codebase

### Advanced Track (16-24 hours)

**Prerequisites:** Intermediate track complete

**Topics:**
1. TypeScript architectural patterns (3 hours)
2. Performance optimization (3 hours)
3. Advanced testing strategies (3 hours)
4. Error handling patterns (2 hours)
5. Contributing guidelines (1 hour)
6. Capstone project (12 hours)

**Outcome:** Can design and implement complex TypeScript features

---

## TypeScript Basics

### Module 1: Types and Interfaces (1 hour)

#### Basic Types

```typescript
// Primitive types
let name: string = "John";
let age: number = 30;
let active: boolean = true;

// Arrays
let numbers: number[] = [1, 2, 3];
let strings: Array<string> = ["a", "b", "c"];

// Tuples
let tuple: [string, number] = ["hello", 42];

// Enums
enum Status {
  Active = "ACTIVE",
  Inactive = "INACTIVE",
  Pending = "PENDING"
}
let status: Status = Status.Active;

// Union types
let id: string | number = "abc-123";
id = 456;  // Also valid

// Literal types
type Mode = "MVP" | "Standard" | "Enterprise";
let mode: Mode = "Standard";
```

#### Interfaces

```typescript
// Interface definition
interface Agent {
  id: string;
  type: string;
  confidence: number;
  status: "spawned" | "running" | "completed";
}

// Interface usage
function spawnAgent(agent: Agent): void {
  console.log(`Spawning ${agent.type}`);
}

// Optional properties
interface SpawnOptions {
  taskId: string;
  agentId?: string;  // Optional
  timeout?: number;  // Optional
}

// Readonly properties
interface Config {
  readonly redisHost: string;
  readonly redisPort: number;
}

// Extending interfaces
interface ExtendedAgent extends Agent {
  metadata: Record<string, unknown>;
}
```

#### Type Aliases

```typescript
// Type alias
type AgentType = "backend-dev" | "tester" | "reviewer";

// Complex types
type Result<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};

// Usage
function parseResult<T>(result: Result<T>): T {
  if (result.success) {
    return result.data;
  }
  throw new Error(result.error);
}
```

**Exercise 1.1:** Define interfaces for coordination signals
```typescript
// TODO: Define CoordinationSignal interface
// Properties: signalName (string), taskId (string), data (any JSON)

// TODO: Define WaitOptions interface
// Properties: timeout (number, optional), retries (number, optional)
```

### Module 2: Functions and Async (1 hour)

#### Function Types

```typescript
// Function declaration with types
function add(a: number, b: number): number {
  return a + b;
}

// Arrow function
const multiply = (a: number, b: number): number => a * b;

// Optional parameters
function greet(name: string, greeting?: string): string {
  return `${greeting || "Hello"}, ${name}`;
}

// Default parameters
function delay(ms: number = 1000): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Rest parameters
function sum(...numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

// Function overloads
function process(value: string): string;
function process(value: number): number;
function process(value: string | number): string | number {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  return value * 2;
}
```

#### Async/Await

```typescript
// Async function
async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

// Error handling
async function safeSpawn(agentType: string): Promise<void> {
  try {
    await spawnAgent(agentType);
  } catch (error) {
    if (error instanceof SpawnError) {
      console.error(`Spawn failed: ${error.message}`);
    }
    throw error;
  }
}

// Promise.all for parallel execution
async function spawnMultiple(agents: string[]): Promise<void> {
  await Promise.all(agents.map(agent => spawnAgent(agent)));
}

// Promise.race for timeout
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}
```

**Exercise 2.1:** Implement async coordination wait
```typescript
// TODO: Implement waitForSignal function
// Parameters: signalName (string), timeout (number, default 300)
// Returns: Promise<void>
// Throws: TimeoutError if signal not received
```

### Module 3: Generics and Utility Types (1 hour)

#### Generics

```typescript
// Generic function
function identity<T>(value: T): T {
  return value;
}

// Generic interface
interface Response<T> {
  status: number;
  data: T;
}

// Generic class
class Cache<T> {
  private data: Map<string, T> = new Map();

  set(key: string, value: T): void {
    this.data.set(key, value);
  }

  get(key: string): T | undefined {
    return this.data.get(key);
  }
}

// Generic constraints
interface HasId {
  id: string;
}

function findById<T extends HasId>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}
```

#### Utility Types

```typescript
// Partial - make all properties optional
interface Config {
  host: string;
  port: number;
  timeout: number;
}
type PartialConfig = Partial<Config>;  // All properties optional

// Required - make all properties required
type RequiredConfig = Required<PartialConfig>;

// Pick - select specific properties
type ConnectionConfig = Pick<Config, 'host' | 'port'>;

// Omit - exclude specific properties
type ConfigWithoutTimeout = Omit<Config, 'timeout'>;

// Record - create object type with specific keys and values
type AgentStatus = Record<string, "spawned" | "running" | "completed">;

// Readonly - make all properties readonly
type ImmutableConfig = Readonly<Config>;
```

**Exercise 3.1:** Create generic Result type
```typescript
// TODO: Create Result<T> type that represents success or error
// Success: { success: true, data: T }
// Error: { success: false, error: Error }

// TODO: Create unwrap function that extracts data or throws error
```

---

## CFN Loop Architecture

### Module 4: TypeScript Module Structure (1 hour)

#### Directory Organization

```
src/
├── agent-spawner/           # Agent spawning logic
│   ├── agent-spawner.ts     # Main spawner implementation
│   ├── types.ts             # Type definitions
│   ├── index.ts             # Public exports
│   └── agent-spawner.test.ts
│
├── coordination/            # Redis coordination
│   ├── coordination-signal.ts
│   ├── coordination-wait.ts
│   ├── coordination-collect.ts
│   ├── types.ts
│   ├── index.ts
│   └── *.test.ts
│
├── validation/              # Quality gates
│   ├── test-executor.ts
│   ├── gate-checker.ts
│   ├── types.ts
│   ├── index.ts
│   └── *.test.ts
│
└── utils/                   # Shared utilities
    ├── logger.ts
    ├── redis-client.ts
    └── index.ts
```

#### Module Exports

```typescript
// src/agent-spawner/types.ts
export interface SpawnOptions {
  agentType: string;
  taskId: string;
  confidence?: number;
  agentId?: string;
}

export interface SpawnResult {
  agentId: string;
  pid: number;
  spawnTime: number;
}

// src/agent-spawner/agent-spawner.ts
import { SpawnOptions, SpawnResult } from './types';

export async function spawnAgent(options: SpawnOptions): Promise<SpawnResult> {
  // Implementation
}

// src/agent-spawner/index.ts
export * from './types';
export * from './agent-spawner';

// Usage in other modules
import { spawnAgent, SpawnOptions } from '../agent-spawner';
```

#### Dependency Injection

```typescript
// Bad: Hard-coded dependencies
export async function spawnAgent(agentType: string) {
  const redis = new Redis();  // Hard to test
  // ...
}

// Good: Dependency injection
export function createSpawner(redis: Redis) {
  return async function spawnAgent(agentType: string) {
    // Use injected redis
  };
}

// Usage
const redis = createRedisClient();
const spawner = createSpawner(redis);
await spawner('backend-dev');
```

**Exercise 4.1:** Explore agent-spawner module
```bash
# TODO: Read src/agent-spawner/types.ts
# TODO: Read src/agent-spawner/agent-spawner.ts
# TODO: Read src/agent-spawner/index.ts
# TODO: Run tests: npm test -- agent-spawner
```

### Module 5: Coordination Layer (1.5 hours)

#### Redis Coordination

```typescript
// src/coordination/coordination-signal.ts
import Redis from 'ioredis';

export interface SignalOptions {
  signalName: string;
  taskId: string;
  data?: Record<string, unknown>;
  ttl?: number;
}

export async function signal(
  redis: Redis,
  options: SignalOptions
): Promise<void> {
  const key = `coordination:${options.taskId}:${options.signalName}`;

  // Set signal with data
  await redis.set(key, JSON.stringify(options.data || {}));

  // Set TTL (default 1 hour)
  await redis.expire(key, options.ttl || 3600);

  // Publish to subscribers
  await redis.publish(`signals:${options.taskId}`, options.signalName);
}
```

```typescript
// src/coordination/coordination-wait.ts
export interface WaitOptions {
  signalName: string;
  taskId: string;
  timeout?: number;
}

export async function wait(
  redis: Redis,
  options: WaitOptions
): Promise<void> {
  const key = `coordination:${options.taskId}:${options.signalName}`;
  const timeout = options.timeout || 300;

  // Subscribe to signals
  const subscriber = redis.duplicate();
  await subscriber.subscribe(`signals:${options.taskId}`);

  // Wait for signal or timeout
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscriber.unsubscribe();
      reject(new Error(`Timeout waiting for ${options.signalName}`));
    }, timeout * 1000);

    subscriber.on('message', (channel, message) => {
      if (message === options.signalName) {
        clearTimeout(timer);
        subscriber.unsubscribe();
        resolve();
      }
    });
  });
}
```

**Exercise 5.1:** Implement coordination collect
```typescript
// TODO: Implement collectResults function
// Parameters: redis, taskId, agentIds, timeout
// Returns: Promise<Map<string, unknown>>
// Collects results from multiple agents
```

### Module 6: Validation and Testing (1.5 hours)

#### Test Execution

```typescript
// src/validation/test-executor.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TestResult {
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  duration: number;
}

export async function executeTests(
  testCommand: string
): Promise<TestResult> {
  const start = Date.now();

  try {
    const { stdout } = await execAsync(testCommand, {
      timeout: 600000  // 10 minutes
    });

    return parseTestOutput(stdout, Date.now() - start);
  } catch (error) {
    // Tests failed, parse output
    if (error.stdout) {
      return parseTestOutput(error.stdout, Date.now() - start);
    }
    throw error;
  }
}

function parseTestOutput(output: string, duration: number): TestResult {
  // Parse Jest/npm test output
  const passedMatch = output.match(/(\d+) passed/);
  const failedMatch = output.match(/(\d+) failed/);

  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  const total = passed + failed;

  return {
    passed,
    failed,
    total,
    passRate: total > 0 ? passed / total : 0,
    duration
  };
}
```

#### Quality Gates

```typescript
// src/validation/gate-checker.ts
export interface GateConfig {
  mode: "MVP" | "Standard" | "Enterprise";
  customThreshold?: number;
}

export interface GateResult {
  passed: boolean;
  actualRate: number;
  requiredRate: number;
  mode: string;
}

const THRESHOLDS: Record<string, number> = {
  MVP: 0.70,
  Standard: 0.95,
  Enterprise: 0.98
};

export function checkGate(
  testResult: TestResult,
  config: GateConfig
): GateResult {
  const requiredRate = config.customThreshold || THRESHOLDS[config.mode];
  const passed = testResult.passRate >= requiredRate;

  return {
    passed,
    actualRate: testResult.passRate,
    requiredRate,
    mode: config.mode
  };
}
```

**Exercise 6.1:** Test quality gate logic
```typescript
// TODO: Write tests for checkGate function
// Test cases:
// - MVP mode with 0.75 pass rate (should pass)
// - Standard mode with 0.90 pass rate (should fail)
// - Custom threshold 0.85 with 0.90 pass rate (should pass)
```

---

## Hands-On Exercises

### Exercise 1: Agent Spawning (30 minutes)

**Objective:** Spawn an agent using TypeScript

```typescript
// exercises/01-agent-spawning.ts
import { spawnAgent } from '../src/agent-spawner';

async function exercise1() {
  // TODO: Spawn a backend-dev agent
  // - Generate unique task ID
  // - Set confidence to 0.90
  // - Log spawn result

  // TODO: Handle errors
  // - Catch SpawnError
  // - Log error message
  // - Exit with code 1
}

exercise1();
```

**Expected output:**
```
Spawning agent: backend-dev
Task ID: abc-123
Agent ID: backend-001
Spawn time: 2.1s
```

### Exercise 2: Coordination Workflow (45 minutes)

**Objective:** Implement signal → wait → collect pattern

```typescript
// exercises/02-coordination.ts
import { signal, wait, collect } from '../src/coordination';
import { createRedisClient } from '../src/utils/redis-client';

async function exercise2() {
  const redis = createRedisClient();
  const taskId = 'test-' + Date.now();

  try {
    // TODO: Spawn 3 agents
    // TODO: Wait for all agents to signal completion
    // TODO: Collect results from all agents
    // TODO: Log combined results
  } finally {
    await redis.quit();
  }
}

exercise2();
```

**Expected output:**
```
Spawned 3 agents
Waiting for completion signals...
Agent backend-001 completed (confidence: 0.92)
Agent tester-002 completed (confidence: 0.88)
Agent reviewer-003 completed (confidence: 0.95)
Average confidence: 0.92
```

### Exercise 3: Quality Gate (30 minutes)

**Objective:** Execute tests and check quality gate

```typescript
// exercises/03-quality-gate.ts
import { executeTests } from '../src/validation/test-executor';
import { checkGate } from '../src/validation/gate-checker';

async function exercise3() {
  // TODO: Execute test suite
  const testResult = await executeTests('npm test');

  // TODO: Check Standard mode gate (0.95 threshold)
  const gateResult = checkGate(testResult, { mode: 'Standard' });

  // TODO: Log results
  console.log(`Tests: ${testResult.passed}/${testResult.total} passed`);
  console.log(`Pass rate: ${(testResult.passRate * 100).toFixed(1)}%`);
  console.log(`Gate: ${gateResult.passed ? 'PASSED' : 'FAILED'}`);

  // TODO: Exit with appropriate code
  process.exit(gateResult.passed ? 0 : 1);
}

exercise3();
```

### Exercise 4: Error Handling (45 minutes)

**Objective:** Implement custom errors and error handling

```typescript
// exercises/04-error-handling.ts

// TODO: Define custom error classes
class AgentSpawnError extends Error {
  constructor(message: string, public agentType: string) {
    super(message);
    this.name = 'AgentSpawnError';
  }
}

class CoordinationTimeoutError extends Error {
  constructor(message: string, public signalName: string) {
    super(message);
    this.name = 'CoordinationTimeoutError';
  }
}

// TODO: Implement retry logic
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  // Implement exponential backoff retry
}

// TODO: Test error handling
async function exercise4() {
  try {
    // Intentionally fail spawn
    await spawnAgent({ agentType: 'invalid-agent', taskId: 'test' });
  } catch (error) {
    if (error instanceof AgentSpawnError) {
      console.log(`Spawn failed for ${error.agentType}: ${error.message}`);
    }
  }
}
```

---

## Debugging Techniques

### Module 7: Debugging TypeScript (2 hours)

#### VSCode Debugging

**launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Agent Spawner",
      "program": "${workspaceFolder}/src/agent-spawner/index.ts",
      "preLaunchTask": "npm: build",
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "DEBUG": "cfn:*"
      }
    },
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Process",
      "port": 9229
    }
  ]
}
```

**Debugging workflow:**
1. Set breakpoints in TypeScript files
2. Press F5 to start debugging
3. Step through code (F10: step over, F11: step into)
4. Inspect variables in Debug panel
5. Use Debug Console for REPL

#### Console Debugging

```typescript
// Debug logging with debug module
import debug from 'debug';
const log = debug('cfn:spawner');

log('Spawning agent: %s', agentType);
log('Options: %O', options);  // %O for object pretty-print

// Conditional logging
if (process.env.DEBUG) {
  console.log('Detailed spawn info:', JSON.stringify(options, null, 2));
}

// Performance timing
console.time('spawn');
await spawnAgent(options);
console.timeEnd('spawn');  // spawn: 2.1s
```

#### Source Maps

```typescript
// Enable source maps in production
// node --enable-source-maps dist/file.js

// Stack trace with source maps
try {
  await riskyOperation();
} catch (error) {
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  // Shows TypeScript file:line instead of compiled JS
}
```

#### Profiling

```bash
# CPU profiling
node --prof dist/agent-spawner/index.js

# Generate report
node --prof-process isolate-*.log > profile.txt

# Heap profiling
node --inspect dist/agent-spawner/index.js
# Chrome DevTools → Memory → Take heap snapshot
```

**Exercise 7.1:** Debug agent spawning
```typescript
// TODO: Set breakpoint in spawnAgent function
// TODO: Step through execution
// TODO: Inspect options parameter
// TODO: Verify Redis connection
// TODO: Find and fix bug (intentional bug added)
```

---

## Best Practices

### Module 8: TypeScript Best Practices (2 hours)

#### Code Style

```typescript
// ✅ GOOD: Explicit types
function calculateConfidence(scores: number[]): number {
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ❌ BAD: Implicit any
function calculateConfidence(scores) {
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ✅ GOOD: Readonly for immutability
interface Config {
  readonly host: string;
  readonly port: number;
}

// ❌ BAD: Mutable config
interface Config {
  host: string;
  port: number;
}

// ✅ GOOD: Discriminated unions
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function handleResult<T>(result: Result<T>): T {
  if (result.success) {
    return result.data;  // TypeScript knows data exists
  }
  throw new Error(result.error);  // TypeScript knows error exists
}
```

#### Error Handling

```typescript
// ✅ GOOD: Custom error classes
class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ✅ GOOD: Type guards
function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

// Usage
try {
  validate(data);
} catch (error) {
  if (isValidationError(error)) {
    console.log(`Validation failed for ${error.field}`);
  } else {
    throw error;
  }
}
```

#### Async Patterns

```typescript
// ✅ GOOD: Promise.all for parallel execution
const [result1, result2, result3] = await Promise.all([
  fetchData1(),
  fetchData2(),
  fetchData3()
]);

// ❌ BAD: Sequential when parallel is possible
const result1 = await fetchData1();
const result2 = await fetchData2();
const result3 = await fetchData3();

// ✅ GOOD: Early return for error cases
async function processAgent(agentId: string): Promise<Result> {
  const agent = await findAgent(agentId);
  if (!agent) {
    return { success: false, error: 'Agent not found' };
  }

  const validated = await validate(agent);
  if (!validated) {
    return { success: false, error: 'Validation failed' };
  }

  return { success: true, data: agent };
}
```

**Exercise 8.1:** Refactor code to best practices
```typescript
// TODO: Refactor this code following best practices
function processData(data: any) {
  let result;
  if (data.type == "string") {
    result = data.value.toUpperCase();
  } else {
    result = data.value * 2;
  }
  return result;
}
```

---

## Resources and References

### Official Documentation

- **TypeScript Handbook:** https://www.typescriptlang.org/docs/handbook/
- **Node.js TypeScript Guide:** https://nodejs.org/en/docs/guides/typescript/
- **ioredis Documentation:** https://github.com/luin/ioredis
- **Jest TypeScript Guide:** https://jestjs.io/docs/getting-started#using-typescript

### Internal Documentation

- **Rollout Overview:** `docs/TYPESCRIPT_ROLLOUT_OVERVIEW.md`
- **Developer Guide:** `docs/DEVELOPER_TYPESCRIPT_MIGRATION_GUIDE.md`
- **Deprecation Timeline:** `docs/BASH_DEPRECATION_TIMELINE.md`
- **FAQ:** `docs/TYPESCRIPT_MIGRATION_FAQ.md`
- **Metrics Dashboard:** `docs/TYPESCRIPT_METRICS_DASHBOARD.md`

### Video Tutorials

- **TypeScript Fundamentals:** (2 hours, recorded)
- **CFN Loop Architecture:** (1.5 hours, recorded)
- **Debugging Techniques:** (1 hour, recorded)

### Live Training Sessions

- **Week 2:** TypeScript fundamentals (2 hours)
- **Week 4:** CFN Loop architecture (1.5 hours)
- **Week 6:** Debugging techniques (1 hour)
- **Week 11:** Best practices (1 hour)

### Code Examples

All exercises and examples available in:
- `exercises/` directory
- `src/` directory (production code)
- `tests/` directory (test examples)

### Community Support

- **Slack:** #typescript-migration
- **Office Hours:** Wed 2-3pm, Fri 4-5pm
- **Code Reviews:** Request via GitHub PR

---

## Certification

### Beginner Certification

**Requirements:**
- Complete Beginner Track (4-8 hours)
- Pass 10-question quiz (80% pass rate)
- Complete 3 hands-on exercises

**Certificate:** TypeScript CFN Loop Developer - Beginner

### Intermediate Certification

**Requirements:**
- Complete Intermediate Track (8-16 hours)
- Complete hands-on project (agent spawner enhancement)
- Code review approval

**Certificate:** TypeScript CFN Loop Developer - Intermediate

### Advanced Certification

**Requirements:**
- Complete Advanced Track (16-24 hours)
- Complete capstone project (new TypeScript module)
- Present solution to team
- Code review approval

**Certificate:** TypeScript CFN Loop Developer - Advanced

---

**Last Updated:** 2025-11-20
**Next Review:** 2025-12-01
**Document Owner:** CTO Agent

**Ready to start learning? Begin with Module 1: Types and Interfaces!**
