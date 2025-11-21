/**
 * Integration tests for CreateNetworks against real Docker daemon
 */
import { execSync } from 'child_process';
import { CreateNetworks, parseArgs } from '../../../src/docker/scripts/create-networks';

const DOCKER_AVAILABLE = (() => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

(DOCKER_AVAILABLE ? describe : describe.skip)('CreateNetworks Integration', () => {
  const testNetworkPrefix = 'cfn-test-int';

  afterEach(async () => {
    // Cleanup test networks
    try {
      execSync(`docker network ls --filter "name=${testNetworkPrefix}" -q | xargs -r docker network rm`, {
        stdio: 'ignore',
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('CreateNetworks class', () => {
    it('should create a real Docker network', async () => {
      const creator = new CreateNetworks({
        prefix: testNetworkPrefix,
        dryRun: false,
      });

      const result = await creator.run();

      expect(result.success).toBe(true);
      expect(result.networksCreated).toBeGreaterThan(0);

      // Verify network exists
      const output = execSync(`docker network ls --filter "name=${testNetworkPrefix}" -q`).toString();
      expect(output.trim()).not.toBe('');
    });

    it('should handle existing networks gracefully', async () => {
      // Create network first
      execSync(`docker network create ${testNetworkPrefix}-existing || true`, { stdio: 'ignore' });

      const creator = new CreateNetworks({
        prefix: testNetworkPrefix,
        dryRun: false,
      });

      // Should not throw
      const result = await creator.run();
      expect(result.success).toBe(true);
    });

    it('should support dry-run mode', async () => {
      const creator = new CreateNetworks({
        prefix: testNetworkPrefix,
        dryRun: true,
      });

      const result = await creator.run();

      expect(result.success).toBe(true);

      // Network should NOT exist in dry-run
      const output = execSync(`docker network ls --filter "name=${testNetworkPrefix}" -q`).toString();
      expect(output.trim()).toBe('');
    });

    it('should emit events during creation', async () => {
      const creator = new CreateNetworks({
        prefix: testNetworkPrefix,
        dryRun: false,
      });

      const events: string[] = [];
      creator.on('networkCreated', (name) => events.push(name));

      await creator.run();

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('parseArgs', () => {
    it('should parse --dry-run flag', () => {
      const opts = parseArgs(['--dry-run']);
      expect(opts.dryRun).toBe(true);
    });

    it('should parse --prefix option', () => {
      const opts = parseArgs(['--prefix', 'my-prefix']);
      expect(opts.prefix).toBe('my-prefix');
    });
  });
});
