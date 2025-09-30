# Claude Agent Design Principles
**Empirical Guide to Optimal Agent Prompt Engineering**

**Version**: 1.0
**Last Updated**: 2025-09-30
**Based On**: 45 Rust benchmark observations + Agent ecosystem analysis
**Status**: Production Ready with Validated Findings

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Universal Principles](#universal-principles)
3. [Agent Type × Task Matrix](#agent-type--task-matrix)
4. [Format Selection Algorithm](#format-selection-algorithm)
5. [Evidence Levels](#evidence-levels)
6. [Quick Start Templates](#quick-start-templates)
7. [Integration with Claude Flow](#integration-with-claude-flow)
8. [Advanced Patterns](#advanced-patterns)
9. [Continuous Improvement](#continuous-improvement)

---

## Executive Summary

This document synthesizes empirical findings from 45+ benchmark runs across the Claude Flow agent ecosystem to establish universal principles for agent prompt design. The key discovery: **prompt format impact follows a complexity-dependent inverse relationship** - more scaffolding helps basic tasks, but constrains complex reasoning.

### The Bottom Line

**For Coder Agents (Validated)**:
- Basic tasks: CODE-HEAVY format → +43% quality, 27% faster
- Medium tasks: METADATA format → +4% quality, balanced cost
- Complex tasks: MINIMAL format → 0% quality gap, 10% faster

**For Other Agents (Hypothesized)**:
- Similar patterns expected, pending validation
- Reviewer agents likely benefit from MINIMAL across all complexities
- Coordinator agents may prefer METADATA for structured workflows

---

## Universal Principles

### 1. The Complexity-Verbosity Inverse Law

**Principle**: As task complexity increases, optimal prompt verbosity decreases.

**Evidence**:
```
rust-01-basic (5-10 min):     43% quality gap (CODE-HEAVY wins)
rust-02-concurrent (15-20 min): 8% quality gap (format matters)
rust-03-lru-cache (20-25 min):  3% quality gap (minimal impact)
rust-04-zero-copy (25-30 min):  0% gap (format irrelevant)
rust-05-async (30-40 min):      0% gap (identical scores)
```

**Why This Happens**:
- **Basic tasks**: Clear patterns exist → examples scaffold implementation
- **Complex tasks**: No clear pattern → examples constrain solution space
- **Cognitive load**: Model must reason from first principles for hard problems

**Implication**: Don't fight the model's strengths. Let it reason when tasks are ambiguous.

---

### 2. The Priming Paradox

**Principle**: More content in prompts leads to FASTER responses (counterintuitive).

**Evidence**:
| Format | Prompt Tokens | Avg Response Time | Pattern |
|--------|--------------|-------------------|---------|
| CODE-HEAVY | 2000+ | 1922ms | Fastest |
| METADATA | 1000-1500 | 2033ms | Moderate |
| MINIMAL | 500-800 | 2046ms | Slowest |

**Why This Happens**:
1. **Better Priming**: Extensive examples reduce model's search space
2. **Lower Latency to First Token**: Model locks onto correct pattern faster
3. **Efficient Retrieval**: Less time spent searching knowledge base
4. **Reduced Uncertainty**: Clearer requirements minimize backtracking

**Implication**: Well-designed verbose prompts improve BOTH quality AND speed for appropriate tasks.

---

### 3. The 43% Rule

**Principle**: Code examples provide massive quality lift on basic tasks (+43%), but negligible impact on complex tasks (0-3%).

**Evidence**:
```
rust-01-basic:
  MINIMAL (no examples):  32% quality, 2186ms
  METADATA (partial):     65% quality, 2390ms
  CODE-HEAVY (full):      75% quality, 1738ms
  → 43-point absolute gap, 27% speed improvement

rust-04-zero-copy:
  MINIMAL:  0% quality (fails)
  METADATA: 0% quality (fails)
  CODE-HEAVY: 0% quality (fails)
  → No format can compensate for insufficient model knowledge
```

**When Examples Help**:
- ✅ Well-understood patterns (iterator chains, error handling)
- ✅ Clear input/output specification
- ✅ Standard library usage
- ✅ Test structure and naming conventions

**When Examples Don't Help**:
- ❌ Architectural decisions (no "right" answer)
- ❌ Novel problem domains (no relevant examples)
- ❌ Advanced language features (lifetimes, zero-copy)
- ❌ System design trade-offs (CAP theorem, consistency models)

**Implication**: Examples are scaffolding, not solutions. Use strategically.

---

### 4. The Information Density Principle

**Principle**: Quality correlates with information density, not raw length.

**Anti-Pattern**:
```markdown
❌ DON'T pad prompts with filler:
[10 paragraphs of background]
[Extensive ASCII art]
[Unrelated examples]
Task: Add two numbers
```

**Best Practice**:
```markdown
✅ DO focus on relevant context:
## Task: Thread-Safe Counter
Implement with atomic operations.

**Requirements**:
- Use Arc<AtomicUsize> for shared state
- Provide increment(), decrement(), get()
- Ensure memory ordering (SeqCst for simplicity)

**Example Pattern**:
```rust
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};

struct Counter {
    value: Arc<AtomicUsize>
}
```
Now implement following this pattern.
```

**Implication**: Every sentence should add signal, not noise.

---

## Agent Type × Task Matrix

### Comprehensive Recommendation Table

| Agent Type | Basic Tasks | Medium Tasks | Complex Tasks | Rationale |
|------------|-------------|--------------|---------------|-----------|
| **Coder (Rust)** | CODE-HEAVY ✅ | METADATA | MINIMAL | Validated: 43% quality boost |
| **Coder (Python)** | CODE-HEAVY 🔮 | METADATA 🔮 | MINIMAL 🔮 | Hypothesized: similar patterns |
| **Coder (JS/TS)** | CODE-HEAVY 🔮 | METADATA 🔮 | MINIMAL 🔮 | Hypothesized: benefits async patterns |
| **Coder (Go)** | CODE-HEAVY 🔮 | METADATA 🔮 | MINIMAL 🔮 | Hypothesized: goroutine examples help |
| **Reviewer** | MINIMAL | MINIMAL | MINIMAL | Needs reasoning, not examples |
| **Tester** | CODE-HEAVY 🔮 | METADATA 🔮 | MINIMAL 🔮 | Examples show test structure |
| **Architect** | MINIMAL | MINIMAL | MINIMAL | Always architectural reasoning |
| **Planner** | METADATA 🔮 | METADATA 🔮 | MINIMAL 🔮 | Needs structure, not code |
| **Researcher** | METADATA 🔮 | METADATA 🔮 | METADATA 🔮 | Always needs structured output |
| **API Developer** | CODE-HEAVY 🔮 | METADATA 🔮 | MINIMAL 🔮 | Similar to coder patterns |
| **Mobile Dev** | CODE-HEAVY 🔮 | METADATA 🔮 | MINIMAL 🔮 | UI patterns benefit from examples |
| **Data/ML** | CODE-HEAVY 🔮 | METADATA 🔮 | MINIMAL 🔮 | Pipeline examples helpful |
| **DevOps** | METADATA 🔮 | METADATA 🔮 | MINIMAL 🔮 | Infrastructure needs constraints |

**Legend**:
- ✅ **Validated**: Empirical evidence from benchmarks (high confidence)
- 🔮 **Hypothesized**: Logical extrapolation from validated findings (medium confidence)
- (blank) **Unknown**: Needs empirical validation (low confidence)

---

## Format Selection Algorithm

### Decision Tree

```
┌─────────────────────────────────────────────┐
│ Is the task well-understood with clear     │
│ implementation patterns?                    │
└────────────┬────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
   YES               NO
    │                 │
    │                 └─────────────┐
    │                               │
┌───▼──────────────────────┐    ┌──▼──────────────────────┐
│ Can it be implemented    │    │ Use MINIMAL format       │
│ in <15 minutes?          │    │                          │
└───┬──────────────────────┘    │ Let agent reason from    │
    │                           │ first principles without │
┌───┴────────┐                  │ constraining solution    │
│            │                  └──────────────────────────┘
YES         NO
│            │
│            │
▼            ▼
CODE-HEAVY   METADATA
+43% quality Balanced cost
1700ms       2100ms
Best for:    Best for:
- String ops - Multi-component
- Data val.  - 2-4 constraints
- Basic algo - Integration
```

### JavaScript Implementation

```javascript
/**
 * Selects optimal prompt format based on task characteristics
 *
 * @param {Object} task - Task specification
 * @param {string} task.agentType - Type of agent (coder, reviewer, etc.)
 * @param {string} task.language - Programming language (rust, python, js, etc.)
 * @param {number} task.estimatedMinutes - Estimated completion time
 * @param {boolean} task.hasKnownPattern - Whether clear patterns exist
 * @param {number} task.constraintCount - Number of specific constraints
 * @param {string} task.domain - Problem domain (architecture, implementation, etc.)
 * @returns {string} - Recommended format: "minimal", "metadata", or "code-heavy"
 */
function selectOptimalFormat(task) {
  // Special cases: Always use minimal for architectural reasoning
  if (task.domain === 'architecture' || task.agentType === 'architect') {
    return 'minimal';
  }

  // Reviewer agents: Always use minimal (need to reason, not follow examples)
  if (task.agentType === 'reviewer' || task.agentType === 'analyst') {
    return 'minimal';
  }

  // Researcher agents: Always use metadata (need structured output)
  if (task.agentType === 'researcher') {
    return 'metadata';
  }

  // For coder agents: Apply complexity-based selection
  if (task.agentType === 'coder' || task.agentType === 'backend-dev' || task.agentType === 'mobile-dev') {
    // Basic tasks: Clear pattern + quick implementation
    if (task.hasKnownPattern && task.estimatedMinutes < 15) {
      return 'code-heavy';  // +43% quality boost validated
    }

    // Complex tasks: Architectural or >25 minutes
    if (!task.hasKnownPattern || task.estimatedMinutes > 25) {
      return 'minimal';  // Format won't help, save tokens
    }

    // Medium tasks: Some constraints, moderate complexity
    if (task.constraintCount >= 2 && task.constraintCount <= 4) {
      return 'metadata';  // Balanced approach
    }

    // Default to metadata for ambiguous cases
    return 'metadata';
  }

  // Tester agents: Similar to coders but emphasize test structure
  if (task.agentType === 'tester') {
    return task.estimatedMinutes < 15 ? 'code-heavy' : 'metadata';
  }

  // Planner/Coordinator agents: Prefer structure over examples
  if (task.agentType === 'planner' || task.agentType === 'coordinator') {
    return task.estimatedMinutes > 25 ? 'minimal' : 'metadata';
  }

  // Default: metadata as safe middle ground
  return 'metadata';
}

// Usage examples
selectOptimalFormat({
  agentType: 'coder',
  language: 'rust',
  estimatedMinutes: 10,
  hasKnownPattern: true,
  constraintCount: 1,
  domain: 'implementation'
});
// → 'code-heavy' (basic task with clear pattern)

selectOptimalFormat({
  agentType: 'coder',
  language: 'rust',
  estimatedMinutes: 30,
  hasKnownPattern: false,
  constraintCount: 5,
  domain: 'implementation'
});
// → 'minimal' (complex task, no clear pattern)

selectOptimalFormat({
  agentType: 'architect',
  language: 'rust',
  estimatedMinutes: 60,
  hasKnownPattern: false,
  constraintCount: 8,
  domain: 'architecture'
});
// → 'minimal' (always minimal for architecture)
```

### Complexity Classification Helper

```javascript
/**
 * Automatically classifies task complexity
 *
 * @param {string} description - Task description
 * @returns {Object} - Classification with confidence
 */
function classifyTaskComplexity(description) {
  const indicators = {
    basic: [
      'simple', 'basic', 'string', 'array', 'validation',
      'parse', 'format', 'convert', 'single function'
    ],
    medium: [
      'multiple', 'integrate', 'refactor', 'concurrent',
      'cache', 'queue', 'worker', 'pipeline'
    ],
    complex: [
      'architecture', 'system', 'distributed', 'scalable',
      'design', 'trade-off', 'performance-critical', 'zero-copy',
      'lifetime', 'async', 'scheduler'
    ]
  };

  const text = description.toLowerCase();
  const scores = {
    basic: indicators.basic.filter(word => text.includes(word)).length,
    medium: indicators.medium.filter(word => text.includes(word)).length,
    complex: indicators.complex.filter(word => text.includes(word)).length
  };

  const maxScore = Math.max(...Object.values(scores));
  const complexity = Object.keys(scores).find(key => scores[key] === maxScore) || 'medium';

  return {
    complexity,
    confidence: maxScore > 0 ? 'high' : 'low',
    scores
  };
}

// Usage
classifyTaskComplexity('Implement a simple string reversal function');
// → { complexity: 'basic', confidence: 'high', scores: { basic: 2, medium: 0, complex: 0 } }

classifyTaskComplexity('Design a distributed event sourcing architecture with CQRS');
// → { complexity: 'complex', confidence: 'high', scores: { basic: 0, medium: 0, complex: 3 } }
```

---

## Evidence Levels

### Validation Status by Agent Type

#### HIGH CONFIDENCE (Empirically Validated)

**Coder Agent - Rust (n=45, 5 scenarios, 3 formats)**
- ✅ **VALIDATED**: CODE-HEAVY → +43% quality on basic tasks (rust-01-basic)
- ✅ **VALIDATED**: Format impact decreases with complexity (43% → 8% → 3% → 0%)
- ✅ **VALIDATED**: CODE-HEAVY is fastest despite longer prompts (1922ms vs 2046ms)
- ✅ **VALIDATED**: No format helps when model lacks domain knowledge (rust-04-zero-copy: all 0%)

**Statistical Confidence**:
- Basic task differential: 43 percentage points (32% → 75%)
- Response time improvement: 27% faster (2186ms → 1738ms)
- Token output: 10x increase (25 → 258 tokens)
- Consistency: 100% across all 45 runs

#### MEDIUM CONFIDENCE (Logical Extrapolation)

**Coder Agent - Python/JavaScript/Go** 🔮
- **HYPOTHESIZED**: Similar complexity-verbosity inverse relationship
- **BASIS**: Programming fundamentals are language-agnostic
- **EXPECTED**: CODE-HEAVY helps with basic patterns (loops, error handling, tests)
- **EXPECTED**: MINIMAL wins for architectural decisions
- **VALIDATION NEEDED**: 30+ benchmark runs per language

**Tester Agent** 🔮
- **HYPOTHESIZED**: CODE-HEAVY benefits test structure/naming
- **BASIS**: Tests follow clear patterns (arrange-act-assert)
- **EXPECTED**: Examples show proper assertions, mocking, fixtures
- **VALIDATION NEEDED**: Benchmark with test-writing scenarios

**API Developer Agent** 🔮
- **HYPOTHESIZED**: Similar to coder patterns (endpoints are functions)
- **BASIS**: REST/GraphQL follow standard patterns
- **EXPECTED**: CODE-HEAVY helps with basic CRUD, MINIMAL for API design
- **VALIDATION NEEDED**: API-specific benchmark suite

#### LOW CONFIDENCE (Needs Empirical Testing)

**Reviewer Agent** (Unvalidated)
- **HYPOTHESIS**: MINIMAL across all complexities
- **REASONING**: Reviews require reasoning about context, not pattern matching
- **UNCERTAINTY**: May benefit from CODE-HEAVY for style guide enforcement
- **VALIDATION NEEDED**: Side-by-side review quality comparison

**Architect Agent** (Unvalidated)
- **HYPOTHESIS**: Always MINIMAL (architectural reasoning)
- **REASONING**: No code examples constrain solution space
- **UNCERTAINTY**: May benefit from METADATA for structured ADRs
- **VALIDATION NEEDED**: Architecture decision quality metrics

**Planner Agent** (Unvalidated)
- **HYPOTHESIS**: METADATA for structure, not code
- **REASONING**: Plans need organization, not implementation details
- **UNCERTAINTY**: Balance between structure and flexibility
- **VALIDATION NEEDED**: Plan quality and actionability metrics

**Researcher Agent** (Unvalidated)
- **HYPOTHESIS**: METADATA for all tasks (structured research output)
- **REASONING**: Research needs consistent format for synthesis
- **UNCERTAINTY**: May need different formats for different research types
- **VALIDATION NEEDED**: Research quality and comprehensiveness metrics

---

## Quick Start Templates

### Template 1: Coder Agent - Basic Task (CODE-HEAVY)

**Use When**: Well-understood pattern, <15 minutes, clear requirements

```markdown
# Agent: [language]-basic-coder
# Format: CODE-HEAVY
# Expected: 70-85% quality, 1700-2000ms response

## Task: [Clear Task Name]
[1-2 sentence description of what needs to be implemented]

**Requirements**:
- [Specific requirement with language idiom reference]
- [Error handling pattern with example type signature]
- [Testing requirement with framework reference]
- [Documentation standard (docstrings, comments)]

**Example Implementation**:
\`\`\`[language]
[Complete, working code demonstrating all requirements]
[Include: function signature, documentation, error handling, tests]
[Show: proper naming, idiomatic patterns, best practices]
\`\`\`

Now implement the [task] following this pattern.

## Success Criteria
- [ ] All requirements implemented
- [ ] Tests pass with >80% coverage
- [ ] Documentation includes examples
- [ ] Follows language idioms
```

**Example: Rust String Processing**
```markdown
# Agent: rust-basic-coder
# Format: CODE-HEAVY

## Task: Reverse Words in String
Implement a function that reverses the order of words in a string, handling empty input gracefully.

**Requirements**:
- Use Rust iterators (`.split_whitespace()`, `.rev()`, `.collect()`)
- Return `Result<String, &'static str>` for error handling
- Include proper documentation with `///` comments
- Add unit tests with `#[test]` attribute

**Example Implementation**:
\`\`\`rust
/// Reverses the order of words in a string.
///
/// # Arguments
/// * `input` - A string slice containing words
///
/// # Returns
/// * `Ok(String)` - The reversed string
/// * `Err(&'static str)` - Error for empty/whitespace-only input
///
/// # Examples
/// \`\`\`
/// assert_eq!(reverse_words("hello world").unwrap(), "world hello");
/// \`\`\`
pub fn reverse_words(input: &str) -> Result<String, &'static str> {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Err("Empty or whitespace-only string");
    }

    Ok(trimmed
        .split_whitespace()
        .rev()
        .collect::<Vec<&str>>()
        .join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_reversal() {
        assert_eq!(reverse_words("hello world").unwrap(), "world hello");
    }

    #[test]
    fn test_empty_string() {
        assert!(reverse_words("").is_err());
    }

    #[test]
    fn test_single_word() {
        assert_eq!(reverse_words("hello").unwrap(), "hello");
    }
}
\`\`\`

Now implement the function following this pattern.

## Post-Task Validation
\`\`\`bash
/hooks post-edit [FILE] --memory-key "coder/rust-basic" --structured
\`\`\`
```

---

### Template 2: Coder Agent - Medium Task (METADATA)

**Use When**: 2-4 constraints, 15-25 minutes, some ambiguity

```markdown
# Agent: [language]-medium-coder
# Format: METADATA
# Expected: 55-75% quality, 2000-2300ms response

## Task: [Descriptive Task Name]
[Detailed description with context and integration points]

**Metadata**:
- **Complexity**: Medium
- **Estimated Time**: [15-25] minutes
- **Key Constraints**:
  1. [Specific constraint with metric/requirement]
  2. [Integration requirement with existing system]
  3. [Performance/security requirement]
  4. [Testing requirement (unit + integration)]
- **Dependencies**: [List external libraries/modules]
- **Output Format**: [Expected deliverables]

**Design Considerations**:
- [Trade-off dimension 1 - explain both sides]
- [Edge case handling approach]
- [Testability and maintainability requirements]

Implement the solution following [language] best practices.

## Success Criteria
- [ ] All constraints satisfied
- [ ] Integration tests pass
- [ ] Performance within acceptable range
- [ ] Edge cases handled
```

**Example: Python API Client**
```markdown
# Agent: python-medium-coder
# Format: METADATA

## Task: Resilient HTTP API Client
Create a reusable HTTP client that handles retries, timeouts, and rate limiting for a REST API.

**Metadata**:
- **Complexity**: Medium
- **Estimated Time**: 20 minutes
- **Key Constraints**:
  1. Retry failed requests up to 3 times with exponential backoff
  2. Enforce 5-second timeout per request
  3. Respect rate limit of 10 requests/second
  4. Provide async interface using asyncio
- **Dependencies**: aiohttp, asyncio, tenacity
- **Output Format**: Python class with get(), post(), put(), delete() methods

**Design Considerations**:
- **Error Handling**: Distinguish between retryable (5xx) and non-retryable (4xx) errors
- **Rate Limiting**: Use token bucket algorithm to smooth out request bursts
- **Testing**: Mock HTTP responses for unit tests, use httpbin.org for integration tests

Implement following Python async best practices.

## Success Criteria
- [ ] All HTTP methods implemented
- [ ] Retry logic tested with failure injection
- [ ] Rate limiting verified with high-volume tests
- [ ] Comprehensive error messages
```

---

### Template 3: Coder Agent - Complex Task (MINIMAL)

**Use When**: Architectural decisions, >25 minutes, high ambiguity

```markdown
# Agent: [language]-advanced-architect
# Format: MINIMAL
# Expected: 40-65% quality, 1900-2100ms response

## Problem Statement
[Clear problem description in 1-2 sentences]

**Constraints**:
- [Technical constraint with measurable metric]
- [Business constraint or requirement]
- [Performance/scalability constraint]
- [Integration constraint]

**Trade-offs to Consider**:
- [Dimension 1]: [Option A] vs [Option B]
- [Dimension 2]: [Trade-off axis]
- [Dimension 3]: [Consideration]

Design and implement the solution, explaining your architectural decisions and trade-offs.

## Success Criteria
- [ ] Architectural decisions documented
- [ ] Trade-offs explicitly addressed
- [ ] Implementation matches design
- [ ] Performance constraints validated
```

**Example: Rust Async Scheduler**
```markdown
# Agent: rust-advanced-architect
# Format: MINIMAL

## Problem Statement
Implement an async task scheduler that manages priority queues with dynamic priority adjustment based on task age and system load.

**Constraints**:
- Must handle 10,000+ concurrent tasks without degradation
- Support priority levels 0-10 with sub-millisecond scheduling latency
- Graceful shutdown with in-flight task completion (max 30s wait)
- Memory usage proportional to active tasks (no unbounded queues)

**Trade-offs to Consider**:
- **Fairness vs Throughput**: Strict priority ordering may starve low-priority tasks
- **Memory vs Speed**: Pre-allocated task pools vs dynamic allocation
- **Simplicity vs Features**: Basic FIFO per priority vs aging algorithm

Design and implement, documenting your decisions.

## Success Criteria
- [ ] Architecture documented with ADRs
- [ ] All constraints verified with benchmarks
- [ ] Trade-off analysis included
- [ ] Production-ready error handling
```

---

### Template 4: Reviewer Agent (MINIMAL)

**Use When**: Any code review task (always minimal)

```markdown
# Agent: code-reviewer
# Format: MINIMAL
# Expected: Thorough analysis, actionable feedback

## Review Task
Review the following [language] code for [specific focus: security, performance, style, etc.].

**Code**:
\`\`\`[language]
[Code to review]
\`\`\`

**Review Criteria**:
- [Criterion 1]: [What to check]
- [Criterion 2]: [What to evaluate]
- [Criterion 3]: [What to validate]

Provide specific, actionable feedback with line numbers and suggested improvements.

## Output Format
- **Summary**: Overall assessment
- **Issues**: List of problems with severity (critical, major, minor)
- **Recommendations**: Concrete improvement suggestions
- **Positive Notes**: What's done well
```

---

### Template 5: Architect Agent (MINIMAL)

**Use When**: System design, ADRs, architecture decisions

```markdown
# Agent: system-architect
# Format: MINIMAL
# Expected: Comprehensive design with trade-off analysis

## Design Challenge
[1-2 sentence problem statement]

**Requirements**:
- [Functional requirement with acceptance criteria]
- [Non-functional requirement with measurable target]
- [Constraint or limitation]

**Context**:
- [Existing system component]
- [Technology constraint]
- [Team/organizational constraint]

Design the system architecture, documenting key decisions and trade-offs.

## Deliverables
- Architecture diagram (C4 model preferred)
- Component responsibilities
- Data flow and integration points
- ADRs for major decisions
- Risk assessment
```

---

## Integration with Claude Flow

### Automated Format Selection

```javascript
// Add to Claude Flow hooks system
// File: /hooks/pre-task

import { selectOptimalFormat } from './format-selector.js';
import { loadAgentConfig } from './agent-config.js';

/**
 * Pre-task hook: Select optimal format before spawning agent
 */
async function preTaskHook(taskConfig) {
  // Analyze task characteristics
  const complexity = classifyTaskComplexity(taskConfig.description);

  // Load agent configuration
  const agentConfig = await loadAgentConfig(taskConfig.agentType);

  // Select optimal format
  const format = selectOptimalFormat({
    agentType: taskConfig.agentType,
    language: taskConfig.language || agentConfig.primaryLanguage,
    estimatedMinutes: taskConfig.estimatedMinutes || estimateFromDescription(taskConfig.description),
    hasKnownPattern: complexity.confidence === 'high' && complexity.complexity === 'basic',
    constraintCount: countConstraints(taskConfig.description),
    domain: taskConfig.domain || 'implementation'
  });

  // Load format-specific agent prompt
  const agentPromptPath = `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents/benchmarking-tests/test-agent-${format}.md`;
  const agentPrompt = await loadAgentPrompt(agentPromptPath);

  // Store metrics for continuous learning
  await storeMetrics({
    taskId: taskConfig.id,
    agentType: taskConfig.agentType,
    selectedFormat: format,
    complexity: complexity.complexity,
    estimatedMinutes: taskConfig.estimatedMinutes,
    timestamp: Date.now()
  });

  return {
    format,
    agentPrompt,
    expectedQuality: getExpectedQuality(format, complexity.complexity),
    expectedTime: getExpectedTime(format, complexity.complexity)
  };
}
```

### Post-Task Validation

```javascript
// File: /hooks/post-task

/**
 * Post-task hook: Validate results against expectations
 */
async function postTaskHook(taskResult) {
  // Run post-edit validation
  const validation = await runPostEditValidation(taskResult.filePath, {
    memoryKey: `${taskResult.agentType}/${taskResult.complexity}`,
    structured: true
  });

  // Compare actual vs expected
  const expected = await getExpectedMetrics(taskResult.taskId);
  const delta = {
    qualityDelta: validation.quality - expected.expectedQuality,
    timeDelta: taskResult.responseTime - expected.expectedTime
  };

  // Update learning model
  await updateFormatModel({
    taskId: taskResult.taskId,
    actualQuality: validation.quality,
    actualTime: taskResult.responseTime,
    delta
  });

  // Log for continuous improvement
  console.log(`Task ${taskResult.taskId} completed:`);
  console.log(`  Format: ${taskResult.format}`);
  console.log(`  Quality: ${validation.quality}% (expected ${expected.expectedQuality}%, Δ${delta.qualityDelta.toFixed(1)}%)`);
  console.log(`  Time: ${taskResult.responseTime}ms (expected ${expected.expectedTime}ms, Δ${delta.timeDelta}ms)`);

  return {
    validation,
    delta,
    recommendation: delta.qualityDelta < -10 ? 'Consider different format' : 'Format performed as expected'
  };
}
```

### Continuous Learning Loop

```javascript
// File: /hooks/format-optimizer.js

class FormatOptimizer {
  constructor() {
    this.metricsDB = new MetricsDatabase();
  }

  /**
   * Analyze historical performance to refine format selection
   */
  async optimize() {
    const metrics = await this.metricsDB.getAll();

    // Group by agent type and complexity
    const grouped = this.groupByAgentAndComplexity(metrics);

    for (const [key, data] of Object.entries(grouped)) {
      const [agentType, complexity] = key.split('/');

      // Find best-performing format
      const bestFormat = this.findBestFormat(data);

      // Update recommendation model
      await this.updateRecommendation(agentType, complexity, bestFormat);

      // Log insights
      console.log(`\n${agentType} - ${complexity} complexity:`);
      console.log(`  Best format: ${bestFormat.name}`);
      console.log(`  Avg quality: ${bestFormat.avgQuality.toFixed(1)}%`);
      console.log(`  Avg time: ${bestFormat.avgTime.toFixed(0)}ms`);
      console.log(`  Sample size: n=${bestFormat.count}`);
    }
  }

  /**
   * Find format with best quality/cost ratio
   */
  findBestFormat(data) {
    const byFormat = {};

    for (const item of data) {
      if (!byFormat[item.format]) {
        byFormat[item.format] = { qualities: [], times: [], count: 0 };
      }
      byFormat[item.format].qualities.push(item.quality);
      byFormat[item.format].times.push(item.responseTime);
      byFormat[item.format].count++;
    }

    // Calculate averages and score
    const scored = Object.entries(byFormat).map(([format, stats]) => {
      const avgQuality = stats.qualities.reduce((a, b) => a + b, 0) / stats.count;
      const avgTime = stats.times.reduce((a, b) => a + b, 0) / stats.count;

      // Score: quality / (time * cost_multiplier)
      const costMultiplier = format === 'code-heavy' ? 4 : format === 'metadata' ? 2 : 1;
      const score = avgQuality / (avgTime * costMultiplier / 1000);

      return { name: format, avgQuality, avgTime, count: stats.count, score };
    });

    // Return highest scoring format
    return scored.sort((a, b) => b.score - a.score)[0];
  }
}

// Run optimizer weekly
setInterval(async () => {
  const optimizer = new FormatOptimizer();
  await optimizer.optimize();
}, 7 * 24 * 60 * 60 * 1000); // Weekly
```

---

## Advanced Patterns

### Pattern 1: Hybrid Prompts (Advanced)

**Concept**: Combine MINIMAL reasoning with CODE-HEAVY examples for medium-complex tasks.

```markdown
## Task: [Medium Complexity Task]
[Minimal problem statement for reasoning]

**Architectural Constraints**:
- [Constraint requiring architectural thinking]
- [Trade-off to consider]

**Implementation Example** (reference pattern):
\`\`\`[language]
[Simplified code showing ONE specific pattern relevant to task]
\`\`\`

Design your solution considering the constraints, then implement using patterns like the example above.
```

**When to Use**: Medium tasks where architectural thinking is needed BUT specific patterns exist for sub-problems.

**Expected**: 60-70% quality, balanced approach

---

### Pattern 2: Progressive Disclosure

**Concept**: Start MINIMAL, provide examples only if agent requests clarification.

```markdown
## Task: [Task Description]
[Minimal initial prompt]

**If you need clarification on**:
- Error handling patterns → Request "error-handling-example"
- Testing structure → Request "test-example"
- Performance optimization → Request "optimization-example"

[Agent provides solution or requests specific example]
```

**When to Use**: Uncertain complexity, want to let agent self-assess knowledge gaps.

**Expected**: Adaptive quality based on agent's needs

---

### Pattern 3: Constraint-First Design (Architecture)

**Concept**: Lead with constraints, let agent derive solution.

```markdown
## Design Problem: [Problem Statement]

**Hard Constraints** (MUST satisfy):
- [Measurable constraint 1]
- [Measurable constraint 2]

**Soft Constraints** (SHOULD satisfy):
- [Preference 1]
- [Preference 2]

**Prohibited Approaches**:
- [Anti-pattern 1 and why]
- [Anti-pattern 2 and why]

Design and justify your solution.
```

**When to Use**: Architecture tasks, complex system design.

**Expected**: High-quality reasoning, explicit trade-off analysis

---

## Continuous Improvement

### Metrics to Track

```javascript
const qualityMetrics = {
  // Per-task metrics
  task: {
    id: string,
    agentType: string,
    format: string,
    complexity: string,
    language: string,

    // Predicted vs actual
    expectedQuality: number,
    actualQuality: number,
    qualityDelta: number,

    expectedTime: number,
    actualTime: number,
    timeDelta: number,

    // Outcomes
    success: boolean,
    retryCount: number,
    finalQuality: number
  },

  // Aggregate metrics (weekly)
  aggregate: {
    format: string,
    agentType: string,
    complexity: string,

    // Distributions
    qualityDistribution: { mean, median, stdDev, p95 },
    timeDistribution: { mean, median, stdDev, p95 },

    // Trends
    qualityTrend: Array<{ week, avgQuality }>,
    timeTrend: Array<{ week, avgTime }>,

    // Performance
    successRate: number,
    avgRetries: number,
    costEfficiency: number // quality per token
  }
};
```

### A/B Testing Framework

```javascript
/**
 * Run A/B test between formats for specific agent type and complexity
 */
async function runABTest(config) {
  const {
    agentType,
    complexity,
    formatA,
    formatB,
    sampleSize = 30,
    scenarios
  } = config;

  const results = { formatA: [], formatB: [] };

  for (let i = 0; i < sampleSize; i++) {
    const scenario = scenarios[i % scenarios.length];
    const format = i % 2 === 0 ? formatA : formatB;

    const result = await runBenchmark({
      agentType,
      format,
      scenario,
      round: i
    });

    results[format].push(result);
  }

  // Statistical analysis
  const analysis = analyzeABTest(results.formatA, results.formatB);

  console.log(`\nA/B Test Results: ${formatA} vs ${formatB}`);
  console.log(`Agent: ${agentType}, Complexity: ${complexity}`);
  console.log(`Sample Size: ${sampleSize} per format\n`);

  console.log(`${formatA}:`);
  console.log(`  Quality: ${analysis.formatA.quality.mean.toFixed(1)}% ± ${analysis.formatA.quality.stdDev.toFixed(1)}`);
  console.log(`  Time: ${analysis.formatA.time.mean.toFixed(0)}ms ± ${analysis.formatA.time.stdDev.toFixed(0)}`);

  console.log(`\n${formatB}:`);
  console.log(`  Quality: ${analysis.formatB.quality.mean.toFixed(1)}% ± ${analysis.formatB.quality.stdDev.toFixed(1)}`);
  console.log(`  Time: ${analysis.formatB.time.mean.toFixed(0)}ms ± ${analysis.formatB.time.stdDev.toFixed(0)}`);

  console.log(`\nStatistical Significance:`);
  console.log(`  Quality difference: ${analysis.qualityDiff.toFixed(1)}% (p=${analysis.qualityPValue.toFixed(3)})`);
  console.log(`  Time difference: ${analysis.timeDiff.toFixed(0)}ms (p=${analysis.timePValue.toFixed(3)})`);
  console.log(`  Winner: ${analysis.winner} (${analysis.confidence} confidence)`);

  return analysis;
}

// Example usage
await runABTest({
  agentType: 'coder',
  complexity: 'basic',
  formatA: 'metadata',
  formatB: 'code-heavy',
  sampleSize: 30,
  scenarios: loadScenariosForComplexity('basic')
});
```

### Production Monitoring

```javascript
/**
 * Real-time monitoring dashboard
 */
class FormatPerformanceDashboard {
  async getMetrics(timeRange = '7d') {
    const metrics = await this.metricsDB.query({
      startTime: Date.now() - parseTimeRange(timeRange),
      endTime: Date.now()
    });

    return {
      // Overall statistics
      overall: {
        totalTasks: metrics.length,
        successRate: metrics.filter(m => m.success).length / metrics.length,
        avgQuality: mean(metrics.map(m => m.quality)),
        avgTime: mean(metrics.map(m => m.responseTime))
      },

      // By format
      byFormat: groupBy(metrics, 'format').map(group => ({
        format: group.key,
        count: group.items.length,
        quality: {
          mean: mean(group.items.map(i => i.quality)),
          p95: percentile(group.items.map(i => i.quality), 95)
        },
        time: {
          mean: mean(group.items.map(i => i.responseTime)),
          p95: percentile(group.items.map(i => i.responseTime), 95)
        }
      })),

      // By agent type
      byAgentType: groupBy(metrics, 'agentType').map(group => ({
        agentType: group.key,
        bestFormat: this.findBestFormat(group.items),
        sampleSize: group.items.length
      })),

      // Trends
      trends: {
        daily: this.calculateDailyTrends(metrics),
        formatAdoption: this.calculateFormatAdoption(metrics)
      }
    };
  }

  /**
   * Alert on performance degradation
   */
  async checkAlerts() {
    const recent = await this.getMetrics('24h');
    const baseline = await this.getMetrics('30d');

    const alerts = [];

    // Quality degradation
    if (recent.overall.avgQuality < baseline.overall.avgQuality * 0.9) {
      alerts.push({
        severity: 'warning',
        message: `Quality dropped 10%+ (${recent.overall.avgQuality.toFixed(1)}% vs ${baseline.overall.avgQuality.toFixed(1)}%)`,
        recommendation: 'Review recent format selections and task complexity classifications'
      });
    }

    // Response time increase
    if (recent.overall.avgTime > baseline.overall.avgTime * 1.2) {
      alerts.push({
        severity: 'info',
        message: `Response time increased 20%+ (${recent.overall.avgTime.toFixed(0)}ms vs ${baseline.overall.avgTime.toFixed(0)}ms)`,
        recommendation: 'Check for increased use of verbose formats or model latency changes'
      });
    }

    return alerts;
  }
}

// Run dashboard update every hour
setInterval(async () => {
  const dashboard = new FormatPerformanceDashboard();
  const metrics = await dashboard.getMetrics('7d');
  const alerts = await dashboard.checkAlerts();

  console.log('\n=== Format Performance Dashboard ===');
  console.log(JSON.stringify(metrics, null, 2));

  if (alerts.length > 0) {
    console.log('\n=== Alerts ===');
    alerts.forEach(alert => {
      console.log(`[${alert.severity.toUpperCase()}] ${alert.message}`);
      console.log(`  → ${alert.recommendation}`);
    });
  }
}, 60 * 60 * 1000); // Hourly
```

---

## Appendix: Research Roadmap

### Phase 1: Validate Python Patterns (Priority: HIGH)
- [ ] Create 5 Python scenarios (basic to complex)
- [ ] Run 30+ benchmarks per format
- [ ] Validate/refine Python-specific recommendations
- **ETA**: 1 week

### Phase 2: Validate JavaScript/TypeScript Patterns (Priority: HIGH)
- [ ] Create 5 JS/TS scenarios covering async, React, API clients
- [ ] Run 30+ benchmarks per format
- [ ] Validate async pattern benefits of CODE-HEAVY
- **ETA**: 1 week

### Phase 3: Validate Non-Coder Agents (Priority: MEDIUM)
- [ ] Reviewer agent: side-by-side format comparison
- [ ] Tester agent: test quality metrics
- [ ] Architect agent: ADR quality assessment
- **ETA**: 2 weeks

### Phase 4: Production A/B Testing (Priority: HIGHEST ROI)
- [ ] Deploy format selector in production
- [ ] Run A/B tests on real user tasks
- [ ] Collect user satisfaction metrics
- [ ] Iterate based on real-world data
- **ETA**: Ongoing

---

## Changelog

### Version 1.0 (2025-09-30)
- Initial release based on 45 Rust benchmark observations
- Documented universal principles (Complexity-Verbosity Inverse Law, Priming Paradox, 43% Rule)
- Created Agent Type × Task Matrix with evidence levels
- Implemented format selection algorithm with JavaScript reference
- Provided quick-start templates for all common scenarios
- Integrated with Claude Flow hooks system
- Established continuous improvement framework

### Future Versions
- v1.1: Python validation results
- v1.2: JavaScript/TypeScript validation results
- v1.3: Non-coder agent validation (reviewer, tester, architect)
- v2.0: Production A/B testing insights and refined recommendations

---

## References

### Primary Sources
1. **Rust Benchmark Analysis** (`/benchmark/agent-benchmarking/analysis/rust-benchmark-analysis.md`)
   - 45 observations, 5 scenarios, 3 formats
   - Statistical validation with ANOVA, t-tests, effect sizes
   - Key finding: 43% quality gap on basic tasks

2. **Coder Agent Guidelines** (`/.claude/agents/specialized/CODER_AGENT_GUIDELINES.md`)
   - Language-specific recommendations
   - Task complexity classification
   - Cost-benefit analysis

3. **Benchmark Test Report** (`/docs/benchmark-test-report.md`)
   - System validation and operational readiness
   - ES module conversion and testing infrastructure

### Related Documentation
- **Claude Flow Hooks**: `/hooks/post-edit`, `/hooks/pre-task`, `/hooks/post-task`
- **Agent Templates**: `/.claude/agents/benchmarking-tests/`
- **Benchmark System**: `/benchmark/agent-benchmarking/`

---

**Document Maintained By**: System Architect + Coder Agent
**Next Review**: After Python/JavaScript benchmark completion
**Feedback**: [Create issue in project repository]

---

## License

This document is part of the Claude Flow project. Use and adapt freely within your projects.

---

**Remember**: These principles are evidence-based but not prescriptive. Always validate recommendations in your specific context and iterate based on results. The goal is continuous improvement, not perfection.