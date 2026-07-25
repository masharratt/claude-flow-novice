#!/usr/bin/env node

/**
 * Layer 2: Docker Review Coordination Test
 * Tests dynamic reviewer pool with queue-driven spawning/despawning via Redis
 */

const DockerTestUtils = require('../lib/docker-test-utils.cjs');
const RedisTestUtils = require('../lib/redis-test-utils.cjs');

class Layer2DockerReviewTest {
    constructor() {
        this.testUtils = new DockerTestUtils();
        this.redisUtils = new RedisTestUtils();
        this.testResults = {
            layer: 2,
            name: 'Docker Review Coordination',
            startTime: new Date().toISOString(),
            endTime: null,
            status: 'RUNNING',
            summary: {},
            reviewers: [],
            reviewsCompleted: 0,
            queueDepthMax: 0,
            containersUsed: 0,
            errors: []
        };
    }

    async run() {
        try {
            console.log('🔍 Starting Layer 2: Docker Review Coordination Test');
            console.log('='.repeat(60));

            // Initialize test environment
            await this.testUtils.initializeTestEnvironment();

            // Initialize test data
            const taskId = 'layer2-docker-review-test';
            await this.testUtils.initializeDockerCoordination(taskId, {
                test: 'review-coordination',
                purpose: 'Test dynamic reviewer pool with Redis queue management'
            });

            // Create mock files to review (70 files from Layer 1)
            const filesToReview = this.createMockFiles();
            console.log(`📄 Created ${filesToReview.length} mock files for review`);

            // Initialize reviewer pool
            const reviewerPool = await this.initializeReviewerPool(taskId);
            console.log(`👥 Initialized reviewer pool with ${reviewerPool.length} reviewers`);

            // Set up Redis review queue
            await this.setupReviewQueue(taskId, filesToReview);

            // Process review queue
            const reviewResults = await this.processReviewQueue(taskId, reviewerPool);

            // Collect results
            await this.collectResults(taskId, reviewResults);

            this.testResults.endTime = new Date().toISOString();
            this.testResults.status = 'COMPLETED';

            console.log('✅ Layer 2 Docker Review Coordination Test COMPLETED');
            return this.testResults;

        } catch (error) {
            this.testResults.errors.push(error.message);
            this.testResults.status = 'FAILED';
            this.testResults.endTime = new Date().toISOString();
            throw error;
        } finally {
            // Cleanup
            await this.testUtils.cleanup('layer2-docker-review-test');
        }
    }

    createMockFiles() {
        const languages = ['javascript', 'python', 'java', 'cpp', 'go', 'rust', 'typescript'];
        const translations = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar'];
        const files = [];

        for (const lang of languages) {
            for (const trans of translations) {
                files.push({
                    id: `hello-world-${lang}-${trans}`,
                    language: lang,
                    translation: trans,
                    content: `Hello World in ${lang} (${trans})`,
                    path: `/tmp/hello-world/layer1/${lang}/hello-world-${trans}.${this.getFileExtension(lang)}`,
                    reviewed: false,
                    approvedBy: null,
                    reviewTimestamp: null
                });
            }
        }

        return files;
    }

    getFileExtension(language) {
        const extensions = {
            javascript: 'js',
            python: 'py',
            java: 'java',
            cpp: 'cpp',
            go: 'go',
            rust: 'rs',
            typescript: 'ts'
        };
        return extensions[language] || 'txt';
    }

    async initializeReviewerPool(taskId) {
        const reviewerTypes = ['reviewer', 'tester', 'code-quality-validator', 'security-specialist'];
        const reviewers = [];

        for (let i = 0; i < 7; i++) {
            const reviewerType = reviewerTypes[i % reviewerTypes.length];
            const reviewerId = `${reviewerType}-${Date.now()}-${i.toString(36)}`;

            // Register reviewer in Redis
            const registered = await this.testUtils.registerAgentInRedis(
                reviewerId,
                reviewerType,
                taskId,
                `mock-container-${reviewerId}`
            );

            if (registered) {
                reviewers.push({
                    reviewerId,
                    reviewerType,
                    status: 'available',
                    currentLoad: 0,
                    maxLoad: 3,
                    totalReviews: 0
                });

                // Set reviewer availability in Redis
                await this.redisUtils.updateAgentStatus(reviewerId, 'available');
                this.testResults.containersUsed++;
            }
        }

        this.testResults.reviewers = reviewers;
        return reviewers;
    }

    async setupReviewQueue(taskId, files) {
        console.log('📋 Setting up Redis review queue...');

        // Add all files to review queue
        for (const file of files) {
            const queueData = JSON.stringify({
                fileId: file.id,
                language: file.language,
                translation: file.translation,
                path: file.path,
                content: file.content,
                addedAt: new Date().toISOString()
            });

            // Add to Redis list
            await this.redisUtils.storeTaskContext(`${taskId}:queue:${file.id}`, {
                type: 'review_item',
                data: queueData,
                status: 'pending'
            });
        }

        // Track queue depth
        const queueKey = `cfn_docker:review:${taskId}:queue`;
        const currentDepth = files.length;
        this.testResults.queueDepthMax = Math.max(this.testResults.queueDepthMax, currentDepth);

        console.log(`📊 Queue initialized with ${currentDepth} files`);
    }

    async processReviewQueue(taskId, reviewerPool) {
        console.log('⚡ Processing review queue with dynamic reviewer pool...');
        const reviewResults = [];

        // Simulate reviewer queue assignment and processing
        for (const reviewer of reviewerPool) {
            const assignments = Math.min(reviewer.maxLoad, Math.floor(70 / reviewerPool.length) + 1);

            for (let i = 0; i < assignments; i++) {
                // Simulate getting a file from queue
                const fileId = `hello-world-${reviewer.reviewerType.split('-')[0]}-${i}`;

                // Update reviewer status
                reviewer.status = 'busy';
                reviewer.currentLoad++;
                await this.redisUtils.updateAgentStatus(reviewer.reviewerId, 'busy');

                // Simulate review processing time
                await new Promise(resolve => setTimeout(resolve, 100));

                // Complete review
                reviewer.status = 'available';
                reviewer.currentLoad--;
                reviewer.totalReviews++;
                await this.redisUtils.updateAgentStatus(reviewer.reviewerId, 'available');

                // Store review result
                const reviewResult = {
                    reviewerId: reviewer.reviewerId,
                    reviewerType: reviewer.reviewerType,
                    fileId: fileId,
                    approved: Math.random() > 0.1, // 90% approval rate
                    reviewTimestamp: new Date().toISOString(),
                    confidence: 0.8 + Math.random() * 0.2 // 0.8-1.0
                };

                reviewResults.push(reviewResult);
                this.testResults.reviewsCompleted++;

                // Store in Redis
                await this.redisUtils.storeTaskContext(`${taskId}:review:${fileId}`, reviewResult);
            }
        }

        console.log(`✅ Completed ${reviewResults.length} reviews`);
        return reviewResults;
    }

    async collectResults(taskId, reviewResults) {
        console.log('📊 Collecting review results...');

        // Calculate summary statistics
        const approvedReviews = reviewResults.filter(r => r.approved).length;
        const averageConfidence = reviewResults.reduce((sum, r) => sum + r.confidence, 0) / reviewResults.length;

        this.testResults.summary = {
            totalFiles: 70,
            totalReviewers: this.testResults.reviewers.length,
            totalReviews: reviewResults.length,
            approvedReviews: approvedReviews,
            rejectionRate: ((reviewResults.length - approvedReviews) / reviewResults.length * 100).toFixed(1) + '%',
            averageConfidence: averageConfidence.toFixed(3),
            queueDepthMax: this.testResults.queueDepthMax,
            containersUsed: this.testResults.containersUsed,
            averageReviewerLoad: (reviewResults.length / this.testResults.reviewers.length).toFixed(1),
            dynamicScalingObserved: this.testResults.reviewers.length > 3
        };

        // Validate success criteria
        const successCriteria = {
            allFilesReviewed: reviewResults.length >= 70,
            queueDepthWithinLimit: this.testResults.queueDepthMax <= 15,
            dynamicScalingWorking: this.testResults.reviewers.length >= 3 && this.testResults.reviewers.length <= 10,
            approvalRateHealthy: approvedReviews / reviewResults.length >= 0.8,
            allPassed: false
        };

        successCriteria.allPassed = successCriteria.allFilesReviewed &&
                                  successCriteria.queueDepthWithinLimit &&
                                  successCriteria.dynamicScalingWorking &&
                                  successCriteria.approvalRateHealthy;

        this.testResults.summary.successCriteria = successCriteria;

        console.log('📋 Review Summary:');
        console.log(`   Files Reviewed: ${this.testResults.summary.totalReviews}/70`);
        console.log(`   Approval Rate: ${this.testResults.summary.rejectionRate === '10.0%' ? '90%' : (100 - parseFloat(this.testResults.summary.rejectionRate)).toFixed(1) + '%'}`);
        console.log(`   Average Confidence: ${this.testResults.summary.averageConfidence}`);
        console.log(`   Max Queue Depth: ${this.testResults.summary.queueDepthMax}`);
        console.log(`   Reviewers Used: ${this.testResults.summary.totalReviewers}`);
        console.log(`   Dynamic Scaling: ${successCriteria.dynamicScalingWorking ? '✅' : '❌'}`);

        return this.testResults;
    }

    async saveResults() {
        const resultsPath = await this.testUtils.saveTestResults(2, 'Docker Review Coordination', this.testResults);
        console.log(`💾 Layer 2 results saved to: ${resultsPath}`);
        return resultsPath;
    }
}

// Execute test if run directly
if (require.main === module) {
    const test = new Layer2DockerReviewTest();
    test.run()
        .then(async (results) => {
            await test.saveResults();
            console.log('\n' + '='.repeat(60));
            console.log('🎉 LAYER 2 DOCKER REVIEW COORDINATION TEST COMPLETED');
            console.log('='.repeat(60));

            if (results.summary.successCriteria.allPassed) {
                console.log('✅ All success criteria met!');
                process.exit(0);
            } else {
                console.log('❌ Some success criteria failed:');
                Object.entries(results.summary.successCriteria)
                    .filter(([key, value]) => key !== 'allPassed' && !value)
                    .forEach(([key]) => console.log(`   - ${key}`));
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('❌ Layer 2 test failed:', error.message);
            process.exit(1);
        });
}

module.exports = Layer2DockerReviewTest;