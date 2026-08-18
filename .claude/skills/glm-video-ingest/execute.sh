#!/usr/bin/env bash
# glm-video-ingest: Loom/video -> VLM -> UI build spec (JSON + Markdown)
#
# Sends a screen recording to a video-understanding model and extracts a
# structured spec of every screen, UI element, and the conditional logic the
# narrator describes -- aligned to Loom's timestamped transcript. Output is meant
# to be handed to a developer to rebuild a no-code UI (Softr/WordPress/Bubble) in
# custom code.
#
# Usage:
#   execute.sh <loom-url|mp4-url|local.mp4> [options]
#
# Options:
#   --provider kimi|zai|gemini   VLM backend. Default: kimi (works today, base64
#                                inline, no hosting, key already in .env).
#   --type loom|url|file         Input kind. loom (default) = resolve share link
#                                to its public mp4 + pull Loom transcript.
#                                url = a direct public mp4/mkv/mov URL.
#                                file = a local video file path.
#   --transcript <file>          Use a .vtt/.srt/.txt transcript instead of
#                                auto-pulling from Loom.
#   --name <slug>                Output basename. Default derived from input.
#   --out <dir>                  Output dir. Default: docs/video-ingest/
#   --prompt <text>              Extra guidance appended to the analysis prompt.
#   --model <id>                 Override the provider's default model.
#   --debug                      Keep intermediate files, print resolver output.
#
# Providers:
#   kimi   model kimi-k2.6   POST https://api.moonshot.ai/v1/chat/completions
#          KIMI_API_KEY. Video sent as base64 data URI (downloads the file).
#          temperature must be 1 (omitted). Token cost scales with keyframes.
#   zai    model glm-5v-turbo  POST https://api.z.ai/api/paas/v4/chat/completions
#          ZAI_API_KEY. Video sent as a PUBLIC URL (no download). Needs paid balance.
#   gemini model gemini-3.5-flash  Files API upload + generateContent.
#          GOOGLE_API_KEY. Understands the audio track natively.
#
# Env keys read from environment first, then ./.env (never sourced).

set -uo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

DEFAULT_OUT="docs/video-ingest"
PROVIDER="kimi"
INPUT=""
TYPE="loom"
TRANSCRIPT_FILE=""
NAME=""
OUT="$DEFAULT_OUT"
EXTRA_PROMPT=""
MODEL_OVERRIDE=""
DEBUG=0

log()  { printf '\033[0;36m[video]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[0;33m[video] WARN:\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[0;31m[video] ERROR:\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# read KEY=value from env or ./.env (never source .env)
envval() {
  local name="$1" v="${!1:-}"
  if [ -z "$v" ] && [ -f .env ]; then
    v="$(grep -E "^${name}=" .env | head -1 | cut -d'=' -f2- | tr -d '"'"'"'')"
  fi
  printf '%s' "$v"
}

# ---------------------------------------------------------------------------
# args
# ---------------------------------------------------------------------------
[ $# -ge 1 ] || die "missing input. Usage: execute.sh <loom-url|mp4-url|local.mp4> [--provider kimi|zai|gemini]"
INPUT="$1"; shift
while [ $# -gt 0 ]; do
  case "$1" in
    --provider)   PROVIDER="$2"; shift 2;;
    --type)       TYPE="$2"; shift 2;;
    --transcript) TRANSCRIPT_FILE="$2"; shift 2;;
    --name)       NAME="$2"; shift 2;;
    --out)        OUT="$2"; shift 2;;
    --prompt)     EXTRA_PROMPT="$2"; shift 2;;
    --model)      MODEL_OVERRIDE="$2"; shift 2;;
    --debug)      DEBUG=1; shift;;
    *) die "unknown option: $1";;
  esac
done

command -v curl >/dev/null || die "curl required"
command -v jq   >/dev/null || die "jq required"

case "$PROVIDER" in
  kimi)   MODEL="${MODEL_OVERRIDE:-kimi-k2.6}";       NEEDS_FILE=1;;
  zai)    MODEL="${MODEL_OVERRIDE:-glm-5v-turbo}";    NEEDS_FILE=0;;
  gemini) MODEL="${MODEL_OVERRIDE:-gemini-3.5-flash}"; NEEDS_FILE=1;;
  *) die "unknown --provider: $PROVIDER (kimi|zai|gemini)";;
esac

WORK="$(mktemp -d /tmp/video-ingest-XXXXXX)"
cleanup() { [ "$DEBUG" -eq 1 ] || rm -rf "$WORK"; }
trap cleanup EXIT
[ "$DEBUG" -eq 1 ] && log "workdir: $WORK (kept)"

# ---------------------------------------------------------------------------
# Loom resolution + transcript
# ---------------------------------------------------------------------------
loom_id_from_url() { echo "$1" | sed -nE 's#.*loom\.com/(share|embed)/([a-f0-9]{16,})\b.*#\2#p'; }

resolve_loom_mp4() {
  local id="$1" resp
  resp="$(curl -s -X POST "https://www.loom.com/api/campaigns/sessions/${id}/transcoded-url" \
    -H 'content-type: application/json' -H 'user-agent: Mozilla/5.0' -d '{}')"
  [ "$DEBUG" -eq 1 ] && echo "$resp" > "$WORK/loom-transcoded.json"
  echo "$resp" | jq -r '.url // empty' 2>/dev/null
}

resolve_loom_transcript() {
  local id="$1" page vtturl
  page="$(curl -sL "https://www.loom.com/share/${id}" -H 'user-agent: Mozilla/5.0')"
  [ "$DEBUG" -eq 1 ] && echo "$page" > "$WORK/loom-page.html"
  vtturl="$(echo "$page" | grep -oiE 'https://[^"]+\.vtt[^"]*' | head -1)"
  if [ -z "$vtturl" ]; then
    vtturl="$(echo "$page" | grep -oiE '"(captionSourceUrl|transcriptUrl|captions_url)":"[^"]+"' \
              | head -1 | sed -E 's/.*:"([^"]+)"/\1/; s/\\u002F/\//g; s/\\\//\//g')"
  fi
  [ -z "$vtturl" ] && return 1
  curl -sL "$vtturl" -H 'user-agent: Mozilla/5.0'
}

transcript_to_timestamped() {
  awk '
    /-->/ { split($1,a,":"); if(length(a)==3){sec=a[1]*3600+a[2]*60+int(a[3])}else{sec=a[1]*60+int(a[2])};
            ts=sprintf("%02d:%02d",int(sec/60),sec%60); next }
    /^WEBVTT/||/^NOTE/||/^[0-9]+$/||/^$/ {next}
    { gsub(/<[^>]*>/,""); if(ts!="")printf "[%s] %s\n",ts,$0 }'
}

VIDEO_URL=""        # public URL (zai)
VIDEO_FILE=""       # local path (kimi/gemini)
TRANSCRIPT_TS=""
LOOM_ID=""

case "$TYPE" in
  loom)
    LOOM_ID="$(loom_id_from_url "$INPUT")"
    [ -n "$LOOM_ID" ] || die "could not parse a Loom id from: $INPUT"
    log "Loom id: $LOOM_ID"
    VIDEO_URL="$(resolve_loom_mp4 "$LOOM_ID")"
    [ -n "$VIDEO_URL" ] || die "Loom returned no video URL. Public video? Re-run with --debug."
    if [ -n "$TRANSCRIPT_FILE" ]; then
      TRANSCRIPT_TS="$(transcript_to_timestamped < "$TRANSCRIPT_FILE")"
    elif RAW="$(resolve_loom_transcript "$LOOM_ID")" && [ -n "$RAW" ]; then
      TRANSCRIPT_TS="$(echo "$RAW" | transcript_to_timestamped)"
      log "Loom transcript: $(echo "$TRANSCRIPT_TS" | grep -c '^\[') cues"
    else
      warn "no Loom transcript found; model works from video only."
    fi
    ;;
  url)  VIDEO_URL="$INPUT"; [ -n "$TRANSCRIPT_FILE" ] && TRANSCRIPT_TS="$(transcript_to_timestamped < "$TRANSCRIPT_FILE")";;
  file) VIDEO_FILE="$INPUT"; [ -f "$VIDEO_FILE" ] || die "file not found: $VIDEO_FILE"
        [ -n "$TRANSCRIPT_FILE" ] && TRANSCRIPT_TS="$(transcript_to_timestamped < "$TRANSCRIPT_FILE")";;
  *) die "unknown --type: $TYPE (loom|url|file)";;
esac

# providers that need the bytes: download the URL to a local file
if [ "$NEEDS_FILE" -eq 1 ] && [ -z "$VIDEO_FILE" ]; then
  VIDEO_FILE="$WORK/video.mp4"
  log "downloading video for $PROVIDER ..."
  curl -sL "$VIDEO_URL" -H 'user-agent: Mozilla/5.0' -o "$VIDEO_FILE" || die "download failed"
fi

# size guard
if [ -n "$VIDEO_FILE" ]; then
  MB=$(( $(stat -c%s "$VIDEO_FILE") / 1048576 ))
  log "video size: ${MB}MB"
  [ "$PROVIDER" = "kimi" ] && [ "$MB" -gt 80 ] && warn "kimi: ${MB}MB video -> high keyframe token cost; may exceed 256K context."
  [ "$PROVIDER" = "zai" ]  && [ "$MB" -gt 200 ] && die "zai cap is 200MB (got ${MB}MB)."
fi

# ---------------------------------------------------------------------------
# prompt
# ---------------------------------------------------------------------------
read -r -d '' SCHEMA_PROMPT <<'PROMPT'
You are reverse-engineering a no-code UI (e.g. Softr, WordPress, Bubble, Zapier)
from a screen recording so a developer can rebuild it in custom code. Watch the
video; use the timestamped narration transcript below to understand intent.

Return ONLY a single JSON object (no prose, no markdown fences) with this shape:
{
  "video_summary": "what the UI is and what it does, 2-3 sentences",
  "screens": [
    {"id":"s1","name":"short name","t_start":"mm:ss","t_end":"mm:ss","purpose":"",
     "ui_elements":[{"type":"button|input|dropdown|toggle|list|table|modal|tab|card|form|nav|other",
        "label":"visible text","location":"top nav|sidebar|main|footer","state":"default|hover|active|disabled|hidden|conditional","behavior":"what it does"}],
     "narration":"what the speaker said about this screen"}
  ],
  "conditional_logic":[
    {"id":"c1","trigger":"user action/event","condition":"the IF condition","action":"the THEN result",
     "affected_screens":["s1"],"t":"mm:ss","narration_quote":"exact words if spoken"}
  ],
  "data_model":[{"entity":"name","fields":["f1","f2"],"notes":"relationships/sources"}],
  "integrations":[{"name":"service/API","purpose":"why used"}],
  "build_notes":"developer guidance: gotchas, build order, ambiguous spots to confirm"
}

Rules:
- Capture EVERY conditional rule the narrator describes ("if X then Y", "when",
  "unless", "only show", "depending on"). This is the most important output.
- If transcript and visuals disagree, trust visuals for layout, narration for
  intent/logic; note the conflict in build_notes.
- Use transcript timestamps to fill t/t_start/t_end. Do not invent screens/rules.
PROMPT

PROMPT_TEXT="$SCHEMA_PROMPT"
[ -n "$EXTRA_PROMPT" ] && PROMPT_TEXT+=$'\n\nAdditional context:\n'"$EXTRA_PROMPT"
if [ -n "$TRANSCRIPT_TS" ]; then
  PROMPT_TEXT+=$'\n\n--- TIMESTAMPED TRANSCRIPT ---\n'"$TRANSCRIPT_TS"
else
  PROMPT_TEXT+=$'\n\n(No transcript; transcribe key narration yourself if audible.)'
fi

# ---------------------------------------------------------------------------
# provider call -> CONTENT (raw model text)
# ---------------------------------------------------------------------------
REQ="$WORK/request.json"
RESP="$WORK/response.json"
CONTENT=""

call_openai_compat() {  # $1 endpoint, $2 key, $3 video-content-json-file
  for attempt in 1 2 3 4; do
    HTTP="$(curl -s --max-time 600 -w '%{http_code}' -o "$RESP" -X POST "$1" \
      -H "Authorization: Bearer $2" -H 'Content-Type: application/json' --data-binary @"$REQ")"
    case "$HTTP" in
      429) w=$((attempt*15)); warn "429 rate limit; retry in ${w}s ($attempt/4)"; sleep "$w";;
      *) break;;
    esac
  done
  [ "$HTTP" = "200" ] || { err "HTTP $HTTP"; jq . "$RESP" 2>/dev/null >&2 || cat "$RESP" >&2; exit 1; }
  CONTENT="$(jq -r '.choices[0].message.content // empty' "$RESP")"
}

case "$PROVIDER" in
  kimi)
    KEY="$(envval KIMI_API_KEY)"; [ -n "$KEY" ] || die "KIMI_API_KEY not set (env or .env)"
    base64 -w0 "$VIDEO_FILE" > "$WORK/v.b64"
    log "calling $MODEL (kimi) ..."
    jq -n --arg model "$MODEL" --rawfile b64 "$WORK/v.b64" --arg text "$PROMPT_TEXT" \
      '{model:$model, messages:[{role:"user", content:[
         {type:"video_url", video_url:{url:("data:video/mp4;base64,"+($b64|gsub("\n";"")))}},
         {type:"text", text:$text} ]}], max_tokens:8192}' > "$REQ"
    call_openai_compat "https://api.moonshot.ai/v1/chat/completions" "$KEY"
    ;;
  zai)
    KEY="$(envval ZAI_API_KEY)"; [ -n "$KEY" ] || die "ZAI_API_KEY not set (env or .env)"
    log "calling $MODEL (zai) ..."
    jq -n --arg model "$MODEL" --arg vurl "$VIDEO_URL" --arg text "$PROMPT_TEXT" \
      '{model:$model, messages:[{role:"user", content:[
         {type:"video_url", video_url:{url:$vurl}},
         {type:"text", text:$text} ]}], thinking:{type:"enabled"}, temperature:0.2, max_tokens:8192}' > "$REQ"
    call_openai_compat "https://api.z.ai/api/paas/v4/chat/completions" "$KEY"
    ;;
  gemini)
    KEY="$(envval GOOGLE_API_KEY)"; [ -n "$KEY" ] || die "GOOGLE_API_KEY not set (env or .env)"
    log "uploading to Gemini Files API ..."
    UP="$(curl -s -X POST "https://generativelanguage.googleapis.com/upload/v1beta/files?key=$KEY" \
      -H 'X-Goog-Upload-Protocol: raw' -H 'X-Goog-Upload-File-Name: video.mp4' \
      -H 'Content-Type: video/mp4' --data-binary @"$VIDEO_FILE")"
    FNAME="$(echo "$UP" | jq -r '.file.name // empty')"; FURI="$(echo "$UP" | jq -r '.file.uri // empty')"
    [ -n "$FURI" ] || { err "Gemini upload failed"; echo "$UP" | jq . >&2; exit 1; }
    for i in $(seq 1 30); do
      ST="$(curl -s "https://generativelanguage.googleapis.com/v1beta/$FNAME?key=$KEY" | jq -r '.state')"
      [ "$ST" = "ACTIVE" ] && break; [ "$ST" = "FAILED" ] && die "Gemini processing FAILED"; sleep 3
    done
    log "calling $MODEL (gemini) ..."
    jq -n --arg uri "$FURI" --arg text "$PROMPT_TEXT" \
      '{contents:[{parts:[{file_data:{file_uri:$uri,mime_type:"video/mp4"}},{text:$text}]}],
        generationConfig:{temperature:0.2,maxOutputTokens:8192}}' > "$REQ"
    HTTP="$(curl -s --max-time 600 -w '%{http_code}' -o "$RESP" -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/$MODEL:generateContent?key=$KEY" \
      -H 'Content-Type: application/json' --data-binary @"$REQ")"
    [ "$HTTP" = "200" ] || { err "HTTP $HTTP"; jq . "$RESP" 2>/dev/null >&2; exit 1; }
    CONTENT="$(jq -r '.candidates[0].content.parts[0].text // empty' "$RESP")"
    ;;
esac

[ -n "$CONTENT" ] || { err "empty model content"; jq . "$RESP" >&2; exit 1; }

# ---------------------------------------------------------------------------
# usage + estimated cost (per-million USD; kimi exact from model-pricing.md,
# zai/gemini approximate — verify against provider dashboard)
# ---------------------------------------------------------------------------
PT=0; CT=0; COST="0.0000"
if [ "$PROVIDER" = "gemini" ]; then
  PT="$(jq -r '.usageMetadata.promptTokenCount // 0' "$RESP")"
  CT="$(jq -r '.usageMetadata.candidatesTokenCount // 0' "$RESP")"
else
  PT="$(jq -r '.usage.prompt_tokens // 0' "$RESP")"
  CT="$(jq -r '.usage.completion_tokens // 0' "$RESP")"
fi
case "$PROVIDER" in
  kimi)   IN_RATE=0.95; OUT_RATE=4.00;;   # kimi-k2.6 direct API (verified Jun 2026)
  zai)    IN_RATE=0.60; OUT_RATE=1.80;;   # glm-5v-turbo, approx
  gemini) IN_RATE=0.30; OUT_RATE=2.50;;   # gemini flash, approx
esac
COST="$(awk -v p="$PT" -v c="$CT" -v ir="$IN_RATE" -v or="$OUT_RATE" 'BEGIN{printf "%.4f",(p*ir+c*or)/1000000}')"
log "usage: ${PT} in + ${CT} out tokens; est \$${COST} (${PROVIDER} @ \$${IN_RATE}/\$${OUT_RATE} per M tok)"

# ---------------------------------------------------------------------------
# parse + write outputs (JSON + Markdown)
# ---------------------------------------------------------------------------
CLEAN="$(printf '%s' "$CONTENT" | sed -E 's/^```[a-zA-Z]*//; s/```$//')"
JSON="$(printf '%s' "$CLEAN" | sed -nE '/\{/,$p')"

mkdir -p "$OUT"
if [ -z "$NAME" ]; then
  if [ -n "$LOOM_ID" ]; then NAME="loom-${LOOM_ID:0:8}"; else NAME="video-$(printf '%s' "$INPUT" | md5sum | cut -c1-8)"; fi
fi
JSON_OUT="$OUT/$NAME.json"; MD_OUT="$OUT/$NAME.md"

if printf '%s' "$JSON" | jq . >/dev/null 2>&1; then
  printf '%s' "$JSON" | jq . > "$JSON_OUT"
  log "wrote $JSON_OUT"
else
  warn "model output not valid JSON; saving raw to $JSON_OUT"
  printf '%s' "$CONTENT" > "$JSON_OUT"; cp "$JSON_OUT" "$MD_OUT"
  die "could not render markdown (invalid JSON). Inspect $JSON_OUT."
fi

jq -r --arg src "$INPUT" --arg prov "$PROVIDER/$MODEL" '
  "# UI Build Spec\n",
  "**Source:** \($src)",
  "**Model:** \($prov)",
  "",
  "## Summary\n\n\(.video_summary // "n/a")\n",
  "## Screens\n",
  ( (.screens // [])[] |
    "### \(.name) (`\(.id)`)  \(.t_start // "")–\(.t_end // "")\n",
    "\(.purpose // "")\n",
    "**Narration:** \(.narration // "—")\n",
    "| Element | Type | Location | State | Behavior |",
    "|---|---|---|---|---|",
    ( (.ui_elements // [])[] |
      "| \(.label // "—") | \(.type // "") | \(.location // "") | \(.state // "") | \(.behavior // "") |" ),
    "" ),
  "## Conditional Logic\n",
  ( if ((.conditional_logic // []) | length) == 0 then "_none captured_\n" else
    ( (.conditional_logic // [])[] |
      ( "- **[\(.t // "")] \(.trigger // "")** → IF \(.condition // "") THEN \(.action // "")"
        + ( if (.narration_quote // "") != "" then "\n  > " + (.narration_quote) else "" end ) ) )
    end ),
  "",
  "## Data Model\n",
  ( if ((.data_model // []) | length) == 0 then "_none_\n" else
    ( (.data_model // [])[] |
      ( "- **\(.entity)**: " + ((.fields // []) | join(", "))
        + ( if (.notes // "") != "" then " — " + (.notes) else "" end ) ) )
    end ),
  "",
  "## Integrations\n",
  ( if ((.integrations // []) | length) == 0 then "_none_\n" else
    ( (.integrations // [])[] | "- **\(.name)**: \(.purpose // "")" )
    end ),
  "",
  "## Build Notes\n",
  "\(.build_notes // "—")"
' "$JSON_OUT" > "$MD_OUT"

printf '\n---\n_Generated by `glm-video-ingest` via %s. Usage: %s in + %s out tokens, est \$%s._\n' \
  "$PROVIDER/$MODEL" "$PT" "$CT" "$COST" >> "$MD_OUT"

log "wrote $MD_OUT"
echo "$JSON_OUT"
echo "$MD_OUT"
