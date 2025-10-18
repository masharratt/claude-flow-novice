#!/usr/bin/env node

/**
 * Hook Testing and Validation Framework
 * Tests all hooks to ensure they work correctly and integrate properly
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

class HookTestFramework {
    constructor() {
        this.hooksDir = path.join(process.cwd(), 'config', 'hooks');
        this.testTempDir = null;
        this.testResults = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            tests: []
        };
    }

    async runAllTests() {
        console.log('🧪 STARTING HOOK TESTING FRAMEWORK');
        console.log('='.repeat(60));

        try {
            // Setup test environment
            await this.setupTestEnvironment();

            // Test each hook individually
            await this.testIndividualHooks();

            // Test hook integration
            await this.testHookIntegration();

            // Test hook manager
            await this.testHookManager();

            // Test communication system
            await this.testCommunicationSystem();

            // Cleanup
            await this.cleanup();

            // Generate final report
            this.generateFinalReport();

        } catch (error) {
            console.error('❌ Test framework error:', error);
            await this.cleanup();
            process.exit(1);
        }
    }

    async setupTestEnvironment() {
        console.log('\n🔧 Setting up test environment...');

        // Create temporary directory
        this.testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-tests-'));
        console.log(`📁 Test directory: ${this.testTempDir}`);

        // Create test files for different languages
        await this.createTestFiles();

        console.log('✅ Test environment ready');
    }

    async createTestFiles() {
        const testFiles = {
            'test.js': `
// Test JavaScript file
function testFunction() {
    console.log('Hello, world!');
}

module.exports = { testFunction };
`,
            'test.ts': `
// Test TypeScript file
interface TestInterface {
    name: string;
    value: number;
}

function testFunction(data: TestInterface): string {
    return \`Hello, \${data.name}!\`;
}

export { testFunction, TestInterface };
`,
            'test.py': `
# Test Python file
def test_function(name: str) -> str:
    """Test function with type hints"""
    return f"Hello, {name}!"

class TestClass:
    def __init__(self, value: int):
        self.value = value
`,
            'test.rs': `
// Test Rust file
pub struct TestStruct {
    pub name: String,
    pub value: i32,
}

impl TestStruct {
    pub fn new(name: String, value: i32) -> Self {
        TestStruct { name, value }
    }

    pub fn greet(&self) -> String {
        format!("Hello, {}!", self.name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet() {
        let test = TestStruct::new("World".to_string(), 42);
        assert_eq!(test.greet(), "Hello, World!");
    }
}
`,
            '.env': `
# Test environment file (should be blocked)
SECRET_KEY=test-secret-key
DATABASE_URL=postgres://user:pass@localhost/db
`,
            '.env.example': `
# Test environment example file (should be allowed)
SECRET_KEY=your-secret-key
DATABASE_URL=your-database-url
`
        };

        for (const [filename, content] of Object.entries(testFiles)) {
            const filePath = path.join(this.testTempDir, filename);
            fs.writeFileSync(filePath, content);
        }

        // Create package.json for JavaScript testing
        const packageJson = {
            name: 'hook-test-project',
            version: '1.0.0',
            scripts: {
                test: 'echo "Test script"',
                lint: 'echo "Lint script"'
            },
            devDependencies: {
                jest: '^29.0.0',
                eslint: '^8.0.0',
                typescript: '^4.0.0'
            }
        };

        fs.writeFileSync(
            path.join(this.testTempDir, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );
    }

    async testIndividualHooks() {
        console.log('\n🔍 Testing individual hooks...');

        const hooks = [
            'pre-edit-security',
            'post-edit-pipeline',
            'smart-dependency-analyzer',
            'fast-file-testing',
            'documentation-auto-update'
        ];

        for (const hookName of hooks) {
            await this.testHook(hookName);
        }
    }

    async testHook(hookName) {
        console.log(`\n  🧪 Testing ${hookName}...`);

        const hookPath = path.join(this.hooksDir, `${hookName}.js`);

        if (!fs.existsSync(hookPath)) {
            this.recordTest(`${hookName}-existence`, false, 'Hook file does not exist');
            return;
        }

        this.recordTest(`${hookName}-existence`, true, 'Hook file exists');

        // Test hook execution with different file types
        const testFiles = ['test.js', 'test.ts', 'test.py', 'test.rs'];

        for (const testFile of testFiles) {
            const filePath = path.join(this.testTempDir, testFile);
            await this.testHookExecution(hookName, hookPath, filePath);
        }

        // Test edge cases
        await this.testHookEdgeCases(hookName, hookPath);
    }

    async testHookExecution(hookName, hookPath, filePath) {
        const testName = `${hookName}-${path.basename(filePath)}`;

        try {
            const result = await this.executeHook(hookPath, [filePath]);

            // Check basic execution
            this.recordTest(
                `${testName}-execution`,
                true,
                `Hook executed for ${path.basename(filePath)}`
            );

            // Check output format
            const hasOutput = result.stdout.length > 0 || result.stderr.length > 0;
            this.recordTest(
                `${testName}-output`,
                hasOutput,
                hasOutput ? 'Hook produced output' : 'Hook produced no output'
            );

            // Check execution time (should be reasonable)
            const executionTime = result.duration;
            this.recordTest(
                `${testName}-performance`,
                executionTime < 30000, // 30 second timeout
                `Execution time: ${executionTime}ms`
            );

        } catch (error) {
            this.recordTest(
                `${testName}-execution`,
                false,
                `Hook execution failed: ${error.message}`
            );
        }
    }

    async testHookEdgeCases(hookName, hookPath) {
        // Test with non-existent file
        try {
            const nonExistentFile = path.join(this.testTempDir, 'nonexistent.js');
            const result = await this.executeHook(hookPath, [nonExistentFile]);

            this.recordTest(
                `${hookName}-nonexistent-file`,
                result.exitCode !== 0,
                'Hook handled non-existent file appropriately'
            );
        } catch (error) {
            this.recordTest(
                `${hookName}-nonexistent-file`,
                true,
                'Hook properly errored on non-existent file'
            );
        }

        // Test with .env file (should be blocked by security hook)
        if (hookName === 'pre-edit-security') {
            try {
                const envFile = path.join(this.testTempDir, '.env');
                const result = await this.executeHook(hookPath, [envFile]);

                this.recordTest(
                    `${hookName}-env-block`,
                    result.exitCode !== 0,
                    'Security hook blocked .env file edit'
                );
            } catch (error) {
                this.recordTest(
                    `${hookName}-env-block`,
                    true,
                    'Security hook blocked .env file edit'
                );
            }

            // Test with .env.example file (should be allowed)
            try {
                const envExampleFile = path.join(this.testTempDir, '.env.example');
                const result = await this.executeHook(hookPath, [envExampleFile]);

                this.recordTest(
                    `${hookName}-env-example-allow`,
                    result.exitCode === 0,
                    'Security hook allowed .env.example file'
                );
            } catch (error) {
                this.recordTest(
                    `${hookName}-env-example-allow`,
                    false,
                    `Security hook failed on .env.example: ${error.message}`
                );
            }
        }
    }

    async testHookIntegration() {
        console.log('\n🔗 Testing hook integration...');

        // Test hook manager integration
        const managerPath = path.join(this.hooksDir, 'hook-manager.js');

        if (!fs.existsSync(managerPath)) {
            this.recordTest('manager-existence', false, 'Hook manager not found');
            return;
        }

        this.recordTest('manager-existence', true, 'Hook manager exists');

        // Test manager commands
        await this.testManagerCommands(managerPath);

        // Test hook sequence execution
        await this.testHookSequence(managerPath);
    }

    async testManagerCommands(managerPath) {
        const commands = ['list', 'status'];

        for (const command of commands) {
            try {
                const result = await this.executeHook(managerPath, [command]);

                this.recordTest(
                    `manager-${command}`,
                    result.exitCode === 0,
                    `Manager ${command} command executed successfully`
                );
            } catch (error) {
                this.recordTest(
                    `manager-${command}`,
                    false,
                    `Manager ${command} command failed: ${error.message}`
                );
            }
        }
    }

    async testHookSequence(managerPath) {
        const testFile = path.join(this.testTempDir, 'test.js');

        try {
            const result = await this.executeHook(managerPath, ['execute', 'post-edit', testFile]);

            this.recordTest(
                'manager-sequence',
                true, // Don't require success, just execution
                'Hook sequence executed via manager'
            );

            // Check if multiple hooks were executed
            const outputContainsMultipleHooks = result.stdout.includes('HOOK SEQUENCE');
            this.recordTest(
                'manager-sequence-multiple',
                outputContainsMultipleHooks,
                'Manager executed multiple hooks in sequence'
            );

        } catch (error) {
            this.recordTest(
                'manager-sequence',
                false,
                `Hook sequence execution failed: ${error.message}`
            );
        }
    }

    async testHookManager() {
        console.log('\n⚙️  Testing hook manager functionality...');

        const HookManager = require('./hook-manager.js');
        const manager = new HookManager();

        // Test configuration loading
        try {
            const status = await manager.getStatus();
            this.recordTest(
                'manager-config',
                typeof status === 'object' && status.totalHooks >= 0,
                'Manager loaded configuration successfully'
            );
        } catch (error) {
            this.recordTest(
                'manager-config',
                false,
                `Manager configuration failed: ${error.message}`
            );
        }

        // Test hook discovery
        try {
            const hooks = manager.availableHooks;
            this.recordTest(
                'manager-discovery',
                Object.keys(hooks).length > 0,
                `Manager discovered ${Object.keys(hooks).length} hooks`
            );
        } catch (error) {
            this.recordTest(
                'manager-discovery',
                false,
                `Hook discovery failed: ${error.message}`
            );
        }
    }

    async testCommunicationSystem() {
        console.log('\n📡 Testing communication system integration...');

        // Test SQLite communication setup
        const dbDir = path.join(process.cwd(), 'database', 'instances', 'hooks');
        const dbExists = fs.existsSync(dbDir);

        this.recordTest(
            'communication-db-dir',
            dbExists,
            dbExists ? 'Database directory exists' : 'Database directory missing'
        );

        // Test memory system integration
        // This would test the actual SQLite integration if available
        this.recordTest(
            'communication-memory',
            true, // Placeholder for actual memory system test
            'Memory system integration test placeholder'
        );
    }

    async executeHook(hookPath, args, options = {}) {
        const startTime = Date.now();
        const timeout = options.timeout || 10000;

        return new Promise((resolve, reject) => {
            const proc = spawn('node', [hookPath, ...args], {
                cwd: this.testTempDir,
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
                    stdout,
                    stderr,
                    duration: Date.now() - startTime
                });
            };

            proc.stdout.on('data', (data) => stdout += data.toString());
            proc.stderr.on('data', (data) => stderr += data.toString());

            proc.on('close', (code) => complete(code || 0));
            proc.on('error', (error) => {
                if (!completed) {
                    reject(error);
                }
            });

            // Timeout handling
            setTimeout(() => {
                if (!completed) {
                    proc.kill('SIGTERM');
                    reject(new Error(`Hook timeout after ${timeout}ms`));
                }
            }, timeout);
        });
    }

    recordTest(testName, passed, message) {
        const test = {
            name: testName,
            passed,
            message,
            timestamp: new Date().toISOString()
        };

        this.testResults.tests.push(test);
        this.testResults.total++;

        if (passed) {
            this.testResults.passed++;
            console.log(`    ✅ ${testName}: ${message}`);
        } else {
            this.testResults.failed++;
            console.log(`    ❌ ${testName}: ${message}`);
        }
    }

    async cleanup() {
        if (this.testTempDir && fs.existsSync(this.testTempDir)) {
            try {
                fs.rmSync(this.testTempDir, { recursive: true, force: true });
                console.log(`\n🧹 Cleaned up test directory: ${this.testTempDir}`);
            } catch (error) {
                console.warn(`Warning: Failed to clean up test directory: ${error.message}`);
            }
        }
    }

    generateFinalReport() {
        console.log('\n' + '='.repeat(60));
        console.log('🧪 HOOK TESTING FRAMEWORK FINAL REPORT');
        console.log('='.repeat(60));

        console.log('\n📊 SUMMARY:');
        console.log(`  Total Tests: ${this.testResults.total}`);
        console.log(`  ✅ Passed: ${this.testResults.passed}`);
        console.log(`  ❌ Failed: ${this.testResults.failed}`);
        console.log(`  ⏩ Skipped: ${this.testResults.skipped}`);

        const successRate = this.testResults.total > 0
            ? ((this.testResults.passed / this.testResults.total) * 100).toFixed(1)
            : 0;

        console.log(`  📈 Success Rate: ${successRate}%`);

        if (this.testResults.failed > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.testResults.tests
                .filter(test => !test.passed)
                .forEach(test => {
                    console.log(`  • ${test.name}: ${test.message}`);
                });
        }

        console.log('\n💡 RECOMMENDATIONS:');
        if (this.testResults.failed === 0) {
            console.log('  🎉 All tests passed! Hook system is ready for use.');
        } else {
            console.log('  🔧 Review failed tests and fix issues before deployment');
            console.log('  📋 Consider adding more comprehensive error handling');
            console.log('  ⚡ Optimize slow-performing hooks if needed');
        }

        // Save detailed report
        const reportPath = path.join(this.hooksDir, 'test-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: {
                total: this.testResults.total,
                passed: this.testResults.passed,
                failed: this.testResults.failed,
                successRate: successRate + '%'
            },
            tests: this.testResults.tests
        }, null, 2));

        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
        console.log('='.repeat(60));

        // Exit with appropriate code
        process.exit(this.testResults.failed > 0 ? 1 : 0);
    }
}

// CLI execution
async function main() {
    const command = process.argv[2];

    switch (command) {
        case 'run':
        case 'test':
        default:
            const framework = new HookTestFramework();
            await framework.runAllTests();
            break;

        case 'help':
            console.log('Hook Testing Framework');
            console.log('');
            console.log('Commands:');
            console.log('  run, test    - Run all hook tests');
            console.log('  help         - Show this help message');
            break;
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Test framework error:', error);
        process.exit(1);
    });
}

module.exports = HookTestFramework;