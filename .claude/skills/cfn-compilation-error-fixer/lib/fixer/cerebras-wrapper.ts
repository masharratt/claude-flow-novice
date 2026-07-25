/**
 * Cerebras SDK Wrapper with Fallback Support
 *
 * This module provides a unified interface for the Cerebras SDK
 * that works even when the SDK is not installed.
 */

let cerebrasSDK: any = null;
let fallbackMode = false;

// Try to import the Cerebras SDK
try {
    const sdk = await import('@cerebras/cerebras_cloud_sdk');
    cerebrasSDK = sdk.default;
    console.log('✅ Cerebras SDK loaded successfully');
} catch (error) {
    if (process.env.CFN_ALLOW_FALLBACK !== 'true') {
        console.error('❌ Cerebras SDK not found and fallback mode disabled');
        console.error('   Install with: npm install @cerebras/cerebras_cloud_sdk');
        console.error('   Or enable fallback mode: CFN_ALLOW_FALLBACK=true');
        process.exit(1);
    }
    console.warn('⚠️  Cerebras SDK not found, using fallback mode');
    console.warn('   To enable LLM fixes, install: npm install @cerebras/cerebras_cloud_sdk');
    fallbackMode = true;
}

/**
 * Create a Cerebras client or return a fallback
 */
export function createClient(apiKey?: string) {
    if (fallbackMode) {
        return {
            chat: {
                completions: {
                    create: async (params: any) => {
                        console.warn('⚠️  Fallback mode: No LLM processing available');
                        return {
                            choices: [{
                                message: {
                                    content: '// Fallback: Manual intervention required\n' +
                                           '// Unable to process with LLM in fallback mode\n' +
                                           '// Please install @cerebras/cerebras_cloud_sdk for automated fixes'
                                }
                            }]
                        };
                    }
                }
            }
        };
    }

    if (!cerebrasSDK) {
        throw new Error('Cerebras SDK not available');
    }

    // Return actual Cerebras client
    return new cerebrasSDK({
        apiKey: apiKey || process.env.CEREBRAS_API_KEY
    });
}

/**
 * Check if we're in fallback mode
 */
export function isFallbackMode(): boolean {
    return fallbackMode;
}

/**
 * Get SDK status
 */
export function getSDKStatus(): {
    available: boolean;
    mode: 'full' | 'fallback';
    message: string;
} {
    if (fallbackMode) {
        return {
            available: false,
            mode: 'fallback',
            message: 'Cerebras SDK not installed - fallback mode active'
        };
    }

    return {
        available: true,
        mode: 'full',
        message: 'Cerebras SDK available - full LLM processing enabled'
    };
}

export default createClient;