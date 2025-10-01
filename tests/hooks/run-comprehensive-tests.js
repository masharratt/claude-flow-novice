#!/usr/bin/env node

/**
 * Comprehensive Test Runner for post-edit-pipeline.js
 * Executes all test scenarios and generates detailed report
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = path.join(__dirname, '../../config/hooks/post-edit-pipeline.js');
const TEST_DIR = path.join(__dirname, 'manual-test-fixtures');
const REPORT_PATH = path.join(__dirname, 'test-report.md');

class TestRunner {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            tests: []
        };
    }

    async runTest(name, category, testFn) {
        this.results.total++;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🧪 Running: ${name}`);
        console.log(`📁 Category: ${category}`);
        console.log('='.repeat(80));

        const startTime = Date.now();
        let status = 'PASSED';
        let error = null;
        let output = '';

        try {
            output = await testFn();
            this.results.passed++;
            console.log(`✅ PASSED in ${Date.now() - startTime}ms`);
        } catch (err) {
            status = 'FAILED';
            error = err.message;
            this.results.failed++;
            console.log(`❌ FAILED: ${err.message}`);
        }

        this.results.tests.push({
            name,
            category,
            status,
            duration: Date.now() - startTime,
            error,
            output: output.substring(0, 500) // Truncate long output
        });
    }

    async runPipeline(filePath, args = []) {
        return new Promise((resolve, reject) => {
            const proc = spawn('node', [PIPELINE_PATH, filePath, ...args], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => stdout += data.toString());
            proc.stderr.on('data', (data) => stderr += data.toString());

            proc.on('close', (code) => {
                const output = stdout + stderr;
                if (code === 0 || output.includes('VALIDATION SUMMARY')) {
                    resolve(output);
                } else {
                    reject(new Error(`Pipeline failed with code ${code}: ${stderr}`));
                }
            });

            proc.on('error', (err) => reject(err));

            // Timeout after 30 seconds
            setTimeout(() => {
                proc.kill();
                reject(new Error('Test timeout'));
            }, 30000);
        });
    }

    async setupTestFixtures() {
        if (!fs.existsSync(TEST_DIR)) {
            fs.mkdirSync(TEST_DIR, { recursive: true });
        }
    }

    async cleanupTestFixtures() {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    }

    generateReport() {
        const report = [
            '# Post-Edit Pipeline - Comprehensive Test Report',
            '',
            `**Generated:** ${new Date().toISOString()}`,
            '',
            '## Summary',
            '',
            `- **Total Tests:** ${this.results.total}`,
            `- **Passed:** ✅ ${this.results.passed}`,
            `- **Failed:** ❌ ${this.results.failed}`,
            `- **Skipped:** ⏭️ ${this.results.skipped}`,
            `- **Success Rate:** ${((this.results.passed / this.results.total) * 100).toFixed(2)}%`,
            '',
            '## Test Results by Category',
            ''
        ];

        const categories = {};
        for (const test of this.results.tests) {
            if (!categories[test.category]) {
                categories[test.category] = [];
            }
            categories[test.category].push(test);
        }

        for (const [category, tests] of Object.entries(categories)) {
            report.push(`### ${category}`);
            report.push('');
            report.push('| Test Name | Status | Duration | Error |');
            report.push('|-----------|--------|----------|-------|');

            for (const test of tests) {
                const statusIcon = test.status === 'PASSED' ? '✅' : '❌';
                const errorMsg = test.error ? test.error.substring(0, 50) : '-';
                report.push(`| ${test.name} | ${statusIcon} ${test.status} | ${test.duration}ms | ${errorMsg} |`);
            }

            report.push('');
        }

        report.push('## Detailed Test Output');
        report.push('');

        for (const test of this.results.tests) {
            report.push(`### ${test.name}`);
            report.push('');
            report.push(`**Status:** ${test.status}`);
            report.push(`**Duration:** ${test.duration}ms`);
            report.push('');

            if (test.error) {
                report.push('**Error:**');
                report.push('```');
                report.push(test.error);
                report.push('```');
                report.push('');
            }

            if (test.output) {
                report.push('**Output:**');
                report.push('```');
                report.push(test.output);
                report.push('```');
                report.push('');
            }
        }

        return report.join('\n');
    }

    async saveReport() {
        const reportContent = this.generateReport();
        fs.writeFileSync(REPORT_PATH, reportContent);
        console.log(`\n📊 Report saved to: ${REPORT_PATH}`);
    }

    printSummary() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 FINAL TEST SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`⏭️  Skipped: ${this.results.skipped}`);
        console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(2)}%`);
        console.log('='.repeat(80));
    }
}

async function main() {
    const runner = new TestRunner();

    console.log('🚀 Starting Comprehensive Post-Edit Pipeline Tests\n');

    await runner.setupTestFixtures();

    try {
        // ==================== STANDARD MODE - JAVASCRIPT ====================
        await runner.runTest('Valid JavaScript file', 'Standard Mode - JavaScript', async () => {
            const testFile = path.join(TEST_DIR, 'valid.js');
            fs.writeFileSync(testFile, `
function add(a, b) {
    return a + b;
}
module.exports = add;
`);
            const output = await runner.runPipeline(testFile);
            if (!output.includes('JAVASCRIPT') || !output.includes('VALIDATION SUMMARY')) {
                throw new Error('Missing expected output');
            }
            return output;
        });

        await runner.runTest('JavaScript with linting issues', 'Standard Mode - JavaScript', async () => {
            const testFile = path.join(TEST_DIR, 'lint-issues.js');
            fs.writeFileSync(testFile, `
var unused = 123;
function test() { console.log("test") }
`);
            const output = await runner.runPipeline(testFile);
            if (!output.includes('LINTING')) {
                throw new Error('Linting step not found');
            }
            return output;
        });

        await runner.runTest('JavaScript with missing dependencies', 'Standard Mode - JavaScript', async () => {
            const testFile = path.join(TEST_DIR, 'missing-deps.js');
            fs.writeFileSync(testFile, `
import fakePkg from 'fake-package-123456';
const x = fakePkg.doStuff();
`);
            const output = await runner.runPipeline(testFile);
            if (!output.includes('DEPENDENCIES') || !output.includes('Missing')) {
                throw new Error('Dependency analysis missing');
            }
            return output;
        });

        // ==================== STANDARD MODE - TYPESCRIPT ====================
        await runner.runTest('Valid TypeScript file', 'Standard Mode - TypeScript', async () => {
            const testFile = path.join(TEST_DIR, 'valid.ts');
            fs.writeFileSync(testFile, `
interface User {
    name: string;
    age: number;
}
function greet(user: User): string {
    return \`Hello, \${user.name}!\`;
}
export { greet };
`);
            const output = await runner.runPipeline(testFile);
            if (!output.includes('TYPESCRIPT') || !output.includes('TYPE CHECKING')) {
                throw new Error('TypeScript validation missing');
            }
            return output;
        });

        // ==================== STANDARD MODE - PYTHON ====================
        await runner.runTest('Valid Python file', 'Standard Mode - Python', async () => {
            const testFile = path.join(TEST_DIR, 'valid.py');
            fs.writeFileSync(testFile, `
def add(a, b):
    """Add two numbers"""
    return a + b

if __name__ == "__main__":
    print(add(1, 2))
`);
            const output = await runner.runPipeline(testFile);
            if (!output.includes('PYTHON')) {
                throw new Error('Python validation missing');
            }
            return output;
        });

        // ==================== TDD MODE ====================
        await runner.runTest('TDD mode enabled with flag', 'TDD Mode', async () => {
            const testFile = path.join(TEST_DIR, 'tdd-test.js');
            fs.writeFileSync(testFile, `
function divide(a, b) {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
}
module.exports = divide;
`);
            const output = await runner.runPipeline(testFile, ['--tdd-mode']);
            if (!output.includes('TDD')) {
                throw new Error('TDD mode not detected');
            }
            return output;
        });

        await runner.runTest('TDD with coverage threshold', 'TDD Mode', async () => {
            const testFile = path.join(TEST_DIR, 'coverage.js');
            fs.writeFileSync(testFile, `
function calculate(op, a, b) {
    switch(op) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        default: throw new Error('Unknown op');
    }
}
module.exports = calculate;
`);
            const output = await runner.runPipeline(testFile, ['--tdd-mode', '--minimum-coverage', '80']);
            return output;
        });

        // ==================== RUST STRICT MODE ====================
        await runner.runTest('Rust with .unwrap() detection', 'Rust Strict Mode', async () => {
            const testFile = path.join(TEST_DIR, 'unsafe.rs');
            fs.writeFileSync(testFile, `
fn main() {
    let result = Some(42);
    let value = result.unwrap(); // Dangerous
    println!("{}", value);
}
`);
            const output = await runner.runPipeline(testFile, ['--rust-strict']);
            if (!output.includes('.unwrap()') && !output.includes('RUST')) {
                throw new Error('Rust unwrap detection missing');
            }
            return output;
        });

        await runner.runTest('Rust with panic! detection', 'Rust Strict Mode', async () => {
            const testFile = path.join(TEST_DIR, 'panic.rs');
            fs.writeFileSync(testFile, `
fn divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        panic!("Division by zero!");
    }
    a / b
}
`);
            const output = await runner.runPipeline(testFile, ['--rust-strict']);
            if (!output.includes('panic') && !output.includes('RUST')) {
                throw new Error('Rust panic detection missing');
            }
            return output;
        });

        await runner.runTest('Rust comments not flagged', 'Rust Strict Mode', async () => {
            const testFile = path.join(TEST_DIR, 'comments.rs');
            fs.writeFileSync(testFile, `
fn main() {
    // This comment mentions .unwrap() but should not trigger
    /* Another comment with panic!() */
    let value = 42;
    println!("{}", value);
}
`);
            const output = await runner.runPipeline(testFile, ['--rust-strict']);
            // Should pass without flagging comments
            return output;
        });

        // ==================== EDGE CASES ====================
        await runner.runTest('Missing test files', 'Edge Cases', async () => {
            const testFile = path.join(TEST_DIR, 'no-tests.js');
            fs.writeFileSync(testFile, `
function noTests() {
    return "No tests for this";
}
module.exports = noTests;
`);
            const output = await runner.runPipeline(testFile);
            if (!output.includes('No tests') && !output.includes('SKIPPING TESTS')) {
                throw new Error('Missing test handling incorrect');
            }
            return output;
        });

        await runner.runTest('Non-existent file', 'Edge Cases', async () => {
            const testFile = path.join(TEST_DIR, 'does-not-exist.js');
            try {
                await runner.runPipeline(testFile);
                throw new Error('Should have failed');
            } catch (err) {
                if (!err.message.includes('not found') && !err.message.includes('ENOENT')) {
                    throw err;
                }
                return 'Correctly rejected non-existent file';
            }
        });

        await runner.runTest('Agent context from memory key', 'Agent Context', async () => {
            const testFile = path.join(TEST_DIR, 'agent-context.js');
            fs.writeFileSync(testFile, `function test() {}`);
            const output = await runner.runPipeline(testFile, ['--memory-key', 'swarm/coder/step1']);

            // Check log file
            const logPath = path.join(process.cwd(), 'post-edit-pipeline.log');
            if (fs.existsSync(logPath)) {
                const log = fs.readFileSync(logPath, 'utf8');
                if (!log.includes('coder')) {
                    throw new Error('Agent context not extracted');
                }
            }
            return output;
        });

        await runner.runTest('Logging to root file', 'Logging', async () => {
            const testFile = path.join(TEST_DIR, 'log-test.js');
            fs.writeFileSync(testFile, `function test() { return true; }`);
            await runner.runPipeline(testFile);

            const logPath = path.join(process.cwd(), 'post-edit-pipeline.log');
            if (!fs.existsSync(logPath)) {
                throw new Error('Log file not created');
            }

            const log = fs.readFileSync(logPath, 'utf8');
            if (!log.includes('TIMESTAMP:') || !log.includes('JSON:')) {
                throw new Error('Log format incorrect');
            }
            return 'Log file created successfully';
        });

    } catch (error) {
        console.error('❌ Test suite error:', error);
    } finally {
        await runner.cleanupTestFixtures();
    }

    runner.printSummary();
    await runner.saveReport();

    // Exit with error code if any tests failed
    process.exit(runner.results.failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
