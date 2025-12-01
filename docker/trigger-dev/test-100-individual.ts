import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: "http://localhost:8030",
});

const ZAI_API_KEY = process.env.ZAI_API_KEY;
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || "https://api.z.ai/api/anthropic";

async function run100Individual() {
  console.log("Triggering 100 individual tasks...");
  const outputDir = "/tmp/individual-100";

  const startTime = Date.now();
  const handles: Array<{ id: string }> = [];

  // Trigger all 100 tasks
  for (let i = 1; i <= 100; i++) {
    const handle = await tasks.trigger("test-zai-agent", {
      testId: `agent-${i}`,
      outputDir,
      _env: { ZAI_API_KEY, ZAI_BASE_URL },
    });
    handles.push(handle);

    if (i % 10 === 0) {
      console.log(`  Triggered ${i}/100 tasks...`);
    }
  }

  console.log(`✓ All 100 tasks triggered in ${Math.round((Date.now() - startTime) / 1000)}s`);
  console.log("Waiting for completion...");

  let completed = 0, failed = 0;
  for (const handle of handles) {
    try {
      const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
      if ((result.output as any)?.success) completed++;
      else failed++;

      if ((completed + failed) % 10 === 0) {
        console.log(`[Progress] ${completed + failed}/100 (OK:${completed} FAIL:${failed})`);
      }
    } catch (err) {
      failed++;
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log("");
  console.log("=".repeat(60));
  console.log(`Total: 100 | Completed: ${completed} | Failed: ${failed}`);
  console.log(`Duration: ${duration}s | Success rate: ${completed}%`);
  console.log("=".repeat(60));
}

run100Individual().catch(console.error);
