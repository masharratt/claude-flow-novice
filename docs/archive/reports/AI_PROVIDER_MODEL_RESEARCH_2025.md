# AI Provider Model Research (Late 2024 / Early 2025)

**Research Date**: 2025-11-26
**Purpose**: Comprehensive overview of available models from key AI providers for CFN Loop integration

---

## 1. Z.ai (GLM Models)

### Provider Information
- **Website**: https://z.ai
- **API Endpoint**: https://api.z.ai/api/paas/v4/chat/completions
- **Documentation**: https://docs.z.ai

### Available Models

#### GLM-4.6 (Current Flagship - Released Sept 2025)
- **Model ID**: `glm-4.6`
- **Context Window**: 200K tokens
- **Max Output**: 128K tokens
- **Architecture**: MoE (355B total parameters, 32B active)
- **Pricing**:
  - Input: $0.40 per 1M tokens
  - Output: $1.75 per 1M tokens
- **Capability Tier**: High (matches Claude Sonnet 4)
- **Cost Tier**: Low
- **Special Characteristics**:
  - Designed for agentic applications
  - Strong coding, reasoning, and tool-calling
  - Native function calling

#### GLM-4.5 (Previous Generation - Released July 2025)
- **Model ID**: `glm-4.5`
- **Context Window**: 128K tokens
- **Architecture**: MoE (355B total, 32B active)
- **Pricing**: Lower than GLM-4.6
- **Capability Tier**: Medium-High
- **Special Characteristics**:
  - Hybrid reasoning modes (Thinking/Non-Thinking)
  - Agent-oriented design

#### GLM-4.5-Air (Lightweight Variant)
- **Model ID**: `glm-4.5-air`
- **Context Window**: 128K tokens
- **Architecture**: MoE (106B total, 12B active)
- **Pricing**: $0.20 per 1M input tokens, $1.10 per 1M output tokens
- **Capability Tier**: Medium
- **Cost Tier**: Very Low
- **Special Characteristics**: Free tier available on OpenRouter

### Provider Tier Recommendation
**Best for**: Cost-sensitive production workloads, high-volume agentic tasks
**CFN Loop Usage**: Default provider for cost optimization (95-98% savings vs premium providers)

---

## 2. Kimi (Moonshot AI)

### Provider Information
- **Website**: https://platform.moonshot.cn (China), https://platform.moonshot.ai (International)
- **Documentation**: https://platform.moonshot.ai/docs
- **API Compatibility**: OpenAI/Anthropic-compatible

### Available Models

#### Kimi K2 (Current Flagship - Released July 2025)
- **Model ID**: `kimi-k2-0711-preview`
- **Context Window**: 256K tokens (doubled from 128K in Sept 2025)
- **Architecture**: MoE (1T total parameters, 32B active)
- **Pricing**:
  - Input (Cache Hit): $0.15 per 1M tokens
  - Input (Cache Miss): $0.60 per 1M tokens
  - Output: $2.50 per 1M tokens
- **Capability Tier**: High
- **Cost Tier**: Low-Medium
- **Special Characteristics**:
  - Exceptional long-context processing (2M characters)
  - State-of-the-art coding (SWE-bench Verified)
  - Turbo variant available (40 tokens/sec vs 10 tokens/sec)
  - Context caching for cost savings

#### Kimi K2 Thinking (Released Nov 2025)
- **Model ID**: (Similar to K2 base with reasoning mode)
- **Capability Tier**: Very High
- **Special Characteristics**:
  - Advanced reasoning capabilities
  - Competitive with GPT-5 and Claude Sonnet 4.5

#### Legacy Models (moonshot-v1 series)
- **Model IDs**:
  - `moonshot-v1-8k`
  - `moonshot-v1-32k`
  - `moonshot-v1-128k`
  - `moonshot-v1-auto` (auto-selects appropriate variant)
- **Status**: Legacy, still available but superseded by K2

### Provider Tier Recommendation
**Best for**: Balanced quality/cost, long-context tasks, coding workflows
**CFN Loop Usage**: Recommended for standard mode with provider routing

---

## 3. Google Gemini

### Provider Information
- **Website**: https://ai.google.dev
- **API Endpoint**: Google AI Studio / Vertex AI
- **Documentation**: https://ai.google.dev/gemini-api/docs

### Available Models (Current Generation)

#### Gemini 3 Series (Preview - Nov 2025)
- **Model IDs**:
  - `gemini-3-pro-preview`
  - `gemini-3-pro-image-preview`
- **Context Window**:
  - Pro: 1,048,576 input / 65,536 output
  - Pro Image: 65,536 input / 32,768 output
- **Pricing**: $2/input MTok, $12/output MTok
- **Capability Tier**: Very High
- **Cost Tier**: High
- **Special Characteristics**:
  - Multimodal (text, image, video, audio, PDF)
  - Image generation capability
  - Pay-as-you-go only (no free tier)

#### Gemini 2.5 Series (Stable - 2025)
- **Model IDs**:
  - `gemini-2.5-pro` - Flagship model
  - `gemini-2.5-flash` - Best price/performance
  - `gemini-2.5-flash-lite` - Cost-optimized
  - `gemini-2.5-flash-image` - Image generation
  - `gemini-2.5-flash-native-audio-preview-09-2025` - Audio I/O
  - `gemini-2.5-pro-preview-tts` - Text-to-speech
- **Context Windows**:
  - Pro/Flash/Flash-Lite: 1,048,576 input / 65,536 output
  - Flash Image: 65,536 / 32,768
  - Native Audio: 131,072 / 8,192
  - TTS: 8,192 / 16,384
- **Pricing** (per 1M tokens):
  - Flash-Lite: $0.10 input / $0.40 output
  - 2.5 Flash: $0.30 input / $2.50 output
  - 2.5 Pro: $1.25 input / $10 output
- **Capability Tier**: High (Pro), Medium-High (Flash)
- **Cost Tier**: Low (Flash-Lite), Medium (Flash), Medium-High (Pro)
- **Special Characteristics**:
  - Free tier available (with rate limits)
  - 50% batch processing discount
  - 90% cost savings with context caching
  - Long-context pricing: 2x for >200K tokens

#### Gemini 2.0 Series (Previous Stable)
- **Model IDs**:
  - `gemini-2.0-flash`
  - `gemini-2.0-flash-lite`
- **Context Window**: 1,048,576 input / 8,192 output
- **Pricing**: $0.10 input / $0.40 output (Flash and Flash-Lite)
- **Capability Tier**: Medium-High
- **Special Characteristics**: Multimodal Live API support

### Deprecated Models
- Gemini 1.5 Pro/Flash fully retired for new projects as of April 29, 2025

### Provider Tier Recommendation
**Best for**: Multimodal applications, Google ecosystem integration, batch processing
**CFN Loop Usage**: Alternative for multimodal tasks or Google Cloud customers

---

## 4. Anthropic Claude

### Provider Information
- **Website**: https://www.anthropic.com
- **API Endpoint**: https://api.anthropic.com
- **Documentation**: https://platform.claude.com/docs

### Available Models (Current Generation)

#### Claude Opus 4.5 (Released Nov 24, 2025)
- **Model ID**: `claude-opus-4-5-20251101`
- **API Alias**: `claude-opus-4-5`
- **Context Window**: 200K tokens
- **Pricing**: $5/input MTok, $25/output MTok
- **Capability Tier**: Very High (state-of-the-art for agentic coding)
- **Cost Tier**: Medium-High (significantly reduced from previous Opus models)
- **Special Characteristics**:
  - Top performance on SWE-bench Verified
  - Professional software engineering
  - Long-horizon agentic workflows
  - High-stakes enterprise tasks

#### Claude Opus 4.1 (Released Aug 5, 2025)
- **Model ID**: `claude-opus-4-1-20250805`
- **Context Window**: 200K tokens
- **Pricing**: $15/input MTok, $75/output MTok
- **Capability Tier**: Very High
- **Cost Tier**: Very High
- **Special Characteristics**: Enhanced for agentic tasks

#### Claude Sonnet 4.5 (Released Sept 29, 2025)
- **Model ID**: `claude-sonnet-4-5-20250929`
- **API Alias**: `claude-sonnet-4-5`
- **Context Window**: 200K tokens (1M beta available)
- **Pricing**: $3/input MTok, $15/output MTok
- **Capability Tier**: High
- **Cost Tier**: Medium
- **Special Characteristics**:
  - Recommended starting point
  - Best balance of intelligence/speed/cost
  - Exceptional coding and agentic performance
  - 90% savings with prompt caching
  - 50% savings with batch processing

#### Claude Haiku 4.5 (Released Oct 15, 2025)
- **Model ID**: `claude-haiku-4-5-20251001`
- **API Alias**: `claude-haiku-4-5`
- **Context Window**: 200K tokens
- **Pricing**: $1/input MTok, $5/output MTok
- **Capability Tier**: Medium-High
- **Cost Tier**: Low-Medium
- **Special Characteristics**:
  - Most cost-efficient Claude model
  - Fast response times

#### Legacy Models (Claude 3/3.5 Series)
- **Status**: Available but superseded by Claude 4 series
- **Model IDs**: `claude-3-5-sonnet-20241022`, etc.
- **Note**: Claude 3 family released March 2024, Claude 3.5 June 2024

### Provider Tier Recommendation
**Best for**: Premium quality, safety-critical applications, compliance requirements
**CFN Loop Usage**: Enterprise mode, high-stakes validation, primary coding tasks

---

## 5. xAI (Grok)

### Provider Information
- **Website**: https://x.ai
- **API Endpoint**: https://api.x.ai
- **Documentation**: https://docs.x.ai/docs

### Available Models

#### Grok 4 Series (Current - 2025)
- **Model IDs**:
  - `grok-4` (or similar - exact ID not fully specified)
  - `grok-4-fast-reasoning`
  - `grok-4-fast-non-reasoning`
- **Context Window**: 2M tokens (2 million)
- **Pricing**:
  - Range: $0.20 - $3.00 per 1M tokens (varies by model variant)
  - Beta: $2/input MTok, $10/output MTok (typical)
  - Live Search: $25 per 1,000 sources
- **Capability Tier**: Very High
- **Cost Tier**: Medium
- **Special Characteristics**:
  - Massive 2M token context window
  - Advanced reasoning modes
  - Web and X (Twitter) search integration
  - Visual processing capabilities
  - Knowledge cutoff: November 2024

#### Grok 4.1 (Latest Refinement)
- **Model ID**: Similar to Grok 4
- **Special Characteristics**:
  - Available in Auto mode
  - Rolling out with explicit model picker

#### Grok 3 Series (Generally Available)
- **Model IDs**:
  - `grok-3`
  - `grok-3-mini` (budget-friendly variant)
- **Context Window**: Up to 2M tokens
- **Capability Tier**: High
- **Cost Tier**: Low-Medium (mini variant)
- **Knowledge Cutoff**: November 2024

#### Grok 2 Series (Previous Generation)
- **Model IDs**:
  - `grok-2-1212`
  - `grok-2-vision-1212`
  - `grok-2-vision-latest`
- **Context Window**: 32K tokens (vision models)
- **Special Characteristics**:
  - Image generation capability (Grok 2 Image)
  - Improved accuracy and multilingual support

#### Legacy Models
- **Model IDs**:
  - `grok-beta` (131K context)
  - `grok-vision-beta` (8K context)

### API Features
- **Free Credits**: $25/month during beta
- **Compatibility**: OpenAI/Anthropic-compatible REST API
- **Tool Calling**: Free until December 3, 2025
- **Live Search API**: Deprecated by December 15, 2025 (replaced by agentic tool calling)

### Provider Tier Recommendation
**Best for**: Extremely long-context tasks, real-time information needs, X/Twitter integration
**CFN Loop Usage**: Experimental/alternative provider for specialized use cases

---

## Summary Comparison Table

| Provider | Best Model | Context | Input $/MTok | Output $/MTok | Capability | Cost | Best Use Case |
|----------|------------|---------|--------------|---------------|------------|------|---------------|
| Z.ai | GLM-4.6 | 200K | $0.40 | $1.75 | High | Low | Cost-optimized production |
| Kimi | K2 | 256K | $0.15-$0.60 | $2.50 | High | Low-Med | Balanced quality/cost |
| Google | Gemini 2.5 Pro | 1M | $1.25 | $10 | High | Med-High | Multimodal, batch processing |
| Google | Gemini 3 Pro | 1M | $2.00 | $12 | Very High | High | Cutting-edge capabilities |
| Anthropic | Sonnet 4.5 | 200K-1M | $3.00 | $15 | High | Medium | General-purpose premium |
| Anthropic | Opus 4.5 | 200K | $5.00 | $25 | Very High | Med-High | Enterprise/agentic coding |
| xAI | Grok 4 | 2M | $0.20-$3.00 | $10 | Very High | Medium | Ultra-long context |

### Cost Tier Definitions
- **Very Low**: <$0.50/MTok combined
- **Low**: $0.50-$2.00/MTok combined
- **Low-Medium**: $2.00-$5.00/MTok combined
- **Medium**: $5.00-$15.00/MTok combined
- **Medium-High**: $15.00-$30.00/MTok combined
- **High**: $30.00-$50.00/MTok combined
- **Very High**: >$50/MTok combined

### Capability Tier Definitions
- **Medium**: Competent for standard tasks
- **Medium-High**: Strong performance, suitable for most production work
- **High**: Near state-of-the-art, excellent for complex tasks
- **Very High**: State-of-the-art, frontier capabilities

---

## CFN Loop Integration Recommendations

### By Mode

**MVP Mode** (gate ≥0.70, consensus ≥0.80):
- Primary: Z.ai GLM-4.5-Air (cost)
- Alternative: Kimi K2 (quality/cost balance)

**Standard Mode** (gate ≥0.95, consensus ≥0.90):
- Primary: Z.ai GLM-4.6 (cost)
- Alternative: Kimi K2 (balanced)
- Premium: Anthropic Sonnet 4.5 (quality)

**Enterprise Mode** (gate ≥0.98, consensus ≥0.95):
- Primary: Anthropic Sonnet 4.5 (recommended)
- High-stakes: Anthropic Opus 4.5 (top-tier)
- Alternative: Google Gemini 3 Pro (multimodal)

### By Task Type

**Coding/Agentic Tasks**:
1. Anthropic Opus 4.5 (best SWE-bench)
2. Z.ai GLM-4.6 (cost-effective)
3. Kimi K2 (balanced)

**Long-Context Processing**:
1. xAI Grok 4 (2M tokens)
2. Google Gemini 2.5 (1M tokens)
3. Kimi K2 (256K tokens)

**Cost-Sensitive Production**:
1. Z.ai GLM-4.5-Air ($0.20 input)
2. Google Gemini 2.5 Flash-Lite ($0.10 input)
3. Kimi K2 with caching ($0.15 input cache hit)

**Multimodal Tasks**:
1. Google Gemini 3 Pro (comprehensive)
2. Google Gemini 2.5 Flash Image (image gen)
3. xAI Grok 2 Vision (vision + generation)

---

## Sources

### Z.ai
- [GLM-4.6 Documentation](https://docs.z.ai/guides/llm/glm-4.6)
- [GLM-4.6 Pricing Analysis](https://llm-stats.com/blog/research/glm-4-6-launch)
- [Z.ai Model API](https://z.ai/model-api)
- [GLM-4.6 Blog Post](https://z.ai/blog/glm-4.6)

### Kimi (Moonshot AI)
- [Kimi K2 GitHub](https://github.com/MoonshotAI/Kimi-K2)
- [Moonshot Platform](https://platform.moonshot.ai/)
- [Kimi K2 Documentation](https://moonshotai.github.io/Kimi-K2/)
- [Moonshot Pricing](https://platform.moonshot.ai/docs/pricing/chat)

### Google Gemini
- [Gemini Models Overview](https://ai.google.dev/gemini-api/docs/models)
- [Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [All Gemini Models 2025](https://www.datastudios.org/post/all-gemini-models-available-in-2025-complete-list-for-web-app-api-and-vertex-ai)

### Anthropic Claude
- [Claude Platform Docs](https://platform.claude.com/docs/en/about-claude/models)
- [Claude Sonnet 4.5 Announcement](https://www.anthropic.com/news/claude-sonnet-4-5)
- [Claude Opus 4.5 Announcement](https://www.anthropic.com/news/claude-opus-4-5)
- [Claude Haiku 4.5 Announcement](https://www.anthropic.com/news/claude-haiku-4-5)

### xAI Grok
- [xAI Models Documentation](https://docs.x.ai/docs/models)
- [xAI API](https://x.ai/api)
- [All Grok Models 2025](https://www.datastudios.org/post/all-grok-models-available-in-2025-full-list-for-web-app-and-api-including-grok-4-3-mini-and-ima)
- [Grok 4.1 Announcement](https://x.ai/news/grok-4-1)

---

**Research Completed**: 2025-11-26
**Document Version**: 1.0
**Next Review**: 2026-02-01 (or when major model releases occur)
