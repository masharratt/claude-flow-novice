import { CognitiveReflection } from './ace-reflector.js';
import { DualWriteManager } from '../memory/dual-write-pattern.js';

export interface ContextMergeStrategy {
  merge(contexts: Record<string, any>[]): Record<string, any>;
  prioritize(contexts: CognitiveReflection[]): CognitiveReflection;
}

export class ACECurator {
  private dualWriteManager: DualWriteManager;

  constructor(
    redisConfig: Record<string, any> = {},
    sqlitePath: string = './ace-curation.sqlite'
  ) {
    this.dualWriteManager = new DualWriteManager(
      redisConfig,
      sqlitePath
    );
  }

  async mergeContexts(
    contexts: Record<string, any>[],
    strategy: ContextMergeStrategy = new DefaultMergeStrategy()
  ): Promise<Record<string, any>> {
    const mergedContext = strategy.merge(contexts);

    // Store merged context
    await this.dualWriteManager.write(
      `merged-context-${Date.now()}`,
      mergedContext
    );

    return mergedContext;
  }

  async prioritizeReflections(
    reflections: CognitiveReflection[],
    strategy: ContextMergeStrategy = new DefaultMergeStrategy()
  ): Promise<CognitiveReflection> {
    const prioritizedReflection = strategy.prioritize(reflections);

    // Store prioritized reflection
    await this.dualWriteManager.write(
      `prioritized-reflection-${prioritizedReflection.id}`,
      prioritizedReflection
    );

    return prioritizedReflection;
  }
}

class DefaultMergeStrategy implements ContextMergeStrategy {
  merge(contexts: Record<string, any>[]): Record<string, any> {
    // Recursive deep merge with priority and deduplication
    return contexts.reduce((merged, context) => {
      return this.deepMerge(merged, context);
    }, {});
  }

  prioritize(reflections: CognitiveReflection[]): CognitiveReflection {
    // Prioritize based on complexity, recency, and insights
    return reflections.reduce((priority, reflection) => {
      // Recency: Higher score for more recent (lower age)
      // Invert the age calculation so recent = higher score
      const ageInSeconds = (Date.now() - reflection.timestamp) / 1000;
      const recencyScore = Math.max(0, 1000000 - ageInSeconds) / 1000000;

      const priorityScore = (
        reflection.complexity * 0.5 +
        recencyScore * 0.3 +
        reflection.insights.length * 0.2
      );

      const currentPriorityScore = priority ? (
        (() => {
          const currentAgeInSeconds = (Date.now() - priority.timestamp) / 1000;
          const currentRecencyScore = Math.max(0, 1000000 - currentAgeInSeconds) / 1000000;
          return (
            priority.complexity * 0.5 +
            currentRecencyScore * 0.3 +
            priority.insights.length * 0.2
          );
        })()
      ) : -1;

      return priorityScore > currentPriorityScore ? reflection : priority;
    }, null as CognitiveReflection | null)!;
  }

  private deepMerge(
    target: Record<string, any>,
    source: Record<string, any>
  ): Record<string, any> {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (
          source[key] instanceof Object &&
          !(source[key] instanceof Array)
        ) {
          target[key] = this.deepMerge(
            target[key] || {},
            source[key]
          );
        } else {
          target[key] = source[key];
        }
      }
    }
    return target;
  }
}

export default ACECurator;