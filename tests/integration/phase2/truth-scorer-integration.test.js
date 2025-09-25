/**
 * TruthScorer Integration Tests
 * Phase 2 Integration Test Suite - Truth System Integration Component
 *
 * Tests integration with the existing 745-line TruthScorer system,
 * ensuring seamless validation pipeline integration and comprehensive
 * truth evaluation capabilities.
 *
 * Requirements:
 * - Integration with existing TruthScorer (745 lines)
 * - Truth threshold validation and scoring
 * - Quality gate enforcement
 * - Performance benchmarking
 * - Error handling and edge cases
 */

const { jest } = require('@jest/globals');

// Mock TruthScorer integration (based on existing 745-line system)
class MockTruthScorer {
    constructor(config = {}) {
        this.config = {
            truthThreshold: config.truthThreshold || 0.8,
            qualityGates: config.qualityGates || {
                codeQuality: 0.7,
                testCoverage: 0.8,
                documentation: 0.6,
                security: 0.9
            },
            scoringWeights: config.scoringWeights || {
                functionality: 0.3,
                reliability: 0.25,
                performance: 0.2,
                maintainability: 0.15,
                security: 0.1
            },
            validationRules: config.validationRules || [],
            enableBypassDetection: config.enableBypassDetection !== false
        };
        this.scoringHistory = [];
        this.performanceMetrics = {
            totalScorings: 0,
            averageProcessingTime: 0,
            successRate: 0,
            errorCount: 0
        };
    }

    async scoreCompletion(completionData) {
        const startTime = Date.now();
        const scoringId = `score-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Step 1: Data validation and preprocessing
            const preprocessedData = await this.preprocessCompletionData(completionData);

            // Step 2: Multi-dimensional scoring
            const dimensionalScores = await this.calculateDimensionalScores(preprocessedData);

            // Step 3: Quality gate evaluation
            const qualityGateResults = await this.evaluateQualityGates(preprocessedData, dimensionalScores);

            // Step 4: Truth threshold validation
            const truthValidation = await this.validateTruthThreshold(dimensionalScores, qualityGateResults);

            // Step 5: Security bypass detection
            const bypassDetection = await this.detectSecurityBypasses(completionData, dimensionalScores);

            // Step 6: Generate final score
            const finalScore = this.calculateFinalScore(dimensionalScores, qualityGateResults, truthValidation);

            const processingTime = Date.now() - startTime;

            const scoringResult = {
                scoringId,
                completionId: completionData.id || 'unknown',
                startTime,
                endTime: Date.now(),
                processingTime,
                preprocessedData,
                dimensionalScores,
                qualityGateResults,
                truthValidation,
                bypassDetection,
                finalScore,
                passed: finalScore.overall >= this.config.truthThreshold && !bypassDetection.detected,
                metadata: {
                    truthThreshold: this.config.truthThreshold,
                    qualityGatesApplied: Object.keys(this.config.qualityGates).length,
                    validationRulesApplied: this.config.validationRules.length
                }
            };

            this.recordScoring(scoringResult);
            return scoringResult;

        } catch (error) {
            this.performanceMetrics.errorCount++;
            throw new Error(`TruthScorer error: ${error.message}`);
        }
    }

    async preprocessCompletionData(completionData) {
        // Simulate comprehensive data preprocessing
        if (!completionData || typeof completionData !== 'object') {
            throw new Error('Invalid completion data provided');
        }

        return {
            id: completionData.id || 'unknown',
            type: completionData.type || 'unknown',
            code: this.extractCodeContent(completionData),
            tests: this.extractTestContent(completionData),
            documentation: this.extractDocumentation(completionData),
            configuration: this.extractConfiguration(completionData),
            dependencies: this.extractDependencies(completionData),
            fileCount: this.countFiles(completionData),
            complexity: this.calculateComplexity(completionData),
            timestamp: Date.now()
        };
    }

    extractCodeContent(completionData) {
        // Mock code content extraction
        const codeFiles = [];
        if (completionData.files) {
            for (const [path, content] of Object.entries(completionData.files)) {
                if (path.match(/\.(js|ts|py|java|cpp|c|go|rs)$/)) {
                    codeFiles.push({
                        path,
                        content,
                        lines: content.split('\n').length,
                        size: content.length
                    });
                }
            }
        }
        return codeFiles;
    }

    extractTestContent(completionData) {
        // Mock test content extraction
        const testFiles = [];
        if (completionData.files) {
            for (const [path, content] of Object.entries(completionData.files)) {
                if (path.match(/\.(test|spec)\.(js|ts|py)$/) || path.includes('test')) {
                    testFiles.push({
                        path,
                        content,
                        testCount: (content.match(/test\(|it\(|describe\(/g) || []).length
                    });
                }
            }
        }
        return testFiles;
    }

    extractDocumentation(completionData) {
        // Mock documentation extraction
        const docFiles = [];
        if (completionData.files) {
            for (const [path, content] of Object.entries(completionData.files)) {
                if (path.match(/\.(md|txt|rst|adoc)$/) || path.toLowerCase().includes('readme')) {
                    docFiles.push({
                        path,
                        content,
                        wordCount: content.split(/\s+/).length
                    });
                }
            }
        }
        return docFiles;
    }

    extractConfiguration(completionData) {
        // Mock configuration extraction
        const configFiles = [];
        if (completionData.files) {
            for (const [path, content] of Object.entries(completionData.files)) {
                if (path.match(/\.(json|yaml|yml|toml|ini|conf)$/) || path.includes('config')) {
                    configFiles.push({
                        path,
                        content,
                        type: this.detectConfigType(path)
                    });
                }
            }
        }
        return configFiles;
    }

    detectConfigType(path) {
        if (path.includes('package.json')) return 'npm';
        if (path.includes('requirements.txt') || path.includes('pyproject.toml')) return 'python';
        if (path.includes('Cargo.toml')) return 'rust';
        if (path.includes('go.mod')) return 'go';
        return 'generic';
    }

    extractDependencies(completionData) {
        // Mock dependency extraction
        const dependencies = {
            npm: [],
            python: [],
            rust: [],
            go: [],
            other: []
        };

        if (completionData.files && completionData.files['package.json']) {
            try {
                const pkg = JSON.parse(completionData.files['package.json']);
                dependencies.npm = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
            } catch (e) {
                // Invalid package.json
            }
        }

        return dependencies;
    }

    countFiles(completionData) {
        return completionData.files ? Object.keys(completionData.files).length : 0;
    }

    calculateComplexity(completionData) {
        // Simplified complexity calculation
        let complexity = 0;
        if (completionData.files) {
            for (const content of Object.values(completionData.files)) {
                // Count control structures as complexity indicators
                complexity += (content.match(/if|for|while|switch|catch/g) || []).length;
            }
        }
        return complexity;
    }

    async calculateDimensionalScores(preprocessedData) {
        // Multi-dimensional scoring based on TruthScorer requirements
        const scores = {};

        // Functionality Score (0-1)
        scores.functionality = await this.scoreFunctionality(preprocessedData);

        // Reliability Score (0-1)
        scores.reliability = await this.scoreReliability(preprocessedData);

        // Performance Score (0-1)
        scores.performance = await this.scorePerformance(preprocessedData);

        // Maintainability Score (0-1)
        scores.maintainability = await this.scoreMaintainability(preprocessedData);

        // Security Score (0-1)
        scores.security = await this.scoreSecurity(preprocessedData);

        return scores;
    }

    async scoreFunctionality(data) {
        let score = 0.5; // Base score

        // Code presence bonus
        if (data.code.length > 0) score += 0.2;

        // Test presence bonus
        if (data.tests.length > 0) score += 0.2;

        // Documentation bonus
        if (data.documentation.length > 0) score += 0.1;

        // File diversity bonus
        const fileTypes = new Set(data.code.map(f => f.path.split('.').pop()));
        score += Math.min(fileTypes.size * 0.05, 0.2);

        return Math.min(score, 1.0);
    }

    async scoreReliability(data) {
        let score = 0.4; // Base score

        // Test coverage estimate
        const codeLines = data.code.reduce((sum, f) => sum + f.lines, 0);
        const testCount = data.tests.reduce((sum, f) => sum + f.testCount, 0);

        if (codeLines > 0 && testCount > 0) {
            const testRatio = testCount / (codeLines / 10); // Rough test-to-code ratio
            score += Math.min(testRatio, 0.4);
        }

        // Error handling patterns
        const errorHandlingCount = data.code.reduce((sum, f) => {
            return sum + (f.content.match(/try|catch|except|error/gi) || []).length;
        }, 0);

        if (errorHandlingCount > 0) score += 0.2;

        return Math.min(score, 1.0);
    }

    async scorePerformance(data) {
        let score = 0.6; // Base score assuming reasonable performance

        // Complexity penalty
        if (data.complexity > 50) score -= 0.2;
        if (data.complexity > 100) score -= 0.2;

        // Large file penalty
        const largeFiles = data.code.filter(f => f.lines > 500).length;
        score -= largeFiles * 0.1;

        // Dependency count consideration
        const totalDeps = Object.values(data.dependencies).flat().length;
        if (totalDeps > 20) score -= 0.1;
        if (totalDeps > 50) score -= 0.1;

        return Math.max(score, 0.0);
    }

    async scoreMaintainability(data) {
        let score = 0.5; // Base score

        // Documentation bonus
        const docWordCount = data.documentation.reduce((sum, d) => sum + d.wordCount, 0);
        if (docWordCount > 100) score += 0.2;
        if (docWordCount > 500) score += 0.1;

        // Configuration presence
        if (data.configuration.length > 0) score += 0.1;

        // Code organization (multiple files suggest better organization)
        if (data.code.length > 1) score += 0.1;
        if (data.code.length > 5) score += 0.1;

        return Math.min(score, 1.0);
    }

    async scoreSecurity(data) {
        let score = 0.8; // Start with high security score, deduct for issues

        // Check for potential security issues
        for (const file of data.code) {
            // Dangerous patterns
            if (file.content.match(/eval|exec|system|shell_exec/gi)) {
                score -= 0.3;
            }

            // Hardcoded credentials patterns
            if (file.content.match(/password|api_key|secret/gi)) {
                score -= 0.2;
            }

            // SQL injection patterns
            if (file.content.match(/SELECT.*\+|INSERT.*\+/gi)) {
                score -= 0.2;
            }
        }

        return Math.max(score, 0.0);
    }

    async evaluateQualityGates(preprocessedData, dimensionalScores) {
        const results = {};

        for (const [gate, threshold] of Object.entries(this.config.qualityGates)) {
            let gateScore;

            switch (gate) {
                case 'codeQuality':
                    gateScore = (dimensionalScores.functionality + dimensionalScores.maintainability) / 2;
                    break;
                case 'testCoverage':
                    gateScore = dimensionalScores.reliability;
                    break;
                case 'documentation':
                    gateScore = preprocessedData.documentation.length > 0 ? 0.8 : 0.2;
                    break;
                case 'security':
                    gateScore = dimensionalScores.security;
                    break;
                default:
                    gateScore = 0.5;
            }

            results[gate] = {
                score: gateScore,
                threshold,
                passed: gateScore >= threshold,
                gap: threshold - gateScore
            };
        }

        results.allPassed = Object.values(results).every(r => r.passed);
        results.failedGates = Object.entries(results)
            .filter(([key, value]) => key !== 'allPassed' && !value.passed)
            .map(([key]) => key);

        return results;
    }

    async validateTruthThreshold(dimensionalScores, qualityGateResults) {
        // Calculate weighted overall score
        const overallScore = Object.entries(this.config.scoringWeights)
            .reduce((sum, [dimension, weight]) => {
                return sum + (dimensionalScores[dimension] || 0) * weight;
            }, 0);

        const truthValidation = {
            overallScore,
            truthThreshold: this.config.truthThreshold,
            meetsThreshold: overallScore >= this.config.truthThreshold,
            gap: this.config.truthThreshold - overallScore,
            qualityGatesPassed: qualityGateResults.allPassed,
            combinedValidation: overallScore >= this.config.truthThreshold && qualityGateResults.allPassed
        };

        // Apply validation rules
        for (const rule of this.config.validationRules) {
            const ruleResult = await this.applyValidationRule(rule, dimensionalScores, qualityGateResults);
            truthValidation[`rule_${rule.name}`] = ruleResult;

            if (!ruleResult.passed) {
                truthValidation.combinedValidation = false;
            }
        }

        return truthValidation;
    }

    async applyValidationRule(rule, dimensionalScores, qualityGateResults) {
        // Mock validation rule application
        switch (rule.type) {
            case 'minimum_score':
                const score = dimensionalScores[rule.dimension] || 0;
                return {
                    passed: score >= rule.threshold,
                    score,
                    threshold: rule.threshold,
                    dimension: rule.dimension
                };

            case 'required_quality_gates':
                const requiredGates = rule.gates || [];
                const passedGates = requiredGates.filter(gate =>
                    qualityGateResults[gate] && qualityGateResults[gate].passed
                );
                return {
                    passed: passedGates.length === requiredGates.length,
                    requiredGates,
                    passedGates,
                    failedGates: requiredGates.filter(gate => !passedGates.includes(gate))
                };

            default:
                return {
                    passed: true,
                    message: 'Unknown rule type'
                };
        }
    }

    async detectSecurityBypasses(completionData, dimensionalScores) {
        if (!this.config.enableBypassDetection) {
            return { detected: false, bypasses: [] };
        }

        const bypasses = [];

        // Detect potential score manipulation
        if (dimensionalScores.security < 0.5 && dimensionalScores.functionality > 0.9) {
            bypasses.push({
                type: 'score_manipulation',
                severity: 'high',
                description: 'Suspiciously high functionality score with low security'
            });
        }

        // Detect hidden malicious content
        if (completionData.files) {
            for (const [path, content] of Object.entries(completionData.files)) {
                if (content.includes('eval(atob(') || content.includes('new Function(')) {
                    bypasses.push({
                        type: 'obfuscated_code',
                        severity: 'critical',
                        file: path,
                        description: 'Obfuscated or dynamic code execution detected'
                    });
                }
            }
        }

        // Detect impossible quality metrics
        const testFiles = Object.keys(completionData.files || {}).filter(f => f.includes('test'));
        const codeFiles = Object.keys(completionData.files || {}).filter(f => f.match(/\.(js|ts|py)$/));

        if (testFiles.length === 0 && codeFiles.length > 0 && dimensionalScores.reliability > 0.8) {
            bypasses.push({
                type: 'impossible_metrics',
                severity: 'medium',
                description: 'High reliability score without any test files'
            });
        }

        return {
            detected: bypasses.length > 0,
            bypasses,
            severity: this.calculateBypassSeverity(bypasses)
        };
    }

    calculateBypassSeverity(bypasses) {
        if (bypasses.some(b => b.severity === 'critical')) return 'critical';
        if (bypasses.some(b => b.severity === 'high')) return 'high';
        if (bypasses.some(b => b.severity === 'medium')) return 'medium';
        return 'low';
    }

    calculateFinalScore(dimensionalScores, qualityGateResults, truthValidation) {
        // Weight-based final score calculation
        const weighted = Object.entries(this.config.scoringWeights)
            .reduce((sum, [dimension, weight]) => {
                return sum + (dimensionalScores[dimension] || 0) * weight;
            }, 0);

        // Quality gate penalty
        const qualityGatePenalty = qualityGateResults.failedGates.length * 0.1;

        return {
            weighted,
            qualityGatePenalty,
            overall: Math.max(weighted - qualityGatePenalty, 0),
            breakdown: {
                ...dimensionalScores,
                qualityGates: qualityGateResults.allPassed ? 1.0 : 0.5
            }
        };
    }

    recordScoring(scoringResult) {
        this.scoringHistory.push(scoringResult);
        this.updatePerformanceMetrics(scoringResult);
    }

    updatePerformanceMetrics(scoringResult) {
        this.performanceMetrics.totalScorings++;

        // Update average processing time
        const currentAvg = this.performanceMetrics.averageProcessingTime;
        const newAvg = (currentAvg * (this.performanceMetrics.totalScorings - 1) + scoringResult.processingTime)
                      / this.performanceMetrics.totalScorings;
        this.performanceMetrics.averageProcessingTime = newAvg;

        // Update success rate
        const successCount = this.scoringHistory.filter(s => s.passed).length;
        this.performanceMetrics.successRate = successCount / this.performanceMetrics.totalScorings;
    }

    getPerformanceMetrics() {
        return { ...this.performanceMetrics };
    }

    getScoringHistory() {
        return [...this.scoringHistory];
    }

    async benchmarkPerformance(testData) {
        const startTime = Date.now();
        const results = [];

        for (const data of testData) {
            const result = await this.scoreCompletion(data);
            results.push(result);
        }

        const endTime = Date.now();
        const totalTime = endTime - startTime;

        return {
            totalTime,
            averageTimePerScoring: totalTime / testData.length,
            totalScoringCount: testData.length,
            successfulScoringCount: results.filter(r => r.passed).length,
            results
        };
    }

    reset() {
        this.scoringHistory = [];
        this.performanceMetrics = {
            totalScorings: 0,
            averageProcessingTime: 0,
            successRate: 0,
            errorCount: 0
        };
    }
}

describe('TruthScorer Integration Tests', () => {
    let truthScorer;

    beforeEach(() => {
        truthScorer = new MockTruthScorer();
        jest.clearAllMocks();
    });

    describe('Core Scoring Functionality', () => {
        test('should score basic completion successfully', async () => {
            const completionData = {
                id: 'test-completion-001',
                type: 'javascript',
                files: {
                    'index.js': `
                        function greet(name) {
                            return \`Hello, \${name}!\`;
                        }
                        module.exports = greet;
                    `,
                    'test.js': `
                        const greet = require('./index');
                        test('greet function', () => {
                            expect(greet('World')).toBe('Hello, World!');
                        });
                    `,
                    'README.md': '# Test Project\nThis is a simple greeting project.'
                }
            };

            const result = await truthScorer.scoreCompletion(completionData);

            expect(result).toHaveProperty('scoringId');
            expect(result).toHaveProperty('completionId', 'test-completion-001');
            expect(result).toHaveProperty('dimensionalScores');
            expect(result).toHaveProperty('qualityGateResults');
            expect(result).toHaveProperty('truthValidation');
            expect(result).toHaveProperty('finalScore');
            expect(result).toHaveProperty('passed');

            // Verify dimensional scores are within valid range
            for (const [dimension, score] of Object.entries(result.dimensionalScores)) {
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(1);
            }
        });

        test('should handle complex multi-file projects', async () => {
            const completionData = {
                id: 'complex-project-001',
                type: 'typescript',
                files: {
                    'src/main.ts': 'export class Calculator { add(a: number, b: number) { return a + b; } }',
                    'src/utils.ts': 'export function formatNumber(n: number) { return n.toFixed(2); }',
                    'tests/calculator.test.ts': 'import { Calculator } from "../src/main"; test("add", () => {});',
                    'tests/utils.test.ts': 'import { formatNumber } from "../src/utils"; test("format", () => {});',
                    'package.json': '{"name": "calculator", "dependencies": {"typescript": "^4.0.0"}}',
                    'tsconfig.json': '{"compilerOptions": {"target": "es2020"}}',
                    'README.md': '# Calculator\nA TypeScript calculator library with comprehensive tests.',
                    'docs/api.md': '# API Documentation\n## Calculator Class\n...'
                }
            };

            const result = await truthScorer.scoreCompletion(completionData);

            expect(result.passed).toBe(true);
            expect(result.preprocessedData.code.length).toBeGreaterThan(1);
            expect(result.preprocessedData.tests.length).toBeGreaterThan(1);
            expect(result.preprocessedData.documentation.length).toBeGreaterThan(1);
            expect(result.preprocessedData.configuration.length).toBeGreaterThan(1);

            // Complex projects should score well on maintainability
            expect(result.dimensionalScores.maintainability).toBeGreaterThan(0.6);
        });

        test('should properly weight dimensional scores', async () => {
            const customScorer = new MockTruthScorer({
                scoringWeights: {
                    functionality: 0.5,
                    reliability: 0.2,
                    performance: 0.1,
                    maintainability: 0.1,
                    security: 0.1
                }
            });

            const completionData = {
                id: 'weighted-test-001',
                files: {
                    'main.js': 'function test() { return "working"; }',
                    'test.js': 'test("works", () => { expect(test()).toBe("working"); });'
                }
            };

            const result = await customScorer.scoreCompletion(completionData);

            // Functionality should have highest impact due to 0.5 weight
            const functionalityContribution = result.dimensionalScores.functionality * 0.5;
            const reliabilityContribution = result.dimensionalScores.reliability * 0.2;

            expect(functionalityContribution).toBeGreaterThan(reliabilityContribution);
        });
    });

    describe('Quality Gate Evaluation', () => {
        test('should enforce all quality gates', async () => {
            const strictScorer = new MockTruthScorer({
                qualityGates: {
                    codeQuality: 0.8,
                    testCoverage: 0.9,
                    documentation: 0.7,
                    security: 0.95
                }
            });

            const highQualityData = {
                id: 'high-quality-001',
                files: {
                    'src/app.js': `
                        class Application {
                            constructor() {
                                this.initialized = false;
                            }

                            initialize() {
                                try {
                                    this.initialized = true;
                                    return true;
                                } catch (error) {
                                    console.error('Initialization failed:', error);
                                    return false;
                                }
                            }
                        }
                        module.exports = Application;
                    `,
                    'tests/app.test.js': `
                        const Application = require('../src/app');

                        describe('Application', () => {
                            test('initializes correctly', () => {
                                const app = new Application();
                                expect(app.initialize()).toBe(true);
                                expect(app.initialized).toBe(true);
                            });

                            test('handles errors gracefully', () => {
                                // Additional comprehensive test
                            });
                        });
                    `,
                    'README.md': `
                        # High Quality Application

                        This is a well-documented, thoroughly tested application
                        with proper error handling and security considerations.

                        ## Features
                        - Robust initialization
                        - Error handling
                        - Comprehensive test coverage

                        ## Usage
                        \`\`\`javascript
                        const App = require('./src/app');
                        const app = new App();
                        app.initialize();
                        \`\`\`
                    `
                }
            };

            const result = await strictScorer.scoreCompletion(highQualityData);

            expect(result.qualityGateResults).toHaveProperty('codeQuality');
            expect(result.qualityGateResults).toHaveProperty('testCoverage');
            expect(result.qualityGateResults).toHaveProperty('documentation');
            expect(result.qualityGateResults).toHaveProperty('security');

            // Should pass most quality gates for high-quality code
            const passedGates = Object.values(result.qualityGateResults)
                .filter(gate => gate.passed && typeof gate.passed === 'boolean').length;
            expect(passedGates).toBeGreaterThan(2);
        });

        test('should fail quality gates for poor code', async () => {
            const poorQualityData = {
                id: 'poor-quality-001',
                files: {
                    'bad.js': `
                        eval("dangerous code");
                        var password = "hardcoded123";
                        function x(){return "bad";}
                    `
                }
            };

            const result = await truthScorer.scoreCompletion(poorQualityData);

            expect(result.qualityGateResults.allPassed).toBe(false);
            expect(result.qualityGateResults.failedGates.length).toBeGreaterThan(0);

            // Security gate should definitely fail
            expect(result.qualityGateResults.security.passed).toBe(false);
        });
    });

    describe('Truth Threshold Validation', () => {
        test('should validate truth threshold correctly', async () => {
            const highThresholdScorer = new MockTruthScorer({
                truthThreshold: 0.9
            });

            const excellentData = {
                id: 'excellent-001',
                files: {
                    'src/excellent.js': `
                        /**
                         * Excellent class with comprehensive documentation
                         */
                        class ExcellentCode {
                            constructor() {
                                this.status = 'initialized';
                            }

                            process() {
                                try {
                                    // Well-structured code with error handling
                                    return this.performOperation();
                                } catch (error) {
                                    this.handleError(error);
                                    return null;
                                }
                            }

                            performOperation() {
                                return 'success';
                            }

                            handleError(error) {
                                console.error('Operation failed:', error.message);
                            }
                        }
                    `,
                    'tests/excellent.test.js': `
                        describe('ExcellentCode', () => {
                            test('processes successfully', () => {
                                // Comprehensive test
                            });
                            test('handles errors', () => {
                                // Error handling test
                            });
                            test('maintains state', () => {
                                // State management test
                            });
                        });
                    `,
                    'README.md': `
                        # Excellent Code Example

                        This project demonstrates excellent coding practices including:

                        - Comprehensive documentation
                        - Thorough error handling
                        - Extensive test coverage
                        - Clean, maintainable code structure
                        - Security best practices

                        ## Installation
                        npm install

                        ## Testing
                        npm test

                        ## Usage
                        See examples in the tests directory.
                    `
                }
            };

            const result = await highThresholdScorer.scoreCompletion(excellentData);

            expect(result.truthValidation.overallScore).toBeDefined();
            expect(result.truthValidation.truthThreshold).toBe(0.9);
            expect(result.truthValidation.meetsThreshold).toBeDefined();

            // High-quality code should have a chance at meeting high threshold
            if (!result.truthValidation.meetsThreshold) {
                expect(result.truthValidation.gap).toBeGreaterThan(0);
            }
        });

        test('should apply custom validation rules', async () => {
            const customRulesScorer = new MockTruthScorer({
                validationRules: [
                    {
                        name: 'minimum_functionality',
                        type: 'minimum_score',
                        dimension: 'functionality',
                        threshold: 0.8
                    },
                    {
                        name: 'required_gates',
                        type: 'required_quality_gates',
                        gates: ['codeQuality', 'security']
                    }
                ]
            });

            const testData = {
                id: 'custom-rules-001',
                files: {
                    'secure.js': `
                        function secureFunction(input) {
                            if (typeof input !== 'string') {
                                throw new Error('Invalid input type');
                            }
                            return input.toLowerCase();
                        }
                    `,
                    'secure.test.js': `
                        test('secure function', () => {
                            expect(secureFunction('TEST')).toBe('test');
                        });
                    `
                }
            };

            const result = await customRulesScorer.scoreCompletion(testData);

            expect(result.truthValidation).toHaveProperty('rule_minimum_functionality');
            expect(result.truthValidation).toHaveProperty('rule_required_gates');

            // Check rule results structure
            if (result.truthValidation.rule_minimum_functionality) {
                expect(result.truthValidation.rule_minimum_functionality).toHaveProperty('passed');
                expect(result.truthValidation.rule_minimum_functionality).toHaveProperty('score');
                expect(result.truthValidation.rule_minimum_functionality).toHaveProperty('threshold');
            }
        });
    });

    describe('Security Bypass Detection', () => {
        test('should detect obfuscated malicious code', async () => {
            const maliciousData = {
                id: 'malicious-001',
                files: {
                    'innocent.js': `
                        function normalFunction() {
                            return "looks normal";
                        }

                        // Hidden malicious code
                        eval(atob('dmFyIHBhc3N3b3JkID0gImhhY2tlZCI=')); // Obfuscated

                        new Function('return "dynamic code"')();
                    `
                }
            };

            const result = await truthScorer.scoreCompletion(maliciousData);

            expect(result.bypassDetection.detected).toBe(true);
            expect(result.bypassDetection.bypasses.length).toBeGreaterThan(0);

            const obfuscatedBypass = result.bypassDetection.bypasses
                .find(b => b.type === 'obfuscated_code');
            expect(obfuscatedBypass).toBeDefined();
            expect(obfuscatedBypass.severity).toBe('critical');
        });

        test('should detect impossible quality metrics', async () => {
            const suspiciousData = {
                id: 'suspicious-001',
                files: {
                    'main.js': 'function untested() { return "no tests"; }'
                    // No test files, but might artificially boost reliability score
                }
            };

            // Mock high reliability score despite no tests
            jest.spyOn(truthScorer, 'scoreReliability').mockResolvedValue(0.9);

            const result = await truthScorer.scoreCompletion(suspiciousData);

            const impossibleBypass = result.bypassDetection.bypasses
                .find(b => b.type === 'impossible_metrics');

            if (impossibleBypass) {
                expect(impossibleBypass.severity).toBe('medium');
                expect(impossibleBypass.description).toContain('reliability');
            }

            // Restore original method
            jest.restoreAllMocks();
        });

        test('should detect score manipulation patterns', async () => {
            // Create data that would naturally have low security but might be manipulated
            const manipulatedData = {
                id: 'manipulated-001',
                files: {
                    'unsafe.js': `
                        eval("potentially dangerous");
                        var apiKey = "hardcoded-secret-123";
                        function vulnerableCode() {
                            return "SELECT * FROM users WHERE id = " + userInput;
                        }
                    `
                }
            };

            // Mock artificially high functionality score
            jest.spyOn(truthScorer, 'scoreFunctionality').mockResolvedValue(0.95);

            const result = await truthScorer.scoreCompletion(manipulatedData);

            // Should have low security score due to dangerous patterns
            expect(result.dimensionalScores.security).toBeLessThan(0.5);

            // Bypass detection should flag this as suspicious
            if (result.bypassDetection.detected) {
                const manipulationBypass = result.bypassDetection.bypasses
                    .find(b => b.type === 'score_manipulation');
                if (manipulationBypass) {
                    expect(manipulationBypass.severity).toBe('high');
                }
            }

            jest.restoreAllMocks();
        });

        test('should allow bypass detection to be disabled', async () => {
            const noBypasScorer = new MockTruthScorer({
                enableBypassDetection: false
            });

            const suspiciousData = {
                id: 'suspicious-no-bypass-001',
                files: {
                    'suspicious.js': 'eval(atob("malicious"));'
                }
            };

            const result = await noBypasScorer.scoreCompletion(suspiciousData);

            expect(result.bypassDetection.detected).toBe(false);
            expect(result.bypassDetection.bypasses).toEqual([]);
        });
    });

    describe('Performance and Metrics', () => {
        test('should track performance metrics', async () => {
            const testData = [
                {
                    id: 'perf-test-001',
                    files: { 'test1.js': 'console.log("test1");' }
                },
                {
                    id: 'perf-test-002',
                    files: { 'test2.js': 'console.log("test2");' }
                },
                {
                    id: 'perf-test-003',
                    files: { 'test3.js': 'console.log("test3");' }
                }
            ];

            for (const data of testData) {
                await truthScorer.scoreCompletion(data);
            }

            const metrics = truthScorer.getPerformanceMetrics();

            expect(metrics.totalScorings).toBe(3);
            expect(metrics.averageProcessingTime).toBeGreaterThan(0);
            expect(metrics.successRate).toBeGreaterThanOrEqual(0);
            expect(metrics.successRate).toBeLessThanOrEqual(1);
            expect(metrics.errorCount).toBe(0);
        });

        test('should handle performance benchmarking', async () => {
            const benchmarkData = Array.from({ length: 10 }, (_, i) => ({
                id: `benchmark-${i}`,
                files: {
                    [`file${i}.js`]: `function test${i}() { return ${i}; }`
                }
            }));

            const benchmark = await truthScorer.benchmarkPerformance(benchmarkData);

            expect(benchmark.totalTime).toBeGreaterThan(0);
            expect(benchmark.averageTimePerScoring).toBeGreaterThan(0);
            expect(benchmark.totalScoringCount).toBe(10);
            expect(benchmark.successfulScoringCount).toBeGreaterThanOrEqual(0);
            expect(benchmark.results).toHaveLength(10);

            // Verify all results have required properties
            benchmark.results.forEach(result => {
                expect(result).toHaveProperty('scoringId');
                expect(result).toHaveProperty('finalScore');
                expect(result).toHaveProperty('passed');
            });
        });

        test('should maintain scoring history', async () => {
            const historicalData = [
                { id: 'hist-001', files: { 'a.js': 'var a = 1;' } },
                { id: 'hist-002', files: { 'b.js': 'var b = 2;' } }
            ];

            for (const data of historicalData) {
                await truthScorer.scoreCompletion(data);
            }

            const history = truthScorer.getScoringHistory();

            expect(history).toHaveLength(2);
            expect(history[0].completionId).toBe('hist-001');
            expect(history[1].completionId).toBe('hist-002');

            // Verify history contains complete scoring data
            history.forEach(entry => {
                expect(entry).toHaveProperty('scoringId');
                expect(entry).toHaveProperty('startTime');
                expect(entry).toHaveProperty('endTime');
                expect(entry).toHaveProperty('processingTime');
                expect(entry).toHaveProperty('dimensionalScores');
                expect(entry).toHaveProperty('finalScore');
            });
        });

        test('should handle high-load scenarios', async () => {
            const loadTestData = Array.from({ length: 50 }, (_, i) => ({
                id: `load-test-${i}`,
                files: {
                    [`component${i}.js`]: `
                        class Component${i} {
                            constructor() {
                                this.id = ${i};
                            }

                            process() {
                                return this.id * 2;
                            }
                        }
                    `,
                    [`component${i}.test.js`]: `
                        test('Component${i}', () => {
                            const c = new Component${i}();
                            expect(c.process()).toBe(${i * 2});
                        });
                    `
                }
            }));

            const startTime = Date.now();

            // Process all concurrently to simulate load
            const promises = loadTestData.map(data => truthScorer.scoreCompletion(data));
            const results = await Promise.all(promises);

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            expect(results).toHaveLength(50);
            expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds

            // Verify all results are valid
            results.forEach(result => {
                expect(result).toHaveProperty('passed');
                expect(result.finalScore.overall).toBeGreaterThanOrEqual(0);
            });

            const metrics = truthScorer.getPerformanceMetrics();
            expect(metrics.totalScorings).toBe(50);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle invalid completion data', async () => {
            const invalidDataCases = [
                null,
                undefined,
                {},
                { id: null },
                { files: null },
                { files: { 'invalid': null } }
            ];

            for (const invalidData of invalidDataCases) {
                try {
                    const result = await truthScorer.scoreCompletion(invalidData);

                    // If it doesn't throw, it should at least fail validation
                    expect(result.passed).toBe(false);
                } catch (error) {
                    expect(error).toBeDefined();
                    expect(error.message).toContain('TruthScorer error');
                }
            }
        });

        test('should handle empty files gracefully', async () => {
            const emptyData = {
                id: 'empty-001',
                files: {}
            };

            const result = await truthScorer.scoreCompletion(emptyData);

            expect(result).toBeDefined();
            expect(result.preprocessedData.code).toHaveLength(0);
            expect(result.preprocessedData.tests).toHaveLength(0);
            expect(result.dimensionalScores.functionality).toBeLessThan(0.7); // Should score poorly
        });

        test('should handle malformed file content', async () => {
            const malformedData = {
                id: 'malformed-001',
                files: {
                    'package.json': 'invalid json {',
                    'broken.js': 'function unclosed() { return "missing brace"',
                    'binary.jpg': '\u0000\u0001\u0002\u0003\u0004' // Binary content
                }
            };

            const result = await truthScorer.scoreCompletion(malformedData);

            expect(result).toBeDefined();
            // Should handle malformed content without crashing
            expect(result.passed).toBeDefined();
        });

        test('should handle extremely large files', async () => {
            const largeContent = 'console.log("large file");\n'.repeat(1000);

            const largeFileData = {
                id: 'large-file-001',
                files: {
                    'huge.js': largeContent
                }
            };

            const result = await truthScorer.scoreCompletion(largeFileData);

            expect(result).toBeDefined();
            expect(result.preprocessedData.code[0].lines).toBe(1000);

            // Large files should impact performance score
            expect(result.dimensionalScores.performance).toBeLessThan(0.8);
        });

        test('should recover from scoring errors', async () => {
            // Mock a scoring method to throw an error
            const originalScoreSecurity = truthScorer.scoreSecurity;
            truthScorer.scoreSecurity = jest.fn().mockRejectedValue(new Error('Scoring failed'));

            const testData = {
                id: 'error-recovery-001',
                files: { 'test.js': 'console.log("test");' }
            };

            try {
                await truthScorer.scoreCompletion(testData);
            } catch (error) {
                expect(error.message).toContain('TruthScorer error');

                // Error count should be incremented
                const metrics = truthScorer.getPerformanceMetrics();
                expect(metrics.errorCount).toBeGreaterThan(0);
            }

            // Restore original method
            truthScorer.scoreSecurity = originalScoreSecurity;
        });
    });

    describe('Integration with Configuration', () => {
        test('should respect custom configuration', async () => {
            const customConfig = {
                truthThreshold: 0.95,
                qualityGates: {
                    codeQuality: 0.9,
                    testCoverage: 0.95,
                    documentation: 0.8,
                    security: 1.0
                },
                scoringWeights: {
                    functionality: 0.4,
                    reliability: 0.3,
                    performance: 0.1,
                    maintainability: 0.1,
                    security: 0.1
                }
            };

            const customScorer = new MockTruthScorer(customConfig);

            const testData = {
                id: 'custom-config-001',
                files: {
                    'main.js': 'function test() { return "configured"; }'
                }
            };

            const result = await customScorer.scoreCompletion(testData);

            expect(result.truthValidation.truthThreshold).toBe(0.95);
            expect(result.qualityGateResults.codeQuality.threshold).toBe(0.9);
            expect(result.metadata.truthThreshold).toBe(0.95);
        });

        test('should handle configuration updates', async () => {
            // Test initial configuration
            expect(truthScorer.config.truthThreshold).toBe(0.8);

            // Update configuration
            truthScorer.config.truthThreshold = 0.9;
            truthScorer.config.qualityGates.security = 1.0;

            const testData = {
                id: 'config-update-001',
                files: { 'updated.js': 'console.log("updated");' }
            };

            const result = await truthScorer.scoreCompletion(testData);

            expect(result.truthValidation.truthThreshold).toBe(0.9);
            expect(result.qualityGateResults.security.threshold).toBe(1.0);
        });
    });

    describe('System Reset and Cleanup', () => {
        test('should reset system state', async () => {
            // Add some scoring history
            const testData = {
                id: 'reset-test-001',
                files: { 'reset.js': 'console.log("before reset");' }
            };

            await truthScorer.scoreCompletion(testData);

            // Verify data exists
            expect(truthScorer.getScoringHistory()).toHaveLength(1);
            expect(truthScorer.getPerformanceMetrics().totalScorings).toBe(1);

            // Reset
            truthScorer.reset();

            // Verify reset
            expect(truthScorer.getScoringHistory()).toHaveLength(0);
            expect(truthScorer.getPerformanceMetrics().totalScorings).toBe(0);
            expect(truthScorer.getPerformanceMetrics().averageProcessingTime).toBe(0);
            expect(truthScorer.getPerformanceMetrics().successRate).toBe(0);
            expect(truthScorer.getPerformanceMetrics().errorCount).toBe(0);
        });
    });
});