# Z.ai Quick Fix Guide

**Problem:** Your manual Z.ai configuration is broken due to invalid variable names and non-existent models.

**Solution:** Run these commands in order.

---

## Step 1: Fix Main Chat Provider

```bash
# Switch to Z.ai using the automated script
/switch-api zai
```

**What this does:**
- Removes invalid `_ANTHROPIC_*` variables
- Adds correct `ANTHROPIC_*` variables
- Writes to `.claude/settings.local.json` (preferred file)
- Creates automatic backup

**Expected output:**
```
✓ Switched to Z.ai
Main Chat + Task Tool: Z.ai
  • Cost: $0.50/1M tokens (97% savings)
  • No login required
```

---

## Step 2: Verify Z.ai API Access

```bash
# Test if your Z.ai API key works
curl -X POST https://api.z.ai/api/anthropic/messages \
  -H "x-api-key: [REDACTED]" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Expected responses:**

**✅ Success:**
```json
{
  "id": "msg-...",
  "content": [...],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn"
}
```

**❌ Failure (API key invalid):**
```json
{
  "code": 500,
  "msg": "404 NOT_FOUND",
  "success": false
}
```

---

## Step 3A: If Z.ai Works

```bash
# Restart Claude Desktop to load new config
# Then test Main Chat by sending a message
```

**You're done!** Z.ai routing is now working.

---

## Step 3B: If Z.ai API Fails

Your Z.ai API key may be expired or invalid. Try alternative providers:

### Option 1: Use Kimi (Recommended)

```bash
# 1. Add Kimi API key to .env
echo "KIMI_API_KEY=your-kimi-key-here" >> .env

# 2. Switch Main Chat to Kimi
/switch-api kimi

# Cost: $2/1M tokens (87% savings vs Anthropic)
```

### Option 2: Use OpenRouter

```bash
# 1. Add OpenRouter API key to .env
echo "OPENROUTER_API_KEY=your-openrouter-key-here" >> .env

# 2. Switch Main Chat to OpenRouter
/switch-api openrouter

# Cost: Varies by model (~$1-5/1M tokens)
```

### Option 3: Use Anthropic (Expensive but Reliable)

```bash
# 1. Switch Main Chat to Anthropic
/switch-api max

# 2. Login to Anthropic
claude login

# Cost: $15/1M tokens (or $0 with unlimited plan)
```

---

## Step 4: Clean Up Invalid Config

```bash
# Remove invalid variables from settings.json
# Open .claude/settings.json and delete these lines:

"_ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.6",
"_ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.7",
"_ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-4.7",
"_ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
"_ANTHROPIC_AUTH_TOKEN": "[REDACTED]"

# These are ignored anyway, but remove them for clarity
```

**After editing, your .claude/settings.json env should be:**
```json
{
  "env": {}
}
```

All provider config should be in `.claude/settings.local.json` (managed by `/switch-api`).

---

## Step 5: Verify Final Configuration

```bash
# Check what provider you're using
/switch-api status
```

**Expected output:**

**If Z.ai working:**
```
✓ Main Chat/Task Tool: Z.ai
  Cost: $0.50/1M tokens
```

**If using alternative:**
```
✓ Main Chat/Task Tool: Kimi (or OpenRouter or Anthropic)
  Cost: $X/1M tokens
```

---

## Verification Checklist

After completing steps above:

- [ ] Ran `/switch-api zai` (or alternative)
- [ ] Tested API endpoint with curl
- [ ] Removed invalid `_ANTHROPIC_*` variables from settings.json
- [ ] Restarted Claude Desktop
- [ ] Verified Main Chat works (send test message)
- [ ] Ran `/switch-api status` to confirm provider

---

## Key Points

**DO:**
- Use `/switch-api` for all provider switching
- Let the script manage `settings.local.json`
- Test API access after switching

**DON'T:**
- Manually edit settings files for providers
- Use `_ANTHROPIC_*` variables (underscore prefix is WRONG)
- Set `_ANTHROPIC_DEFAULT_*_MODEL` variables (they don't work)
- Use `glm-4.6` or `glm-4.7` models with Z.ai (they don't exist)

---

## Troubleshooting

**Q: I ran /switch-api zai but Main Chat still fails**

A: Your Z.ai API key is likely invalid. Try:
1. Check Z.ai dashboard: https://z.ai/dashboard
2. Regenerate API key if expired
3. Switch to alternative provider (Kimi or OpenRouter)

---

**Q: How do I know which provider I'm using?**

A: Run `/switch-api status` to see current configuration.

---

**Q: Can I use different providers for Main Chat vs CLI agents?**

A: Yes! Recommended hybrid setup:
- Main Chat: Anthropic (high quality) - via `/switch-api max`
- CLI agents: Z.ai or Kimi (cost optimized) - via `.env` CLAUDE_API_PROVIDER

This gives you 88-95% cost savings while keeping high-quality Main Chat.

---

## Summary

**Problem:**
- Using `_ANTHROPIC_*` instead of `ANTHROPIC_*` (wrong variable names)
- Using `glm-4.7` model that doesn't exist (invalid model)
- Manually editing settings files (error-prone)

**Solution:**
1. Run `/switch-api zai` (or alternative if Z.ai broken)
2. Test API with curl
3. Remove invalid variables from settings.json
4. Restart Claude Desktop
5. Verify with `/switch-api status`

**Result:**
- Correct environment variable names
- Valid model selection (or no override)
- Automatic backups
- 95-97% cost savings (if Z.ai/alternatives work)

---

**Last Updated:** 2025-12-27
**Status:** Ready for Implementation
