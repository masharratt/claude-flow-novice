#!/usr/bin/env node

/**
 * Test Coverage Validator Hook - Priority 3
 *
 * Validates test coverage thresholds for edited files
 * 100% automation - quantitative metrics only
 *
 * Features:
 * - Line coverage ≥ 80% (configurable)
 * - Branch coverage ≥ 75% (configurable)
 * - Function coverage ≥ 80% (configurable)
 * - Statement coverage ≥ 80% (configurable)
 * - Supports multiple test frameworks (Vitest, Jest, Pytest, Go, Rust)
 * - Parses test-results.json and coverage reports
 * - Target execution time: <500ms
 * - Incremental validation (only changed files)
 *
 * Usage:
 *   post-test-coverage.js <file> [options]
 *   post-test-coverage.js src/auth.js --line 85 --branch 80
 *   post-test-coverage.js src/auth.js --json --verbose
 *   post-test-coverage.js src/auth.js --config coverage.config.json
 *
 * Integration:
 *   Leverage SingleFileTestEngine from post-edit-pipeline.js
 *   Extract and enhance coverage parsing logic
 */

import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Default thresholds (100% quantitative automation)
const DEFAULT_THRESHOLDS = {
    line: 80,       // Line coverage ≥ 80%
    branch: 75,     // Branch coverage ≥ 75%
    function: 80,   // Function coverage ≥ 80%
    statement: 80   // Statement coverage ≥ 80%
};

// Logger utility
class Logger {
    static success(msg) { console.log(`✅ ${msg}`); }
    static error(msg) { console.log(`❌ ${msg}`); }
    static warning(msg) { console.log(`⚠️ ${msg}`); }
    static info(msg) { console.log(`ℹ️ ${msg}`); }
    static coverage(msg) { console.log(`📊 ${msg}`); }
}

/**
 * Coverage Data Parser
 * Supports multiple formats: Jest/Vitest JSON, Istanbul, lcov
 */
class CoverageParser {
    constructor() {
        this.coveragePaths = [
            'coverage/coverage-final.json',
            'coverage/coverage-summary.json',
            '.nyc_output/coverage-final.json',
            'coverage/lcov.info'
        ];
    }

    /**
     * Find coverage file for given source file
     */
    async findCoverageFile(sourceFile) {
        const projectRoot = this.findProjectRoot(sourceFile);

        for (const relativePath of this.coveragePaths) {
            const fullPath = path.join(projectRoot, relativePath);
            if (await this.fileExists(fullPath)) {
                return fullPath;
            }
        }

        return null;
    }

    /**
     * Parse coverage data from various formats
     */
    async parseCoverageFile(coverageFile, sourceFile) {
        try {
            const content = await fs.promises.readFile(coverageFile, 'utf8');
            const ext = path.extname(coverageFile);

            if (ext === '.json') {
                return await this.parseJSONCoverage(content, sourceFile);
            } else if (ext === '.info') {
                return await this.parseLcovCoverage(content, sourceFile);
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse JSON coverage (Istanbul/Jest/Vitest format)
     */
    async parseJSONCoverage(content, sourceFile) {
        try {
            const data = JSON.parse(content);
            const absolutePath = path.resolve(sourceFile);

            // Handle coverage-summary.json format
            if (data.total && data[absolutePath]) {
                const fileCoverage = data[absolutePath];
                return {
                    line: fileCoverage.lines?.pct || 0,
                    branch: fileCoverage.branches?.pct || 0,
                    function: fileCoverage.functions?.pct || 0,
                    statement: fileCoverage.statements?.pct || 0,
                    uncoveredLines: this.extractUncoveredLines(fileCoverage),
                    uncoveredBranches: this.extractUncoveredBranches(fileCoverage)
                };
            }

            // Handle coverage-final.json format (detailed)
            if (data[absolutePath]) {
                const fileCoverage = data[absolutePath];
                return {
                    line: this.calculatePercentage(fileCoverage.s),
                    branch: this.calculateBranchPercentage(fileCoverage.b),
                    function: this.calculatePercentage(fileCoverage.f),
                    statement: this.calculatePercentage(fileCoverage.s),
                    uncoveredLines: this.extractUncoveredLinesDetailed(fileCoverage),
                    uncoveredBranches: this.extractUncoveredBranchesDetailed(fileCoverage)
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse lcov coverage format
     */
    async parseLcovCoverage(content, sourceFile) {
        const lines = content.split('\n');
        const relativePath = path.basename(sourceFile);
        let inTargetFile = false;
        let linesFound = 0, linesCovered = 0;
        let branchesFound = 0, branchesCovered = 0;
        let functionsFound = 0, functionsCovered = 0;

        for (const line of lines) {
            if (line.startsWith('SF:') && line.includes(relativePath)) {
                inTargetFile = true;
            } else if (line.startsWith('end_of_record')) {
                inTargetFile = false;
            } else if (inTargetFile) {
                if (line.startsWith('LF:')) linesFound = parseInt(line.substring(3));
                else if (line.startsWith('LH:')) linesCovered = parseInt(line.substring(3));
                else if (line.startsWith('BRF:')) branchesFound = parseInt(line.substring(4));
                else if (line.startsWith('BRH:')) branchesCovered = parseInt(line.substring(4));
                else if (line.startsWith('FNF:')) functionsFound = parseInt(line.substring(4));
                else if (line.startsWith('FNH:')) functionsCovered = parseInt(line.substring(4));
            }
        }

        if (linesFound === 0) return null;

        return {
            line: Math.round((linesCovered / linesFound) * 100),
            branch: branchesFound > 0 ? Math.round((branchesCovered / branchesFound) * 100) : 100,
            function: functionsFound > 0 ? Math.round((functionsCovered / functionsFound) * 100) : 100,
            statement: Math.round((linesCovered / linesFound) * 100),
            uncoveredLines: [],
            uncoveredBranches: []
        };
    }

    /**
     * Calculate percentage from coverage map
     */
    calculatePercentage(coverageMap) {
        if (!coverageMap) return 0;
        const values = Object.values(coverageMap);
        const total = values.length;
        const covered = values.filter(v => v > 0).length;
        return total > 0 ? Math.round((covered / total) * 100) : 0;
    }

    /**
     * Calculate branch percentage from coverage map
     */
    calculateBranchPercentage(branchMap) {
        if (!branchMap) return 0;
        const values = Object.values(branchMap).flat();
        const total = values.length;
        const covered = values.filter(v => v > 0).length;
        return total > 0 ? Math.round((covered / total) * 100) : 0;
    }

    /**
     * Extract uncovered lines from summary format
     */
    extractUncoveredLines(fileCoverage) {
        // Summary format doesn't have detailed line info
        return [];
    }

    /**
     * Extract uncovered branches from summary format
     */
    extractUncoveredBranches(fileCoverage) {
        // Summary format doesn't have detailed branch info
        return [];
    }

    /**
     * Extract uncovered lines from detailed format
     */
    extractUncoveredLinesDetailed(fileCoverage) {
        if (!fileCoverage.statementMap || !fileCoverage.s) return [];

        const uncovered = [];
        for (const [index, count] of Object.entries(fileCoverage.s)) {
            if (count === 0) {
                const statement = fileCoverage.statementMap[index];
                if (statement && statement.start) {
                    uncovered.push({
                        start: statement.start.line,
                        end: statement.end.line
                    });
                }
            }
        }

        return uncovered;
    }

    /**
     * Extract uncovered branches from detailed format
     */
    extractUncoveredBranchesDetailed(fileCoverage) {
        if (!fileCoverage.branchMap || !fileCoverage.b) return [];

        const uncovered = [];
        for (const [index, branches] of Object.entries(fileCoverage.b)) {
            const branchInfo = fileCoverage.branchMap[index];
            branches.forEach((count, branchIndex) => {
                if (count === 0 && branchInfo.locations[branchIndex]) {
                    uncovered.push({
                        line: branchInfo.locations[branchIndex].start.line,
                        type: branchInfo.type
                    });
                }
            });
        }

        return uncovered;
    }

    /**
     * Find project root directory
     */
    findProjectRoot(filePath) {
        const markers = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py'];
        let dir = path.dirname(path.resolve(filePath));

        for (let i = 0; i < 10; i++) {
            if (markers.some(marker => fs.existsSync(path.join(dir, marker)))) {
                return dir;
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }

        return process.cwd();
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Test Results Parser
 * Parses test-results.json from various test frameworks
 */
class TestResultsParser {
    async parseTestResults(projectRoot) {
        const possiblePaths = [
            path.join(projectRoot, 'test-results.json'),
            path.join(projectRoot, 'coverage', 'test-results.json'),
            path.join(projectRoot, '.nyc_output', 'test-results.json')
        ];

        for (const testResultsPath of possiblePaths) {
            if (fs.existsSync(testResultsPath)) {
                try {
                    const content = await fs.promises.readFile(testResultsPath, 'utf8');

                    // Handle Jest format with JSON at the end
                    const jsonMatch = content.match(/\{[\s\S]*"numFailedTestSuites"[\s\S]*\}/);
                    if (jsonMatch) {
                        const data = JSON.parse(jsonMatch[0]);
                        return this.parseJestResults(data);
                    }

                    // Try parsing as pure JSON
                    const data = JSON.parse(content);
                    return this.parseJestResults(data);
                } catch (error) {
                    continue;
                }
            }
        }

        return null;
    }

    parseJestResults(data) {
        return {
            total: data.numTotalTests || 0,
            passed: data.numPassedTests || 0,
            failed: data.numFailedTests || 0,
            skipped: data.numPendingTests || 0,
            success: data.success || false,
            testResults: data.testResults || []
        };
    }
}

/**
 * Framework-Specific Coverage Retrieval
 * Runs coverage commands for various frameworks
 */
class FrameworkCoverageRetriever {
    async getCoverageForFile(file, framework = null) {
        if (!framework) {
            framework = await this.detectFramework(file);
        }

        switch (framework) {
            case 'vitest':
                return await this.getVitestCoverage(file);
            case 'jest':
                return await this.getJestCoverage(file);
            case 'pytest':
                return await this.getPytestCoverage(file);
            case 'go':
                return await this.getGoCoverage(file);
            case 'rust':
                return await this.getRustCoverage(file);
            default:
                return null;
        }
    }

    async detectFramework(file) {
        const projectRoot = this.findProjectRoot(file);
        const ext = path.extname(file);

        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
            // Check for Vitest
            if (fs.existsSync(path.join(projectRoot, 'vitest.config.ts')) ||
                fs.existsSync(path.join(projectRoot, 'vitest.config.js'))) {
                return 'vitest';
            }
            // Check for Jest
            if (fs.existsSync(path.join(projectRoot, 'jest.config.js')) ||
                fs.existsSync(path.join(projectRoot, 'jest.config.ts'))) {
                return 'jest';
            }
            return 'jest'; // Default to Jest for JS/TS
        } else if (ext === '.py') {
            return 'pytest';
        } else if (ext === '.go') {
            return 'go';
        } else if (ext === '.rs') {
            return 'rust';
        }

        return null;
    }

    async getVitestCoverage(file) {
        try {
            const result = await execAsync(`npx vitest run --coverage.enabled --coverage.reporter=json "${path.basename(file)}"`, {
                cwd: path.dirname(file),
                timeout: 30000
            });

            // Parse coverage from Vitest output
            const parser = new CoverageParser();
            return await parser.parseCoverageFile('coverage/coverage-final.json', file);
        } catch (error) {
            return null;
        }
    }

    async getJestCoverage(file) {
        try {
            const result = await execAsync(`npx jest --coverage --coverageReporters=json --silent "${path.basename(file)}"`, {
                cwd: path.dirname(file),
                timeout: 30000
            });

            const parser = new CoverageParser();
            return await parser.parseCoverageFile('coverage/coverage-final.json', file);
        } catch (error) {
            return null;
        }
    }

    async getPytestCoverage(file) {
        try {
            const result = await execAsync(`pytest --cov="${path.dirname(file)}" --cov-report=json:/tmp/coverage.json "${file}"`, {
                timeout: 30000
            });

            const coverageData = JSON.parse(await fs.promises.readFile('/tmp/coverage.json', 'utf8'));
            const fileCoverage = coverageData.files[path.resolve(file)] || {};

            return {
                line: fileCoverage.summary?.percent_covered || 0,
                branch: 0, // Pytest doesn't report branch coverage by default
                function: 0,
                statement: fileCoverage.summary?.percent_covered || 0,
                uncoveredLines: fileCoverage.missing_lines || [],
                uncoveredBranches: []
            };
        } catch (error) {
            return null;
        }
    }

    async getGoCoverage(file) {
        try {
            const result = await execAsync(`go test -coverprofile=/tmp/coverage.out "${file}"`, {
                timeout: 30000
            });

            const coverageOutput = await fs.promises.readFile('/tmp/coverage.out', 'utf8');
            const lines = coverageOutput.split('\n').filter(line => line.includes(file));

            let totalStatements = 0;
            let coveredStatements = 0;

            lines.forEach(line => {
                const match = line.match(/(\d+)\s+(\d+)\s+(\d+)/);
                if (match) {
                    const count = parseInt(match[3]);
                    totalStatements++;
                    if (count > 0) coveredStatements++;
                }
            });

            const percentage = totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0;

            return {
                line: percentage,
                branch: 0,
                function: 0,
                statement: percentage,
                uncoveredLines: [],
                uncoveredBranches: []
            };
        } catch (error) {
            return null;
        }
    }

    async getRustCoverage(file) {
        try {
            // Check if cargo-tarpaulin is available
            await execAsync('cargo tarpaulin --version');

            const projectDir = this.findCargoRoot(file);
            const result = await execAsync(`cargo tarpaulin --out Json --output-dir /tmp`, {
                cwd: projectDir,
                timeout: 60000
            });

            const coverageData = JSON.parse(await fs.promises.readFile('/tmp/tarpaulin-report.json', 'utf8'));

            return {
                line: coverageData.files[file]?.coverage || 0,
                branch: 0,
                function: 0,
                statement: coverageData.files[file]?.coverage || 0,
                uncoveredLines: [],
                uncoveredBranches: []
            };
        } catch (error) {
            return null;
        }
    }

    findProjectRoot(filePath) {
        const markers = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml'];
        let dir = path.dirname(path.resolve(filePath));

        for (let i = 0; i < 10; i++) {
            if (markers.some(marker => fs.existsSync(path.join(dir, marker)))) {
                return dir;
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }

        return process.cwd();
    }

    findCargoRoot(file) {
        let dir = path.dirname(file);
        for (let i = 0; i < 10; i++) {
            if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
                return dir;
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
        return path.dirname(file);
    }
}

/**
 * Main Test Coverage Validator
 */
class TestCoverageValidator {
    constructor(thresholds = DEFAULT_THRESHOLDS, options = {}) {
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
        this.verbose = options.verbose || false;
        this.configFile = options.configFile || null;
        this.parser = new CoverageParser();
        this.testResultsParser = new TestResultsParser();
        this.retriever = new FrameworkCoverageRetriever();
    }

    /**
     * Load configuration from file if specified
     */
    async loadConfig() {
        if (!this.configFile) return;

        try {
            const content = await fs.promises.readFile(this.configFile, 'utf8');
            const config = JSON.parse(content);

            if (config.thresholds) {
                this.thresholds = { ...this.thresholds, ...config.thresholds };
            }

            if (config.perFileThresholds) {
                this.perFileThresholds = config.perFileThresholds;
            }
        } catch (error) {
            Logger.warning(`Failed to load config file: ${error.message}`);
        }
    }

    /**
     * Get thresholds for specific file
     */
    getThresholdsForFile(file) {
        if (!this.perFileThresholds) return this.thresholds;

        const relativePath = path.relative(process.cwd(), file);

        for (const [pattern, thresholds] of Object.entries(this.perFileThresholds)) {
            const regex = new RegExp(pattern);
            if (regex.test(relativePath)) {
                return { ...this.thresholds, ...thresholds };
            }
        }

        return this.thresholds;
    }

    /**
     * NEW METHOD: Validate existing coverage data (for pipeline integration)
     * This method validates pre-existing coverage data without running tests
     *
     * @param {Object} coverage - Coverage data in format: { lines: { percentage }, branches: { percentage }, functions: { percentage }, statements: { percentage } }
     * @param {Object} thresholds - Optional thresholds override { line, branch, function, statement }
     * @returns {Object} Validation result with { valid, coverage, failures, recommendations }
     */
    async validateCoverageData(coverage, thresholds = null) {
        const effectiveThresholds = thresholds || this.thresholds;

        const result = {
            validator: 'test-coverage-validator',
            valid: true,
            coverage: null,
            thresholds: effectiveThresholds,
            failures: [],
            recommendations: []
        };

        if (!coverage) {
            result.valid = false;
            result.failures.push('No coverage data provided');
            result.recommendations.push({
                priority: 'high',
                message: 'Run tests with coverage enabled',
                action: 'Execute: npm test -- --coverage or vitest run --coverage'
            });
            return result;
        }

        // Normalize coverage format to internal format
        result.coverage = this.normalizeCoverageFormat(coverage);

        // Validate against thresholds
        this.validateThresholds(result);

        return result;
    }

    /**
     * Normalize coverage data from various formats to internal format
     * Supports: Jest/Vitest format ({ lines: { percentage }, ... }) and internal format ({ line, branch, ... })
     */
    normalizeCoverageFormat(coverage) {
        // Already in internal format (line, branch, function, statement)
        if (coverage.line !== undefined) {
            return coverage;
        }

        // Convert from Jest/Vitest format ({ lines: { percentage }, ... })
        return {
            line: coverage.lines?.percentage || 0,
            branch: coverage.branches?.percentage || 0,
            function: coverage.functions?.percentage || 0,
            statement: coverage.statements?.percentage || 0,
            uncoveredLines: coverage.uncoveredLines || [],
            uncoveredBranches: coverage.uncoveredBranches || []
        };
    }

    /**
     * Validate coverage for a file (full validation with test execution)
     */
    async validateCoverage(file) {
        const startTime = Date.now();

        const result = {
            validator: 'test-coverage-validator',
            file: path.basename(file),
            fullPath: path.resolve(file),
            valid: true,
            coverage: null,
            thresholds: this.getThresholdsForFile(file),
            failures: [],
            recommendations: [],
            executionTime: null,
            timestamp: new Date().toISOString()
        };

        try {
            await this.loadConfig();

            // Step 1: Try to find existing coverage data
            const coverageFile = await this.parser.findCoverageFile(file);

            if (coverageFile) {
                Logger.info('Found coverage file: ' + path.basename(coverageFile));
                result.coverage = await this.parser.parseCoverageFile(coverageFile, file);
            }

            // Step 2: If no coverage found, try to run tests
            if (!result.coverage) {
                Logger.info('No coverage file found, attempting to run tests...');
                result.coverage = await this.retriever.getCoverageForFile(file);
            }

            // Step 3: Validate coverage against thresholds
            if (!result.coverage) {
                result.valid = false;
                result.failures.push('No coverage data available for file');
                result.recommendations.push({
                    priority: 'high',
                    message: 'Run tests with coverage enabled',
                    action: 'Execute: npm test -- --coverage or vitest run --coverage'
                });
            } else {
                this.validateThresholds(result);
            }

            // Step 4: Parse test results if available
            const projectRoot = this.parser.findProjectRoot(file);
            const testResults = await this.testResultsParser.parseTestResults(projectRoot);

            if (testResults) {
                result.testResults = testResults;
            }

        } catch (error) {
            result.valid = false;
            result.failures.push(`Validation error: ${error.message}`);
            Logger.error(`Validation failed: ${error.message}`);
        }

        result.executionTime = `${Date.now() - startTime}ms`;
        return result;
    }

    /**
     * Validate coverage against thresholds
     */
    validateThresholds(result) {
        const { coverage, thresholds } = result;

        // Line coverage
        if (coverage.line < thresholds.line) {
            result.valid = false;
            result.failures.push(`Line coverage ${coverage.line}% < ${thresholds.line}%`);
            result.recommendations.push({
                priority: 'high',
                message: `Increase line coverage from ${coverage.line}% to ${thresholds.line}%`,
                action: this.generateLineRecommendation(coverage),
                gap: thresholds.line - coverage.line
            });
        }

        // Branch coverage
        if (coverage.branch < thresholds.branch) {
            result.valid = false;
            result.failures.push(`Branch coverage ${coverage.branch}% < ${thresholds.branch}%`);
            result.recommendations.push({
                priority: 'medium',
                message: `Increase branch coverage from ${coverage.branch}% to ${thresholds.branch}%`,
                action: this.generateBranchRecommendation(coverage),
                gap: thresholds.branch - coverage.branch
            });
        }

        // Function coverage
        if (coverage.function < thresholds.function) {
            result.valid = false;
            result.failures.push(`Function coverage ${coverage.function}% < ${thresholds.function}%`);
            result.recommendations.push({
                priority: 'medium',
                message: `Increase function coverage from ${coverage.function}% to ${thresholds.function}%`,
                action: 'Add tests for uncovered functions',
                gap: thresholds.function - coverage.function
            });
        }

        // Statement coverage
        if (coverage.statement < thresholds.statement) {
            result.valid = false;
            result.failures.push(`Statement coverage ${coverage.statement}% < ${thresholds.statement}%`);
            result.recommendations.push({
                priority: 'medium',
                message: `Increase statement coverage from ${coverage.statement}% to ${thresholds.statement}%`,
                action: 'Add tests for uncovered statements',
                gap: thresholds.statement - coverage.statement
            });
        }
    }

    /**
     * Generate line coverage recommendation
     */
    generateLineRecommendation(coverage) {
        if (coverage.uncoveredLines && coverage.uncoveredLines.length > 0) {
            const lines = coverage.uncoveredLines
                .slice(0, 5)
                .map(range => range.start === range.end ? `line ${range.start}` : `lines ${range.start}-${range.end}`)
                .join(', ');
            return `Add tests for uncovered ${lines}`;
        }
        return 'Add tests for uncovered lines';
    }

    /**
     * Generate branch coverage recommendation
     */
    generateBranchRecommendation(coverage) {
        if (coverage.uncoveredBranches && coverage.uncoveredBranches.length > 0) {
            const branches = coverage.uncoveredBranches
                .slice(0, 3)
                .map(branch => `${branch.type} at line ${branch.line}`)
                .join(', ');
            return `Add tests for uncovered branches: ${branches}`;
        }
        return 'Add tests for uncovered if/else and switch branches';
    }

    /**
     * Print validation results
     */
    printResults(result) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST COVERAGE VALIDATION REPORT');
        console.log('='.repeat(60));
        console.log(`File: ${result.file}`);
        console.log(`Status: ${result.valid ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`Execution Time: ${result.executionTime}`);

        if (result.coverage) {
            console.log('\n📈 COVERAGE METRICS:');
            console.log(`  Line:      ${this.formatCoverage(result.coverage.line, result.thresholds.line)}`);
            console.log(`  Branch:    ${this.formatCoverage(result.coverage.branch, result.thresholds.branch)}`);
            console.log(`  Function:  ${this.formatCoverage(result.coverage.function, result.thresholds.function)}`);
            console.log(`  Statement: ${this.formatCoverage(result.coverage.statement, result.thresholds.statement)}`);
        }

        if (result.testResults) {
            console.log('\n🧪 TEST RESULTS:');
            console.log(`  Total:   ${result.testResults.total}`);
            console.log(`  Passed:  ${result.testResults.passed}`);
            console.log(`  Failed:  ${result.testResults.failed}`);
            console.log(`  Skipped: ${result.testResults.skipped}`);
        }

        if (result.failures.length > 0) {
            console.log('\n❌ FAILURES:');
            result.failures.forEach(failure => {
                console.log(`  • ${failure}`);
            });
        }

        if (result.recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            result.recommendations.forEach((rec, i) => {
                console.log(`  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
                if (rec.action) {
                    console.log(`     Action: ${rec.action}`);
                }
                if (rec.gap) {
                    console.log(`     Gap: ${rec.gap.toFixed(1)}%`);
                }
            });
        }

        console.log('='.repeat(60));
    }

    /**
     * Format coverage percentage with color indication
     */
    formatCoverage(actual, threshold) {
        const status = actual >= threshold ? '✅' : '❌';
        return `${actual}% ${status} (threshold: ${threshold}%)`;
    }
}

/**
 * CLI Main
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
📊 TEST COVERAGE VALIDATOR HOOK - Priority 3

Validates test coverage thresholds for edited files
100% automation - quantitative metrics only

Usage:
  post-test-coverage.js <file> [options]

Options:
  --line <number>         Line coverage threshold (default: 80)
  --branch <number>       Branch coverage threshold (default: 75)
  --function <number>     Function coverage threshold (default: 80)
  --statement <number>    Statement coverage threshold (default: 80)
  --config <file>         Load thresholds from config file
  --json                  Output results as JSON
  --verbose               Verbose logging
  --help, -h              Show this help

Examples:
  post-test-coverage.js src/auth.js
  post-test-coverage.js src/auth.js --line 85 --branch 80
  post-test-coverage.js src/auth.js --json --verbose
  post-test-coverage.js src/auth.js --config coverage.config.json

Config File Format (coverage.config.json):
{
  "thresholds": {
    "line": 80,
    "branch": 75,
    "function": 80,
    "statement": 80
  },
  "perFileThresholds": {
    "src/critical/.*": { "line": 90, "branch": 85 },
    "src/experimental/.*": { "line": 60, "branch": 50 }
  }
}

Integration:
  Run after test execution (test-results.json exists)
  Supports Vitest, Jest, Pytest, Go, Rust
  Target execution time: <500ms
        `);
        return;
    }

    const file = args[0];

    if (!fs.existsSync(file)) {
        Logger.error(`File not found: ${file}`);
        process.exit(1);
    }

    // Parse options
    const options = {
        verbose: args.includes('--verbose'),
        json: args.includes('--json')
    };

    const thresholds = {};
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--line' && args[i + 1]) {
            thresholds.line = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === '--branch' && args[i + 1]) {
            thresholds.branch = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === '--function' && args[i + 1]) {
            thresholds.function = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === '--statement' && args[i + 1]) {
            thresholds.statement = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === '--config' && args[i + 1]) {
            options.configFile = args[i + 1];
            i++;
        }
    }

    // Validate file
    const validator = new TestCoverageValidator(thresholds, options);
    const result = await validator.validateCoverage(file);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        validator.printResults(result);
    }

    // CRITICAL: Always exit with code 0 - hooks should never block operations
    // Validation results are logged and stored, but don't prevent edits
    if (!result.valid) {
        console.log('\n⚠️ Coverage thresholds not met - see recommendations above');
        console.log('   Validation completed successfully (hooks are non-blocking)');
    }

    process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        Logger.error(`Validation error: ${error.message}`);
        if (process.argv.includes('--verbose')) {
            console.error(error.stack);
        }
        process.exit(0); // Non-blocking even on error
    });
}

export { TestCoverageValidator, CoverageParser, TestResultsParser, FrameworkCoverageRetriever };
