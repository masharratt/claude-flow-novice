import * as fs from 'fs';
import * as path from 'path';

const EXECUTE_SH = path.resolve(
  __dirname,
  '../../../.claude/skills/cfn-agent-lifecycle/execute.sh'
);

const SPAWN_AGENT_SH = path.resolve(
  __dirname,
  '../../../.claude/skills/cfn-agent-lifecycle/lib/spawning/spawn-agent.sh'
);

describe('GOAP env var wiring in agent lifecycle scripts', () => {
  it('execute.sh handle_spawn_agent accepts --category flag', () => {
    const src = fs.readFileSync(EXECUTE_SH, 'utf-8');
    expect(src).toMatch(/--category/);
  });

  it('execute.sh handle_spawn_agent accepts --role flag', () => {
    const src = fs.readFileSync(EXECUTE_SH, 'utf-8');
    expect(src).toMatch(/--role/);
  });

  it('execute.sh forwards TASK_CATEGORY to spawn-agent.sh', () => {
    const src = fs.readFileSync(EXECUTE_SH, 'utf-8');
    expect(src).toMatch(/TASK_CATEGORY/);
  });

  it('execute.sh forwards AGENT_ROLE to spawn-agent.sh', () => {
    const src = fs.readFileSync(EXECUTE_SH, 'utf-8');
    expect(src).toMatch(/AGENT_ROLE/);
  });

  it('spawn-agent.sh --task block accepts --category arg', () => {
    const src = fs.readFileSync(SPAWN_AGENT_SH, 'utf-8');
    expect(src).toMatch(/--category\)/);
  });

  it('spawn-agent.sh --task block accepts --role arg', () => {
    const src = fs.readFileSync(SPAWN_AGENT_SH, 'utf-8');
    expect(src).toMatch(/--role\)/);
  });

  it('spawn-agent.sh exports TASK_CATEGORY from parsed --category arg', () => {
    const src = fs.readFileSync(SPAWN_AGENT_SH, 'utf-8');
    expect(src).toMatch(/export TASK_CATEGORY/);
  });

  it('spawn-agent.sh exports AGENT_ROLE from parsed --role arg', () => {
    const src = fs.readFileSync(SPAWN_AGENT_SH, 'utf-8');
    expect(src).toMatch(/export AGENT_ROLE/);
  });
});
