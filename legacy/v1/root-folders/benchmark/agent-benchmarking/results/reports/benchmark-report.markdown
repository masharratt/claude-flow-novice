# Agent Prompt Format Benchmark Report

**Generated:** 2025-09-30T15:22:41.582Z
**Rounds:** 3
**Formats Tested:** 3
**Total Scenarios:** 5

## Executive Summary

🏆 **Winner:** CODE-HEAVY format
📊 **Quality Score:** 24.4%

## Format Comparison

| Format | Overall Quality | Avg Response Time | Consistency | Success Rate |
|--------|----------------|------------------|-------------|-------------|
| minimal | 18.0% | 2046ms | 100.0% | 100.0% |
| metadata | 22.4% | 2033ms | 100.0% | 100.0% |
| code-heavy | 24.4% | 1922ms | 100.0% | 100.0% |

## Statistical Analysis

### Descriptive Statistics

#### minimal

- **Mean Quality:** 18.0%
- **Std Dev:** 10.43
- **Median:** 20.0%
- **P95:** 32.0%
- **CV:** 57.9%

#### metadata

- **Mean Quality:** 22.4%
- **Std Dev:** 22.26
- **Median:** 16.0%
- **P95:** 65.0%
- **CV:** 99.4%

#### code-heavy

- **Mean Quality:** 24.4%
- **Std Dev:** 26.11
- **Median:** 16.0%
- **P95:** 75.0%
- **CV:** 107.0%

### Significance Tests

**ANOVA Results:**
- F-statistic: 0.350
- p-value: 1.0000
- Significant: No

### Effect Sizes (Cohen's d)

- **minimal vs metadata**: d=-0.245 (small)
- **minimal vs code-heavy**: d=-0.311 (small)
- **metadata vs code-heavy**: d=-0.080 (negligible)

## Recommendations

- Highest quality responses: code-heavy format (24.4%)
- Fastest responses: code-heavy format (1922ms avg)
- Most consistent: minimal format (100.0% consistency)

## Detailed Results by Scenario

### rust-01-basic

| Format | Quality | Response Time | Consistency |
|--------|---------|--------------|-------------|
| minimal | 32.0% | 2186ms | 100.0% |
| metadata | 65.0% | 2390ms | 100.0% |
| code-heavy | 75.0% | 1738ms | 100.0% |

### rust-02-concurrent

| Format | Quality | Response Time | Consistency |
|--------|---------|--------------|-------------|
| minimal | 20.0% | 1669ms | 100.0% |
| metadata | 12.0% | 2077ms | 100.0% |
| code-heavy | 12.0% | 2228ms | 100.0% |

### rust-03-lru-cache

| Format | Quality | Response Time | Consistency |
|--------|---------|--------------|-------------|
| minimal | 22.0% | 2621ms | 100.0% |
| metadata | 19.0% | 2155ms | 100.0% |
| code-heavy | 19.0% | 1934ms | 100.0% |

### rust-04-zero-copy

| Format | Quality | Response Time | Consistency |
|--------|---------|--------------|-------------|
| minimal | 0.0% | 1974ms | 100.0% |
| metadata | 0.0% | 1332ms | 100.0% |
| code-heavy | 0.0% | 2165ms | 100.0% |

### rust-05-async-scheduler

| Format | Quality | Response Time | Consistency |
|--------|---------|--------------|-------------|
| minimal | 16.0% | 1779ms | 100.0% |
| metadata | 16.0% | 2212ms | 100.0% |
| code-heavy | 16.0% | 1545ms | 100.0% |

## Methodology

This benchmark tested 3 different agent prompt formats across 5 test scenarios, with 3 rounds per scenario.

### Scoring Criteria

- **Quality Score:** Weighted evaluation of completeness, accuracy, relevance, and clarity
- **Response Time:** Total time from request to complete response
- **Consistency:** Variance in quality across multiple rounds

