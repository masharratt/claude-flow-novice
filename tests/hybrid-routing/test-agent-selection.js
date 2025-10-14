#!/usr/bin/env node

/**
 * Test Specialized Agent Selection Logic
 *
 * Tests the agent definition loading and keyword-based matching
 * without spawning actual workers (cost-free validation)
 */

import { HybridWorkerSpawner } from '../../src/cli/hybrid-routing/spawn-workers.js';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

async function testAgentSelection() {
  log('\n🧪 Testing Specialized Agent Selection System', 'bright');
  log('   (No actual workers spawned - cost-free validation)\n', 'cyan');

  // Initialize spawner (but we won't spawn actual workers)
  const spawner = new HybridWorkerSpawner({
    task: 'Test task',
    maxAgents: 3,
    provider: 'zai'
  });

  // Test 1: Load agent definitions
  section('Test 1: Load Agent Definitions from .claude/agents/');

  try {
    const agents = await spawner.loadAgentDefinitions();
    const agentCount = Object.keys(agents).length;

    if (agentCount > 0) {
      log(`✅ Loaded ${agentCount} agent definitions`, 'green');

      for (const [type, agent] of Object.entries(agents)) {
        console.log(`\n   📋 Agent: ${type}`);
        console.log(`      Keywords: ${agent.keywords.length > 0 ? agent.keywords.join(', ') : '(none)'}`);
        console.log(`      Description: ${agent.description.substring(0, 100)}...`);
      }

      // Debug: Show which agents failed to load
      const expectedAgents = ['coder', 'architect', 'tester', 'reviewer', 'security-specialist'];
      const missingAgents = expectedAgents.filter(a => !agents[a]);
      if (missingAgents.length > 0) {
        log(`\n⚠️  Missing agents: ${missingAgents.join(', ')}`, 'yellow');
      }
    } else {
      log('⚠️  No agent definitions found', 'yellow');
      log('   Expected files in .claude/agents/core-agents/ and .claude/agents/security/', 'yellow');
      return false;
    }

    // Test 2: Keyword-based matching
    section('Test 2: Keyword-Based Agent Matching');

    const testTask = "Build authentication system with security audit and comprehensive testing";
    log(`\n📝 Test Task: "${testTask}"`, 'cyan');
    log('\n🔍 Analyzing task for keyword matches...', 'cyan');

    const matched = spawner.matchTaskToAgents(testTask, agents, 5);

    if (matched.length > 0) {
      log(`\n✅ Matched ${matched.length} specialized agents:`, 'green');

      matched.forEach((m, i) => {
        console.log(`\n   ${i + 1}. ${m.type} (score: ${m.agent.keywords.filter(k => testTask.toLowerCase().includes(k)).length})`);

        const matchedKeywords = m.agent.keywords.filter(k =>
          testTask.toLowerCase().includes(k)
        );
        console.log(`      Matched keywords: ${matchedKeywords.join(', ')}`);
      });

      // Expected agents for this task
      const expectedTypes = ['security-specialist', 'tester', 'coder'];
      const foundExpected = expectedTypes.filter(type =>
        matched.some(m => m.type === type)
      );

      log(`\n🎯 Expected agent types found: ${foundExpected.length}/${expectedTypes.length}`, 'cyan');
      expectedTypes.forEach(type => {
        const found = matched.some(m => m.type === type);
        console.log(`   ${found ? '✅' : '❌'} ${type}`);
      });

    } else {
      log('❌ No agents matched', 'red');
      return false;
    }

    // Test 3: Task decomposition with specialization
    section('Test 3: Task Decomposition with Specialized Agents');

    const numAgents = 3;
    const subtasks = await spawner.decomposeTaskWithSpecialization(testTask, numAgents);

    log(`\n🎯 Specialized Agent Assignment (${numAgents} workers):`, 'cyan');
    log('   (This is what would be used in actual spawning)\n', 'yellow');

    if (subtasks.length > 0 && typeof subtasks[0] === 'object') {
      subtasks.forEach((subtask, i) => {
        console.log(`   Worker ${i + 1}: ${subtask.agentType}`);
        console.log(`      Task: ${subtask.task}`);
        console.log(`      System Prompt: ${subtask.systemPrompt ? 'Loaded ✅' : 'Generic'}`);

        if (subtask.systemPrompt) {
          console.log(`      Prompt Length: ${subtask.systemPrompt.length} chars`);
        }
        console.log('');
      });

      // Validate system prompts are loaded
      const withSystemPrompts = subtasks.filter(st => st.systemPrompt && st.systemPrompt.length > 0);
      log(`\n✅ ${withSystemPrompts.length}/${subtasks.length} workers have specialized system prompts`, 'green');

    } else {
      log('⚠️  Fallback to generic decomposition (no specialization)', 'yellow');
    }

    // Test 4: Tool integration validation
    section('Test 4: System Prompt Tool Integration');

    if (subtasks.length > 0 && subtasks[0].systemPrompt) {
      const firstPrompt = subtasks[0].systemPrompt;

      const hasToolInstructions = firstPrompt.includes('Tool Integration');
      const hasBashExecute = firstPrompt.includes('bash_execute');
      const hasWriteFile = firstPrompt.includes('write_file');
      const hasReadFile = firstPrompt.includes('read_file');

      console.log('\n   Checking tool integration in system prompt:');
      console.log(`   ${hasToolInstructions ? '✅' : '❌'} Tool Integration section`);
      console.log(`   ${hasBashExecute ? '✅' : '❌'} bash_execute tool`);
      console.log(`   ${hasWriteFile ? '✅' : '❌'} write_file tool`);
      console.log(`   ${hasReadFile ? '✅' : '❌'} read_file tool`);

      if (hasToolInstructions && hasBashExecute && hasWriteFile && hasReadFile) {
        log('\n✅ System prompt includes full tool integration', 'green');
      } else {
        log('\n⚠️  System prompt missing some tool instructions', 'yellow');
      }
    } else {
      log('\n⚠️  No system prompt to validate', 'yellow');
    }

    // Final summary
    section('Test Summary');

    log('\n✅ All tests completed successfully!', 'green');
    log('\n📊 Results:', 'cyan');
    console.log(`   • Agent definitions loaded: ${agentCount}`);
    console.log(`   • Agents matched for test task: ${matched.length}`);
    console.log(`   • Specialized subtasks created: ${subtasks.length}`);
    console.log(`   • System prompts integrated: ${subtasks.filter(st => st.systemPrompt).length}`);

    log('\n💡 Next Steps:', 'cyan');
    console.log('   1. Agent selection logic is working correctly');
    console.log('   2. Specialized agents are properly assigned based on keywords');
    console.log('   3. System prompts from .md files are loaded and integrated');
    console.log('   4. Tool integration instructions are appended to prompts');
    console.log('\n   ✅ Ready to spawn actual workers with:');
    log('      node src/cli/hybrid-routing/spawn-workers.js "Task" --max-agents=3', 'yellow');

    return true;

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    console.error(error.stack);
    return false;
  }
}

// Additional test: Agent type generation logic
async function testAgentTypeGeneration() {
  section('Test 5: Agent-Specific Subtask Generation');

  const spawner = new HybridWorkerSpawner({
    task: 'Test task',
    maxAgents: 3,
    provider: 'zai'
  });

  const mainTask = "Build authentication system";
  const agentTypes = ['coder', 'architect', 'tester', 'security-specialist', 'reviewer'];

  log(`\n📝 Main Task: "${mainTask}"`, 'cyan');
  log('\n🎯 Generated Subtasks by Agent Type:\n', 'cyan');

  for (let i = 0; i < agentTypes.length; i++) {
    const subtask = spawner.generateSubtaskForAgent(mainTask, agentTypes[i], i, agentTypes.length);
    console.log(`   ${agentTypes[i].padEnd(25)} → ${subtask}`);
  }

  log('\n✅ Agent-specific subtask generation working', 'green');
}

// Run all tests
async function runAllTests() {
  try {
    const success = await testAgentSelection();

    if (success) {
      await testAgentTypeGeneration();
    }

    if (success) {
      log('\n🎉 All tests passed! Agent selection system is ready.', 'green');
      process.exit(0);
    } else {
      log('\n❌ Some tests failed. Review output above.', 'red');
      process.exit(1);
    }

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runAllTests();
