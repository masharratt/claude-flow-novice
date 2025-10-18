#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Quality Gates Configuration
const QUALITY_GATES = {
  testCoverage: 90,  // 90% test coverage required
  bundleSizeLimit: 500,  // 500 KB max bundle size
  vulnerabilities: 0,  // No known vulnerabilities
  typeErrors: 0,  // No TypeScript type errors
};

function runPrePublishChecks() {
  console.log('🚀 Running Pre-Publish Quality Gates');

  // 1. Test Coverage Check
  const coverageReport = JSON.parse(fs.readFileSync('./coverage/coverage-summary.json', 'utf8'));
  const totalCoverage = coverageReport.total.lines.pct;
  if (totalCoverage < QUALITY_GATES.testCoverage) {
    throw new Error(`Test coverage (${totalCoverage}%) is below required ${QUALITY_GATES.testCoverage}%`);
  }

  // 2. Bundle Size Check
  const bundleSize = parseInt(execSync('npm run bundle-size').toString().trim());
  if (bundleSize > QUALITY_GATES.bundleSizeLimit) {
    throw new Error(`Bundle size (${bundleSize} KB) exceeds limit of ${QUALITY_GATES.bundleSizeLimit} KB`);
  }

  // 3. Security Vulnerability Scan
  const vulnerabilitiesCount = parseInt(execSync('npm audit --json | jq ".vulnerabilities | length"').toString().trim());
  if (vulnerabilitiesCount > QUALITY_GATES.vulnerabilities) {
    throw new Error(`${vulnerabilitiesCount} known vulnerabilities found`);
  }

  // 4. TypeScript Type Check
  const typeErrorsCount = parseInt(execSync('npm run typecheck | grep -c "error"').toString().trim());
  if (typeErrorsCount > QUALITY_GATES.typeErrors) {
    throw new Error(`${typeErrorsCount} TypeScript type errors found`);
  }

  console.log('✅ All pre-publish quality gates passed successfully!');
}

try {
  runPrePublishChecks();
  process.exit(0);
} catch (error) {
  console.error('❌ Pre-publish checks failed:', error.message);
  process.exit(1);
}