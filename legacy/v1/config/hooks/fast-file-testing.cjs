#!/usr/bin/env node

/**
 * Fast File-Specific Testing Hook
 * Provides rapid feedback (< 5 seconds) for individual file changes
 * Optimized for Rust, TypeScript, JavaScript, and Python
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

class FastFileTester {
    constructor() {
        this.config = this.loadConfig();
        this.testCache = new Map();
        this.timeoutMs = 5000; // 5 second timeout for fast feedback
    }

    loadConfig() {
        return {
            // Language-specific fast test commands
            fastTestCommands: {
                rust: {
                    syntax: ['rustc', '--error-format=json', '--emit=metadata', '--crate-type=lib'],
                    typecheck: ['cargo', 'check', '--message-format=json'],
                    test: ['cargo', 'test', '--message-format=json'],
                    clippy: ['cargo', 'clippy', '--message-format=json', '--', '-D', 'warnings']
                },
                typescript: {
                    syntax: ['tsc', '--noEmit', '--skipLibCheck'],
                    typecheck: ['tsc', '--noEmit', '--skipLibCheck'],
                    test: ['npx', 'jest', '--passWithNoTests', '--testPathPattern'],
                    lint: ['eslint', '--format=json']
                },
                javascript: {
                    syntax: ['node', '--check'],
                    test: ['npx', 'jest', '--passWithNoTests', '--testPathPattern'],
                    lint: ['eslint', '--format=json']
                },
                python: {
                    syntax: ['python', '-m', 'py_compile'],
                    typecheck: ['mypy', '--show-error-codes', '--json-report=/tmp/mypy-report'],
                    test: ['python', '-m', 'pytest', '-v', '--tb=short'],
                    lint: ['flake8', '--format=json']
                }
            },
            // File pattern matching for test discovery
            testPatterns: {
                rust: {
                    unit: ['#[test]', '#[cfg(test)]'],
                    integration: ['tests/*.rs', 'tests/**/*.rs']
                },
                typescript: {
                    unit: ['*.test.ts', '*.spec.ts'],
                    integration: ['__tests__/*.ts', 'tests/*.ts']
                },
                javascript: {
                    unit: ['*.test.js', '*.spec.js'],
                    integration: ['__tests__/*.js', 'tests/*.js']
                },
                python: {
                    unit: ['test_*.py', '*_test.py'],
                    integration: ['tests/test_*.py', 'tests/*_test.py']
                }
            }
        };
    }

    async testFile(filePath) {
        const startTime = Date.now();
        const language = this.detectLanguage(filePath);
        const fileHash = await this.getFileHash(filePath);

        console.log(`\n⚡ FAST TESTING: ${path.basename(filePath)} (${language.toUpperCase()})`);

        // Check cache first
        const cacheKey = `${filePath}:${fileHash}`;
        if (this.testCache.has(cacheKey)) {
            const cached = this.testCache.get(cacheKey);
            console.log(`📋 Using cached results (${Date.now() - cached.timestamp}ms ago)`);
            this.printResults(cached.results, Date.now() - startTime);
            return cached.results;
        }

        const results = {
            file: filePath,
            language,
            timestamp: Date.now(),
            tests: {},
            summary: {
                passed: 0,
                failed: 0,
                errors: [],
                warnings: [],
                totalTime: 0
            }
        };

        try {
            // Run tests in parallel for maximum speed
            const testPromises = [];

            // 1. Syntax check (fastest)
            testPromises.push(this.runSyntaxCheck(filePath, language, results));

            // 2. Type check (if applicable)
            if (['typescript', 'rust', 'python'].includes(language)) {
                testPromises.push(this.runTypeCheck(filePath, language, results));
            }

            // 3. File-specific unit tests only
            testPromises.push(this.runFileSpecificTests(filePath, language, results));

            // 4. Quick lint check
            testPromises.push(this.runQuickLint(filePath, language, results));

            // Wait for all tests with timeout
            await Promise.race([
                Promise.allSettled(testPromises),
                this.createTimeout()
            ]);

            // Update summary
            this.updateSummary(results);

            // Cache results
            this.testCache.set(cacheKey, {
                results,
                timestamp: Date.now()
            });

            // Clean old cache entries
            this.cleanCache();

        } catch (error) {
            results.summary.errors.push(`Test execution error: ${error.message}`);
            results.summary.failed++;
        }

        results.summary.totalTime = Date.now() - startTime;
        this.printResults(results, results.summary.totalTime);

        return results;
    }

    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const langMap = {
            '.rs': 'rust',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python'
        };
        return langMap[ext] || 'unknown';
    }

    async getFileHash(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
        } catch (error) {
            return 'unknown';
        }
    }

    async runSyntaxCheck(filePath, language, results) {
        const commands = this.config.fastTestCommands[language]?.syntax;
        if (!commands) return;

        try {
            const result = await this.executeCommand(commands, [filePath], { timeout: 2000 });
            results.tests.syntax = {
                passed: result.exitCode === 0,
                output: result.output,
                errors: result.exitCode !== 0 ? [result.stderr] : [],
                duration: result.duration
            };

            if (result.exitCode === 0) {
                results.summary.passed++;
            } else {
                results.summary.failed++;
                results.summary.errors.push(`Syntax errors in ${path.basename(filePath)}`);
            }
        } catch (error) {
            results.tests.syntax = {
                passed: false,
                errors: [error.message],
                duration: 0
            };
            results.summary.failed++;
        }
    }

    async runTypeCheck(filePath, language, results) {
        const commands = this.config.fastTestCommands[language]?.typecheck;
        if (!commands) return;

        try {
            let args = [];

            if (language === 'rust') {
                // For Rust, check just this file's module
                const projectRoot = this.findProjectRoot(filePath);
                args = ['--manifest-path', path.join(projectRoot, 'Cargo.toml')];
            } else if (language === 'typescript') {
                // For TypeScript, check just this file
                args = [filePath];
            } else if (language === 'python') {
                // For Python, check just this file
                args = [filePath];
            }

            const result = await this.executeCommand(commands, args, { timeout: 3000 });
            results.tests.typecheck = {
                passed: result.exitCode === 0,
                output: result.output,
                errors: result.exitCode !== 0 ? [result.stderr] : [],
                duration: result.duration
            };

            if (result.exitCode === 0) {
                results.summary.passed++;
            } else {
                results.summary.failed++;
                results.summary.errors.push(`Type errors in ${path.basename(filePath)}`);
            }
        } catch (error) {
            results.tests.typecheck = {
                passed: false,
                errors: [error.message],
                duration: 0
            };
            results.summary.failed++;
        }
    }

    async runFileSpecificTests(filePath, language, results) {
        try {
            if (language === 'rust') {
                await this.runRustFileTests(filePath, results);
            } else if (language === 'typescript' || language === 'javascript') {
                await this.runJSFileTests(filePath, results);
            } else if (language === 'python') {
                await this.runPythonFileTests(filePath, results);
            }
        } catch (error) {
            results.tests.fileTests = {
                passed: false,
                errors: [error.message],
                duration: 0
            };
            results.summary.failed++;
        }
    }

    async runRustFileTests(filePath, results) {
        const fileName = path.basename(filePath, '.rs');
        const projectRoot = this.findProjectRoot(filePath);

        // Check if file has inline tests
        const content = fs.readFileSync(filePath, 'utf8');
        const hasTests = content.includes('#[test]') || content.includes('#[cfg(test)]');

        if (!hasTests) {
            results.tests.fileTests = {
                passed: true,
                skipped: true,
                message: 'No tests found in file',
                duration: 0
            };
            return;
        }

        // Run only tests for this specific file/module
        const commands = ['cargo', 'test'];
        const args = [
            '--manifest-path', path.join(projectRoot, 'Cargo.toml'),
            '--', '--exact', fileName
        ];

        const result = await this.executeCommand(commands, args, {
            timeout: 4000,
            cwd: projectRoot
        });

        results.tests.fileTests = {
            passed: result.exitCode === 0,
            output: result.output,
            errors: result.exitCode !== 0 ? [result.stderr] : [],
            duration: result.duration
        };

        if (result.exitCode === 0) {
            results.summary.passed++;
        } else {
            results.summary.failed++;
            results.summary.errors.push(`Tests failed for ${fileName}`);
        }
    }

    async runJSFileTests(filePath, language, results) {
        const fileName = path.basename(filePath);
        const projectRoot = this.findProjectRoot(filePath);

        // Look for corresponding test files
        const testPatterns = this.config.testPatterns[language].unit;
        const possibleTestFiles = [];

        for (const pattern of testPatterns) {
            const testFile = fileName.replace(/\.(ts|js)x?$/, pattern.replace('*', ''));
            const testPath = path.join(path.dirname(filePath), testFile);
            if (fs.existsSync(testPath)) {
                possibleTestFiles.push(testPath);
            }
        }

        if (possibleTestFiles.length === 0) {
            results.tests.fileTests = {
                passed: true,
                skipped: true,
                message: 'No test files found',
                duration: 0
            };
            return;
        }

        // Run Jest with specific test file pattern
        const commands = ['npx', 'jest'];
        const args = [
            '--passWithNoTests',
            '--testPathPattern=' + possibleTestFiles[0],
            '--verbose',
            '--no-cache'
        ];

        const result = await this.executeCommand(commands, args, {
            timeout: 4000,
            cwd: projectRoot
        });

        results.tests.fileTests = {
            passed: result.exitCode === 0,
            output: result.output,
            errors: result.exitCode !== 0 ? [result.stderr] : [],
            duration: result.duration,
            testFiles: possibleTestFiles
        };

        if (result.exitCode === 0) {
            results.summary.passed++;
        } else {
            results.summary.failed++;
            results.summary.errors.push(`Tests failed for ${fileName}`);
        }
    }

    async runPythonFileTests(filePath, results) {
        const fileName = path.basename(filePath, '.py');
        const projectRoot = this.findProjectRoot(filePath);

        // Look for corresponding test files
        const testPatterns = [`test_${fileName}.py`, `${fileName}_test.py`];
        const possibleTestFiles = [];

        for (const pattern of testPatterns) {
            const testPath = path.join(path.dirname(filePath), pattern);
            if (fs.existsSync(testPath)) {
                possibleTestFiles.push(testPath);
            }

            // Also check tests/ directory
            const testsDir = path.join(projectRoot, 'tests');
            if (fs.existsSync(testsDir)) {
                const testInTestsDir = path.join(testsDir, pattern);
                if (fs.existsSync(testInTestsDir)) {
                    possibleTestFiles.push(testInTestsDir);
                }
            }
        }

        if (possibleTestFiles.length === 0) {
            results.tests.fileTests = {
                passed: true,
                skipped: true,
                message: 'No test files found',
                duration: 0
            };
            return;
        }

        // Run pytest with specific test file
        const commands = ['python', '-m', 'pytest'];
        const args = [
            '-v',
            '--tb=short',
            possibleTestFiles[0]
        ];

        const result = await this.executeCommand(commands, args, {
            timeout: 4000,
            cwd: projectRoot
        });

        results.tests.fileTests = {
            passed: result.exitCode === 0,
            output: result.output,
            errors: result.exitCode !== 0 ? [result.stderr] : [],
            duration: result.duration,
            testFiles: possibleTestFiles
        };

        if (result.exitCode === 0) {
            results.summary.passed++;
        } else {
            results.summary.failed++;
            results.summary.errors.push(`Tests failed for ${fileName}`);
        }
    }

    async runQuickLint(filePath, language, results) {
        const commands = this.config.fastTestCommands[language]?.lint;
        if (!commands) return;

        try {
            const result = await this.executeCommand(commands, [filePath], { timeout: 2000 });
            results.tests.lint = {
                passed: result.exitCode === 0,
                output: result.output,
                warnings: result.exitCode !== 0 ? [result.stderr] : [],
                duration: result.duration
            };

            if (result.exitCode === 0) {
                results.summary.passed++;
            } else {
                results.summary.warnings.push(`Lint warnings in ${path.basename(filePath)}`);
            }
        } catch (error) {
            results.tests.lint = {
                passed: true,
                skipped: true,
                message: 'Linter not available',
                duration: 0
            };
        }
    }

    async executeCommand(command, args, options = {}) {
        const startTime = Date.now();
        const timeout = options.timeout || this.timeoutMs;
        const cwd = options.cwd || process.cwd();

        return new Promise((resolve) => {
            const proc = spawn(command[0], [...command.slice(1), ...args], {
                cwd,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';
            let completed = false;

            const complete = (exitCode) => {
                if (completed) return;
                completed = true;

                resolve({
                    exitCode,
                    output: stdout,
                    stderr,
                    duration: Date.now() - startTime
                });
            };

            proc.stdout.on('data', (data) => stdout += data.toString());
            proc.stderr.on('data', (data) => stderr += data.toString());

            proc.on('close', (code) => complete(code || 0));
            proc.on('error', (error) => {
                stderr += error.message;
                complete(1);
            });

            // Timeout handling
            setTimeout(() => {
                if (!completed) {
                    proc.kill('SIGTERM');
                    stderr += `\nTimeout after ${timeout}ms`;
                    complete(1);
                }
            }, timeout);
        });
    }

    createTimeout() {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Overall test timeout after ${this.timeoutMs}ms`));
            }, this.timeoutMs);
        });
    }

    findProjectRoot(filePath) {
        const markers = ['Cargo.toml', 'package.json', 'pyproject.toml', 'setup.py'];
        let dir = path.dirname(filePath);

        while (dir !== path.dirname(dir)) {
            if (markers.some(marker => fs.existsSync(path.join(dir, marker)))) {
                return dir;
            }
            dir = path.dirname(dir);
        }

        return process.cwd();
    }

    updateSummary(results) {
        // Count passed/failed tests
        results.summary.passed = 0;
        results.summary.failed = 0;

        Object.values(results.tests).forEach(test => {
            if (test.skipped) return;
            if (test.passed) {
                results.summary.passed++;
            } else {
                results.summary.failed++;
            }
        });
    }

    printResults(results, totalTime) {
        console.log('\n' + '='.repeat(50));
        console.log(`⚡ FAST TEST RESULTS: ${path.basename(results.file)}`);
        console.log('='.repeat(50));

        // Test results
        Object.entries(results.tests).forEach(([testType, result]) => {
            const emoji = result.skipped ? '⏩' : result.passed ? '✅' : '❌';
            const status = result.skipped ? 'SKIPPED' : result.passed ? 'PASSED' : 'FAILED';
            const duration = result.duration || 0;

            console.log(`${emoji} ${testType.toUpperCase()}: ${status} (${duration}ms)`);

            if (result.errors && result.errors.length > 0) {
                result.errors.forEach(error => {
                    console.log(`    ❌ ${error.slice(0, 100)}...`);
                });
            }

            if (result.warnings && result.warnings.length > 0) {
                result.warnings.forEach(warning => {
                    console.log(`    ⚠️  ${warning.slice(0, 100)}...`);
                });
            }
        });

        // Summary
        console.log('\n📊 SUMMARY:');
        console.log(`  ✅ Passed: ${results.summary.passed}`);
        console.log(`  ❌ Failed: ${results.summary.failed}`);
        console.log(`  ⏱️  Total Time: ${totalTime}ms`);

        if (results.summary.errors.length > 0) {
            console.log('\n🚨 ERRORS:');
            results.summary.errors.forEach(error => {
                console.log(`  • ${error}`);
            });
        }

        if (results.summary.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            results.summary.warnings.forEach(warning => {
                console.log(`  • ${warning}`);
            });
        }

        // Feedback guidance
        if (results.summary.failed > 0) {
            console.log('\n💡 QUICK FIXES:');
            if (results.tests.syntax && !results.tests.syntax.passed) {
                console.log('  • Fix syntax errors first - they block everything else');
            }
            if (results.tests.typecheck && !results.tests.typecheck.passed) {
                console.log('  • Resolve type errors for better code safety');
            }
            if (results.tests.fileTests && !results.tests.fileTests.passed) {
                console.log('  • Fix failing tests - your code behavior changed');
            }
        } else if (results.summary.passed > 0) {
            console.log('\n🎉 ALL TESTS PASSED! Ready for next changes.');
        }

        console.log('='.repeat(50));
    }

    cleanCache() {
        const maxAge = 10 * 60 * 1000; // 10 minutes
        const now = Date.now();

        for (const [key, value] of this.testCache.entries()) {
            if (now - value.timestamp > maxAge) {
                this.testCache.delete(key);
            }
        }

        // Keep only latest 100 entries
        if (this.testCache.size > 100) {
            const entries = Array.from(this.testCache.entries());
            entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

            this.testCache.clear();
            entries.slice(0, 100).forEach(([key, value]) => {
                this.testCache.set(key, value);
            });
        }
    }
}

// Hook execution
async function main() {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error('Usage: fast-file-testing.js <file-path>');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    const tester = new FastFileTester();
    const results = await tester.testFile(filePath);

    // Exit with appropriate code
    process.exit(results.summary.failed > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fast testing error:', error);
        process.exit(1);
    });
}

module.exports = FastFileTester;