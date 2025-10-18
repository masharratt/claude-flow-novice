declare module './consensus/mvp-consensus.js' {
    export function executeMVPConsensus(
        primaryResponses: any[],
        consensusThreshold: number
    ): Promise<{
        consensusScore: number;
        consensusThreshold: number;
        consensusPassed: boolean;
        validatorResults: any[];
        votingBreakdown: Record<string, number>;
        iteration: number;
        timestamp: number;
    }>;
}

declare module './consensus/enterprise-planning-consensus.js' {
    export function executePlanningConsensus(
        primaryResponses: any[],
        config: any
    ): Promise<{
        consensusScore: number;
        consensusThreshold: number;
        consensusPassed: boolean;
        validatorResults: any[];
        votingBreakdown: Record<string, number>;
        iteration: number;
        timestamp: number;
    }>;
}

declare module './consensus/types.js' {
    export interface PlanningConsensusResult {
        consensusScore: number;
        consensusThreshold: number;
        consensusPassed: boolean;
        validatorResults: any[];
        votingBreakdown: Record<string, number>;
        iteration: number;
        timestamp: number;
    }
}