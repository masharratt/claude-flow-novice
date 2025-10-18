import crypto from 'crypto';
import Redis from 'ioredis';
import { SQLiteMemorySystem } from '../memory/sqlite-memory';
import { SkillInvocation } from './skill-types';

export class SkillInvocationLogger {
    private redis: Redis;
    private sqliteMemory: SQLiteMemorySystem;

    constructor(swarmId: string) {
        this.redis = new Redis(); // Default connection
        this.sqliteMemory = new SQLiteMemorySystem({
            swarmId,
            agentId: 'skill-logger',
            aclLevel: 4
        });
    }

    async logSkillInvocation(invocation: SkillInvocation): Promise<void> {
        const invocationId = this.generateInvocationId(invocation);

        // Calculate context reduction
        const contextReduction = this.calculateContextReduction(
            invocation.tokenCountBefore,
            invocation.tokenCountAfter
        );

        // Detect potential skill mismatch
        const mismatchFlag = this.detectSkillMismatch(
            invocation.userPrompt,
            invocation.selectedSkill
        );

        const logEntry = {
            invocation_id: invocationId,
            skill_name: invocation.skillName,
            user_prompt_hash: this.hashUserPrompt(invocation.userPrompt),
            selected_skill: invocation.selectedSkill,
            outcome: invocation.outcome,
            token_count_before: invocation.tokenCountBefore,
            token_count_after: invocation.tokenCountAfter,
            context_reduction_percentage: contextReduction,
            confidence_score: invocation.confidenceScore,
            mismatch_flag: mismatchFlag,
            epic_id: invocation.epicId,
            phase_id: invocation.phaseId,
            sprint_id: invocation.sprintId,
            swarm_id: invocation.swarmId,
            agent_id: invocation.agentId,
            provider: invocation.provider
        };

        // Store in SQLite
        await this.sqliteMemory.memoryAdapter.set(
            `skill_invocations:${invocationId}`,
            logEntry,
            { aclLevel: 4 }
        );

        // Publish to Redis for real-time notification
        await this.redis.publish(
            'swarm:analytics:skill-invoked',
            JSON.stringify(logEntry)
        );
    }

    private generateInvocationId(invocation: SkillInvocation): string {
        return crypto.randomBytes(16).toString('hex');
    }

    private hashUserPrompt(prompt: string): string {
        return crypto.createHash('sha256').update(prompt).digest('hex');
    }

    private calculateContextReduction(
        tokensBefore: number,
        tokensAfter: number
    ): number {
        return ((tokensBefore - tokensAfter) / tokensBefore) * 100;
    }

    private detectSkillMismatch(
        userPrompt: string,
        selectedSkill: string
    ): boolean {
        // Advanced matching logic
        const promptKeywords = userPrompt.toLowerCase().split(/\s+/);
        const skillKeywords = selectedSkill.toLowerCase().split(/\s+/);

        const keywordOverlap = promptKeywords.filter(word =>
            skillKeywords.includes(word)
        ).length;

        const overlapRatio = keywordOverlap / skillKeywords.length;

        return overlapRatio < 0.3; // Less than 30% keyword match
    }
}

// Example usage
export interface SkillInvocationTypes {
    skillName: string;
    userPrompt: string;
    selectedSkill: string;
    outcome: 'success' | 'failure' | 'partial';
    tokenCountBefore: number;
    tokenCountAfter: number;
    confidenceScore: number;
    epicId?: string;
    phaseId?: string;
    sprintId?: string;
    swarmId?: string;
    agentId?: string;
    provider?: string;
}