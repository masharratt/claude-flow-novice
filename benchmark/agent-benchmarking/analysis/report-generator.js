import fs from 'fs/promises';
import path from 'path';

class ReportGenerator {
  constructor() {
    this.reportTemplates = {
      markdown: this.generateMarkdownReport.bind(this),
      csv: this.generateCSVReport.bind(this),
      json: this.generateJSONReport.bind(this)
    };
  }

  async generateAll(results, analysis, outputDir) {
    const reports = {};

    for (const [format, generator] of Object.entries(this.reportTemplates)) {
      const content = await generator(results, analysis);
      const filename = `benchmark-report.${format}`;
      const filepath = path.join(outputDir, filename);

      await fs.writeFile(filepath, content);
      reports[format] = filepath;
    }

    return reports;
  }

  async generateMarkdownReport(results, analysis) {
    let report = '# Agent Prompt Format Benchmark Report\n\n';

    // Metadata
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Rounds:** ${results.metadata.rounds}\n`;
    report += `**Formats Tested:** ${Object.keys(results.formats).length}\n`;
    report += `**Total Scenarios:** ${Object.keys(results.formats[Object.keys(results.formats)[0]].scenarios).length}\n\n`;

    // Executive Summary
    report += '## Executive Summary\n\n';
    report += `🏆 **Winner:** ${results.summary.winner.toUpperCase()} format\n`;
    report += `📊 **Quality Score:** ${results.summary.winnerQuality}%\n\n`;

    // Format Comparison Table
    report += '## Format Comparison\n\n';
    report += '| Format | Overall Quality | Avg Response Time | Consistency | Success Rate |\n';
    report += '|--------|----------------|------------------|-------------|-------------|\n';

    for (const [formatName, formatData] of Object.entries(results.formats)) {
      const agg = formatData.aggregated;
      report += `| ${formatName} | ${agg.overallQuality.toFixed(1)}% | ${agg.overallResponseTime.toFixed(0)}ms | ${agg.overallConsistency.toFixed(1)}% | ${agg.successRate.toFixed(1)}% |\n`;
    }

    report += '\n';

    // Statistical Analysis
    if (analysis) {
      report += '## Statistical Analysis\n\n';

      // Descriptive Statistics
      report += '### Descriptive Statistics\n\n';
      for (const [formatName, stats] of Object.entries(analysis.descriptiveStats)) {
        report += `#### ${formatName}\n\n`;
        report += `- **Mean Quality:** ${stats.quality.mean.toFixed(1)}%\n`;
        report += `- **Std Dev:** ${stats.quality.stdDev.toFixed(2)}\n`;
        report += `- **Median:** ${stats.quality.median.toFixed(1)}%\n`;
        report += `- **P95:** ${stats.quality.p95.toFixed(1)}%\n`;
        report += `- **CV:** ${stats.quality.coefficientOfVariation.toFixed(1)}%\n\n`;
      }

      // Significance Tests
      report += '### Significance Tests\n\n';
      if (analysis.significance.anova) {
        report += `**ANOVA Results:**\n`;
        report += `- F-statistic: ${analysis.significance.anova.fStatistic.toFixed(3)}\n`;
        report += `- p-value: ${analysis.significance.anova.pValue.toFixed(4)}\n`;
        report += `- Significant: ${analysis.significance.anova.significant ? 'Yes ✓' : 'No'}\n\n`;
      }

      // Effect Sizes
      report += '### Effect Sizes (Cohen\'s d)\n\n';
      for (const [comparison, effect] of Object.entries(analysis.effectSize)) {
        report += `- **${comparison.replace('_vs_', ' vs ')}**: d=${effect.value.toFixed(3)} (${effect.magnitude})\n`;
      }
      report += '\n';
    }

    // Recommendations
    report += '## Recommendations\n\n';
    for (const rec of results.summary.recommendation) {
      report += `- ${rec}\n`;
    }
    report += '\n';

    // Detailed Results by Scenario
    report += '## Detailed Results by Scenario\n\n';
    const firstFormat = Object.keys(results.formats)[0];
    const scenarios = Object.keys(results.formats[firstFormat].scenarios);

    for (const scenarioId of scenarios) {
      report += `### ${scenarioId}\n\n`;
      report += '| Format | Quality | Response Time | Consistency |\n';
      report += '|--------|---------|--------------|-------------|\n';

      for (const [formatName, formatData] of Object.entries(results.formats)) {
        const scenario = formatData.scenarios[scenarioId];
        const avg = scenario.average;
        report += `| ${formatName} | ${avg.qualityScore.toFixed(1)}% | ${avg.responseTime.toFixed(0)}ms | ${avg.consistency.toFixed(1)}% |\n`;
      }

      report += '\n';
    }

    // Methodology
    report += '## Methodology\n\n';
    report += `This benchmark tested ${Object.keys(results.formats).length} different agent prompt formats `;
    report += `across ${scenarios.length} test scenarios, with ${results.metadata.rounds} rounds per scenario.\n\n`;
    report += '### Scoring Criteria\n\n';
    report += '- **Quality Score:** Weighted evaluation of completeness, accuracy, relevance, and clarity\n';
    report += '- **Response Time:** Total time from request to complete response\n';
    report += '- **Consistency:** Variance in quality across multiple rounds\n\n';

    return report;
  }

  async generateCSVReport(results, analysis) {
    let csv = 'Format,Scenario,Round,Quality,ResponseTime,Consistency\n';

    for (const [formatName, formatData] of Object.entries(results.formats)) {
      for (const [scenarioId, scenarioData] of Object.entries(formatData.scenarios)) {
        for (const round of scenarioData.rounds) {
          csv += `${formatName},${scenarioId},${round.round},${round.qualityScore.toFixed(2)},${round.responseTime},${scenarioData.average.consistency.toFixed(2)}\n`;
        }
      }
    }

    return csv;
  }

  async generateJSONReport(results, analysis) {
    return JSON.stringify({
      results,
      analysis
    }, null, 2);
  }

  async generateVisualReport(results) {
    // ASCII chart generator for terminal output
    const formats = Object.keys(results.formats);
    let visual = '\n📊 Performance Comparison\n\n';

    // Quality bar chart
    visual += 'Quality Scores:\n';
    for (const [formatName, formatData] of Object.entries(results.formats)) {
      const quality = formatData.aggregated.overallQuality;
      const barLength = Math.round(quality / 2);
      const bar = '█'.repeat(barLength);
      visual += `${formatName.padEnd(12)} ${bar} ${quality.toFixed(1)}%\n`;
    }

    visual += '\nResponse Times:\n';
    const maxTime = Math.max(...Object.values(results.formats).map(f => f.aggregated.overallResponseTime));
    for (const [formatName, formatData] of Object.entries(results.formats)) {
      const time = formatData.aggregated.overallResponseTime;
      const barLength = Math.round((time / maxTime) * 50);
      const bar = '█'.repeat(barLength);
      visual += `${formatName.padEnd(12)} ${bar} ${time.toFixed(0)}ms\n`;
    }

    visual += '\nConsistency:\n';
    for (const [formatName, formatData] of Object.entries(results.formats)) {
      const consistency = formatData.aggregated.overallConsistency;
      const barLength = Math.round(consistency / 2);
      const bar = '█'.repeat(barLength);
      visual += `${formatName.padEnd(12)} ${bar} ${consistency.toFixed(1)}%\n`;
    }

    return visual;
  }
}

export { ReportGenerator };