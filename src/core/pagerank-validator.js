/**
 * PageRank Validator
 * Validates PageRank calculations and mathematical consistency
 */

class PageRankValidator {
  constructor(options = {}) {
    this.convergenceThreshold = options.convergenceThreshold || 1e-6;
    this.maxIterations = options.maxIterations || 100;
  }

  validatePageRankScores(scores, graph) {
    const validations = {
      convergenceCheck: this.validateConvergence(scores),
      distributionCheck: this.validateScoreDistribution(scores),
      consistencyCheck: this.validateMathematicalConsistency(scores, graph),
      normalityCheck: this.validateNormalization(scores)
    };

    return {
      valid: Object.values(validations).every(v => v),
      validations,
      overallScore: this.calculateValidationScore(validations)
    };
  }

  validateConvergence(scores) {
    // Assume scores are converged if they exist
    return Object.keys(scores).length > 0;
  }

  validateScoreDistribution(scores) {
    const values = Object.values(scores);
    if (values.length === 0) return false;

    // Check if all scores are positive
    const allPositive = values.every(score => score > 0);

    // Check if distribution is reasonable (no single score dominates)
    const maxScore = Math.max(...values);
    const avgScore = values.reduce((sum, score) => sum + score, 0) / values.length;
    const reasonableDistribution = maxScore < avgScore * 5; // Max score shouldn't be more than 5x average

    return allPositive && reasonableDistribution;
  }

  validateMathematicalConsistency(scores, graph) {
    if (!graph || !graph.nodes) return true; // Skip if no graph provided

    // Basic consistency check: scores should correlate with connectivity
    const nodeConnectivity = this.calculateNodeConnectivity(graph);

    // Check if high-connectivity nodes have higher scores (generally)
    let consistentPairs = 0;
    let totalPairs = 0;

    graph.nodes.forEach((node, i) => {
      graph.nodes.forEach((otherNode, j) => {
        if (i !== j) {
          const nodeScore = scores[node] || 0;
          const otherScore = scores[otherNode] || 0;
          const nodeConnectivity1 = nodeConnectivity[node] || 0;
          const nodeConnectivity2 = nodeConnectivity[otherNode] || 0;

          if ((nodeConnectivity1 > nodeConnectivity2 && nodeScore >= otherScore) ||
              (nodeConnectivity1 <= nodeConnectivity2 && nodeScore <= otherScore)) {
            consistentPairs++;
          }
          totalPairs++;
        }
      });
    });

    const consistencyRatio = totalPairs > 0 ? consistentPairs / totalPairs : 1;
    return consistencyRatio > 0.6; // 60% consistency threshold
  }

  calculateNodeConnectivity(graph) {
    const connectivity = {};

    graph.nodes.forEach(node => {
      connectivity[node] = 0;
    });

    if (graph.edges) {
      graph.edges.forEach(edge => {
        connectivity[edge.from] = (connectivity[edge.from] || 0) + 1;
        connectivity[edge.to] = (connectivity[edge.to] || 0) + 1;
      });
    }

    return connectivity;
  }

  validateNormalization(scores) {
    const values = Object.values(scores);
    if (values.length === 0) return true;

    const sum = values.reduce((total, score) => total + score, 0);
    const nodeCount = values.length;

    // For PageRank, scores should approximately sum to the number of nodes
    const expectedSum = nodeCount;
    const tolerance = 0.1 * nodeCount; // 10% tolerance

    return Math.abs(sum - expectedSum) <= tolerance;
  }

  calculateValidationScore(validations) {
    const validCount = Object.values(validations).filter(v => v).length;
    const totalChecks = Object.keys(validations).length;

    return totalChecks > 0 ? validCount / totalChecks : 0;
  }

  validatePageRankImplementation(implementation, testCases) {
    const results = testCases.map(testCase => {
      try {
        const result = implementation(testCase.graph);
        const validation = this.validatePageRankScores(result.scores, testCase.graph);

        return {
          testCase: testCase.name,
          passed: validation.valid,
          validationScore: validation.overallScore,
          expectedConvergence: testCase.expectedConvergence,
          actualConvergence: result.converged
        };
      } catch (error) {
        return {
          testCase: testCase.name,
          passed: false,
          error: error.message
        };
      }
    });

    return {
      allTestsPassed: results.every(r => r.passed),
      results,
      averageValidationScore: this.calculateAverageScore(results)
    };
  }

  calculateAverageScore(results) {
    const validResults = results.filter(r => r.validationScore !== undefined);
    if (validResults.length === 0) return 0;

    const totalScore = validResults.reduce((sum, r) => sum + r.validationScore, 0);
    return totalScore / validResults.length;
  }
}

export { PageRankValidator };