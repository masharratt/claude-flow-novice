# Agent Prompt Format Benchmark System

Automated benchmarking system for comparing different agent prompt formatting approaches.

## Overview

This system tests three different agent prompt formats:

1. **Minimal Format** - Simple frontmatter with only essential fields (name, description, tools, color)
2. **Metadata Format** - Full configuration with type, hooks, capabilities, triggers, constraints, lifecycle
3. **Code-Heavy Format** - Extensive code examples and implementation patterns in the prompt body

## Quick Start

```bash
# Run full benchmark
/benchmark-prompts run

# Run with options
/benchmark-prompts run --rounds 5 --parallel --verbose

# Analyze results
/benchmark-prompts analyze

# Generate reports
/benchmark-prompts report markdown

# Interactive comparison
/benchmark-prompts compare
```

## Architecture

```
benchmark/agent-benchmarking/
├── tests/
│   ├── test-scenarios.json       # 10 test scenarios
│   └── validation-suite.js       # Result validation
│
├── runner/
│   ├── benchmark-orchestrator.js # Main test runner
│   ├── metrics-collector.js      # Performance metrics
│   └── prompt-evaluator.js       # Quality evaluation
│
├── analysis/
│   ├── statistical-analyzer.js   # Statistical tests
│   └── report-generator.js       # Report generation
│
├── results/
│   ├── raw/                      # Raw benchmark data
│   ├── processed/                # Analyzed results
│   └── reports/                  # Generated reports
│
└── index.js                      # CLI entry point
```

## Test Scenarios

The system includes 10 comprehensive test scenarios covering:

1. **Simple Code Analysis** (Low complexity)
   - Algorithm optimization
   - Nested loop detection
   - Complexity analysis

2. **Memory Leak Detection** (Medium complexity)
   - Event listener patterns
   - Cleanup strategies
   - Memory management

3. **Database Query Optimization** (Medium complexity)
   - N+1 query detection
   - JOIN optimization
   - Query rewriting

4. **Caching Strategy** (High complexity)
   - Multi-level cache design
   - TTL configuration
   - Invalidation patterns

5. **Resource Allocation** (High complexity)
   - Thread pool sizing
   - Connection pool calculation
   - Memory allocation

6. **Async Pattern Optimization** (Medium complexity)
   - Sequential to parallel conversion
   - Error handling
   - Performance estimation

7. **Algorithm Complexity Reduction** (High complexity)
   - Big-O optimization
   - Data structure selection
   - Heap vs sort approaches

8. **Load Testing Strategy** (High complexity)
   - Test phase definition
   - Tool selection
   - Success criteria

9. **Bottleneck Identification** (Medium complexity)
   - Metrics interpretation
   - Root cause analysis
   - Priority ranking

10. **Scalability Architecture** (High complexity)
    - Horizontal vs vertical scaling
    - Caching architecture
    - Cost estimation

## Metrics Collected

### Performance Metrics
- **Response Time**: Total time from request to completion
- **Time to First Token (TTFT)**: Time until first response
- **Tokens Per Second**: Generation speed
- **Memory Usage**: Heap memory consumption

### Quality Metrics
- **Completeness**: Coverage of scenario requirements (30% weight)
- **Accuracy**: Technical correctness (30% weight)
- **Relevance**: Alignment with task (20% weight)
- **Clarity**: Structure and readability (20% weight)

### Consistency Metrics
- **Cross-Run Variance**: Stability across rounds
- **Determinism Score**: Predictability of responses
- **Success Rate**: Percentage of successful completions

## Statistical Analysis

The system performs comprehensive statistical analysis:

### Descriptive Statistics
- Mean, median, standard deviation
- Percentiles (P25, P75, P95)
- Coefficient of variation

### Significance Testing
- **ANOVA**: Overall difference between formats
- **T-tests**: Pairwise format comparisons
- **P-values**: Statistical significance

### Effect Size Analysis
- **Cohen's d**: Magnitude of differences
- Classifications: negligible, small, medium, large

## Report Formats

### Markdown Report
- Executive summary
- Format comparison table
- Statistical analysis
- Detailed scenario results
- Recommendations

### CSV Export
- Raw data for analysis
- Format,Scenario,Round,Quality,ResponseTime,Consistency

### JSON Export
- Complete results and analysis
- Machine-readable format

### Visual Report (ASCII)
- Quality bar charts
- Response time comparison
- Consistency visualization

## Configuration

### Default Settings
```javascript
{
  rounds: 3,              // Tests per scenario
  parallel: false,        // Sequential execution
  verbose: false,         // Minimal output
  scenarios: null,        // All scenarios
  confidenceLevel: 0.95   // 95% confidence intervals
}
```

### Custom Run
```bash
/benchmark-prompts run --rounds 10 --parallel --scenarios "simple-code-analysis,caching-strategy"
```

## Scoring System

Each scenario has weighted scoring criteria:

```json
{
  "scoringCriteria": {
    "identifiesBottleneck": 1.0,    // Critical (100%)
    "suggestsOptimization": 1.0,    // Critical (100%)
    "providesCodeExample": 0.8,     // Important (80%)
    "estimatesImprovement": 0.6,    // Helpful (60%)
    "explainsRationale": 0.5        // Nice-to-have (50%)
  }
}
```

## Interpretation

### Quality Scores
- **90-100%**: Excellent - Complete, accurate, highly relevant
- **80-89%**: Good - Most requirements met, minor gaps
- **70-79%**: Acceptable - Core requirements met
- **<70%**: Poor - Significant gaps in coverage

### Response Times
- **<1500ms**: Fast
- **1500-3000ms**: Moderate
- **>3000ms**: Slow

### Consistency
- **>90%**: Highly consistent
- **80-90%**: Consistent
- **<80%**: Variable

## Example Output

```
╔════════════════════════════════════════════════════════════════════════════╗
║                        BENCHMARK SUMMARY                                    ║
╚════════════════════════════════════════════════════════════════════════════╝

🏆 Winner: MINIMAL format
   Overall Quality: 92.3%

📈 Format Comparison (vs. metadata baseline):

minimal      | Quality: +5.2% | Speed: +12.3% | Consistency: +3.1%
metadata     | Quality: 0.0%  | Speed: 0.0%   | Consistency: 0.0%
code-heavy   | Quality: -2.1% | Speed: -8.7%  | Consistency: -1.4%

💡 Recommendations:
   • Highest quality responses: minimal format (92.3%)
   • Fastest responses: minimal format (1234ms avg)
   • Most consistent: minimal format (94.5% consistency)
```

## Advanced Usage

### Testing Single Format
```bash
/benchmark-prompts test minimal --rounds 5
```

### Analyzing Specific Run
```bash
/benchmark-prompts analyze
```

### Exporting Data
```bash
/benchmark-prompts report csv
```

### Comparing Results
```bash
/benchmark-prompts compare
```

## Troubleshooting

### No Results Found
```bash
# Run a benchmark first
/benchmark-prompts run
```

### Low Quality Scores
- Check test scenarios match agent capabilities
- Review scoring criteria weights
- Increase rounds for better averaging

### High Variance
- Increase number of rounds
- Check for randomness in scenarios
- Review consistency metrics

## Development

### Adding New Scenarios
Edit `tests/test-scenarios.json`:

```json
{
  "id": "new-scenario",
  "complexity": "medium",
  "task": "Your task description",
  "expectedCapabilities": ["capability1", "capability2"],
  "scoringCriteria": {
    "criterion1": 1.0,
    "criterion2": 0.8
  }
}
```

### Custom Metrics
Extend `MetricsCollector` class in `runner/metrics-collector.js`

### Custom Evaluators
Extend `PromptEvaluator` class in `runner/prompt-evaluator.js`

## Integration

The benchmark system is integrated with the Claude Flow slash command system:

```javascript
// src/slash-commands/benchmark-prompts.js
module.exports = {
  command: 'benchmark-prompts',
  description: 'Run automated benchmarks',
  handler: benchmarkPrompts
};
```

## Future Enhancements

- [ ] Real-time progress tracking
- [ ] Parallel format testing
- [ ] Custom scenario creation via CLI
- [ ] Historical trend analysis
- [ ] Web-based results viewer
- [ ] Integration with CI/CD
- [ ] Multi-model comparison
- [ ] Token cost analysis
- [ ] A/B testing framework

## Contributing

To add new test scenarios or improve evaluation:

1. Add scenario to `tests/test-scenarios.json`
2. Update scoring criteria as needed
3. Run benchmark to validate
4. Submit results for review

## License

Part of the Claude Flow Novice project.