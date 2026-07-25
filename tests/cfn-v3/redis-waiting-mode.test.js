const { spawnSync } = require('child_process');

describe('Redis Waiting Mode', () => {
  const TASK_ID = `test-task-${Date.now()}`;
  const AGENT_ID = 'tester-1';

  const runWaitingModeScript = (mode, additionalArgs = []) => {
    const result = spawnSync('./.claude/skills/redis-coordination/invoke-waiting-mode.sh', [
      mode,
      '--task-id', TASK_ID,
      '--agent-id', AGENT_ID,
      ...additionalArgs
    ], { encoding: 'utf-8' });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status
    };
  };

  jest.setTimeout(10000);
  test('Agent can enter waiting mode', () => {
    const enterResult = runWaitingModeScript('enter', ['--context', 'test-iteration']);
    expect(enterResult.status).toBe(0);
    expect(enterResult.stdout).toContain('Entered waiting mode');
  });

  jest.setTimeout(10000);
  test('Coordinator can wake agent', () => {
    const wakeResult = runWaitingModeScript('wake', [
      '--reason', 'test_iteration',
      '--iteration', '2',
      '--feedback', 'Add more tests'
    ]);
    expect(wakeResult.status).toBe(0);
    expect(wakeResult.stdout).toContain('Agent awakened');
  });

  jest.setTimeout(10000);
  test('Agent can report result', () => {
    const reportResult = runWaitingModeScript('report', [
      '--confidence', '0.92',
      '--iteration', '2'
    ]);
    expect(reportResult.status).toBe(0);
    expect(reportResult.stdout).toContain('Result reported');
  });

  jest.setTimeout(10000);
  test('Coordinator can collect results', () => {
    const collectResult = runWaitingModeScript('collect', [
      '--agent-ids', 'tester-1,coder-1,reviewer-1'
    ]);
    expect(collectResult.status).toBe(0);
    expect(collectResult.stdout).toContain('Consensus');
    const consensusValue = parseFloat(collectResult.stdout.split('Consensus: ')[1]);
    expect(consensusValue).toBeGreaterThanOrEqual(0.65);
  });
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});