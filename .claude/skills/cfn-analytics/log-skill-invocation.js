#!/usr/bin/env node
const sqlite3 = require('sqlite3').verbose();
const redis = require('redis');
const crypto = require('crypto');
const path = require('path');

class SkillInvocationLogger {
    constructor(dbPath, redisConfig) {
        this.dbPath = dbPath || path.join(__dirname, '../../../.artifacts/analytics/skill-invocations.sqlite');
        this.redisClient = redis.createClient(redisConfig);
    }

    async initialize() {
        this.db = new sqlite3.Database(this.dbPath);
        return new Promise((resolve, reject) => {
            this.db.run(`
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA cache_size = -2000;
            `, (err) => {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    hashPrompt(prompt) {
        return crypto.createHash('sha256').update(prompt).digest('hex');
    }

    async logSkillInvocation(params) {
        const {
            skill_name,
            user_prompt,
            outcome,
            input_tokens,
            output_tokens,
            confidence_score,
            context_reduction_percentage
        } = params;

        const user_prompt_hash = this.hashPrompt(user_prompt);

        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO skill_invocations (
                    skill_name,
                    user_prompt_hash,
                    outcome,
                    input_tokens,
                    output_tokens,
                    confidence_score,
                    context_reduction_percentage
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    skill_name,
                    user_prompt_hash,
                    outcome,
                    input_tokens,
                    output_tokens,
                    confidence_score,
                    context_reduction_percentage
                ],
                (err) => {
                    if (err) reject(err);
                    else {
                        this.publishRedisNotification(skill_name, outcome);
                        resolve();
                    }
                }
            );
        });
    }

    publishRedisNotification(skill_name, outcome) {
        this.redisClient.publish(
            'swarm:analytics:skill-invoked',
            JSON.stringify({ skill_name, outcome, timestamp: new Date().toISOString() })
        );
    }

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else {
                    this.redisClient.quit();
                    resolve();
                }
            });
        });
    }

    static async run(params) {
        const logger = await new SkillInvocationLogger().initialize();
        try {
            await logger.logSkillInvocation(params);
            await logger.close();
        } catch (error) {
            console.error('Skill Invocation Logging Error:', error);
            await logger.close();
            process.exit(1);
        }
    }
}

// Allow direct script execution with params
if (require.main === module) {
    const params = {
        skill_name: process.argv[2],
        user_prompt: process.argv[3],
        outcome: process.argv[4],
        input_tokens: parseInt(process.argv[5], 10) || 0,
        output_tokens: parseInt(process.argv[6], 10) || 0,
        confidence_score: parseFloat(process.argv[7]) || 0.0,
        context_reduction_percentage: parseFloat(process.argv[8]) || 0.0
    };

    SkillInvocationLogger.run(params);
}

module.exports = SkillInvocationLogger;