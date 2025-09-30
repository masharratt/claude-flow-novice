class StatisticalAnalyzer {
  constructor() {
    this.confidenceLevel = 0.95;
  }

  analyze(results) {
    const formats = Object.keys(results.formats);
    const analysis = {
      descriptiveStats: this.calculateDescriptiveStats(results),
      significance: this.testSignificance(results),
      effectSize: this.calculateEffectSize(results),
      recommendations: []
    };

    analysis.recommendations = this.generateStatisticalRecommendations(analysis);

    return analysis;
  }

  calculateDescriptiveStats(results) {
    const stats = {};

    for (const [formatName, formatData] of Object.entries(results.formats)) {
      const scenarios = Object.values(formatData.scenarios);
      const qualityScores = scenarios.flatMap(s => s.rounds.map(r => r.qualityScore));
      const responseTimes = scenarios.flatMap(s => s.rounds.map(r => r.responseTime));

      stats[formatName] = {
        quality: this.calculateStats(qualityScores),
        responseTime: this.calculateStats(responseTimes),
        sampleSize: qualityScores.length
      };
    }

    return stats;
  }

  calculateStats(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const n = values.length;

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      median: this.getPercentile(sorted, 0.5),
      stdDev,
      variance,
      min: sorted[0],
      max: sorted[n - 1],
      p25: this.getPercentile(sorted, 0.25),
      p75: this.getPercentile(sorted, 0.75),
      p95: this.getPercentile(sorted, 0.95),
      coefficientOfVariation: (stdDev / mean) * 100
    };
  }

  getPercentile(sortedValues, percentile) {
    const index = (sortedValues.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sortedValues[lower];
    }

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  testSignificance(results) {
    const formats = Object.keys(results.formats);
    const tests = {};

    // Pairwise t-tests
    for (let i = 0; i < formats.length; i++) {
      for (let j = i + 1; j < formats.length; j++) {
        const format1 = formats[i];
        const format2 = formats[j];

        const testKey = `${format1}_vs_${format2}`;
        tests[testKey] = this.tTest(
          this.getQualityScores(results.formats[format1]),
          this.getQualityScores(results.formats[format2])
        );
      }
    }

    // ANOVA for overall difference
    const allScores = formats.map(f => this.getQualityScores(results.formats[f]));
    tests.anova = this.anova(allScores);

    return tests;
  }

  getQualityScores(formatData) {
    return Object.values(formatData.scenarios)
      .flatMap(s => s.rounds.map(r => r.qualityScore));
  }

  tTest(sample1, sample2) {
    const n1 = sample1.length;
    const n2 = sample2.length;

    const mean1 = sample1.reduce((sum, v) => sum + v, 0) / n1;
    const mean2 = sample2.reduce((sum, v) => sum + v, 0) / n2;

    const var1 = sample1.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / (n1 - 1);
    const var2 = sample2.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / (n2 - 1);

    // Pooled standard deviation
    const pooledSD = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));

    // T-statistic
    const t = (mean1 - mean2) / (pooledSD * Math.sqrt(1/n1 + 1/n2));
    const df = n1 + n2 - 2;

    // Approximate p-value (simplified)
    const pValue = this.approximatePValue(Math.abs(t), df);

    return {
      tStatistic: t,
      degreesOfFreedom: df,
      pValue,
      significant: pValue < 0.05,
      meanDifference: mean1 - mean2,
      confidenceInterval: this.calculateCI(mean1 - mean2, pooledSD, n1, n2)
    };
  }

  anova(groups) {
    const k = groups.length;
    const n = groups.reduce((sum, g) => sum + g.length, 0);

    // Grand mean
    const allValues = groups.flat();
    const grandMean = allValues.reduce((sum, v) => sum + v, 0) / n;

    // Between-group sum of squares
    const ssBetween = groups.reduce((sum, group) => {
      const groupMean = group.reduce((s, v) => s + v, 0) / group.length;
      return sum + group.length * Math.pow(groupMean - grandMean, 2);
    }, 0);

    // Within-group sum of squares
    const ssWithin = groups.reduce((sum, group) => {
      const groupMean = group.reduce((s, v) => s + v, 0) / group.length;
      return sum + group.reduce((s, v) => s + Math.pow(v - groupMean, 2), 0);
    }, 0);

    const dfBetween = k - 1;
    const dfWithin = n - k;

    const msBetween = ssBetween / dfBetween;
    const msWithin = ssWithin / dfWithin;

    const fStatistic = msBetween / msWithin;
    const pValue = this.approximateFPValue(fStatistic, dfBetween, dfWithin);

    return {
      fStatistic,
      dfBetween,
      dfWithin,
      pValue,
      significant: pValue < 0.05
    };
  }

  approximatePValue(t, df) {
    // Simplified approximation
    const x = Math.abs(t);
    if (df < 30) {
      // Conservative estimate for small samples
      return x > 2.0 ? 0.05 : x > 2.5 ? 0.02 : x > 3.0 ? 0.005 : 0.10;
    } else {
      // Normal approximation for large samples
      return x > 1.96 ? 0.05 : x > 2.58 ? 0.01 : x > 3.29 ? 0.001 : 0.10;
    }
  }

  approximateFPValue(f, df1, df2) {
    // Simplified F-distribution p-value approximation
    if (f < 1) return 1.0;
    if (f > 4) return 0.01;
    if (f > 3) return 0.05;
    return 0.10;
  }

  calculateCI(meanDiff, sd, n1, n2) {
    const se = sd * Math.sqrt(1/n1 + 1/n2);
    const margin = 1.96 * se; // 95% CI

    return {
      lower: meanDiff - margin,
      upper: meanDiff + margin
    };
  }

  calculateEffectSize(results) {
    const formats = Object.keys(results.formats);
    const effectSizes = {};

    for (let i = 0; i < formats.length; i++) {
      for (let j = i + 1; j < formats.length; j++) {
        const format1 = formats[i];
        const format2 = formats[j];

        const scores1 = this.getQualityScores(results.formats[format1]);
        const scores2 = this.getQualityScores(results.formats[format2]);

        effectSizes[`${format1}_vs_${format2}`] = this.cohensD(scores1, scores2);
      }
    }

    return effectSizes;
  }

  cohensD(sample1, sample2) {
    const mean1 = sample1.reduce((sum, v) => sum + v, 0) / sample1.length;
    const mean2 = sample2.reduce((sum, v) => sum + v, 0) / sample2.length;

    const var1 = sample1.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / (sample1.length - 1);
    const var2 = sample2.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / (sample2.length - 1);

    const pooledSD = Math.sqrt((var1 + var2) / 2);
    const d = (mean1 - mean2) / pooledSD;

    return {
      value: d,
      magnitude: Math.abs(d) < 0.2 ? 'negligible' :
                 Math.abs(d) < 0.5 ? 'small' :
                 Math.abs(d) < 0.8 ? 'medium' : 'large'
    };
  }

  generateStatisticalRecommendations(analysis) {
    const recommendations = [];

    // Check ANOVA significance
    if (analysis.significance.anova.significant) {
      recommendations.push({
        type: 'significance',
        message: `Statistically significant differences found between formats (p < 0.05)`,
        confidence: 'high'
      });
    } else {
      recommendations.push({
        type: 'significance',
        message: `No statistically significant differences between formats`,
        confidence: 'high'
      });
    }

    // Check effect sizes
    for (const [comparison, effect] of Object.entries(analysis.effectSize)) {
      if (effect.magnitude === 'large' || effect.magnitude === 'medium') {
        recommendations.push({
          type: 'effect_size',
          message: `${comparison.replace('_vs_', ' vs ')}: ${effect.magnitude} effect size (d=${effect.value.toFixed(2)})`,
          confidence: 'high'
        });
      }
    }

    // Check consistency
    for (const [format, stats] of Object.entries(analysis.descriptiveStats)) {
      if (stats.quality.coefficientOfVariation < 10) {
        recommendations.push({
          type: 'consistency',
          message: `${format} format shows high consistency (CV=${stats.quality.coefficientOfVariation.toFixed(1)}%)`,
          confidence: 'medium'
        });
      }
    }

    return recommendations;
  }
}

export { StatisticalAnalyzer };