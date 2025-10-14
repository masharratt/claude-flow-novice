/**
 * ACE Reflector - Extracts lessons from execution traces
 */

const crypto = require('crypto');

class ACEReflector {
  constructor(options = {}) {
    this.adapter = options.adapter;
  }

  /**
   * Reflect on task execution and extract structured lessons
   * @param {Object} options - Reflection options
   * @param {string} options.taskId - Task identifier
   * @param {Object} options.trace - Execution trace
   * @param {Object} options.feedback - Feedback signals
   * @param {string} options.reflectionType - Type: success|failure|optimization|edge_case
   * @returns {Promise<Object>} Reflection result with extracted lessons
   */
  async reflect(options) {
    const {
      taskId,
      trace = {},
      feedback = {},
      reflectionType = 'success'
    } = options;

    // Extract lessons based on reflection type
    const lessons = this._extractLessons(trace, feedback, reflectionType);

    // Store reflection
    const reflectionId = await this.adapter.storeReflection({
      reflection_type: reflectionType,
      task_id: taskId,
      execution_trace: trace,
      feedback_signals: feedback,
      extracted_lessons: lessons
    });

    return {
      reflectionId,
      lessonsExtracted: lessons.length,
      lessons
    };
  }

  /**
   * Extract lessons from execution trace and feedback
   * @private
   */
  _extractLessons(trace, feedback, reflectionType) {
    const lessons = [];

    // Pattern detection based on trace and feedback
    if (reflectionType === 'success') {
      lessons.push(...this._extractSuccessPatterns(trace, feedback));
    } else if (reflectionType === 'failure') {
      lessons.push(...this._extractFailurePatterns(trace, feedback));
    } else if (reflectionType === 'optimization') {
      lessons.push(...this._extractOptimizationPatterns(trace, feedback));
    } else if (reflectionType === 'edge_case') {
      lessons.push(...this._extractEdgeCasePatterns(trace, feedback));
    }

    // Assign confidence scores based on signal strength
    lessons.forEach(lesson => {
      lesson.confidence_score = this._calculateConfidence(lesson, feedback);
    });

    return lessons;
  }

  /**
   * Extract patterns from successful execution
   * @private
   */
  _extractSuccessPatterns(trace, feedback) {
    const patterns = [];

    // Check for common success indicators
    if (feedback.testsPass) {
      patterns.push({
        category: 'pattern',
        content: `Testing approach validated: ${feedback.testStrategy || 'comprehensive test coverage'}`,
        tags: ['testing', 'validation', 'success'],
        priority: 7
      });
    }

    if (feedback.performanceGain) {
      patterns.push({
        category: 'optimization',
        content: `Performance optimization effective: ${feedback.optimizationTechnique}`,
        tags: ['performance', 'optimization'],
        priority: 8
      });
    }

    if (trace.coordinationStrategy) {
      patterns.push({
        category: 'strategy',
        content: `Coordination strategy successful: ${trace.coordinationStrategy}`,
        tags: ['coordination', 'swarm', 'strategy'],
        priority: 8
      });
    }

    return patterns;
  }

  /**
   * Extract patterns from failed execution
   * @private
   */
  _extractFailurePatterns(trace, feedback) {
    const patterns = [];

    if (feedback.error) {
      patterns.push({
        category: 'anti_pattern',
        content: `Avoid: ${feedback.error.message || 'Unknown error pattern'}. Solution: ${feedback.resolution || 'See trace'}`,
        tags: ['error', 'anti-pattern'],
        priority: 9
      });
    }

    if (feedback.testFailures) {
      patterns.push({
        category: 'edge_case',
        content: `Edge case identified: ${feedback.testFailures.description}. Handle with: ${feedback.testFailures.fix}`,
        tags: ['edge-case', 'testing'],
        priority: 8
      });
    }

    return patterns;
  }

  /**
   * Extract optimization patterns
   * @private
   */
  _extractOptimizationPatterns(trace, feedback) {
    const patterns = [];

    if (feedback.beforeAfter) {
      const improvement = feedback.beforeAfter.improvement || 'measurable';
      patterns.push({
        category: 'optimization',
        content: `Optimization: ${feedback.technique}. Result: ${improvement} improvement`,
        tags: ['optimization', 'performance'],
        priority: 7
      });
    }

    return patterns;
  }

  /**
   * Extract edge case patterns
   * @private
   */
  _extractEdgeCasePatterns(trace, feedback) {
    const patterns = [];

    if (feedback.edgeCase) {
      patterns.push({
        category: 'edge_case',
        content: `Edge case: ${feedback.edgeCase.description}. Handle: ${feedback.edgeCase.solution}`,
        tags: ['edge-case', feedback.edgeCase.domain || 'general'],
        priority: 8
      });
    }

    return patterns;
  }

  /**
   * Calculate confidence score based on feedback signals
   * @private
   */
  _calculateConfidence(lesson, feedback) {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on signal strength
    if (feedback.testsPass) confidence += 0.2;
    if (feedback.codeReviewApproved) confidence += 0.15;
    if (feedback.productionValidated) confidence += 0.15;
    if (feedback.metricsImproved) confidence += 0.1;

    // Cap at 0.95 (room for evolution)
    return Math.min(confidence, 0.95);
  }
}

module.exports = { ACEReflector };
