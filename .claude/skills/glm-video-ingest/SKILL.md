---
name: glm-video-ingest
description: "Ingest a Loom (or public mp4 / local file) screen recording with a video-understanding model (Kimi K2.6 default; z.ai GLM-5V or Gemini optional) and extract a build-ready UI spec: every screen, UI element, and the conditional logic the narrator describes, aligned to Loom's timestamped transcript. Use to reverse-engineer a no-code UI (Softr/WordPress/Bubble/Zapier) into custom code, or any time you need video understanding paired with narration."
version: 2.1.0
tags: [video, vlm, kimi, glm-5v, gemini, loom, ui-extraction, reverse-engineering]
status: beta
author: CFN Team
keywords: [video ingestion, video understanding, loom, kimi-k2.6, glm-5v-turbo, gemini, transcript, ui spec, no-code, conditional logic]
dependencies: [curl, jq, base64]
---

# Video Ingest (multi-provider)

**Purpose:** Turn a screen-recording walkthrough into a structured UI spec a developer can build from. A vision model reads the screen; the narration transcript supplies intent/logic. Both fuse into one JSON + Markdown artifact.

## Providers

| Provider | Model | Video input | Key | Status |
|----------|-------|-------------|-----|--------|
| **kimi** (default) | `kimi-k2.6` | base64 data URI (downloads file, no hosting) | `KIMI_API_KEY` | ✅ working |
| zai | `glm-5v-turbo` | public URL (no download) | `ZAI_API_KEY` | needs paid balance |
| gemini | `gemini-3.5-flash` | Files API upload; understands audio track natively | `GOOGLE_API_KEY` | ready (renew key) |

Kimi is default: key already present, base64 inline avoids any hosting, and it reads keyframes + the supplied transcript. Token cost scales with keyframes/resolution (≈44k tokens for a 12MB / 3-min clip).

## When to use

- You recorded a Loom explaining a no-code UI (Softr, WordPress, Bubble) and the conditional logic behind it, and want to rebuild it in custom code.
- You need UI-element-level descriptions paired with what the narrator said, with timestamps.
- Any "watch this video and tell me what's on screen + what was said" task.

## Input formats

- Loom share link (default), a direct public mp4/mkv/mov URL (`--type url`), or a local file (`--type file`).
- kimi: any source — the file is downloaded and sent base64 inline. Per-clip token cost scales with size; warns above 80MB.
- zai: **public URL only** (no base64), mp4/mkv/mov, ≤200MB.

## Usage

```bash
# Default: Loom share link + Kimi K2.6. Resolves Loom mp4, pulls transcript, analyzes.
./.claude/skills/glm-video-ingest/execute.sh "https://www.loom.com/share/<id>"

# Pick a provider:
./.claude/skills/glm-video-ingest/execute.sh "<loom-url>" --provider gemini
./.claude/skills/glm-video-ingest/execute.sh "<loom-url>" --provider zai

# Local file with your own transcript:
./.claude/skills/glm-video-ingest/execute.sh ./walkthrough.mp4 --type file --transcript ./caps.vtt

# Direct public URL + steer the analysis + name output:
./.claude/skills/glm-video-ingest/execute.sh "https://cdn.example.com/v.mp4" \
  --type url --prompt "Softr client portal, role-based visibility" --name client-portal

# Debug Loom/upload resolution:
./.claude/skills/glm-video-ingest/execute.sh "<loom-url>" --debug
```

### Options

| Flag | Meaning |
|------|---------|
| `--provider kimi\|zai\|gemini` | VLM backend. Default `kimi`. |
| `--type loom\|url\|file` | `loom` (default) resolves share link + transcript. `url` = public video URL. `file` = local path. |
| `--model <id>` | Override the provider's default model. |
| `--transcript <file>` | Use a `.vtt`/`.srt`/`.txt` transcript instead of auto-pulling from Loom. |
| `--prompt <text>` | Extra context appended to the analysis prompt. |
| `--name <slug>` | Output basename. |
| `--out <dir>` | Output dir (default `docs/video-ingest/`). |
| `--debug` | Keep intermediates, dump resolver/upload responses. |

### Env keys (env first, else `./.env`, never sourced)

| Var | Provider |
|-----|----------|
| `KIMI_API_KEY` | kimi (`https://api.moonshot.ai/v1`) |
| `ZAI_API_KEY` | zai (`https://api.z.ai/api/paas/v4`) |
| `GOOGLE_API_KEY` | gemini (`generativelanguage.googleapis.com`) |

## Output

Two files per run in `--out`:

- `<name>.json` — machine-readable: `screens[]` (with `ui_elements[]`), `conditional_logic[]`, `data_model[]`, `integrations[]`, `build_notes`.
- `<name>.md` — same data rendered as a developer-facing spec (screen tables + a conditional-logic list with narration quotes).

The Markdown is derived deterministically from the JSON via `jq` — they never drift.

## How it works

1. **Resolve** — Loom share id → public mp4 via `loom.com/api/campaigns/sessions/<id>/transcoded-url`; transcript scraped from the share page captions (VTT).
2. **Normalize transcript** — VTT/SRT → `[mm:ss] text` lines fed to the model as context.
3. **Analyze** — video + transcript + a strict-JSON prompt to the chosen provider. kimi sends the video as a base64 data URI and omits `temperature` (K2.6 only accepts 1); zai sends a public URL with `thinking` enabled; gemini uploads via the Files API.
4. **Render** — strip fences, validate JSON, emit `.json` and a `jq`-rendered `.md`. Token usage and an estimated cost are logged per run and written to the Markdown footer.

## Cost

Logged per run from the provider's reported `usage`. kimi-k2.6 direct API: **$0.95/M input, $4.00/M output, $0.16/M cached** (verified Jun 2026; see `~/.claude/model-pricing.md`). A 12MB / ~3-min clip runs ≈44k input + ~2k output tokens ≈ **$0.05**. zai/gemini rates in the script are approximate — verify against the provider dashboard.

## Limitations / first-run notes

- Loom's mp4/transcript endpoints are **unofficial** and may change. Run `--debug` once on a real link; if resolution fails, the dumped responses show what shifted.
- Only **public** Loom videos resolve. Workspace-private videos need a Loom auth cookie (not wired in).
- GLM-5V audio transcription is unconfirmed; this skill relies on Loom's transcript, not the model, for narration. Without a transcript, logic capture degrades to whatever is on-screen.
- One video per call; split long recordings and run per segment.

## Related

- Pair with `cfn-spec` / `cfn-arch` to turn the emitted spec into testable acceptance criteria before building.
