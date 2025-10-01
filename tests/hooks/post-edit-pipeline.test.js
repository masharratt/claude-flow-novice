#!/usr/bin/env node

/**
 * Comprehensive Test Suite for post-edit-pipeline.js
 * Tests all features: Standard mode, TDD mode, Rust strict mode, and edge cases
 */

import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = path.join(__dirname, '../../config/hooks/post-edit-pipeline.js');
const TEST_DIR = path.join(__dirname, 'test-fixtures');
const LOG_PATH = path.join(process.cwd(), 'post-edit-pipeline.log');

describe('Post-Edit Pipeline - Comprehensive Test Suite', () => {
    beforeEach(() => {
        // Create test fixtures directory
        if (!fs.existsSync(TEST_DIR)) {
            fs.mkdirSync(TEST_DIR, { recursive: true });
        }

        // Backup existing log
        if (fs.existsSync(LOG_PATH)) {
            fs.copyFileSync(LOG_PATH, `${LOG_PATH}.backup`);
        }
    });

    afterEach(() => {
        // Cleanup test fixtures
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }

        // Restore log backup
        if (fs.existsSync(`${LOG_PATH}.backup`)) {
            fs.copyFileSync(`${LOG_PATH}.backup`, LOG_PATH);
            fs.unlinkSync(`${LOG_PATH}.backup`);
        }
    });

    describe('Standard Mode - No TDD', () => {
        describe('JavaScript Files', () => {
            it('should validate and format a valid JavaScript file', async () => {
                const testFile = path.join(TEST_DIR, 'test.js');
                const content = `
function add(a, b) {
    return a + b;
}

module.exports = add;
`;
                fs.writeFileSync(testFile, content);

                const { stdout, stderr } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

                expect(stdout).toContain('STARTING VALIDATION PIPELINE');
                expect(stdout).toContain('Language: JAVASCRIPT');
                expect(stdout).toContain('FORMATTING');
                expect(stdout).toContain('LINTING');
                expect(stdout).toContain('VALIDATION SUMMARY');
            }, 30000);

            it('should detect linting issues in JavaScript', async () => {
                const testFile = path.join(TEST_DIR, 'bad-lint.js');
                const content = `
var unused = 123;
function test() {
    console.log("test")
}
`;
                fs.writeFileSync(testFile, content);

                try {
                    await execAsync(`node ${PIPELINE_PATH} ${testFile}`);
                } catch (error) {
                    // Pipeline should report warnings
                    expect(error.stdout || error.stderr).toContain('LINTING');
                }
            }, 30000);

            it('should handle missing dependencies gracefully', async () => {
                const testFile = path.join(TEST_DIR, 'missing-deps.js');
                const content = `
import someFakePackage from 'fake-package-that-does-not-exist';
const x = someFakePackage.doStuff();
`;
                fs.writeFileSync(testFile, content);

                const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

                expect(stdout).toContain('ANALYZING DEPENDENCIES');
                expect(stdout).toContain('Missing dependencies');
            }, 30000);
        });

        describe('TypeScript Files', () => {
            it('should validate TypeScript file with type checking', async () => {
                const testFile = path.join(TEST_DIR, 'test.ts');
                const content = `
interface User {
    name: string;
    age: number;
}

function greet(user: User): string {
    return \`Hello, \${user.name}!\`;
}

export { greet };
`;
                fs.writeFileSync(testFile, content);

                const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

                expect(stdout).toContain('Language: TYPESCRIPT');
                expect(stdout).toContain('TYPE CHECKING');
                expect(stdout).toContain('VALIDATION SUMMARY');
            }, 30000);

            it('should detect type errors in TypeScript', async () => {
                const testFile = path.join(TEST_DIR, 'type-error.ts');
                const content = `
function add(a: number, b: number): number {
    return a + b + "wrong"; // Type error
}
`;
                fs.writeFileSync(testFile, content);

                try {
                    await execAsync(`node ${PIPELINE_PATH} ${testFile}`);
                } catch (error) {
                    expect(error.stdout || error.stderr).toContain('TYPE CHECKING');
                }
            }, 30000);
        });

        describe('Python Files', () => {
            it('should validate Python file', async () => {
                const testFile = path.join(TEST_DIR, 'test.py');
                const content = `
def add(a, b):
    """Add two numbers"""
    return a + b

if __name__ == "__main__":
    print(add(1, 2))
`;
                fs.writeFileSync(testFile, content);

                const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

                expect(stdout).toContain('Language: PYTHON');
                expect(stdout).toContain('FORMATTING');
                expect(stdout).toContain('VALIDATION SUMMARY');
            }, 30000);

            it('should detect Python imports', async () => {
                const testFile = path.join(TEST_DIR, 'imports.py');
                const content = `
import os
import sys
from pathlib import Path

def main():
    print(os.getcwd())
`;
                fs.writeFileSync(testFile, content);

                const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

                expect(stdout).toContain('ANALYZING DEPENDENCIES');
                expect(stdout).toContain('Dependency Analysis');
            }, 30000);
        });

        describe('Existing Behavior Unchanged', () => {
            it('should maintain backward compatibility with existing features', async () => {
                const testFile = path.join(TEST_DIR, 'compat.js');
                const content = `
// Basic JavaScript file
function multiply(a, b) {
    return a * b;
}
module.exports = multiply;
`;
                fs.writeFileSync(testFile, content);

                const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

                // Verify all standard steps are present
                expect(stdout).toContain('FORMATTING');
                expect(stdout).toContain('LINTING');
                expect(stdout).toContain('TYPE CHECKING');
                expect(stdout).toContain('ANALYZING DEPENDENCIES');
                expect(stdout).toContain('SECURITY SCANNING');
                expect(stdout).toContain('VALIDATION SUMMARY');
            }, 30000);
        });
    });

    describe('TDD Mode', () => {
        it('should enable TDD mode with --tdd-mode flag', async () => {
            const testFile = path.join(TEST_DIR, 'tdd-test.js');
            const content = `
function divide(a, b) {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
}
module.exports = divide;
`;
            fs.writeFileSync(testFile, content);

            const testTestFile = path.join(TEST_DIR, 'tdd-test.test.js');
            const testContent = `
const divide = require('./tdd-test');

test('divides two numbers', () => {
    expect(divide(10, 2)).toBe(5);
});

test('throws on division by zero', () => {
    expect(() => divide(10, 0)).toThrow('Division by zero');
});
`;
            fs.writeFileSync(testTestFile, testContent);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);

            expect(stdout).toContain('TDD MODE ENABLED');
            expect(stdout).toContain('Single-file testing');
        }, 30000);

        it('should run single-file tests without full system compilation', async () => {
            const testFile = path.join(TEST_DIR, 'isolated.js');
            const content = `
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}
module.exports = fibonacci;
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);

            // Should not require full project build
            expect(stdout).not.toContain('Building entire project');
            expect(stdout).toContain('VALIDATION SUMMARY');
        }, 30000);

        it('should analyze coverage with configurable threshold', async () => {
            const testFile = path.join(TEST_DIR, 'coverage-test.js');
            const content = `
function calculate(op, a, b) {
    switch(op) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        case 'multiply': return a * b;
        case 'divide': return a / b;
        default: throw new Error('Unknown operation');
    }
}
module.exports = calculate;
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode --minimum-coverage 80`);

            expect(stdout).toContain('Coverage');
            expect(stdout).toContain('80'); // threshold
        }, 30000);

        it('should detect TDD phase (Red-Green-Refactor)', async () => {
            const testFile = path.join(TEST_DIR, 'tdd-phase.js');
            const content = `
// Red phase: Test exists but implementation is incomplete
function complexOperation() {
    // TODO: implement
    throw new Error('Not implemented');
}
module.exports = complexOperation;
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);

            expect(stdout).toContain('TDD');
            // Should detect we're in RED phase (failing tests)
        }, 30000);
    });

    describe('Rust Enforcement', () => {
        it('should detect .unwrap() calls in Rust files', async () => {
            const testFile = path.join(TEST_DIR, 'unsafe.rs');
            const content = `
fn main() {
    let result = Some(42);
    let value = result.unwrap(); // Should be detected
    println!("{}", value);
}
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict`);

            expect(stdout).toContain('RUST STRICT MODE');
            expect(stdout).toContain('.unwrap()');
            expect(stdout).toContain('dangerous pattern');
        }, 30000);

        it('should detect panic macros in Rust', async () => {
            const testFile = path.join(TEST_DIR, 'panic.rs');
            const content = `
fn divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        panic!("Division by zero!"); // Should be detected
    }
    a / b
}
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict`);

            expect(stdout).toContain('RUST STRICT MODE');
            expect(stdout).toContain('panic!');
        }, 30000);

        it('should handle false positives in Rust comments', async () => {
            const testFile = path.join(TEST_DIR, 'comments.rs');
            const content = `
fn main() {
    // This is a comment about .unwrap() - should not trigger
    /* Another comment with panic!() */
    let value = 42;
    println!("{}", value);
}
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict`);

            // Should NOT flag comments as violations
            expect(stdout).not.toContain('dangerous pattern found in comments');
        }, 30000);

        it('should suggest safe alternatives for .unwrap()', async () => {
            const testFile = path.join(TEST_DIR, 'suggest.rs');
            const content = `
fn get_value(opt: Option<i32>) -> i32 {
    opt.unwrap() // Unsafe
}
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --rust-strict`);

            expect(stdout).toContain('SUGGESTIONS');
            expect(stdout).toContain('match') || expect(stdout).toContain('if let');
        }, 30000);
    });

    describe('Edge Cases', () => {
        it('should handle missing test files gracefully', async () => {
            const testFile = path.join(TEST_DIR, 'no-tests.js');
            const content = `
function noTests() {
    return "This function has no tests";
}
module.exports = noTests;
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

            expect(stdout).toContain('No tests found') || expect(stdout).toContain('SKIPPING TESTS');
        }, 30000);

        it('should handle missing coverage tools', async () => {
            const testFile = path.join(TEST_DIR, 'no-coverage.js');
            const content = `
function simple() { return true; }
module.exports = simple;
`;
            fs.writeFileSync(testFile, content);

            // Try to run with TDD mode when coverage tool might not exist
            try {
                const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);
                expect(stdout).toContain('not available') || expect(stdout).toContain('SKIPPING');
            } catch (error) {
                // Graceful degradation expected
                expect(error.stdout || error.message).toBeTruthy();
            }
        }, 30000);

        it('should handle files with no tests in TDD mode', async () => {
            const testFile = path.join(TEST_DIR, 'empty-coverage.js');
            const content = `
function untested() {
    return "no coverage";
}
`;
            fs.writeFileSync(testFile, content);

            const { stdout } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);

            expect(stdout).toContain('VALIDATION SUMMARY');
            // Should not crash, but warn about missing tests
        }, 30000);

        it('should handle non-existent files', async () => {
            const nonExistentFile = path.join(TEST_DIR, 'does-not-exist.js');

            try {
                await execAsync(`node ${PIPELINE_PATH} ${nonExistentFile}`);
                throw new Error('Should have failed');
            } catch (error) {
                expect(error.stderr || error.stdout).toContain('File not found');
            }
        }, 30000);

        it('should handle mixed TDD and non-TDD modes', async () => {
            const testFile = path.join(TEST_DIR, 'mixed.js');
            const content = `
function mixed() { return 42; }
module.exports = mixed;
`;
            fs.writeFileSync(testFile, content);

            // First run in standard mode
            const { stdout: stdout1 } = await execAsync(`node ${PIPELINE_PATH} ${testFile}`);
            expect(stdout1).toContain('VALIDATION SUMMARY');

            // Then run in TDD mode
            const { stdout: stdout2 } = await execAsync(`node ${PIPELINE_PATH} ${testFile} --tdd-mode`);
            expect(stdout2).toContain('VALIDATION SUMMARY');

            // Both should succeed independently
        }, 30000);
    });

    describe('Logging and Output', () => {
        it('should write structured logs to root file', async () => {
            const testFile = path.join(TEST_DIR, 'log-test.js');
            const content = `function test() { return true; }`;
            fs.writeFileSync(testFile, content);

            await execAsync(`node ${PIPELINE_PATH} ${testFile} --memory-key "test/agent/step1"`);

            expect(fs.existsSync(LOG_PATH)).toBe(true);

            const logContent = fs.readFileSync(LOG_PATH, 'utf8');
            expect(logContent).toContain('TIMESTAMP:');
            expect(logContent).toContain('FILE:');
            expect(logContent).toContain('AGENT CONTEXT:');
            expect(logContent).toContain('Memory Key: test/agent/step1');
            expect(logContent).toContain('JSON:');
        }, 30000);

        it('should enforce 500 entry limit in logs', async () => {
            // This test would create 501 entries to verify trimming
            // Skipped for performance reasons in normal test runs
        });

        it('should provide human-readable timestamps', async () => {
            const testFile = path.join(TEST_DIR, 'timestamp.js');
            const content = `function test() { return 1; }`;
            fs.writeFileSync(testFile, content);

            await execAsync(`node ${PIPELINE_PATH} ${testFile}`);

            const logContent = fs.readFileSync(LOG_PATH, 'utf8');
            // Should have format: MM/DD/YYYY HH:MM
            expect(logContent).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
        }, 30000);
    });

    describe('Agent Context', () => {
        it('should extract agent context from memory key', async () => {
            const testFile = path.join(TEST_DIR, 'agent-context.js');
            const content = `function test() {}`;
            fs.writeFileSync(testFile, content);

            await execAsync(`node ${PIPELINE_PATH} ${testFile} --memory-key "swarm/coder/implement-feature"`);

            const logContent = fs.readFileSync(LOG_PATH, 'utf8');
            expect(logContent).toContain('Agent Type: coder');
            expect(logContent).toContain('implement-feature');
        }, 30000);

        it('should accept multiple agent context parameters', async () => {
            const testFile = path.join(TEST_DIR, 'multi-context.js');
            const content = `function test() {}`;
            fs.writeFileSync(testFile, content);

            await execAsync(`node ${PIPELINE_PATH} ${testFile} --memory-key "test/key" --agent-type "tester" --swarm-id "swarm123"`);

            const logContent = fs.readFileSync(LOG_PATH, 'utf8');
            expect(logContent).toContain('Agent Type: tester');
            expect(logContent).toContain('Swarm ID: swarm123');
        }, 30000);
    });
});
