import { BenchmarkOrchestrator } from './runner/benchmark-orchestrator.js';
import { StatisticalAnalyzer } from './analysis/statistical-analyzer.js';
import { ReportGenerator } from './analysis/report-generator.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AgentBenchmarkSystem {
  constructor() {
    this.resultsDir = path.join(__dirname, 'results');
  }

  async run(options = {}) {
    console.log('🚀 Agent Prompt Format Benchmark System\n');

    // Run benchmark
    const orchestrator = new BenchmarkOrchestrator({
      ...options,
      scenarios: options.scenario // Map 'scenario' to 'scenarios' for orchestrator
    });
    const results = await orchestrator.runFullBenchmark();

    // Statistical analysis
    console.log('\n📊 Performing statistical analysis...');
    const analyzer = new StatisticalAnalyzer();
    const analysis = analyzer.analyze(results);

    // Generate reports
    console.log('\n📄 Generating reports...');
    const reportGenerator = new ReportGenerator();

    const reportsDir = path.join(this.resultsDir, 'reports');
    await fs.mkdir(reportsDir, { recursive: true });

    const reportPaths = await reportGenerator.generateAll(results, analysis, reportsDir);

    console.log('\n✅ Reports generated:');
    for (const [format, filepath] of Object.entries(reportPaths)) {
      console.log(`   - ${format}: ${filepath}`);
    }

    // Print visual report
    const visual = await reportGenerator.generateVisualReport(results);
    console.log(visual);

    return { results, analysis, reportPaths };
  }

  async analyze() {
    console.log('📊 Analyzing existing benchmark results...\n');

    // Find most recent result file
    const rawDir = path.join(this.resultsDir, 'raw');
    const files = await fs.readdir(rawDir);
    const resultFiles = files.filter(f => f.startsWith('benchmark-') && f.endsWith('.json'));

    if (resultFiles.length === 0) {
      console.error('❌ No benchmark results found. Run a benchmark first with /benchmark-prompts run');
      return null;
    }

    // Load most recent
    const latest = resultFiles.sort().reverse()[0];
    const filepath = path.join(rawDir, latest);
    const data = await fs.readFile(filepath, 'utf8');
    const results = JSON.parse(data);

    console.log(`📂 Loaded: ${latest}\n`);

    // Analyze
    const analyzer = new StatisticalAnalyzer();
    const analysis = analyzer.analyze(results);

    // Print analysis
    this.printAnalysis(analysis);

    return { results, analysis };
  }

  async generateReport(format = 'all') {
    console.log('📄 Generating benchmark report...\n');

    // Load latest results
    const rawDir = path.join(this.resultsDir, 'raw');
    const files = await fs.readdir(rawDir);
    const resultFiles = files.filter(f => f.startsWith('benchmark-') && f.endsWith('.json'));

    if (resultFiles.length === 0) {
      console.error('❌ No benchmark results found.');
      return null;
    }

    const latest = resultFiles.sort().reverse()[0];
    const filepath = path.join(rawDir, latest);
    const data = await fs.readFile(filepath, 'utf8');
    const results = JSON.parse(data);

    // Analyze
    const analyzer = new StatisticalAnalyzer();
    const analysis = analyzer.analyze(results);

    // Generate reports
    const reportGenerator = new ReportGenerator();
    const reportsDir = path.join(this.resultsDir, 'reports');
    await fs.mkdir(reportsDir, { recursive: true });

    if (format === 'all') {
      const reportPaths = await reportGenerator.generateAll(results, analysis, reportsDir);
      console.log('✅ All reports generated:');
      for (const [fmt, path] of Object.entries(reportPaths)) {
        console.log(`   - ${fmt}: ${path}`);
      }
      return reportPaths;
    } else {
      const generator = reportGenerator.reportTemplates[format];
      if (!generator) {
        console.error(`❌ Unknown format: ${format}. Use: markdown, csv, or json`);
        return null;
      }

      const content = await generator(results, analysis);
      const filename = `benchmark-report.${format}`;
      const outPath = path.join(reportsDir, filename);
      await fs.writeFile(outPath, content);

      console.log(`✅ Report generated: ${outPath}`);
      return { [format]: outPath };
    }
  }

  printAnalysis(analysis) {
    console.log('📊 Statistical Analysis Results\n');

    // ANOVA
    if (analysis.significance.anova) {
      console.log('ANOVA Test:');
      console.log(`  F-statistic: ${analysis.significance.anova.fStatistic.toFixed(3)}`);
      console.log(`  p-value: ${analysis.significance.anova.pValue.toFixed(4)}`);
      console.log(`  Significant: ${analysis.significance.anova.significant ? 'Yes ✓' : 'No'}\n`);
    }

    // Effect sizes
    console.log('Effect Sizes (Cohen\'s d):');
    for (const [comparison, effect] of Object.entries(analysis.effectSize)) {
      console.log(`  ${comparison.replace('_vs_', ' vs ')}: ${effect.value.toFixed(3)} (${effect.magnitude})`);
    }
    console.log('');

    // Recommendations
    if (analysis.recommendations.length > 0) {
      console.log('Statistical Recommendations:');
      for (const rec of analysis.recommendations) {
        console.log(`  • ${rec.message}`);
      }
    }
  }

  async listResults() {
    const rawDir = path.join(this.resultsDir, 'raw');

    try {
      const files = await fs.readdir(rawDir);
      const resultFiles = files.filter(f => f.startsWith('benchmark-') && f.endsWith('.json'));

      if (resultFiles.length === 0) {
        console.log('No benchmark results found.');
        return;
      }

      console.log(`Found ${resultFiles.length} benchmark result(s):\n`);
      for (const file of resultFiles.sort().reverse()) {
        const filepath = path.join(rawDir, file);
        const stats = await fs.stat(filepath);
        console.log(`  - ${file} (${new Date(stats.mtime).toLocaleString()})`);
      }
    } catch (error) {
      console.log('No benchmark results found.');
    }
  }

  async listScenarios(language = 'javascript') {
    const scenarioFile = language === 'rust' ? 'rust-scenarios.json' : 'test-scenarios.json';
    const scenariosPath = path.join(__dirname, 'tests', scenarioFile);

    try {
      const data = await fs.readFile(scenariosPath, 'utf8');
      const scenarioData = JSON.parse(data);
      const scenarios = scenarioData.scenarios;

      console.log(`\n${language.toUpperCase()} Test Scenarios (${scenarios.length} total):\n`);

      for (const scenario of scenarios) {
        console.log(`  ${scenario.id}`);
        console.log(`    Name: ${scenario.name}`);
        console.log(`    Difficulty: ${scenario.difficulty}`);
        console.log(`    Time: ${scenario.estimatedTime}`);
        console.log(`    Category: ${scenario.category}`);
        console.log('');
      }
    } catch (error) {
      console.error(`Error loading ${language} scenarios:`, error.message);
    }
  }

  async reset() {
    console.log('🗑️  Clearing benchmark data...\n');

    const dirs = [
      path.join(this.resultsDir, 'raw'),
      path.join(this.resultsDir, 'reports'),
      path.join(this.resultsDir, 'processed')
    ];

    for (const dir of dirs) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          await fs.unlink(path.join(dir, file));
        }
        console.log(`  ✓ Cleared ${dir}`);
      } catch (error) {
        // Directory doesn't exist or is empty
      }
    }

    console.log('\n✅ Benchmark data cleared');
  }

  printHelp() {
    console.log(`
🚀 Agent Prompt Format Benchmark System

USAGE:
  node index.js <command> [options]

COMMANDS:
  run [rounds]       Run benchmark tests
                     - rounds: Number of rounds per scenario (default: 3)

  analyze            Analyze existing benchmark results

  report [format]    Generate report (markdown, csv, json, or all)

  list               List benchmark results or scenarios
                     - Add --scenarios to list available scenarios
                     - Add --rust to list Rust scenarios

  reset              Clear all benchmark data

  help               Show this help message

OPTIONS:
  --rust             Run Rust scenarios (default: JavaScript)
  --parallel         Run tests in parallel
  --verbose          Show detailed output
  --scenario=<id>    Run specific scenario(s) (comma-separated)
  --scenarios        List available scenarios (with list command)

EXAMPLES:
  # Run JavaScript benchmarks with 5 rounds
  node index.js run 5

  # Run Rust benchmarks with verbose output
  node index.js run 3 --rust --verbose

  # Run specific Rust scenario
  node index.js run 3 --rust --scenario=rust-01-basic

  # List all Rust scenarios
  node index.js list --rust --scenarios

  # Generate markdown report
  node index.js report markdown

For more information, visit:
https://github.com/your-repo/agent-benchmarking
`);
  }
}

export { AgentBenchmarkSystem };

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const system = new AgentBenchmarkSystem();
  const command = process.argv[2] || 'run';

  (async () => {
    try {
      switch (command) {
        case 'run':
          await system.run({
            rounds: parseInt(process.argv[3]) || 3,
            parallel: process.argv.includes('--parallel'),
            verbose: process.argv.includes('--verbose'),
            language: process.argv.includes('--rust') ? 'rust' : 'javascript',
            scenario: process.argv.find(arg => arg.startsWith('--scenario='))?.split('=')[1]
          });
          break;
        case 'analyze':
          await system.analyze();
          break;
        case 'report':
          await system.generateReport(process.argv[3] || 'all');
          break;
        case 'list':
          if (process.argv.includes('--scenarios') || process.argv.includes('--rust')) {
            const language = process.argv.includes('--rust') ? 'rust' : 'javascript';
            await system.listScenarios(language);
          } else {
            await system.listResults();
          }
          break;
        case 'reset':
          await system.reset();
          break;
        case 'help':
          system.printHelp();
          break;
        default:
          console.log('Unknown command. Use: run, analyze, report, list, reset, or help');
          console.log('Run "node index.js help" for more information.');
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (process.argv.includes('--verbose')) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}