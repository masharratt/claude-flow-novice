# CFN Local Inference Integration (Mac M5 Pro, 48GB)

**Status:** Decisions captured, not yet implemented
**Date:** 2026-08-26
**Scope:** Route CFN execution loops (implementation + validation) to open-weight models served locally on a new Mac M5 Pro, with a cloud verification backstop. Planning stays where it is.

## Goal

Use the Mac's 48GB unified memory to run implementation work on local open-weight models at zero marginal token cost, while keeping high-stakes planning on fable/opus in the Claude Code main session (subscription-backed) and adding one cloud verification pass to backstop local-model quality.

## Confirmed decisions

1. **Topology: Mac is a LAN inference box; WSL2 stays the driver.** CFN assumes a GNU userland (bash 4+, GNU coreutils/sed/grep); moving development to macOS would require the `readme/macos-setup.md` porting pass. A pure inference box skips that entirely. The server binds to the LAN (`llama-server --host 0.0.0.0`); this is unauthenticated, so trusted network only.
2. **Execution scope: all execution loops local, then one cloud re-verify pass.** Run 1 executes with `provider=local`: Loop 3 (implement) and Loop 2 (validate) both on the Mac. Run 2 re-runs the Loop 2 validators (code-reviewer, tester, security-specialist) with `provider=zai`. Validation tokens are a small fraction of implementation tokens, so the re-verify stays cheap, and it catches what a 73%-class model misses. This backstop is what makes a single local model viable day one.
3. **Implementation model: Qwen3.6-35B-A3B** (reasoning in "Model selection" below, including why not Qwen3.8-27B and where Devstral Small 2 fits).

## Target architecture

```
WSL2 (driver, unchanged)                        Mac M5 Pro 48GB (inference box)
──────────────────────────────                  ────────────────────────────────────────
main Claude Code session                        llama-server (llama.cpp)
  planning: plan mode / megaplan                  native Anthropic Messages API
  (fable/opus, subscription)                      (/v1/messages, SSE, tool use,
                                                  count_tokens)
                                                       ▲
orchestration-v2 spawn-agent-cli                       │ HTTP, LAN, :8080
  runs `claude -p` per worker                         │
  ANTHROPIC_BASE_URL + ANTHROPIC_MODEL                │
  from provider-models.json provider "local" ─────────┘

Run 2 (cloud re-verify): same Loop 2 validators, provider=zai, cloud endpoint
```

The key unlock from the serving-stack research: llama.cpp `llama-server` exposes a native Anthropic Messages API, so the `claude` CLI can talk to it directly through `ANTHROPIC_BASE_URL`. No translating proxy (LiteLLM / claude-code-router) is needed on this path.

## Current state of CFN provider delegation (verified 2026-08-21)

These findings come from a read of the repo; line numbers are as of the research date.

### The working path

- `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/src/cli/spawn-agent-cli.ts:512` executes workers via `spawnSync('claude', ['-p', prompt, ...])`, with extra flags from `CFN_WORKER_CLAUDE_FLAGS` and a 10-minute timeout. All delegation to non-Claude providers is mediated by the `claude` CLI speaking the Anthropic protocol to `ANTHROPIC_BASE_URL`.
- `buildChildEnv` (spawn-agent-cli.ts:211-236) sets `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` (taken from the provider's `apiKeyEnvVar`), `ANTHROPIC_MODEL`, and `ANTHROPIC_SMALL_FAST_MODEL`; it deletes `ANTHROPIC_API_KEY` (line 221), which satisfies the `claude -p` cost-safety rule (no accidental API billing).
- Provider selection: `CFN_PROVIDER` or `CLAUDE_API_PROVIDER` env, else `map.defaultProvider` (spawn-agent-cli.ts:185). Tier per agent type comes from `agentTierOverrides` (line 186).
- The routing table is `.claude/cfn-config/provider-models.json` — data-driven, discovered via `CFN_PROJECT_ROOT`/`PROJECT_ROOT` (spawn-agent-cli.ts:403-435). It defines `defaultProvider: "zai"`, tiers `haiku|sonnet|opus`, and per-provider `{baseUrl, apiKeyEnvVar, models{haiku,sonnet,opus}}`. Current providers: `zai`, `kimi`, `openrouter`, `xai`, `anthropic` (baseUrl null = real Anthropic).
- Agent-type tier overrides: coder/backend-dev/backend-developer/reviewer/researcher → sonnet; tester → haiku; security-specialist/system-architect → opus.
- Loop membership: Loop 3 = `backend-dev`, `coder` (orchestrate.ts:926); Loop 2 = `code-reviewer`, `tester`, `security-specialist` (orchestrate.ts:1005). There is no per-loop provider; both loops go through the same `resolveProvider`.
- `cli/orchestrate.sh` is a 20-line wrapper that execs `node resolve-provider-model.cjs`, which requires `CFN_CUSTOM_ROUTING=true` (else provider defaults to zai) and honors `--provider=` argv or `CFN_DEFAULT_PROVIDER` (resolve-provider-model.cjs:21-27), exporting `CFN_PROVIDER` to the child.

### Broken or unsuitable paths

- **`/cfn-loop-cli` is non-functional as shipped.** Its own header (`.claude/commands/cfn-loop/cfn-loop-cli.md:9`) says "VERIFICATION REQUIRED BEFORE USE": `lib/mdap/orchestrator.js` is missing (only `.ts` exists) and `.claude/skills/product-owner-decision/execute-decision.sh` does not exist. Its MDAP client (`lib/mdap/glm-client.ts`) also hardcodes a Cerebras URL and `zai-glm-4.6`, OpenAI-chat-shaped, not env-overridable. It is not the vehicle for this work.
- **`cli/resolve-provider-model.cjs:15` and `cli/cfn-orchestrator.cjs:12` point at a nonexistent build output** (`cli/lib/orchestrator/dist/cli/orchestrator-cli.js`). The built worker actually lives at `lib/orchestrator/dist-worker/cli/spawn-agent-cli.js`. The `orchestrate.sh` chain is broken as shipped and must be fixed before any of this runs.
- **`cfn-loop-task`** (`.claude/commands/cfn-loop-task.md`) dispatches implementers as Claude Code `Task` subagents — subscription-backed, no provider knobs. Routing it at a local endpoint would mean routing the entire harness via `ANTHROPIC_BASE_URL`, i.e. it has no provider indirection of its own.
- **`docs/CFN_LOOP_CLI_MODE.md:75` references `docs/CUSTOM_PROVIDER_ROUTING.md`, which does not exist.**

### Gaps for a localhost/LAN endpoint

1. **Protocol mismatch is the core gap, closed by llama-server.** The working delegation mechanism runs the `claude` CLI against `ANTHROPIC_BASE_URL`, which must speak the Anthropic Messages API. Ollama and LM Studio expose OpenAI `/v1/chat/completions` only. llama.cpp `llama-server`'s native Anthropic Messages API (with SSE streaming, tool use, and count_tokens) removes the need for a translating proxy. If MLX throughput is later required, a LiteLLM (or equivalent) proxy re-enters the design.
2. **A `local` provider entry needs all three tiers filled** or `resolveProvider` throws "Unknown tier" for agents like security-specialist (opus) and tester (haiku). Day one: map all three tiers to the same model.
3. **Auth token plumbing:** `buildChildEnv` sets `ANTHROPIC_AUTH_TOKEN = env[apiKeyEnvVar]`; a keyless local server still needs a dummy env var defined or the token is `undefined`.
4. **`scripts/switch-api.sh` cannot target localhost** — the dispatch case list (lines 435-468) and each switch function hardcode cloud URLs. Hand-editing `.claude/settings.local.json` env keys works (Claude Code reads them directly) but is unsupported; the right fix is a `local` case in the script.
5. **Deprecated `get-agent-provider-env.sh` silently misroutes unknown hosts.** `detect_provider_from_url` (lines 102-122) classifies any unrecognized host (e.g. a LAN IP) as `anthropic` and unsets the routing env vars. Guard or fix if that path is still reachable.
6. **No validate-only invocation mode is confirmed.** The cloud re-verify pass (Run 2) needs a way to run just the Loop 2 validators. Either a second-invocation mode on the orchestrator or a small feature; resolve during implementation planning.
7. **Reasoning-model rules need a per-model check.** `~/.claude/references/provider-cost-runtime.md` (strip `temperature`; reasoning tokens consume `max_completion_tokens`, so budget 4x) is written for cloud reasoning models. Qwen3.6 defaults to non-thinking with a `qwen3_coder` tool parser and `preserve_thinking` for agent loops; verify the local entry's parameters against these rules rather than assuming.

## Model selection (researched 2026-08-21)

### Candidates that fit ~40GB on 48GB (quantized, OS headroom)

| Model (release) | Params | ~Quant size | SWE-bench Verified | Context | Est. tok/s M5 Pro | License / notes |
|---|---|---|---|---|---|---|
| **Qwen3.6-35B-A3B** (Apr 2026) | 35B MoE, 3B active | ~20GB Q4 | **73.4** | 262K native | ~35-70 | Apache 2.0. The throughput pick: ~3x faster decode than a dense 27B. |
| Qwen3.6-27B (Apr 2026) | 27B dense | ~15GB Q4 | 77.2 | 262K native, 1M YaRN | ~10-15 | Apache 2.0. Mature, 714 community quants, `qwen3_coder` tool parser. |
| Qwen3.8-27B (Aug 2026) | 27B dense | ~15GB Q4 | not published (SWE-bench Pro 61.7, Terminal-Bench 2.1 73.0, DeepSWE 42.2) | 262K native, 1M YaRN | ~10-15 | Apache 2.0. Weeks old; leads 3.6-27B on every shared benchmark. |
| Devstral Small 2 (Dec 2025) | 24B dense | ~13GB Q4 | 68.0 | 256K | ~15-20 | Apache 2.0. Mistral's purpose-built agentic SWE model; most battle-tested in OpenHands-style tool-calling scaffolds; multimodal. |
| gpt-oss-20b (Aug 2025) | 20.9B MoE, 3.6B active | 12.8GB MXFP4 | 60.7 (high effort) | 131K | ~50-80 | Apache 2.0. Cheapest/fastest tier; good for draft and sub-agent tasks. |
| GLM-4.7-Flash (Jan 2026) | 30B MoE, 3B active | ~17GB Q4 | 59.2 | 128K | ~35-60 | MIT. Strong tool use, a coding tier below Qwen. |

M5 Pro has ~273 GB/s memory bandwidth, which is the decode bottleneck; speed estimates are Q4-class, triangulated from measured M-series data points and the ~3x bandwidth-efficiency advantage of 3B-active MoE over 27B dense.

### Ruled out (do not fit 48GB even quantized)

gpt-oss-120b (60.8GiB MXFP4), Devstral 2 (123B), Mistral Medium 3.5 (128B dense), Mistral Large 3 (675B MoE), DeepSeek V4-Pro/V4-Flash, GLM-5.x (needs 256GB+), Kimi K3 (2.8T), Qwen3.8-Max (2.4T). Qwen3-Coder-Next 80B only fits at Q3 (~35GB) with quality loss.

### Why Qwen3.6-35B-A3B over Qwen3.8-27B

1. **Speed.** A dense 27B decodes at ~10-15 tok/s on M5 Pro. An implementation loop generates hundreds of long tool-call responses; a 2000-token response at 12 tok/s is roughly three minutes of generation, and the whole loop crawls. The 35B-A3B MoE (3B active) runs ~35-70 tok/s in the same accuracy neighborhood.
2. **Maturity.** Qwen3.8-27B was released weeks before this research: no published SWE-bench Verified number, scaffolds and tool-call parsers still settling. The 35B-A3B has a verified 73.4% and broad adoption.

Qwen3.8-27B is the natural future **opus-tier** candidate (few tokens, high stakes: security-specialist, system-architect) once it has a verified number. Day-one tier split is not practical anyway: llama-server loads one model per process, and the three candidate models (20+15+13GB) do not fit resident alongside the OS in 48GB; model swaps cost tens of seconds. Revisit the tier split after the pipeline works end to end. If a split is added later, a resident pair of Qwen3.6-35B-A3B (~20GB) + gpt-oss-20b (~13GB) covers sonnet+haiku within budget.

### On Mistral

The original intent was Mistral for implementation. Devstral Small 2 is that option and it is viable (68.0%, battle-tested tool calling, fastest fit of the contenders), but Qwen3.6-35B-A3B beats it by ~5 SWE-bench points with better throughput, and Qwen3.6-27B beats it by ~9. No Mistral model that fits 48GB matches the Qwen class; the fitting Mistral lineup below Devstral 2 is general-purpose (Mistral Small 3.x, Ministral 3), not agentic-coding grade.

## Serving stack

- **Start with llama.cpp `llama-server`:** native Anthropic Messages API (no proxy), broadest model/tool-call-template compatibility, `--host 0.0.0.0` for LAN binding (defaults to 127.0.0.1:8080).
- **MLX alternative if throughput becomes the constraint:** MLX runs 15-25% faster than GGUF-class backends on Apple Silicon; Ollama 0.19+ ships an MLX engine, LM Studio has an MLX toggle, and vllm-mlx claims higher throughput still. All expose OpenAI-compatible APIs only, which reintroduces the translating-proxy requirement (LiteLLM or claude-code-router). Not worth the extra moving part until the simple path is measured.
- **LAN exposure is unauthenticated by default** on all of these (Ollama needs `OLLAMA_HOST=0.0.0.0`; LM Studio needs "Serve on Local Network" enabled). Trusted network only.

### Provider entry sketch

```json
"local": {
  "baseUrl": "http://<mac-lan-ip>:8080",
  "apiKeyEnvVar": "LOCAL_LLM_KEY",
  "models": {
    "haiku": "<local-model-id>",
    "sonnet": "<local-model-id>",
    "opus": "<local-model-id>"
  }
}
```

All three tiers filled (same model id day one), `LOCAL_LLM_KEY` defined to any dummy value in `.env`.

## Known caveat: agentic reliability on non-Claude models

Claude Code's system prompts and tool schemas are tuned for Claude. Driving Qwen through `claude -p` is a community-documented working recipe (Unsloth publishes a local-Qwen-plus-Claude-Code guide), but expect some degradation versus a harness designed for open models. The cloud re-verify pass mitigates the quality risk; if local-loop reliability proves poor, the fallback architectures are a dedicated open-model agent harness for Loop 3 or keeping implementation on cloud providers and using the Mac for bulk mechanical work only.

## Planned changes

1. **Fix the broken orchestrate chain (prerequisite).** Repoint `cli/resolve-provider-model.cjs:15` and `cli/cfn-orchestrator.cjs:12` at the real worker (`lib/orchestrator/dist-worker/cli/spawn-agent-cli.js`) or restore the expected build output. Verify `orchestrate.sh` end to end against the existing zai provider before touching anything local.
2. **Add the `local` provider entry** to `.claude/cfn-config/provider-models.json` per the sketch above, with `LOCAL_LLM_KEY` (dummy) in `.env`.
3. **Add a `local` case to `scripts/switch-api.sh`** (case list at lines 435-468) writing the LAN base URL + dummy token, so the supported switching path reaches localhost instead of hand-edited settings.
4. **Cloud re-verify mechanism.** Provide a way to re-run only the Loop 2 validators with a different provider after a local run (validate-only invocation mode, or an orchestration flag). Exact shape decided at implementation planning; see open questions.
5. **Guard the deprecated `get-agent-provider-env.sh` unknown-host fallback** (or confirm the path is unreachable) so a LAN IP cannot silently reroute to Anthropic.
6. **Mac setup runbook.** llama-server install, Qwen3.6-35B-A3B Q4 quant download, GGUF tool-call template config, LAN bind, smoke-test commands (curl the `/v1/messages` endpoint, then a one-shot `claude -p` round trip). Lives in `readme/` or `docs/`; decide at implementation.

## Assumptions (testable)

1. The Mac and the WSL2 driver sit on the same trusted LAN, and the WSL2 side can reach the Mac's listening port (WSL2 NAT allows outbound to LAN hosts).
2. llama-server's Anthropic Messages API implementation passes the `claude -p` handshake (auth, tool use, SSE streaming) for the chosen quant and tool-call template — verified by smoke test before any orchestration run.
3. `provider-models.json` accepts an arbitrary `baseUrl` string with no host allowlist (the explorer found none; confirm when adding the entry).
4. Qwen3.6-35B-A3B's 262K native context is usable at a practical KV-cache size within the ~28GB remaining after weights + OS (262K is the ceiling, not the target; implementation loops need 32K+).
5. The 10-minute per-worker timeout in spawn-agent-cli.ts survives local-model generation speeds for typical implementation steps (dense-model speeds would violate this; MoE speeds are assumed safe — measure in the first real run).
6. Loop 2 validator agents can run against a provider chosen per invocation (i.e. nothing in the validator path hardcodes zai/anthropic).
7. The orchestrate chain's broken dist paths are the only breakage between `orchestrate.sh` and a working worker spawn (no further missing build outputs in the chain).

## Open questions

- Does the orchestrator support (or nearly support) a validate-only invocation for the cloud re-verify pass, or is it new surface? Answered during implementation planning by reading `orchestrate.ts` around the gate/Loop-2 sequencing.
- Re-evaluate Qwen3.8-27B for the opus tier once a verified SWE-bench Verified number and stable tool-call scaffolds exist.
- Does `claude -p` against llama-server need `ANTHROPIC_SMALL_FAST_MODEL` mapped to a real served model, or does a single served model satisfy both `ANTHROPIC_MODEL` and the small-fast slot? (`buildChildEnv` sets both.)

## Next steps

1. Smoke-test path first, smallest possible slice: llama-server on the Mac, curl `/v1/messages`, one `claude -p` round trip from WSL2 with `ANTHROPIC_BASE_URL` pointed at it. No CFN changes needed for this.
2. Then the planned changes above. Per the CFN v2.28.0 routing tree this is shared-state, in-repo work (`provider-models.json` is consumed by spawn-agent-cli and the switching path): plan mode plus `/cfn-plan-review` at implementation time. It is not megaplan-family scope (program-scale only).

## Research sources

Primary: Qwen3.6-27B / Qwen3.6-35B-A3B / Qwen3.8-27B / Qwen3-Coder-Next HF model cards and Qwen blogs; Mistral Devstral 2 and Mistral 3 announcements; gpt-oss arXiv model card; DeepSeek V4 announcement; Kimi K3 blog; z.ai GLM-5 blog. Throughput and bandwidth: llmcheck.net M5 Pro vs M5 Max; contracollective.com Apple Silicon bandwidth-to-tok/s; thomas-wiegold.com Qwen3.8-27B on M4 Mac Mini. Claude Code wiring: HF ggml-org blog on llama.cpp's Anthropic Messages API; Unsloth Claude Code local-Qwen guide; Ollama FAQ (LAN binding).
