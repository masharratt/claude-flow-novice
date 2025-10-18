const path = require('path');
const { AgentBenchmarkSystem } = require('../../benchmark/agent-benchmarking/index');

/**
 * Benchmark agent prompt formats
 *
 * @command /benchmark-prompts
 * @description Run automated benchmarks comparing different agent prompt formatting styles
 * @example /benchmark-prompts run
 * @example /benchmark-prompts run --rounds 5 --parallel
 * @example /benchmark-prompts analyze
 * @example /benchmark-prompts report markdown
 */
async function benchmarkPrompts(args) {
  const system = new AgentBenchmarkSystem();

  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'run':
        return await runBenchmark(system, args);

      case 'test':
        return await testFormat(system, args);

      case 'analyze':
        return await analyzeBenchmark(system);

      case 'report':
        return await generateReport(system, args);

      case 'compare':
        return await compareBenchmark(system);

      case 'list':
        return await listBenchmarks(system);

      case 'reset':
        return await resetBenchmarks(system);

      case 'help':
      default:
        return showHelp();
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    if (args.includes('--verbose')) {
      console.error(error.stack);
    }
    return { success: false, error: error.message };
  }
}

async function runBenchmark(system, args) {
  console.log('\n🎯 Running Agent Prompt Format Benchmark\n');

  const options = {
    rounds: 3,
    parallel: false,
    verbose: false,
    scenarios: null
  };

  // Parse options
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--rounds' && args[i + 1]) {
      options.rounds = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--parallel') {
      options.parallel = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--scenarios' && args[i + 1]) {
      options.scenarios = args[i + 1];
      i++;
    }
  }

  console.log('Configuration:');
  console.log(`  Rounds: ${options.rounds}`);
  console.log(`  Parallel: ${options.parallel ? 'Yes' : 'No'}`);
  console.log(`  Scenarios: ${options.scenarios || 'All'}\n`);

  const result = await system.run(options);

  console.log('\n✅ Benchmark complete!');
  console.log('\nNext steps:');
  console.log('  /benchmark-prompts analyze   - View statistical analysis');
  console.log('  /benchmark-prompts report    - Generate detailed reports');
  console.log('  /benchmark-prompts compare   - Interactive comparison\n');

  return { success: true, result };
}

async function testFormat(system, args) {
  const format = args[1];
  if (!format || !['minimal', 'metadata', 'code-heavy'].includes(format)) {
    console.error('\n❌ Invalid format. Use: minimal, metadata, or code-heavy\n');
    return { success: false };
  }

  console.log(`\n🧪 Testing ${format} format\n`);

  // Run benchmark with only specified format
  const options = {
    rounds: parseInt(args[2]) || 3,
    parallel: false,
    verbose: args.includes('--verbose')
  };

  // This would need modification to support single format testing
  console.log('Note: Currently runs all formats. Single format testing coming soon.\n');

  const result = await system.run(options);
  return { success: true, result };
}

async function analyzeBenchmark(system) {
  console.log('\n📊 Analyzing Benchmark Results\n');

  const result = await system.analyze();

  if (!result) {
    return { success: false };
  }

  console.log('\n✅ Analysis complete\n');
  return { success: true, result };
}

async function generateReport(system, args) {
  const format = args[1] || 'all';

  if (!['all', 'markdown', 'csv', 'json'].includes(format)) {
    console.error('\n❌ Invalid format. Use: all, markdown, csv, or json\n');
    return { success: false };
  }

  console.log(`\n📄 Generating ${format} report(s)\n`);

  const result = await system.generateReport(format);

  if (!result) {
    return { success: false };
  }

  console.log('\n✅ Report generation complete\n');
  return { success: true, result };
}

async function compareBenchmark(system) {
  console.log('\n📊 Interactive Benchmark Comparison\n');

  // Load and analyze latest results
  const result = await system.analyze();

  if (!result) {
    return { success: false };
  }

  const { results, analysis } = result;

  // Print comparison table
  console.log('Format Comparison:');
  console.log('─'.repeat(80));
  console.log('Format'.padEnd(15) + 'Quality'.padEnd(15) + 'Speed'.padEnd(15) + 'Consistency'.padEnd(15) + 'Success');
  console.log('─'.repeat(80));

  for (const [formatName, formatData] of Object.entries(results.formats)) {
    const agg = formatData.aggregated;
    console.log(
      formatName.padEnd(15) +
      `${agg.overallQuality.toFixed(1)}%`.padEnd(15) +
      `${agg.overallResponseTime.toFixed(0)}ms`.padEnd(15) +
      `${agg.overallConsistency.toFixed(1)}%`.padEnd(15) +
      `${agg.successRate.toFixed(1)}%`
    );
  }
  console.log('─'.repeat(80));

  console.log('\n🏆 Winner: ' + results.summary.winner.toUpperCase());
  console.log('\nRecommendations:');
  for (const rec of results.summary.recommendation) {
    console.log(`  • ${rec}`);
  }
  console.log('');

  return { success: true, results, analysis };
}

async function listBenchmarks(system) {
  console.log('\n📂 Benchmark Results\n');
  await system.listResults();
  console.log('');
  return { success: true };
}

async function resetBenchmarks(system) {
  console.log('\n⚠️  This will delete all benchmark results.\n');

  // In interactive mode, would ask for confirmation
  // For now, proceeding with reset

  await system.reset();
  console.log('');
  return { success: true };
}

function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                  Agent Prompt Format Benchmark System                      ║
╚════════════════════════════════════════════════════════════════════════════╝

Compare different agent prompt formatting styles:
  • Minimal Format    - Simple frontmatter only
  • Metadata Format   - Full configuration with hooks and capabilities
  • Code-Heavy Format - Extensive code examples

COMMANDS:
  /benchmark-prompts run [options]    Run full benchmark suite
  /benchmark-prompts test <format>    Test specific format
  /benchmark-prompts analyze          Analyze collected results
  /benchmark-prompts report [format]  Generate reports (all|markdown|csv|json)
  /benchmark-prompts compare          Interactive comparison view
  /benchmark-prompts list             List all benchmark results
  /benchmark-prompts reset            Clear all benchmark data

OPTIONS:
  --rounds <n>         Number of test rounds (default: 3)
  --parallel           Run tests in parallel
  --scenarios <list>   Comma-separated scenario IDs to test
  --verbose            Detailed output
  --export             Export results

EXAMPLES:
  /benchmark-prompts run
  /benchmark-prompts run --rounds 5 --parallel
  /benchmark-prompts test minimal --verbose
  /benchmark-prompts analyze
  /benchmark-prompts report markdown
  /benchmark-prompts compare

TEST SCENARIOS:
  • simple-code-analysis          - Basic algorithm optimization
  • memory-leak-detection         - Memory leak identification
  • database-query-optimization   - Query performance optimization
  • caching-strategy              - Cache architecture design
  • resource-allocation           - Resource calculation
  • async-pattern-optimization    - Async code optimization
  • algorithm-complexity-reduction - Algorithm improvement
  • load-testing-strategy         - Load test planning
  • bottleneck-identification     - Performance bottleneck analysis
  • scalability-architecture      - Scalability design

BENCHMARK METRICS:
  • Quality Score    - Completeness, accuracy, relevance, clarity
  • Response Time    - Total time to generate response
  • Consistency      - Variance across multiple rounds
  • Success Rate     - Percentage of successful completions

For more information, see: /benchmark/agent-benchmarking/README.md
`);

  return { success: true };
}

module.exports = {
  command: 'benchmark-prompts',
  description: 'Run automated benchmarks comparing agent prompt formats',
  handler: benchmarkPrompts,
  examples: [
    '/benchmark-prompts run',
    '/benchmark-prompts run --rounds 5 --parallel',
    '/benchmark-prompts analyze',
    '/benchmark-prompts report markdown',
    '/benchmark-prompts compare'
  ]
};