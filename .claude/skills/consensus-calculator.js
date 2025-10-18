const calculateConsensus = (taskMetrics) => {
    const {
        validatorScores,
        confidenceScores,
        gateways
    } = taskMetrics;

    const consensusScore = calculateWeightedConsensus(validatorScores);
    const confidenceScore = calculateConfidenceMetric(confidenceScores);
    const gateScore = calculateGatewayScore(gateways);

    return {
        consensus: consensusScore,
        confidence: confidenceScore,
        gate_score: gateScore,
        recommendation: decideNextAction(consensusScore, confidenceScore, gateScore)
    };
};

function calculateWeightedConsensus(validatorScores) {
    // Implement weighted consensus calculation
    return validatorScores.reduce((a, b) => a + b, 0) / validatorScores.length;
}

function calculateConfidenceMetric(confidenceScores) {
    // Implement confidence metric calculation
    return Math.min(confidenceScores.reduce((a, b) => a * b, 1), 1);
}

function calculateGatewayScore(gateways) {
    // Implement gateway score calculation
    return gateways.reduce((a, b) => a * b, 1);
}

function decideNextAction(consensusScore, confidenceScore, gateScore) {
    if (consensusScore >= 0.90 && gateScore >= 0.75) {
        return 'success';
    } else if (consensusScore >= 0.75) {
        return 'retry_with_specialists';
    } else {
        return 'manual_review';
    }
}

module.exports = { calculateConsensus };