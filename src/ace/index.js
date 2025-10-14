/**
 * ACE (Adaptive Context Extension) - Core Module
 *
 * Implementation of Stanford's Generator/Reflector/Curator architecture
 * with SQLite persistence and incremental delta updates.
 */

const path = require('path');
const { ACEReflector } = require('./reflector');
const { ACECurator } = require('./curator');
const { ACEAdapter } = require('./sqlite-adapter');

class ACESystem {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(process.cwd(), '.artifacts/database/swarm-memory.db');
    this.aclLevel = options.aclLevel || 4; // Project-level by default
    this.adapter = null;
    this.reflector = null;
    this.curator = null;
  }

  /**
   * Initialize ACE system with SQLite adapter
   */
  async initialize() {
    this.adapter = new ACEAdapter({ dbPath: this.dbPath });
    await this.adapter.initialize();

    this.reflector = new ACEReflector({ adapter: this.adapter });
    this.curator = new ACECurator({ adapter: this.adapter });

    return this;
  }

  /**
   * Reflect on task execution and extract lessons
   * @param {Object} options - Reflection options
   * @param {string} options.taskId - Task identifier
   * @param {Object} options.trace - Execution trace
   * @param {Object} options.feedback - Feedback signals
   * @returns {Promise<Object>} Reflection result
   */
  async reflect(options) {
    return this.reflector.reflect(options);
  }

  /**
   * Curate reflections into adaptive context
   * @param {Object} options - Curation options
   * @param {string} options.reflectionId - Reflection ID to curate
   * @param {number} options.similarityThreshold - Similarity threshold (0.6-0.95)
   * @returns {Promise<Object>} Curation result
   */
  async curate(options) {
    return this.curator.curate(options);
  }

  /**
   * Query bullets from adaptive context
   * @param {Object} options - Query options
   * @param {string} options.category - Filter by category
   * @param {Array<string>} options.tags - Filter by tags
   * @param {number} options.minConfidence - Minimum confidence score
   * @param {number} options.limit - Max results
   * @returns {Promise<Array>} Matching bullets
   */
  async query(options = {}) {
    return this.adapter.queryBullets(options);
  }

  /**
   * Inject bullets into context (for agent spawning)
   * @param {Object} options - Injection options
   * @param {string} options.agentType - Agent type for context mapping
   * @param {string} options.phase - Current CFN phase
   * @param {number} options.limit - Max bullets to inject
   * @returns {Promise<string>} Formatted context string
   */
  async inject(options = {}) {
    const { agentType, phase, limit = 15 } = options;

    // Agent-specific context mapping
    const contextMappings = {
      'coder': { categories: ['pattern', 'strategy'], tags: ['coding', 'best-practices'] },
      'architect': { categories: ['strategy', 'domain_insight'], tags: ['architecture', 'design'] },
      'security-specialist': { categories: ['pattern', 'edge_case'], tags: ['security', 'acl'] },
      'tester': { categories: ['edge_case', 'pattern'], tags: ['testing', 'validation'] },
      'coordinator': { categories: ['strategy', 'optimization'], tags: ['coordination', 'swarm'] }
    };

    const mapping = contextMappings[agentType] || { categories: [], tags: [] };

    // Add phase-specific tags
    const phaseTags = phase ? [`phase-${phase}`] : [];
    const tags = [...mapping.tags, ...phaseTags];

    const bullets = await this.query({
      category: mapping.categories,
      tags: tags.length > 0 ? tags : undefined,
      minConfidence: 0.7,
      limit,
      isActive: true
    });

    // Format as markdown bullets
    let context = '## 🎯 Relevant Context\n\n';

    const groupedByCategory = bullets.reduce((acc, bullet) => {
      const cat = bullet.category || 'general';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(bullet);
      return acc;
    }, {});

    for (const [category, items] of Object.entries(groupedByCategory)) {
      context += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      items.forEach(bullet => {
        const confidence = (bullet.confidence_score * 100).toFixed(0);
        context += `- **[${confidence}%]** ${bullet.content}\n`;
      });
      context += '\n';
    }

    return context;
  }

  /**
   * Mark bullet as helpful/harmful
   * @param {string} bulletId - Bullet ID
   * @param {string} outcome - 'helpful' or 'harmful'
   * @param {string} taskId - Task ID for tracking
   * @param {string} agentId - Agent ID for tracking
   */
  async markUsage(bulletId, outcome, taskId, agentId) {
    return this.adapter.logUsage({
      bulletId,
      outcome,
      taskId,
      agentId
    });
  }

  /**
   * Get ACE system statistics
   * @returns {Promise<Object>} System stats
   */
  async getStats() {
    return this.adapter.getStats();
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.adapter) {
      await this.adapter.close();
    }
  }
}

module.exports = { ACESystem, ACEReflector, ACECurator, ACEAdapter };
