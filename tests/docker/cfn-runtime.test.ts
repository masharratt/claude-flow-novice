/**
 * CFN Runtime Environment Tests
 * Tests for src/docker/runtime/cfn-runtime.ts
 *
 * Priority 1: Core Docker scripts migration
 * Coverage: Environment variable loading, legacy aliases, defaults
 */

import { CfnRuntime } from '../../src/docker/runtime/cfn-runtime';

describe('CfnRuntime', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear CFN_* variables
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('CFN_') || key.startsWith('REDIS_') || key.startsWith('TASK_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Redis Configuration', () => {
    it('should load CFN_REDIS_HOST and CFN_REDIS_PORT', () => {
      process.env.CFN_REDIS_HOST = 'redis-server';
      process.env.CFN_REDIS_PORT = '6380';

      const runtime = new CfnRuntime();
      expect(runtime.redis.host).toBe('redis-server');
      expect(runtime.redis.port).toBe(6380);
    });

    it('should use defaults when not set', () => {
      const runtime = new CfnRuntime();
      expect(runtime.redis.host).toBe('cfn-redis');
      expect(runtime.redis.port).toBe(6379);
    });

    it('should load REDIS_PASSWORD from environment', () => {
      process.env.REDIS_PASSWORD = 'secret-pass';

      const runtime = new CfnRuntime();
      expect(runtime.redis.password).toBe('secret-pass');
    });

    it('should support CFN_REDIS_PASSWORD', () => {
      process.env.CFN_REDIS_PASSWORD = 'cfn-secret';

      const runtime = new CfnRuntime();
      expect(runtime.redis.password).toBe('cfn-secret');
    });

    it('should use CFN_REDIS_URL when set', () => {
      process.env.CFN_REDIS_URL = 'redis://localhost:6380';

      const runtime = new CfnRuntime();
      expect(runtime.redis.url).toBe('redis://localhost:6380');
    });

    it('should have both standard and legacy aliases', () => {
      process.env.CFN_REDIS_HOST = 'redis-server';
      process.env.CFN_REDIS_PORT = '6380';

      const runtime = new CfnRuntime();
      // Standard names
      expect(runtime.redis.host).toBe('redis-server');
      expect(runtime.redis.port).toBe(6380);

      // Legacy names should be set as well
      expect(runtime.getEnv('REDIS_HOST')).toBe('redis-server');
      expect(runtime.getEnv('REDIS_PORT')).toBe('6380');
    });
  });

  describe('Task Configuration', () => {
    it('should load CFN_TASK_ID', () => {
      process.env.CFN_TASK_ID = 'task-123';

      const runtime = new CfnRuntime();
      expect(runtime.task.id).toBe('task-123');
    });

    it('should use legacy TASK_ID variable', () => {
      process.env.TASK_ID = 'task-legacy-123';

      const runtime = new CfnRuntime();
      expect(runtime.task.id).toBe('task-legacy-123');
    });

    it('should prefer CFN_TASK_ID over TASK_ID', () => {
      process.env.CFN_TASK_ID = 'task-cfn-123';
      process.env.TASK_ID = 'task-legacy-123';

      const runtime = new CfnRuntime();
      expect(runtime.task.id).toBe('task-cfn-123');
    });

    it('should load task timeout', () => {
      process.env.CFN_TASK_TIMEOUT = '7200';

      const runtime = new CfnRuntime();
      expect(runtime.task.timeout).toBe(7200);
    });

    it('should have default task timeout of 3600 seconds', () => {
      const runtime = new CfnRuntime();
      expect(runtime.task.timeout).toBe(3600);
    });
  });

  describe('Agent Configuration', () => {
    it('should load agent ID and type', () => {
      process.env.CFN_AGENT_ID = 'agent-456';
      process.env.CFN_AGENT_TYPE = 'backend-specialist';

      const runtime = new CfnRuntime();
      expect(runtime.agent.id).toBe('agent-456');
      expect(runtime.agent.type).toBe('backend-specialist');
    });

    it('should load agent image configuration', () => {
      process.env.CFN_AGENT_IMAGE = 'myrepo/agent:v1';
      process.env.CFN_AGENT_REGISTRY = 'quay.io';

      const runtime = new CfnRuntime();
      expect(runtime.agent.image).toBe('myrepo/agent:v1');
      expect(runtime.agent.registry).toBe('quay.io');
    });

    it('should have default agent image', () => {
      const runtime = new CfnRuntime();
      expect(runtime.agent.image).toBe('claude-flow-novice-agent:latest');
    });
  });

  describe('Memory and Resource Configuration', () => {
    it('should load CFN_MEMORY_BUDGET', () => {
      process.env.CFN_MEMORY_BUDGET = '80g';

      const runtime = new CfnRuntime();
      expect(runtime.resources.memoryBudget).toBe('80g');
    });

    it('should have default memory budget of 40g', () => {
      const runtime = new CfnRuntime();
      expect(runtime.resources.memoryBudget).toBe('40g');
    });

    it('should load CPU limit', () => {
      process.env.CFN_CPU_LIMIT = '8';

      const runtime = new CfnRuntime();
      expect(runtime.resources.cpuLimit).toBe(8);
    });

    it('should load max parallel agents', () => {
      process.env.CFN_MAX_PARALLEL_AGENTS = '8';

      const runtime = new CfnRuntime();
      expect(runtime.resources.maxParallelAgents).toBe(8);
    });

    it('should load spawn interval', () => {
      process.env.CFN_SPAWN_INTERVAL_MS = '1000';

      const runtime = new CfnRuntime();
      expect(runtime.resources.spawnIntervalMs).toBe(1000);
    });
  });

  describe('Docker Configuration', () => {
    it('should load Docker socket path', () => {
      process.env.CFN_DOCKER_SOCKET = '/custom/docker.sock';

      const runtime = new CfnRuntime();
      expect(runtime.docker.socketPath).toBe('/custom/docker.sock');
    });

    it('should have default Docker socket path', () => {
      const runtime = new CfnRuntime();
      expect(runtime.docker.socketPath).toBe('/var/run/docker.sock');
    });

    it('should load network name', () => {
      process.env.CFN_NETWORK_NAME = 'custom-network';

      const runtime = new CfnRuntime();
      expect(runtime.docker.networkName).toBe('custom-network');
    });

    it('should have default network name', () => {
      const runtime = new CfnRuntime();
      expect(runtime.docker.networkName).toBe('cfn-network');
    });

    it('should load container mode flag', () => {
      process.env.CFN_CONTAINER_MODE = 'true';

      const runtime = new CfnRuntime();
      expect(runtime.docker.containerMode).toBe(true);
    });
  });

  describe('Provider Configuration', () => {
    it('should load custom routing flag', () => {
      process.env.CFN_CUSTOM_ROUTING = 'true';

      const runtime = new CfnRuntime();
      expect(runtime.provider.customRouting).toBe(true);
    });

    it('should load default provider', () => {
      process.env.CFN_DEFAULT_PROVIDER = 'openrouter';

      const runtime = new CfnRuntime();
      expect(runtime.provider.defaultProvider).toBe('openrouter');
    });

    it('should have default provider of zai', () => {
      const runtime = new CfnRuntime();
      expect(runtime.provider.defaultProvider).toBe('zai');
    });
  });

  describe('Orchestrator Configuration', () => {
    it('should load orchestrator mode', () => {
      process.env.CFN_ORCHESTRATOR_MODE = 'enterprise';

      const runtime = new CfnRuntime();
      expect(runtime.orchestrator.mode).toBe('enterprise');
    });

    it('should load gate confidence threshold', () => {
      process.env.CFN_GATE_CONFIDENCE_THRESHOLD = '0.95';

      const runtime = new CfnRuntime();
      expect(runtime.orchestrator.gateConfidenceThreshold).toBe(0.95);
    });

    it('should load consensus threshold', () => {
      process.env.CFN_CONSENSUS_THRESHOLD = '0.85';

      const runtime = new CfnRuntime();
      expect(runtime.orchestrator.consensusThreshold).toBe(0.85);
    });

    it('should load iteration limit', () => {
      process.env.CFN_ITERATION_LIMIT = '5';

      const runtime = new CfnRuntime();
      expect(runtime.orchestrator.iterationLimit).toBe(5);
    });
  });

  describe('API Configuration', () => {
    it('should load API host and port', () => {
      process.env.CFN_API_HOST = '127.0.0.1';
      process.env.CFN_API_PORT = '9001';

      const runtime = new CfnRuntime();
      expect(runtime.api.host).toBe('127.0.0.1');
      expect(runtime.api.port).toBe(9001);
    });

    it('should load API key', () => {
      process.env.CFN_API_KEY = 'api-key-secret';

      const runtime = new CfnRuntime();
      expect(runtime.api.key).toBe('api-key-secret');
    });

    it('should have default API host of 0.0.0.0', () => {
      const runtime = new CfnRuntime();
      expect(runtime.api.host).toBe('0.0.0.0');
    });
  });

  describe('Logging Configuration', () => {
    it('should load log level', () => {
      process.env.CFN_LOG_LEVEL = 'debug';

      const runtime = new CfnRuntime();
      expect(runtime.logging.level).toBe('debug');
    });

    it('should load log format', () => {
      process.env.CFN_LOG_FORMAT = 'text';

      const runtime = new CfnRuntime();
      expect(runtime.logging.format).toBe('text');
    });

    it('should have default log level of info', () => {
      const runtime = new CfnRuntime();
      expect(runtime.logging.level).toBe('info');
    });
  });

  describe('Feature Flags', () => {
    it('should load progress tracking flag', () => {
      process.env.CFN_ENABLE_PROGRESS_TRACKING = 'false';

      const runtime = new CfnRuntime();
      expect(runtime.features.progressTracking).toBe(false);
    });

    it('should load health check flag', () => {
      process.env.CFN_ENABLE_HEALTH_CHECKS = 'false';

      const runtime = new CfnRuntime();
      expect(runtime.features.healthChecks).toBe(false);
    });

    it('should load metrics flag', () => {
      process.env.CFN_ENABLE_METRICS = 'false';

      const runtime = new CfnRuntime();
      expect(runtime.features.metrics).toBe(false);
    });
  });

  describe('getEnv() method', () => {
    it('should retrieve environment variables by key', () => {
      process.env.CFN_REDIS_HOST = 'redis-server';

      const runtime = new CfnRuntime();
      expect(runtime.getEnv('CFN_REDIS_HOST')).toBe('redis-server');
    });

    it('should return legacy aliases', () => {
      process.env.CFN_REDIS_HOST = 'redis-server';

      const runtime = new CfnRuntime();
      expect(runtime.getEnv('REDIS_HOST')).toBe('redis-server');
    });

    it('should return undefined for unknown keys', () => {
      const runtime = new CfnRuntime();
      expect(runtime.getEnv('UNKNOWN_VAR')).toBeUndefined();
    });
  });

  describe('toEnvObject() method', () => {
    it('should export all environment variables as object', () => {
      process.env.CFN_TASK_ID = 'task-123';
      process.env.CFN_REDIS_HOST = 'redis-server';

      const runtime = new CfnRuntime();
      const env = runtime.toEnvObject();

      expect(env.CFN_TASK_ID).toBe('task-123');
      expect(env.TASK_ID).toBe('task-123'); // legacy alias
      expect(env.CFN_REDIS_HOST).toBe('redis-server');
      expect(env.REDIS_HOST).toBe('redis-server'); // legacy alias
    });

    it('should include both standard and legacy names', () => {
      process.env.CFN_AGENT_ID = 'agent-123';

      const runtime = new CfnRuntime();
      const env = runtime.toEnvObject();

      expect(env.CFN_AGENT_ID).toBe('agent-123');
      expect(env.AGENT_ID).toBe('agent-123');
    });
  });

  describe('toShellScript() method', () => {
    it('should export as shell script format', () => {
      process.env.CFN_TASK_ID = 'task-123';

      const runtime = new CfnRuntime();
      const shellScript = runtime.toShellScript();

      expect(shellScript).toContain('export CFN_TASK_ID="task-123"');
      expect(shellScript).toContain('export TASK_ID="task-123"');
    });

    it('should be executable shell syntax', () => {
      const runtime = new CfnRuntime();
      const shellScript = runtime.toShellScript();

      // Should start with shebang or export
      expect(shellScript).toMatch(/^#!/);
    });
  });
});
