import { ACEReflector, CognitiveReflection } from './ace-reflector.js';
import { ACECurator } from './ace-curator.js';

export interface ContextGenerationOptions {
  maxComplexity?: number;
  allowAdaptation?: boolean;
  fallbackStrategy?: (context: any) => any;
}

export class ACEGenerator {
  private reflector: ACEReflector;
  private curator: ACECurator;

  constructor() {
    this.reflector = new ACEReflector();
    this.curator = new ACECurator();
  }

  async generateContext(
    baseContext: Record<string, any>,
    options: ContextGenerationOptions = {}
  ): Promise<Record<string, any>> {
    // Validate baseContext is not null or undefined
    if (baseContext === null || baseContext === undefined) {
      throw new Error('baseContext cannot be null or undefined');
    }

    const {
      maxComplexity = 5,
      allowAdaptation = true,
      fallbackStrategy = this.defaultFallbackStrategy
    } = options;

    try {
      // Initial reflection
      const reflection = await this.reflector.reflect(
        baseContext,
        { complexity: this.calculateComplexity(baseContext) }
      );

      // Check complexity
      if (reflection.complexity > maxComplexity) {
        if (!allowAdaptation) {
          return fallbackStrategy(baseContext);
        }
      }

      // Context adaptation
      const adaptedContext = await this.adaptContext(reflection);

      return adaptedContext;
    } catch (error) {
      console.error('Context generation failed:', error);
      return fallbackStrategy(baseContext);
    }
  }

  private calculateComplexity(
    context: Record<string, any>
  ): number {
    const keyCount = Object.keys(context).length;
    const contentLength = JSON.stringify(context).length;
    return Math.log(keyCount * contentLength) / Math.log(10);
  }

  private async adaptContext(
    reflection: CognitiveReflection
  ): Promise<Record<string, any>> {
    // Advanced context adaptation
    const contexts = [
      reflection.context,
      // Optional: fetch previous similar contexts
      await this.fetchSimilarContexts(reflection)
    ].filter(Boolean);

    return this.curator.mergeContexts(contexts);
  }

  private async fetchSimilarContexts(
    reflection: CognitiveReflection
  ): Promise<Record<string, any>[]> {
    // Placeholder for advanced context similarity search
    // In production, implement semantic similarity algorithm
    return [];
  }

  private defaultFallbackStrategy(
    context: Record<string, any>
  ): Record<string, any> {
    return {
      ...context,
      adaptationWarning: 'Context generation limited'
    };
  }
}

export default ACEGenerator;