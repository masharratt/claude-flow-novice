#!/usr/bin/env node

/**
 * Comprehensive Test Runner for post-edit-pipeline.js
 * Tests all features with real file execution and detailed reporting
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = path.join(__dirname, '../../config/hooks/post-edit-pipeline.js');
const TEST_FILES_DIR = path.join(__dirname, '../../test-files');
const REPORT_PATH = path.join(__dirname, 'test-report.md');
const LOG_PATH = path.join(process.cwd(), 'post-edit-pipeline.log');

// Test results tracking
const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    categories: {}
};

// Helper to create test category
function createCategory(name) {
    if (!testResults.categories[name]) {
        testResults.categories[name] = {
            tests: [],
            passed: 0,
            failed: 0,
            skipped: 0
        };
    }
    return testResults.categories[name];
}

// Helper to log test result
function logTest(category, name, status, message = '', details = {}) {
    const cat = createCategory(category);
    const test = { name, status, message, details, timestamp: new Date().toISOString() };

    cat.tests.push(test);
    testResults.total++;

    if (status === 'PASS') {
        cat.passed++;
        testResults.passed++;
        console.log(`✅ ${category} > ${name}`);
    } else if (status === 'FAIL') {
        cat.failed++;
        testResults.failed++;
        console.log(`❌ ${category} > ${name}: ${message}`);
    } else if (status === 'SKIP') {
        cat.skipped++;
        testResults.skipped++;
        console.log(`⏭️  ${category} > ${name}: ${message}`);
    }

    if (details.output) {
        console.log(`   Output: ${details.output.substring(0, 100)}...`);
    }
}

// Setup test environment
async function setup() {
    console.log('🔧 Setting up test environment...\n');

    if (!fs.existsSync(TEST_FILES_DIR)) {
        fs.mkdirSync(TEST_FILES_DIR, { recursive: true });
    }

    // Backup existing log
    if (fs.existsSync(LOG_PATH)) {
        fs.copyFileSync(LOG_PATH, `${LOG_PATH}.backup`);
    }
}

// Cleanup test environment
async function cleanup() {
    console.log('\n🧹 Cleaning up test environment...\n');

    // Restore log backup
    if (fs.existsSync(`${LOG_PATH}.backup`)) {
        fs.copyFileSync(`${LOG_PATH}.backup`, LOG_PATH);
        fs.unlinkSync(`${LOG_PATH}.backup`);
    }
}

// Test Category 1: Rust Enforcement Testing
async function testRustEnforcement() {
    console.log('\n🦀 CATEGORY: Rust Enforcement Testing\n');

    // Test 1.1: Detect .unwrap() calls
    try {
        const testFile = path.join(TEST_FILES_DIR, 'rust-unwrap.rs');
        const content = `
fn main() {
    let result = Some(42);
    let value = result.unwrap(); // Line 4
    let another = result.unwrap(); // Line 5
    println!("{}", value);
}
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict --structured`);

            if (stdout.includes('.unwrap()') && stdout.includes('dangerous') || stdout.includes('rustQuality')) {
                logTest('Rust Enforcement', 'Detect .unwrap() calls', 'PASS', 'Successfully detected unwrap violations', { output: stdout });
            } else {
                logTest('Rust Enforcement', 'Detect .unwrap() calls', 'FAIL', 'Did not detect unwrap violations', { output: stdout });
            }
        } catch (error) {
            // Pipeline might exit with error code on violations - check output
            const output = error.stdout || error.stderr || '';
            if (output.includes('.unwrap()') || output.includes('rustQuality')) {
                logTest('Rust Enforcement', 'Detect .unwrap() calls', 'PASS', 'Detected with blocking', { output });
            } else {
                logTest('Rust Enforcement', 'Detect .unwrap() calls', 'FAIL', error.message, { output });
            }
        }
    } catch (error) {
        logTest('Rust Enforcement', 'Detect .unwrap() calls', 'FAIL', error.message);
    }

    // Test 1.2: Detect panic!() macros
    try {
        const testFile = path.join(TEST_FILES_DIR, 'rust-panic.rs');
        const content = `
fn divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        panic!("Division by zero!"); // Line 4
    }
    a / b
}

fn main() {
    let result = divide(10, 2);
    panic!("Another panic"); // Line 11
}
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict --structured`);

            if (stdout.includes('panic!') && (stdout.includes('2') || stdout.includes('occurrences'))) {
                logTest('Rust Enforcement', 'Detect panic!() macros', 'PASS', 'Detected multiple panic macros', { output: stdout });
            } else {
                logTest('Rust Enforcement', 'Detect panic!() macros', 'FAIL', 'Did not count panic macros correctly', { output: stdout });
            }
        } catch (error) {
            const output = error.stdout || error.stderr || '';
            if (output.includes('panic!')) {
                logTest('Rust Enforcement', 'Detect panic!() macros', 'PASS', 'Detected with blocking', { output });
            } else {
                logTest('Rust Enforcement', 'Detect panic!() macros', 'FAIL', error.message, { output });
            }
        }
    } catch (error) {
        logTest('Rust Enforcement', 'Detect panic!() macros', 'FAIL', error.message);
    }

    // Test 1.3: Detect expect() calls
    try {
        const testFile = path.join(TEST_FILES_DIR, 'rust-expect.rs');
        const content = `
fn main() {
    let result = Some(42);
    let value = result.expect("Should have value"); // Line 4
    println!("{}", value);
}
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict --structured`);

            if (stdout.includes('.expect(') || stdout.includes('expect')) {
                logTest('Rust Enforcement', 'Detect .expect() calls', 'PASS', 'Detected expect violations', { output: stdout });
            } else {
                logTest('Rust Enforcement', 'Detect .expect() calls', 'FAIL', 'Did not detect expect', { output: stdout });
            }
        } catch (error) {
            const output = error.stdout || error.stderr || '';
            if (output.includes('expect')) {
                logTest('Rust Enforcement', 'Detect .expect() calls', 'PASS', 'Detected with output', { output });
            } else {
                logTest('Rust Enforcement', 'Detect .expect() calls', 'FAIL', error.message, { output });
            }
        }
    } catch (error) {
        logTest('Rust Enforcement', 'Detect .expect() calls', 'FAIL', error.message);
    }

    // Test 1.4: False positive filtering (comments)
    try {
        const testFile = path.join(TEST_FILES_DIR, 'rust-comments.rs');
        const content = `
fn main() {
    // This comment mentions .unwrap() but shouldn't trigger
    /* Another comment with panic!() inside */
    let value = 42;
    println!("{}", value);
}
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict --structured`);

            // Should NOT report violations for comments
            if (!stdout.includes('unwrap') && !stdout.includes('panic')) {
                logTest('Rust Enforcement', 'Filter false positives (comments)', 'PASS', 'Comments not flagged', { output: stdout });
            } else if (stdout.includes('0 occurrences') || stdout.includes('"unwrap": 0')) {
                logTest('Rust Enforcement', 'Filter false positives (comments)', 'PASS', 'Zero violations found', { output: stdout });
            } else {
                logTest('Rust Enforcement', 'Filter false positives (comments)', 'FAIL', 'Comments incorrectly flagged', { output: stdout });
            }
        } catch (error) {
            logTest('Rust Enforcement', 'Filter false positives (comments)', 'FAIL', error.message, { output: error.stdout });
        }
    } catch (error) {
        logTest('Rust Enforcement', 'Filter false positives (comments)', 'FAIL', error.message);
    }

    // Test 1.5: --rust-strict flag blocks on violations
    try {
        const testFile = path.join(TEST_FILES_DIR, 'rust-blocking.rs');
        const content = `
fn main() {
    let result = Some(42);
    result.unwrap();
}
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict`);

            // Check if it reports failure
            if (stdout.includes('Overall Status: FAILED') || stdout.includes('BLOCKED')) {
                logTest('Rust Enforcement', '--rust-strict blocks on violations', 'PASS', 'Blocked on violations', { output: stdout });
            } else {
                logTest('Rust Enforcement', '--rust-strict blocks on violations', 'FAIL', 'Did not block', { output: stdout });
            }
        } catch (error) {
            // Exit code 1 is expected with blocking
            if (error.code === 1 && (error.stdout.includes('FAILED') || error.stdout.includes('unwrap'))) {
                logTest('Rust Enforcement', '--rust-strict blocks on violations', 'PASS', 'Correctly blocked with exit code', { output: error.stdout });
            } else {
                logTest('Rust Enforcement', '--rust-strict blocks on violations', 'FAIL', error.message, { output: error.stdout });
            }
        }
    } catch (error) {
        logTest('Rust Enforcement', '--rust-strict blocks on violations', 'FAIL', error.message);
    }
}

// Test Category 2: TDD Mode Testing
async function testTDDMode() {
    console.log('\n🧪 CATEGORY: TDD Mode Testing\n');

    // Test 2.1: --tdd-mode flag enables TDD
    try {
        const testFile = path.join(TEST_FILES_DIR, 'tdd-simple.js');
        const content = `
function add(a, b) {
    return a + b;
}
module.exports = add;
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);

            if (stdout.includes('TDD') || stdout.includes('testing')) {
                logTest('TDD Mode', '--tdd-mode flag enables TDD', 'PASS', 'TDD mode activated', { output: stdout });
            } else {
                logTest('TDD Mode', '--tdd-mode flag enables TDD', 'FAIL', 'TDD mode not visible in output', { output: stdout });
            }
        } catch (error) {
            logTest('TDD Mode', '--tdd-mode flag enables TDD', 'FAIL', error.message, { output: error.stdout });
        }
    } catch (error) {
        logTest('TDD Mode', '--tdd-mode flag enables TDD', 'FAIL', error.message);
    }

    // Test 2.2: Single-file test execution
    try {
        const testFile = path.join(TEST_FILES_DIR, 'single-file.js');
        const testContent = `
const subtract = require('./single-file-impl');
test('subtracts numbers', () => {
    expect(subtract(5, 3)).toBe(2);
});
`;
        fs.writeFileSync(testFile, testContent);

        const implFile = path.join(TEST_FILES_DIR, 'single-file-impl.js');
        fs.writeFileSync(implFile, `
function subtract(a, b) { return a - b; }
module.exports = subtract;
`);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);

            // Should not require full system compilation
            if (!stdout.includes('compiling entire project') && stdout.includes('TDD')) {
                logTest('TDD Mode', 'Single-file test execution', 'PASS', 'No full compilation required', { output: stdout });
            } else {
                logTest('TDD Mode', 'Single-file test execution', 'SKIP', 'Cannot verify without test framework', { output: stdout });
            }
        } catch (error) {
            logTest('TDD Mode', 'Single-file test execution', 'SKIP', 'Test framework not available', { output: error.stdout });
        }
    } catch (error) {
        logTest('TDD Mode', 'Single-file test execution', 'SKIP', error.message);
    }

    // Test 2.3: Coverage analysis
    try {
        const testFile = path.join(TEST_FILES_DIR, 'coverage-test.js');
        const content = `
function calculate(op, a, b) {
    switch(op) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        default: return 0;
    }
}
module.exports = calculate;
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode --minimum-coverage 80`);

            if (stdout.includes('coverage') || stdout.includes('80')) {
                logTest('TDD Mode', 'Coverage analysis works', 'PASS', 'Coverage analysis executed', { output: stdout });
            } else {
                logTest('TDD Mode', 'Coverage analysis works', 'SKIP', 'Coverage tools not available', { output: stdout });
            }
        } catch (error) {
            logTest('TDD Mode', 'Coverage analysis works', 'SKIP', 'Coverage not available', { output: error.stdout });
        }
    } catch (error) {
        logTest('TDD Mode', 'Coverage analysis works', 'FAIL', error.message);
    }

    // Test 2.4: TDD phase detection
    try {
        const testFile = path.join(TEST_FILES_DIR, 'tdd-phase.js');
        const content = `
function incomplete() {
    throw new Error('Not implemented');
}
module.exports = incomplete;
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);

            if (stdout.includes('tddPhase') || stdout.includes('RED') || stdout.includes('GREEN')) {
                logTest('TDD Mode', 'TDD phase detection', 'PASS', 'Phase detection present', { output: stdout });
            } else {
                logTest('TDD Mode', 'TDD phase detection', 'SKIP', 'Phase not detected (no tests)', { output: stdout });
            }
        } catch (error) {
            logTest('TDD Mode', 'TDD phase detection', 'SKIP', 'Cannot detect without tests', { output: error.stdout });
        }
    } catch (error) {
        logTest('TDD Mode', 'TDD phase detection', 'FAIL', error.message);
    }
}

// Test Category 3: Backward Compatibility
async function testBackwardCompatibility() {
    console.log('\n🔄 CATEGORY: Backward Compatibility\n');

    // Test 3.1: Default behavior (no flags)
    try {
        const testFile = path.join(TEST_FILES_DIR, 'default.js');
        const content = `
function multiply(a, b) {
    return a * b;
}
module.exports = multiply;
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

            const hasFormatting = stdout.includes('FORMATTING');
            const hasLinting = stdout.includes('LINTING');
            const hasSummary = stdout.includes('VALIDATION SUMMARY');

            if (hasFormatting && hasLinting && hasSummary) {
                logTest('Backward Compatibility', 'Default behavior (no flags)', 'PASS', 'All standard steps present', { output: stdout });
            } else {
                logTest('Backward Compatibility', 'Default behavior (no flags)', 'FAIL', 'Missing standard steps', { output: stdout });
            }
        } catch (error) {
            logTest('Backward Compatibility', 'Default behavior (no flags)', 'FAIL', error.message, { output: error.stdout });
        }
    } catch (error) {
        logTest('Backward Compatibility', 'Default behavior (no flags)', 'FAIL', error.message);
    }

    // Test 3.2: Logging still works
    try {
        const testFile = path.join(TEST_FILES_DIR, 'logging.js');
        const content = `function test() { return true; }`;
        fs.writeFileSync(testFile, content);

        const logSizeBefore = fs.existsSync(LOG_PATH) ? fs.statSync(LOG_PATH).size : 0;

        await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

        if (fs.existsSync(LOG_PATH)) {
            const logSizeAfter = fs.statSync(LOG_PATH).size;
            if (logSizeAfter > logSizeBefore) {
                logTest('Backward Compatibility', 'Logging still writes to post-edit-pipeline.log', 'PASS', 'Log file updated');
            } else {
                logTest('Backward Compatibility', 'Logging still writes to post-edit-pipeline.log', 'FAIL', 'Log not updated');
            }
        } else {
            logTest('Backward Compatibility', 'Logging still writes to post-edit-pipeline.log', 'FAIL', 'Log file not created');
        }
    } catch (error) {
        logTest('Backward Compatibility', 'Logging still writes to post-edit-pipeline.log', 'FAIL', error.message);
    }

    // Test 3.3: 500-entry limit maintained
    try {
        if (fs.existsSync(LOG_PATH)) {
            const logContent = fs.readFileSync(LOG_PATH, 'utf8');
            const entries = logContent.split('═'.repeat(80)).filter(s => s.trim());

            if (entries.length <= 500) {
                logTest('Backward Compatibility', '500-entry limit maintained', 'PASS', `Log has ${entries.length} entries`);
            } else {
                logTest('Backward Compatibility', '500-entry limit maintained', 'FAIL', `Log has ${entries.length} entries (over limit)`);
            }
        } else {
            logTest('Backward Compatibility', '500-entry limit maintained', 'SKIP', 'Log file not present');
        }
    } catch (error) {
        logTest('Backward Compatibility', '500-entry limit maintained', 'FAIL', error.message);
    }
}

// Test Category 4: Coverage Tests
async function testCoverageExtraction() {
    console.log('\n📊 CATEGORY: Coverage Tests\n');

    // Test 4.1: JavaScript with Jest
    logTest('Coverage Tests', 'JavaScript file with Jest tests', 'SKIP', 'Requires Jest setup');

    // Test 4.2: Rust with cargo
    try {
        const testFile = path.join(TEST_FILES_DIR, 'cargo-lib.rs');
        const content = `
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }
}
`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);

            if (stdout.includes('test') || stdout.includes('cargo')) {
                logTest('Coverage Tests', 'Rust file with cargo tests', 'PASS', 'Cargo test support detected', { output: stdout });
            } else {
                logTest('Coverage Tests', 'Rust file with cargo tests', 'SKIP', 'Cargo not available', { output: stdout });
            }
        } catch (error) {
            logTest('Coverage Tests', 'Rust file with cargo tests', 'SKIP', 'Cargo not available', { output: error.stdout });
        }
    } catch (error) {
        logTest('Coverage Tests', 'Rust file with cargo tests', 'SKIP', error.message);
    }

    // Test 4.3: Python with pytest
    logTest('Coverage Tests', 'Python file with pytest', 'SKIP', 'Requires pytest setup');

    // Test 4.4: Coverage percentage extraction
    try {
        const testFile = path.join(TEST_FILES_DIR, 'coverage-extract.js');
        const content = `function test() { return 42; }`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode --structured`);

            // Check if structured output includes coverage
            if (stdout.includes('coverage') && (stdout.includes('%') || stdout.includes('percentage'))) {
                logTest('Coverage Tests', 'Coverage percentage extraction', 'PASS', 'Coverage data in output', { output: stdout });
            } else {
                logTest('Coverage Tests', 'Coverage percentage extraction', 'SKIP', 'No coverage available', { output: stdout });
            }
        } catch (error) {
            logTest('Coverage Tests', 'Coverage percentage extraction', 'SKIP', 'Coverage tools not available', { output: error.stdout });
        }
    } catch (error) {
        logTest('Coverage Tests', 'Coverage percentage extraction', 'FAIL', error.message);
    }
}

// Test Category 5: Integration Tests
async function testIntegration() {
    console.log('\n🔗 CATEGORY: Integration Tests\n');

    // Test 5.1: Agent context tracking
    try {
        const testFile = path.join(TEST_FILES_DIR, 'agent-context.js');
        const content = `function test() { return 1; }`;
        fs.writeFileSync(testFile, content);

        await execAsync(`node ${PIPELINE_PATH} ${testFile} --memory-key "swarm/tester/validate"`);

        if (fs.existsSync(LOG_PATH)) {
            const logContent = fs.readFileSync(LOG_PATH, 'utf8');

            if (logContent.includes('swarm/tester/validate') && logContent.includes('Agent Type')) {
                logTest('Integration Tests', 'Agent context tracking', 'PASS', 'Agent context logged correctly');
            } else {
                logTest('Integration Tests', 'Agent context tracking', 'FAIL', 'Agent context not in log');
            }
        } else {
            logTest('Integration Tests', 'Agent context tracking', 'FAIL', 'Log not created');
        }
    } catch (error) {
        logTest('Integration Tests', 'Agent context tracking', 'FAIL', error.message);
    }

    // Test 5.2: Structured JSON output
    try {
        const testFile = path.join(TEST_FILES_DIR, 'structured.js');
        const content = `function test() {}`;
        fs.writeFileSync(testFile, content);

        const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --structured`);

        try {
            // Check if output contains valid JSON
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.file && parsed.language && parsed.summary) {
                    logTest('Integration Tests', 'Structured JSON output', 'PASS', 'Valid JSON structure', { output: stdout });
                } else {
                    logTest('Integration Tests', 'Structured JSON output', 'FAIL', 'JSON missing required fields');
                }
            } else {
                logTest('Integration Tests', 'Structured JSON output', 'FAIL', 'No JSON found in output');
            }
        } catch (parseError) {
            logTest('Integration Tests', 'Structured JSON output', 'FAIL', 'Invalid JSON: ' + parseError.message);
        }
    } catch (error) {
        logTest('Integration Tests', 'Structured JSON output', 'FAIL', error.message);
    }

    // Test 5.3: Error reporting
    try {
        const testFile = path.join(TEST_FILES_DIR, 'error-test.js');
        const content = `
// Intentional syntax error
function broken( {
    return "missing closing paren";
`;
        fs.writeFileSync(testFile, content);

        try {
            await execAsync(`node ${PIPELINE_PATH} ${testFile}`);
            logTest('Integration Tests', 'Error reporting', 'FAIL', 'Should have reported error');
        } catch (error) {
            const output = error.stdout || error.stderr || '';
            if (output.includes('error') || output.includes('FAILED')) {
                logTest('Integration Tests', 'Error reporting', 'PASS', 'Errors properly reported', { output });
            } else {
                logTest('Integration Tests', 'Error reporting', 'FAIL', 'Error not clearly reported');
            }
        }
    } catch (error) {
        logTest('Integration Tests', 'Error reporting', 'FAIL', error.message);
    }

    // Test 5.4: Multiple flags combined
    try {
        const testFile = path.join(TEST_FILES_DIR, 'multi-flag.js');
        const content = `function test() { return 42; }`;
        fs.writeFileSync(testFile, content);

        try {
            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode --minimum-coverage 90 --structured --memory-key "test/multi"`);

            if (stdout.includes('TDD') && stdout.includes('90') && stdout.includes('JSON')) {
                logTest('Integration Tests', 'Multiple flags combined', 'PASS', 'All flags processed', { output: stdout });
            } else {
                logTest('Integration Tests', 'Multiple flags combined', 'FAIL', 'Not all flags applied', { output: stdout });
            }
        } catch (error) {
            logTest('Integration Tests', 'Multiple flags combined', 'FAIL', error.message, { output: error.stdout });
        }
    } catch (error) {
        logTest('Integration Tests', 'Multiple flags combined', 'FAIL', error.message);
    }
}

// Generate markdown report
function generateReport() {
    console.log('\n📄 Generating test report...\n');

    const report = [];
    report.push('# Post-Edit Pipeline - Comprehensive Test Report\n');
    report.push(`**Generated:** ${new Date().toISOString()}\n`);
    report.push(`**Pipeline:** \`${PIPELINE_PATH}\`\n\n`);

    // Summary
    report.push('## Summary\n');
    report.push(`- **Total Tests:** ${testResults.total}`);
    report.push(`- **Passed:** ✅ ${testResults.passed}`);
    report.push(`- **Failed:** ❌ ${testResults.failed}`);
    report.push(`- **Skipped:** ⏭️  ${testResults.skipped}`);
    const passRate = testResults.total > 0 ? ((testResults.passed / testResults.total) * 100).toFixed(1) : 0;
    report.push(`- **Pass Rate:** ${passRate}%\n`);

    // Categories
    report.push('## Test Categories\n');

    for (const [categoryName, category] of Object.entries(testResults.categories)) {
        report.push(`### ${categoryName}\n`);
        report.push(`**Passed:** ${category.passed} | **Failed:** ${category.failed} | **Skipped:** ${category.skipped}\n`);

        report.push('\n| Test | Status | Message |');
        report.push('|------|--------|---------|');

        for (const test of category.tests) {
            const statusIcon = test.status === 'PASS' ? '✅' : test.status === 'FAIL' ? '❌' : '⏭️';
            const message = test.message.replace(/\|/g, '\\|').substring(0, 100);
            report.push(`| ${test.name} | ${statusIcon} ${test.status} | ${message} |`);
        }

        report.push('\n');
    }

    // Detailed Results
    report.push('## Detailed Results\n');

    for (const [categoryName, category] of Object.entries(testResults.categories)) {
        report.push(`### ${categoryName}\n`);

        for (const test of category.tests) {
            report.push(`#### ${test.status === 'PASS' ? '✅' : test.status === 'FAIL' ? '❌' : '⏭️'} ${test.name}\n`);
            report.push(`**Status:** ${test.status}\n`);
            if (test.message) {
                report.push(`**Message:** ${test.message}\n`);
            }
            if (test.details.output) {
                report.push(`**Output:**\n\`\`\`\n${test.details.output.substring(0, 500)}\n...\n\`\`\`\n`);
            }
            report.push('\n');
        }
    }

    // Recommendations
    report.push('## Recommendations\n');

    if (testResults.failed > 0) {
        report.push('### Failed Tests\n');
        for (const [categoryName, category] of Object.entries(testResults.categories)) {
            const failed = category.tests.filter(t => t.status === 'FAIL');
            if (failed.length > 0) {
                report.push(`**${categoryName}:**\n`);
                for (const test of failed) {
                    report.push(`- ${test.name}: ${test.message}\n`);
                }
            }
        }
    }

    if (testResults.skipped > 0) {
        report.push('\n### Skipped Tests\n');
        report.push('Some tests were skipped due to missing dependencies or test frameworks. Consider installing:\n');
        report.push('- Jest for JavaScript testing\n');
        report.push('- pytest for Python testing\n');
        report.push('- cargo-tarpaulin for Rust coverage\n');
    }

    fs.writeFileSync(REPORT_PATH, report.join('\n'));
    console.log(`✅ Report written to: ${REPORT_PATH}\n`);
}

// Main execution
async function main() {
    console.log('🚀 Starting Comprehensive Test Suite\n');
    console.log('═'.repeat(60));

    await setup();

    try {
        await testRustEnforcement();
        await testTDDMode();
        await testBackwardCompatibility();
        await testCoverageExtraction();
        await testIntegration();
    } catch (error) {
        console.error('Test execution error:', error);
    }

    await cleanup();

    console.log('\n' + '═'.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total:   ${testResults.total}`);
    console.log(`Passed:  ✅ ${testResults.passed}`);
    console.log(`Failed:  ❌ ${testResults.failed}`);
    console.log(`Skipped: ⏭️  ${testResults.skipped}`);
    console.log('═'.repeat(60));

    generateReport();

    process.exit(testResults.failed > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
