# Ad Creative at Scale — OSS Tooling + Pipeline (June 2026)

DCO (Dynamic Creative Optimization) = modular slots (headline / primary text / CTA / image / price), generate many combos, platform ML picks winners per impression. In 2026 the assembly layer lives in the ad platforms (Meta **Advantage+ Creative** / `asset_feed_spec`), so OSS work = variant *generation*, not real-time assembly. **No mature OSS DCO framework exists.**

---

## 1. Copy generation
- Anthropic API banned (per rules) → use `xai:grok-4-1-fast-non-reasoning` (copy), `grok-4.20-beta-reasoning` (angle work)
- Orchestration: LangChain — https://github.com/langchain-ai/langchain
- Constrained/structured output: Outlines https://github.com/dottxt-ai/outlines · Instructor https://github.com/567-labs/instructor
- **Pattern:** one call per product×angle, system prompt holds brand voice + banned-words + char limits, ask for n headlines / n primary / n CTAs as JSON
- **Non-negotiable:** deterministic post-processor after every LLM call (char-limit truncate, em-dash strip, profanity/claim filter). Prompt-only constraints leak.

## 2. Static image at scale
| Tool | Type | Notes | URL |
|------|------|-------|-----|
| satori (default) | OSS | HTML/CSS+JSX → SVG; pair resvg-js → PNG. Fast, no headless browser, no WSL2 OOM | https://github.com/vercel/satori · https://github.com/yisibl/resvg-js |
| Puppeteer/Playwright | OSS | HTML→PNG, full fidelity, heavier | https://github.com/puppeteer/puppeteer |
| html-to-image | OSS | lightweight DOM→PNG | https://github.com/bubkoo/html-to-image |
| @vercel/og | OSS | satori+resvg as edge endpoint | https://github.com/vercel/og-image |
| Polotno | Commercial (free tier) | JSON-schema canvas, designer editor | https://polotno.com |

## 3. Video at scale
| Tool | Type | Notes | URL |
|------|------|-------|-----|
| Revideo (OSS default) | MIT, free | Motion Canvas fork for automated batch; render API + webhooks | https://github.com/redotvideo/revideo |
| Remotion | BUSL | React→MP4; **bills above $1M ARR** | https://github.com/remotion-dev/remotion |
| VidAPI | OSS | self-hosted FastAPI, JSON timeline → render | https://github.com/moshehbenavraham/vidapi |
| Editly | OSS | declarative FFmpeg from JSON | https://github.com/mifi/editly |
| FFmpeg | OSS | substrate; aspect variants 9:16/1:1/4:5 | https://ffmpeg.org |

### AI video gen (GPU, NOT in WSL2 — will OOM)
| Model | License | URL |
|-------|---------|-----|
| Wan2.1/2.2 (Alibaba) | OSS | https://github.com/Wan-Video/Wan2.1 |
| HunyuanVideo (Tencent) | OSS | https://github.com/Tencent/HunyuanVideo |
| LTX-Video (fastest) | OSS | https://github.com/Lightricks/LTX-Video |
| Mochi 1 (Genmo) | Apache-2.0 | https://github.com/genmoai/models |

### Avatar / talking-head (UGC-style)
- MuseTalk (best, real-time): https://github.com/TMElyralab/MuseTalk
- SadTalker: https://github.com/OpenTalker/SadTalker
- Wav2Lip: https://github.com/Rudrabha/Wav2Lip
- Linly-Talker: https://github.com/Kedreamix/Linly-Talker
- awesome-heygen-alternatives: https://github.com/furudo-erika/awesome-heygen-ai-alternatives

**Existing `glm-video-ingest` skill** = creative-QA gate: ingest rendered ad, verify on-screen text / hook timing / captions / brand-safety. Generation stays with grok/OSS models.

## 4. Orchestration
- n8n (OSS glue): https://github.com/n8n-io/n8n
  - Clone-not-build templates: #6038 (Meta creative-testing+launch), #8123 (Meta+TikTok copy+Slack approval), #9786 (Sheets auto-post)
- Google Sheets = source of truth (product × angle × variant rows, status, asset URLs, result IDs)
- Object storage: MinIO https://github.com/minio/minio — deterministic naming `{product}_{angle}_{variant}_{ratio}_{date}`
- Meta asset_feed_spec: https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/

## 5. End-to-end blueprint
```
1. SOURCE (Google Sheets) — rows = product × angle × offer; status=READY triggers n8n
2. COPY GEN (grok via HTTP) — JSON {headlines[5],primary[5],ctas[3]} → deterministic post-proc → write back
3. IMAGE RENDER (satori+resvg) — 3 ratios (1:1,4:5,9:16) → S3/R2 → write image_url
4. VIDEO RENDER (Revideo/VidAPI) — MP4 9:16+1:1; optional MuseTalk avatar hook → write video_url
5. REVIEW GATE — Slack approval node + GLM-5V auto-QA (on-screen text, caption sync, brand-safety). No publish without it
6. BULK PUBLISH (n8n→APIs) — Meta asset_feed_spec dynamic creative; TikTok SDK. Write back ad IDs
7. PERFORMANCE PULL (n8n cron) — daily spend/CTR/CPA/ROAS by ad_id → sheet
8. KILL/SCALE — CPA>target×1.5 → pause; ROAS>threshold → +budget X%; winners' angles feed back to step 1
```

**Caveats:** Remotion BUSL bills >$1M ARR — Revideo cleaner default. No turnkey OSS DCO. AI video models need separate GPU box (OOM in WSL2).
