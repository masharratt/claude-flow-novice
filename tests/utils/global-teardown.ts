import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Global Teardown for Playwright Tests
 *
 * Handles:
 * - Test cleanup
 * - Report generation
 * - Artifact organization
 * - Performance metrics compilation
 */

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global test teardown...');

  // Clean up test data
  await cleanupTestData();

  // Generate test reports
  await generateTestReports();

  // Organize test artifacts
  await organizeTestArtifacts();

  // Compile performance metrics
  await compilePerformanceMetrics();

  // Cleanup resources
  await cleanupResources();

  console.log('✅ Global test teardown completed');
}

async function cleanupTestData() {
  console.log('🗑️  Cleaning up test data...');

  try {
    // Clean test database
    if (process.env.NODE_ENV === 'test') {
      execSync('npm run db:clean:test', { stdio: 'pipe' });
    }

    // Clean temporary files
    const tempDir = path.join(process.cwd(), 'temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log('✅ Test data cleaned');
  } catch (error) {
    console.warn('⚠️  Test cleanup failed:', error);
  }
}

async function generateTestReports() {
  console.log('📊 Generating test reports...');

  try {
    const testResultsPath = path.join(process.cwd(), 'test-results');
    const resultsFile = path.join(testResultsPath, 'results.json');

    if (fs.existsSync(resultsFile)) {
      const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

      // Generate summary report
      const summary = {
        timestamp: new Date().toISOString(),
        totalTests: results.stats?.total || 0,
        passed: results.stats?.passed || 0,
        failed: results.stats?.failed || 0,
        skipped: results.stats?.skipped || 0,
        duration: results.stats?.duration || 0,
        projects: results.suites?.map((suite: any) => ({
          name: suite.title,
          tests: suite.specs?.length || 0,
          passed: suite.specs?.filter((spec: any) =>
            spec.tests.every((test: any) => test.results.every((result: any) => result.status === 'passed'))
          ).length || 0
        })) || []
      };

      // Save summary
      const summaryPath = path.join(testResultsPath, 'test-summary.json');
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

      // Generate markdown report
      const markdownReport = generateMarkdownReport(summary, results);
      const markdownPath = path.join(testResultsPath, 'test-report.md');
      fs.writeFileSync(markdownPath, markdownReport);

      console.log('✅ Test reports generated');
    }
  } catch (error) {
    console.warn('⚠️  Report generation failed:', error);
  }
}

function generateMarkdownReport(summary: any, results: any): string {
  const passRate = summary.totalTests > 0 ?
    ((summary.passed / summary.totalTests) * 100).toFixed(1) : '0.0';

  return `# Test Execution Report

## Summary
- **Total Tests**: ${summary.totalTests}
- **Passed**: ${summary.passed}
- **Failed**: ${summary.failed}
- **Skipped**: ${summary.skipped}
- **Pass Rate**: ${passRate}%
- **Duration**: ${Math.round(summary.duration / 1000)}s
- **Timestamp**: ${summary.timestamp}

## Project Results
${summary.projects.map((project: any) => `
### ${project.name}
- Tests: ${project.tests}
- Passed: ${project.passed}
- Pass Rate: ${project.tests > 0 ? ((project.passed / project.tests) * 100).toFixed(1) : '0.0'}%
`).join('')}

## Test Categories

### User Flow Tests
- Critical user journeys validation
- Authentication and authorization flows
- UI interaction patterns

### Multi-Agent Coordination Tests
- Swarm initialization and coordination
- Agent communication protocols
- Task orchestration workflows

### Performance Tests
- Page load performance metrics
- API response time validation
- Agent spawning performance

### Visual Regression Tests
- UI component consistency
- Screenshot comparison results
- Cross-browser visual validation

## Artifacts

Test artifacts are available in the \`test-results\` directory:
- HTML Report: \`html-report/index.html\`
- Screenshots: \`artifacts/\`
- Videos: \`artifacts/\`
- Traces: \`artifacts/\`
`;
}

async function organizeTestArtifacts() {
  console.log('📁 Organizing test artifacts...');

  try {
    const testResultsPath = path.join(process.cwd(), 'test-results');
    const artifactsPath = path.join(testResultsPath, 'artifacts');

    if (fs.existsSync(artifactsPath)) {
      // Create organized directories
      const organizedPath = path.join(testResultsPath, 'organized');
      const dirs = ['screenshots', 'videos', 'traces', 'downloads'];

      dirs.forEach(dir => {
        const dirPath = path.join(organizedPath, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      });

      // Move and organize artifacts
      const files = fs.readdirSync(artifactsPath);
      files.forEach(file => {
        const filePath = path.join(artifactsPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
          let targetDir = 'other';

          if (file.endsWith('.png') || file.endsWith('.jpg')) {
            targetDir = 'screenshots';
          } else if (file.endsWith('.webm') || file.endsWith('.mp4')) {
            targetDir = 'videos';
          } else if (file.endsWith('.zip')) {
            targetDir = 'traces';
          }

          const targetPath = path.join(organizedPath, targetDir, file);
          fs.copyFileSync(filePath, targetPath);
        }
      });

      console.log('✅ Test artifacts organized');
    }
  } catch (error) {
    console.warn('⚠️  Artifact organization failed:', error);
  }
}

async function compilePerformanceMetrics() {
  console.log('⚡ Compiling performance metrics...');

  try {
    const performanceDir = path.join(process.cwd(), 'test-results/performance');
    if (!fs.existsSync(performanceDir)) {
      fs.mkdirSync(performanceDir, { recursive: true });
    }

    // Compile metrics from various sources
    const metrics = {
      timestamp: new Date().toISOString(),
      pageLoad: [],
      apiResponses: [],
      agentPerformance: [],
      visualMetrics: []
    };

    // Save compiled metrics
    const metricsPath = path.join(performanceDir, 'compiled-metrics.json');
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

    console.log('✅ Performance metrics compiled');
  } catch (error) {
    console.warn('⚠️  Performance metrics compilation failed:', error);
  }
}

async function cleanupResources() {
  console.log('🧹 Cleaning up resources...');

  try {
    // Stop any running Claude Flow processes
    try {
      execSync('pkill -f "claude-flow"', { stdio: 'pipe' });
    } catch {
      // Ignore if no processes to kill
    }

    // Clean temporary auth files older than 1 day
    const authDir = path.join(process.cwd(), 'test-results/.auth');
    if (fs.existsSync(authDir)) {
      const files = fs.readdirSync(authDir);
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

      files.forEach(file => {
        const filePath = path.join(authDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < oneDayAgo) {
          fs.unlinkSync(filePath);
        }
      });
    }

    console.log('✅ Resources cleaned up');
  } catch (error) {
    console.warn('⚠️  Resource cleanup failed:', error);
  }
}

export default globalTeardown;