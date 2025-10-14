/**
 * ACE Curator - Merges reflections into adaptive context with deduplication
 */

class ACECurator {
  constructor(options = {}) {
    this.adapter = options.adapter;
    this.defaultSimilarityThreshold = 0.85;
  }

  /**
   * Curate reflection into adaptive context
   * @param {Object} options - Curation options
   * @param {string} options.reflectionId - Reflection to curate
   * @param {number} options.similarityThreshold - Similarity threshold (0.6-0.95)
   * @returns {Promise<Object>} Curation result
   */
  async curate(options) {
    const {
      reflectionId,
      similarityThreshold = this.defaultSimilarityThreshold
    } = options;

    // Get reflection
    const reflection = await this.adapter.getReflection(reflectionId);
    if (!reflection) {
      throw new Error(`Reflection ${reflectionId} not found`);
    }

    const mergedBulletIds = [];
    const decisions = [];

    // Process each extracted lesson
    for (const lesson of reflection.extracted_lessons) {
      const decision = await this._processBullet(lesson, similarityThreshold);
      decisions.push(decision);

      if (decision.bulletId) {
        mergedBulletIds.push(decision.bulletId);
      }
    }

    // Update reflection status
    await this.adapter.updateReflectionStatus(
      reflectionId,
      'merged',
      mergedBulletIds
    );

    return {
      reflectionId,
      decisions,
      mergedBullets: mergedBulletIds.length,
      newBullets: decisions.filter(d => d.action === 'add').length,
      incrementedBullets: decisions.filter(d => d.action === 'increment').length,
      mergedBullets: decisions.filter(d => d.action === 'merge').length
    };
  }

  /**
   * Process individual bullet with deduplication
   * @private
   */
  async _processBullet(lesson, similarityThreshold) {
    // Query existing bullets in same category
    const existingBullets = await this.adapter.queryBullets({
      category: lesson.category,
      limit: 50,
      isActive: true
    });

    // Find most similar bullet
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const existing of existingBullets) {
      const similarity = this._calculateSimilarity(
        lesson.content,
        existing.content
      );

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = existing;
      }
    }

    // Merge decision logic
    if (bestSimilarity >= 0.95) {
      // Exact duplicate - increment helpful_count
      return {
        action: 'increment',
        bulletId: bestMatch.bullet_id,
        similarity: bestSimilarity,
        rationale: 'Exact duplicate - reinforcing existing bullet'
      };
    } else if (bestSimilarity >= similarityThreshold && bestSimilarity < 0.95) {
      // Near duplicate - consider merging
      // For now, increment (future: actual content merge)
      return {
        action: 'increment',
        bulletId: bestMatch.bullet_id,
        similarity: bestSimilarity,
        rationale: 'Near duplicate - reinforcing existing bullet'
      };
    } else {
      // Different enough - add as new bullet
      const bulletId = await this.adapter.upsertBullet(lesson);
      return {
        action: 'add',
        bulletId,
        similarity: bestSimilarity,
        rationale: 'Sufficiently different - added as new bullet'
      };
    }
  }

  /**
   * Calculate similarity between two strings
   * Simple implementation - can be enhanced with embeddings
   * @private
   */
  _calculateSimilarity(str1, str2) {
    // Normalize
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return 1.0;

    // Token-based Jaccard similarity
    const tokens1 = new Set(s1.split(/\s+/));
    const tokens2 = new Set(s2.split(/\s+/));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }
}

module.exports = { ACECurator };
