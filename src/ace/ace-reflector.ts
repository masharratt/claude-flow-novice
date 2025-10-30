import { SQLiteMemorySystem } from '../memory/sqlite-memory-system.js';
import { MemoryAdapter, AccessLevel } from '../memory/memory-adapter.js';

export interface CognitiveReflection {
  id: string;
  timestamp: number;
  complexity: number;
  context: Record<string, any>;
  insights: string[];
}

export class ACEReflector {
  private memorySystem: SQLiteMemorySystem;
  private memoryAdapter: MemoryAdapter;

  constructor(
    memoryPath: string = './ace-reflections.sqlite'
  ) {
    this.memorySystem = new SQLiteMemorySystem(memoryPath);
    this.memoryAdapter = new MemoryAdapter(AccessLevel.SYSTEM);
  }

  async initialize(): Promise<void> {
    await this.memorySystem.initialize();

    // Note: Production schema is managed by .claude/skills/cfn-ace-system/schema/001-create-context-reflections.sql
    // This initialization ensures compatibility with the production schema
  }

  async reflect(
    context: Record<string, any>,
    options: {
      complexity?: number
    } = {}
  ): Promise<CognitiveReflection> {
    const reflection: CognitiveReflection = {
      id: `ref-${Date.now()}`,
      timestamp: Date.now(),
      complexity: options.complexity ?? this.calculateComplexity(context),
      context,
      insights: this.generateInsights(context)
    };

    await this.memorySystem.store(
      `reflection:${reflection.id}`,
      reflection,
      AccessLevel.SYSTEM
    );

    // Insert reflection data into SQL table (production schema)
    await this.memorySystem['db']?.run(
      `INSERT INTO context_reflections (
        id, reflection_type, task_id, swarm_id, execution_trace,
        feedback_signals, extracted_lessons, metadata, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reflection.id,
        'strategy',  // Default reflection type
        reflection.context.task_id || 'unknown',
        reflection.context.swarm_id || 'default',
        JSON.stringify({ timestamp: reflection.timestamp, complexity: reflection.complexity }),
        JSON.stringify({ insights: reflection.insights }),
        JSON.stringify({ strategies: reflection.insights, antiPatterns: [], edgeCases: [] }),
        JSON.stringify({ complexity: reflection.complexity }),
        reflection.complexity  // Use complexity as confidence proxy
      ]
    );

    return reflection;
  }

  private calculateComplexity(
    context: Record<string, any>
  ): number {
    // Advanced complexity calculation
    const keyCount = Object.keys(context).length;
    const contentLength = JSON.stringify(context).length;

    return Math.log(keyCount * contentLength) / Math.log(10);
  }

  private generateInsights(
    context: Record<string, any>
  ): string[] {
    // Meta-cognitive analysis
    const insights: string[] = [];

    if (context.task && context.constraints) {
      insights.push(`Task complexity requires careful constraint management`);
    }

    if (context.previousResults) {
      insights.push(`Learning from past iterations`);
    }

    return insights;
  }

  async retrieveReflection(
    reflectionId: string
  ): Promise<CognitiveReflection | null> {
    return await this.memorySystem.retrieve(
      `reflection:${reflectionId}`,
      AccessLevel.SYSTEM
    );
  }
}

export default ACEReflector;