const { performance } = require('perf_hooks');

// Set Task Mode
delete process.env.TASK_ID;
delete process.env.AGENT_ID;
process.env.CFN_MODE = 'task';

// Initial memory
function getMemory() {
  const mem = process.memoryUsage();
  return {
    rss: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100
  };
}

async function main() {
  console.log('='.repeat(50));
  console.log('MEMORY LEAK TEST FOR TASK MODE REDIS');
  console.log('='.repeat(50));

  const initialMem = getMemory();
  console.log('Initial memory:', initialMem);

  const { RedisCoordinator } = require('../.claude/skills/cfn-redis-coordination/dist/redis-client.js');

  for (let i = 0; i < 100; i++) {
    const coordinator = new RedisCoordinator();
    await coordinator.initialize();

    // Test a few operations
    await coordinator.ping();
    await coordinator.set('test', 'value');
    await coordinator.get('test');
    await coordinator.disconnect();

    if (i % 10 === 0 && global.gc) {
      global.gc();
    }
  }

  if (global.gc) {
    global.gc();
    global.gc();
  }

  const finalMem = getMemory();
  const memoryDiff = {
    rss: finalMem.rss - initialMem.rss,
    heapUsed: finalMem.heapUsed - initialMem.heapUsed
  };

  console.log('Final memory:', finalMem);
  console.log('Memory difference:', memoryDiff);

  if (Math.abs(memoryDiff.heapUsed) < 5) {
    console.log('✅ No significant memory leak detected');
  } else {
    console.log('⚠️  Potential memory leak detected');
  }
}

main().catch(console.error);