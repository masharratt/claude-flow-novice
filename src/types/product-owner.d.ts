declare module './product-owner/mvp-owner.js' {
    export function executeMVPOwnerDecision(
        consensusResult: any,
        primaryResponses: any[]
    ): Promise<{
        decision: 'PROCEED' | 'DEFER' | 'ESCALATE';
        backlogItems?: any[];
        blockers?: any[];
        reasoning?: string;
    }>;
}

declare module './product-owner/enterprise-owner-team.js' {
    export function executeEnterpriseBoardDecision(
        consensusResult: any,
        primaryResponses: any[]
    ): Promise<{
        decision: 'PROCEED' | 'DEFER' | 'ESCALATE';
        backlogItems?: any[];
        blockers?: any[];
        reasoning?: string;
    }>;
}