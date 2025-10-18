#!/usr/bin/env node
/**
 * Standardized build metrics collection
 * Usage: node scripts/collect-build-metrics.js [--json]
 *
 * Prevents ambiguous metrics like Sprint 7.1's "691 files compiled"
 * See CLAUDE.md Section 11 for reporting standards
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

function countFiles(pattern, dir = 'src') {
  try {
    const cmd = `find ${dir} -name "${pattern}" 2>/dev/null | wc -l`;
    return parseInt(execSync(cmd, { encoding: 'utf8' }).trim());
  } catch {
    return 0;
  }
}

function collectMetrics() {
  const metrics = {
    source_files: {
      typescript: countFiles('*.ts') + countFiles('*.tsx'),
      javascript: countFiles('*.js'),
      jsx: countFiles('*.jsx')
    },
    output_files: {
      javascript: countFiles('*.js', '.claude-flow-novice/dist') || countFiles('*.js', 'dist'),
      sourcemaps: countFiles('*.map', '.claude-flow-novice/dist') || countFiles('*.map', 'dist')
    },
    dist_exists: existsSync('.claude-flow-novice/dist') || existsSync('dist')
  };

  if (metrics.source_files.typescript > 0 && metrics.output_files.javascript > 0) {
    metrics.compilation_ratio =
      ((metrics.output_files.javascript * 100) / metrics.source_files.typescript).toFixed(1) + '%';
  }

  return metrics;
}

const metrics = collectMetrics();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(metrics, null, 2));
} else {
  console.log('📊 Build Metrics Report');
  console.log('═'.repeat(50));
  console.log(`\nSource Files:`);
  console.log(`  TypeScript: ${metrics.source_files.typescript} files`);
  console.log(`  JavaScript: ${metrics.source_files.javascript} files`);
  console.log(`\nOutput Files (dist/):`);
  console.log(`  JavaScript: ${metrics.output_files.javascript} files`);
  console.log(`  Source Maps: ${metrics.output_files.sourcemaps} files`);
  if (metrics.compilation_ratio) {
    console.log(`\nCompilation Ratio: ${metrics.compilation_ratio}`);
    console.log(`(Lower ratio = better tree-shaking)`);
  }

  if (!metrics.dist_exists) {
    console.log('\n⚠️  Warning: dist/ directory not found. Run build first.');
  }
}
