#!/usr/bin/env node

/**
 * Verification Runner - Executes comprehensive Raft consensus verification
 * Coordinates all validation tests and generates detailed reports
 */

import ConsensusVerifier from './consensus-verifier.js';
import { execSync } from 'child_process';
import path from 'path';

class VerificationRunner {
    constructor() {
        this.verifier = null;
        this.startTime = Date.now();
        this.results = {};
    }

    async run() {
        console.log('🚀 Starting Raft Consensus Verification Suite...');
        console.log('=' .repeat(60));

        try {
            // Step 1: Initialize hooks and environment
            await this.initializeEnvironment();

            // Step 2: Create and initialize consensus verifier
            this.verifier = new ConsensusVerifier({
                nodeId: `runner-${Date.now()}`,
                clusterSize: 5,
                outputDir: path.join(process.cwd(), 'docs', 'consensus')
            });

            await this.verifier.initialize();

            // Step 3: Execute comprehensive verification
            console.log('\n🔍 Running comprehensive verification suite...');
            this.results = await this.verifier.runComprehensiveVerification();

            // Step 4: Display results
            this.displayResults();

            // Step 5: Execute post-verification hooks
            await this.executePostVerificationHooks();

            console.log('\n✅ Verification suite completed successfully!');
            console.log(`Total runtime: ${Date.now() - this.startTime}ms`);

            return this.results;

        } catch (error) {
            console.error('❌ Verification failed:', error.message);
            throw error;
        } finally {
            if (this.verifier) {
                await this.verifier.destroy();
            }
        }
    }

    async initializeEnvironment() {
        console.log('🔧 Initializing verification environment...');

        // Execute pre-task hooks
        try {
            const hookResult = execSync(
                'npx claude-flow@alpha hooks pre-task --description "comprehensive-raft-verification"',
                { encoding: 'utf8', timeout: 10000 }
            );
            console.log('✅ Pre-task hooks executed:', hookResult.trim());
        } catch (error) {
            console.warn('⚠️ Pre-task hooks failed:', error.message);
        }

        // Initialize MCP coordination
        try {
            const mcpInit = execSync(
                'npx claude-flow@alpha hooks session-restore --session-id "raft-consensus-verification"',
                { encoding: 'utf8', timeout: 10000 }
            );
            console.log('✅ MCP session initialized');
        } catch (error) {
            console.warn('⚠️ MCP session initialization failed:', error.message);
        }
    }

    displayResults() {
        const { summary, results } = this.results;

        console.log('\n📊 VERIFICATION RESULTS SUMMARY');
        console.log('=' .repeat(60));
        console.log(`Overall Status: ${this.getStatusIcon(summary.overallStatus)} ${summary.overallStatus}`);
        console.log(`Success Rate: ${summary.successRate}%`);
        console.log(`Tests Passed: ${summary.passedTests}/${summary.totalTests}`);

        console.log('\n📋 DETAILED TEST RESULTS:');
        console.log('-'.repeat(60));

        results.forEach(result => {
            const icon = result.status === 'fulfilled' ? '✅' : '❌';
            console.log(`${icon} ${result.test.toUpperCase()}: ${result.status.toUpperCase()}`);

            if (result.data && typeof result.data === 'object') {
                if (result.data.details && Array.isArray(result.data.details)) {
                    result.data.details.forEach(detail => {
                        const detailIcon = detail.status === 'fulfilled' ? '  ✓' : '  ✗';
                        console.log(`${detailIcon} ${detail.test || detail.metric}: ${detail.status || 'unknown'}`);
                    });
                }
            }
        });

        if (summary.recommendations.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            console.log('-'.repeat(60));
            summary.recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec}`);
            });
        }
    }

    getStatusIcon(status) {
        const icons = {
            'EXCELLENT': '🎉',
            'PASSED': '✅',
            'PARTIAL': '⚠️',
            'FAILED': '❌'
        };
        return icons[status] || '❓';
    }

    async executePostVerificationHooks() {
        console.log('\n🔄 Executing post-verification hooks...');

        try {
            // Store verification results in memory
            const memoryKey = `raft-verification-${Date.now()}`;
            const memoryValue = JSON.stringify({
                summary: this.results.summary,
                timestamp: new Date().toISOString(),
                nodeId: this.verifier.nodeId
            });

            execSync(
                `npx claude-flow@alpha hooks post-edit --file "verification-results.json" --memory-key "${memoryKey}"`,
                { encoding: 'utf8', timeout: 10000 }
            );

            // Notify completion
            execSync(
                `npx claude-flow@alpha hooks notify --message "Raft consensus verification completed with ${this.results.summary.overallStatus} status"`,
                { encoding: 'utf8', timeout: 10000 }
            );

            // End session
            execSync(
                'npx claude-flow@alpha hooks session-end --export-metrics true',
                { encoding: 'utf8', timeout: 10000 }
            );

            console.log('✅ Post-verification hooks completed');

        } catch (error) {
            console.warn('⚠️ Post-verification hooks failed:', error.message);
        }
    }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new VerificationRunner();

    runner.run()
        .then(results => {
            const exitCode = results.summary.overallStatus === 'FAILED' ? 1 : 0;
            process.exit(exitCode);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

export default VerificationRunner;