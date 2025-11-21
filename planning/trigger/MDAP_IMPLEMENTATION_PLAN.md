# MDAP Integration Implementation Plan

**Version:** 1.1.0
**Status:** Planning
**Dependencies:** Trigger.dev, CFN Loop v3, Playbook System

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

## 11. Implementation Phases

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

## 12. Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| T1 resolution rate | ≥60% | % tasks solved at haiku tier |
| Overall success rate | ≥95% | % tasks completing successfully |
| Avg cost (budget profile) | ≤$0.05 | Per micro-task average |
| Avg latency (realtime) | ≤5s | 95th percentile |
| Escalation rate | ≤20% | % tasks requiring tier upgrade |
| Red-flag accuracy | ≥80% | Flagged items that were actual errors |

---

## 13. Open Questions (Addressed)

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

## 14. References

- [MDAP Paper](https://arxiv.org/pdf/2511.09030) - Solving a Million-Step LLM Task with Zero Errors
- [Trigger.dev Docs](https://trigger.dev/docs)
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) - AST parsing
- CFN Loop Architecture: `docs/CFN_LOOP_ARCHITECTURE.md`
- Trigger.dev Migration: `docs/TRIGGER_DEV_MIGRATION_PLAN.md`
- Playbook System: `.claude/skills/cfn-playbook/SKILL.md`
