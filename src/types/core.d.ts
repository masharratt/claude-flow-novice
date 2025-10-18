declare module '../core/logger.js' {
    export class Logger {
        constructor(config: any, options?: { component?: string });
        info(message: string, metadata?: any): void;
        warn(message: string, metadata?: any): void;
        error(message: string, metadata?: any): void;
    }
}

declare module '../memory/swarm-memory.js' {
    export class SwarmMemoryManager {
        // Add basic method definitions as needed
        constructor(config?: any);
    }
}

declare module '../coordination/confidence-score-system.js' {
    export class ConfidenceScoreSystem {
        constructor(memoryManager?: any);
        validateConfidenceGate(scores: any[], options: {
            threshold: number;
            requireUnanimous?: boolean;
        }): {
            passed: boolean;
            overallConfidence: number;
            lowConfidenceAgents: any[];
        };
    }
}

declare module '../coordination/iteration-tracker.js' {
    export class IterationTracker {
        constructor(config: any);
        initialize(): Promise<void>;
        incrementLoop2(): Promise<{ counter: number, max: number, remaining: number, escalate: boolean, status: string }>;
        incrementLoop3(): Promise<{ counter: number, max: number, remaining: number, escalate: boolean, status: string }>;
        resetLoop3(reason: string): Promise<void>;
        getState(): Promise<{ counters: { loop2: number, loop3: number } }>;
        getStatistics(): { current: any, totals: any };
    }
}