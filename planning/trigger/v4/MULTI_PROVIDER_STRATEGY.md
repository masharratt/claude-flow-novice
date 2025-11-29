# Multi-Provider Architecture for Troubleshooting V2

**Status**: Design | **Date**: 2025-11-28

## Objective

Design troubleshooting-v2 to support **multiple inference providers** (Cerebras primary, Groq optional, others extensible) without hardcoding provider logic.

---

## Provider Abstraction

### Provider Interface

```typescript
interface AIProvider {
  // Identification
  name: "cerebras" | "groq" | "anthropic" | string;
  isAvailable: boolean;

  // Capabilities
  hasThinkingModel: boolean;
  supportsParallel: boolean;
  latencyMs: number;           // Average response time
  costPer1MTokens: number;     // Pricing for comparison

  // Thinking Phase
  generateHypotheses(
    error: string,
    code: string,
    context: string
  ): Promise<Hypothesis[]>;

  // Probing Phase
  runProbe(
    code: string,
    hypothesis: string,
    probeDescription: string
  ): Promise<ProbeResult>;

  runProbesParallel(
    code: string,
    probes: ProbeDescription[]
  ): Promise<ProbeResult[]>;

  // Synthesis Phase
  synthesizeResults(
    hypotheses: Hypothesis[],
    probeResults: ProbeResult[],
    errorPattern: string
  ): Promise<Diagnosis>;

  // Fix Phase
  generateFix(
    diagnosis: Diagnosis,
    code: string
  ): Promise<Fix>;
}
```

### Provider Registry

```typescript
interface ProviderRegistry {
  // Get provider by name
  get(name: string): AIProvider | null;

  // List available providers
  list(): AIProvider[];

  // Get best provider for task
  selectBest(
    complexity: "simple" | "moderate" | "complex",
    priority: "speed" | "cost" | "quality"
  ): AIProvider;

  // Register new provider
  register(provider: AIProvider): void;
}

const PROVIDER_REGISTRY = {
  cerebras: CerebrasProvider,      // Primary
  groq: GroqProvider,               // Optional (Kimi-2 acceleration)
  anthropic: AnthropicProvider,     // Future
};
```

---

## Implementation Strategy

### Phase 1: Cerebras-Only (Default)

```typescript
class CerebrasProvider implements AIProvider {
  name = "cerebras";
  isAvailable = true;
  hasThinkingModel = true;
  supportsParallel = false;         // Sequential API calls
  latencyMs = 5000;
  costPer1MTokens = 0.0000025;

  async generateHypotheses(...): Promise<Hypothesis[]> {
    // Call Cerebras thinking model
    // Parse response into 8 hypotheses
  }

  async runProbe(...): Promise<ProbeResult> {
    // Single probe via Cerebras
  }

  async runProbesParallel(code, probes): Promise<ProbeResult[]> {
    // Simulate parallel: run all probes, collect results
    // Cost: sequential API calls
    // Time: O(n) where n = probe count
    return Promise.all(
      probes.map(p => this.runProbe(code, p.hypothesis, p.description))
    );
  }

  async synthesizeResults(...): Promise<Diagnosis> {
    // Use Cerebras thinking model to analyze probe results
  }

  async generateFix(...): Promise<Fix> {
    // Generate fix via Cerebras
  }
}
```

### Phase 2: Add Groq (Optional, Kimi-2 Path)

```typescript
class GroqProvider implements AIProvider {
  name = "groq";
  isAvailable = process.env.GROQ_API_KEY ? true : false;
  hasThinkingModel = false;         // Groq doesn't have thinking model
  supportsParallel = true;          // Native parallel request support
  latencyMs = 1000;                 // Much faster
  costPer1MTokens = 0.00005;        // Much cheaper

  async generateHypotheses(...): Promise<Hypothesis[]> {
    // Groq doesn't have thinking model
    // Would use Kimi-2 via Groq for acceleration
    throw new Error("Use Cerebras or external model for thinking phase");
  }

  async runProbesParallel(code, probes): Promise<ProbeResult[]> {
    // Native parallel support - send all probes at once
    // Cost: single batch call
    // Time: O(1) - all parallel
    return groq.batch([...probes]);
  }

  // Other methods similar to Cerebras
}
```

### Phase 3: Add Anthropic Direct (Optional)

```typescript
class AnthropicProvider implements AIProvider {
  name = "anthropic";
  hasThinkingModel = true;          // Claude with extended thinking
  supportsParallel = false;
  latencyMs = 8000;
  costPer1MTokens = 0.000005;

  // Implementation similar to CerebrasProvider
}
```

---

## Task Configuration with Provider Selection

### Updated Payload

```typescript
interface TroubleshooterV2Payload {
  // ... existing fields ...

  // New: Provider configuration
  provider?: {
    thinking: "cerebras" | "groq" | "anthropic";     // Which provider for thinking
    probing: "cerebras" | "groq";                     // Which provider for probes
    synthesis: "cerebras" | "groq" | "anthropic";    // Which for synthesis
  };

  // Or simpler: auto-select based on priority
  providerPriority?: "speed" | "cost" | "quality";  // Default: "quality"
}
```

### Provider Selection Logic

```typescript
function selectProviders(
  payload: TroubleshooterV2Payload,
  complexity: "simple" | "moderate" | "complex"
): { thinking: AIProvider; probing: AIProvider; synthesis: AIProvider } {
  // If explicitly specified, use those
  if (payload.provider) {
    return {
      thinking: REGISTRY.get(payload.provider.thinking),
      probing: REGISTRY.get(payload.provider.probing),
      synthesis: REGISTRY.get(payload.provider.synthesis)
    };
  }

  // Otherwise, auto-select based on priority
  const priority = payload.providerPriority || "quality";

  switch (complexity) {
    case "simple":
      if (priority === "cost") {
        return {
          thinking: REGISTRY.get("groq"),  // If Kimi available
          probing: REGISTRY.get("groq"),
          synthesis: REGISTRY.get("groq")
        };
      }
      // Fall through to default

    case "moderate":
    case "complex":
    default:
      return {
        thinking: REGISTRY.get("cerebras"),  // Primary
        probing: REGISTRY.get("cerebras"),
        synthesis: REGISTRY.get("cerebras")
      };
  }
}
```

---

## Probe Execution Across Providers

### Single Provider (Cerebras)

```typescript
async function runProbesCerebras(
  provider: AIProvider,
  code: string,
  probes: ProbeDescription[]
): Promise<ProbeResult[]> {
  // Cerebras doesn't natively support parallel
  // Simulate with Promise.all
  return Promise.all(
    probes.map(p => provider.runProbe(code, p.hypothesis, p.description))
  );
  // Time: sequential API calls = ~8-10s for 8 probes
  // Cost: 8 × $0.0001 = $0.0008
}
```

### Multi-Provider (Cerebras + Groq)

```typescript
async function runProbesMultiProvider(
  cerebrasProvider: AIProvider,
  groqProvider: AIProvider,
  code: string,
  probes: ProbeDescription[]
): Promise<ProbeResult[]> {
  // Split probes between providers
  const cerebrasProbes = probes.slice(0, 4);  // First 4
  const groqProbes = probes.slice(4);         // Last 4

  const [cerebrasResults, groqResults] = await Promise.all([
    cerebrasProvider.runProbesParallel(code, cerebrasProbes),
    groqProvider.runProbesParallel(code, groqProbes)  // Groq native parallel
  ]);

  return [...cerebrasResults, ...groqResults];
  // Time: max(cerebras sequential, groq parallel) = ~5-8s
  // Cost: cerebras $0.0004 + groq $0.0002 = $0.0006 (25% savings)
}
```

### Ideal (Pure Groq if available)

```typescript
async function runProbesGroq(
  provider: AIProvider,
  code: string,
  probes: ProbeDescription[]
): Promise<ProbeResult[]> {
  // Groq's native parallel support
  return provider.runProbesParallel(code, probes);
  // Time: ~1-2s for all probes
  // Cost: ~$0.0002 (75% cheaper than Cerebras)
}
```

---

## Updated Task Implementation

### Multi-Provider Thinking Phase

```typescript
async function thinkingPhase(
  payload: TroubleshooterV2Payload,
  providers: { thinking: AIProvider; probing: AIProvider; synthesis: AIProvider },
  startTime: number
): Promise<Hypothesis[]> {
  console.log(`[troubleshooter-v2] Phase 1: THINKING`);
  console.log(`  Provider: ${providers.thinking.name}`);

  const hypotheses = await providers.thinking.generateHypotheses(
    payload.errorMessage,
    payload.codeFiles.map(f => f.content).join("\n"),
    payload.additionalContext || ""
  );

  const thinkingTime = Date.now() - startTime;
  console.log(`  Generated ${hypotheses.length} hypotheses in ${thinkingTime}ms`);

  return hypotheses;
}
```

### Multi-Provider Probing Phase

```typescript
async function probingPhase(
  hypotheses: Hypothesis[],
  payload: TroubleshooterV2Payload,
  providers: { thinking: AIProvider; probing: AIProvider; synthesis: AIProvider },
  startTime: number
): Promise<ProbeResult[]> {
  console.log(`[troubleshooter-v2] Phase 2: PROBING`);
  console.log(`  Provider: ${providers.probing.name}`);
  console.log(`  Parallel support: ${providers.probing.supportsParallel}`);

  const probes = hypotheses.map(h => ({
    hypothesis: h.hypothesis,
    description: h.probeDescription,
    confidence: h.confidence
  }));

  const code = payload.codeFiles.map(f => f.content).join("\n");

  let results: ProbeResult[];

  if (providers.probing.supportsParallel) {
    // Native parallel (Groq)
    results = await providers.probing.runProbesParallel(code, probes);
  } else {
    // Simulated parallel (Cerebras)
    results = await Promise.all(
      probes.map(p =>
        providers.probing.runProbe(code, p.hypothesis, p.description)
      )
    );
  }

  const probingTime = Date.now() - startTime;
  console.log(`  Completed in ${probingTime}ms via ${providers.probing.name}`);

  return results;
}
```

---

## Configuration Examples

### Example 1: Cerebras-Only (Default)

```json
{
  "taskId": "trouble-001",
  "errorMessage": "Agent status stuck on running",
  "providerPriority": "quality"
}

// Auto-selects:
// - Thinking: cerebras (has thinking model)
// - Probing: cerebras (primary provider)
// - Synthesis: cerebras
// Cost: $0.051 | Speed: 35-45s
```

### Example 2: Cost-Optimized (Future, with Groq)

```json
{
  "taskId": "trouble-002",
  "errorMessage": "Type error in React component",
  "providerPriority": "cost"
}

// Auto-selects:
// - Thinking: groq (has Kimi-2 thinking via acceleration)
// - Probing: groq (native parallel, cheaper)
// - Synthesis: groq
// Cost: $0.015 | Speed: 12-15s
// (Only if Groq available, else falls back to cerebras)
```

### Example 3: Explicit Multi-Provider Mix

```json
{
  "taskId": "trouble-003",
  "errorMessage": "Logic bug in distributed system",
  "provider": {
    "thinking": "cerebras",      // Best thinking
    "probing": "groq",           // Fast parallel
    "synthesis": "cerebras"      // Reliable synthesis
  }
}

// Uses:
// - Cerebras thinking for hypothesis generation
// - Groq parallel for fast probing
// - Cerebras synthesis for final diagnosis
// Cost: ~$0.03 | Speed: ~15s
```

---

## Provider Fallback Chain

```typescript
interface ProviderConfig {
  preferred: AIProvider;
  fallback: AIProvider[];
}

// Example fallback for thinking phase:
const THINKING_FALLBACK = {
  preferred: REGISTRY.get("cerebras"),
  fallback: [
    REGISTRY.get("anthropic"),
    REGISTRY.get("groq-kimi")  // If Kimi available
  ]
};

async function getThinkingProvider(): Promise<AIProvider> {
  const config = THINKING_FALLBACK;

  if (config.preferred.isAvailable) {
    return config.preferred;
  }

  for (const provider of config.fallback) {
    if (provider.isAvailable) {
      console.warn(`Preferred provider unavailable, using ${provider.name}`);
      return provider;
    }
  }

  throw new Error("No thinking provider available");
}
```

---

## Cost Tracking by Provider

```typescript
interface ProviderMetrics {
  provider: string;
  phase: "thinking" | "probing" | "synthesis" | "fix";
  tokensUsed: number;
  cost: number;
  latencyMs: number;
  confidence: number;
}

// Log metrics per provider
const metrics: ProviderMetrics[] = [];

metrics.push({
  provider: "cerebras",
  phase: "thinking",
  tokensUsed: 2000,
  cost: 0.025,
  latencyMs: 8000,
  confidence: 95
});

// Analytics: which providers are being used?
function analyzeProviderUsage(metrics: ProviderMetrics[]) {
  const byProvider = new Map<string, ProviderMetrics[]>();

  for (const m of metrics) {
    if (!byProvider.has(m.provider)) {
      byProvider.set(m.provider, []);
    }
    byProvider.get(m.provider)!.push(m);
  }

  return Object.fromEntries(
    Array.from(byProvider.entries()).map(([provider, items]) => [
      provider,
      {
        usage: items.length,
        avgCost: items.reduce((sum, m) => sum + m.cost, 0) / items.length,
        avgLatency: items.reduce((sum, m) => sum + m.latencyMs, 0) / items.length
      }
    ])
  );
}
```

---

## Testing Multi-Provider

### Test 1: Cerebras-Only (Current)

```bash
npm test cfn-troubleshooter-v2 -- --provider cerebras --test-bugs 5
# Expected: 80%+ pass rate, <45s per bug, $0.051 per bug
```

### Test 2: Add Groq (When Available)

```bash
npm test cfn-troubleshooter-v2 -- --provider groq --test-bugs 5
# Expected: 75%+ pass rate, <15s per bug, <$0.02 per bug
# Note: Quality might be slightly lower, speed/cost much better
```

### Test 3: Hybrid (If beneficial)

```bash
npm test cfn-troubleshooter-v2 -- --provider hybrid --test-bugs 5
# Expected: 85%+ pass rate, <20s per bug, $0.03 per bug
# Cerebras for thinking + synthesis, Groq for probing
```

---

## Provider Extensibility

Adding a new provider is simple:

```typescript
class CustomProvider implements AIProvider {
  name = "custom";
  isAvailable = true;
  hasThinkingModel = true;
  supportsParallel = false;
  latencyMs = 3000;
  costPer1MTokens = 0.000001;

  async generateHypotheses(...) { /* ... */ }
  async runProbe(...) { /* ... */ }
  async runProbesParallel(...) { /* ... */ }
  async synthesizeResults(...) { /* ... */ }
  async generateFix(...) { /* ... */ }
}

// Register it
PROVIDER_REGISTRY.register(new CustomProvider());

// It's now available for selection
```

---

## Summary: Architecture Benefits

| Aspect | Cerebras-Only | Multi-Provider |
|--------|--------------|-----------------|
| **Setup** | Simple | Slightly complex |
| **Flexibility** | Low | High |
| **Cost** | Fixed | Optimizable |
| **Speed** | Consistent | Variable |
| **Fallback** | None | Automatic |
| **Future-Ready** | No | Yes |

**Recommendation**: Build multi-provider architecture from day 1, use Cerebras as default. Adds ~10% complexity, enables 10x future flexibility.

---

**Status**: Design Ready for Implementation
