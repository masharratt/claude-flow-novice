# How to Trigger Tasks in Trigger.dev v4 Dev Mode

## Current Setup Status

- ✅ Infrastructure running (9 containers healthy)
- ✅ Dev server running (worker version 20251125.30)
- ✅ `test-zai-agent` task defined and exported
- ✅ Z.ai provider configured

## The Problem

`tasks.trigger()` from external scripts fails with "Invalid API Key" because:
- Trigger.dev v4 dev mode doesn't support external API triggering without PAT
- `TRIGGER_SECRET_KEY` in `.env` is for the webapp server, not for client authentication
- Self-hosted dev mode doesn't auto-generate Personal Access Tokens

## Solution 1: Use the Webapp UI (RECOMMENDED)

### Steps:

1. **Open the webapp**:
   ```
   http://localhost:8030
   ```

2. **Login** (if prompted):
   - Check webapp logs for magic link:
     ```bash
     docker logs trigger-webapp-1 --tail=100 | grep "Click this link"
     ```
   - Or use email login (no email server configured, so check logs)

3. **Navigate to your project**:
   - Organization: "CFN Stress Test"
   - Project ID: `proj_uuvpcrkpfruhlpbpzlov`

4. **Find the task**:
   - Look for "test-zai-agent" in the tasks list
   - The dev server should show it as registered

5. **Trigger the task**:
   - Click "Test" or "Trigger" button
   - Enter payload:
     ```json
     {
       "testId": "single-test",
       "outputDir": "/tmp/trigger-single-test"
     }
     ```
   - Submit

6. **Monitor execution**:
   - Watch dev server logs:
     ```bash
     tail -f /tmp/trigger-dev-server.log
     ```
   - Or view in webapp UI (real-time updates)

7. **Verify result**:
   ```bash
   ls -la /tmp/trigger-single-test/
   cat /tmp/trigger-single-test/zai-test-single-test.ts
   ```

## Solution 2: Create Personal Access Token (PAT)

### Steps:

1. **Open webapp** and login

2. **Navigate to Settings > Personal Access Tokens**

3. **Create new token**:
   - Name: "dev-testing"
   - Scopes: "triggers:write"

4. **Copy the token** (save it securely)

5. **Use token in script**:
   ```bash
   export TRIGGER_SECRET_KEY="<your-PAT-here>"
   npx tsx test-trigger-task.ts
   ```

**Note**: PAT creation may not be available in self-hosted mode without proper setup.

## Solution 3: Use Test Coordinator Task

I've created a coordinator task that wraps `test-zai-agent`:

1. **Restart dev server** to pick up new task:
   ```bash
   # Kill existing dev server
   pkill -f "trigger.dev.*dev"

   # Start new dev server
   cd docker/trigger-dev
   source .env
   npx trigger.dev@latest dev --profile self-hosted-v4
   ```

2. **Trigger via UI**:
   - Task: `test-coordinator`
   - Payload:
     ```json
     {
       "testId": "single-test",
       "outputDir": "/tmp/trigger-single-test"
     }
     ```

3. **This task internally triggers** `test-zai-agent` using SDK

## Solution 4: Bypass Trigger.dev (Workaround - NOT RECOMMENDED)

If you absolutely need programmatic triggering without UI:

```bash
# Direct Claude CLI execution (bypasses Trigger.dev)
cd /tmp/trigger-single-test
npx @anthropic-ai/claude-code -p "Create a TypeScript file with hello world" \\
  --dangerously-skip-permissions \\
  --print
```

**Downside**: This doesn't use Trigger.dev infrastructure at all.

## Current Blocker

The fundamental issue is:
- Trigger.dev v4 dev mode is designed for **interactive development**
- Tasks are meant to be triggered via **UI** or **webhooks/schedules**
- Programmatic triggering from external scripts requires **PAT** which isn't auto-generated in self-hosted mode

## Recommended Next Steps

1. **Use the UI** (Solution 1) to trigger `test-zai-agent` - **THIS WORKS NOW**
2. If UI access is blocked, set up PAT generation in self-hosted mode
3. For CI/CD, deploy tasks to production mode (not dev mode)

## Files Created

- `src/trigger/test-coordinator.ts` - Coordinator task that triggers test-zai-agent
- `trigger-task.mjs` - Node script for API triggering (requires PAT)
- `test-trigger-task.ts` - TypeScript test script (requires PAT)

## Expected Outcome

When triggered successfully:
- Task executes in dev server
- Creates file: `/tmp/trigger-single-test/zai-test-single-test.ts`
- File contains TypeScript function with test ID and timestamp
- Execution visible in webapp UI and dev server logs
