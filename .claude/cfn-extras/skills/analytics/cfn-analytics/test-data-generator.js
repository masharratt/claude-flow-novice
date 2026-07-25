#!/usr/bin/env node
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

class SkillTestDataGenerator {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '../../../.artifacts/analytics/skill-invocations.sqlite');
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    generateRandomSkillData(count = 10) {
        const skillNames = [
            'code-generation',
            'code-review',
            'test-writing',
            'refactoring',
            'design-analysis',
            'security-check',
            'performance-optimization'
        ];
        const outcomes = ['success', 'partial', 'failure'];

        const skillData = [];
        for (let i = 0; i < count; i++) {
            const skill_name = skillNames[Math.floor(Math.random() * skillNames.length)];
            const user_prompt = crypto.randomBytes(20).toString('hex');
            const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
            const input_tokens = Math.floor(Math.random() * 1000);
            const output_tokens = Math.floor(Math.random() * 500);
            const confidence_score = Math.random();
            const context_reduction_percentage = Math.random() * 100;

            skillData.push([
                skill_name,
                crypto.createHash('sha256').update(user_prompt).digest('hex'),
                outcome,
                input_tokens,
                output_tokens,
                confidence_score,
                context_reduction_percentage
            ]);
        }

        return skillData;
    }

    async insertTestData() {
        const testData = this.generateRandomSkillData();

        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO skill_invocations (
                    skill_name,
                    user_prompt_hash,
                    outcome,
                    input_tokens,
                    output_tokens,
                    confidence_score,
                    context_reduction_percentage
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            this.db.serialize(() => {
                testData.forEach(data => {
                    stmt.run(data, (err) => {
                        if (err) console.error('Insertion error:', err);
                    });
                });

                stmt.finalize((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    static async run() {
        const generator = await new SkillTestDataGenerator().connect();
        try {
            await generator.insertTestData();
            console.log('Test data generated successfully');
            await generator.close();
        } catch (error) {
            console.error('Test Data Generation Error:', error);
            await generator.close();
            process.exit(1);
        }
    }
}

// Allow direct script execution
if (require.main === module) {
    SkillTestDataGenerator.run();
}

module.exports = SkillTestDataGenerator;