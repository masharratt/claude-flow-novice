#!/usr/bin/env node

/**
 * Post-Edit Validation Pipeline
 * Comprehensive validation, formatting, and quality checks after file edits
 */

const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class PostEditPipeline {
    constructor() {
        this.config = this.loadConfig();
        this.languageDetectors = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.rs': 'rust',
            '.go': 'go',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.php': 'php',
            '.rb': 'ruby',
            '.cs': 'csharp',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.toml': 'toml',
            '.md': 'markdown',
        };
    }

    loadConfig() {
        const configPath = path.join(process.cwd(), 'config', 'hooks', 'pipeline-config.json');
        try {
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (error) {
            console.warn('Using default pipeline configuration');
        }

        return {
            formatters: {
                javascript: ['prettier', '--write'],
                typescript: ['prettier', '--write'],
                python: ['black', '--quiet'],
                rust: ['rustfmt'],
                go: ['gofmt', '-w'],
                json: ['prettier', '--write'],
                yaml: ['prettier', '--write'],
                markdown: ['prettier', '--write']
            },
            linters: {
                javascript: ['eslint', '--fix'],
                typescript: ['eslint', '--fix'],
                python: ['flake8'],
                rust: ['clippy'],
                go: ['golint']
            },
            typeCheckers: {
                typescript: ['tsc', '--noEmit'],
                python: ['mypy'],
                rust: ['cargo', 'check'],
                go: ['go', 'vet']
            },
            testCommands: {
                javascript: ['npm', 'test'],
                typescript: ['npm', 'test'],
                python: ['pytest'],
                rust: ['cargo', 'test'],
                go: ['go', 'test']
            },
            securityScanners: {
                javascript: ['npm', 'audit'],
                typescript: ['npm', 'audit'],
                python: ['bandit', '-r'],
                rust: ['cargo', 'audit'],
                go: ['gosec']
            },
            dependencyCheckers: {
                javascript: ['npm', 'ls'],
                typescript: ['npm', 'ls'],
                python: ['pip', 'check'],
                rust: ['cargo', 'tree'],
                go: ['go', 'mod', 'verify']
            }
        };
    }

    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return this.languageDetectors[ext] || 'unknown';
    }

    async runCommand(command, args, cwd = process.cwd()) {
        return new Promise((resolve) => {
            const proc = spawn(command, args, {
                cwd,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => stdout += data.toString());
            proc.stderr.on('data', (data) => stderr += data.toString());

            proc.on('close', (code) => {
                resolve({ code, stdout, stderr });
            });

            proc.on('error', (error) => {
                resolve({ code: 1, stdout: '', stderr: error.message });
            });
        });
    }

    async checkToolAvailable(tool) {
        const { code } = await this.runCommand('which', [tool]);
        return code === 0;
    }

    async formatFile(filePath, language) {
        const formatters = this.config.formatters[language];
        if (!formatters) return { success: true, message: 'No formatter configured' };

        const [tool, ...args] = formatters;
        if (!(await this.checkToolAvailable(tool))) {
            return { success: false, message: `Formatter ${tool} not available` };
        }

        const result = await this.runCommand(tool, [...args, filePath]);
        return {
            success: result.code === 0,
            message: result.code === 0 ? 'Formatted successfully' : result.stderr,
            output: result.stdout
        };
    }

    async lintFile(filePath, language) {
        const linters = this.config.linters[language];
        if (!linters) return { success: true, message: 'No linter configured' };

        const [tool, ...args] = linters;
        if (!(await this.checkToolAvailable(tool))) {
            return { success: false, message: `Linter ${tool} not available` };
        }

        const result = await this.runCommand(tool, [...args, filePath]);
        return {
            success: result.code === 0,
            message: result.code === 0 ? 'Linting passed' : 'Linting issues found',
            output: result.stdout + result.stderr,
            issues: result.code !== 0 ? result.stderr : ''
        };
    }

    async typeCheck(filePath, language) {
        const typeCheckers = this.config.typeCheckers[language];
        if (!typeCheckers) return { success: true, message: 'No type checker configured' };

        const [tool, ...args] = typeCheckers;
        if (!(await this.checkToolAvailable(tool))) {
            return { success: false, message: `Type checker ${tool} not available` };
        }

        const projectDir = this.findProjectRoot(filePath);
        const result = await this.runCommand(tool, args, projectDir);

        return {
            success: result.code === 0,
            message: result.code === 0 ? 'Type checking passed' : 'Type errors found',
            output: result.stdout + result.stderr,
            errors: result.code !== 0 ? result.stderr : ''
        };
    }

    async checkDependencies(filePath, language) {
        const depCheckers = this.config.dependencyCheckers[language];
        if (!depCheckers) return { success: true, message: 'No dependency checker configured' };

        const [tool, ...args] = depCheckers;
        if (!(await this.checkToolAvailable(tool))) {
            return { success: false, message: `Dependency checker ${tool} not available` };
        }

        const projectDir = this.findProjectRoot(filePath);
        const result = await this.runCommand(tool, args, projectDir);

        return {
            success: result.code === 0,
            message: result.code === 0 ? 'Dependencies OK' : 'Dependency issues found',
            output: result.stdout + result.stderr,
            issues: result.code !== 0 ? result.stderr : ''
        };
    }

    async runTests(filePath, language) {
        const testCommands = this.config.testCommands[language];
        if (!testCommands) return { success: true, message: 'No test command configured' };

        const [tool, ...args] = testCommands;
        if (!(await this.checkToolAvailable(tool))) {
            return { success: false, message: `Test runner ${tool} not available` };
        }

        const projectDir = this.findProjectRoot(filePath);

        // Check if tests exist
        const testDirs = ['test', 'tests', '__tests__', 'spec'];
        const hasTests = testDirs.some(dir =>
            fs.existsSync(path.join(projectDir, dir))
        );

        if (!hasTests) {
            return { success: true, message: 'No tests found to run' };
        }

        const result = await this.runCommand(tool, args, projectDir);

        return {
            success: result.code === 0,
            message: result.code === 0 ? 'Tests passed' : 'Tests failed',
            output: result.stdout + result.stderr,
            failures: result.code !== 0 ? result.stderr : ''
        };
    }

    async securityScan(filePath, language) {
        const scanners = this.config.securityScanners[language];
        if (!scanners) return { success: true, message: 'No security scanner configured' };

        const [tool, ...args] = scanners;
        if (!(await this.checkToolAvailable(tool))) {
            return { success: false, message: `Security scanner ${tool} not available` };
        }

        const projectDir = this.findProjectRoot(filePath);
        const result = await this.runCommand(tool, args, projectDir);

        return {
            success: result.code === 0,
            message: result.code === 0 ? 'Security scan passed' : 'Security issues found',
            output: result.stdout + result.stderr,
            vulnerabilities: result.code !== 0 ? result.stderr : ''
        };
    }

    findProjectRoot(filePath) {
        const markers = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py'];
        let dir = path.dirname(filePath);

        while (dir !== path.dirname(dir)) {
            if (markers.some(marker => fs.existsSync(path.join(dir, marker)))) {
                return dir;
            }
            dir = path.dirname(dir);
        }

        return process.cwd();
    }

    async analyzeDependencies(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const language = this.detectLanguage(filePath);

        let imports = [];

        // Extract imports based on language
        switch (language) {
            case 'javascript':
            case 'typescript':
                imports = this.extractJSImports(content);
                break;
            case 'python':
                imports = this.extractPythonImports(content);
                break;
            case 'rust':
                imports = this.extractRustUses(content);
                break;
            case 'go':
                imports = this.extractGoImports(content);
                break;
        }

        // Check which dependencies exist
        const analysis = {
            total: imports.length,
            existing: 0,
            missing: [],
            suggestions: []
        };

        for (const imp of imports) {
            if (await this.dependencyExists(imp, language)) {
                analysis.existing++;
            } else {
                analysis.missing.push(imp);
            }
        }

        return analysis;
    }

    extractJSImports(content) {
        const importRegex = /(?:import.*?from\s+['"`]([^'"`]+)['"`]|require\(['"`]([^'"`]+)['"`]\))/g;
        const imports = [];
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1] || match[2]);
        }

        return imports.filter(imp => !imp.startsWith('.') && !imp.startsWith('/'));
    }

    extractPythonImports(content) {
        const importRegex = /(?:^from\s+(\S+)|^import\s+(\S+))/gm;
        const imports = [];
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1] || match[2]);
        }

        return imports;
    }

    extractRustUses(content) {
        const useRegex = /^use\s+([^;]+);/gm;
        const imports = [];
        let match;

        while ((match = useRegex.exec(content)) !== null) {
            imports.push(match[1].split('::')[0]);
        }

        return imports;
    }

    extractGoImports(content) {
        const importRegex = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
        const imports = [];
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            if (match[1]) {
                // Multi-line import block
                const lines = match[1].split('\n');
                for (const line of lines) {
                    const lineMatch = line.match(/"([^"]+)"/);
                    if (lineMatch) imports.push(lineMatch[1]);
                }
            } else {
                imports.push(match[2]);
            }
        }

        return imports;
    }

    async dependencyExists(dependency, language) {
        // This is a simplified check - in reality you'd want more sophisticated detection
        const projectDir = this.findProjectRoot(process.cwd());

        switch (language) {
            case 'javascript':
            case 'typescript':
                return fs.existsSync(path.join(projectDir, 'node_modules', dependency));
            case 'python':
                try {
                    await execAsync(`python -c "import ${dependency}"`);
                    return true;
                } catch {
                    return false;
                }
            default:
                return true; // Assume exists for unknown languages
        }
    }

    async run(filePath) {
        const language = this.detectLanguage(filePath);
        const results = {
            file: filePath,
            language,
            timestamp: new Date().toISOString(),
            steps: {},
            summary: {
                success: true,
                warnings: [],
                errors: [],
                suggestions: []
            }
        };

        console.log(`\n🔍 STARTING VALIDATION PIPELINE FOR: ${path.basename(filePath)}`);
        console.log(`📋 Language: ${language.toUpperCase()}`);

        // Step 1: Format
        console.log('\n📝 FORMATTING...');
        results.steps.formatting = await this.formatFile(filePath, language);
        this.logStepResult('Format', results.steps.formatting);

        // Step 2: Lint
        console.log('\n🔍 LINTING...');
        results.steps.linting = await this.lintFile(filePath, language);
        this.logStepResult('Lint', results.steps.linting);
        if (!results.steps.linting.success) {
            results.summary.warnings.push(`Linting issues in ${path.basename(filePath)}`);
        }

        // Step 3: Type Check
        console.log('\n🎯 TYPE CHECKING...');
        results.steps.typeCheck = await this.typeCheck(filePath, language);
        this.logStepResult('Type Check', results.steps.typeCheck);
        if (!results.steps.typeCheck.success) {
            results.summary.errors.push(`Type errors in ${path.basename(filePath)}`);
            results.summary.success = false;
        }

        // Step 4: Dependency Analysis
        console.log('\n📦 ANALYZING DEPENDENCIES...');
        results.steps.dependencies = await this.checkDependencies(filePath, language);
        this.logStepResult('Dependencies', results.steps.dependencies);

        const depAnalysis = await this.analyzeDependencies(filePath);
        console.log(`📊 Dependency Analysis: ${depAnalysis.existing}/${depAnalysis.total} dependencies found`);

        if (depAnalysis.missing.length > 0) {
            results.summary.warnings.push(`Missing dependencies: ${depAnalysis.missing.join(', ')}`);
            results.summary.suggestions.push('🤖 Consider spawning agents to create missing dependencies');
        }

        // Step 5: Security Scan
        console.log('\n🛡️  SECURITY SCANNING...');
        results.steps.security = await this.securityScan(filePath, language);
        this.logStepResult('Security', results.steps.security);
        if (!results.steps.security.success) {
            results.summary.warnings.push(`Security vulnerabilities found in ${path.basename(filePath)}`);
        }

        // Step 6: Run Tests (if validation tier allows)
        if (depAnalysis.existing / depAnalysis.total > 0.7) { // Only if most dependencies exist
            console.log('\n🧪 RUNNING TESTS...');
            results.steps.tests = await this.runTests(filePath, language);
            this.logStepResult('Tests', results.steps.tests);
            if (!results.steps.tests.success) {
                results.summary.errors.push(`Test failures in ${path.basename(filePath)}`);
                results.summary.success = false;
            }
        } else {
            console.log('\n⏳ SKIPPING TESTS: Insufficient dependencies (Progressive validation)');
            results.steps.tests = { success: true, message: 'Skipped due to missing dependencies' };
        }

        // Generate summary
        this.printSummary(results);

        return results;
    }

    logStepResult(step, result) {
        if (result.success) {
            console.log(`  ✅ ${step}: ${result.message}`);
        } else {
            console.log(`  ❌ ${step}: ${result.message}`);
            if (result.issues || result.errors || result.failures) {
                console.log(`     ${(result.issues || result.errors || result.failures).slice(0, 200)}...`);
            }
        }
    }

    printSummary(results) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 VALIDATION SUMMARY');
        console.log('='.repeat(60));

        if (results.summary.success) {
            console.log('✅ Overall Status: PASSED');
        } else {
            console.log('❌ Overall Status: FAILED');
        }

        if (results.summary.errors.length > 0) {
            console.log('\n🚨 ERRORS:');
            results.summary.errors.forEach(error => console.log(`  • ${error}`));
        }

        if (results.summary.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            results.summary.warnings.forEach(warning => console.log(`  • ${warning}`));
        }

        if (results.summary.suggestions.length > 0) {
            console.log('\n💡 SUGGESTIONS:');
            results.summary.suggestions.forEach(suggestion => console.log(`  • ${suggestion}`));
        }

        console.log('='.repeat(60));
    }
}

// Hook execution
async function main() {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error('Usage: post-edit-pipeline.js <file-path>');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    const pipeline = new PostEditPipeline();
    const results = await pipeline.run(filePath);

    // Exit with error code if validation failed
    process.exit(results.summary.success ? 0 : 1);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Pipeline error:', error);
        process.exit(1);
    });
}

module.exports = PostEditPipeline;