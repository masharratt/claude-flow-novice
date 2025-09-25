/**
 * CRITICAL FAILING TESTS - Phase 3 Temporal Prediction Accuracy
 * REQUIREMENT: 89% minimum accuracy (currently 8.2% - CRITICAL FAILURE)
 *
 * These tests MUST FAIL initially to follow TDD protocol
 */

const { TemporalPredictor } = require('../../src/temporal/temporal-predictor');
const { performance } = require('perf_hooks');

describe('Temporal Prediction Engine - CRITICAL ACCURACY TESTS', () => {
  let predictor;
  const REQUIRED_ACCURACY = 0.89; // 89% minimum requirement
  const CURRENT_ACCURACY = 0.082; // 8.2% current failing accuracy

  beforeEach(() => {
    predictor = new TemporalPredictor({
      algorithms: ['arima', 'lstm', 'ensemble'],
      windowSize: 100,
      predictionHorizon: 10
    });
  });

  describe('CRITICAL: 89% Accuracy Requirement', () => {
    test('FAILING TEST: should achieve 89% accuracy on temporal patterns', async () => {
      // Generate known temporal pattern data
      const trainingData = generateTemporalPattern(1000, {
        trend: 0.5,
        seasonality: [0.3, 0.2, 0.1],
        noise: 0.05
      });

      const testData = generateTemporalPattern(200, {
        trend: 0.5,
        seasonality: [0.3, 0.2, 0.1],
        noise: 0.05
      });

      // Train predictor
      await predictor.train(trainingData);

      // Make predictions
      const predictions = [];
      const actuals = [];

      for (let i = 0; i < testData.length - predictor.predictionHorizon; i++) {
        const input = testData.slice(i, i + predictor.windowSize);
        const prediction = await predictor.predict(input);
        const actual = testData.slice(i + predictor.windowSize, i + predictor.windowSize + predictor.predictionHorizon);

        predictions.push(prediction);
        actuals.push(actual);
      }

      // Calculate accuracy
      const accuracy = calculateAccuracy(predictions, actuals);

      // THIS TEST MUST FAIL INITIALLY
      expect(accuracy).toBeGreaterThanOrEqual(REQUIRED_ACCURACY);
      expect(accuracy).not.toBe(CURRENT_ACCURACY); // Ensure we're not getting the broken 8.2%
    });

    test('FAILING TEST: should handle high-frequency temporal data with 89% accuracy', async () => {
      // High-frequency data test
      const highFreqData = generateHighFrequencyPattern(5000, {
        frequencies: [0.1, 0.05, 0.02],
        amplitudes: [1.0, 0.5, 0.3]
      });

      await predictor.train(highFreqData.slice(0, 4000));

      const testSet = highFreqData.slice(4000);
      const predictions = [];
      const actuals = [];

      for (let i = 0; i < testSet.length - predictor.predictionHorizon; i += 10) {
        const input = testSet.slice(i, i + predictor.windowSize);
        const prediction = await predictor.predict(input);
        const actual = testSet.slice(i + predictor.windowSize, i + predictor.windowSize + predictor.predictionHorizon);

        predictions.push(prediction);
        actuals.push(actual);
      }

      const accuracy = calculateAccuracy(predictions, actuals);
      expect(accuracy).toBeGreaterThanOrEqual(REQUIRED_ACCURACY);
    });

    test('FAILING TEST: should maintain 89% accuracy under noise conditions', async () => {
      // Test with various noise levels
      const noiseTests = [0.1, 0.2, 0.3];

      for (const noiseLevel of noiseTests) {
        const noisyData = generateTemporalPattern(1000, {
          trend: 0.3,
          seasonality: [0.4, 0.3],
          noise: noiseLevel
        });

        await predictor.train(noisyData.slice(0, 800));

        const testData = noisyData.slice(800);
        const predictions = [];
        const actuals = [];

        for (let i = 0; i < testData.length - predictor.predictionHorizon; i += 5) {
          const input = testData.slice(i, i + predictor.windowSize);
          const prediction = await predictor.predict(input);
          const actual = testData.slice(i + predictor.windowSize, i + predictor.windowSize + predictor.predictionHorizon);

          predictions.push(prediction);
          actuals.push(actual);
        }

        const accuracy = calculateAccuracy(predictions, actuals);
        expect(accuracy).toBeGreaterThanOrEqual(REQUIRED_ACCURACY);
      }
    });
  });

  describe('Performance Requirements', () => {
    test('FAILING TEST: should make predictions within 100ms', async () => {
      const data = generateTemporalPattern(1000);
      await predictor.train(data.slice(0, 800));

      const input = data.slice(800, 900);

      const start = performance.now();
      await predictor.predict(input);
      const end = performance.now();

      const predictionTime = end - start;
      expect(predictionTime).toBeLessThan(100);
    });
  });

  describe('Algorithm Integration', () => {
    test('FAILING TEST: should use ARIMA model for trend analysis', async () => {
      const trendData = generateTrendPattern(500, { slope: 0.05 });
      await predictor.train(trendData);

      expect(predictor.hasARIMAModel()).toBe(true);
      expect(predictor.getARIMAParameters()).toHaveProperty('p');
      expect(predictor.getARIMAParameters()).toHaveProperty('d');
      expect(predictor.getARIMAParameters()).toHaveProperty('q');
    });

    test('FAILING TEST: should use ML ensemble for complex patterns', async () => {
      const complexData = generateComplexPattern(800);
      await predictor.train(complexData);

      expect(predictor.hasEnsembleModel()).toBe(true);
      expect(predictor.getEnsembleModels()).toContain('lstm');
      expect(predictor.getEnsembleModels()).toContain('gru');
      expect(predictor.getEnsembleModels()).toContain('transformer');
    });
  });
});

// Helper functions for test data generation
function generateTemporalPattern(length, options = {}) {
  const {
    trend = 0,
    seasonality = [],
    noise = 0.1
  } = options;

  const data = [];
  for (let i = 0; i < length; i++) {
    let value = trend * i;

    // Add seasonal components
    seasonality.forEach((amplitude, index) => {
      const frequency = (index + 1) * 2 * Math.PI / 50;
      value += amplitude * Math.sin(frequency * i);
    });

    // Add noise
    value += (Math.random() - 0.5) * noise * 2;

    data.push(value);
  }
  return data;
}

function generateHighFrequencyPattern(length, options = {}) {
  const { frequencies = [0.1], amplitudes = [1.0] } = options;

  const data = [];
  for (let i = 0; i < length; i++) {
    let value = 0;

    frequencies.forEach((freq, index) => {
      const amplitude = amplitudes[index] || 1.0;
      value += amplitude * Math.sin(2 * Math.PI * freq * i);
    });

    data.push(value);
  }
  return data;
}

function generateTrendPattern(length, options = {}) {
  const { slope = 0.01 } = options;

  const data = [];
  for (let i = 0; i < length; i++) {
    const value = slope * i + (Math.random() - 0.5) * 0.1;
    data.push(value);
  }
  return data;
}

function generateComplexPattern(length) {
  const data = [];
  for (let i = 0; i < length; i++) {
    // Complex multi-frequency pattern with non-linear components
    let value = 0.5 * Math.sin(2 * Math.PI * 0.1 * i);
    value += 0.3 * Math.sin(2 * Math.PI * 0.05 * i);
    value += 0.2 * Math.sin(2 * Math.PI * 0.02 * i);
    value += 0.1 * Math.sin(2 * Math.PI * 0.3 * i) * Math.cos(2 * Math.PI * 0.01 * i);
    value += (Math.random() - 0.5) * 0.05;

    data.push(value);
  }
  return data;
}

function calculateAccuracy(predictions, actuals) {
  if (predictions.length !== actuals.length) {
    throw new Error('Prediction and actual arrays must have the same length');
  }

  let totalError = 0;
  let totalPredictions = 0;

  for (let i = 0; i < predictions.length; i++) {
    const predArray = Array.isArray(predictions[i]) ? predictions[i] : [predictions[i]];
    const actualArray = Array.isArray(actuals[i]) ? actuals[i] : [actuals[i]];

    for (let j = 0; j < Math.min(predArray.length, actualArray.length); j++) {
      const error = Math.abs(predArray[j] - actualArray[j]);
      const magnitude = Math.abs(actualArray[j]);

      // Relative error calculation
      const relativeError = magnitude > 0 ? error / magnitude : error;
      totalError += relativeError;
      totalPredictions++;
    }
  }

  const averageRelativeError = totalError / totalPredictions;
  const accuracy = Math.max(0, 1 - averageRelativeError);

  return accuracy;
}