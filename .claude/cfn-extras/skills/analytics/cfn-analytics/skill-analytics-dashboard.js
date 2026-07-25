#!/usr/bin/env node
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

class SkillAnalyticsDashboard {
    constructor(dbPath, reportPath) {
        this.dbPath = dbPath || path.join(__dirname, '../../../.artifacts/analytics/skill-invocations.sqlite');
        this.reportPath = reportPath || path.join(__dirname, '../../../.artifacts/analytics/skill-invocation-report.json');
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    async generateSkillPerformanceReport() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    skill_name,
                    total_invocations,
                    successful_invocations,
                    ROUND(successful_invocations * 100.0 / total_invocations, 2) as success_rate,
                    ROUND(average_confidence, 2) as average_confidence
                FROM skill_accuracy_summary
                ORDER BY success_rate DESC
            `, async (err, rows) => {
                if (err) reject(err);

                const contextReductionReport = await this.getContextReductionAnalysis();
                const report = {
                    timestamp: new Date().toISOString(),
                    skill_performance: rows,
                    context_reduction: contextReductionReport,
                    recommendations: this.generateRecommendations(rows)
                };

                await this.writeReportToFile(report);
                resolve(report);
            });
        });
    }

    async getContextReductionAnalysis() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    skill_name,
                    ROUND(AVG(reduction_percentage), 2) as avg_reduction,
                    ROUND(MAX(reduction_percentage), 2) as max_reduction
                FROM context_reduction_metrics
                GROUP BY skill_name
                ORDER BY avg_reduction DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    generateRecommendations(performanceData) {
        const recommendations = [];
        performanceData.forEach(skill => {
            if (skill.success_rate < 70) {
                recommendations.push(`Low performance for ${skill.skill_name}: Consider skill refinement`);
            }
            if (skill.average_confidence < 0.7) {
                recommendations.push(`Low confidence for ${skill.skill_name}: Review skill implementation`);
            }
        });
        return recommendations;
    }

    async writeReportToFile(report) {
        await fs.mkdir(path.dirname(this.reportPath), { recursive: true });
        await fs.writeFile(this.reportPath, JSON.stringify(report, null, 2));
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
        const dashboard = await new SkillAnalyticsDashboard().connect();
        try {
            const report = await dashboard.generateSkillPerformanceReport();
            console.log('Skill Analytics Report Generated');
            await dashboard.close();
            return report;
        } catch (error) {
            console.error('Skill Analytics Dashboard Error:', error);
            await dashboard.close();
            process.exit(1);
        }
    }
}

// Allow direct script execution
if (require.main === module) {
    SkillAnalyticsDashboard.run();
}

module.exports = SkillAnalyticsDashboard;