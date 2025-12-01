# Thinking Model Verification Strategy

**Status**: Preparation | **Date**: 2025-11-28

## Objective

Verify that **open-source thinking models** (Qwen, Llama) can effectively form debugging hypotheses, not just Cerebras or Kimi.

---

## Model Candidates

### Option 1: Cerebras Thinking Model ✓ (Baseline)
- **Status**: Known to work (used in MDAP v2 implementation)
- **Access**: Via Cerebras API
- **Cost**: ~$0.02-0.05 per task
- **Quality**: Excellent (proprietary thinking model)
- **Use**: Baseline for comparison

### Option 2: Qwen-3-235B (via Cerebras API)
- **Model**: Qwen-3-235B (Alibaba's reasoning model)
- **Access**: Cerebras Cloud
- **Cost**: Similar to standard Cerebras models
- **Thinking Capability**: Designed for complex reasoning
- **Status**: **NEED TO VERIFY**

### Option 3: Llama-3.1-405B (via Groq or local)
- **Model**: Meta's Llama-3.1-405B
- **Access**: Groq API (low-latency) or local VLLM
- **Cost**: ~$0.003-0.01 per 1M tokens
- **Thinking Capability**: Large enough for reasoning, but not "thinking-optimized"
- **Status**: **NEED TO VERIFY**

### Option 4: Qwen-2-72B (via Groq)
- **Model**: Qwen-2-72B
- **Access**: Groq API
- **Cost**: ~$0.0002 per task estimate
- **Thinking Capability**: Good reasoning for moderate problems
- **Status**: **NEED TO VERIFY**

---

## Verification Test Plan

### Test 1: Hypothesis Generation Quality

**Hypothesis**: Can the model generate 8 plausible debugging hypotheses?

**Test Cases**: 5 real debugging scenarios

```typescript
interface TestCase {
  name: string;
  errorMessage: string;
  code: string;
  expectedHypotheses: string[]; // What we'd expect an expert to generate
  rootCause: string; // The actual root cause
}

const testCases: TestCase[] = [
  {
    name: "Status String Mismatch",
    errorMessage: 'Agent shows "running" even after completion',
    code: `if (status === "COMPLETE") { ... } else { status = "COMPLETED"; }`,
    expectedHypotheses: [
      "Status string comparison mismatch",
      "Missing state update",
      "Async race condition",
      "Wrong status field checked",
      // ... 4 more
    ],
    rootCause: "status === 'COMPLETE' but value is 'COMPLETED'"
  },
  {
    name: "Null Reference Error",
    errorMessage: "TypeError: Cannot read property 'status' of undefined",
    code: `const status = agent.status; // agent might be null`,
    expectedHypotheses: [
      "Null/undefined property access",
      "Missing null check",
      "Wrong variable used",
      // ...
    ],
    rootCause: "agent is null, accessing agent.status"
  },
  // ... 3 more test cases
];
```

**Evaluation Criteria**:
- ✅ Generates 8 hypotheses (or requested count)
- ✅ Top 3 hypotheses include actual root cause
- ✅ Hypotheses are specific and testable
- ✅ Confidence scores are reasonable
- ❌ Too many generic hypotheses
- ❌ Root cause not in top 5

**Pass Threshold**: 4/5 test cases must have root cause in top 3 hypotheses

---

### Test 2: Hypothesis Ranking Accuracy

**Hypothesis**: Does the model rank hypotheses by likelihood correctly?

**Evaluation**:
```typescript
function scoreRanking(
  generatedHypotheses: Hypothesis[],
  rootCause: string
): number {
  // Find position of root cause in ranked list
  const position = generatedHypotheses.findIndex(
    h => h.hypothesis.includes(rootCause) ||
         rootCause.includes(h.hypothesis.split(" ")[0])
  );

  if (position === -1) return 0; // Not found
  if (position === 0) return 100; // Perfect
  if (position <= 2) return 80; // Very good
  if (position <= 4) return 60; // Good
  return 20; // Poor ranking
}
```

**Pass Threshold**: Average score across all test cases ≥70%

---

### Test 3: Response Time & Cost

**Hypothesis**: Can models generate hypotheses within budget?

**Metrics**:
| Model | Expected Speed | Expected Cost | Accept if |
|-------|-----------------|--------|--------|
| Cerebras thinking | 8-12s | $0.03 | <15s, <$0.05 |
| Qwen-3-235B | 8-15s | $0.02 | <20s, <$0.04 |
| Llama-3.1-405B (Groq) | 3-5s | $0.008 | <8s, <$0.01 |
| Qwen-2-72B (Groq) | 2-4s | $0.005 | <6s, <$0.008 |

**Test Setup**:
```bash
# Time the thinking model on a complex debugging scenario
time python -c "
from anthropic import Anthropic
client = Anthropic()

response = client.messages.create(
    model='claude-3-5-sonnet-20251022',  # Or target model
    max_tokens=2000,
    messages=[{
        'role': 'user',
        'content': '''You are a debugging expert. Analyze this error:
{errorMessage}

Code:
{code}

Generate 8 most likely root causes, ranked by likelihood.'''
    }]
)
print(response)
"
```

**Pass Threshold**: All models must complete within 20 seconds and cost <$0.05

---

### Test 4: Probe Accuracy (Integration Test)

**Hypothesis**: Do the generated hypotheses match well with probes?

**Test Setup**:
1. Use model to generate 8 hypotheses
2. Run 8 corresponding probes
3. Check how many confirmed hypotheses align with actual root cause

**Evaluation**:
```typescript
function scoreProbeAlignment(
  hypotheses: Hypothesis[],
  probeResults: ProbeResult[],
  rootCause: string
): number {
  const confirmedHypotheses = hypotheses.filter(
    (h, i) => probeResults[i].confirmed
  );

  // Check if confirmed hypotheses include/relate to root cause
  const relevantConfirmed = confirmedHypotheses.filter(
    h => rootCause.includes(h.hypothesis.split(" ")[0]) ||
         h.hypothesis.includes(rootCause.split(" ")[0])
  );

  return (relevantConfirmed.length / confirmedHypotheses.length) * 100;
}
```

**Pass Threshold**: ≥80% of confirmed hypotheses are relevant to root cause

---

## Test Execution Plan

### Phase 1: Baseline (Cerebras)
1. Run all 4 tests with Cerebras thinking model
2. Document baseline results
3. Set pass criteria

### Phase 2: Qwen-3-235B
1. Test with Cerebras API version
2. Compare to baseline
3. Decide: use or skip

### Phase 3: Llama-3.1-405B (Groq)
1. Test with Groq API
2. Compare cost/speed to baseline
3. Evaluate quality

### Phase 4: Qwen-2-72B (Groq)
1. Test with Groq API
2. Most cost-effective option
3. Decide if quality is acceptable

---

## Expected Outcomes

### Scenario A: Cerebras Thinking is Best (Likely)
- Use Cerebras thinking model for all cases
- Cost: $0.05 per debugging task
- Quality: 95%+ hypothesis hit rate
- **Decision**: Primary choice

### Scenario B: Qwen-3-235B Matches Cerebras
- Use Qwen-3-235B as primary
- Similar cost, similar quality
- **Decision**: Use Qwen if available

### Scenario C: Groq Models Are "Good Enough"
- Use Qwen-2-72B or Llama-405B via Groq
- Cost: $0.008 (3-4x cheaper)
- Quality: 80-85% hypothesis hit rate
- **Decision**: Use for cost-sensitive workloads
- **Trade-off**: Slightly lower accuracy, much better economics

### Scenario D: Open Source Models Underperform
- Stick with Cerebras thinking model
- Don't use Groq for thinking phase
- Groq still used for probing (same as design)

---

## Implementation Decision Tree

```
IF model_type == "simple_bug" (syntax errors):
  USE: Qwen-2-72B (cheapest, good enough)
  Cost: $0.003

ELSE IF model_type == "moderate_bug" (runtime errors):
  IF budget_conscious:
    USE: Llama-3.1-405B (Groq)
    Cost: $0.008
  ELSE:
    USE: Cerebras thinking
    Cost: $0.03

ELSE IF model_type == "complex_bug" (logic bugs):
  USE: Cerebras thinking (highest quality)
  Cost: $0.05

ENDIF
```

---

## Success Criteria

### Must-Have
- ✅ At least one open-source model (Qwen or Llama) achieves ≥70% pass rate
- ✅ Cost savings ≥30% vs Cerebras baseline
- ✅ Response time <20 seconds

### Nice-to-Have
- ✅ Multiple models available for different complexity tiers
- ✅ Groq-based option (low-latency inference)
- ✅ Cost savings ≥50% for simple bugs

### Cannot Accept
- ❌ Model fails >2 test cases (root cause not in top 5)
- ❌ Response time >30 seconds
- ❌ Cost exceeds $0.10 per task

---

## Fallback Strategy

If all open-source models underperform:
1. **Use Cerebras thinking** for all complexity levels
2. **Keep Groq for probing** (proven to work)
3. **Revisit in 6 months** when better open-source models available
4. **Cost**: $0.051 per task (still 9x better than serial approach)

---

## Testing Timeline

```
Week 1: Set up test infrastructure, baseline with Cerebras
Week 2: Test Qwen-3-235B and Llama-3.1-405B
Week 3: Analyze results, make decision
Week 4: Implement chosen model(s), integrate into cfn-troubleshooter-v2
```

---

## Command Templates

### Test with Cerebras API

```bash
curl -X POST https://api.cerebras.ai/v1/messages \
  -H "Authorization: Bearer $CEREBRAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet",
    "max_tokens": 2000,
    "messages": [{
      "role": "user",
      "content": "Generate 8 debugging hypotheses for: {error} in code: {code}"
    }]
  }' > test-results/cerebras-thinking.json
```

### Test with Groq API

```bash
curl -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-405b-reasoning",
    "messages": [{
      "role": "user",
      "content": "Generate 8 debugging hypotheses..."
    }],
    "max_tokens": 2000
  }' > test-results/groq-llama.json
```

---

## Next Steps After Verification

1. **Implement chosen model(s)** in `thinkingPhase()` function
2. **Add model selection logic** to task payload
3. **Update cost calculations** based on actual pricing
4. **Document model trade-offs** in CFN documentation
5. **Set up monitoring** for hypothesis quality metrics

---

**Status**: Ready for Testing

