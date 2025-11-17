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

    // Apply performance indexes from init-indexes.sql
    await this.applyPerformanceIndexes();
  }

  /**
   * Apply performance indexes for context reflection queries
   * Based on .claude/skills/cfn-ace-system/init-indexes.sql
   * Target: < 100ms query time with 1000+ reflections
   */
  private async applyPerformanceIndexes(): Promise<void> {
    const db = this.memorySystem['db'];
    if (!db) {
      console.warn('⚠️ Database not initialized, skipping index creation');
      return;
    }

    // Check if context_reflections table exists
    const tableExists = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='context_reflections'"
    );

    if (!tableExists || tableExists.count === 0) {
      console.warn('⚠️ context_reflections table not found. Run schema migration first.');
      console.warn('   Use: .claude/skills/cfn-ace-system/schema/run-migration.sh');
      return;
    }

    const indexes = [
      // JSON Tag Extraction Index (most common query pattern)
      {
        name: 'idx_reflections_tags',
        sql: `CREATE INDEX IF NOT EXISTS idx_reflections_tags
              ON context_reflections(json_extract(metadata, '$.tags'))`
      },
      // Domain Classification Index
      {
        name: 'idx_reflections_domain',
        sql: `CREATE INDEX IF NOT EXISTS idx_reflections_domain
              ON context_reflections(json_extract(metadata, '$.domain'))`
      },
      // Confidence Score Index (DESC for high-to-low sorting)
      {
        name: 'idx_reflections_confidence',
        sql: `CREATE INDEX IF NOT EXISTS idx_reflections_confidence
              ON context_reflections(confidence DESC)`
      },
      // Recency Index (DESC for chronological sorting)
      {
        name: 'idx_reflections_created_at',
        sql: `CREATE INDEX IF NOT EXISTS idx_reflections_created_at
              ON context_reflections(created_at DESC)`
      },
      // Composite Index: Domain + Confidence + Recency
      {
        name: 'idx_reflections_domain_conf_date',
        sql: `CREATE INDEX IF NOT EXISTS idx_reflections_domain_conf_date
              ON context_reflections(
                json_extract(metadata, '$.domain'),
                confidence,
                created_at DESC
              )`
      },
      // Composite Index: Confidence + Recency (covering index)
      {
        name: 'idx_reflections_conf_date',
        sql: `CREATE INDEX IF NOT EXISTS idx_reflections_conf_date
              ON context_reflections(
                confidence DESC,
                created_at DESC
              )`
      }
    ];

    let successCount = 0;
    const failedIndexes: string[] = [];

    for (const index of indexes) {
      try {
        await db.run(index.sql);
        successCount++;
      } catch (error) {
        failedIndexes.push(index.name);
        console.error(`❌ Failed to create index ${index.name}:`, error);
      }
    }

    if (successCount === indexes.length) {
      console.log(`✅ Applied ${successCount} performance indexes (target: <100ms query time)`);
    } else {
      console.warn(`⚠️ Applied ${successCount}/${indexes.length} indexes. Failed: ${failedIndexes.join(', ')}`);
    }
  }

  async reflect(
    context: Record<string, any>,
    options: {
      complexity?: number
    } = {}
  ): Promise<CognitiveReflection> {
    const reflection: CognitiveReflection = {
      id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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