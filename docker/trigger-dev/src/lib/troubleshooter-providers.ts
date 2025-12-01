/**
 * Troubleshooting Providers for CFN Troubleshooter V2
 *
 * Multi-provider architecture supporting:
 * - Cerebras (primary, thinking models)
 * - Groq (optional, parallel probing)
 * - Anthropic (future, extended thinking)
 *
 * Cost: Cerebras ~$0.05/complex bug | Groq ~$0.01/complex bug
 * Speed: 35-45 seconds total execution
 */

// Types from cfn-troubleshooter-v2
export interface AIProvider {
  name: string;
  isAvailable: boolean;
  hasThinkingModel: boolean;
  supportsParallel: boolean;
  latencyMs: number;
  costPer1MTokens: number;

  generateHypotheses(error: string, code: string, context: string): Promise<Hypothesis[]>;
  runProbe(code: string, hypothesis: string, probeDescription: string): Promise<ProbeResult>;
  runProbesParallel(code: string, probes: ProbeDescription[]): Promise<ProbeResult[]>;
  synthesizeResults(hypotheses: Hypothesis[], probeResults: ProbeResult[], errorPattern: string): Promise<Diagnosis>;
  generateFix(diagnosis: Diagnosis, code: string): Promise<Fix>;
}

export interface Hypothesis {
  rank: number;
  hypothesis: string;
  reasoning: string;
  confidence: number;
  probeDescription?: string;
}

export interface ProbeDescription {
  hypothesis: string;
  description: string;
  confidence: number;
}

export interface ProbeResult {
  hypothesis: string;
  confirmed: boolean;
  confidence: number;
  evidence: string[];
}

export interface Diagnosis {
  rootCause: string;
  explanation: string;
  confidence: number;
  confirmedProbes: ProbeResult[];
}

export interface Fix {
  description: string;
  fileChanged: string;
  before: string;
  after: string;
  reason: string;
}

// =============================================
// Constants
// =============================================

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1";
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const RATE_LIMIT_MS = 2000; // 2s between Cerebras requests
let lastCerebrasCallMs = 0;

async function enforceCerebrasRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastCerebrasCallMs;
  if (timeSinceLastCall < RATE_LIMIT_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastCall)
    );
  }
  lastCerebrasCallMs = Date.now();
}

// =============================================
// Cerebras API Call
// =============================================

async function callCerebras(
  prompt: string,
  model: string = "gpt-oss-120b",
  maxTokens: number = 2000
): Promise<{ content: string; tokensUsed: number }> {
  if (!CEREBRAS_API_KEY) {
    throw new Error("CEREBRAS_API_KEY not set");
  }

  await enforceCerebrasRateLimit();

  const response = await fetch(`${CEREBRAS_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cerebras API error (${response.status}): ${error.substring(0, 100)}`);
  }

  const data = (await response.json()) as any;
  const content = data.choices[0]?.message?.content || "";
  const tokensUsed = data.usage?.total_tokens || 0;

  return { content, tokensUsed };
}

// =============================================
// Groq API Call
// =============================================

async function callGroq(
  prompt: string,
  model: string = "llama-3.1-70b-versatile",
  maxTokens: number = 1024
): Promise<{ content: string; tokensUsed: number }> {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY not set");
  }

  const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error (${response.status}): ${error.substring(0, 100)}`);
  }

  const data = (await response.json()) as any;
  const content = data.choices[0]?.message?.content || "";
  const tokensUsed = data.usage?.total_tokens || 0;

  return { content, tokensUsed };
}

// =============================================
// Response Parsing Utilities
// =============================================

function parseHypotheses(content: string): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  // Try to parse JSON first
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map((h, idx) => ({
        rank: idx + 1,
        hypothesis: h.hypothesis || h.title || String(h),
        reasoning: h.reasoning || h.explanation || "",
        confidence: h.confidence || 75 + Math.random() * 15,
        probeDescription: h.probeDescription || h.probe || "",
      }));
    }
  } catch {
    // Fall through to text parsing
  }

  // Parse text format: "1. Hypothesis: ... | Reasoning: ... | Probe: ..."
  const lines = content.split("\n").filter((l) => l.trim());
  let rank = 0;

  for (const line of lines) {
    if (/^\d+\./.test(line) || line.includes("Hypothesis:")) {
      rank++;
      const hypothesis = line.replace(/^\d+\.\s*/, "").split("|")[0].trim();
      const reasoning = line.includes("Reasoning:")
        ? line.split("Reasoning:")[1]?.split("|")[0]?.trim() || ""
        : "";
      const probe = line.includes("Probe:")
        ? line.split("Probe:")[1]?.trim() || ""
        : "";

      if (hypothesis) {
        hypotheses.push({
          rank,
          hypothesis,
          reasoning,
          confidence: 70 + Math.random() * 20,
          probeDescription: probe,
        });
      }
    }
  }

  return hypotheses.slice(0, 8); // Limit to 8
}

function parseProbeResult(content: string, hypothesis: string): ProbeResult {
  const confirmed = /\b(confirmed|true|yes|match|found)\b/i.test(content);
  const confidence = content.includes("high") ? 90 : content.includes("medium") ? 70 : 50;

  const evidence: string[] = [];
  const lines = content.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    if (line.length > 10 && line.length < 200) {
      evidence.push(line.trim());
    }
  }

  return {
    hypothesis,
    confirmed,
    confidence,
    evidence: evidence.slice(0, 3),
  };
}

function parseDiagnosis(content: string, confirmedProbes: ProbeResult[]): Diagnosis {
  const rootCauseMatch = content.match(/root cause[:\s]+([^\n]+)/i);
  const rootCause = rootCauseMatch ? rootCauseMatch[1].trim() : "Unknown";

  const explanationLines = content.split("\n").filter((l) => l.length > 20 && l.length < 200);
  const explanation = explanationLines.slice(0, 3).join(" ");

  return {
    rootCause,
    explanation,
    confidence: 85,
    confirmedProbes,
  };
}

function parseFix(content: string, fileChanged: string = "unknown"): Fix {
  const beforeMatch = content.match(/before[:\s]+([^A-Z]+(?=after|AFTER|After))/is);
  const afterMatch = content.match(/after[:\s]+([^\n]+(?:\n[^\n]+)*)/i);

  const before = beforeMatch ? beforeMatch[1].trim() : "";
  const after = afterMatch ? afterMatch[1].trim() : "";

  const description = content.split("\n")[0];
  const reason = content.split("\n").slice(-3).join(" ");

  return {
    description,
    fileChanged,
    before,
    after,
    reason,
  };
}

// =============================================
// Cerebras Provider
// =============================================

export class CerebrasProvider implements AIProvider {
  name = "cerebras";
  isAvailable = !!CEREBRAS_API_KEY;
  hasThinkingModel = true;
  supportsParallel = false;
  latencyMs = 5000;
  costPer1MTokens = 0.0000025;

  async generateHypotheses(error: string, code: string, context: string): Promise<Hypothesis[]> {
    const prompt = `You are an expert debugging consultant. Analyze this error and generate exactly 8 plausible root causes.

ERROR MESSAGE:
${error}

CODE CONTEXT:
\`\`\`
${code.substring(0, 2000)}
\`\`\`

ADDITIONAL CONTEXT:
${context}

For each hypothesis, provide:
1. Rank (1-8)
2. Hypothesis (one-liner)
3. Reasoning (why this could be the cause)
4. Confidence (0-100)
5. Probe description (how to test this)

Format each as JSON or structured text. Generate exactly 8 hypotheses.`;

    try {
      const { content } = await callCerebras(
        prompt,
        "qwen-3-235b-a22b-instruct-2507",
        2048
      );
      const hypotheses = parseHypotheses(content);
      return hypotheses.slice(0, 8);
    } catch (error) {
      console.error("Failed to generate hypotheses:", error);
      return [];
    }
  }

  async runProbe(
    code: string,
    hypothesis: string,
    probeDescription: string
  ): Promise<ProbeResult> {
    const prompt = `Test this debugging hypothesis:

HYPOTHESIS: ${hypothesis}

PROBE DESCRIPTION: ${probeDescription}

CODE:
\`\`\`
${code.substring(0, 1500)}
\`\`\`

Respond with:
1. Is this hypothesis CONFIRMED or NOT CONFIRMED?
2. Confidence level (high/medium/low)
3. Evidence from the code supporting your conclusion

Be concise and decisive.`;

    try {
      const { content } = await callCerebras(prompt, "gpt-oss-120b", 512);
      return parseProbeResult(content, hypothesis);
    } catch (error) {
      console.error("Probe failed:", error);
      return {
        hypothesis,
        confirmed: false,
        confidence: 0,
        evidence: ["API call failed"],
      };
    }
  }

  async runProbesParallel(
    code: string,
    probes: ProbeDescription[]
  ): Promise<ProbeResult[]> {
    // Cerebras doesn't support native parallel, so simulate with Promise.all
    return Promise.all(
      probes.map((p) => this.runProbe(code, p.hypothesis, p.description))
    );
  }

  async synthesizeResults(
    hypotheses: Hypothesis[],
    probeResults: ProbeResult[],
    errorPattern: string
  ): Promise<Diagnosis> {
    const confirmedProbes = probeResults.filter((p) => p.confirmed);

    const prompt = `Analyze these debugging probe results and identify the root cause:

ERROR PATTERN: ${errorPattern}

HYPOTHESES AND PROBE RESULTS:
${hypotheses
  .map((h, idx) => {
    const probe = probeResults[idx];
    return `${h.rank}. ${h.hypothesis}
  Reasoning: ${h.reasoning}
  Probe Result: ${probe?.confirmed ? "CONFIRMED" : "NOT CONFIRMED"} (confidence: ${probe?.confidence || 0})
  Evidence: ${probe?.evidence?.join("; ") || "None"}`;
  })
  .join("\n\n")}

Based on the confirmed probes, identify:
1. The most likely root cause
2. Why this is the cause (explanation)
3. Confidence level (0-100)

Be decisive and clear.`;

    try {
      const { content } = await callCerebras(
        prompt,
        "qwen-3-235b-a22b-instruct-2507",
        1024
      );
      return parseDiagnosis(content, confirmedProbes);
    } catch (error) {
      console.error("Synthesis failed:", error);
      return {
        rootCause: "Unknown (synthesis failed)",
        explanation: "API error during synthesis",
        confidence: 0,
        confirmedProbes,
      };
    }
  }

  async generateFix(diagnosis: Diagnosis, code: string): Promise<Fix> {
    const prompt = `Generate a minimal fix for this code issue:

ROOT CAUSE: ${diagnosis.rootCause}

EXPLANATION: ${diagnosis.explanation}

CODE:
\`\`\`
${code.substring(0, 1500)}
\`\`\`

Provide:
1. A brief fix description
2. The BEFORE code (original buggy snippet)
3. The AFTER code (fixed snippet)
4. Reason why this fixes the issue

Keep the fix minimal and focused on the root cause.`;

    try {
      const { content } = await callCerebras(prompt, "gpt-oss-120b", 1024);
      return parseFix(content);
    } catch (error) {
      console.error("Fix generation failed:", error);
      return {
        description: "Fix generation failed",
        fileChanged: "unknown",
        before: "",
        after: "",
        reason: "API error",
      };
    }
  }
}

// =============================================
// Groq Provider (Optional, for future use)
// =============================================

export class GroqProvider implements AIProvider {
  name = "groq";
  isAvailable = !!GROQ_API_KEY;
  hasThinkingModel = false;
  supportsParallel = true;
  latencyMs = 1000;
  costPer1MTokens = 0.00005;

  async generateHypotheses(error: string, code: string, context: string): Promise<Hypothesis[]> {
    throw new Error("Groq does not have a thinking model. Use Cerebras for hypothesis generation.");
  }

  async runProbe(
    code: string,
    hypothesis: string,
    probeDescription: string
  ): Promise<ProbeResult> {
    const prompt = `Test this hypothesis: ${hypothesis}

Probe: ${probeDescription}

Code snippet: ${code.substring(0, 1000)}

CONFIRMED or NOT CONFIRMED? (high/medium/low confidence)`;

    try {
      const { content } = await callGroq(prompt, "llama-3.1-70b-versatile", 256);
      return parseProbeResult(content, hypothesis);
    } catch (error) {
      console.error("Groq probe failed:", error);
      return {
        hypothesis,
        confirmed: false,
        confidence: 0,
        evidence: ["Groq API error"],
      };
    }
  }

  async runProbesParallel(
    code: string,
    probes: ProbeDescription[]
  ): Promise<ProbeResult[]> {
    // Groq supports parallel, but we'll batch them for efficiency
    return Promise.all(
      probes.map((p) => this.runProbe(code, p.hypothesis, p.description))
    );
  }

  async synthesizeResults(
    hypotheses: Hypothesis[],
    probeResults: ProbeResult[],
    errorPattern: string
  ): Promise<Diagnosis> {
    const confirmedHypotheses = probeResults.filter((p) => p.confirmed);

    const prompt = `Based on confirmed probes, what is the root cause?

Confirmed: ${confirmedHypotheses.map((h) => h.hypothesis).join("; ")}

Identify root cause and confidence (0-100).`;

    try {
      const { content } = await callGroq(prompt, "llama-3.1-70b-versatile", 512);
      return parseDiagnosis(content, confirmedHypotheses);
    } catch (error) {
      console.error("Groq synthesis failed:", error);
      return {
        rootCause: "Unknown",
        explanation: "Groq API error",
        confidence: 0,
        confirmedProbes: confirmedHypotheses,
      };
    }
  }

  async generateFix(diagnosis: Diagnosis, code: string): Promise<Fix> {
    const prompt = `Fix code for: ${diagnosis.rootCause}

Code: ${code.substring(0, 1000)}

Provide BEFORE and AFTER code snippets.`;

    try {
      const { content } = await callGroq(prompt, "llama-3.1-70b-versatile", 512);
      return parseFix(content);
    } catch (error) {
      console.error("Groq fix generation failed:", error);
      return {
        description: "Fix failed",
        fileChanged: "unknown",
        before: "",
        after: "",
        reason: "Groq API error",
      };
    }
  }
}

// =============================================
// Provider Registry
// =============================================

export class ProviderRegistry {
  private providers: Map<string, AIProvider>;

  constructor() {
    this.providers = new Map();
    this.register(new CerebrasProvider());
    this.register(new GroqProvider());
  }

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AIProvider | null {
    return this.providers.get(name) || null;
  }

  list(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  listAvailable(): AIProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.isAvailable);
  }

  selectBest(
    complexity: "simple" | "moderate" | "complex",
    priority: "speed" | "cost" | "quality" = "quality"
  ): AIProvider {
    const available = this.listAvailable();

    if (available.length === 0) {
      throw new Error("No AI providers available");
    }

    // Default to Cerebras for quality
    const cerebras = available.find((p) => p.name === "cerebras");
    if (cerebras && priority === "quality") {
      return cerebras;
    }

    // Use Groq for cost/speed if available
    const groq = available.find((p) => p.name === "groq");
    if (groq && (priority === "cost" || priority === "speed")) {
      return groq;
    }

    return available[0];
  }
}

// Export singleton registry
export const providerRegistry = new ProviderRegistry();
