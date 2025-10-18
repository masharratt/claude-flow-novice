declare module './modes/index.js' {
    export function selectMode(config: {
        mode?: string;
        filename?: string;
        metadata?: any;
        auto?: boolean;
    }): {
        mode: {
            name: string;
            maxLoop2Iterations: number;
            maxLoop3Iterations: number;
            gateThreshold: number;
            consensusThreshold: number;
            validatorCount: number;
        };
    };
}

declare module './modes/types.js' {
    export type CFNLoopModeName = 'mvp' | 'standard' | 'enterprise';

    export interface CFNLoopMode {
        name: CFNLoopModeName;
        maxLoop2Iterations: number;
        maxLoop3Iterations: number;
        gateThreshold: number;
        consensusThreshold: number;
        validatorCount: number;
    }
}