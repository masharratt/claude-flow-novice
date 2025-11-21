# MDAP Integration Implementation Plan

**Version:** 1.3.0
**Status:** Planning
**Dependencies:** Trigger.dev, CFN Loop v3, Playbook System, Rust Engine (future)

---

## Executive Summary

Integrate Massively Decomposed Agentic Processes (MDAP) into CFN Loop using Trigger.dev as the execution layer. Key features:
- 5-tier model escalation on failure
- Full metrics/eval tracking
- Speed vs cost weighting system
- Red-flagging and test-as-voter validation

---

## 1. Model Escalation Tiers

### Tier Configuration

| Tier | Model | Cost/1M tokens | Latency | Use Case |
|------|-------|----------------|---------|----------|
| T1 | `haiku` | $0.25 | ~500ms | Trivial: renames, single-line edits |
| T2 | `gpt-4.1-mini` | $0.40 | ~800ms | Simple: function edits, add params |
| T3 | `gpt-4.1` | $2.00 | ~1.2s | Medium: multi-function, refactors |
| T4 | `sonnet` | $3.00 | ~1.5s | Complex: architecture, security |
| T5 | `opus` | $15.00 | ~3s | Critical: core logic, escalation ceiling |

### Escalation Rules

```typescript
interface EscalationConfig {
  maxAttemptsPerTier: number;  // Default: 2
  escalationTriggers: string[];  // ["test_fail", "red_flag", "timeout"]
  skipTiers: boolean;  // Jump T1→T4 for known complex patterns
  cooldown: number;  // ms between retries at same tier
}

const defaultEscalation: EscalationConfig = {
  maxAttemptsPerTier: 2,
  escalationTriggers: ["test_fail", "red_flag", "syntax_error"],
  skipTiers: false,
  cooldown: 100
};
```

### Escalation Flow

```
T1 (haiku) → fail → retry T1 → fail →
T2 (mini)  → fail → retry T2 → fail →
T3 (gpt4)  → fail → retry T3 → fail →
T4 (sonnet)→ fail → retry T4 → fail →
T5 (opus)  → fail → ABORT with diagnostics
```

---

## 2. Speed vs Cost Weighting System

### Weight Profiles

```typescript
interface TaskProfile {
  name: string;
  speedWeight: number;     // 0.0 - 1.0
  costWeight: number;      // 0.0 - 1.0 (speedWeight + costWeight = 1.0)
  maxLatencyMs: number;    // Hard ceiling
  maxCostUsd: number;      // Hard ceiling
  parallelism: number;     // Max concurrent micro-tasks
  startTier: 1 | 2 | 3 | 4 | 5;  // Skip cheap tiers for speed
}

const profiles: Record<string, TaskProfile> = {
  "realtime": {
    name: "Real-time (speed priority)",
    speedWeight: 0.9,
    costWeight: 0.1,
    maxLatencyMs: 5000,
    maxCostUsd: 1.00,
    parallelism: 10,
    startTier: 3  // Skip haiku/mini, start at gpt-4.1
  },
  "balanced": {
    name: "Balanced",
    speedWeight: 0.5,
    costWeight: 0.5,
    maxLatencyMs: 30000,
    maxCostUsd: 0.25,
    parallelism: 5,
    startTier: 1
  },
  "budget": {
    name: "Budget (cost priority)",
    speedWeight: 0.1,
    costWeight: 0.9,
    maxLatencyMs: 120000,
    maxCostUsd: 0.05,
    parallelism: 2,
    startTier: 1
  },
  "critical": {
    name: "Critical (accuracy priority)",
    speedWeight: 0.3,
    costWeight: 0.2,
    // Implicit: accuracy weight = 0.5
    maxLatencyMs: 60000,
    maxCostUsd: 2.00,
    parallelism: 3,
    startTier: 4  // Start at sonnet for critical
  }
};
```

### Dynamic Tier Selection

```typescript
function selectStartTier(
  profile: TaskProfile,
  complexity: "trivial" | "simple" | "medium" | "complex" | "critical",
  playbook: PlaybookEntry | null
): number {
  // 1. Playbook recommendation (historical success)
  if (playbook?.recommended_tier) {
    return playbook.recommended_tier;
  }

  // 2. Complexity-based default
  const complexityTier = {
    trivial: 1,
    simple: 1,
    medium: 2,
    complex: 3,
    critical: 4
  }[complexity];

  // 3. Apply profile constraint
  const profileTier = profile.startTier;

  // 4. Speed pressure: if maxLatency tight, skip cheap tiers
  const speedPressure = profile.maxLatencyMs < 10000 ? 2 : 0;

  return Math.max(complexityTier, profileTier) + speedPressure;
}
```

---

## 3. Task Decomposition Strategy

### 3.1 Decomposition Architecture

The decomposition system uses a two-phase approach: **intent parsing** followed by **code-aware splitting**.

```typescript
interface DecompositionStrategy {
  // Phase 1: Parse natural language into structured intent
  parseIntent(description: string): TaskIntent;

  // Phase 2: Map intent to code regions using AST analysis
  findAffectedRegions(codebase: CodebaseIndex, intent: TaskIntent): CodeRegion[];

  // Phase 3: Generate ordered micro-tasks with dependencies
  generateMicroTasks(regions: CodeRegion[], intent: TaskIntent): SubtaskDAG;
}

interface TaskIntent {
  action: "add" | "modify" | "delete" | "refactor" | "fix";
  scope: "function" | "class" | "module" | "file" | "cross-file";
  targets: string[];           // Function/class/module names
  constraints: string[];       // "must not break API", "maintain types"
  acceptanceCriteria: string[];
}

interface CodeRegion {
  file: string;
  startLine: number;
  endLine: number;
  type: "function" | "class" | "block" | "import" | "export";
  name: string;
  dependencies: string[];      // Other regions this depends on
  dependents: string[];        // Regions that depend on this
}

interface SubtaskDAG {
  tasks: MicroTask[];
  edges: Array<[string, string]>;  // [prerequisite, dependent]
  batches: MicroTask[][];          // Topologically sorted for parallel execution
}
```

### 3.2 Intent Parser Implementation

```typescript
// trigger-dev/utils/intent-parser.ts
import { task } from "@trigger.dev/sdk/v3";

export const parseTaskIntent = task({
  id: "mdap-parse-intent",

  run: async (payload: { description: string; codebaseContext: string }) => {
    // Use T3 model for decomposition (needs understanding)
    const response = await llm.complete({
      model: "gpt-4.1",
      messages: [{
        role: "system",
        content: INTENT_PARSER_PROMPT
      }, {
        role: "user",
        content: `Task: ${payload.description}\n\nCodebase context:\n${payload.codebaseContext}`
      }],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.content) as TaskIntent;
  }
});

const INTENT_PARSER_PROMPT = `
You are a code task decomposition expert. Parse the user's task into structured intent.

Output JSON with:
{
  "action": "add|modify|delete|refactor|fix",
  "scope": "function|class|module|file|cross-file",
  "targets": ["functionName", "ClassName", "module/path"],
  "constraints": ["preserve backward compatibility", "maintain types"],
  "acceptanceCriteria": ["tests pass", "no type errors"],
  "estimatedSteps": number,
  "complexity": "trivial|simple|medium|complex|critical"
}

Be conservative with complexity estimates. A single function change is "trivial".
Cross-file refactoring is "complex". Security-sensitive changes are "critical".
`;
```

### 3.3 Code Region Finder (AST-Based)

```typescript
// trigger-dev/utils/code-region-finder.ts
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

interface CodebaseIndex {
  files: Map<string, ParsedFile>;
  symbols: Map<string, SymbolLocation[]>;
  imports: Map<string, ImportGraph>;
}

export async function findAffectedRegions(
  index: CodebaseIndex,
  intent: TaskIntent
): Promise<CodeRegion[]> {
  const regions: CodeRegion[] = [];

  for (const target of intent.targets) {
    // Find symbol locations
    const locations = index.symbols.get(target) || [];

    for (const loc of locations) {
      const file = index.files.get(loc.file);
      if (!file) continue;

      // Get AST node for this symbol
      const node = findNodeAtPosition(file.ast, loc.line, loc.column);
      if (!node) continue;

      // Expand to containing function/class
      const container = findContainingScope(node);

      regions.push({
        file: loc.file,
        startLine: container.startPosition.row,
        endLine: container.endPosition.row,
        type: classifyNode(container),
        name: extractName(container),
        dependencies: findDependencies(container, index),
        dependents: findDependents(target, index)
      });
    }
  }

  // Add transitive dependencies based on scope
  if (intent.scope === "cross-file") {
    const transitive = expandTransitiveDependencies(regions, index);
    regions.push(...transitive);
  }

  return deduplicateRegions(regions);
}

function findDependencies(node: Parser.SyntaxNode, index: CodebaseIndex): string[] {
  const deps: string[] = [];

  // Walk AST to find all identifiers
  const cursor = node.walk();
  do {
    if (cursor.nodeType === "identifier" || cursor.nodeType === "property_identifier") {
      const name = cursor.currentNode.text;
      // Check if this identifier is defined elsewhere
      if (index.symbols.has(name)) {
        deps.push(name);
      }
    }
  } while (cursor.gotoNextSibling() || cursor.gotoParent());

  return [...new Set(deps)];
}
```

### 3.4 Micro-Task Generator

```typescript
// trigger-dev/utils/microtask-generator.ts
export function generateMicroTasks(
  regions: CodeRegion[],
  intent: TaskIntent
): SubtaskDAG {
  const tasks: MicroTask[] = [];
  const edges: Array<[string, string]> = [];

  // Generate one task per region
  for (const region of regions) {
    const taskId = `mt-${region.file}-${region.name}-${Date.now()}`;

    tasks.push({
      id: taskId,
      type: mapIntentToTaskType(intent.action),
      region,
      prompt: generateMicroPrompt(region, intent),
      expectedOutputFormat: "unified_diff",
      maxDiffLines: calculateMaxDiff(region, intent),
      validationRules: generateValidationRules(region, intent)
    });

    // Add dependency edges
    for (const dep of region.dependencies) {
      const depTask = tasks.find(t => t.region.name === dep);
      if (depTask) {
        edges.push([depTask.id, taskId]);
      }
    }
  }

  // Topological sort into batches
  const batches = topologicalSort(tasks, edges);

  return { tasks, edges, batches };
}

function generateMicroPrompt(region: CodeRegion, intent: TaskIntent): string {
  return `
## Task
${intent.action.toUpperCase()} the ${region.type} "${region.name}"

## Constraints
${intent.constraints.map(c => `- ${c}`).join('\n')}

## Current Code (${region.file}:${region.startLine}-${region.endLine})
\`\`\`
{CODE_PLACEHOLDER}
\`\`\`

## Output Format
Respond with ONLY a unified diff. No explanation.
The diff must apply cleanly to the code above.
`;
}

function calculateMaxDiff(region: CodeRegion, intent: TaskIntent): number {
  const regionSize = region.endLine - region.startLine;

  switch (intent.action) {
    case "add": return regionSize * 2;      // Can double size
    case "modify": return regionSize * 1.5; // 50% change allowed
    case "delete": return regionSize;       // Can remove entirely
    case "refactor": return regionSize * 3; // Major restructuring OK
    case "fix": return Math.min(regionSize * 0.3, 20); // Small fixes only
    default: return regionSize;
  }
}
```

---

## 4. Context Extraction

### 4.1 Smart Context Window

```typescript
// trigger-dev/utils/context-extractor.ts
interface ContextWindow {
  primary: string;           // The code region being modified
  imports: string;           // Relevant import statements
  types: string;             // Type definitions used
  callers: string;           // Functions that call this (for API stability)
  callees: string;           // Functions this calls (for understanding)
  tests: string;             // Related test code
  totalTokens: number;
}

export async function extractContext(
  region: CodeRegion,
  index: CodebaseIndex,
  maxTokens: number = 4000
): Promise<ContextWindow> {
  const context: ContextWindow = {
    primary: "",
    imports: "",
    types: "",
    callers: "",
    callees: "",
    tests: "",
    totalTokens: 0
  };

  // 1. Primary region (required)
  const file = await fs.readFile(region.file, "utf-8");
  const lines = file.split("\n");
  context.primary = lines.slice(region.startLine, region.endLine + 1).join("\n");
  context.totalTokens += countTokens(context.primary);

  // 2. Imports (high priority)
  const imports = extractImports(lines);
  const relevantImports = filterRelevantImports(imports, context.primary);
  context.imports = relevantImports.join("\n");
  context.totalTokens += countTokens(context.imports);

  // 3. Type definitions (medium priority)
  if (context.totalTokens < maxTokens * 0.6) {
    const types = await findTypeDefinitions(region, index);
    context.types = truncateToFit(types, maxTokens * 0.15);
    context.totalTokens += countTokens(context.types);
  }

  // 4. Callers (for API stability awareness)
  if (context.totalTokens < maxTokens * 0.75) {
    const callers = await findCallers(region.name, index);
    context.callers = truncateToFit(
      callers.map(c => `// Called by: ${c.file}:${c.line}\n${c.snippet}`).join("\n\n"),
      maxTokens * 0.1
    );
    context.totalTokens += countTokens(context.callers);
  }

  // 5. Callees (for understanding)
  if (context.totalTokens < maxTokens * 0.85) {
    const callees = await findCallees(context.primary, index);
    context.callees = truncateToFit(
      callees.map(c => `// Calls: ${c.name}\n${c.signature}`).join("\n"),
      maxTokens * 0.08
    );
    context.totalTokens += countTokens(context.callees);
  }

  // 6. Related tests (lowest priority, but valuable)
  if (context.totalTokens < maxTokens * 0.95) {
    const tests = await findRelatedTests(region, index);
    context.tests = truncateToFit(tests, maxTokens - context.totalTokens);
    context.totalTokens += countTokens(context.tests);
  }

  return context;
}

function formatContextForPrompt(context: ContextWindow): string {
  let formatted = "";

  if (context.imports) {
    formatted += `## Imports\n\`\`\`\n${context.imports}\n\`\`\`\n\n`;
  }

  if (context.types) {
    formatted += `## Type Definitions\n\`\`\`\n${context.types}\n\`\`\`\n\n`;
  }

  formatted += `## Code to Modify\n\`\`\`\n${context.primary}\n\`\`\`\n\n`;

  if (context.callers) {
    formatted += `## Callers (maintain API compatibility)\n${context.callers}\n\n`;
  }

  if (context.callees) {
    formatted += `## Called Functions\n${context.callees}\n\n`;
  }

  if (context.tests) {
    formatted += `## Related Tests\n\`\`\`\n${context.tests}\n\`\`\`\n\n`;
  }

  return formatted;
}
```

### 4.2 Codebase Indexing

```typescript
// trigger-dev/utils/codebase-indexer.ts
export async function buildCodebaseIndex(rootDir: string): Promise<CodebaseIndex> {
  const index: CodebaseIndex = {
    files: new Map(),
    symbols: new Map(),
    imports: new Map()
  };

  const files = await glob("**/*.{ts,tsx,js,jsx}", { cwd: rootDir });

  for (const file of files) {
    const content = await fs.readFile(path.join(rootDir, file), "utf-8");
    const parser = new Parser();
    parser.setLanguage(TypeScript);
    const ast = parser.parse(content);

    index.files.set(file, { content, ast });

    // Extract symbols
    extractSymbols(ast.rootNode, file, index.symbols);

    // Build import graph
    extractImportGraph(ast.rootNode, file, index.imports);
  }

  return index;
}

function extractSymbols(
  node: Parser.SyntaxNode,
  file: string,
  symbols: Map<string, SymbolLocation[]>
): void {
  const cursor = node.walk();

  do {
    const type = cursor.nodeType;

    if (type === "function_declaration" ||
        type === "method_definition" ||
        type === "class_declaration" ||
        type === "interface_declaration" ||
        type === "type_alias_declaration") {

      const nameNode = cursor.currentNode.childForFieldName("name");
      if (nameNode) {
        const name = nameNode.text;
        const locations = symbols.get(name) || [];
        locations.push({
          file,
          line: cursor.currentNode.startPosition.row,
          column: cursor.currentNode.startPosition.column,
          type: type as any
        });
        symbols.set(name, locations);
      }
    }
  } while (cursor.gotoNextSibling() || cursor.gotoFirstChild() || cursor.gotoParent());
}
```

---

## 5. Red-Flag Detection

### 5.1 Red-Flag Heuristics

```typescript
// trigger-dev/utils/red-flag-detector.ts
interface RedFlagResult {
  flagged: boolean;
  reason: string | null;
  severity: "low" | "medium" | "high";
  details: Record<string, any>;
}

interface RedFlagConfig {
  maxDiffLines: number;           // Default: 100
  maxDiffRatio: number;           // Default: 2.0 (can't more than double code)
  maxFilesChanged: number;        // Default: 1 (micro-task = single file)
  forbiddenPatterns: RegExp[];    // Patterns that indicate runaway generation
  requiredPatterns: RegExp[];     // Patterns that must be present
  maxResponseLength: number;      // Default: 5000 chars
  minResponseLength: number;      // Default: 10 chars
}

const DEFAULT_RED_FLAGS: RedFlagConfig = {
  maxDiffLines: 100,
  maxDiffRatio: 2.0,
  maxFilesChanged: 1,
  forbiddenPatterns: [
    /TODO.*implement/i,           // Placeholder code
    /\.\.\.$/m,                   // Truncated output
    /\[\[.*\]\]/,                 // Template variables not filled
    /FIXME.*later/i,              // Deferred work
    /console\.log\(/,             // Debug statements (configurable)
    /any\s*[;,)]/,                // TypeScript `any` type
  ],
  requiredPatterns: [
    /^[-+@]/m,                    // Must have diff markers
  ],
  maxResponseLength: 5000,
  minResponseLength: 10
};

export function redFlagCheck(
  response: string,
  originalCode: string,
  config: RedFlagConfig = DEFAULT_RED_FLAGS
): RedFlagResult {
  // 1. Response length checks
  if (response.length < config.minResponseLength) {
    return {
      flagged: true,
      reason: "response_too_short",
      severity: "high",
      details: { length: response.length, minimum: config.minResponseLength }
    };
  }

  if (response.length > config.maxResponseLength) {
    return {
      flagged: true,
      reason: "response_too_long",
      severity: "medium",
      details: { length: response.length, maximum: config.maxResponseLength }
    };
  }

  // 2. Diff format validation
  const diffLines = response.split("\n").filter(l => /^[-+]/.test(l));
  if (diffLines.length === 0) {
    return {
      flagged: true,
      reason: "invalid_diff_format",
      severity: "high",
      details: { message: "No diff markers found" }
    };
  }

  // 3. Diff size check
  if (diffLines.length > config.maxDiffLines) {
    return {
      flagged: true,
      reason: "diff_too_large",
      severity: "medium",
      details: { lines: diffLines.length, maximum: config.maxDiffLines }
    };
  }

  // 4. Ratio check (additions vs original)
  const originalLines = originalCode.split("\n").length;
  const addedLines = diffLines.filter(l => l.startsWith("+")).length;
  const ratio = addedLines / originalLines;

  if (ratio > config.maxDiffRatio) {
    return {
      flagged: true,
      reason: "excessive_additions",
      severity: "medium",
      details: { ratio, maximum: config.maxDiffRatio, addedLines, originalLines }
    };
  }

  // 5. Forbidden patterns
  for (const pattern of config.forbiddenPatterns) {
    if (pattern.test(response)) {
      return {
        flagged: true,
        reason: "forbidden_pattern",
        severity: "low",
        details: { pattern: pattern.source }
      };
    }
  }

  // 6. Required patterns
  for (const pattern of config.requiredPatterns) {
    if (!pattern.test(response)) {
      return {
        flagged: true,
        reason: "missing_required_pattern",
        severity: "medium",
        details: { pattern: pattern.source }
      };
    }
  }

  // 7. Syntax validation (try to parse the result)
  try {
    const patchedCode = applyDiff(originalCode, response);
    const parser = new Parser();
    parser.setLanguage(TypeScript);
    const ast = parser.parse(patchedCode);

    if (ast.rootNode.hasError) {
      return {
        flagged: true,
        reason: "syntax_error",
        severity: "high",
        details: { message: "Patched code has syntax errors" }
      };
    }
  } catch (e) {
    return {
      flagged: true,
      reason: "patch_apply_failed",
      severity: "high",
      details: { error: e.message }
    };
  }

  return { flagged: false, reason: null, severity: "low", details: {} };
}
```

---

## 6. Test Selection (Impacted Tests)

### 6.1 Test Impact Analysis

```typescript
// trigger-dev/utils/test-selector.ts
interface TestMapping {
  testFile: string;
  testName: string;
  coversFiles: string[];
  coversSymbols: string[];
  lastRun: Date;
  lastResult: "pass" | "fail" | "skip";
  avgDurationMs: number;
}

export async function selectImpactedTests(
  changedRegions: CodeRegion[],
  testMappings: TestMapping[]
): Promise<TestMapping[]> {
  const impacted: Set<TestMapping> = new Set();

  for (const region of changedRegions) {
    // 1. File-based matching
    const fileTests = testMappings.filter(t =>
      t.coversFiles.includes(region.file)
    );
    fileTests.forEach(t => impacted.add(t));

    // 2. Symbol-based matching
    const symbolTests = testMappings.filter(t =>
      t.coversSymbols.includes(region.name)
    );
    symbolTests.forEach(t => impacted.add(t));

    // 3. Naming convention matching
    const conventionTests = testMappings.filter(t => {
      const baseName = path.basename(region.file, path.extname(region.file));
      return t.testFile.includes(baseName) ||
             t.testFile.includes(`${baseName}.test`) ||
             t.testFile.includes(`${baseName}.spec`);
    });
    conventionTests.forEach(t => impacted.add(t));
  }

  // Sort by duration (run fast tests first)
  return [...impacted].sort((a, b) => a.avgDurationMs - b.avgDurationMs);
}

// Build test mappings from coverage data
export async function buildTestMappings(
  coverageDir: string
): Promise<TestMapping[]> {
  const mappings: TestMapping[] = [];

  const coverageFiles = await glob("**/*.json", { cwd: coverageDir });

  for (const file of coverageFiles) {
    const coverage = JSON.parse(
      await fs.readFile(path.join(coverageDir, file), "utf-8")
    );

    // Parse Jest/Vitest coverage format
    for (const [testFile, data] of Object.entries(coverage)) {
      const coveredFiles = Object.keys(data.statementMap || {});
      const coveredSymbols = extractCoveredSymbols(data);

      mappings.push({
        testFile,
        testName: path.basename(testFile),
        coversFiles: coveredFiles,
        coversSymbols: coveredSymbols,
        lastRun: new Date(),
        lastResult: "pass",
        avgDurationMs: data.duration || 1000
      });
    }
  }

  return mappings;
}
```

### 6.2 Test Runner Integration

```typescript
// trigger-dev/utils/test-runner.ts
interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  passRate: number;
  duration: number;
  failures: TestFailure[];
}

interface TestFailure {
  testName: string;
  testFile: string;
  error: string;
  stack?: string;
}

export async function runImpactedTests(
  patch: string,
  changedRegions: CodeRegion[],
  testMappings: TestMapping[]
): Promise<TestResult> {
  // 1. Select impacted tests
  const impactedTests = await selectImpactedTests(changedRegions, testMappings);

  if (impactedTests.length === 0) {
    // No specific tests found - run related by convention
    return runConventionBasedTests(changedRegions);
  }

  // 2. Apply patch to temp directory
  const tempDir = await createTempWorkspace();
  await applyPatchToWorkspace(patch, tempDir);

  // 3. Run only impacted tests
  const testFiles = impactedTests.map(t => t.testFile);
  const result = await execAsync(
    `npx vitest run ${testFiles.join(" ")} --reporter=json`,
    { cwd: tempDir, timeout: 60000 }
  );

  // 4. Parse results
  const jsonResult = JSON.parse(result.stdout);

  return {
    passed: jsonResult.numPassedTests,
    failed: jsonResult.numFailedTests,
    skipped: jsonResult.numPendingTests,
    total: jsonResult.numTotalTests,
    passRate: jsonResult.numPassedTests / jsonResult.numTotalTests,
    duration: jsonResult.startTime ? Date.now() - jsonResult.startTime : 0,
    failures: extractFailures(jsonResult)
  };
}
```

---

## 7. Loop 2 Validator Integration

### 7.1 Micro-Patch Aggregation for Review

```typescript
// trigger-dev/utils/patch-aggregator.ts
interface AggregatedReview {
  taskId: string;
  totalMicroTasks: number;
  completedMicroTasks: number;
  aggregatedDiff: string;          // Combined diff for review
  affectedFiles: string[];
  testSummary: TestResult;
  riskAreas: RiskAssessment[];
  reviewPrompt: string;
}

interface RiskAssessment {
  file: string;
  region: string;
  risk: "low" | "medium" | "high";
  reason: string;
}

export function aggregateForLoop2Review(
  microResults: MicroTaskResult[],
  testResults: TestResult
): AggregatedReview {
  // 1. Combine all diffs
  const allDiffs = microResults
    .filter(r => r.success)
    .map(r => `# ${r.microTask.region.file}\n${r.patch}`)
    .join("\n\n");

  // 2. Identify affected files
  const affectedFiles = [...new Set(
    microResults.map(r => r.microTask.region.file)
  )];

  // 3. Assess risk areas
  const riskAreas = assessRiskAreas(microResults);

  // 4. Generate review prompt
  const reviewPrompt = generateValidatorPrompt(
    allDiffs,
    testResults,
    riskAreas
  );

  return {
    taskId: microResults[0]?.microTask.id.split("-")[1] || "unknown",
    totalMicroTasks: microResults.length,
    completedMicroTasks: microResults.filter(r => r.success).length,
    aggregatedDiff: allDiffs,
    affectedFiles,
    testSummary: testResults,
    riskAreas,
    reviewPrompt
  };
}

function generateValidatorPrompt(
  diff: string,
  tests: TestResult,
  risks: RiskAssessment[]
): string {
  return `
## Review Request

### Changes (${diff.split("\n").filter(l => /^[-+]/.test(l)).length} lines)

\`\`\`diff
${diff}
\`\`\`

### Test Results
- Passed: ${tests.passed}/${tests.total} (${(tests.passRate * 100).toFixed(1)}%)
- Duration: ${tests.duration}ms

### Risk Areas
${risks.map(r => `- **${r.risk.toUpperCase()}** ${r.file}:${r.region} - ${r.reason}`).join("\n")}

### Validation Checklist
1. Does the code change match the task intent?
2. Are there any security concerns?
3. Is the code maintainable and follows project conventions?
4. Are there edge cases not covered by tests?
5. Is the API backward compatible (if applicable)?

### Your Assessment
Provide a score 0.0-1.0 and brief justification.
`;
}
```

### 7.2 Validator Scaling

```typescript
// Validators see aggregated changes, not individual micro-tasks
export const loop2ValidatorWorkflow = task({
  id: "mdap-loop2-validator",

  run: async (payload: {
    taskId: string;
    aggregatedReview: AggregatedReview;
    validatorType: string;
  }) => {
    // Validator reviews the AGGREGATED diff, not micro-patches
    const response = await llm.complete({
      model: selectValidatorModel(payload.validatorType),
      messages: [{
        role: "system",
        content: VALIDATOR_SYSTEM_PROMPT
      }, {
        role: "user",
        content: payload.aggregatedReview.reviewPrompt
      }]
    });

    const score = parseValidatorScore(response.content);

    return {
      validatorType: payload.validatorType,
      score,
      feedback: response.content,
      reviewedFiles: payload.aggregatedReview.affectedFiles.length,
      reviewedLines: payload.aggregatedReview.aggregatedDiff.split("\n").length
    };
  }
});
```

---

## 8. Model Provider Routing

### 8.1 Provider Configuration

```typescript
// trigger-dev/config/providers.ts
interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  models: Record<string, ModelMapping>;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  costPer1MTokens: {
    input: number;
    output: number;
  };
}

interface ModelMapping {
  internalName: string;    // Our tier name (T1-T5)
  providerModel: string;   // Provider's model ID
  maxTokens: number;
  supportsJson: boolean;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    models: {
      T1: { internalName: "haiku", providerModel: "claude-3-haiku-20240307", maxTokens: 4096, supportsJson: true },
      T4: { internalName: "sonnet", providerModel: "claude-sonnet-4-20250514", maxTokens: 8192, supportsJson: true },
      T5: { internalName: "opus", providerModel: "claude-3-opus-20240229", maxTokens: 4096, supportsJson: true }
    },
    rateLimit: { requestsPerMinute: 1000, tokensPerMinute: 100000 },
    costPer1MTokens: { input: 0.25, output: 1.25 }
  },
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    models: {
      T2: { internalName: "gpt-4.1-mini", providerModel: "gpt-4.1-mini", maxTokens: 16384, supportsJson: true },
      T3: { internalName: "gpt-4.1", providerModel: "gpt-4.1", maxTokens: 8192, supportsJson: true }
    },
    rateLimit: { requestsPerMinute: 500, tokensPerMinute: 150000 },
    costPer1MTokens: { input: 2.50, output: 10.00 }
  },
  zai: {
    name: "Z.ai",
    baseUrl: process.env.ZAI_BASE_URL || "https://api.z.ai",
    apiKeyEnv: "ZAI_API_KEY",
    models: {
      T1: { internalName: "haiku", providerModel: "haiku-fast", maxTokens: 4096, supportsJson: true },
      T2: { internalName: "mini", providerModel: "gpt-4.1-mini", maxTokens: 16384, supportsJson: true }
    },
    rateLimit: { requestsPerMinute: 2000, tokensPerMinute: 500000 },
    costPer1MTokens: { input: 0.10, output: 0.40 }  // Significant savings
  }
};

// Tier → Provider routing
const TIER_ROUTING: Record<number, string> = {
  1: "zai",        // Cheapest for T1
  2: "zai",        // Z.ai has gpt-4.1-mini
  3: "openai",     // OpenAI for T3
  4: "anthropic",  // Sonnet
  5: "anthropic"   // Opus
};
```

### 8.2 Unified LLM Client

```typescript
// trigger-dev/utils/llm-client.ts
export class UnifiedLLMClient {
  private providers: Map<string, ProviderConfig>;

  async complete(options: {
    tier: number;
    messages: Message[];
    responseFormat?: "json" | "text";
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const providerName = TIER_ROUTING[options.tier];
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`No provider configured for tier ${options.tier}`);
    }

    const modelConfig = provider.models[`T${options.tier}`];

    // Route to appropriate provider
    switch (providerName) {
      case "anthropic":
        return this.callAnthropic(provider, modelConfig, options);
      case "openai":
        return this.callOpenAI(provider, modelConfig, options);
      case "zai":
        return this.callZai(provider, modelConfig, options);
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  private async callAnthropic(
    provider: ProviderConfig,
    model: ModelMapping,
    options: CompletionOptions
  ): Promise<LLMResponse> {
    const response = await fetch(`${provider.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env[provider.apiKeyEnv]!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: model.providerModel,
        max_tokens: options.maxTokens || model.maxTokens,
        messages: options.messages
      })
    });

    const data = await response.json();

    return {
      content: data.content[0].text,
      tokensIn: data.usage.input_tokens,
      tokensOut: data.usage.output_tokens,
      costUsd: this.calculateCost(provider, data.usage),
      model: model.providerModel,
      provider: provider.name
    };
  }
}
```

---

## 9. Unified Metrics & Cost Tracking

### 9.1 Postgres Schema (trigger.dev Native)

```sql
-- All metrics in trigger.dev's Postgres (unified with trigger.dev internals)
-- This replaces Redis/SQLite tracking

CREATE TABLE mdap_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,           -- Parent CFN task
  micro_task_id TEXT NOT NULL,     -- Individual micro-task
  trigger_job_id TEXT,             -- Link to trigger.dev job

  -- Execution context
  profile TEXT NOT NULL,
  complexity TEXT NOT NULL,

  -- Model progression
  attempts JSONB NOT NULL,
  final_tier INT NOT NULL,
  final_model TEXT NOT NULL,
  final_provider TEXT NOT NULL,

  -- Outcomes
  success BOOLEAN NOT NULL,
  red_flagged BOOLEAN DEFAULT FALSE,
  escalation_count INT DEFAULT 0,

  -- Timing
  total_latency_ms INT NOT NULL,
  per_tier_latency JSONB,

  -- Cost (unified tracking)
  total_cost_usd DECIMAL(10,6) NOT NULL,
  per_tier_cost JSONB,
  tokens_input INT,
  tokens_output INT,

  -- Quality signals
  test_pass_rate DECIMAL(3,2),
  diff_size_lines INT,
  complexity_score DECIMAL(3,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregated model performance (auto-updated by trigger)
CREATE TABLE mdap_model_stats (
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  complexity TEXT NOT NULL,
  profile TEXT NOT NULL,

  total_attempts INT DEFAULT 0,
  success_count INT DEFAULT 0,
  success_rate DECIMAL(5,4),

  avg_latency_ms INT,
  p50_latency_ms INT,
  p95_latency_ms INT,

  avg_cost_usd DECIMAL(10,6),
  total_cost_usd DECIMAL(12,4),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (model, provider, complexity, profile)
);

-- Cost allocation by task (for department budgets)
CREATE TABLE mdap_cost_allocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  department TEXT,
  project TEXT,

  total_cost_usd DECIMAL(10,4) NOT NULL,
  cost_breakdown JSONB,            -- {T1: 0.02, T2: 0.05, ...}

  micro_tasks_count INT,
  success_rate DECIMAL(5,4),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_dept ON mdap_cost_allocation(department);
CREATE INDEX idx_cost_project ON mdap_cost_allocation(project);
```

### 9.2 Real-time Cost Tracking

```typescript
// trigger-dev/utils/cost-tracker.ts
export class CostTracker {
  private db: Pool;  // trigger.dev's Postgres connection
  private runningCosts: Map<string, number> = new Map();

  async trackAttempt(
    taskId: string,
    microTaskId: string,
    attempt: AttemptRecord
  ): Promise<void> {
    // Update running cost
    const currentCost = this.runningCosts.get(taskId) || 0;
    this.runningCosts.set(taskId, currentCost + attempt.costUsd);

    // Persist to Postgres
    await this.db.query(`
      INSERT INTO mdap_executions (task_id, micro_task_id, attempts, ...)
      VALUES ($1, $2, $3, ...)
      ON CONFLICT (micro_task_id)
      DO UPDATE SET attempts = mdap_executions.attempts || $3
    `, [taskId, microTaskId, JSON.stringify([attempt])]);
  }

  async checkBudget(taskId: string, profile: TaskProfile): Promise<boolean> {
    const currentCost = this.runningCosts.get(taskId) || 0;
    return currentCost < profile.maxCostUsd;
  }

  async finalize(taskId: string, department?: string): Promise<void> {
    const totalCost = this.runningCosts.get(taskId) || 0;

    await this.db.query(`
      INSERT INTO mdap_cost_allocation (task_id, department, total_cost_usd, ...)
      VALUES ($1, $2, $3, ...)
    `, [taskId, department, totalCost]);

    // Update model stats
    await this.updateModelStats(taskId);

    this.runningCosts.delete(taskId);
  }
}
```

---

## 10. Playbook Integration

### 10.1 Extended Playbook Schema

```typescript
// Playbook now includes micro-task patterns
interface PlaybookEntry {
  // Existing fields
  taskPattern: string;
  successRate: number;
  avgCost: number;

  // NEW: MDAP-specific fields
  mdapConfig?: {
    recommendedProfile: string;
    recommendedStartTier: number;
    optimalParallelism: number;
    expectedMicroTasks: number;
    commonDecompositionPatterns: string[];

    // Per-complexity success data
    tierSuccessRates: Record<number, number>;  // T1: 0.6, T2: 0.8, ...

    // Red-flag patterns specific to this task type
    customRedFlags?: string[];

    // Test selection hints
    criticalTestPatterns?: string[];
  };
}
```

### 10.2 Playbook Learning

```typescript
// trigger-dev/utils/playbook-learner.ts
export async function updatePlaybookWithMdapLearnings(
  taskId: string,
  taskDescription: string,
  results: MicroTaskResult[]
): Promise<void> {
  // 1. Compute optimal configurations from results
  const tierSuccessRates = computeTierSuccessRates(results);
  const optimalStartTier = findOptimalStartTier(tierSuccessRates);
  const avgMicroTasks = results.length;

  // 2. Extract decomposition patterns that worked
  const successfulPatterns = results
    .filter(r => r.success && r.attempts.length === 1)  // First try successes
    .map(r => r.microTask.type);

  // 3. Identify red-flags that caught real issues
  const effectiveRedFlags = results
    .filter(r => r.redFlagged && r.escalationResult?.success)
    .map(r => r.redFlagReason);

  // 4. Update playbook
  await db.playbook.upsert({
    where: { taskPattern: extractPattern(taskDescription) },
    update: {
      mdapConfig: {
        recommendedStartTier: optimalStartTier,
        tierSuccessRates,
        expectedMicroTasks: avgMicroTasks,
        commonDecompositionPatterns: successfulPatterns,
        customRedFlags: effectiveRedFlags
      }
    },
    create: {
      taskPattern: extractPattern(taskDescription),
      mdapConfig: { /* ... */ }
    }
  });
}
```

---

## 11. Rust Engine Refactor

### Rationale

Replace Trigger.dev's Node.js execution layer with a custom Rust engine while keeping TypeScript/YAML for task definitions. Benefits:
- 10-100x lower latency on task dispatch
- 5-10x lower memory per worker
- Predictable performance (no GC pauses)
- Higher task density per server

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Task Definitions (YAML/TS)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ coding.yaml │  │  seo.yaml   │  │ content.yaml│          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└──────────────────────────┬──────────────────────────────────┘
                           │ Config loader
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Rust Execution Engine                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Scheduler                          │   │
│  │  • DAG resolution       • Priority queues            │   │
│  │  • Dependency tracking  • Batch formation            │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Executor Pool                        │   │
│  │  • Async task runners   • Tier escalation FSM        │   │
│  │  • Timeout management   • Circuit breakers           │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Metrics Collector                    │   │
│  │  • Zero-copy metrics    • Ring buffers               │   │
│  │  • Async DB writes      • Prometheus export          │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  State Manager                        │   │
│  │  • Redis coordination   • Checkpointing              │   │
│  │  • Recovery/replay      • Distributed locks          │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ gRPC/HTTP
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ LLM APIs│  │ Redis   │  │Postgres │  │ Workers │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Rust Crate Structure

```
cfn-engine/
├── Cargo.toml
├── crates/
│   ├── cfn-core/              # Core types, traits
│   │   ├── src/
│   │   │   ├── task.rs        # Task definition structs
│   │   │   ├── tier.rs        # Model tier enum
│   │   │   ├── profile.rs     # TaskProfile (realtime, budget, etc)
│   │   │   ├── metrics.rs     # Metrics types
│   │   │   └── error.rs       # Error types
│   │   └── Cargo.toml
│   │
│   ├── cfn-scheduler/         # DAG scheduler
│   │   ├── src/
│   │   │   ├── dag.rs         # Dependency graph
│   │   │   ├── queue.rs       # Priority queue impl
│   │   │   ├── batch.rs       # Batch formation
│   │   │   └── scheduler.rs   # Main scheduler loop
│   │   └── Cargo.toml
│   │
│   ├── cfn-executor/          # Task execution
│   │   ├── src/
│   │   │   ├── pool.rs        # Worker pool
│   │   │   ├── runner.rs      # Single task runner
│   │   │   ├── escalation.rs  # Tier escalation FSM
│   │   │   ├── timeout.rs     # Timeout handling
│   │   │   └── circuit.rs     # Circuit breaker
│   │   └── Cargo.toml
│   │
│   ├── cfn-metrics/           # Metrics collection
│   │   ├── src/
│   │   │   ├── collector.rs   # Metrics aggregation
│   │   │   ├── buffer.rs      # Ring buffer impl
│   │   │   ├── export.rs      # Prometheus/DB export
│   │   │   └── eval.rs        # Eval scoring
│   │   └── Cargo.toml
│   │
│   ├── cfn-state/             # State management
│   │   ├── src/
│   │   │   ├── redis.rs       # Redis coordination
│   │   │   ├── checkpoint.rs  # Checkpointing
│   │   │   ├── recovery.rs    # Crash recovery
│   │   │   └── lock.rs        # Distributed locks
│   │   └── Cargo.toml
│   │
│   ├── cfn-config/            # Config loading
│   │   ├── src/
│   │   │   ├── yaml.rs        # YAML task parser
│   │   │   ├── validate.rs    # Config validation
│   │   │   └── hot_reload.rs  # Runtime config reload
│   │   └── Cargo.toml
│   │
│   └── cfn-api/               # External API
│       ├── src/
│       │   ├── grpc.rs        # gRPC server
│       │   ├── http.rs        # REST endpoints
│       │   └── websocket.rs   # Real-time updates
│       └── Cargo.toml
│
└── src/
    └── main.rs                # Binary entrypoint
```

### Core Types

```rust
// cfn-core/src/tier.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ModelTier {
    T1Haiku = 1,
    T2Mini = 2,
    T3Gpt4 = 3,
    T4Sonnet = 4,
    T5Opus = 5,
}

impl ModelTier {
    pub fn cost_per_million(&self) -> f64 {
        match self {
            Self::T1Haiku => 0.25,
            Self::T2Mini => 0.40,
            Self::T3Gpt4 => 2.00,
            Self::T4Sonnet => 3.00,
            Self::T5Opus => 15.00,
        }
    }

    pub fn next(&self) -> Option<Self> {
        match self {
            Self::T1Haiku => Some(Self::T2Mini),
            Self::T2Mini => Some(Self::T3Gpt4),
            Self::T3Gpt4 => Some(Self::T4Sonnet),
            Self::T4Sonnet => Some(Self::T5Opus),
            Self::T5Opus => None,
        }
    }
}

// cfn-core/src/profile.rs
#[derive(Debug, Clone)]
pub struct TaskProfile {
    pub name: String,
    pub speed_weight: f32,
    pub cost_weight: f32,
    pub max_latency_ms: u64,
    pub max_cost_usd: f64,
    pub parallelism: usize,
    pub start_tier: ModelTier,
}

pub static PROFILES: Lazy<HashMap<&str, TaskProfile>> = Lazy::new(|| {
    let mut m = HashMap::new();
    m.insert("realtime", TaskProfile {
        name: "realtime".into(),
        speed_weight: 0.9,
        cost_weight: 0.1,
        max_latency_ms: 5_000,
        max_cost_usd: 1.00,
        parallelism: 10,
        start_tier: ModelTier::T3Gpt4,
    });
    m.insert("budget", TaskProfile {
        name: "budget".into(),
        speed_weight: 0.1,
        cost_weight: 0.9,
        max_latency_ms: 120_000,
        max_cost_usd: 0.05,
        parallelism: 2,
        start_tier: ModelTier::T1Haiku,
    });
    m
});
```

### Escalation State Machine

```rust
// cfn-executor/src/escalation.rs
pub struct EscalationFSM {
    current_tier: ModelTier,
    attempts_at_tier: u8,
    max_attempts_per_tier: u8,
    total_cost: f64,
    total_latency_ms: u64,
    budget: &TaskProfile,
}

impl EscalationFSM {
    pub fn new(profile: &TaskProfile) -> Self {
        Self {
            current_tier: profile.start_tier,
            attempts_at_tier: 0,
            max_attempts_per_tier: 2,
            total_cost: 0.0,
            total_latency_ms: 0,
            budget: profile,
        }
    }

    pub fn record_attempt(&mut self, cost: f64, latency_ms: u64) {
        self.total_cost += cost;
        self.total_latency_ms += latency_ms;
        self.attempts_at_tier += 1;
    }

    pub fn next_action(&mut self) -> EscalationAction {
        // Budget exceeded
        if self.total_cost >= self.budget.max_cost_usd {
            return EscalationAction::Abort(AbortReason::BudgetExceeded);
        }

        // Latency exceeded
        if self.total_latency_ms >= self.budget.max_latency_ms {
            return EscalationAction::Abort(AbortReason::LatencyExceeded);
        }

        // Retry at current tier
        if self.attempts_at_tier < self.max_attempts_per_tier {
            return EscalationAction::Retry(self.current_tier);
        }

        // Escalate to next tier
        match self.current_tier.next() {
            Some(next) => {
                self.current_tier = next;
                self.attempts_at_tier = 0;
                EscalationAction::Escalate(next)
            }
            None => EscalationAction::Abort(AbortReason::AllTiersExhausted),
        }
    }
}

pub enum EscalationAction {
    Retry(ModelTier),
    Escalate(ModelTier),
    Abort(AbortReason),
}

pub enum AbortReason {
    BudgetExceeded,
    LatencyExceeded,
    AllTiersExhausted,
}
```

### Scheduler (Lock-Free Queue)

```rust
// cfn-scheduler/src/queue.rs
use crossbeam::queue::SegQueue;

pub struct TaskQueue {
    high_priority: SegQueue<MicroTask>,   // realtime profile
    normal: SegQueue<MicroTask>,          // balanced
    low_priority: SegQueue<MicroTask>,    // budget
}

impl TaskQueue {
    pub fn enqueue(&self, task: MicroTask) {
        match task.profile.name.as_str() {
            "realtime" | "critical" => self.high_priority.push(task),
            "budget" => self.low_priority.push(task),
            _ => self.normal.push(task),
        }
    }

    pub fn dequeue(&self) -> Option<MicroTask> {
        self.high_priority.pop()
            .or_else(|| self.normal.pop())
            .or_else(|| self.low_priority.pop())
    }
}
```

### Resource Footprint Comparison

| Metric | Node.js (Trigger.dev) | Rust Engine |
|--------|----------------------|-------------|
| Memory per worker | 100-500 MB | 10-50 MB |
| Startup time | 2-5s | <100ms |
| Task dispatch latency | 5-20ms | <1ms |
| Tasks/sec (single core) | 1-5k | 50-100k |
| GC pauses | 10-100ms | 0 |
| Binary size | N/A (runtime) | ~15 MB |

### Footprint at Scale

**10,000 concurrent micro-tasks:**

| Resource | Node.js | Rust |
|----------|---------|------|
| Workers needed | 50-100 | 5-10 |
| Memory total | 5-50 GB | 500 MB - 1 GB |
| Servers (8 core) | 6-12 | 1-2 |
| Monthly cost (AWS) | $500-1000 | $50-100 |

### Dependencies (Cargo.toml)

```toml
[workspace]
members = ["crates/*"]

[workspace.dependencies]
tokio = { version = "1.35", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_yaml = "0.9"
serde_json = "1.0"
redis = { version = "0.24", features = ["tokio-comp"] }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio"] }
tonic = "0.10"                    # gRPC
axum = "0.7"                      # HTTP
crossbeam = "0.8"                 # Lock-free structures
dashmap = "5.5"                   # Concurrent HashMap
metrics = "0.22"                  # Metrics facade
metrics-exporter-prometheus = "0.13"
tracing = "0.1"
tracing-subscriber = "0.3"
thiserror = "1.0"
anyhow = "1.0"
once_cell = "1.19"
```

### Rust Engine Implementation Phases

**Phase R1: Core Types & Config (1 week)**
- [ ] cfn-core crate (types, traits)
- [ ] cfn-config crate (YAML loader)
- [ ] Unit tests for tier/profile logic

**Phase R2: Scheduler (1 week)**
- [ ] DAG resolution
- [ ] Priority queues
- [ ] Batch formation
- [ ] Scheduler loop

**Phase R3: Executor (2 weeks)**
- [ ] Worker pool with tokio
- [ ] Escalation FSM
- [ ] Timeout handling
- [ ] Circuit breaker
- [ ] LLM API clients (reqwest)

**Phase R4: State & Metrics (1 week)**
- [ ] Redis coordination
- [ ] Checkpointing
- [ ] Metrics collector
- [ ] Prometheus export

**Phase R5: API Layer (1 week)**
- [ ] gRPC service definitions
- [ ] REST endpoints
- [ ] WebSocket streaming

**Phase R6: Integration (1 week)**
- [ ] CFN Loop integration
- [ ] Playbook queries
- [ ] Docker containerization
- [ ] Load testing

**Total Rust Engine: 7-8 weeks**

### LLM Client with Retry & Circuit Breaker

```rust
// cfn-executor/src/llm_client.rs
use std::time::{Duration, Instant};
use tokio::time::sleep;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct LLMClient {
    client: Client,
    circuit_breaker: Arc<CircuitBreaker>,
    providers: HashMap<String, ProviderConfig>,
}

#[derive(Clone)]
pub struct ProviderConfig {
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub models: HashMap<ModelTier, String>,
    pub cost_per_million: CostConfig,
}

#[derive(Clone)]
pub struct CostConfig {
    pub input: f64,
    pub output: f64,
}

pub struct CircuitBreaker {
    state: RwLock<CircuitState>,
    failure_threshold: u32,
    recovery_timeout: Duration,
}

#[derive(Clone)]
enum CircuitState {
    Closed { failures: u32 },
    Open { opened_at: Instant },
    HalfOpen,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, recovery_timeout: Duration) -> Self {
        Self {
            state: RwLock::new(CircuitState::Closed { failures: 0 }),
            failure_threshold,
            recovery_timeout,
        }
    }

    pub async fn check(&self) -> Result<(), CircuitBreakerError> {
        let state = self.state.read().await;
        match *state {
            CircuitState::Open { opened_at } => {
                if opened_at.elapsed() >= self.recovery_timeout {
                    drop(state);
                    let mut state = self.state.write().await;
                    *state = CircuitState::HalfOpen;
                    Ok(())
                } else {
                    Err(CircuitBreakerError::Open)
                }
            }
            _ => Ok(()),
        }
    }

    pub async fn record_success(&self) {
        let mut state = self.state.write().await;
        *state = CircuitState::Closed { failures: 0 };
    }

    pub async fn record_failure(&self) {
        let mut state = self.state.write().await;
        match *state {
            CircuitState::Closed { failures } => {
                if failures + 1 >= self.failure_threshold {
                    *state = CircuitState::Open { opened_at: Instant::now() };
                } else {
                    *state = CircuitState::Closed { failures: failures + 1 };
                }
            }
            CircuitState::HalfOpen => {
                *state = CircuitState::Open { opened_at: Instant::now() };
            }
            _ => {}
        }
    }
}

impl LLMClient {
    pub async fn complete(
        &self,
        tier: ModelTier,
        messages: Vec<Message>,
        max_retries: u32,
    ) -> Result<LLMResponse, LLMError> {
        // Tier → Provider routing
        let provider_name = match tier {
            ModelTier::T1Haiku | ModelTier::T2Mini => "zai",
            ModelTier::T3Gpt4 => "openai",
            ModelTier::T4Sonnet | ModelTier::T5Opus => "anthropic",
        };

        let provider = self.providers.get(provider_name)
            .ok_or(LLMError::ProviderNotFound)?;

        let model = provider.models.get(&tier)
            .ok_or(LLMError::ModelNotFound)?;

        // Retry with exponential backoff
        let mut attempt = 0;
        let mut last_error = None;

        while attempt <= max_retries {
            // Circuit breaker check
            if let Err(e) = self.circuit_breaker.check().await {
                return Err(LLMError::CircuitOpen);
            }

            match self.call_provider(provider, model, &messages).await {
                Ok(response) => {
                    self.circuit_breaker.record_success().await;
                    return Ok(response);
                }
                Err(e) => {
                    self.circuit_breaker.record_failure().await;
                    last_error = Some(e);
                    attempt += 1;

                    if attempt <= max_retries {
                        // Exponential backoff: 100ms, 200ms, 400ms, 800ms...
                        let delay = Duration::from_millis(100 * (1 << attempt));
                        sleep(delay).await;
                    }
                }
            }
        }

        Err(last_error.unwrap_or(LLMError::Unknown))
    }

    async fn call_provider(
        &self,
        provider: &ProviderConfig,
        model: &str,
        messages: &[Message],
    ) -> Result<LLMResponse, LLMError> {
        let response = match provider.name.as_str() {
            "anthropic" => self.call_anthropic(provider, model, messages).await?,
            "openai" | "zai" => self.call_openai_compatible(provider, model, messages).await?,
            _ => return Err(LLMError::ProviderNotFound),
        };
        Ok(response)
    }

    async fn call_anthropic(
        &self,
        provider: &ProviderConfig,
        model: &str,
        messages: &[Message],
    ) -> Result<LLMResponse, LLMError> {
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "messages": messages
        });

        let resp = self.client
            .post(format!("{}/v1/messages", provider.base_url))
            .header("x-api-key", &provider.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| LLMError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(LLMError::ApiError(resp.status().as_u16()));
        }

        let data: AnthropicResponse = resp.json().await
            .map_err(|e| LLMError::ParseError(e.to_string()))?;

        Ok(LLMResponse {
            content: data.content[0].text.clone(),
            tokens_in: data.usage.input_tokens,
            tokens_out: data.usage.output_tokens,
            cost_usd: calculate_cost(
                data.usage.input_tokens,
                data.usage.output_tokens,
                &provider.cost_per_million
            ),
            model: model.to_string(),
            provider: provider.name.clone(),
        })
    }

    async fn call_openai_compatible(
        &self,
        provider: &ProviderConfig,
        model: &str,
        messages: &[Message],
    ) -> Result<LLMResponse, LLMError> {
        let body = serde_json::json!({
            "model": model,
            "messages": messages
        });

        let resp = self.client
            .post(format!("{}/chat/completions", provider.base_url))
            .bearer_auth(&provider.api_key)
            .json(&body)
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| LLMError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(LLMError::ApiError(resp.status().as_u16()));
        }

        let data: OpenAIResponse = resp.json().await
            .map_err(|e| LLMError::ParseError(e.to_string()))?;

        let choice = data.choices.first()
            .ok_or(LLMError::EmptyResponse)?;

        Ok(LLMResponse {
            content: choice.message.content.clone(),
            tokens_in: data.usage.prompt_tokens,
            tokens_out: data.usage.completion_tokens,
            cost_usd: calculate_cost(
                data.usage.prompt_tokens,
                data.usage.completion_tokens,
                &provider.cost_per_million
            ),
            model: model.to_string(),
            provider: provider.name.clone(),
        })
    }
}

fn calculate_cost(input: u32, output: u32, config: &CostConfig) -> f64 {
    (input as f64 / 1_000_000.0 * config.input) +
    (output as f64 / 1_000_000.0 * config.output)
}
```

### Tree-Sitter AST Integration

```rust
// cfn-core/src/ast.rs
use tree_sitter::{Parser, Tree, Node, Language};
use std::collections::HashMap;

extern "C" { fn tree_sitter_typescript() -> Language; }

pub struct ASTParser {
    parser: Parser,
}

#[derive(Debug, Clone)]
pub struct CodeRegion {
    pub file: String,
    pub start_line: usize,
    pub end_line: usize,
    pub region_type: RegionType,
    pub name: String,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RegionType {
    Function,
    Class,
    Interface,
    TypeAlias,
    Block,
    Import,
    Export,
}

impl ASTParser {
    pub fn new() -> Result<Self, ASTError> {
        let mut parser = Parser::new();
        let language = unsafe { tree_sitter_typescript() };
        parser.set_language(language)
            .map_err(|_| ASTError::LanguageSetup)?;
        Ok(Self { parser })
    }

    pub fn parse(&mut self, source: &str) -> Result<Tree, ASTError> {
        self.parser.parse(source, None)
            .ok_or(ASTError::ParseFailed)
    }

    pub fn extract_regions(&mut self, file: &str, source: &str) -> Result<Vec<CodeRegion>, ASTError> {
        let tree = self.parse(source)?;
        let root = tree.root_node();
        let mut regions = Vec::new();

        self.walk_node(&root, source, file, &mut regions);
        Ok(regions)
    }

    fn walk_node(&self, node: &Node, source: &str, file: &str, regions: &mut Vec<CodeRegion>) {
        let kind = node.kind();

        let region_type = match kind {
            "function_declaration" | "arrow_function" | "method_definition" => Some(RegionType::Function),
            "class_declaration" => Some(RegionType::Class),
            "interface_declaration" => Some(RegionType::Interface),
            "type_alias_declaration" => Some(RegionType::TypeAlias),
            "import_statement" => Some(RegionType::Import),
            "export_statement" => Some(RegionType::Export),
            _ => None,
        };

        if let Some(region_type) = region_type {
            let name = self.extract_name(node, source).unwrap_or_default();
            let deps = self.extract_dependencies(node, source);

            regions.push(CodeRegion {
                file: file.to_string(),
                start_line: node.start_position().row,
                end_line: node.end_position().row,
                region_type,
                name,
                dependencies: deps,
            });
        }

        // Recurse into children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_node(&child, source, file, regions);
        }
    }

    fn extract_name(&self, node: &Node, source: &str) -> Option<String> {
        let name_node = node.child_by_field_name("name")?;
        let name = &source[name_node.start_byte()..name_node.end_byte()];
        Some(name.to_string())
    }

    fn extract_dependencies(&self, node: &Node, source: &str) -> Vec<String> {
        let mut deps = Vec::new();
        let mut cursor = node.walk();

        // Walk all descendants looking for identifiers
        fn collect_identifiers(node: &Node, source: &str, deps: &mut Vec<String>) {
            if node.kind() == "identifier" || node.kind() == "property_identifier" {
                let text = &source[node.start_byte()..node.end_byte()];
                deps.push(text.to_string());
            }
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                collect_identifiers(&child, source, deps);
            }
        }

        collect_identifiers(node, source, &mut deps);
        deps.sort();
        deps.dedup();
        deps
    }

    pub fn find_symbol(&mut self, source: &str, symbol: &str) -> Option<(usize, usize)> {
        let tree = self.parse(source).ok()?;
        self.find_symbol_in_node(&tree.root_node(), source, symbol)
    }

    fn find_symbol_in_node(&self, node: &Node, source: &str, symbol: &str) -> Option<(usize, usize)> {
        let name = self.extract_name(node, source);
        if name.as_deref() == Some(symbol) {
            return Some((node.start_position().row, node.end_position().row));
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if let Some(result) = self.find_symbol_in_node(&child, source, symbol) {
                return Some(result);
            }
        }
        None
    }
}
```

### Validator Runner

```rust
// cfn-executor/src/validator.rs
use std::process::Command;
use std::time::Duration;
use tokio::time::timeout;

#[derive(Debug, Clone)]
pub struct ValidatorConfig {
    pub name: String,
    pub command: String,
    pub timeout_ms: u64,
}

#[derive(Debug)]
pub struct ValidatorResult {
    pub name: String,
    pub passed: bool,
    pub output: String,
    pub duration_ms: u64,
    pub exit_code: Option<i32>,
}

pub struct ValidatorRunner {
    work_dir: PathBuf,
}

impl ValidatorRunner {
    pub fn new(work_dir: PathBuf) -> Self {
        Self { work_dir }
    }

    pub async fn run_validators(
        &self,
        validators: &[ValidatorConfig],
        context: &HashMap<String, String>,
    ) -> Vec<ValidatorResult> {
        let mut results = Vec::new();

        for validator in validators {
            let result = self.run_single(validator, context).await;
            results.push(result);

            // Early exit on critical failure
            if !result.passed && validator.name == "typecheck" {
                break;
            }
        }

        results
    }

    async fn run_single(
        &self,
        validator: &ValidatorConfig,
        context: &HashMap<String, String>,
    ) -> ValidatorResult {
        let start = std::time::Instant::now();

        // Interpolate command with context
        let command = self.interpolate_command(&validator.command, context);

        let timeout_duration = Duration::from_millis(validator.timeout_ms);

        let result = timeout(timeout_duration, async {
            tokio::process::Command::new("sh")
                .arg("-c")
                .arg(&command)
                .current_dir(&self.work_dir)
                .output()
                .await
        }).await;

        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(Ok(output)) => ValidatorResult {
                name: validator.name.clone(),
                passed: output.status.success(),
                output: String::from_utf8_lossy(&output.stdout).to_string()
                    + &String::from_utf8_lossy(&output.stderr),
                duration_ms,
                exit_code: output.status.code(),
            },
            Ok(Err(e)) => ValidatorResult {
                name: validator.name.clone(),
                passed: false,
                output: format!("Execution error: {}", e),
                duration_ms,
                exit_code: None,
            },
            Err(_) => ValidatorResult {
                name: validator.name.clone(),
                passed: false,
                output: format!("Timeout after {}ms", validator.timeout_ms),
                duration_ms: validator.timeout_ms,
                exit_code: None,
            },
        }
    }

    fn interpolate_command(&self, template: &str, context: &HashMap<String, String>) -> String {
        let mut result = template.to_string();
        for (key, value) in context {
            result = result.replace(&format!("{{{}}}", key), value);
        }
        result
    }

    pub fn compute_pass_rate(&self, results: &[ValidatorResult]) -> f64 {
        if results.is_empty() {
            return 1.0;
        }
        let passed = results.iter().filter(|r| r.passed).count();
        passed as f64 / results.len() as f64
    }
}
```

### Playbook Integration

```rust
// cfn-state/src/playbook.rs
use sqlx::PgPool;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybookEntry {
    pub task_pattern: String,
    pub success_rate: f64,
    pub avg_cost: f64,
    pub recommended_profile: String,
    pub recommended_start_tier: i32,
    pub optimal_parallelism: i32,
    pub expected_micro_tasks: i32,
    pub tier_success_rates: HashMap<i32, f64>,
    pub custom_red_flags: Vec<String>,
    pub critical_test_patterns: Vec<String>,
}

pub struct PlaybookService {
    pool: PgPool,
    cache: DashMap<String, (PlaybookEntry, Instant)>,
    cache_ttl: Duration,
}

impl PlaybookService {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            cache: DashMap::new(),
            cache_ttl: Duration::from_secs(300), // 5 min cache
        }
    }

    pub async fn query(&self, task_description: &str) -> Option<PlaybookEntry> {
        // Check cache first
        let pattern = self.extract_pattern(task_description);
        if let Some(entry) = self.cache.get(&pattern) {
            if entry.1.elapsed() < self.cache_ttl {
                return Some(entry.0.clone());
            }
        }

        // Query database
        let row = sqlx::query_as!(
            PlaybookRow,
            r#"
            SELECT task_pattern, success_rate, avg_cost, mdap_config
            FROM playbook_entries
            WHERE task_pattern ILIKE $1
            ORDER BY success_rate DESC
            LIMIT 1
            "#,
            format!("%{}%", pattern)
        )
        .fetch_optional(&self.pool)
        .await
        .ok()??;

        let entry = self.parse_entry(row)?;

        // Cache result
        self.cache.insert(pattern, (entry.clone(), Instant::now()));

        Some(entry)
    }

    pub async fn record_result(
        &self,
        task_description: &str,
        results: &[MicroTaskResult],
    ) -> Result<(), sqlx::Error> {
        let pattern = self.extract_pattern(task_description);

        // Compute stats from results
        let success_rate = results.iter()
            .filter(|r| r.success)
            .count() as f64 / results.len() as f64;

        let total_cost: f64 = results.iter()
            .map(|r| r.cost_usd)
            .sum();

        let tier_success = self.compute_tier_success_rates(results);
        let optimal_start = self.find_optimal_start_tier(&tier_success);

        sqlx::query!(
            r#"
            INSERT INTO playbook_entries (
                task_pattern, success_rate, avg_cost, mdap_config
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (task_pattern) DO UPDATE SET
                success_rate = (playbook_entries.success_rate * 0.8 + $2 * 0.2),
                avg_cost = (playbook_entries.avg_cost * 0.8 + $3 * 0.2),
                mdap_config = $4,
                updated_at = NOW()
            "#,
            pattern,
            success_rate,
            total_cost / results.len() as f64,
            serde_json::json!({
                "recommended_start_tier": optimal_start,
                "tier_success_rates": tier_success,
                "expected_micro_tasks": results.len(),
            })
        )
        .execute(&self.pool)
        .await?;

        // Invalidate cache
        self.cache.remove(&pattern);

        Ok(())
    }

    fn extract_pattern(&self, description: &str) -> String {
        // Extract key verbs and nouns for pattern matching
        let keywords: Vec<&str> = description
            .to_lowercase()
            .split_whitespace()
            .filter(|w| w.len() > 3)
            .filter(|w| !["the", "and", "for", "with", "that", "this"].contains(w))
            .take(5)
            .collect();

        keywords.join(" ")
    }

    fn compute_tier_success_rates(&self, results: &[MicroTaskResult]) -> HashMap<i32, f64> {
        let mut tier_attempts: HashMap<i32, (u32, u32)> = HashMap::new();

        for result in results {
            for attempt in &result.attempts {
                let entry = tier_attempts.entry(attempt.tier).or_insert((0, 0));
                entry.0 += 1; // total
                if attempt.success {
                    entry.1 += 1; // successes
                }
            }
        }

        tier_attempts.into_iter()
            .map(|(tier, (total, success))| (tier, success as f64 / total as f64))
            .collect()
    }

    fn find_optimal_start_tier(&self, rates: &HashMap<i32, f64>) -> i32 {
        // Find lowest tier with ≥60% success rate
        for tier in 1..=5 {
            if rates.get(&tier).copied().unwrap_or(0.0) >= 0.6 {
                return tier;
            }
        }
        3 // Default to T3 if no good tier found
    }
}
```

### Task Decomposer

```rust
// cfn-scheduler/src/decomposer.rs
use crate::ast::{ASTParser, CodeRegion, RegionType};

pub struct TaskDecomposer {
    llm_client: LLMClient,
    ast_parser: ASTParser,
    index: CodebaseIndex,
}

#[derive(Debug, Clone)]
pub struct DecompositionResult {
    pub micro_tasks: Vec<MicroTask>,
    pub dependencies: Vec<(String, String)>,
    pub batches: Vec<Vec<MicroTask>>,
}

impl TaskDecomposer {
    pub async fn decompose(&mut self, task: &TaskRequest) -> Result<DecompositionResult, DecomposeError> {
        // Phase 1: Parse intent using LLM
        let intent = self.parse_intent(&task.description).await?;

        // Phase 2: Find affected code regions using AST
        let regions = self.find_affected_regions(&intent).await?;

        // Phase 3: Generate micro-tasks
        let (tasks, deps) = self.generate_micro_tasks(&regions, &intent);

        // Phase 4: Topological sort into batches
        let batches = self.topological_sort(&tasks, &deps);

        Ok(DecompositionResult {
            micro_tasks: tasks,
            dependencies: deps,
            batches,
        })
    }

    async fn parse_intent(&self, description: &str) -> Result<TaskIntent, DecomposeError> {
        let context = self.index.get_summary();

        let response = self.llm_client.complete(
            ModelTier::T3Gpt4, // Use T3 for decomposition
            vec![
                Message::system(INTENT_PARSER_PROMPT),
                Message::user(format!(
                    "Task: {}\n\nCodebase context:\n{}",
                    description, context
                )),
            ],
            2, // max retries
        ).await?;

        let intent: TaskIntent = serde_json::from_str(&response.content)
            .map_err(|e| DecomposeError::ParseFailed(e.to_string()))?;

        Ok(intent)
    }

    async fn find_affected_regions(&mut self, intent: &TaskIntent) -> Result<Vec<CodeRegion>, DecomposeError> {
        let mut regions = Vec::new();

        for target in &intent.targets {
            // Search index for symbol
            if let Some(locations) = self.index.symbols.get(target) {
                for loc in locations {
                    let source = self.index.get_file_content(&loc.file)?;
                    let file_regions = self.ast_parser.extract_regions(&loc.file, &source)?;

                    // Find region containing target
                    for region in file_regions {
                        if region.name == *target {
                            regions.push(region);
                        }
                    }
                }
            }
        }

        // Add transitive dependencies for cross-file scope
        if intent.scope == Scope::CrossFile {
            regions = self.expand_transitive(&regions);
        }

        Ok(regions)
    }

    fn generate_micro_tasks(
        &self,
        regions: &[CodeRegion],
        intent: &TaskIntent,
    ) -> (Vec<MicroTask>, Vec<(String, String)>) {
        let mut tasks = Vec::new();
        let mut deps = Vec::new();

        for region in regions {
            let task_id = format!("mt-{}-{}", region.file.replace("/", "-"), region.name);

            let prompt = self.generate_prompt(region, intent);
            let max_diff = self.calculate_max_diff(region, intent);

            tasks.push(MicroTask {
                id: task_id.clone(),
                region: region.clone(),
                prompt,
                max_diff_lines: max_diff,
                validation_rules: self.generate_validation_rules(region),
            });

            // Add dependency edges
            for dep_name in &region.dependencies {
                if let Some(dep_task) = tasks.iter().find(|t| t.region.name == *dep_name) {
                    deps.push((dep_task.id.clone(), task_id.clone()));
                }
            }
        }

        (tasks, deps)
    }

    fn topological_sort(
        &self,
        tasks: &[MicroTask],
        deps: &[(String, String)],
    ) -> Vec<Vec<MicroTask>> {
        let mut in_degree: HashMap<String, usize> = HashMap::new();
        let mut graph: HashMap<String, Vec<String>> = HashMap::new();

        // Initialize
        for task in tasks {
            in_degree.insert(task.id.clone(), 0);
            graph.insert(task.id.clone(), Vec::new());
        }

        // Build graph
        for (from, to) in deps {
            graph.get_mut(from).unwrap().push(to.clone());
            *in_degree.get_mut(to).unwrap() += 1;
        }

        // Kahn's algorithm
        let mut batches: Vec<Vec<MicroTask>> = Vec::new();
        let mut remaining: HashSet<String> = tasks.iter().map(|t| t.id.clone()).collect();

        while !remaining.is_empty() {
            // Find all tasks with in_degree 0
            let ready: Vec<String> = remaining.iter()
                .filter(|id| in_degree.get(*id).copied().unwrap_or(0) == 0)
                .cloned()
                .collect();

            if ready.is_empty() {
                // Cycle detected - break arbitrarily
                break;
            }

            // Create batch
            let batch: Vec<MicroTask> = tasks.iter()
                .filter(|t| ready.contains(&t.id))
                .cloned()
                .collect();

            // Update in_degrees
            for id in &ready {
                remaining.remove(id);
                for neighbor in graph.get(id).unwrap_or(&Vec::new()) {
                    if let Some(deg) = in_degree.get_mut(neighbor) {
                        *deg = deg.saturating_sub(1);
                    }
                }
            }

            batches.push(batch);
        }

        batches
    }

    fn calculate_max_diff(&self, region: &CodeRegion, intent: &TaskIntent) -> usize {
        let region_size = region.end_line - region.start_line;

        match intent.action {
            Action::Add => region_size * 2,
            Action::Modify => (region_size as f64 * 1.5) as usize,
            Action::Delete => region_size,
            Action::Refactor => region_size * 3,
            Action::Fix => std::cmp::min((region_size as f64 * 0.3) as usize, 20),
        }
    }
}

const INTENT_PARSER_PROMPT: &str = r#"
You are a code task decomposition expert. Parse the user's task into structured intent.

Output JSON with:
{
  "action": "add|modify|delete|refactor|fix",
  "scope": "function|class|module|file|cross-file",
  "targets": ["functionName", "ClassName", "module/path"],
  "constraints": ["preserve backward compatibility", "maintain types"],
  "acceptanceCriteria": ["tests pass", "no type errors"],
  "estimatedSteps": number,
  "complexity": "trivial|simple|medium|complex|critical"
}

Be conservative with complexity estimates.
"#;
```

### Task Definition Format (YAML)

```yaml
# tasks/coding.yaml
id: coding-task
type: coding
profile: balanced

validators:
  - name: lint
    command: "npm run lint -- {file}"
    timeout_ms: 10000
  - name: typecheck
    command: "npm run typecheck"
    timeout_ms: 30000
  - name: unit-tests
    command: "npm test -- --testPathPattern={file}"
    timeout_ms: 60000

red_flags:
  - name: oversized-diff
    condition: "diff_lines > 100"
  - name: syntax-error
    condition: "parse_error == true"
  - name: unrelated-files
    condition: "touched_files - allowed_files > 0"

escalation:
  max_attempts_per_tier: 2
  triggers: [test_fail, red_flag, timeout]

context:
  max_tokens: 8000
  include_patterns: ["*.ts", "*.tsx"]
  exclude_patterns: ["*.test.ts", "node_modules/**"]
```

```yaml
# tasks/seo.yaml
id: seo-content
type: content
profile: budget

validators:
  - name: grammar
    command: "languagetool --json {file}"
    timeout_ms: 5000
  - name: keyword-density
    command: "./scripts/check-keyword-density.sh {file} {keyword}"
    timeout_ms: 2000
  - name: readability
    command: "./scripts/flesch-kincaid.sh {file}"
    timeout_ms: 2000

red_flags:
  - name: duplicate-content
    condition: "plagiarism_score > 0.3"
  - name: keyword-stuffing
    condition: "keyword_density > 0.03"

escalation:
  max_attempts_per_tier: 3
  triggers: [validator_fail, red_flag]
```

### API Interface (gRPC)

```protobuf
// proto/cfn_engine.proto
syntax = "proto3";
package cfn;

service CfnEngine {
  rpc SubmitTask(SubmitTaskRequest) returns (SubmitTaskResponse);
  rpc GetTaskStatus(TaskStatusRequest) returns (TaskStatusResponse);
  rpc StreamProgress(TaskStatusRequest) returns (stream ProgressUpdate);
  rpc CancelTask(CancelTaskRequest) returns (CancelTaskResponse);
}

message SubmitTaskRequest {
  string task_type = 1;
  string description = 2;
  string profile = 3;
  map<string, string> context = 4;
}

message SubmitTaskResponse {
  string task_id = 1;
  int32 estimated_micro_tasks = 2;
}

message ProgressUpdate {
  string task_id = 1;
  int32 completed = 2;
  int32 total = 3;
  int32 current_tier = 4;
  double cost_so_far = 5;
  int64 latency_so_far_ms = 6;
}
```

---

## 12. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [x] Trigger.dev infrastructure (from migration plan)
- [ ] Codebase indexing with tree-sitter
- [ ] Basic intent parser
- [ ] LLM client with provider routing

### Phase 2: Core MDAP (Week 3-4)
- [ ] Task decomposition pipeline
- [ ] Context extraction
- [ ] Micro-task generator
- [ ] Red-flag detection system

### Phase 3: Test Integration (Week 5)
- [ ] Test mapping builder
- [ ] Impact analysis
- [ ] Selective test runner
- [ ] Test-as-voter validation

### Phase 4: Escalation & Metrics (Week 6-7)
- [ ] 5-tier escalation state machine
- [ ] Cost tracking in Postgres
- [ ] Model stats aggregation
- [ ] A/B testing framework

### Phase 5: Loop Integration (Week 8)
- [ ] Loop 3 MDAP integration
- [ ] Loop 2 aggregated review
- [ ] Playbook learning
- [ ] Production rollout

---

## 13. Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| T1 resolution rate | ≥60% | % tasks solved at haiku tier |
| Overall success rate | ≥95% | % tasks completing successfully |
| Avg cost (budget profile) | ≤$0.05 | Per micro-task average |
| Avg latency (realtime) | ≤5s | 95th percentile |
| Escalation rate | ≤20% | % tasks requiring tier upgrade |
| Red-flag accuracy | ≥80% | Flagged items that were actual errors |

---

## 14. Open Questions (Addressed)

| Question | Resolution |
|----------|------------|
| Decomposition quality | Two-phase: intent parser (LLM) + AST-based region finding |
| Context window management | Token-budgeted extraction with priority ordering |
| Correlated errors | Red-flag patterns + diverse prompting across tiers |
| Cold start | Conservative T2 default, aggressive playbook learning |
| Cost attribution | Postgres-native tracking, department tagging |
| Provider routing | Tier-based routing with Z.ai for cheap tiers |
| Loop 2 integration | Aggregated diff review, not per-micro-task |
| Test selection | Coverage-based mapping + naming convention fallback |

---

## 15. References

- [MDAP Paper](https://arxiv.org/pdf/2511.09030) - Solving a Million-Step LLM Task with Zero Errors
- [Trigger.dev Docs](https://trigger.dev/docs)
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) - AST parsing
- CFN Loop Architecture: `docs/CFN_LOOP_ARCHITECTURE.md`
- Trigger.dev Migration: `docs/TRIGGER_DEV_MIGRATION_PLAN.md`
- Playbook System: `.claude/skills/cfn-playbook/SKILL.md`
