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

declare module '../coordination/feedback-injection-system.js' {
    export class FeedbackInjectionSystem {
        constructor(config: any);
    }
}

declare module '../coordination/circuit-breaker.js' {
    export class CFNCircuitBreaker extends EventEmitter {
        constructor(id: string, config: any);
        execute<T>(fn: () => Promise<T>): Promise<T>;
    }
}

declare module '../coordination/byzantine-consensus-adapter.js' {
    export class ByzantineConsensusAdapter extends EventEmitter {
        constructor(config: any, memoryManager?: any);
        executeConsensus(validatorResponses: any[]): Promise<any>;
    }
}