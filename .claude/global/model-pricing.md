# AI Model Pricing Reference

**Last Updated:** 2026-03-29

All prices in USD per 1M tokens unless noted otherwise.

---

## Anthropic (Claude)

### Current Generation (4.5/4.6)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `claude-opus-4-6` | Claude Opus 4.6 | $15.00 | $75.00 | $7.50 | Most capable |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | $3.00 | $15.00 | $1.50 | Balanced |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 | $0.80 | $4.00 | $0.08 | Fast, cheap |

### Previous Generation (3.5)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet v2 | $3.00 | $15.00 | $1.50 | |
| `claude-3-5-haiku-20241022` | Claude 3.5 Haiku | $0.80 | $4.00 | $0.08 | |

### Previous Generation (3.0)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `claude-3-opus-20240229` | Claude 3 Opus | $15.00 | $75.00 | $7.50 | Legacy |
| `claude-3-sonnet-20240229` | Claude 3 Sonnet | $3.00 | $15.00 | N/A | Deprecated |
| `claude-3-haiku-20240307` | Claude 3 Haiku | $0.25 | $1.25 | $0.03 | Deprecated |

---

## OpenAI

### Current Generation (GPT-5.x / o-series)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `gpt-5.4` | GPT-5.4 | $3.00 | $15.00 | $1.50 | Flex tier pricing shown |
| `gpt-5.2` | GPT-5.2 | $0.875 | $7.00 | $0.0875 | Flex tier |
| `gpt-5.1` | GPT-5.1 | $0.50 | $2.00 | $0.05 | 0.787 correlation to 5.4 |
| `gpt-5.1-mini` | GPT-5.1 Mini | $0.40 | $1.60 | N/A | |
| `gpt-5-mini` | GPT-5 Mini | $0.15 | $0.60 | $0.075 | Flex tier; std: $0.30/$1.20 |
| `o4-mini` | o4-mini | $0.55 | $2.20 | $0.055 | Reasoning model, flex tier |

### Previous Generation (GPT-4o / o1)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `gpt-4o` | GPT-4o | $2.50 | $10.00 | $1.25 | |
| `gpt-4o-mini` | GPT-4o Mini | $0.15 | $0.60 | $0.075 | |
| `o1` | o1 | $15.00 | $60.00 | $7.50 | Reasoning |
| `o1-mini` | o1-mini | $1.10 | $4.40 | $0.55 | Reasoning |
| `o3-mini` | o3-mini | $1.10 | $4.40 | $0.55 | Reasoning |

---

## Google (Gemini)

### Current Generation (3.x)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `gemini-3.1-flash-lite-preview` | Gemini 3.1 Flash Lite | $0.25 | $1.50 | $0.0625 | Used in pipeline WRITE/VALIDATE |
| `gemini-2.5-pro` | Gemini 2.5 Pro | $1.25 | $10.00 | $0.3125 | Thinking model |
| `gemini-2.5-flash` | Gemini 2.5 Flash | $0.15 | $0.60 | $0.0375 | |

**Grounding add-ons (Gemini):**
- Google Search grounding: $14.00 per 1,000 queries ($0.014/query), 5,000 free/month
- Custom tool (DailyScrape+Grok): ~$8.20 per 1,000 queries (~$0.0082/query)

**TTS audio output (Gemini):**
- Gemini 2.5 Flash TTS: $10.00/1M audio output tokens (~32 tokens/sec of audio)
- Gemini 2.5 Pro TTS: $20.00/1M audio output tokens
- Text input tokens are negligible (~$0.10/1M). Audio output is the dominant TTS cost.

### Previous Generation (2.0 / 1.5)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `gemini-2.0-flash` | Gemini 2.0 Flash | $0.10 | $0.40 | $0.025 | |
| `gemini-2.0-flash-lite` | Gemini 2.0 Flash Lite | $0.075 | $0.30 | N/A | |
| `gemini-1.5-pro` | Gemini 1.5 Pro | $1.25 | $5.00 | $0.3125 | Legacy |
| `gemini-1.5-flash` | Gemini 1.5 Flash | $0.075 | $0.30 | $0.01875 | Legacy |

---

## xAI (Grok)

### Current Generation (4.x)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `grok-4-1-fast-reasoning` | Grok 4.1 Fast Reasoning | $0.20 | $0.50 | $0.10 | BRIEF, OUTLINE stages |
| `grok-4-1-fast-non-reasoning` | Grok 4.1 Fast Non-Reasoning | $0.20 | $0.50 | $0.10 | EXTRACT_FACTS stage |
| `grok-4.3` | Grok 4.3 | $1.25 | $2.50 | $0.20 | Latest; eval in progress |
| `grok-4.20-beta-0309-reasoning` | Grok 4.20 Beta Reasoning | $1.25 | $2.50 | $0.20 | Eval/experiments |
| `grok-4.20-beta-0309-non-reasoning` | Grok 4.20 Beta NR | $1.25 | $2.50 | $0.20 | Writer experiments |

### Previous Generation (3.x)

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `grok-3` | Grok 3 | $3.00 | $15.00 | N/A | |
| `grok-3-mini` | Grok 3 Mini | $0.30 | $0.50 | N/A | |

**API base:** `https://api.x.ai/v1`

---

## Moonshot AI (Kimi)

### Current Generation

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `kimi-k2.6` | Kimi K2.6 | $0.95 | $4.00 | $0.16 | Video understanding (glm-video-ingest); OpenRouter blended ~$0.68/$3.41 |
| `kimi-k2.5` | Kimi K2.5 | $0.60 | $2.00 | $0.30 | EDIT, HUMANIZE, POLISH stages |

**API base:** `https://api.moonshot.ai/v1`

---

## Inception Labs (Mercury)

### Current Generation

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `mercury-coder-small` | Mercury Coder Small | $1.00 | $3.00 | $0.50 | Diffusion model, speculative decoding |

**API base:** `https://api.inceptionlabs.ai/v1`

---

## Z.ai / OpenRouter Aggregated

| Model ID | Display Name | Input | Output | Cached Input | Notes |
|----------|-------------|-------|--------|--------------|-------|
| `glm-5` | GLM-5 (Zhipu) | $0.72 | $2.30 | N/A | Best FI correlation (0.879) |
| `glm-4.7` | GLM-4.7 (Zhipu) | $0.39 | $1.75 | N/A | Non-reasoning variant |
| `xiaomi/mimo-v2-pro` | MiMo-v2-Pro (OpenRouter) | $0.00 | $0.00 | N/A | Free tier |
| `nvidia/nemotron-3-super-120b-a12b` | Nemotron-3-Super (OpenRouter) | $0.10 | $0.50 | N/A | Reasoning model |

---

## External API Costs (Non-Token)

| Service | Cost | Unit | Notes |
|---------|------|------|-------|
| DataForSEO Keyword Research | $0.02 | per call | |
| DataForSEO SERP Analysis | $0.05 | per call | |
| DataForSEO Keyword Difficulty | $0.015 | per call | |
| DataForSEO People Also Ask | $0.02 | per call | |
| Tavily Search (via DailyScrape) | $0.008 | per search | |
| Gemini Google Search Grounding | $0.014 | per query | 5K free/month |
| Custom Research Tool (DailyScrape+Grok) | $0.0082 | per search | |

---

## Quick Cost Comparison (sorted by output price)

| Model | Provider | Output $/1M | Input $/1M | Best For |
|-------|----------|-------------|------------|----------|
| MiMo-v2-Pro | OpenRouter | $0.00 | $0.00 | Free experiments |
| Gemini 2.0 Flash Lite | Google | $0.30 | $0.075 | Cheapest hosted |
| Grok 4.1 Fast | xAI | $0.50 | $0.20 | Reasoning + non-reasoning |
| Nemotron-3-Super | OpenRouter | $0.50 | $0.10 | Budget reasoning |
| GPT-5-mini | OpenAI | $0.60 | $0.15 | Fast extraction (flex) |
| Gemini 3.1 Flash Lite | Google | $1.50 | $0.25 | WRITE stage, grounding |
| GPT-5.1-mini | OpenAI | $1.60 | $0.40 | Mid-tier extraction |
| GLM-4.7 | Z.ai | $1.75 | $0.39 | Non-reasoning |
| Kimi K2.5 | Moonshot | $2.00 | $0.60 | Editing, humanization |
| GPT-5.1 | OpenAI | $2.00 | $0.50 | General purpose |
| o4-mini | OpenAI | $2.20 | $0.55 | Budget reasoning |
| GLM-5 | Z.ai | $2.30 | $0.72 | Highest FI correlation |
| Mercury Coder Small | Inception | $3.00 | $1.00 | Diffusion model |
| Claude Haiku 4.5 | Anthropic | $4.00 | $0.80 | Fast Anthropic |
| Grok 4.3 | xAI | $2.50 | $1.25 | Latest |
| Grok 4.20 Beta | xAI | $2.50 | $1.25 | Prior version |
| GPT-5.2 | OpenAI | $7.00 | $0.875 | Fact-check tie-breaker |
| GPT-5.4 | OpenAI | $15.00 | $3.00 | Top-tier OpenAI |
| Claude Sonnet 4.6 | Anthropic | $15.00 | $3.00 | Balanced Anthropic |
| Claude Opus 4.6 | Anthropic | $75.00 | $15.00 | Most capable |
