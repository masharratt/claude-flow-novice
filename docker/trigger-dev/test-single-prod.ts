import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

async function testSingleProd() {
  console.log("Testing single production task trigger...");
  
  configure({
    secretKey: "tr_prod_UzJVaNMHDC3Y1pZ82lUd",
    baseURL: "http://localhost:8030",
  });

  const handle = await tasks.trigger("test-zai-agent", {
    testId: "prod-single",
    outputDir: "/tmp/prod-single-test",
  });

  console.log(`✓ Task triggered: ${handle.id}`);
  console.log("  Waiting for completion...");

  const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
  
  console.log(`✓ Status: ${result.status}`);
  console.log(`✓ Output:`, result.output);
}

testSingleProd().catch(console.error);
